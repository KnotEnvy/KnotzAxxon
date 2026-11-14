import bpy
import json
import math
import os
from pathlib import Path
import sys
from mathutils import Vector

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd()))
OUT = Path(__file__).resolve().parents[1]
WORK = OUT.parent / 'work'
DATA = json.loads((OUT / 'asset/bunker-geometry.json').read_text())
PROBES = json.loads((OUT / 'evidence/camera-lighting-probes.json').read_text())
RAW = WORK / 'renders'
RAW.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
SCENE = bpy.context.scene
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.threads_mode = 'FIXED'
SCENE.render.threads = 4
SCENE.eevee.taa_render_samples = 24
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.image_settings.color_mode = 'RGBA'
SCENE.render.image_settings.color_depth = '8'
SCENE.view_settings.view_transform = 'AgX'
SCENE.view_settings.look = 'AgX - Medium High Contrast'
SCENE.view_settings.exposure = .6


def linear(channel):
    return channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4


def rgb(value):
    return tuple(linear(((value >> shift) & 255) / 255) for shift in [16, 8, 0])


def material(name, color, metalness, roughness, emission=None):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    result.use_backface_culling = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metalness
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        shader.inputs['Emission Color'].default_value = (*emission, 1)
        shader.inputs['Emission Strength'].default_value = 1.1
    return result


MATERIALS = {
    'hull': material('BUNKER_Hull', tuple(linear(value) for value in [.27,.30,.35]), .36, 1),
    'dark': material('BUNKER_Dark', rgb(0x3a4a5e), .5, .46),
    'neon': material('BUNKER_Status', (0,0,0), 0, .6, rgb(0xffb43a)),
}
for key in ['hull','dark']:
    shader = MATERIALS[key].node_tree.nodes.get('Principled BSDF')
    colors = MATERIALS[key].node_tree.nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'Color'
    MATERIALS[key].node_tree.links.new(colors.outputs['Color'],shader.inputs['Base Color'])
ASSET = bpy.data.collections.new('BUNKER_EDITABLE_PARTS')
SCENE.collection.children.link(ASSET)


def game_to_blender(point):
    return (point[0], -point[2], point[1])


