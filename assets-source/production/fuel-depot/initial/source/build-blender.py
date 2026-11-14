import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
DATA = json.loads((ROOT/'asset/fuel-depot.template.json').read_text())
FIXTURE = json.loads((ROOT/'evidence/world-fixture.json').read_text())
CONVERT = lambda point: (point[0],-point[2],point[1])


def linear(hex_color):
    channels = [(hex_color>>shift & 255)/255 for shift in (16,8,0)]
    return tuple(value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4 for value in channels)


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def materials():
    result = {}
    for key,base,metal,rough in [('hull',0xffffff,.36,1),('dark',0x3a4a5e,.5,.46)]:
        material = bpy.data.materials.new(f'shared.{key}.runtime-proxy')
        material.use_nodes = True
        material.use_backface_culling = True
        material.diffuse_color = (*linear(base),1)
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*linear(base),1)
        shader.inputs['Metallic'].default_value = metal
        shader.inputs['Roughness'].default_value = rough
        attribute = material.node_tree.nodes.new('ShaderNodeVertexColor')
        attribute.layer_name = 'Color'
        multiply = material.node_tree.nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = (*linear(base),1)
        material.node_tree.links.new(attribute.outputs['Color'],multiply.inputs[1])
        material.node_tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
        material['runtimeBinding'] = 'materials.hull (mapped; maps absent offline)' if key=='hull' else 'materials.darkMetal (unmapped)'
        result[key] = material
    return result


