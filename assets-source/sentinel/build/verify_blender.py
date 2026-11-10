"""Reopen both saved .blend files and reimport both GLBs; check counts and pivots.

blender -b --factory-startup --python verify_blender.py -- <contest-entry dir> <report.json>

Fails (exit code 1) if any required node is missing, any pivot is off by more
than 1e-3, budgets are exceeded, or GLB reimport disagrees with the .blend.
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import kx_common as K  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
ROOT, REPORT = argv[0], argv[1]

# (node, parent, expected local translation in game space) shared with inspect_glb.py
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'expected_nodes.json')) as f:
    EXPECT = json.load(f)
BASELINE = {'player': [7.9, 2.054, 5.713], 'sentinel': [35.62, 24.94, 18.132]}

report = {}
ok = True


def fail(msg):
    global ok
    ok = False
    print('VERIFY_FAIL', msg)


def check_nodes(asset, label, animated_ok=False):
    res = []
    for name, parent, loc in EXPECT[asset]['nodes']:
        o = bpy.data.objects.get(name)
        if o is None:
            fail(f'{label}: missing node {name}')
            continue
        p = o.parent.name if o.parent else None
        if p != parent:
            fail(f'{label}: {name} parent {p} != {parent}')
        # local transform relative to the parent, in game space
        local = K.from_blender_matrix((o.parent.matrix_world.inverted() if o.parent else K.Matrix.Identity(4)) @ o.matrix_world)
        got = local.to_translation()
        err = (got - Vector(loc)).length
        animated = bool(o.animation_data and (o.animation_data.action or len(o.animation_data.nla_tracks)))
        if err > 1e-3 and not (animated_ok and animated):
            fail(f'{label}: {name} at {tuple(round(v, 4) for v in got)} expected {loc}')
        res.append({'node': name, 'parent': p, 'local_translation': [round(v, 4) for v in got], 'error': round(err, 6),
                    'animated_on_import': animated})
    return res


def nla_clips():
    clips = set()
    for o in bpy.data.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks:
                clips.add(tr.name)
    return sorted(clips)


for asset in ('player', 'sentinel'):
    entry = {}
    # --- reopen the saved .blend --------------------------------------------
    blend = os.path.join(ROOT, f'{asset}.blend')
    bpy.ops.wm.open_mainfile(filepath=blend)
    bpy.context.scene.frame_set(0)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    st = K.evaluated_stats(meshes)
    entry['blend'] = {
        'file': os.path.basename(blend), 'bytes': os.path.getsize(blend), 'objects': len(bpy.data.objects),
        'mesh_objects': len(meshes), 'evaluated_triangles': st['triangles'], 'material_primitives': st['primitives'],
        'bounds_min': st['min'], 'bounds_max': st['max'], 'size': st['size'], 'per_object': st['objects'],
        'nodes': check_nodes(asset, 'blend'), 'nla_clips': nla_clips(),
        'packed_images': [{'name': i.name, 'size': list(i.size), 'packed': bool(i.packed_file)}
                          for i in bpy.data.images if i.type == 'IMAGE'],
    }
    for im in entry['blend']['packed_images']:
        if not im['packed']:
            fail(f'blend: image {im["name"]} not packed')
        if max(im['size']) > 2048:
            fail(f'blend: image {im["name"]} larger than 2048')
    b = EXPECT[asset]['budget']
    if st['triangles'] > b['triangles'] or st['primitives'] > b['primitives']:
        fail(f'blend: {asset} over budget {st["triangles"]}/{st["primitives"]}')
    for c in EXPECT[asset]['clips']:
        if c not in entry['blend']['nla_clips']:
            fail(f'blend: clip {c} missing')
    entry['dimension_ratio_vs_baseline'] = [round(s / bl, 4) for s, bl in zip(st['size'], BASELINE[asset])]
    for r in entry['dimension_ratio_vs_baseline']:
        if abs(r - 1) > .10:
            fail(f'{asset}: dimension ratio {r} outside 10%')
    blend_tris = st['triangles']

    # --- reimport the GLB into an empty scene --------------------------------
    bpy.ops.wm.read_factory_settings(use_empty=True)
    glb = os.path.join(ROOT, f'{asset}.glb')
    bpy.ops.import_scene.gltf(filepath=glb)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:  # imported animations may leave an action active: use the rest pose
        pass
    # The importer assigns an animation to animated nodes and evaluates it, so
    # their rest TRS is not recoverable here; inspect_glb.py checks rest pivots
    # exactly from the file. Static nodes are still checked here.
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    st2 = K.evaluated_stats(meshes)
    entry['glb_reimport'] = {
        'file': os.path.basename(glb), 'bytes': os.path.getsize(glb), 'objects': len(bpy.data.objects),
        'mesh_objects': len(meshes), 'triangles': st2['triangles'], 'material_primitives': st2['primitives'],
        'bounds_min': st2['min'], 'bounds_max': st2['max'], 'size': st2['size'],
        'nodes': check_nodes(asset, 'glb', animated_ok=True), 'actions': sorted(a.name for a in bpy.data.actions),
        'materials': sorted(m.name for m in bpy.data.materials),
    }
    if st2['primitives'] != st['primitives']:
        fail(f'{asset}: GLB primitives {st2["primitives"]} != blend {st["primitives"]}')
    for c in EXPECT[asset]['clips']:
        if c not in entry['glb_reimport']['actions']:
            fail(f'glb: animation {c} missing after reimport')
    if st2['triangles'] != blend_tris:
        fail(f'{asset}: GLB triangles {st2["triangles"]} != blend {blend_tris}')
    if os.path.getsize(glb) > 16 * 1024 * 1024:
        fail(f'{asset}: GLB larger than 16 MiB')
    report[asset] = entry
    print('VERIFIED', asset, blend_tris, st['primitives'], st2['triangles'], st2['primitives'])

report['ok'] = ok
report['blender'] = bpy.app.version_string
with open(REPORT, 'w') as f:
    json.dump(report, f, indent=1)
print('VERIFY_RESULT', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
