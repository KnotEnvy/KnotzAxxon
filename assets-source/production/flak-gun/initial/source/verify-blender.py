import bpy
import hashlib
import json
import os
from pathlib import Path
from mathutils import Vector

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd())) / 'asset-work/flak-gun/initial'


def inspect():
    evaluated = bpy.context.evaluated_depsgraph_get()
    bounds = [[float('inf')] * 3, [-float('inf')] * 3]
    parts = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.evaluated_get(evaluated).to_mesh()
        mesh.calc_loop_triangles()
        for vertex in mesh.vertices:
            point = obj.matrix_world @ vertex.co
            game = [point.x, point.z, -point.y]
            for axis in range(3):
                bounds[0][axis] = min(bounds[0][axis], game[axis])
                bounds[1][axis] = max(bounds[1][axis], game[axis])
        parts.append({'node': obj.name, 'evaluatedTriangles': len(mesh.loop_triangles), 'materialSlots': [slot.material.name for slot in obj.material_slots], 'uvLayers': len(mesh.uv_layers), 'colorAttributes': [attribute.name for attribute in mesh.color_attributes], 'modifiers': len(obj.modifiers)})
        obj.evaluated_get(evaluated).to_mesh_clear()
    return {'parts': parts, 'evaluatedTriangles': sum(part['evaluatedTriangles'] for part in parts), 'bounds': bounds, 'externalImages': [image.filepath for image in bpy.data.images if image.source == 'FILE' and not image.packed_file], 'packedImages': [image.name for image in bpy.data.images if image.packed_file]}


bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'asset/fortress-rooftop-flak.blend'))
blend = inspect()
assert blend['evaluatedTriangles'] == 704 and len(blend['parts']) == 21 and not blend['externalImages']
assert all(part['uvLayers'] == 1 and part['colorAttributes'] for part in blend['parts'])
assert abs(bpy.data.objects['barrel_elevation_pivot'].location.z - 2.1) < .00001
assert abs(bpy.data.objects['azimuth_turntable'].rotation_euler.z + .85) < .00001
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'asset/fortress-rooftop-flak.glb'))
reimport = inspect()
assert reimport['evaluatedTriangles'] == 704 and len(reimport['parts']) == 21 and not reimport['externalImages']
assert all(part['uvLayers'] == 1 and part['colorAttributes'] for part in reimport['parts'])
error = max(abs(blend['bounds'][row][axis] - reimport['bounds'][row][axis]) for row in range(2) for axis in range(3))
assert error < .00001
report = {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'method': 'Separate native Linux Blender invocation reopens packed editable blend, then factory-clears and imports clean GLB; evaluates mesh topology/transforms/attributes', 'blend': blend, 'cleanGLBReimport': reimport, 'maximumBoundsError': error, 'sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [ROOT / 'asset/fortress-rooftop-flak.blend', ROOT / 'asset/fortress-rooftop-flak.glb']}}
import math
from bpy_extras.object_utils import world_to_camera_view
fixture = json.loads((ROOT / 'evidence/world-fixture.json').read_text())
template = json.loads((ROOT / 'asset/flak-gun.template.json').read_text())
selected = fixture['selected']
scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.resolution_percentage = 100
checks = []
for rig in fixture['rigs']:
    current = bpy.data.objects.new('Independent_source_camera_' + rig['mode'], bpy.data.cameras.new(rig['mode']))
    scene.collection.objects.link(current)
    current.location = (rig['eye'][0], -rig['eye'][2], rig['eye'][1])
    focus = Vector((rig['lookAt'][0], -rig['lookAt'][2], rig['lookAt'][1]))
    current.rotation_euler = (focus - current.location).to_track_quat('-Z', 'Y').to_euler()
    current.data.type = 'ORTHO' if rig['orthographic'] else 'PERSP'
    current.data.sensor_fit = 'HORIZONTAL'
    current.data.ortho_scale = (rig['halfHeight'] or 40) * 2 * 16 / 9
    current.data.angle = 2 * math.atan(math.tan(math.radians(rig['fov']) / 2) * 16 / 9)
    current.data.clip_start, current.data.clip_end = .1, 1600
    bpy.context.view_layer.update()
    bounds = [[float('inf')] * 2, [-float('inf')] * 2]
    for part in template['parts']:
        for vertex in range(part['start'], part['start'] + part['count']):
            pos_x, pos_y, pos_z = template['positions'][vertex * 3:vertex * 3 + 3]
            if part['motion'] == 2:
                alpha = math.pi / 2 - selected['pitch']
                pivot_y = pos_y - 2.1
                pos_y, pos_z = pivot_y * math.cos(alpha) + pos_z * math.sin(alpha) + 2.1, -pivot_y * math.sin(alpha) + pos_z * math.cos(alpha)
            if part['motion']:
                cosine, sine = math.cos(selected['yaw']), math.sin(selected['yaw'])
                pos_x, pos_z = pos_x * cosine + pos_z * sine, -pos_x * sine + pos_z * cosine
            point = Vector((pos_x + selected['x'], -(pos_z + selected['z']), pos_y + selected['roofY']))
            projected = world_to_camera_view(scene, current, point)
            for axis, value in enumerate((projected.x * 2 - 1, projected.y * 2 - 1)):
                bounds[0][axis] = min(bounds[0][axis], value)
                bounds[1][axis] = max(bounds[1][axis], value)
    camera_error = max(abs(bounds[row][axis] - [rig['ndcMin'], rig['ndcMax']][row][axis]) for row in range(2) for axis in range(2))
    assert camera_error < .00002, (rig['mode'], camera_error)
    checks.append({'mode': rig['mode'], 'maximumNDCDifferenceVersusActualSourceCameraRigSnap': camera_error, 'BlenderNDCBounds': bounds, 'sourceNDCBounds': [rig['ndcMin'], rig['ndcMax']]})
report['independentWorldCameraProjectionChecks'] = checks
(ROOT / 'evidence/blender-reopen-clean-reimport.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'evaluatedTriangles': 704, 'blendMeshObjects': len(blend['parts']), 'reimportMeshObjects': len(reimport['parts']), 'maximumBoundsError': error}, indent=2))
