import bpy
import json
import math
import pathlib
import sys
from mathutils import Vector

HOME = pathlib.Path(__file__).resolve().parents[1]
ROOT = HOME
while not (ROOT / 'public' / 'models' / 'player.glb').exists() and ROOT.parent != ROOT:
    ROOT = ROOT.parent
OUT = HOME / 'evidence' / 'renders'
OUT.mkdir(parents=True,exist_ok=True)
INDEX = json.loads((HOME/'evidence'/'render-settings.json').read_text()) if (HOME/'evidence'/'render-settings.json').exists() else []


def linear(value):
    return value/12.92 if value<=.04045 else ((value+.055)/1.055)**2.4


def color(value):
    return tuple(linear(((value>>shift)&255)/255) for shift in (16,8,0))


def game(point):
    return Vector((point[0],-point[2],point[1]))


def material(bucket):
    existing = bpy.data.materials.get('Evidence_'+bucket)
    if existing:
        return existing
    mat = bpy.data.materials.new('Evidence_'+bucket)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value=.86 if bucket=='hull' else .72
    shader.inputs['Metallic'].default_value=.36 if bucket=='hull' else .22
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name='Color'
    if bucket=='neon':
        mat.node_tree.links.new(attr.outputs['Color'],shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value=1
    base=0x3a4a5e if bucket=='dark' else 0xffffff
    multiply=mat.node_tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type='MULTIPLY'
    multiply.inputs[0].default_value=1
    multiply.inputs[2].default_value=(*color(base),1)
    mat.node_tree.links.new(attr.outputs['Color'],multiply.inputs[1])
    mat.node_tree.links.new(multiply.outputs[0],shader.inputs['Base Color'])
    return mat


def geometry(buckets,offset=(0,0,0),prefix=''):
    objects=[]
    for key,bucket in buckets.items():
        positions=bucket['positions']
        vertices=[game(tuple(positions[index+axis]+offset[axis] for axis in range(3))) for index in range(0,len(positions),3)]
        mesh=bpy.data.meshes.new(prefix+key)
        mesh.from_pydata(vertices,[],[(index,index+1,index+2) for index in range(0,len(vertices),3)])
        mesh.update()
        mesh.materials.append(material(key))
        colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        source=bucket['colors']
        for index,loop in enumerate(mesh.loops):
            colors.data[index].color=(*source[loop.vertex_index*3:loop.vertex_index*3+3],1)
        normals=bucket['normals']
        mesh.normals_split_custom_set_from_vertices([game(normals[index:index+3]) for index in range(0,len(normals),3)])
        obj=bpy.data.objects.new(prefix+key,mesh)
        bpy.context.scene.collection.objects.link(obj)
        objects.append(obj)
    return objects


def setup(width=800,height=600):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene
    scene.render.engine='BLENDER_EEVEE'
    scene.eevee.taa_render_samples=24
    scene.render.resolution_x=width
    scene.render.resolution_y=height
    scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGB'
    scene.view_settings.view_transform='AgX'
    scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Offline_neutral_blue_ambient')
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(*color(0x718399),1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    sun_data=bpy.data.lights.new('Shared_warm_key','SUN')
    sun_data.energy=3.4
    sun_data.color=color(0xffbc86)
    sun_data.angle=math.radians(10)
    sun=bpy.data.objects.new('Shared_warm_key',sun_data)
    scene.collection.objects.link(sun)
    direction=game((-.5,.7,-.52)).normalized()
    sun.rotation_euler=direction.to_track_quat('Z','Y').to_euler()
    rim_data=bpy.data.lights.new('Shared_cool_rim','SUN')
    rim_data.energy=.85
    rim_data.color=color(0x86b9d0)
    rim_data.angle=math.radians(12)
    rim=bpy.data.objects.new('Shared_cool_rim',rim_data)
    scene.collection.objects.link(rim)
    rim.rotation_euler=game((.5,.5,.52)).to_track_quat('Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Evidence_camera')
    camera=bpy.data.objects.new('Evidence_camera',camera_data)
    scene.collection.objects.link(camera)
    scene.camera=camera
    return scene


def camera(eye,target,orthographic=False,scale=9.5,fov=58):
    cam=bpy.context.scene.camera
    cam.location=game(eye)
    cam.rotation_euler=(game(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO' if orthographic else 'PERSP'
    cam.data.ortho_scale=scale
    cam.data.lens_unit='FOV'
    cam.data.sensor_fit='VERTICAL'
    cam.data.angle=math.radians(fov)
    cam.data.clip_start=.1
    cam.data.clip_end=1000


def ground():
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003))
    obj=bpy.context.object
    obj.name='Evidence_only_ground'
    mat=bpy.data.materials.new('Evidence_only_ground')
    mat.diffuse_color=(*color(0x454d57),1)
    obj.data.materials.append(mat)


def render(name,meta):
    scene=bpy.context.scene
    if (OUT/(name+'.png')).exists() and any(item['file']==name+'.png' for item in INDEX):
        return
    projection=scene.camera.calc_matrix_camera(bpy.context.evaluated_depsgraph_get(),x=scene.render.resolution_x,y=scene.render.resolution_y)
    if meta.get('sourceCameraRig'):
        rig=meta['sourceCameraRig']
        expected_y=1/rig['halfHeight'] if rig['orthographic'] else 1/math.tan(math.radians(rig['fov'])/2)
        assert abs(projection[1][1]-expected_y)<1e-5,(name,projection[1][1],expected_y)
        assert abs(projection[0][0]-expected_y/(rig['width']/rig['height']))<1e-5
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    INDEX.append({'file':name+'.png','engine':scene.render.engine,'samples':scene.eevee.taa_render_samples,'width':scene.render.resolution_x,'height':scene.render.resolution_y,'cameraGame':{'eye':[scene.camera.location.x,scene.camera.location.z,-scene.camera.location.y],'ortho':scene.camera.data.type=='ORTHO','orthoVerticalSpan':scene.camera.data.ortho_scale,'verticalFovDegrees':math.degrees(scene.camera.data.angle),'projectionDiagonal':[projection[0][0],projection[1][1]]},'lighting':'Identical warm sun 3.4/cool rim .85/blue ambient .65, AgX; reconstruction, not production renderer','offlineReconstruction':True,**meta})
    (HOME/'evidence'/'render-settings.json').write_text(json.dumps(INDEX,indent=2)+'\n')


source=json.loads((HOME/'evidence'/'source-geometry.json').read_text())['buckets']
candidate=json.loads((HOME/'evidence'/'placement-candidate-yaw0.json').read_text())
setup()
bpy.ops.import_scene.gltf(filepath=str(HOME/'asset'/'covered-fighter.glb'))
ground()
camera((-7,5,-8),(0,.9,-.35),True,9.4)
render('clean-glb-import-proof',{'kind':'Factory-clean final GLB import beauty','variant':'candidate GLB without runtime reconstruction','limitations':'Authored GLB material factors; production runtime uses existing bucket materials and per-stamp AO.'})
views=[('front-quarter',(-7,5,-8),(0,.9,-.35),9.4),('rear-quarter',(7,4.6,7),(0,.95,-.3),9.4),('top',(0,13,-.1),(0,0,-.1),9.1),('profile',(-10,2.6,0),(0,1,-.45),8.8),('nose',(0,2.7,-11),(0,.9,-.5),8.6),('rear',(0,2.7,10),(0,.9,-.2),8.6)]
for name,eye,target,scale in views:
    setup()
    geometry(candidate,(-21,0,-50),'Candidate_')
    ground()
    camera(eye,target,True,scale)
    render('candidate-'+name,{'kind':'multiview','variant':'candidate'})
for name,eye,target,scale in [('canvas-and-tiedowns',(-3.7,3.4,-3.4),(-.4,1,-.2),4.5),('attached-gear',(-3.2,1.1,-2.7),(-.4,.52,-.1),3.0)]:
    setup(960,720)
    geometry(candidate,(-21,0,-50),'Candidate_')
    ground()
    camera(eye,target,True,scale)
    render('structure-'+name,{'kind':'structural closeup','variant':'candidate'})
for yaw in [-.25,0,.25]:
    for variant in ['source','candidate']:
        setup(800,600)
        data=json.loads((HOME/'evidence'/f'placement-{variant}-yaw{yaw if yaw else 0}.json').read_text())
        geometry(data,(-21,0,-50),variant+'_')
        ground()
        camera((-7,5,-8),(0,.85,-.3),True,9.5)
        render(f'yaw-{yaw:+.2f}-{variant}',{'kind':'full yaw endpoints and zero; continuous envelope proved separately','variant':variant,'yaw':yaw})

cameras=json.loads((HOME/'evidence'/'camera-evidence.json').read_text())['cameras']
cameras+=json.loads((HOME/'evidence'/'camera-evidence-centerlane.json').read_text())['cameras']
for rig in cameras:
    for variant in ['source','candidate']:
        setup(1280,720)
        data=json.loads((HOME/'evidence'/f'world-{variant}-seed42-chunk0.json').read_text())
        for index,buckets in enumerate(data['merges']):
            geometry(buckets,prefix=f'Actual_Batch_{index}_')
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT/'public'/'models'/'player.glb'))
        imported=[obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            if obj.parent is None:
                obj.location+=game(rig['player'])
        camera(rig['eye'],rig['lookAt'],rig['orthographic'],rig['halfHeight']*2,rig['fov'])
        suffix='-centerlane' if rig.get('state')=='centerlane' else ''
        render(f'world-{rig["mode"]}-{variant}{suffix}',{'kind':'world-scale source/candidate pair','variant':variant,'sourceChunk':'Actual _buildChunk seed42 chunk0; all merged geometry reconstructed','sourceCameraRig':rig,'playerReference':'public/models/player.glb at scale 1','limitations':'No procedural production textures, sky shader, fog, postprocessing, dynamic enemies, HUD, motion or live GPU acceptance.'})

setup(1200,700)
for index,name in enumerate(['player','sentinel','turret','radar','silo','fuel']):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public'/'models'/(name+'.glb')))
    imported=[obj for obj in bpy.data.objects if obj not in before]
    points=[obj.matrix_world@vertex.co for obj in imported if obj.type=='MESH' for vertex in obj.data.vertices]
    bounds_min=[min(point[axis] for point in points) for axis in range(3)]
    bounds_max=[max(point[axis] for point in points) for axis in range(3)]
    size=max(bounds_max[axis]-bounds_min[axis] for axis in range(3))
    scale=4.8/size
    anchor=bpy.data.objects.new('Reference_normalization_'+name,None)
    bpy.context.scene.collection.objects.link(anchor)
    for obj in imported:
        if obj.parent is None:
            obj.parent=anchor
    anchor.scale=(scale,)*3
    anchor.location=game(((index%3-1)*5.7,0,(index//3)*5.3))
    anchor.location.z-=bounds_min[2]*scale
ground()
camera((-10,15,-15),(0,1.5,2.7),True,18)
render('shipped-selected-craft-reference-board',{'kind':'Selected shipped reference inspection only','normalizedForBoard':True,'notWorldScale':True,'references':['player','sentinel','turret','radar','silo','fuel'],'reuse':'No imported reference geometry reused in candidate; references shown only here and player in common world evidence.'})
