"""
Reopen the saved kit blend and clean-scene reimport every exported GLB.

blender --background --factory-startup -noaudio --python verify_blend.py -- <kitDir> [out.json]

1) open environment-kit.blend: collections, objects, evaluated triangles, custom
   properties, linked libraries / missing files, compared with kit-recipe.json
2) for each module: empty factory scene, import the GLB, evaluated triangles
   and world bounds converted back to game axes, compared with the recipe
No rendering.
"""
import bpy
import json
import sys
import hashlib
from pathlib import Path
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
KIT = Path(argv[0])
OUT = Path(argv[1]) if len(argv) > 1 else KIT / 'evidence' / 'reopen-kit.json'
recipe = json.loads((KIT / 'kit-recipe.json').read_text())
failures = []


def tris_bounds(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    # Blender (x, y, z) -> game (x, z, -y)
    g = [(p.x, p.z, -p.y) for p in pts]
    lo = [min(p[k] for p in g) for k in range(3)]
    hi = [max(p[k] for p in g) for k in range(3)]
    return n, lo, hi


report = {'method': 'Background Blender reopen of the saved .blend and clean-scene GLB reimport; evaluated depsgraph triangles and world bounds in game axes. No rendering.',
          'blender': bpy.app.version_string}

# ---- 1) reopen the editable blend ----
blend = KIT / 'environment-kit.blend'
bpy.ops.wm.open_mainfile(filepath=str(blend))
kit = {'file': blend.name, 'sha256': hashlib.sha256(blend.read_bytes()).hexdigest(), 'bytes': blend.stat().st_size,
       'libraries': [l.filepath for l in bpy.data.libraries], 'images': len(bpy.data.images), 'scenes': [s.name for s in bpy.data.scenes],
       'unit': bpy.context.scene.unit_settings.system, 'collections': {}}
if kit['libraries']:
    failures.append('kit blend links external libraries')
for mod, entry in recipe['modules'].items():
    coll = bpy.data.collections.get(mod)
    if not coll:
        failures.append(f'missing collection {mod}')
        continue
    parts = {e['node']: e for e in entry['parts']}
    names = {o.name for o in coll.objects}
    if names != set(parts):
        failures.append(f'{mod}: object set differs {sorted(names ^ set(parts))}')
    total = 0
    for o in coll.objects:
        n, lo, hi = tris_bounds(o)
        total += n
        e = parts.get(o.name)
        if not e:
            continue
        if n != e['triangles']:
            failures.append(f'{o.name}: {n} triangles in blend, recipe {e["triangles"]}')
        if any(abs(a - b) > 2e-4 for a, b in zip(lo, e['localBounds']['min'])) or any(abs(a - b) > 2e-4 for a, b in zip(hi, e['localBounds']['max'])):
            failures.append(f'{o.name}: blend bounds differ from recipe')
        if o.get('rs_bucket') != e['bucket'] or o.get('rs_owner') != e['owner']:
            failures.append(f'{o.name}: custom properties differ from recipe')
        if any(abs(v) > 1e-9 for v in o.location) or any(abs(v - 1) > 1e-9 for v in o.scale) or any(abs(v) > 1e-9 for v in o.rotation_euler):
            failures.append(f'{o.name}: object transform is not identity')
    kit['collections'][mod] = {'objects': len(coll.objects), 'triangles': total}
    if total != entry['triangles']:
        failures.append(f'{mod}: {total} triangles in blend, recipe {entry["triangles"]}')
kit['materials'] = len(bpy.data.materials)
report['kitBlend'] = kit

# ---- 2) clean-scene reimport of every GLB ----
report['reimport'] = {}
for mod, entry in recipe['modules'].items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(KIT / entry['glb']['file']))
    parts = {e['node']: e for e in entry['parts']}
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = 0
    worst = 0.0
    for o in meshes:
        n, lo, hi = tris_bounds(o)
        total += n
        e = parts.get(o.name)
        if not e:
            failures.append(f'{mod}: reimported unknown object {o.name}')
            continue
        if n != e['triangles']:
            failures.append(f'{o.name}: {n} triangles after reimport, recipe {e["triangles"]}')
        d = max(max(abs(a - b) for a, b in zip(lo, e['localBounds']['min'])), max(abs(a - b) for a, b in zip(hi, e['localBounds']['max'])))
        worst = max(worst, d)
        if d > 2e-4:
            failures.append(f'{o.name}: reimport bounds differ by {d}')
    if len(meshes) != len(parts):
        failures.append(f'{mod}: {len(meshes)} meshes after reimport, recipe {len(parts)}')
    report['reimport'][mod] = {'meshes': len(meshes), 'triangles': total, 'recipeTriangles': entry['triangles'], 'worstBoundsDelta': round(worst, 7),
                               'nonMeshObjects': len([o for o in bpy.data.objects if o.type != 'MESH'])}
report['failures'] = failures
report['passed'] = not failures
OUT.write_text(json.dumps(report, indent=1) + '\n')
print('VERIFY', json.dumps({'passed': report['passed'], 'failures': failures[:10], 'kit': kit['collections'], 'reimport': report['reimport']}))
