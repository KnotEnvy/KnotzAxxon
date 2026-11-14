import bpy, json, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[1]
REPO=OUT.parents[2]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
s=bpy.context.scene; s.render.engine='BLENDER_EEVEE'; s.render.threads_mode='FIXED'; s.render.threads=4
s.render.resolution_x=600; s.render.resolution_y=420; s.render.resolution_percentage=100
s.eevee.taa_render_samples=24
s.world.color=(.065,.065,.065)
s.view_settings.view_transform='AgX'
def cv(p): return Vector((p[0],-p[2],p[1]))
def aim(o,p): o.rotation_euler=(cv(p)-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('ReferenceCamera',bpy.data.cameras.new('ReferenceCamera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
for name,p,power,size in [('key',(-12,22,-12),2400,10),('fill',(14,12,8),1800,9)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=cv(p);aim(o,(0,0,0))
report={}
for name in ['player','sentinel','turret','radar','silo','fuel']:
 old=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(REPO/'public/models'/f'{name}.glb'));objs=set(bpy.data.objects)-old
 vs=[o.matrix_world@v.co for o in objs if o.type=='MESH' for v in o.data.vertices]
 lo=Vector(tuple(min(v[i] for v in vs) for i in range(3)));hi=Vector(tuple(max(v[i] for v in vs) for i in range(3)));c=(lo+hi)*.5
 span=max(hi-lo)*1.55
 cam.location=c+cv((-16,24,-30)).normalized()*40;cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=span
 s.render.filepath=str(OUT/'renders'/f'reference-{name}.png');bpy.ops.render.render(write_still=True)
 report[name]={'materials':{m.name: {'base':list(m.diffuse_color),'metallic':m.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value if m.use_nodes and m.node_tree.nodes.get('Principled BSDF') else None} for o in objs if o.type=='MESH' for m in o.data.materials},'display':'Style reference only: independently framed; not size-comparison evidence'}
 for o in objs:bpy.data.objects.remove(o,do_unlink=True)
(OUT/'evidence'/'shipped-style-reference.json').write_text(json.dumps(report,indent=2))
