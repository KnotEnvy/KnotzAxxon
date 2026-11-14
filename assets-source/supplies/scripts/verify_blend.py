"""Audit a reopened .blend: hierarchy, transforms, evaluated triangles, primitives, bounds, materials.

blender --background --factory-startup ASSET.blend --python verify_blend.py -- --asset silo|fuel --json OUT.json
Bounds and pivots are reported in glTF space (x, z, -y) for the rest pose stored in the file.
"""
import json
import math
import sys

import bpy

a = sys.argv[sys.argv.index('--') + 1:]
opt = {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a), 2)}
asset = opt['asset']


def g(v):
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


report = {'file': bpy.data.filepath, 'blender': bpy.app.version_string, 'asset': asset}
dg = bpy.context.evaluated_depsgraph_get()
objs = []
tri_total = 0
prim_total = 0
mn = [1e9] * 3
mx = [-1e9] * 3
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    e = {'name': ob.name, 'type': ob.type, 'parent': ob.parent.name if ob.parent else None,
         'location_gltf': g(ob.location), 'rotation_euler_blender': [round(x, 6) for x in ob.rotation_euler],
         'scale': [round(x, 6) for x in ob.scale], 'hide_render': ob.hide_render, 'hide_viewport': ob.hide_viewport}
    if ob.type == 'MESH':
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        used = sorted({p.material_index for p in me.polygons})
        mats = [me.materials[i].name for i in used]
        e.update(triangles=tris, vertices=len(me.vertices), materials=mats, primitives=len(mats))
        tri_total += tris
        prim_total += len(mats)
        W = ob.matrix_world
        for v in me.vertices:
            p = g(W @ v.co)
            for k in range(3):
                mn[k] = min(mn[k], p[k])
                mx[k] = max(mx[k], p[k])
        ev.to_mesh_clear()
    objs.append(e)
roots = [o for o in bpy.data.objects if o.parent is None]
report['roots'] = [r.name for r in roots]
root = roots[0]
report['root_identity'] = (len(roots) == 1 and root.matrix_world == root.matrix_world.Identity(4))
report['objects'] = objs
report['evaluated_triangles'] = tri_total
report['primitives'] = prim_total
report['rest_bounds_gltf'] = {'min': mn, 'max': mx, 'size': [round(mx[k] - mn[k], 5) for k in range(3)]}
mats = []
for m in bpy.data.materials:
    if m.users == 0:
        continue
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    info = {'name': m.name}
    if bsdf:
        ec = bsdf.inputs['Emission Color'].default_value
        info['emission_strength'] = round(bsdf.inputs['Emission Strength'].default_value, 4)
        info['emission_color_linear'] = [round(x, 4) for x in ec[:3]]
        info['textures'] = [n.image.name for n in m.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
    mats.append(info)
report['materials'] = mats
report['images'] = [{'name': i.name, 'size': list(i.size), 'packed': i.packed_file is not None,
                     'colorspace': i.colorspace_settings.name} for i in bpy.data.images if i.users]
piv = {}
for name in ('hatch', 'glow', 'launch-point', 'band', 'cap', 'stave-0', 'stave-1', 'stave-2'):
    ob = bpy.data.objects.get(name)
    if ob:
        piv[name] = g(ob.matrix_world.translation)
report['pivots_gltf'] = piv
report['custom_props_root'] = {k: (list(v) if hasattr(v, '__len__') and not isinstance(v, str) else v) for k, v in root.items()}
with open(opt['json'], 'w') as f:
    json.dump(report, f, indent=1)
print('VERIFY_BLEND', asset, tri_total, prim_total, report['rest_bounds_gltf']['size'])
