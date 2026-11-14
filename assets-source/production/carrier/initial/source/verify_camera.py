import json
import math
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
source = json.loads((ROOT / 'checks/camera-source.json').read_text())
evidence = json.loads((ROOT / 'evidence/renders.json').read_text())
reports = []
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100


def game(point):
    return Vector((point[0], -point[2], point[1]))


for record in source:
    rig = next(entry['rig'] for entry in evidence['images'] if entry['image'] == 'game-' + record['mode'] + '.png')
    assert all(abs(first - second) < 1e-5 for first, second in zip(record['eye'], rig['eyeGame']))
    assert all(abs(first - second) < 1e-5 for first, second in zip(record['target'], rig['targetGame']))
    data = bpy.data.cameras.new(record['mode'])
    data.clip_start = 0.35
    data.clip_end = 560 * 2.4
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 32
    if record['mode'] == 'classic':
        data.type = 'ORTHO'
        data.ortho_scale = 80
    else:
        data.type = 'PERSP'
        data.lens = 16 / math.tan(math.radians(rig['verticalFov'] / 2))
    obj = bpy.data.objects.new(record['mode'], data)
    scene.collection.objects.link(obj)
    obj.location = game(rig['eyeGame'])
    obj.rotation_euler = (game(rig['targetGame']) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = obj
    bpy.context.view_layer.update()
    points = []
    for point in record['points']:
        projected = world_to_camera_view(scene, obj, game(point['game']))
        error = max(abs(projected[axis] - point['viewport'][axis]) for axis in range(2))
        assert error < 1e-5, (record['mode'], point, projected, error)
        points.append({'game': point['game'], 'sourceViewport': point['viewport'], 'blenderViewport': list(projected[:2]), 'absoluteViewportError': error})
    reports.append({'mode': record['mode'], 'matchesActualSourceCamera': True, 'points': points})
(ROOT / 'checks/camera-projection.json').write_text(json.dumps({'assertionsPassed': True, 'renderViewport': [1280, 720], 'headerHeightExcluded': 56, 'scope': 'camera math only; offline lighting/render limitations unchanged', 'rigs': reports}, indent=2))
print('All three offline camera projections match actual source rigs within 1e-5 normalized viewport coordinates.')
