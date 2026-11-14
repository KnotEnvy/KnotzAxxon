import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
EVIDENCE = ROOT/'evidence'
OUTPUTS = []
MATERIALS = {}
LABEL = None


def convert(position):
    return Vector((position[0],-position[2],position[1]))


def setup():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    if hasattr(scene.eevee,'taa_render_samples'):
        scene.eevee.taa_render_samples = 16
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('CS_EvidenceWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.025,.038,.060,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
    key = bpy.data.lights.new('Offline_sun','SUN')
    key.energy = 2.6
    sun = bpy.data.objects.new('Offline_sun',key)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(28),math.radians(-22),math.radians(-32))
    fill = bpy.data.lights.new('Offline_fill','AREA')
    fill.energy = 2800
    fill.shape = 'DISK'
    fill.size = 14
    lamp = bpy.data.objects.new('Offline_fill',fill)
    bpy.context.collection.objects.link(lamp)
    lamp.location = (-8,10,15)
    lamp.rotation_euler = (Vector((0,0,5))-lamp.location).to_track_quat('-Z','Y').to_euler()


def camera(eye,focus,mode='ORTHO',half_height=7,fov=58):
    global LABEL
    if bpy.context.scene.camera:
        previous = bpy.context.scene.camera
        if LABEL:
            bpy.data.objects.remove(LABEL,do_unlink=True)
            LABEL = None
        bpy.data.objects.remove(previous,do_unlink=True)
    data = bpy.data.cameras.new('Offline_camera')
    obj = bpy.data.objects.new('Offline_camera',data)
    bpy.context.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    obj.location = convert(eye)
    obj.rotation_euler = (convert(focus)-obj.location).to_track_quat('-Z','Y').to_euler()
    data.type = mode
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 32
    data.lens = 16 / math.tan(math.radians(fov)/2)
    data.ortho_scale = half_height * 2
    data.clip_start = .05
    data.clip_end = 1500
    bpy.context.view_layer.update()
    return obj


def label(text):
    global LABEL
    if LABEL:
        bpy.data.objects.remove(LABEL,do_unlink=True)
    camera_obj = bpy.context.scene.camera
    scene = bpy.context.scene
    aspect = scene.render.resolution_x / scene.render.resolution_y
    half_height = camera_obj.data.ortho_scale/2 if camera_obj.data.type == 'ORTHO' else math.tan(camera_obj.data.angle_y/2)
    font = bpy.data.curves.new('Evidence_caption','FONT')
    font.body = text
    font.size = half_height*.041
    font.space_line = 1.1
    obj = bpy.data.objects.new('Evidence_caption',font)
    bpy.context.collection.objects.link(obj)
    obj.parent = camera_obj
    obj.location = (-half_height*aspect*.965,half_height*.91,-1)
    material = bpy.data.materials.get('Evidence_text')
    if material is None:
        material = bpy.data.materials.new('Evidence_text')
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (.8,.88,1,1)
        shader.inputs['Emission Color'].default_value = (.8,.88,1,1)
        shader.inputs['Emission Strength'].default_value = 1
    obj.data.materials.append(material)
    LABEL = obj


def render(name,caption):
    label(caption+'\nOFFLINE EEVEE - material proxies; no live WebGL / FPS / acceptance')
    bpy.context.scene.render.filepath = str(EVIDENCE/name)
    bpy.ops.render.render(write_still=True)
    OUTPUTS.append(name)


