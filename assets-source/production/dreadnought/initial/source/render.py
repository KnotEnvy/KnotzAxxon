import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[2]
EVIDENCE=ROOT/'evidence'
EVIDENCE.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'asset/dreadnought.blend'))
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.threads_mode='FIXED'
scene.render.threads=4
scene.eevee.taa_render_samples=32
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.5
scene.world.use_nodes=True
background=scene.world.node_tree.nodes.get('Background')
background.inputs['Color'].default_value=(.055,.085,.14,1)
background.inputs['Strength'].default_value=.6
asset_objects=[obj for obj in scene.objects if obj.type=='MESH']
palette_original={obj.name:[tuple(value.color) for value in obj.data.color_attributes['Palette'].data] for obj in asset_objects}


def convert(point):
    return Vector((point[0],-point[2],point[1]))


def point_at(obj,target):
    obj.rotation_euler=(convert(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def sun(name,color,energy,location,target):
    light=bpy.data.lights.new(name,'SUN')
    light.color=color
    light.energy=energy
    light.angle=math.radians(8)
    obj=bpy.data.objects.new(name,light)
    scene.collection.objects.link(obj)
    obj.location=convert(location)
    point_at(obj,target)
    return obj


key=sun('OFFLINE_SOURCE_DEEPSPACE_KEY_APPROX',(0.74,.85,1.0),2.9,(63,195,3706),(0,0,3824))
rim=sun('OFFLINE_SOURCE_CYAN_RIM_APPROX',(.17,.67,1),1.1,(-54,70,3860),(0,0,3800))
camera_data=bpy.data.cameras.new('EvidenceCamera')
camera=bpy.data.objects.new('EvidenceCamera',camera_data)
scene.collection.objects.link(camera)
scene.camera=camera
camera.data.clip_start=.35
camera.data.clip_end=1800

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'))
player_objects=list(bpy.context.selected_objects)
player_root=bpy.data.objects.new('SHIPPED_PLAYER__SCALE_1',None)
scene.collection.objects.link(player_root)
for obj in player_objects:
    if obj.parent not in player_objects:
        obj.parent=player_root
player_meshes=[obj for obj in player_objects if obj.type=='MESH']
player_root.scale=(1,1,1)


def light_gain(anim,time):
    mode,rate,phase=anim
    cycle=(time*rate+phase)%1
    def smooth(lower,upper,value):
        ratio=max(0,min(1,(value-lower)/(upper-lower)))
        return ratio*ratio*(3-2*ratio)
    if mode<.5:
        return 1
    if mode<1.5:
        return .08+1.45*smooth(0,.03,cycle)*(1-smooth(.12,.2,cycle))
    if mode<2.5:
        return .18+1.35*cycle**6
    if mode<3.5:
        return .55+.45*math.sin(cycle*6.2832)
    noise=math.sin(math.floor(time*rate*7+phase*91)*12.9898)*43758.5453
    return 1 if noise-math.floor(noise)>.22 else .25


def animate(time):
    for obj in asset_objects:
        if obj['runtime_bucket']!='neon':
            continue
        original=palette_original[obj.name]
        colors=obj.data.color_attributes['Palette'].data
        for index,entry in enumerate(obj.data.attributes['_ANIM'].data):
            gain=light_gain(entry.vector,time)
            colors[index].color=tuple(original[index][channel]*gain for channel in range(3))+(1,)


records=[]
ONLY=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None


def render(name,eye,target,ortho=None,player=(0,9,3540),fov=58,time=0,game=False,altitude=None):
    if ONLY and not name.startswith(ONLY):
        return
    for obj in asset_objects:
        obj.hide_render=False
        if game:
            first=math.floor((player[2]-90)/96)
            last=math.floor((player[2]+560)/96)
            obj.hide_render=not(first<=obj['game_chunk']<=last)
    for obj in player_meshes:
        obj.hide_render=False
    player_root.location=convert(player)
    animate(time)
    camera.location=convert(eye)
    point_at(camera,target)
    if ortho is not None:
        camera.data.type='ORTHO'
        camera.data.ortho_scale=ortho
    else:
        camera.data.type='PERSP'
        camera.data.lens_unit='FOV'
        vertical=math.radians(fov)
        aspect=1440/900
        camera.data.angle=2*math.atan(math.tan(vertical/2)*aspect)
        camera.data.sensor_fit='HORIZONTAL'
    scene.render.resolution_x=1440
    scene.render.resolution_y=900
    scene.render.resolution_percentage=100
    scene.render.filepath=str(EVIDENCE/(name+'.png'))
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    records.append({'file':name+'.png','eye_game':eye,'target_game':target,'projection':'orthographic' if ortho else 'perspective',
                    'ortho_vertical_span':ortho/(1440/900) if ortho else None,'fov_vertical':None if ortho else fov,
                    'player_game':player,'player_scale':[1,1,1],'time_seconds':time,'source_rig':game,
                    'visible_sections':[obj.name for obj in asset_objects if not obj.hide_render],
                    'limitations':'Offline EEVEE. Source deepspace key/rim direction/intensity approximated in Blender; hemisphere represented by world fill. No live game, source textures, shader compile, sky, fog, bloom, targets, asteroids, HUD or collision test.'})


render('01_overview_isometric',(-360,300,3480),(6,-15,3810),ortho=990,player=(0,9,3760))
render('02_bow_structure',(-74,35,3310),(6,-23,3470),ortho=230,player=(0,9,3440))
render('03_open_breach_ribs',(-68,22,3514),(4,-24,3572),ortho=119,player=(0,9,3567))
render('04_far_beam_ruined_bridge',(-67,39,3970),(24,-1,4019),ortho=140,player=(0,9,4000))
render('05_stern_recessed_engines',(-61,11,4321),(6,-26,4200),ortho=157,player=(0,9,4210),time=0)
render('06_engine_cue_t125',(-61,11,4321),(6,-26,4200),ortho=157,player=(0,9,4210),time=1.25)
for name,yaw,distance,height,fov in [('Classic',45,64,45.255,52),('Modern',20,29,14,58),('Chase',6,24,9.5,66)]:
    player=(0,9,3540)
    across=-math.sin(math.radians(yaw))*distance
    offset=-math.cos(math.radians(yaw))*distance
    if name=='Classic':
        eye=(across,9+height,player[2]+28+offset)
        target=(0,9,player[2]+28)
        render('07_game_Classic',eye,target,ortho=80*(1440/900),player=player,game=True)
    else:
        eye=(across,player[1]+height,player[2]+offset)
        target=(0,player[1]+1.2,player[2]+16)
        render('08_game_Modern' if name=='Modern' else '09_game_Chase',eye,target,player=player,fov=fov,game=True)
player=(0,1.3,3947)
render('10_low_lane_Modern',(-math.sin(math.radians(20))*29,player[1]+14,player[2]-math.cos(math.radians(20))*29),(0,player[1]+1.2,player[2]+16),player=player,fov=58,game=True)
player=(0,25,3540)
render('11_high_lane_Chase',(-math.sin(math.radians(6))*24,player[1]+9.5,player[2]-math.cos(math.radians(6))*24),(0,player[1]+1.2,player[2]+16),player=player,fov=66,game=True)
render('12_destroyed_gun_ring',(-28,7,3708),(0,-13,3732),ortho=44,player=(0,9,3732))
report_path=ROOT/'checks/render-rigs.json'
if ONLY and report_path.exists():
    records=json.loads(report_path.read_text())['renders']+records
report_path.write_text(json.dumps({'renders':records,'resolution':[1440,900],'renderer':'BLENDER_EEVEE','samples':32,
    'camera_contract':'src/game/CameraRig.js snap at zero boost, velocity, kick, shake and extraDist. Classic vertical halfheight40 at aspect1.6; anchored Y9/lead28. Modern/Chase use exact vertical FOV and game-space offsets.',
    'no_normalization':True,'all_shipped_player_import_root_scales':[1,1,1]},indent=2)+'\n')
