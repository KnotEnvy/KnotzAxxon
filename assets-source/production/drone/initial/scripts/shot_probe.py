"""Visual ray-path evidence only; never changes collision, aim or projectile origins."""
import sys,json,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath=str(OUT/'drone.blend'))
body=bpy.data.objects['body'];shell=bpy.data.objects['flash_shell'];shell.hide_render=True
bt=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[list(p.vertices)for p in body.data.polygons])
runtime=json.loads((REPORT/'runtime_samples.json').read_text());results=[]
def rot(eul):
    x,y,z=eul;a,b=math.cos(x),math.sin(x);c,d=math.cos(y),math.sin(y);e,f=math.cos(z),math.sin(z)
    return Matrix(((c*e,-c*f,d),(a*f+b*e*d,a*e-b*f*d,-b*c),(b*f-a*e*d,b*e+a*f*d,a*c)))
for shot in runtime['shots']:
    args=shot['args'];spawn=Vector(args[1:4])-Vector(shot['root']);direction=Vector(args[4:7]).normalized();R=rot(shot['euler']);localspawn=R.transposed()@spawn;localdir=R.transposed()@direction
    pos,normal,index,dist=bt.ray_cast(B(localspawn),B(localdir),8)
    results.append({'case':shot['case'],'spawn_minus_root_game':list(spawn),'aim_direction_world':list(direction),'euler_xyz':shot['euler'],'ray_intersects_authored_static_body_within_8_units':index is not None,'first_visual_intersection_distance':dist,'first_visual_intersection_local_game':list(G(pos)) if pos is not None else None})
dump('shot_visual_ray_probe.json',{'method':'Exact source firing events and lead, zero-mean spread and midpoint fire timer in numeric harness. Transform world shot and direction through inverse THREE XYZ root rotation, then cast a zero-radius ray through the visible static authored body BVH. Not a gameplay collision test.','shots':results,'ray_intersection_count':sum(r['ray_intersects_authored_static_body_within_8_units'] for r in results),'samples':len(results),'graphics_mismatch':'Enemy ahead of player can aim predominantly -Z while spawn is at +Z. The zero-radius rendered path can cross the airframe. Existing root muzzle FX is also inside the silhouette. Preserve mechanics; the authored opening minimizes rest obstruction but cannot reconcile these source contracts at all angles.','limitations':['Actual projectile radius .9 is not treated as a sphere sweep here','Random spread, full player maneuvers and live obstacles not sampled','Visual self-intersection does not imply gameplay self-collision']})
setup_render();neutral();sample=results[0];root=bpy.data.objects['drone_root'];R=rot(sample['euler_xyz']);root.rotation_euler=(C@R@C.transposed()).to_euler()
# Debug ray in world coordinates relative to root, distinct from production geometry.
start=Vector(sample['spawn_minus_root_game']);end=start+Vector(sample['aim_direction_world'])*5
ma=material('DEBUG_Ray_Cyan',0x44DFFF,0,.6,1)
curve=bpy.data.curves.new('DEBUG source shot ray','CURVE');curve.dimensions='3D';curve.bevel_depth=.018;curve.bevel_resolution=0
sp=curve.splines.new('POLY');sp.points.add(1)
for pt,co in zip(sp.points,[B(start),B(end)]):pt.co=(*co,1)
ob=bpy.data.objects.new('DEBUG source shot ray',curve);bpy.context.collection.objects.link(ob);ob.data.materials.append(ma)
for name,co,col in [('DEBUG world shot spawn',start,0xFFE65E),('DEBUG root muzzle FX',Vector((0,0,0)),0xEF68FF)]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.075,location=B(co));bpy.context.object.name=name;bpy.context.object.data.materials.append(material(name,col,0,.5,1))
render('debug_actual_shot_ray',(-11,10,15),span=8)
