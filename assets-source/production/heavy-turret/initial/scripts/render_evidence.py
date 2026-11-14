"""Offline EEVEE evidence, never a claim of live gameplay / renderer equivalence."""
import bpy,math,json,os
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent.parent
REPO=Path(os.environ.get('KNOTZ_REPO',P.parents[2]))
E=P/'evidence';E.mkdir(exist_ok=True)
def B(v):return Vector((v[0],-v[2],v[1]))
bpy.ops.wm.open_mainfile(filepath=str(P/'heavy-turret.blend'))
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.threads_mode='FIXED';s.render.threads=4
s.render.resolution_x=800;s.render.resolution_y=600;s.render.resolution_percentage=100
if hasattr(s,'eevee') and hasattr(s.eevee,'taa_render_samples'):s.eevee.taa_render_samples=16
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.view_settings.view_transform='AgX'
s.world.use_nodes=True;s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.10,.13,.17,1);s.world.node_tree.nodes.get('Background').inputs[1].default_value=.45
stage=bpy.data.collections.new('EVIDENCE_ONLY');s.collection.children.link(stage)
def move(o):
 for c in list(o.users_collection):c.objects.unlink(o)
 stage.objects.link(o)
def mat(name,col):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);return m
deckmat=mat('evidence-neutral-deck',(.055,.075,.085))
bpy.ops.mesh.primitive_plane_add(size=400,location=(0,0,-.025));deck=bpy.context.object;move(deck);deck.data.materials.append(deckmat)
def light(name,kind,pos,target,power,color=(1,1,1),size=8):
 d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color
 if kind=='AREA':d.shape='DISK';d.size=size
 o=bpy.data.objects.new(name,d);stage.objects.link(o);o.location=B(pos);o.rotation_euler=(B(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
key=light('common-key','AREA',(-12,22,-12),(0,0,0),2600,(1,.91,.79),10)
fill=light('common-fill','AREA',(14,12,8),(0,0,0),1900,(.68,.83,1),11)
camdata=bpy.data.cameras.new('evidence-camera');cam=bpy.data.objects.new('evidence-camera',camdata);stage.objects.link(cam);s.camera=cam
def camera(pos,target,span=14,fov=None,aspect=4/3):
 cam.location=B(pos);cam.rotation_euler=(B(target)-cam.location).to_track_quat('-Z','Y').to_euler()
 camdata.type='ORTHO' if fov is None else 'PERSP';camdata.ortho_scale=span
 if fov is not None:camdata.sensor_fit='HORIZONTAL';camdata.lens=camdata.sensor_width/(2*math.tan(math.radians(fov)/2)*aspect)
 camdata.clip_start=.1;camdata.clip_end=1500
root=bpy.data.objects['heavy-turret'];turn=bpy.data.objects['turntable'];guns=[bpy.data.objects['barrel-L'],bpy.data.objects['barrel-R']];eye=bpy.data.objects['eye']
def pose(yaw=0,pitch=0,charge=1):
 turn.rotation_euler.z=yaw
 for g in guns:g.rotation_euler.x=pitch
 eye.scale=(charge,)*3;bpy.context.view_layer.update()
records=[]
def render(name,label,extra=None):
 s.render.filepath=str(E/(name+'.png'));bpy.ops.render.render(write_still=True)
 records.append({'file':name+'.png','label':label,'cameraGame':[cam.location.x,cam.location.z,-cam.location.y],'projection':camdata.type,'orthoHorizontalSpan':camdata.ortho_scale if camdata.type=='ORTHO' else None,'resolution':[s.render.resolution_x,s.render.resolution_y],**(extra or {})})
pose();camera((-16,24,-30),(0,0,0));render('01-common-rest','COMMON NEUTRAL / rest / world scale 1 / horizontal ortho span14')
camera((9,6.5,13),(0,1.2,0),10);render('02-front-rest','FRONT / rest / twin recessed muzzles and charge eye')
camera((-11,5.5,1),(0,1.3,0),10);render('03-side-rest','SIDE / exact pivot at Y1.725 / low deck clearance')
camera((0,18,.001),(0,0,0),10);render('04-top-rest','TOP / open twin weapon corridor')
camera((-16,24,-30),(0,0,0));pose(math.pi,-math.radians(32),1.45);render('05-action-charge','ACTION + MAX CHARGE / yaw180 pitch32 / eye scale1.45')
pose(math.pi,-math.pi/2,1.45);camera((9,6.5,13),(0,1.3,0),10);render('06-full-elevation','FULL SOURCE ELEVATION / pitch90 / no aim clamp / no detach')
pose(math.pi/2,-math.radians(5),1);camera((-16,24,-30),(0,0,0));render('07-lateral-low','LATERAL LOW / yaw90 pitch5 / seated axles')
pose(0,math.pi/2,1);camera((9,6.5,13),(0,1.3,0),10);render('07b-rooftop-down','ROOFTOP DOWN / source pitch-90 / open annular well / no clamp')
pose(math.pi,-math.radians(32),1.45)
flash=bpy.data.objects['hit-flash-prototype'];flash.hide_render=False;flash.hide_viewport=False;flash.users_collection[0].hide_render=False
# Evidence overlay is white emission here, additive runtime material documented separately.
render('08-hit-flash','HIT FLASH / diagnostic solid-white prototype / runtime additive shell deferred',{'limitation':'EEVEE diagnostic uses emission, runtime uses transparent additive opacity flash*.75'})
flash.hide_render=True;flash.users_collection[0].hide_render=True;pose()

# Shipped standard turret and player are reference-only imports, never exported or copied into new asset.
def reference(filename,prefix):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models'/filename));objs=list(set(bpy.data.objects)-before)
 tops=[o for o in objs if o.parent not in objs];holder=bpy.data.objects.new(prefix+'-evidence-holder',None);stage.objects.link(holder)
 for o in tops:o.parent=holder
 return holder,objs
ref,refobjs=reference('turret.glb','shipped-standard');ref.hide_render=True
for o in refobjs:o.hide_render=True
root.hide_render=True
for o in root.children_recursive:o.hide_render=True
ref.hide_render=False
for o in refobjs:o.hide_render=False
camera((-16,24,-30),(0,0,0));render('09-shipped-standard-common','SHIPPED STANDARD TURRET / identical common camera span14 / no normalization')
root.hide_render=False
for o in root.children_recursive:o.hide_render=False
ref.location=B((5,0,0));root.location=B((-5,0,0))
camera((-16,24,-30),(0,0,0),18);render('10-shared-scale-pair','SHARED WORLD SCALE / heavy at X-5; shipped standard at X+5 / span18')
player,playerobjs=reference('player.glb','shipped-player')
key.hide_render=True;fill.hide_render=True
sunDir=Vector((-.5,.7,-.52)).normalized()
sun=light('source-dusk-key','SUN',(sunDir.x*140,sunDir.y*140+90,sunDir.z*140),(0,0,24),3.4,(1,.503,.238))
rim=light('source-cyan-rim','SUN',(-sunDir.x*120,70,-sunDir.z*120),(0,0,0),1.1,(.078,.687,1))
s.world.node_tree.nodes.get('Background').inputs[0].default_value=(.102,.159,.301,1);s.world.node_tree.nodes.get('Background').inputs[1].default_value=.65
s.render.resolution_x=960;s.render.resolution_y=540
source=json.loads((P/'verification/source-samples.json').read_text())
for c in source['cameras']:
 if c['distance']==90:continue
 player.location=B(c['player']);pose(math.pi,-math.atan2(11,c['distance']),1.45)
 camera(c['position'],c['target'],span=2*c['halfHeight']*c['aspect'],fov=None if c['classic'] else c['fov'],aspect=c['aspect'])
 render(f"game-{c['mode']}-{c['distance']}",f"OFFLINE GAMEPLAY RECONSTRUCTION / {c['mode'].upper()} / target distance {c['distance']} / heavy X-5, shipped standard X+5",{'sourceCamera':c,'worldScale':1,'lighting':'Sky.js dusk keyDir, sun position/target, rim position/target/colors; hemisphere approximated by world ambient. No PMREM, postFX, fog, particles, renderer, or live gameplay.'})
(E/'render-index.json').write_text(json.dumps(records,indent=2))
print('EVIDENCE_RENDERED',len(records))
