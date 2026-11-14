"""New drone tooling. Author in GAME coordinates; explicit proper rotation to Blender."""
import bpy, math, json, os, sys
from pathlib import Path
from mathutils import Vector, Matrix

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
REPO = HERE.parents[3]
PNG = OUT / 'evidence/png'
REPORT = OUT / 'evidence/reports'
C = Matrix(((1,0,0),(0,0,-1),(0,1,0))) # game(x,y,z) -> blender(x,-z,y)
def B(p): return C @ Vector(p)
def G(p): return C.transposed() @ Vector(p)
def reset(): bpy.ops.wm.read_factory_settings(use_empty=True)
def material(name, hexcolor, metal=.0, rough=.45, emission=0):
    def lin(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    color=tuple(lin(((hexcolor>>s)&255)/255) for s in (16,8,0))
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
def mesh(name, verts, faces, mat, parent=None):
    me=bpy.data.meshes.new(name);me.from_pydata([B(v) for v in verts],[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat);ob.parent=parent
    # Recalculate so mirrored, clipped and machined parts export with correct winding.
    bpy.context.view_layer.objects.active=ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');ob.select_set(False)
    return ob
def empty(name,parent=None,position=(0,0,0)):
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.location=B(position);return ob
def join(obs,name,parent,pivot=(0,0,0)):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:ob.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]
    if len(obs)>1:bpy.ops.object.join()
    ob=obs[0];ob.name=name
    bpy.context.scene.cursor.location=B(pivot);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');ob.parent=parent
    ob.select_set(False);return ob
def setup_render(w=640,h=480):
    sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.eevee.taa_render_samples=20
    sc.render.resolution_x=w;sc.render.resolution_y=h;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
    sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
    sc.render.image_settings.color_mode='RGB';sc.render.threads_mode='FIXED';sc.render.threads=4
    sc.world=bpy.data.worlds.new('Neutral dark studio');sc.world.use_nodes=True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.027,.036,.052,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.55
    return sc
def point_camera(pos,target=(0,0,0),span=8,kind='ORTHO',fov=58):
    ob=bpy.data.objects.get('EvidenceCamera')
    if not ob:
        ca=bpy.data.cameras.new('EvidenceCamera');ob=bpy.data.objects.new('EvidenceCamera',ca);bpy.context.collection.objects.link(ob)
    ob.location=B(pos);ob.rotation_euler=(B(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    ob.data.type=kind;ob.data.ortho_scale=span;ob.data.lens=50
    ob.data.sensor_fit='VERTICAL';ob.data.angle_y=math.radians(fov)
    ob.data.clip_start=.05;ob.data.clip_end=1000;bpy.context.scene.camera=ob;return ob
def clear_lights():
    for ob in list(bpy.data.objects):
        if ob.type=='LIGHT':bpy.data.objects.remove(ob,do_unlink=True)
def light(name,pos,power,color=(1,1,1),size=8,target=(0,0,0),kind='AREA'):
    da=bpy.data.lights.new(name,kind);da.energy=power;da.color=color
    if kind=='AREA':da.shape='DISK';da.size=size
    ob=bpy.data.objects.new(name,da);bpy.context.collection.objects.link(ob);ob.location=B(pos)
    ob.rotation_euler=(B(target)-ob.location).to_track_quat('-Z','Y').to_euler();return ob
def neutral():
    clear_lights();light('Key',(-12,22,-12),2600,size=9);light('Fill',(14,12,8),1750,color=(.72,.84,1),size=10)
    light('Soft rim',(0,9,12),1200,color=(1,.77,.60),size=6)
_new_render_count=0
def render(name,pos,target=(0,0,0),span=8,kind='ORTHO',fov=58,w=640,h=480):
    global _new_render_count
    sc=bpy.context.scene;sc.render.resolution_x=w;sc.render.resolution_y=h
    if os.environ.get('DRONE_RENDER_RESUME')=='1' and (PNG/(name+'.png')).exists():
        print('RESUME existing PNG',name,flush=True);return
    limit=int(os.environ.get('DRONE_MAX_NEW_RENDERS','0'))
    if limit and _new_render_count>=limit:
        print('DRONE_RENDER_CHECKPOINT: resume remaining images in a fresh process',flush=True)
        os._exit(0) # All reports/PNGs are closed; stop this economical render batch.
    point_camera(pos,target,span,kind,fov);sc.render.filepath=str(PNG/(name+'.png'));bpy.ops.render.render(write_still=True)
    _new_render_count+=1
def bounds(objects):
    vv=[G(ob.matrix_world@v.co) for ob in objects if ob.type=='MESH' for v in ob.data.vertices]
    return {'min':[min(v[i] for v in vv) for i in range(3)],'max':[max(v[i] for v in vv) for i in range(3)]}
def stats(objects):
    dg=bpy.context.evaluated_depsgraph_get();tri=prim=0
    for ob in objects:
        if ob.type!='MESH':continue
        me=ob.evaluated_get(dg).to_mesh();me.calc_loop_triangles();tri+=len(me.loop_triangles);prim+=len(set(p.material_index for p in me.polygons));ob.evaluated_get(dg).to_mesh_clear()
    return {'triangles':tri,'material_primitives':prim,'bounds_game':bounds(objects)}
def dump(name,data):
    (REPORT/name).write_text(json.dumps(data,indent=2)+'\n')
