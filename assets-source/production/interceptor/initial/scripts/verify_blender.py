"""Reopen packed blend, clean-scene GLB import, geometry/pivot/pulse/pose inspection."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parents[1]
def game(v):return [v.x,v.z,-v.y]
def cv(v):return Vector((v[0],-v[2],v[1]))
def ancestor(o,name):
 while o:
  if o.name==name:return True
  o=o.parent
 return False
def points(o):
 used={v for p in o.data.polygons for v in p.vertices}
 return [o.matrix_world@o.data.vertices[i].co for i in used]
def bounds(v):
 p=[game(x) for x in v];return {'min':[min(x[k] for x in p) for k in range(3)],'max':[max(x[k] for x in p) for k in range(3)]}
def collect():
 bpy.context.view_layer.update();v=[];tr=0;pr=0;hs=0;nodes=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  o.data.calc_loop_triangles();t=len(o.data.loop_triangles)
  if ancestor(o,'hit-flash-shell'):hs+=t;continue
  tr+=t;pr+=len({p.material_index for p in o.data.polygons});v+=points(o)
  nodes.append({'name':o.name,'parent':o.parent.name if o.parent else None,'triangles':t,'materials':[m.name for m in o.data.materials]})
 return {'visible_triangles':tr,'visible_primitives':pr,'hidden_flash_triangles':hs,'bounds':bounds(v),'meshes':nodes},v
def group_mesh(name,scale=1):
 v=[];f=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH' or not ancestor(o,name):continue
  o.data.calc_loop_triangles();n=len(v);v.extend([o.matrix_world@x.co for x in o.data.vertices]);f.extend([tuple(n+x for x in t.vertices) for t in o.data.loop_triangles])
 return v,f
def bvh(v,f):return BVHTree.FromPolygons(v,f,all_triangles=True,epsilon=0)
def nearest(tree,v):return min(tree.find_nearest(x)[3] for x in v)
bpy.ops.wm.open_mainfile(filepath=str(OUT/'interceptor.blend'));blend,p=collect();assert not any(i.type=='IMAGE' and i.source=='FILE' and not i.packed_file for i in bpy.data.images)
blend['packed']='No external textures or linked libraries; pack is vacuous for authored plain materials.'
root=bpy.data.objects['interceptor'];assert all(abs(x)<1e-7 for x in root.location) and all(abs(x-1)<1e-7 for x in root.scale)
shell=bpy.data.objects['hit-flash-shell'];shell.scale=(1.018,)*3;bpy.context.view_layer.update();blend['bounds_with_activated_shell']=bounds(p+points(shell));shell.scale=(0,)*3
# Reimport into a genuinely empty scene, not on top of authored source.
bpy.ops.object.select_all(action='SELECT');
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'interceptor.glb'));reimport,p=collect();ind=json.loads((OUT/'evidence/glb-inspection.json').read_text())
assert blend['visible_triangles']==reimport['visible_triangles']==ind['visible_triangles'];assert reimport['visible_primitives']==ind['visible_primitives']==6
assert blend['hidden_flash_triangles']==reimport['hidden_flash_triangles']==ind['hidden_flash_triangles']
for side in ['min','max']:
 for k in range(3):assert abs(blend['bounds'][side][k]-reimport['bounds'][side][k])<1e-5 and abs(reimport['bounds'][side][k]-ind['rest_bounds_game'][side][k])<1e-5
engine=bpy.data.objects['engine'];root=bpy.data.objects['interceptor'];bpy.context.view_layer.update();pivot=game(engine.matrix_world.translation);assert abs(pivot[2]+1.84)<1e-5 and abs(pivot[1]+.035)<1e-5
assert game(bpy.data.objects['nose-forward'].matrix_world.translation)[2]>1.97
assert game(bpy.data.objects['up-reference'].matrix_world.translation)[1]>.73
bodyv,bodyf=group_mesh('body');ev,ef=group_mesh('engine');eyev,eyef=group_mesh('eye');bt=bvh(bodyv,bodyf);center=engine.matrix_world.translation.copy()
clearances=[];intersections=0
for i in range(401):
 sc=.97+(.095*i/400);vv=[center+(v-center)*sc for v in ev];et=bvh(vv,ef);overlap=len(bt.overlap(et));intersections+=bool(overlap);clearances.append(min(nearest(bt,vv),nearest(et,bodyv)))
assert intersections==0
eye_overlap=len(bt.overlap(bvh(eyev,eyef)))
motion=json.loads((OUT/'evidence/runtime-contract.json').read_text());C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def rotation(a):return Matrix.Rotation(a[0],4,'X')@Matrix.Rotation(a[1],4,'Y')@Matrix.Rotation(a[2],4,'Z')
poses={};restp=[cv(game(v)) for v in p]
for name,c in motion['contexts'].items():
 a=c['selected_pose']['rotation_xyz'];R=C@rotation(a)@C.inverted();poses[name]={'rotation_xyz_game':a,'bounds_local_game_after_rotation':bounds([R@v for v in restp]),'selected_root_game':c['selected_pose']['position']}
low=[]
for roll in [-1.1,-.84,0,.84,1.1]:
 R=C@rotation([-.16,.288,roll])@C.inverted();bb=bounds([R@v+cv((0,2.3,0)) for v in restp]);low.append({'rootY':2.3,'roll':roll,'minWorldY':bb['min'][1]})
shot=cv((0,0,1.5));shotNearest=bt.find_nearest(shot);rayOrigin=cv((0,0,1.5));rayEnd=cv((0,0,5));hit=bt.ray_cast(rayOrigin,(rayEnd-rayOrigin).normalized(),3.5)
a=motion['shot']['sample_rotation_xyz'];R=rotation(a);rotated_channel=R@Vector((0,0,1.5));offset=(rotated_channel-Vector((0,0,1.5))).length
report={'status':'PASS','blender':bpy.app.version_string,'build_hash':bpy.app.build_hash.decode(),'blend_reopened':blend,'glb_clean_reimport':reimport,'independent_binary_agreement':True,'engine_pivot_game':pivot,'engine_local_geometry_bounds':bounds([v-center for v in ev]),'engine_pulse':{'samples':401,'scale_range':[.97,1.065],'intersecting_samples':intersections,'minimum_sampled_vertex_to_surface_distance':min(clearances),'method':'Triangle BVH overlap each scale; nearest surface from vertices in both directions. Includes endpoints. Distance is a sampled estimate, not analytic minimum.'},'eye_seating':{'triangle_intersections':eye_overlap,'note':'Sensor back is intentionally seated into the fixed brow; no flyer eye scale animation in current source.'},'shot':{'rest_spawn_game':[0,0,1.5],'nearest_static_body_distance':shotNearest[3],'ray_plusZ_from_rest_spawn_hits_body':bool(hit[0]),'rotated_channel_vs_fixed_spawn_offset_at_firing_sample':offset,'mismatch':'Actual targeting/lead and muzzle FX stay at root. Under root rotations fixed-world spawn diverges from weapon channel; muzzle FX occur inside central airframe. Projectile radius .9 exceeds the channel; no narrower aiming/collision is introduced.'},'poses':poses,'low_altitude_roll':low,'baseline_rest_including_shell':{'min':[-2.9044,-.43,-1.9923],'max':[2.9044,.77,2.208]},'limitations':['Static airframe mating overlaps and seated sensor are intentional; not a watertight monolithic 3D-print mesh.','Thin nozzle heat petals are intentional open surfaces.','Rest collision radius2.2 remains gameplay-owned; 2.86 wing tips extend beyond it, comparable to baseline.','Extreme minimum-altitude banks can dip wing tips below deck, comparable to old wings; no gameplay restrictions added.','No live carrier/boss/wing contact, GPU performance or actual camera/fog/postfx integration verification.','Dispose ownership contract inspected; not tested with live WebGL resources.']}
(OUT/'evidence/blender-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','engine_pivot_game','engine_pulse','eye_seating','shot','low_altitude_roll']},indent=2))
