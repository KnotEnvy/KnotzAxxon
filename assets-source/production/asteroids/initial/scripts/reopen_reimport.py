import json
import pathlib

import bpy


ROOT = pathlib.Path(__file__).resolve().parents[1]


def inspect():
    result = []
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        game_points = [(point.x, point.z, -point.y) for point in points]
        result.append({'node': obj.name, 'evaluatedTriangles': len(mesh.loop_triangles), 'materialSlots': len(mesh.materials),
                       'boundsGame': {'min': [min(point[axis] for point in game_points) for axis in range(3)], 'max': [max(point[axis] for point in game_points) for axis in range(3)]}})
        evaluated.to_mesh_clear()
    return result


bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'source/asteroid-scenery-kit.blend'))
reopened = inspect()
assert len(reopened) == 3 and sum(item['evaluatedTriangles'] for item in reopened) == 1296
assert len(bpy.data.images) == 0
assert all(not image.filepath or image.packed_file for image in bpy.data.images)
imports = []
for file in sorted((ROOT / 'assets').glob('*.glb')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(file))
    bpy.context.view_layer.update()
    rows = inspect()
    expected = 3 if file.stem == 'asteroid-scenery-kit' else 1
    assert len(rows) == expected and all(item['materialSlots'] == 1 for item in rows)
    imports.append({'file': str(file.relative_to(ROOT)), 'meshes': rows})
report = {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'savedBlendReopen': reopened,
          'externalImages': 0, 'packedSelfContained': True, 'cleanFactoryReimports': imports}
(ROOT / 'measurements/reopen-reimport.json').write_text(json.dumps(report, indent=2) + '\n')
print('REOPEN_REIMPORT_PASS', json.dumps(report))
