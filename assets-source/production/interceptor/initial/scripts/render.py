"""Render exported GLB; poses come from exact Flyer.update source sampling.
These are offline reconstructed evidence, not in-game captures.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler
OUT=Path(__file__).resolve().parents[1]; REPO=OUT.parents[2]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(OUT/'interceptor.glb'))
root=bpy.data.objects['interceptor'];bpy.data.objects['hit-flash-shell'].hide_render=True
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.threads_mode='FIXED';s.render.threads=4
s.eevee.taa_render_samples=20;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG';s.render.film_transparent=False
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.022,.027,.036,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
def cv(p):return Vector((p[0],-p[2],p[1]))
def aim(o,p):o.rotation_euler=(cv(p)-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('EvidenceCamera',bpy.data.cameras.new('EvidenceCamera'));s.collection.objects.link(cam);s.camera=cam
lights=[]
for name,p,power,size in [('key',(-12,22,-12),4400,9),('fill',(14,12,8),3200,9)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=cv(p);aim(o,(0,0,0));lights.append(o)
def pose(rot,scale=1):
 # Three Euler order XYZ: Rx*Ry*Rz; do not assign Blender Euler XYZ and assume equivalence.
 x,y,z=rot;R=Matrix.Rotation(x,4,'X')@Matrix.Rotation(y,4,'Y')@Matrix.Rotation(z,4,'Z')
 C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
 root.matrix_world=C@R@C.inverted();bpy.data.objects['engine'].scale=(scale,)*3
def render(name,loc,target=(0,0,0),span=8.4,res=(640,480),persp=False,fov=58):
 only=next((x.split('=',1)[1] for x in sys.argv if x.startswith('--only=')),None)
 if only and name!=only:return
 subset=next((x.split('=',1)[1].split(',') for x in sys.argv if x.startswith('--subset=')),None)
 if subset and name not in subset:return
 if '--resume' in sys.argv and (OUT/'renders'/f'{name}.png').exists():return
 cam.location=cv(loc);aim(cam,target);cam.data.type='PERSP' if persp else 'ORTHO'
 cam.data.lens_unit='FOV';cam.data.sensor_fit='VERTICAL' if persp else 'HORIZONTAL';cam.data.angle_y=math.radians(fov)
 cam.data.ortho_scale=span;s.render.resolution_x=res[0];s.render.resolution_y=res[1]
 s.render.filepath=str(OUT/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
for name,loc,span in [('rest-front',(0,3,20),7.6),('rest-rear',(0,2,-20),7.6),('rest-top',(0,22,.001),7.6),('rest-side',(20,2,0),6.8),('rest-three-quarter',(-10,9,14),8.4),('common-neutral',(-16,24,-30),14)]:
 pose((0,0,0));render(name,loc,span=span)
motion=json.loads((OUT/'evidence'/'runtime-contract.json').read_text())
for k in ['weave','strafe','orbit-displaced','dive','peel','carrier-launch','carrier-transition']:
 p=motion['contexts'][k]['selected_pose'];pose(p['rotation_xyz'],p['engine_scale']);render('action-'+k,(-10,9,14),span=8.7)
for sign in [-1,1]:
 pose((sign*.16,sign*.288,sign*1.1),1.065);render('action-extreme-'+('positive' if sign>0 else 'negative'),(-10,9,14),span=8.7)
pose((0,0,0));
# Shipped player in the same world units, no normalization or scale edits.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'));player=list(set(bpy.data.objects)-before)
for o in player:
 if not o.parent:o.location+=cv((-4.7,0,0))
root.location=cv((4.5,0,0))
render('world-scale-player-comparison',(-16,22,-30),target=(0,0,0),span=21,res=(960,560))
for o in player:bpy.data.objects.remove(o,do_unlink=True)
root.location=(0,0,0)
# Rig equations copied from CameraRig._compute with player at (0,9,0), no boost, no lag/shake.
# Model remains at world (0,9,32). This framing honestly measures small-game-scale readability.
for o in lights:bpy.data.objects.remove(o,do_unlink=True)
sun=bpy.data.lights.new('DuskSun','SUN');sun.energy=3.4;sun.color=(1,.503,.238);sun.angle=.08
o=bpy.data.objects.new('DuskSun',sun);s.collection.objects.link(o);o.location=cv((-50,70,-52));aim(o,(0,0,0))
fill=bpy.data.lights.new('DuskRim','SUN');fill.energy=1.1;fill.color=(.078,.69,1)
o=bpy.data.objects.new('DuskRim',fill);s.collection.objects.link(o);o.location=cv((50,60,52));aim(o,(0,0,0))
s.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.045,.068,.13,1);s.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.65
root.location=cv((0,9,32))
rigs={'classic':(45,64,45.255,52),'modern':(20,29,14,58),'chase':(6,24,9.5,66)}
for name,(yaw,dist,height,fov) in rigs.items():
 a=math.radians(yaw);off=(-dist*math.sin(a),height,-dist*math.cos(a))
 loc=(off[0],9+off[1],off[2]+(28 if name=='classic' else 0))
 target=(0,9,28) if name=='classic' else (0,10.2,16)
 render('gameplay-'+name,loc,target,span=2*40*16/9,res=(960,540),persp=name!='classic',fov=fov)
(OUT/'evidence'/'render-method.json').write_text(json.dumps({'engine':'EEVEE','samples':20,'game_to_blender':'(x,-z,y)','common_neutral':{'camera_game':[-16,24,-30],'camera_blender':[-16,30,24],'target_game':[0,0,0],'ortho_span_width':14,'key_game':[-12,22,-12],'fill_game':[14,12,8],'background':'shared neutral dark'},'gameplay':{'kind':'OFFLINE RECONSTRUCTED; not game screenshots','resolution':[960,540],'model_position_game':[0,9,32],'player_position_game':[0,9,0],'rigs':rigs,'classic_ortho_half_height':40,'lighting':'Dusk key direction/intensity and cyan rim approximated with Blender SUN + world; no PMREM, actual fog, bloom, postfx, shadows from level or HUD','limitations':'EEVEE AgX differs from Three ACES exposure1.02. Rig static, no lag/shake, boost=0. Readability in actual moving carrier/boss context awaits integration.'}},indent=2))
