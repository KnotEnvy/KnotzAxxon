import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'asset/drifting-wreckage-kit.blend'))
editable = []
for collection in bpy.data.collections:
    if collection.name not in ('gutter-keel', 'sheared-chine'):
        continue
    triangles = 0
    for item in collection.objects:
        if item.type == 'MESH':
            evaluated = item.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            mesh.calc_loop_triangles()
            triangles += len(mesh.loop_triangles)
            evaluated.to_mesh_clear()
    editable.append({'name': collection.name, 'objects': len(collection.objects), 'evaluated_triangles': triangles})
assert sorted(item['evaluated_triangles'] for item in editable) == [480, 532]
blend = {'reopened': True, 'variants': editable, 'unpacked_external_images': [image.name for image in bpy.data.images if image.source == 'FILE' and not image.packed_file], 'modifiers': sum(len(item.modifiers) for item in bpy.data.objects), 'mesh_objects_named': [item.name for item in bpy.data.objects if item.type == 'MESH']}
assert not blend['unpacked_external_images']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'asset/drifting-wreckage-kit.glb'))
imported = []
for parent in [item for item in bpy.context.scene.objects if item.parent is None]:
    points = []
    primitives = 0
    triangles = 0
    for item in parent.children_recursive:
        if item.type != 'MESH':
            continue
        primitives += len(item.data.materials)
        item.data.calc_loop_triangles()
        triangles += len(item.data.loop_triangles)
        for vertex in item.data.vertices:
            point = item.matrix_world @ vertex.co
            points.append((point.x, point.z, -point.y))
    imported.append({'name': parent.name, 'triangles': triangles, 'primitives': primitives, 'min': [min(point[axis] for point in points) for axis in range(3)], 'max': [max(point[axis] for point in points) for axis in range(3)]})
assert sorted(item['triangles'] for item in imported) == [480, 532]
assert all(item['primitives'] == 2 for item in imported)
sidecar = json.loads((ROOT / 'asset/runtime-templates.json').read_text())
for item in imported:
    expected = next(variant for variant in sidecar['variants'] if variant['name'] == item['name'])
    for edge in ('min', 'max'):
        assert max(abs(first - second) for first, second in zip(item[edge], expected['bounds'][edge])) < 1e-6
result = {'blender': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(), 'blend': blend, 'clean_scene_glb_reimport': imported, 'sidecar_bounds_match_tolerance': 1e-6, 'formal_reviews': 0, 'formal_fix_passes': 0, 'limitation': 'Blender evaluation and glTF import only; not Three.js GPU shader acceptance.'}
(ROOT / 'checks/blender-reopen-reimport.json').write_text(json.dumps(result, indent=2) + '\n')
print('WRECKAGE_REOPEN_REIMPORT_PASS', imported)
