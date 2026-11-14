"""Offline EEVEE evidence. Source camera snapshots/lights, shared world units.
No renderer result is represented as live game capture. No asset normalization.
"""
import bpy, math, json, sys, os
from pathlib import Path
from mathutils import Vector, Matrix, Euler
ROOT=Path(__file__).resolve().parent.parent
REPO=Path(__file__).resolve().parents[4]
OUT=ROOT/'evidence';OUT.mkdir(exist_ok=True)
source=json.loads((ROOT/'measurements/source-contract.json').read_text())
B=lambda p:Vector((p[0],-p[2],p[1]))
C=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
records=[]
newRenders=0
renderLimit=int(os.environ.get("MINE_RENDER_CHUNK","0"))
renderOnly=set(filter(None,os.environ.get("MINE_RENDER_ONLY","").split(",")))

def setup():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/mine.blend'))
    s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.threads_mode='FIXED';s.render.threads=4
    s.eevee.taa_render_samples=32;s.render.resolution_x=720;s.render.resolution_y=540;s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.film_transparent=False
    s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=0
    world=bpy.data.worlds.new('EvidenceNeutral');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.19,.24,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;s.world=world
    for name,pos,power,size in [('key',(-12,22,-12),2600,8),('fill',(14,12,8),1600,10)]:
        d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=B(pos);o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    d=bpy.data.cameras.new('EvidenceCamera');camera=bpy.data.objects.new('EvidenceCamera',d);s.collection.objects.link(camera);s.camera=camera
    return s,camera,bpy.data.objects['mine']

