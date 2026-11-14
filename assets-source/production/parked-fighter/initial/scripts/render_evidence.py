import bpy
import json
import math
import pathlib
import sys
import os
import hashlib
import numpy as np
from mathutils import Vector, Matrix, Euler

ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO=pathlib.Path(os.environ['PARKED_FIGHTER_REPO']) if 'PARKED_FIGHTER_REPO' in os.environ else next(parent for parent in [ROOT,*ROOT.parents] if (parent/'src/entities/Enemies.js').exists())
OUT=ROOT/'evidence'
OUT.mkdir(exist_ok=True)
contract=json.loads((ROOT/'source/source_contract.json').read_text())
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
quick='--quick' in args
batch=next((argument.split('=',1)[1].split(',') for argument in args if argument.startswith('--batch=')),None)
asset_sha=hashlib.sha256((ROOT/'build/parked-fighter.glb').read_bytes()).hexdigest()
progress_file=OUT/'completed_renders.json'
progress=json.loads(progress_file.read_text()) if progress_file.exists() else {}
if progress.get('assetSHA256')!=asset_sha:
    progress={'assetSHA256':asset_sha,'files':{}}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'build/parked-fighter.blend'))
scene=bpy.context.scene
bpy.data.collections['STUDIO_not_exported'].hide_render=True
scene.render.engine='BLENDER_EEVEE'
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.eevee.taa_render_samples=16
scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Evidence_world')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.20,.26,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
runtime=bpy.data.collections['RUNTIME_export_only']
root=bpy.data.objects['parked_fighter']
engine=bpy.data.objects['engine']
beacon=bpy.data.objects['beacon']
evidence=bpy.data.collections.new('EVIDENCE_only_not_exported')
scene.collection.children.link(evidence)

def game(point):
    return Vector((point[0],-point[2],point[1]))

def flat_material(name,color,metal=0,rough=.65,emission=0):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=rough
    shader.inputs['Metallic'].default_value=metal
    if emission:
        shader.inputs['Emission Color'].default_value=(*color,1)
        shader.inputs['Emission Strength'].default_value=emission
    return mat

floor_mat=flat_material('Evidence_deck',(.065,.081,.100),.25,.65)
paint_mat=flat_material('Evidence_deck_paint',(.38,.42,.38))
caption_mat=flat_material('Evidence_caption',(.8,.9,1),0,.6,2)

def box(name,position,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=game(position))
    obj=bpy.context.object
    obj.name=name
    obj.scale=(size[0],size[2],size[1])
    obj.data.materials.append(material)
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    evidence.objects.link(obj)
    return obj

deck=box('Evidence_deck',(0,-.055,0),(260,.1,400),floor_mat)
markings=[]
for horizontal in [-4,4]:
    markings.append(box('Hardstand_line',(horizontal,.006,0),(.07,.012,8),paint_mat))
for longitudinal in [-4,4]:
    markings.append(box('Hardstand_end',(0,.006,longitudinal),(8,.012,.07),paint_mat))
lights=[]

