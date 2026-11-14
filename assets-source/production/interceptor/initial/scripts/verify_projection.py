"""Verify Blender camera frame dimensions used by the corrected render script."""
import bpy,math,json
from pathlib import Path
OUT=Path(__file__).resolve().parents[1];s=bpy.context.scene
c=bpy.data.cameras.new('projection-proof');rows={}
for name,w,h,span,persp,fov in [('rest',640,480,8.4,False,58),('common-neutral',640,480,14,False,58),('classic',960,540,142.2222222222,False,52),('modern',960,540,0,True,58),('chase',960,540,0,True,66)]:
 s.render.resolution_x=w;s.render.resolution_y=h;s.render.resolution_percentage=100;c.type='PERSP' if persp else 'ORTHO';c.sensor_fit='VERTICAL' if persp else 'HORIZONTAL';c.angle_y=math.radians(fov);c.ortho_scale=span if span else 1
 fr=c.view_frame(scene=s);ww=max(p.x for p in fr)-min(p.x for p in fr);hh=max(p.y for p in fr)-min(p.y for p in fr)
 if not persp:
  assert abs(ww-span)<1e-4
  if name=='classic':assert abs(hh-80)<1e-4
  rows[name]={'frame_width':ww,'frame_height':hh,'sensor_fit':c.sensor_fit,'verified':True}
 else:
  actual=math.degrees(2*math.atan(hh/(2*abs(fr[0].z))));rows[name]={'requested_vertical_fov':fov,'measured_vertical_fov':actual,'sensor_fit':c.sensor_fit,'verified':abs(actual-fov)<1e-4};assert rows[name]['verified']
(OUT/'evidence/projection-verification.json').write_text(json.dumps(rows,indent=2)+'\n');print(rows)