def camera_set(cam,pos,target,ortho=14,fov=58,aspect=4/3):
    cam.location=B(pos);cam.rotation_euler=(B(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.ortho_scale=ortho or 14
    cam.data.lens_unit='FOV';cam.data.sensor_fit='HORIZONTAL';cam.data.angle=2*math.atan(math.tan(math.radians(fov)/2)*aspect)
    cam.data.clip_start=.1;cam.data.clip_end=1000

def pose(root,rot=(0,0,0),pos=(0,0,0),scale=1):
    root.location=B(pos);root.rotation_mode='QUATERNION';root.rotation_quaternion=(C@(Matrix.Rotation(rot[0],3,'X')@Matrix.Rotation(rot[1],3,'Y')@Matrix.Rotation(rot[2],3,'Z'))@C.inverted()).to_quaternion();bpy.data.objects['lamp'].scale=(scale,)*3;bpy.context.view_layer.update()

def render(s,name,label,**meta):
    global newRenders
    if renderOnly and name not in renderOnly:return
    s.render.filepath=str(OUT/(name+'.png'))
    didRender=not Path(s.render.filepath).exists()
    if didRender:
        bpy.ops.render.render(write_still=True);newRenders+=1
    records.append({'file':name+'.png','label':label,'offline':True,**meta})
    (OUT/'render-index.json').write_text(json.dumps(records,indent=2))
    if didRender and renderLimit and newRenders>=renderLimit:
        print('MINE_RENDER_CHUNK_COMPLETE',newRenders,flush=True);sys.exit(0)

s,cam,root=setup();camera_set(cam,(-16,24,-30),(0,0,0))
render(s,'rest_common','REST / COMMON NEUTRAL / SPAN 14',cameraGame=[-16,24,-30],target=[0,0,0],orthoSpanHorizontal=14,key=[-12,22,-12],fill=[14,12,8])
for name,pos in [('front',(0,0,-30)),('back',(0,0,30)),('right',(30,0,0)),('left',(-30,0,0)),('top',(0,30,.001)),('bottom',(0,-30,.001))]:
    camera_set(cam,pos,(0,0,0));render(s,'view_'+name,'MULTIVIEW / '+name.upper(),cameraGame=pos,orthoSpanHorizontal=14)
camera_set(cam,(-16,24,-30),(0,0,0))
for t in [2,4,8,12]:
    point=next(p for p in source['trajectories'][1]['points'] if p['t']==t)
    pose(root,point['rotation'],(0,point['pos'][1]-9,0),point['scale'])
    render(s,'tumble_'+str(t),f'SOURCE ACTION / T={t}S / 60 HZ',sourceSample=point)
pose(root)
for name,near,time in [('far',0,math.pi/8),('warning',.56,math.pi/(2*(4+.56*26))),('armed',1,math.pi/60)]:
    scale=1+math.sin(time*(4+near*26))*(.015+near*.045);pose(root,scale=scale)
    render(s,'proximity_'+name,f'PROXIMITY {name.upper()} / EMISSION CONSTANT',near=near,time=time,lampScale=scale,neonIntensity=3.2,charge='N/A; proximity pulse only')
for scale in [.94,1.06]:
    pose(root,scale=scale);render(s,'pulse_'+str(scale).replace('.','_'),f'CLEARANCE / PULSE SCALE {scale}',lampScale=scale)
pose(root)
# Shipped craft loaded only as a scale/style reference, never used by build_mine.py.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'));refs=list(set(bpy.data.objects)-before)
refroot=bpy.data.objects.new('SHIPPED_PLAYER_REFERENCE_ONLY',None);s.collection.objects.link(refroot)
for o in refs:
    if o.parent not in refs:o.parent=refroot
root.hide_render=True
for o in root.children_recursive:o.hide_render=True
render(s,'reference_player_common','SHIPPED PLAYER / SAME COMMON CAMERA / SPAN 14',reference='public/models/player.glb',noNormalization=True)
root.hide_render=False
for o in root.children_recursive:o.hide_render=o.name=='flashMesh'
# Shared neutral pair. Camera widened identically for both assets; world geometry unchanged.
refroot.location=B((4,0,0));pose(root,pos=(-4,0,0));camera_set(cam,(-16,24,-30),(0,0,0),ortho=22)
render(s,'reference_shared_scale','MINE + SHIPPED PLAYER / SHARED WORLD SCALE',noNormalization=True,orthoSpanHorizontal=22)
# Minimal deck is a neutral scale aid, not a recreation of Fortress geometry.
bpy.ops.mesh.primitive_plane_add(size=400,location=B((0,-.2,60)));deck=bpy.context.object;deck.name='OfflineScaleDeck'
m=bpy.data.materials.new('OfflineDeck');m.diffuse_color=(.035,.055,.075,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8;deck.data.materials.append(m)
# Actual dusk source light coordinates, with player focus (0,altitude,0).
for name in ['key','fill']:bpy.data.objects[name].hide_render=True
world=s.world;world.node_tree.nodes['Background'].inputs[0].default_value=(.102,.159,.302,1);world.node_tree.nodes['Background'].inputs[1].default_value=1.9*.35
keydir=Vector((-.5,.7,-.52)).normalized()
for name,rgb,energy in [('SourceSun',(1,.503,.238),3.4),('SourceRim',(.078,.687,1),1.1)]:
    data=bpy.data.lights.new(name,'SUN');data.energy=energy;data.color=rgb;data.angle=math.radians(3);obj=bpy.data.objects.new(name,data);s.collection.objects.link(obj)
s.render.resolution_x=960;s.render.resolution_y=540
for sample in source['cameraSamples']:
    if sample['altitude']==9:continue
    alt=sample['altitude'];mode=sample['mode'];refroot.location=B((0,alt,0))
    gameTime=2.2;gameNear=max(0,min(1,1-math.sqrt(5*5+20*20)/34));gameScale=1+math.sin(gameTime*(4+gameNear*26))*(.015+gameNear*.045)
    pose(root,(gameTime*.5,gameTime*.7,0),(-5,alt,20),gameScale)
    for name,p,target in [('SourceSun',(keydir.x*140,keydir.y*140+90,keydir.z*140),(0,0,24)),('SourceRim',(-keydir.x*120,70,-keydir.z*120),(0,0,0))]:
        obj=bpy.data.objects[name];obj.location=B(p);obj.rotation_euler=(B(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    # Three's vertical halfHeight=40 -> Blender horizontal ortho_scale=80*aspect.
    ortho=sample['halfHeight']*2*sample['aspect'] if sample['orthographic'] else None
    camera_set(cam,sample['position'],sample['target'],ortho=ortho,fov=sample['fov'],aspect=16/9)
    render(s,f'gameplay_{mode}_alt{alt}',f'OFFLINE {mode.upper()} / ALT {alt} / SHARED WORLD UNITS',cameraSource=sample,sourceTime=gameTime,sourceNear=gameNear,sourceLampScale=gameScale,sourceEulerXYZ=[gameTime*.5,gameTime*.7,0],mineWorld=[-5,alt,20],playerWorld=[0,alt,0],sourceLightPreset='dusk',noNormalization=True,limits='Offline reconstruction: Blender PBR/hemisphere approximation, no game postprocess/HUD/PMREM/streamed fortress.')
print('MINE_RENDERED',len(records))