def mesh_object(name,positions,normals,colors,material,collection=None):
    points = [CONVERT(positions[index:index+3]) for index in range(0,len(positions),3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points,[],[(index,index+1,index+2) for index in range(0,len(points),3)])
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if normals:
        mesh.normals_split_custom_set([CONVERT(normals[index:index+3]) for index in range(0,len(normals),3)])
    attribute = mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for index,loop in enumerate(mesh.loops):
        offset = loop.vertex_index*3
        attribute.data[index].color = (*colors[offset:offset+3],1)
    mesh.color_attributes.active_color = attribute
    obj = bpy.data.objects.new(name,mesh)
    (collection or bpy.context.scene.collection).objects.link(obj)
    obj.data.materials.append(material)
    return obj


def camera(eye,target,ortho=None,fov=52):
    data = bpy.data.cameras.new('Offline camera')
    obj = bpy.data.objects.new('Offline camera',data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = CONVERT(eye)
    obj.rotation_euler = (Vector(CONVERT(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    if ortho:
        data.type='ORTHO'
        data.ortho_scale=ortho
    else:
        data.type='PERSP'
        data.sensor_fit='VERTICAL'
        data.sensor_height=24
        data.lens=12/math.tan(math.radians(fov)/2)
    data.clip_start=.1
    data.clip_end=2000
    bpy.context.scene.camera=obj
    return obj


def lamp(name,kind,location,color,power,size=5,target=(0,1.5,0)):
    data=bpy.data.lights.new(name,kind)
    data.energy=power
    data.color=linear(color)
    if kind=='AREA':
        data.shape='DISK'
        data.size=size
    if kind=='SUN':
        data.angle=math.radians(4)
    obj=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=CONVERT(location)
    obj.rotation_euler=(Vector(CONVERT(target))-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj


def settings(world=False):
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.render.threads_mode='FIXED'
    scene.render.threads=4
    scene.render.resolution_x=1280 if world else 1120
    scene.render.resolution_y=720 if world else 840
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.render.image_settings.color_mode='RGB'
    scene.render.image_settings.color_depth='8'
    scene.world=bpy.data.worlds.new('Offline ambient approximation')
    scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get('Background')
    background.inputs[0].default_value=(*linear(0x5a6f95 if world else 0x6f829b),1)
    background.inputs[1].default_value=.65 if world else .48
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.8
    scene.render.use_file_extension=True
    if hasattr(scene,'eevee'):
        scene.eevee.taa_render_samples=32


def plane():
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
    obj=bpy.context.object
    obj.name='OFFLINE_GROUND_NOT_EXPORTED'
    material=bpy.data.materials.new('Offline ground')
    material.diffuse_color=(*linear(0x202b3a),1)
    material.use_nodes=True
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=material.diffuse_color
    material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.92
    obj.data.materials.append(material)


def render(name):
    bpy.context.scene.render.filepath=str(ROOT/'evidence'/name)
    bpy.ops.render.render(write_still=True)


reset()
settings()
MATS=materials()
collection=bpy.data.collections.new('DEPOT_SOURCE_EDITABLE')
bpy.context.scene.collection.children.link(collection)
for bucket in DATA['buckets']:
    for part in bucket['parts']:
        begin=part['firstVertex']*3
        end=begin+part['vertexCount']*3
        obj=mesh_object(part['name'],bucket['position'][begin:end],bucket['normal'][begin:end],bucket['color'][begin:end],MATS[bucket['key']],collection)
        obj['runtimeBucket']=bucket['key']
        obj['triangleCount']=part['vertexCount']//3
        obj['sourceEnvelope']='X +/-2.92, Y 0..3.1, Z +/-4; no mechanics'
bpy.ops.object.select_all(action='DESELECT')
exported=[]
export_materials=[]
for bucket in DATA['buckets']:
    material=bpy.data.materials.new('runtime.'+bucket['key'])
    material.use_nodes=True
    material.use_backface_culling=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*linear(0xffffff if bucket['key']=='hull' else 0x3a4a5e),1)
    shader.inputs['Metallic'].default_value=.36 if bucket['key']=='hull' else .5
    shader.inputs['Roughness'].default_value=1 if bucket['key']=='hull' else .46
    export_materials.append(material)
    obj=mesh_object('fuel-depot.'+bucket['key'],bucket['position'],bucket['normal'],bucket['color'],material)
    obj.select_set(True)
    exported.append(obj)
bpy.context.view_layer.objects.active=exported[0]
bpy.ops.export_scene.gltf(filepath=str(ROOT/'asset/fortress-fuel-depot.glb'),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_normals=True,export_texcoords=False,export_vertex_color='NAME',export_vertex_color_name='Color',export_all_vertex_colors=False,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
for obj in exported:
    bpy.data.objects.remove(obj,do_unlink=True)
for material in export_materials:
    bpy.data.materials.remove(material)
plane()
lamp('Studio broad key','AREA',(-6,10,-7),0xf8d7ba,1600,8)
lamp('Studio cool fill','AREA',(6,6,-2),0xadc9e9,950,6)
lamp('Studio back contour','AREA',(0,7,6),0xd7e4ee,1900,5)
camera((-10,7,-12),(0,1.3,0),12)
text=bpy.data.texts.new('READ_ME_RUNTIME_BOUNDARY')
text.write('INITIAL. pending_deferred_opus_review; 0 formal reviews/fix rounds. Editable named parts are authoring only. GLB has two bucket meshes; runtime uses two cached templates into actual Batch, no scene roots. Source hull maps not reproduced by Blender. EEVEE previews are offline approximations. Source footprint and inherited player-radius overlap are unchanged. No collider/HP/target/emitter/mechanics.\n')
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'asset/fortress-fuel-depot.blend'))
if '--export-only' in sys.argv:
    print('FUEL_DEPOT_EXPORT_ONLY_COMPLETE')
    raise SystemExit(0)
render('craft-three-quarter.png')
for name,eye,target,scale in [
    ('craft-opposite.png',(10,6,12),(0,1.4,0),12),
    ('craft-endcaps.png',(0,2.7,-14),(0,1.35,-2.1),7.1),
    ('craft-top.png',(0,16,-.001),(0,0,0),11),
    ('close-endcap-strap-saddle.png',(-5,3.4,-7.8),(-1.6,1.25,-2.95),5.4),
    ('close-manifold-valve-joints.png',(-4,6,-6),(0,2.5,-.8),5.6),
]:
    camera(eye,target,scale)
    render(name)

render_log=[]
for rig_name,rig in FIXTURE['cameras'].items():
    for variant in ('source','candidate'):
        reset()
        settings(True)
        mats=materials()
        for bucket in FIXTURE[variant]:
            mesh_object(variant+'.'+bucket['key'],bucket['pos'],bucket['nrm'],bucket['col'],mats[bucket['key']])
        for bucket in FIXTURE['deck']:
            if bucket['key'] not in ('deck','grate','hull','dark'):
                continue
            material=mats['dark'] if bucket['key']=='dark' else mats['hull']
            mesh_object('source-deck.'+bucket['key'],bucket['pos'],bucket['nrm'],bucket['col'],material)
        plane()
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'))
        imported=[obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            if obj.parent not in imported:
                obj.location+=Vector(CONVERT(FIXTURE['player']['position']))
        target=(0,0,FIXTURE['placement']['z'])
        lamp('Source dusk key approximation','SUN',(-60,84,FIXTURE['placement']['z']-62.4),0xffbc86,3.4,target=target)
        lamp('Source cyan rim approximation','SUN',(60,70,FIXTURE['placement']['z']+62.4),0x4fd8ff,1.1,target=target)
        ortho=2*rig['halfHeight']*rig['aspect'] if rig['classic'] else None
        camera(rig['eye'],rig['target'],ortho,rig['fov'])
        render(f'world-{rig_name}-{variant}.png')
        render_log.append(dict(rig=rig_name,variant=variant,player=FIXTURE['player'],placement=FIXTURE['placement'],camera=rig,limitations='Offline EEVEE/source-lighting approximation. Actual source Batch colors/normals; no canvas hull/normal/roughness maps, Three rim shader, sky/fog/postFX, dynamic scene, HUD or runtime GPU. Raw unchanged player GLB at source scale 1.'))
(ROOT/'evidence/render-settings.json').write_text(json.dumps(dict(blender=bpy.app.version_string,buildHash=bpy.app.build_hash.decode(),engine='BLENDER_EEVEE',threads=4,softwareMesa=True,views=render_log,studio=['craft-three-quarter.png','craft-opposite.png','craft-endcaps.png','craft-top.png','close-endcap-strap-saddle.png','close-manifold-valve-joints.png']),indent=2)+'\n')
print('FUEL_DEPOT_BUILD_AND_RENDER_COMPLETE')
