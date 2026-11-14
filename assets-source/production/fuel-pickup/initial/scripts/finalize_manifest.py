import hashlib
import json
import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
REPO = WORK.parents[2]


def read(name):
    return json.loads((WORK / name).read_text())


def write(name, content):
    (WORK / name).write_text(json.dumps(content, indent=2) + '\n')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


glb = read('evidence/glb-independent.json')
verified = read('evidence/blender-verification.json')
source = read('evidence/source-contract.json')
projection_checks = []
for entry in read('evidence/renders.json'):
    if 'world_badge_position' not in entry:
        continue
    rig = next(rig for rig in source['rigs'] if rig['mode'] == entry['rig'])
    sample = next(sample for sample in rig['projectedBadges'] if sample['worldPosition'] == entry['world_badge_position'])
    error = max(abs(left - right) for left, right in zip(sample['pixelBounds'], entry['badge_pixel_bounds']))
    assert error < .001, (entry['file'], error)
    assert abs(entry['camera_facing_normal_dot'] - 1) < 1e-6
    projection_checks.append({'render': entry['file'], 'actual_Three_pixel_bounds': sample['pixelBounds'],
                              'Blender_pixel_bounds': entry['badge_pixel_bounds'], 'maximum_error_pixels': error,
                              'billboard_normal_dot': entry['camera_facing_normal_dot']})
assert len(projection_checks) == 6
write('evidence/camera-projection-crosscheck.json', {'checks': projection_checks,
      'method': 'Independent actual source CameraRig/FlightCamera + Three Vector3.project versus offline Blender projected imported vertices, same world positions/pulse/wobble at960x540; no halo bounds.',
      'maximum_tolerance_pixels': .001, 'limitations': 'Zero boost, no camera shake/kick/intro; baseline snap rigs, not arbitrary runtime trajectories or rasterizer pixel matching.'})
before = read('evidence/source-preservation-before.json')
preservation = {name: {'before': digest, 'after': sha256(REPO / name)} for name, digest in before.items()}
assert all(entry['before'] == entry['after'] for entry in preservation.values())
for name, entry in preservation.items():
    if name.startswith('src/'):
        entry['snapshot_sha256'] = sha256(WORK / 'source' / name.replace('/', '__'))
        assert entry['snapshot_sha256'] == entry['before']
write('evidence/source-preservation.json', {'unchanged': True, 'files': preservation,
      'scope': 'Fuel pickup exclusive; no production edits; active repair work never accessed. Frozen reference inputs are read-only.'})
objects = {entry['node']: entry for entry in glb['objects']}
source_meshes = read('evidence/source-meshes.json')['fuel']
source_points = {}
for record in source_meshes:
    source_points[record['name'].replace('source_fuel_', '')] = [
        [record['positions'][offset + axis] * record['scale'][axis] + record['position'][axis] for axis in range(3)]
        for offset in range(0, len(record['positions']), 3)]
envelopes = {}
for name in ['shape', 'whole_badge']:
    points = source_points['shape'] if name == 'shape' else sum(source_points.values(), [])
    old = {'min': [min(point[axis] for point in points) for axis in range(3)],
           'max': [max(point[axis] for point in points) for axis in range(3)]}
    new = objects['shape']['bounds'] if name == 'shape' else glb['transformed_rest_bounds_game']
    assert all(new['min'][axis] >= old['min'][axis] - 1e-6 and new['max'][axis] <= old['max'][axis] + 1e-6 for axis in range(3))
    envelopes[name] = {'actual_source_rest_bounds_game': old, 'authored_rest_bounds_game': new,
                       'within_original_axis_aligned_envelope_tolerance_1e_6': True}
write('evidence/source-envelope-comparison.json', {'envelopes': envelopes,
      'method': 'Actual saved source constructor vertex arrays, static scale and mesh positions versus independently decoded transformed GLB. No halo in either geometric envelope.',
      'limit': 'Rest AABBs establish no badge/glyph detail enlargement; dynamic conservative sphere and separate continuous clearance proofs cover motion.'})
identity = [[float(row == column) for column in range(4)] for row in range(4)]
hierarchy = {'axes': {'plane': 'game/glTF XY', 'front': '+Z', 'up': '+Y', 'meters_per_unit': 1,
                     'blender_to_game': '(x,z,-y)', 'runtime_correction': 'NONE'},
             'root': {'name': 'fuel_pickup_root', 'local_matrix_row_major': identity, 'world_origin': [0, 0, 0]},
             'children': {}}
motions = {'shell': 'rotation.z+=dt*.3; scale.setScalar(1+sin(phase*4)*.025)',
           'core': 'fixed', 'shape': 'rotation.z=sin(phase*2.2)*.08; static scale BAKED, never apply twice'}
