import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]


def game_to_blender(position):
    return Vector((position[0], -position[2], position[1]))


def blender_to_game(position):
    return [position[0], position[2], -position[1]]


def measure():
    minimum = [math.inf] * 3
    maximum = [-math.inf] * 3
    triangles = 0
    primitives = 0
    graph = bpy.context.evaluated_depsgraph_get()
    meshes = []
    for original in bpy.context.scene.objects:
        if original.type != 'MESH':
            continue
        obj = original.evaluated_get(graph)
        mesh = obj.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        primitives += len({polygon.material_index for polygon in mesh.polygons})
        for vertex in mesh.vertices:
            point = blender_to_game(obj.matrix_world @ vertex.co)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], point[axis])
                maximum[axis] = max(maximum[axis], point[axis])
        meshes.append({'name': original.name, 'triangles': len(mesh.loop_triangles), 'bucket': original.get('bucket'), 'materials': [slot.material.name for slot in original.material_slots]})
        obj.to_mesh_clear()
    return {'triangles': triangles, 'materialPrimitivesBeforeBatch': primitives, 'meshObjects': len(meshes), 'boundsTransformedGame': {'min': minimum, 'max': maximum}, 'meshes': meshes}


def ray(origin, direction, distance=100):
    hit, location, normal, index, obj, matrix = bpy.context.scene.ray_cast(bpy.context.evaluated_depsgraph_get(), game_to_blender(origin), game_to_blender(direction), distance=distance)
    assert hit, ('ray missed', origin, direction)
    return {'originGame': origin, 'directionGame': direction, 'hitGame': blender_to_game(location), 'object': obj.name}


bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'carrier.blend'))
bpy.context.view_layer.update()
saved = measure()
assert all(image.packed_file or image.source in ['GENERATED', 'VIEWER'] for image in bpy.data.images)
assert len([obj for obj in bpy.context.scene.objects if obj.type in ['LIGHT', 'CAMERA']]) == 0
apertures = []
for index in range(24):
    station = 132 + index * 32
    opening = ray([40, 0, station], [1, 0, 0])
    assert opening['hitGame'][0] >= 70, opening
    pier = ray([40, 0, station + 15], [1, 0, 0])
    assert 57 < pier['hitGame'][0] < 60, pier
    apertures.append({'bay': index + 1, 'opening': opening, 'pier': pier})
deck = ray([51.35, 28, 300], [0, -1, 0])
assert 14.9 <= deck['hitGame'][1] < 15.1
bells = [ray([83, altitude, 1000], [0, 0, -1]) for altitude in [-18, -2]]
assert all(980 <= record['hitGame'][2] < 981 for record in bells)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'carrier.glb'))
bpy.context.view_layer.update()
imported = measure()
assert imported['triangles'] == saved['triangles']
assert imported['materialPrimitivesBeforeBatch'] == 6
for key in ['min', 'max']:
    assert all(abs(first - second) < 0.0001 for first, second in zip(saved['boundsTransformedGame'][key], imported['boundsTransformedGame'][key]))
result = {'savedBlendReopened': saved, 'cleanSceneGlbReimport': imported, 'packedNoExternalDependencies': True, 'apertureRayChecks': apertures, 'catapultRecessRayCheck': deck, 'sternRecessRayChecks': bells, 'assertionsPassed': True, 'notProofOf': ['production GPU render', 'collision or aim integration', 'formal visual acceptance']}
(ROOT / 'checks/blender-reopen-reimport.json').write_text(json.dumps(result, indent=2))
print(json.dumps({key: value for key, value in result.items() if key not in ['savedBlendReopened', 'cleanSceneGlbReimport', 'apertureRayChecks']}, indent=2))
