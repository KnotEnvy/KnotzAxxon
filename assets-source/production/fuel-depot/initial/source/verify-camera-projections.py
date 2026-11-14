import bpy
import json
import math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT=Path(__file__).resolve().parents[1]
fixture=json.loads((ROOT/'evidence/world-fixture.json').read_text())
scene=bpy.context.scene
scene.render.resolution_x=1280
scene.render.resolution_y=720
scene.render.resolution_percentage=100
convert=lambda point:(point[0],-point[2],point[1])
results=[]
for name,rig in fixture['cameras'].items():
    data=bpy.data.cameras.new(name)
    camera=bpy.data.objects.new(name,data)
    scene.collection.objects.link(camera)
    camera.location=convert(rig['eye'])
    camera.rotation_euler=(Vector(convert(rig['target']))-camera.location).to_track_quat('-Z','Y').to_euler()
    if rig['classic']:
        data.type='ORTHO'
        data.ortho_scale=2*rig['halfHeight']*rig['aspect']
    else:
        data.type='PERSP'
        data.sensor_fit='VERTICAL'
        data.sensor_height=24
        data.lens=12/math.tan(math.radians(rig['fov'])/2)
    camera.data.clip_start=.1
    camera.data.clip_end=2000
    bpy.context.view_layer.update()
    actual=[]
    for local_x in (-2.92,2.92):
        for local_y in (0,3.1):
            for local_z in (-4,4):
                point=world_to_camera_view(scene,camera,Vector(convert((fixture['placement']['x']+local_x,local_y,fixture['placement']['z']+local_z))))
                actual.append((2*point.x-1,2*point.y-1))
    error=max(abs(value-expected) for pair,source in zip(actual,rig['cornerNDC']) for value,expected in zip(pair,source[:2]))
    assert error<2e-5,(name,error)
    results.append(dict(rig=name,maxScreenNDCError=error,sourceCorners=rig['cornerNDC'],blenderCorners=actual))
report=dict(passed=True,method='Independent Blender world_to_camera_view versus actual Three source CameraRig.snap/FlightCamera projected AABB corners; source image area 1280x720, labels add external bands',probes=results,lighting='Dusk key/rim colors and nominal directions approximated, not exact source follow() offsets/targets or hemisphere/environment shading; no lighting equivalence claim')
(ROOT/'evidence/camera-projection-proof.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
