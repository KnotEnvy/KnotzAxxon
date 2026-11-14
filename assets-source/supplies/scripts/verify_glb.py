"""Import a GLB into a clean empty scene and measure what came back.

blender --background --factory-startup --python verify_glb.py -- --glb ASSET.glb --json OUT.json
"""
import json
import sys

import bpy

a = sys.argv[sys.argv.index('--') + 1:]
opt = {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a), 2)}
bpy.ops.wm.read_factory_settings(use_empty=True)
before = len(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=opt['glb'])
dg = bpy.context.evaluated_depsgraph_get()


def g(v):
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


objs, tri, prim = [], 0, 0
mn, mx = [1e9] * 3, [-1e9] * 3
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    e = {'name': ob.name, 'type': ob.type, 'parent': ob.parent.name if ob.parent else None,
         'world_translation_gltf': g(ob.matrix_world.translation)}
    if ob.type == 'MESH':
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        used = sorted({p.material_index for p in me.polygons})
        e.update(triangles=len(me.loop_triangles), materials=[me.materials[i].name for i in used])
        tri += len(me.loop_triangles)
        prim += len(used)
        for v in me.vertices:
            p = g(ob.matrix_world @ v.co)
            for k in range(3):
                mn[k] = min(mn[k], p[k])
                mx[k] = max(mx[k], p[k])
        ev.to_mesh_clear()
    objs.append(e)
roots = [o for o in bpy.data.objects if o.parent is None]
rep = {'glb': opt['glb'], 'objects_before_import': before, 'objects': objs, 'roots': [r.name for r in roots],
       'root_world_identity': all(r.matrix_world == r.matrix_world.Identity(4) for r in roots),
       'triangles': tri, 'primitives': prim,
       'bounds_gltf': {'min': mn, 'max': mx, 'size': [round(mx[k] - mn[k], 5) for k in range(3)]},
       'materials': sorted(m.name for m in bpy.data.materials if m.users),
       'images': [{'name': i.name, 'size': list(i.size), 'packed': i.packed_file is not None} for i in bpy.data.images if i.users]}
with open(opt['json'], 'w') as f:
    json.dump(rep, f, indent=1)
print('VERIFY_GLB', tri, prim, rep['bounds_gltf']['size'], rep['roots'])