def light(name,position,target,power,color,kind='AREA',size=9):
    data=bpy.data.lights.new(name,kind)
    data.energy=power
    data.color=color
    if kind=='AREA':
        data.shape='DISK'
        data.size=size
    else:
        data.angle=math.radians(12)
    obj=bpy.data.objects.new(name,data)
    evidence.objects.link(obj)
    obj.location=game(position)
    obj.rotation_euler=(game(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    lights.append(obj)
    return obj

key=light('Neutral_key',(-12,22,-12),(0,0,0),2600,(1,.88,.72),size=10)
fill=light('Neutral_fill',(14,12,8),(0,0,0),1900,(.64,.79,1),size=12)
rim=light('Neutral_rim',(1,10,10),(0,1,0),1100,(1,.65,.4),size=8)
camera_data=bpy.data.cameras.new('Evidence_camera')
camera=bpy.data.objects.new('Evidence_camera',camera_data)
evidence.objects.link(camera)
scene.camera=camera
caption_data=bpy.data.curves.new('Evidence_caption','FONT')
caption=bpy.data.objects.new('Evidence_caption',caption_data)
evidence.objects.link(caption)
caption.data.materials.append(caption_mat)
caption.parent=camera
caption.data.align_x='LEFT'
caption.data.align_y='TOP_BASELINE'

def configure_camera(eye,target,span=14,projection='ORTHO',fov=58,width=640,height=480):
    scene.render.resolution_x=width
    scene.render.resolution_y=height
    camera.location=game(eye)
    camera.rotation_euler=(game(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type=projection
    camera.data.clip_start=.05
    camera.data.clip_end=500
    camera.data.lens_unit='FOV'
    camera.data.sensor_fit='VERTICAL'
    camera.data.angle_y=math.radians(fov)
    camera.data.ortho_scale=span
    projection_matrix=camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=width,y=height)
    if projection=='ORTHO':
        assert abs(2/projection_matrix[1][1]-span)<.0001
    else:
        assert abs(math.degrees(2*math.atan(1/projection_matrix[1][1]))-fov)<.0001
    if projection=='ORTHO':
        caption.location=(-span*width/height/2+max(.25,span*.018),span/2-max(.28,span*.040),-2)
        caption.data.size=span*(.028 if span>=40 else .020)
    else:
        half=2*math.tan(math.radians(fov)/2)
        caption.location=(-half*width/height+.04,half-.045,-2)
        caption.data.size=half*.040

renders=[]
def render(name,label,eye=(-16,24,-30),target=(0,0,0),span=14,projection='ORTHO',fov=58,width=640,height=480):
    renders.append({'file':name+'.png','label':label,'eye_game':eye,'target_game':target,'verticalSpan':span if projection=='ORTHO' else None,'fovVertical':fov if projection=='PERSP' else None,'projection':projection,'resolution':[width,height],'beaconVisible':not beacon.hide_render,'engineUniformScale':engine.scale.x})
    if batch and name not in batch:
        return
    for child in beacon.children_recursive:
        child.hide_render=beacon.hide_render
    if not name.startswith(('15_','16_')):
        rim.hide_render=name in {'01_rest_common','13_source_common'}
    focus=Vector((root.location.x,root.location.z,-root.location.y)) if name.startswith('12_') else Vector((0,0,0))
    for lamp,base,target_offset in [(key,(-12,22,-12),(0,0,0)),(fill,(14,12,8),(0,0,0)),(rim,(1,10,10),(0,1,0))]:
        lamp.location=game(Vector(base)+focus)
        lamp.rotation_euler=(game(Vector(target_offset)+focus)-lamp.location).to_track_quat('-Z','Y').to_euler()
    configure_camera(eye,target,span,projection,fov,width,height)
    caption.data.body=label
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    progress['files'][name+'.png']=hashlib.sha256((OUT/(name+'.png')).read_bytes()).hexdigest()
    progress_file.write_text(json.dumps(progress,indent=2))

def reset():
    root.location=(0,0,0)
    root.rotation_euler=(0,0,0)
    engine.scale=(.3,)*3
    beacon.hide_render=False

def set_state(state,world_position=False):
    reset()
    root.location=game(state['pos']) if world_position else Vector((0,0,0))
    game_rotation=Matrix.Rotation(state['pitch'],4,'X')@Matrix.Rotation(state['yaw'],4,'Y')
    conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    root.rotation_euler=(conversion@game_rotation@conversion.inverted()).to_euler()
    engine.scale=(state['engineScale'],)*3
    beacon.hide_render=not state['beaconVisible']

def hide_collection(collection,hidden):
    collection.hide_render=hidden

def reference(file,name,offset=(0,0,0),decorative=False):
    collection=bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    data=json.loads(file.read_text())
    materials=[flat_material(name+'_armor',(.31,.13,.079),.48,.42),flat_material(name+'_metal',(.085,.13,.19),.56,.38),bpy.data.materials['PF_EngineAmber'],bpy.data.materials['PF_BeaconRed']]
    if decorative:
        materials[0]=flat_material('Decorative_airfield_olive',(.20,.22,.19),.45,.5)
    for piece in data['geometry']:
        mesh=bpy.data.meshes.new(piece['name'])
        indices=piece['triangles']
        mesh.from_pydata([game([point[axis]+offset[axis] for axis in range(3)]) for point in piece['vertices']],[],[indices[index:index+3] for index in range(0,len(indices),3)])
        mesh.update()
        obj=bpy.data.objects.new(piece['name'],mesh)
        collection.objects.link(obj)
        obj.data.materials.append(materials[piece['material']])
    return collection

reset()
render('01_rest_common','PARKED FIGHTER / INITIAL | common neutral | world units')
if quick:
    (OUT/'render_settings.json').write_text(json.dumps({'renders':renders},indent=2))
    sys.exit(0)
render('02_front_threequarter','INITIAL / fitted nose, canopy and gear',eye=(-10,7,-13),target=(0,1,0),span=7.8)
render('03_aft_threequarter','INITIAL / aft turbine, attached gear',eye=(10,7,13),target=(0,1,0),span=7.8)
render('04_top','INITIAL / top / -Z nose at top',eye=(0,18,.001),target=(0,0,0),span=8)
render('05_side','INITIAL / starboard / deck datum Y=0',eye=(14,4,0),target=(0,1,0),span=6.2)
render('06_front','INITIAL / front / grounded gear clearance',eye=(0,3,-16),target=(0,1,0),span=6.2)
render('07_aft_idle','NONSCRAMBLE IDLE / source scale 0.3',eye=(8,6,12),target=(0,1,0),span=8)
engine.scale=(.995,)*3
render('08_aft_pulse_min','SCRAMBLE CHARGE / min pulse 0.995',eye=(8,6,12),target=(0,1,0),span=8)
engine.scale=(1.045,)*3
render('09_aft_pulse_max','SCRAMBLE CHARGE / max pulse 1.045',eye=(8,6,12),target=(0,1,0),span=8)
beacon.hide_render=True
render('10_beacon_off','BEACON OFF / source visibility toggle')
reset()
for entry in [contract['yawExtremes']['min'],contract['yawExtremes']['max']]:
    state={'pos':[0,0,0],'pitch':0,'yaw':entry['yaw'],'engineScale':.3,'beaconVisible':True}
    set_state(state)
    render('11_yaw_'+str(entry['seed']),f"SEEDED YAW / seed {entry['seed']} / {entry['yaw']:.6f} rad")
for label in ['lift_transition','full_launch','altitude_cap','passing_outside_window']:
    state=next(item for item in contract['samples'] if item['label']==label)
    set_state(state,True)
    position=state['pos']
    render('12_'+label,f"SOURCE ACTION / {label.replace('_',' ')} / Y={position[1]:.2f}",eye=(position[0]-16,position[1]+24,position[2]-30),target=position,span=14)
reset()
baseline=reference(ROOT/'source/procedural_reference.json','PROCEDURAL_REFERENCE_only')
hide_collection(runtime,True)
render('13_source_common','PROCEDURAL BASELINE / same common camera / no normalization')
hide_collection(baseline,True)
hide_collection(runtime,False)
decorative=reference(ROOT/'source/decorative_reference.json','DECORATIVE_REFERENCE_only',(8,0,0),True)
render('14_airfield_coherence','NEW TARGET + decorative source parts / shared world scale',target=(4,0,0),eye=(-12,24,-30),span=14)
hide_collection(decorative,True)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'))
shipped=[obj for obj in bpy.data.objects if obj not in before]
player_root=bpy.data.objects.new('SHIPPED_PLAYER_reference_only',None)
evidence.objects.link(player_root)
for obj in shipped:
    if obj.parent not in shipped:
        obj.parent=player_root
player_root.location=game((0,6,-28))
hide_collection(baseline,False)
for obj in baseline.objects:
    obj.location.x+=7
root.location.x=-5
for marking in markings:
    marking.hide_render=True
for horizontal in [-16,16,-27,27]:
    box('Offline_corridor_boundary',(horizontal,.012,30),(.09,.025,220),paint_mat)
for longitudinal in range(-60,150,12):
    box('Offline_centerline',(0,.01,longitudinal),(.1,.02,4),paint_mat)
key.hide_render=True
fill.hide_render=True
rim.hide_render=True
direction=Vector((-.5,.7,-.52)).normalized()
focus=Vector((0,6,-28))
sun_position=(focus.x+direction.x*140,direction.y*140+90,focus.z+direction.z*140)
light('Dusk_source_key',sun_position,(focus.x,0,focus.z+24),3.4,(1,.50,.24),'SUN')
light('Dusk_source_rim',(focus.x-direction.x*120,70,focus.z-direction.z*120),(focus.x,0,focus.z),1.1,(.078,.687,1),'SUN')
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.102,.159,.301,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=1.9
for rig in contract['rigs']:
    for distance,label in [(28,'near'),(70,'far')]:
        shift=28-distance
        eye=[rig['eye'][0],rig['eye'][1],rig['eye'][2]+shift]
        target=[rig['target'][0],rig['target'][1],rig['target'][2]+shift]
        player_root.location=game((0,6,-distance))
        render('15_game_'+rig['mode']+'_'+label,'OFFLINE '+rig['mode'].upper()+' '+label.upper()+' / new X=-5, source X=+7 / shipped player',eye=eye,target=target,span=80,projection='ORTHO' if rig['classic'] else 'PERSP',fov=rig['fov'],width=960,height=540)
        if label=='near':
            render('16_small_'+rig['mode'],'OFFLINE SMALL '+rig['mode'].upper()+' / shared world scale',eye=eye,target=target,span=80,projection='ORTHO' if rig['classic'] else 'PERSP',fov=rig['fov'],width=480,height=270)
for obj in shipped:
    obj.hide_render=True
hide_collection(baseline,True)
reset()
settings={'render_engine':'BLENDER_EEVEE','samples':16,'render_threads':4,'software_raster_threads':4,'view_transform':'AgX','neutral':{'camera':[-16,24,-30],'target':[0,0,0],'vertical_span':14,'key':[-12,22,-12],'fill':[14,12,8]},'offline':'Actual source CameraRig snap at player Y=6, zero velocity/boost/shake and 16:9. Classic full vertical span 80; perspective exact source vertical FOV. Dusk sun/rim source positions/colors/intensities reconstructed; Blender world approximates Three HemisphereLight, no production shader/postprocessing/fog. Not live gameplay proof. Shipped player GLB unchanged scale=1. Procedural comparison at X=7; new at X=-5. Near dz=28; far dz=70.','renders':renders}
(OUT/'render_settings.json').write_text(json.dumps(settings,indent=2))
settings['boundGLBSHA256']=asset_sha
settings['boundBlendSHA256']=hashlib.sha256((ROOT/'build/parked-fighter.blend').read_bytes()).hexdigest()
settings['neutral']['commonExtraRim']=False
settings['detailAdditionalRim']={'position':[1,10,10],'power':1100,'color_linear':[1,.65,.4],'notUsedInCommonOrGameplay':True}
settings['actionRig']='Neutral camera/key/fill/detail-rim translate with sampled world root position; deck remains fixed; no scale normalization.'
settings['sourcePoseMatrix']='Explicit Three XYZ pitch/yaw matrix Rx @ Ry converted to Blender basis; native motion bounds checked independently.'
(OUT/'render_settings.json').write_text(json.dumps(settings,indent=2))
if not all(entry['file'] in progress['files'] for entry in renders):
    print('BATCH_COMPLETE',len(progress['files']),'of',len(renders),'PNGs for final asset',asset_sha)
    sys.exit(0)

tiles=[]
for entry in renders:
    image=bpy.data.images.load(str(OUT/entry['file']),check_existing=False)
    width,height=image.size
    pixels=np.asarray(image.pixels[:],dtype=np.float32).reshape(height,width,4)
    scale=min(400/width,300/height)
    resized=pixels[np.minimum((np.arange(int(height*scale))/scale).astype(int),height-1)[:,None],np.minimum((np.arange(int(width*scale))/scale).astype(int),width-1)[None,:]]
    tile=np.zeros((300,400,4),dtype=np.float32)
    tile[:,:,3]=1
    start_y=(300-resized.shape[0])//2
    start_x=(400-resized.shape[1])//2
    tile[start_y:start_y+resized.shape[0],start_x:start_x+resized.shape[1]]=resized
    tiles.append(tile)
columns=4
rows=math.ceil(len(tiles)/columns)
canvas=np.zeros((rows*300,columns*400,4),dtype=np.float32)
canvas[:,:,3]=1
for index,tile in enumerate(tiles):
    row=rows-1-index//columns
    column=index%columns
    canvas[row*300:(row+1)*300,column*400:(column+1)*400]=tile
sheet=bpy.data.images.new('Evidence_contact_sheet',width=columns*400,height=rows*300,alpha=True,float_buffer=False)
sheet.pixels.foreach_set(canvas.ravel())
sheet.filepath_raw=str(OUT/'contact-sheet.png')
sheet.file_format='PNG'
sheet.save()
print('EVIDENCE_COMPLETE',len(renders),'individual PNGs plus contact sheet')
