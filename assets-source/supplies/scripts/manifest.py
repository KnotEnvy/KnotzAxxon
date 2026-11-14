#!/usr/bin/env python3
"""Assemble manifest.json from measured verification outputs (nothing is typed in by hand).

python3 manifest.py SNAPSHOT_DIR BASELINE_JSON
"""
import hashlib
import json
import os
import sys

snap, baseline_path = sys.argv[1], sys.argv[2]
V = os.path.join(snap, 'verification')
base = json.load(open(baseline_path))
BUDGET = {'silo': {'triangles': 15000, 'primitives': 10}, 'fuel': {'triangles': 12000, 'primitives': 8}}
MAX_BYTES = 16 * 1024 * 1024


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def load(name):
    return json.load(open(os.path.join(V, name)))


man = {'snapshot': os.path.basename(os.path.abspath(snap)), 'coordinate_convention':
       'glTF Y up, X across, +Z forward; Blender Z up exported with export_yup (Blender (x,y,z) -> glTF (x,z,-y)); root nodes identity; ground Y=0',
       'assets': {}}
for asset in ('silo', 'fuel'):
    ins = load(f'{asset}_inspect.json')
    bl = load(f'{asset}_blend.json')
    rg = load(f'{asset}_glb_reimport.json')
    cl = load(f'{asset}_clearance.json')
    b = base[asset]
    size = ins['bounds']['size']
    ratio = [round(size[k] / b['size'][k], 4) for k in range(3)]
    node_map = {n['name']: [p['material'] for p in n.get('primitives', [])] for n in ins['nodes']}
    entry = {
        'files': {
            'glb': {'path': f'{asset}.glb', 'bytes': ins['bytes'], 'sha256': ins['sha256']},
            'blend': {'path': f'{asset}.blend', 'bytes': os.path.getsize(os.path.join(snap, f'{asset}.blend')),
                      'sha256': sha(os.path.join(snap, f'{asset}.blend'))},
        },
        'triangles': {'glb_accessors': ins['triangles'], 'blend_evaluated': bl['evaluated_triangles'],
                      'glb_reimported_blender': rg['triangles'], 'budget': BUDGET[asset]['triangles']},
        'primitives': {'glb': ins['primitives'], 'blend_used_material_slots': bl['primitives'],
                       'glb_reimported_blender': rg['primitives'], 'budget': BUDGET[asset]['primitives']},
        'bounds_gltf': {'glb_transformed': ins['bounds'], 'blend_rest': bl['rest_bounds_gltf'],
                        'glb_reimported_blender': rg['bounds_gltf'], 'baseline': b,
                        'size_ratio_vs_baseline': ratio,
                        'within_10_percent': all(0.9 <= r <= 1.1 for r in ratio),
                        'grounded_min_y': ins['bounds']['min'][1]},
        'root': {'names': ins['root_nodes'], 'identity_transform_glb': ins['root_identity_transform'],
                 'identity_world_blend': bl['root_identity'], 'identity_world_reimport': rg['root_world_identity']},
        'nodes': [{k: n[k] for k in ('name', 'parent', 'translation', 'rotation', 'scale', 'world_translation')}
                  for n in ins['nodes']],
        'pivots_gltf_blend': bl['pivots_gltf'],
        'material_mapping': node_map,
        'materials': ins['materials'],
        'textures': ins['images'],
        'extensions': ins['extensionsUsed'],
        'clearance': {'all_clear': cl['all_clear'], 'method': cl['method'],
                      'checks': [{k: c[k] for k in ('check', 'samples', 'intersecting_samples', 'total_triangle_overlaps', 'min_distance_m')}
                                 for c in cl['checks']]},
        'checks': {
            'triangles_within_budget': ins['triangles'] <= BUDGET[asset]['triangles'],
            'primitives_within_budget': ins['primitives'] <= BUDGET[asset]['primitives'],
            'glb_under_16MiB': ins['bytes'] <= MAX_BYTES,
            'textures_max_2048_embedded': all(i['width'] <= 2048 and i['height'] <= 2048 and i['embedded'] for i in ins['images']),
            'no_external_buffers': not ins['buffers_external'],
            'blend_glb_reimport_triangles_agree': ins['triangles'] == bl['evaluated_triangles'] == rg['triangles'],
        },
    }
    if asset == 'silo':
        entry['gameplay_contract'] = {
            'hatch_pivot_gltf': [0, 2.45, 0], 'glow_pivot_gltf': [0, 2.415, 0],
            'hatch_motion': 'position.y = 2.45 + doors*0.1; uniform scale = 1 - doors*0.85 (doors 0..1)',
            'glow_motion': 'uniform scale = 0.4 + doors*0.55',
            'launch_point': cl.get('launch_point'),
            'launch_point_note': 'Existing gameplay spawn is entity position + (0, 3, 0); exported as empty node "launch-point".'}
    else:
        entry['gameplay_contract'] = {
            'band_pivot_gltf': [0, 2.2, 0], 'band_motion': 'position.y = 2.2 + sin(t*2.4 + z*0.2)*1.1; rotation.y += dt*1.2',
            'rupture': 'demonstration only: band and cap ejected, three staves slide 0.62 m out then tilt 22 deg (poses.py)'}
    man['assets'][asset] = entry
man['all_checks_pass'] = all(all(e['checks'].values()) and e['bounds_gltf']['within_10_percent'] and e['clearance']['all_clear']
                             and e['root']['identity_transform_glb'] for e in man['assets'].values())
json.dump(man, open(os.path.join(snap, 'manifest.json'), 'w'), indent=1)
print('MANIFEST all_checks_pass =', man['all_checks_pass'])
for a, e in man['assets'].items():
    print(a, e['triangles']['glb_accessors'], e['primitives']['glb'], e['files']['glb']['bytes'], e['bounds_gltf']['size_ratio_vs_baseline'], e['checks'])