def make_mesh(name, bucket, positions, collection, purpose=''):
    vertices = [game_to_blender(positions[index:index+3]) for index in range(0,len(positions),3)]
    faces = [(index,index+1,index+2) for index in range(0,len(vertices),3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    collection.objects.link(obj)
    mesh.materials.append(MATERIALS[bucket])
    colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    tint = rgb(0x8a929c) if bucket == 'hull' else (1,1,1)
    base = tuple(linear(value) for value in [.27,.30,.35]) if bucket == 'hull' else rgb(0x3a4a5e) if bucket == 'dark' else (1,1,1)
    source = DATA['buckets'][bucket]['positions']
    minimum = min(source[1::3])
    span = max(source[1::3]) - minimum
    for face in mesh.polygons:
        normal = face.normal
        for loop_index in face.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            shade = .58 + .42 * math.sqrt(max(0, vertex.co.z-minimum)/span) if span > .6 else 1
            if normal.z > .7:
                shade *= 1.1
            colors.data[loop_index].color = tuple(min(1, channel * base[index] * shade) for index,channel in enumerate(tint)) + (1,)
    mesh.color_attributes.active_color = colors
    obj['runtime_bucket'] = bucket
    obj['purpose'] = purpose
    obj['game_origin'] = 'ground center, Y-up; no collider or gameplay identity'
    return obj


for entry in DATA['parts']:
    make_mesh(entry['name'],entry['bucket'],entry['positions'],ASSET,entry['purpose'])
SCENE['asset'] = 'Fortress._bunker passive scenery INITIAL'
SCENE['status'] = 'pending_deferred_opus_review'
SCENE['formal_review_rounds'] = 0
SCENE['formal_fix_rounds'] = 0
SCENE['runtime_materials'] = 'hull -> existing mapped hull; dark -> unmapped darkMetal; neon -> shared neonVertex'
SCENE['preview_limitations'] = 'Average hull-map proxy only; no new asset texture; runtime source shader is authoritative.'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'asset/fortress-bunker.blend'))
EXPORT = bpy.data.collections.new('TEMP_EXPORT_BUCKETS')
SCENE.collection.children.link(EXPORT)
bpy.ops.object.select_all(action='DESELECT')
for key in ['hull','dark','neon']:
    obj = make_mesh(f'bunker-{key}',key,DATA['buckets'][key]['positions'],EXPORT)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=str(OUT/'asset/fortress-bunker.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_animations=False,export_cameras=False,export_lights=False)
for obj in list(EXPORT.objects):
    bpy.data.objects.remove(obj,do_unlink=True)
bpy.data.collections.remove(EXPORT)
metadata={'blender':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'engine':'BLENDER_EEVEE','threads':4,'samples':24,'viewTransform':'AgX','look':SCENE.view_settings.look,'exposure':.6,'geometryTriangles':DATA['triangles'],'editableParts':len(DATA['parts']),'exportedBuckets':3,'textureCount':0,'packedBlend':'Self-contained mesh/material data; no external images exist to pack.','materialPreview':'Average source hull-map RGB proxy [.27,.30,.35] sRGB multiplied by source tint and baked height AO; dark exact source base color; source mapped PBR and shared unlit shader remain authoritative.'}
(OUT/'evidence/build-settings.json').write_text(json.dumps(metadata,indent=2))
if os.environ.get('BUNKER_EXPORT_ONLY') == '1':
    print('BUNKER_EXPORT_ONLY_PASS',DATA['triangles'])
    sys.exit(0)


def simple_object(name, dimensions, location, mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=game_to_blender(location))
    obj=bpy.context.object
    obj.name=name
    obj.dimensions=(dimensions[0],dimensions[2],dimensions[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    return obj


def aim(obj, target):
    obj.rotation_euler=(Vector(game_to_blender(target))-obj.location).to_track_quat('-Z','Y').to_euler()


world=bpy.data.worlds.new('Offline approximate source sky')
world.use_nodes=True
SCENE.world=world
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.20,.29,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
camera_data=bpy.data.cameras.new('Evidence camera')
camera_data.clip_start=.1
camera_data.clip_end=1000
CAMERA=bpy.data.objects.new('Evidence camera',camera_data)
SCENE.collection.objects.link(CAMERA)
SCENE.camera=CAMERA
LIGHTS=[]


def light(name, kind, color, energy, location, target=(0,1,0), size=8):
    data=bpy.data.lights.new(name,kind)
    data.energy=energy
    data.color=color
    if kind=='AREA':
        data.shape='DISK'
        data.size=size
    obj=bpy.data.objects.new(name,data)
    SCENE.collection.objects.link(obj)
    obj.location=game_to_blender(location)
    aim(obj,target)
    LIGHTS.append(obj)
    return obj


def clear_lights():
    for obj in LIGHTS:
        bpy.data.objects.remove(obj,do_unlink=True)
    LIGHTS.clear()


def studio_lights():
    clear_lights()
    light('Neutral studio key','AREA',(1,.91,.80),1800,(-6,10,-8),size=9)
    light('Cool broad studio fill','AREA',(.58,.74,1),1100,(7,6,4),size=8)
    light('Roof studio fill','AREA',(.78,.88,1),700,(-2,10,8),size=7)


def render(name,title,footer,width=720,height=480):
    SCENE.render.resolution_x=width
    SCENE.render.resolution_y=height
    SCENE.render.filepath=str(RAW/f'{name}.png')
    bpy.ops.render.render(write_still=True)
    return {'path':str(RAW/f'{name}.png'),'title':title,'footer':footer,'width':width,'height':height}


def studio_camera(position,target,scale):
    camera_data.type='ORTHO'
    camera_data.ortho_scale=scale
    CAMERA.location=game_to_blender(position)
    aim(CAMERA,target)


floor_mat=material('Evidence floor proxy',rgb(0x182333),.22,.85)
FLOOR=simple_object('Studio floor proxy',(200,.12,250),(0,-.09,20),floor_mat)
studio_lights()
views=[]
for name,position,target,scale in [('front-quarter',(-11,9,-13),(0,1.4,0),13.8),('rear-quarter',(11,8,13),(0,1.4,0),13.8),('corridor-profile',(-15,5,0),(0,1.5,0),12.5),('roof-plan',(0,18,-.01),(0,0,0),12.5)]:
    studio_camera(position,target,scale)
    views.append(render(name,f'BUNKER INITIAL | {name} | 468 tri','OFFLINE EEVEE studio / average mapped-hull proxy / not live'))
closeups=[]
for name,position,target,scale in [('recess-and-sealed-panel',(-7,4,-8),(-1,1.85,-1.1),8.0),('roof-plant-and-joints',(-5,9,-4),(0,3.2,0),7.0)]:
    studio_camera(position,target,scale)
    closeups.append(render(name,f'STRUCTURE | {name}','REAL inset surfaces / static louvers / no mechanics / EEVEE'))
cue=[]
status_shader=MATERIALS['neon'].node_tree.nodes['Principled BSDF']
for theme,hex_value in [('citadel',0xffb43a),('gauntlet',0xff6a3a)]:
    status_shader.inputs['Emission Color'].default_value=(*rgb(hex_value),1)
    for name,gain in [('MAX',1),('MIN',.1)]:
        status_shader.inputs['Emission Strength'].default_value=1.1*gain
        studio_camera((-9,4,-4),(-1,1.9,0),9.7)
        cue.append(render(f'cue-{theme}-{name}',f'{theme.upper()} #{hex_value:06X} | BREATHE {name} {gain:.1f}',f'OFFLINE EEVEE / source gain1.1 * {gain:.1f} / rate0.3 / no bloom'))
for obj in ASSET.objects:
    obj.location+=Vector(game_to_blender((19.5,0,28)))
DECK=[]
DECK.append(simple_object('WORLD proxy deck',(54,.20,160),(0,-.13,38),floor_mat))
lane_mat=material('Evidence lane inset',rgb(0x0d1520),.1,.9)
DECK.append(simple_object('WORLD proxy center channel',(7,.025,155),(0,.005,38),lane_mat))
line_mat=material('Evidence lane limit',rgb(0x7b828a),.05,.8)
for side in [-1,1]:
    DECK.append(simple_object('WORLD lane x16 reference',(.10,.035,150),(side*16,.015,35),line_mat))
for position in range(-24,100,12):
    DECK.append(simple_object('WORLD scale cross seam',(52,.012,.035),(0,.022,position),lane_mat))
FLOOR.hide_render=True
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/player.glb'))
PLAYER=list(bpy.context.selected_objects)
for obj in PLAYER:
    if obj.parent is None or obj.parent not in PLAYER:
        obj.location+=Vector(game_to_blender((8,6,0)))
world_paths=[]
for theme,hex_value,gain,sky_name in [('citadel',0xffb43a,1,'ember'),('gauntlet',0xff6a3a,.1,'void')]:
    clear_lights()
    preset=PROBES['sky'][theme]
    direction=preset.get('keyDir',preset['sunDir'])
    light('Source key approximation','SUN',rgb(preset['sunColor']),preset['sunIntensity'],[value*100 for value in direction],target=(0,0,0))
    light('Source cool rim approximation','SUN',rgb(0x4fd8ff),1.1,[-direction[0]*140,60,-direction[2]*140],target=(0,0,28))
    world.node_tree.nodes['Background'].inputs['Color'].default_value=(*rgb(preset['ambient']),1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value=preset['ambientIntensity']*.42
    status_shader.inputs['Emission Color'].default_value=(*rgb(hex_value),1)
    status_shader.inputs['Emission Strength'].default_value=1.1*gain
    for rig in PROBES['cameras']:
        camera_data.type='ORTHO' if rig['classic'] else 'PERSP'
        camera_data.sensor_fit='HORIZONTAL'
        if rig['classic']:
            camera_data.ortho_scale=2*rig['halfHeight']*rig['aspect']
        else:
            camera_data.angle=2*math.atan(math.tan(math.radians(rig['fov'])/2)*rig['aspect'])
        CAMERA.location=game_to_blender(rig['position'])
        aim(CAMERA,rig['look'])
        world_paths.append(render(f'world-{theme}-{rig["mode"]}',f'WORLD 1:1 {rig["mode"].upper()} | {theme} cue {gain:.1f}',f'Ship x8,y6 / bunker x19.5,z28 / {sky_name} EEVEE approximation',900,600))
settings={'method':'Offline native Linux EEVEE software rendering. Not live game screenshots, GPU/FPS evidence, source shader acceptance or final art approval.','cameras':PROBES['cameras'],'lighting':'Citadel source ember / gauntlet source void directional color, direction and intensity; ambient converted to uniform world approximation, not actual hemisphere or PMREM.','limitations':['Source procedural hull maps are an average RGB proxy; original world-projected UVs are exercised only by the actual Batch CPU tests.','EEVEE AgX +0.6 is not Three ACES exposure1.02. Fog, PMREM, rim shader, post-FX/bloom and live occlusion are not reproduced.','World deck/channel/seams/lane boundary are labeled geometry test doubles; only player uses actual shipped GLB at unscaled dimensions.','Fixed common WORLD-space placement and original source rig matrices; world panels are not object-fitted cameras.','Cue extrema use exact source hues and analytic BREATHE gains .1 and1 with gain1.1; offline emission response is approximate.']}
settings['clipping']={'offline':[.1,1000],'sourceHighQuality':[.35,1344]}
settings['limitations'][3]='Fixed common WORLD-space placement with source CameraRig pose, FOV and orthographic extent. Offline clipping .1/1000 differs from source high-quality .35/1344; no object-fitted cameras or full projection-matrix identity claim.'
(OUT/'evidence/render-settings.json').write_text(json.dumps(settings,indent=2))
(WORK/'render-index.json').write_text(json.dumps({'multiview':views,'structure':closeups,'warm-cue':cue,'world-scale':world_paths},indent=2))
print('BUNKER_BUILD_RENDER_PASS',DATA['triangles'])