materials = {}
for name in ['shell', 'core', 'shape']:
    node = next(node for node in glb['nodes'] if node['name'] == name)
    hierarchy['children'][name] = {'local_matrix_row_major': objects[name]['matrix_world_row_major'],
        'rest_world_matrix_row_major': objects[name]['matrix_world_row_major'],
        'local_pivot': node.get('translation', [0, 0, 0]), 'rotation_xyzw': node.get('rotation', [0, 0, 0, 1]),
        'scale': node.get('scale', [1, 1, 1]), 'motion': motions[name], 'transformed_rest_bounds': objects[name]['bounds']}
    material = next(entry for entry in glb['materials'] if entry['name'].startswith('fuel_' + name + '_'))
    materials[name] = {'name': material['name'], 'visible_primitives': 1,
        'glb_base_color_linear': material['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1]),
        'glb_unlit': 'KHR_materials_unlit' in material.get('extensions', {}),
        'vertex_palette_srgb': objects[name]['vertex_palette_srgb'],
        'runtime': 'owned imported PBR clone, kit titanium/slate' if name == 'core' else
            'owned clone of untouched mats.neon(0xffd76a,' + ('1.15' if name == 'shell' else '1.35') + '); vertexColors=true; toneMapped=false',
        'nominal_srgb': 'authored kit PBR slate/titanium' if name == 'core' else '#ffd76a'}
write('hierarchy.json', hierarchy)
runtime = {'hierarchy': hierarchy, 'material_map': materials,
    'shape_static_scale': {'source': [.82, .82, .25], 'baked_into_geometry': True, 'exported_node': [1, 1, 1], 'adapter_must_not_apply_again': True},
    'group': 'original Pickup.group at original world position, copies source camera.quaternion; imported scene/root identity children',
    'halo': {'exported': False, 'placement': 'existing sibling sprite under Pickup.group', 'cache_key': '0xffd76a',
             'opacity': .35, 'scale': '7*(1+sin(phase*4)*.2)', 'owner': 'shared Materials._pickupHalos and Textures glow; never imported instance'},
    'constructor': 'Complete existing constructor including random phase/baseY/velocity/halo first; replace only visual handles afterward. No production edits.',
    'cleanup': 'releaseImportedFuel -> disposeModel(importedRoot) exactly once, then detach group; never dispose source shared geometry/materials, halo or textures',
    'recipe': 'scripts/adapter_recipe.mjs', 'ownership_evidence': source['ownership']}
write('runtime-map.json', runtime)
references = {}
for kind in ['shield', 'spread']:
    name = f'asset-work/{kind}-pickup/initial/asset/{kind}-pickup.glb'
    references[name] = sha256(REPO / name)
limitations = {'formal_reviews': 0, 'formal_fix_passes': 0, 'opus_review_polish': 'deferred', 'helpers': 0, 'claude_retries': 0,
    'live_integration': False, 'live_WebGL_capture': False, 'gpu_performance_claim': False,
    'renders': 'Offline Blender reconstructions of actual source rig eye/target/projection/billboard, source geometry, source motion. Halo/additive/postFX/hemisphere/particles/HUD/audio are approximate or not reproduced.',
    'clearance': verified['clearance']['method_limits'],
    'readability': 'Manual implementation inspection only; small/far detail merging is documented, not a universal recognition study.',
    'charge': 'N/A', 'detach': 'N/A except collected/cull lifecycle removal',
    'determinism': 'Generated geometry/names/materials/transforms and GLB are deterministic. Blender binary session metadata may differ; no byte-identical blend promise.'}
write('evidence/limitations.json', limitations)
manifest = {'asset': 'FUEL collectible pickup', 'revision': 'INITIAL', 'frozen': True,
    'scope': 'asset-work/fuel-pickup only; source FuelCell/public/models/fuel.glb and all production files untouched; no active repair access',
    'files': {name: {'sha256': sha256(WORK / name), 'bytes': (WORK / name).stat().st_size} for name in
              ['asset/fuel-pickup.glb', 'asset/fuel-pickup.blend', 'scripts/build_fuel.py']},
    'geometry': {'evaluated_triangles': glb['triangles'], 'target_triangles': 1500, 'ceiling_triangles': 2500,
                 'object_triangles': {name: entry['triangles'] for name, entry in objects.items()},
                 'mesh_nodes': glb['mesh_nodes'], 'visible_material_primitives': glb['material_primitives'],
                 'shared_halo_additional': True, 'textures': glb['textures'], 'animations': glb['animations'],
                 'transformed_rest_bounds_game': glb['transformed_rest_bounds_game'],
                 'all_motion_visual_sphere_radius': glb['visual_sphere_radius_at_all_motion_extrema'],
                 'source_collider_radius': 2.2, 'glb_limit_bytes': 524288},
    'source_envelope_comparison': envelopes,
    'shape_scale': runtime['shape_static_scale'], 'mechanics': source['sourceState'],
    'tank_separation': source['separateDestructibleTank'], 'collection': source['collectionChecks'],
    'ownership': source['ownership'], 'clearance': verified['clearance'], 'limitations': limitations,
    'deliberate_kit_reuse': 'Common frozen spread frame/backplate geometry-generation profile and neutral tint/material language; freshly generated standalone fuel meshes; original drum glyph.',
    'reference_glb_sha256': references, 'evidence': {'readability': read('evidence/readability.json'),
        'viewed': read('evidence/viewed-pngs.json'), 'packed_reopened': verified['blend_packed_state'],
        'determinism': read('evidence/determinism.json'), 'exact_nominal_color': read('evidence/exact-yellow-check.json'),
        'camera_projection_crosscheck': 'evidence/camera-projection-crosscheck.json',
        'binary_inspection': 'evidence/glb-independent.json', 'source': 'evidence/source-contract.json',
        'source_preservation': 'evidence/source-preservation.json'}}
write('manifest.json', manifest)
print(json.dumps({'files': manifest['files'], 'geometry': manifest['geometry'], 'clearance': manifest['clearance']}, indent=2))