def proxy_material(bucket):
    if bucket in MATERIALS:
        return MATERIALS[bucket]
    material = bpy.data.materials.new('Offline_proxy_'+bucket)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    colors = nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'Color'
    if bucket in ('dark','darkMetal','spinMetal'):
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = (.0423,.0685,.1119,1)
        material.node_tree.links.new(colors.outputs[0],multiply.inputs[1])
        material.node_tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
    else:
        material.node_tree.links.new(colors.outputs[0],shader.inputs['Base Color'])
    shader.inputs['Metallic'].default_value = .36
    shader.inputs['Roughness'].default_value = .66
    if bucket in ('neon','neonVertex'):
        material.node_tree.links.new(colors.outputs[0],shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 1
        shader.inputs['Metallic'].default_value = 0
    MATERIALS[bucket] = material
    return material


def mesh_from_batch(name,record,heat_gain=1):
    positions = record['p']
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([convert(positions[index:index+3]) for index in range(0,len(positions),3)],[],
                     [(index,index+1,index+2) for index in range(0,len(positions)//3,3)])
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(proxy_material(record['bucket']))
    colors = mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    gain = heat_gain if record['bucket'] in ('neon','neonVertex') else 1
    for index,loop in enumerate(mesh.loops):
        color = record['c'][loop.vertex_index*3:loop.vertex_index*3+3]
        colors.data[index].color = (*[value*gain for value in color],1)
    return obj


def studio():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/'cooling-stack.blend'))
    setup()
    scene = bpy.context.scene
    scene.render.resolution_x,scene.render.resolution_y = 1000,900
    views = [
        ('structure-front.png',(-9,10,-13),(0,4.5,0),6.6,'FRONT / inlet depth, separated fins, fitted service hatch | h=9'),
        ('structure-rear.png',(9,10,13),(0,4.5,0),6.6,'REAR / repeated fitted shell and corner spines | h=9'),
        ('structure-side.png',(13,8,-1),(0,4.5,0),6.6,'SIDE / continuous tapered body, fins and cap | h=9'),
        ('structure-top.png',(7,18,-8),(0,7.3,0),4.7,'TOP / original 2.7m amber surface and fitted open cap | h=9'),
        ('structure-close.png',(-4.5,6.0,-8),(0,4.0,-1),3.25,'CLOSE / real recessed inlet, cooling-fin separation and hatch | h=9')]
    for name,eye,focus,half_height,caption in views:
        camera(eye,focus,half_height=half_height)
        render(name,caption)


def world_views():
    global LABEL
    bpy.ops.wm.read_factory_settings(use_empty=True)
    LABEL = None
    MATERIALS.clear()
    setup()
    scene = bpy.context.scene
    scene.render.resolution_x,scene.render.resolution_y = 960,540
    world = json.loads((EVIDENCE/'source-world.json').read_text())
    fixture = json.loads((EVIDENCE/'render-fixture.json').read_text())
    proof = json.loads((EVIDENCE/'streaming-proof.json').read_text())
    for index,record in enumerate(world['meshes']):
        mesh_from_batch('Actual_source_chunk_'+str(index),record)
    for stack_index,stack in enumerate(world['originalStacks'][1:]):
        for index,record in enumerate(stack):
            mesh_from_batch('Unchanged_other_cooling_'+str(stack_index)+'_'+str(index),record)
    existing = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models/player.glb'))
    imported = [obj for obj in bpy.data.objects if obj not in existing]
    for obj in imported:
        if obj.parent not in imported:
            obj.location += convert(proof['cameraFixture']['player'])
    active = []
    camera_checks = []
    for rig in proof['cameraFixture']['sourceSnapCameras']:
        current = camera(rig['eye'],rig['lookAt'],mode='ORTHO' if rig['orthographic'] else 'PERSP',half_height=rig['halfHeight'] or 7,fov=rig['fov'])
        local_min,local_max = [math.inf,math.inf],[-math.inf,-math.inf]
        for height in ('7','11'):
            for record in fixture['endpoints'][height]['prototype']:
                for offset in range(0,len(record['p']),3):
                    projected = world_to_camera_view(scene,current,convert(record['p'][offset:offset+3]))
                    for axis,value in enumerate((projected.x*2-1,projected.y*2-1)):
                        local_min[axis] = min(local_min[axis],value)
                        local_max[axis] = max(local_max[axis],value)
        error = max(abs(actual-expected) for actual,expected in zip(local_min+local_max,rig['ndcMin']+rig['ndcMax']))
        assert error < .00001, (rig['mode'],error,local_min,local_max,rig['ndcMin'],rig['ndcMax'])
        camera_checks.append({'mode':rig['mode'],'maximumNDCErrorVersusActualSourceCameraRigSnap':error})
        for height in ('7','11'):
            for heat,gain in [('min',.1),('max',1.0)]:
                for variant in ('source','prototype'):
                    if '--prototype-only' in sys.argv and variant == 'source':
                        continue
                    for obj in active:
                        bpy.data.objects.remove(obj,do_unlink=True)
                    active = [mesh_from_batch('Selected_stack_'+variant+'_'+str(index),record,gain) for index,record in enumerate(fixture['endpoints'][height][variant])]
                    name = f'world-{rig["mode"]}-h{height}-heat-{heat}-{variant}.png'
                    render(name,f'{rig["mode"].upper()} / source snap camera / {variant.upper()} / h={height} / heat={heat}\n'
                           'Source placement unchanged; shipped player scale 1; other cooling stack unchanged')
    return camera_checks


studio()
checks = world_views()
report = {'engine':'BLENDER_EEVEE','blender':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),
          'renderThreads':4,'softwareRasterizerThreads':4,'samples':16,'viewTransform':'AgX','worldResolution':[960,540],
          'structureResolution':[1000,900],'PNGs':sorted(path.name for path in EVIDENCE.glob('*.png')),'cameraProjectionChecks':checks,
          'sourcePlayer':'public/models/player.glb, original transforms, world scale1, player source reset altitude9',
          'fixture':'Actual Batch source chunk seed42/chunk0 in synthetic reactor sector, no feature obstacles. Source world and all source prop placements unchanged.',
          'endpointPolicy':'Closed source height endpoints7/11; controlled geometry stubs only for endpoint evidence; seeded behavior proven separately.',
          'heatPolicy':'Static samples of shared source BREATHE clock extrema gain0.1/1.0; vertex gain1.2 preserved. No glTF animation, flame, fan or duplicate steam.',
          'limitations':['Offline EEVEE evidence, not live WebGL or FPS or final acceptance.','Shared Three procedural texture maps, postprocessing, bloom, steam particles and fog are not reproduced. Proxy material response and original Batch linear colors are used.','The synthetic reactor chunk omits gameplay feature records; camera snap evidence is finite, no motion/boost/shake/portrait sweep.']}
(EVIDENCE/'render-settings.json').write_text(json.dumps(report,indent=2)+'\n')
print('RENDER_EVIDENCE_COMPLETE',json.dumps(report))
