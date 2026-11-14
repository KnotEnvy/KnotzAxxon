import hashlib
import json
import pathlib
import subprocess

WORK = pathlib.Path(__file__).resolve().parents[1]
REPO = WORK.parents[2]


def read(name):
    return json.loads((WORK / 'evidence' / name).read_text())


def digest(filename):
    return hashlib.sha256(filename.read_bytes()).hexdigest()


def main():
    independent = read('glb-independent.json')
    verified = read('blender-verification.json')
    contract = read('source-contract.json')
    build = read('build-metrics.json')
    assert independent['triangles'] == verified['blend_reopened']['triangles'] == verified['glb_clean_scene_reimport']['triangles'] == build['triangles'] == 1208
    assert independent['material_primitives'] == 3
    assert verified['clearance']['triangle_overlap_pairs'] == 0
    assert verified['clearance']['source_timeline_overlap_pairs'] == 0
    assert verified['clearance']['continuous_conservative_radial_clearance_lower_bound'] > .2
    assert contract['sourceState']['radius'] == 2.2
    assert contract['sourceState']['timerGranted'] == 14
    source_files = read('source-preservation.json')
    for entry in source_files:
        assert digest(REPO / entry['source']) == entry['sha256']
        assert digest(WORK / 'source' / entry['source'].replace('/', '__')) == entry['sha256']
    viewed = read('viewed-pngs.json')
    assert viewed['opened_with_view_image']
    for entry in viewed['opened_with_view_image']:
        assert digest(WORK / 'evidence' / 'png' / entry['file']) == entry['sha256']
    assets = {}
    for filename in sorted((WORK / 'asset').iterdir()):
        assets[filename.name] = {'bytes': filename.stat().st_size, 'sha256': digest(filename)}
    references = []
    for name in ['public/models/player.glb', 'asset-work/shield-pickup/initial/asset/shield-pickup.glb']:
        filename = REPO / name
        references.append({'path': name, 'bytes': filename.stat().st_size, 'sha256': digest(filename),
                           'purpose': 'Read-only evidence reference; no reference mesh merged/exported'})
    hierarchy = {
        'coordinates': {'badge_plane': 'XY', 'front': '+Z', 'up': '+Y', 'unit_scale': 1,
                        'authoring_to_game': '(BlenderX,BlenderZ,-BlenderY)', 'corrective_import_transform': 'NONE'},
        'root': 'Pickup.group: original gameplay position and camera.quaternion',
        'children': {'halo': 'EXISTING sibling sprite; externally shared material and texture, unchanged',
                     'imported_scene': {'transform': 'identity', 'owned': True, 'children': {
                         'spread_pickup_root': {'transform': 'identity', 'children': {
                             'shell': {'pivot': [0, 0, 0], 'motion': 'rotation.z+=dt*.3; uniform1+sin(phase*4)*.025'},
                             'core': {'pivot': [0, 0, -.3], 'motion': 'static'},
                             'shape': {'pivot': [0, 0, .1], 'motion': 'rotation.z=sin(phase*2.2)*.08'},
                         }}}}},
        'integration': 'RECIPE ONLY, no production edits; imported teardown MUST be added specifically to Pickup.dispose',
    }
    material_map = {
        'shell': {'glb': 'spread_shell_amber_unlit', 'primitive_count': 1, 'nominal_srgb': '#ffb43a',
                  'runtime': 'owned clone of untouched mats.neon(0xffb43a,1.15), vertexColors=true, toneMapped=false',
                  'vertex_color': 'neutral multiplier; no replacement hue'},
        'core': {'glb': 'spread_core_titanium', 'primitive_count': 1, 'runtime': 'per-instance cloned imported PBR material',
                 'metallic': .48, 'roughness': .4, 'vertex_color': 'authored absolute slate/titanium'},
        'shape': {'glb': 'spread_shape_amber_unlit', 'primitive_count': 1, 'nominal_srgb': '#ffb43a',
                  'runtime': 'owned clone of untouched mats.neon(0xffb43a,1.35), vertexColors=true, toneMapped=false',
                  'vertex_color': 'neutral multiplier; no replacement hue'},
        'halo': {'exported': False, 'source_material_owner': 'Materials._pickupHalos color-keyed cache',
                 'source_texture_owner': 'Materials/Textures glow; never per-instance disposed',
                 'opacity': .35, 'source_scale': '7*(1+sin(phase*4)*.2)'},
        'textures': 0, 'visible_material_primitives_including_shell_core_shape': 3,
    }
    manifest = {
        'asset': 'spread-shot-pickup', 'stage': 'INITIAL', 'status': 'pending_deferred_opus_review',
        'formal_reviews': 0, 'formal_review_fix_passes': 0, 'helpers': 0, 'claude_retries': 0,
        'production_edits': False, 'exclusive_write_scope': 'asset-work/spread-pickup/',
        'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
        'assets': assets, 'evaluated_counts': build, 'independent_glb': independent,
        'saved_blend_and_clean_reimport': verified, 'source_contract': contract['sourceState'],
        'actual_source_baseline': contract['baseline'], 'actual_three_ownership': contract['ownership'],
        'budget': {'target_triangles': 1500, 'ceiling_triangles': 2500, 'visible_primitives_ceiling': 3,
                   'glb_bytes_ceiling': 512 * 1024, 'atlas': None, 'textures_required': False, 'passed': True},
        'hierarchy': hierarchy, 'material_map': material_map, 'read_only_references': references,
        'deliberate_kit_reuse': json.loads((WORK / 'kit-reuse.json').read_text()),
        'charge': 'N/A', 'special_detach': 'N/A; source normal pickup removal remains',
        'pngs': len(list((WORK / 'evidence' / 'png').glob('*.png'))),
        'evidence_limitations': [
            'Offline Blender Eevee, not live browser/Three WebGL or pixel-equivalent postfx.',
            'Exact source geometry and actual source motion/camera/collection methods execute with Three.js; render normals/rim shader/world/halo pixels are approximate.',
            'Finite BVH overlap and vertex-to-triangle distances do not prove exact global surface minima. Separate radial bound covers all motion ranges.',
            'Collection visual context stills do not simulate source particles/HUD/audio; source dispatch/timers are separately verified.',
            'Native far-camera pixel size limits guaranteed three-chevron separation; no per-asset enlargement or collider changes.',
            'Ownership recipe is tested but not integrated; Pickup.dispose remains detach-only until explicit integration.',
            'Sender Taildrop success is not receiver-side hash verification; transfer receipt is external to immutable INITIAL.',
        ],
    }
    for filename, content in [('manifest.json', manifest), ('hierarchy.json', hierarchy), ('material-map.json', material_map), ('runtime-map.json', {'hierarchy': hierarchy, 'materials': material_map})]:
        (WORK / filename).write_text(json.dumps(content, indent=2) + '\n')
    print(json.dumps({'assets': assets, 'triangles': independent['triangles'], 'primitives': 3,
                      'rest_bounds': independent['transformed_rest_bounds_game'],
                      'clearance': verified['clearance'], 'pngs': manifest['pngs'], 'status': manifest['status']}, indent=2))


if __name__ == '__main__':
    main()
