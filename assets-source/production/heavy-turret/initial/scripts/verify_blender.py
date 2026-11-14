import bpy,json,math
from pathlib import Path
from mathutils import Vector
P=Path(__file__).resolve().parent.parent
def G(v):return [v.x,v.z,-v.y]
def stats(objects):
 vs=[];tri=0;meshes=0
 for o in objects:
  if o.type!='MESH':continue
  m=o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh();m.calc_loop_triangles();tri+=len(m.loop_triangles);meshes+=1
  vs.extend(G(o.matrix_world@v.co) for v in m.vertices)
 return {'triangles':tri,'meshObjects':meshes,'bounds':{'min':[min(v[i] for v in vs) for i in range(3)],'max':[max(v[i] for v in vs) for i in range(3)]}}
result={'version':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'threads':4,'engine':'BLENDER_EEVEE'}
bpy.ops.wm.open_mainfile(filepath=str(P/'heavy-turret.blend'))
objects=list(bpy.data.collections['HEAVY_TURRET_EXPORT'].objects)
bpy.context.view_layer.update();result['reopenedBlend']=stats(objects)
assert len([o for o in objects if o.type=='MESH'])==5
for name,expected in [('turntable',[0,1.5,0]),('barrel-L',[-.675,1.725,0]),('barrel-R',[.675,1.725,0]),('eye',[0,2.37,1.53])]:
 assert max(abs(a-b) for a,b in zip(G(bpy.data.objects[name].matrix_world.translation),expected))<1e-5
# Verify every exact sampled source yaw/pitch on the authored Blender hierarchy.
samples=json.loads((P/'verification/source-samples.json').read_text());poses=samples['settled']+[f for p in samples['trajectories'] for f in p['frames']]
turn=bpy.data.objects['turntable'];guns=[bpy.data.objects['barrel-L'],bpy.data.objects['barrel-R']];eye=bpy.data.objects['eye']
mins=[];maxs=[];pose_records=[]
for s in poses:
 turn.rotation_euler.z=s['yaw']
 for g in guns:g.rotation_euler.x=s['pitchX']
 eye.scale=(s['eyeScale'],)*3;bpy.context.view_layer.update()
 r=stats(objects);mins.append(r['bounds']['min']);maxs.append(r['bounds']['max'])
 for g,p in zip(guns,s['pivots']):assert max(abs(a-b) for a,b in zip(G(g.matrix_world.translation),p))<1e-5
 pose_records.append({'label':s['label'],'yaw':s['yaw'],'pitchX':s['pitchX'],'bounds':r['bounds']})
result['sourceMotion']={'states':len(poses),'allPivotMatches':True,'bounds':{'min':[min(p[i] for p in mins) for i in range(3)],'max':[max(p[i] for p in maxs) for i in range(3)]},'sampledPitchDegrees':[min(s['pitchX'] for s in poses)*180/math.pi,max(s['pitchX'] for s in poses)*180/math.pi]}
# Full reachable upper elevation, unrestricted yaw: actual vertex sweep, beyond sample grid.
min_gun_y=100;max_gun_y=-100;min_center_x=100
turn.rotation_euler.z=0
max_sweep_radius_below_deck=0
for deg in range(361):
 for g in guns:g.rotation_euler.x=math.radians(-90+deg/2)
 bpy.context.view_layer.update()
 for name in ['weapon-L','weapon-R']:
  o=bpy.data.objects[name]
  for v in o.data.vertices:
   p=G(o.matrix_world@v.co);min_gun_y=min(min_gun_y,p[1]);max_gun_y=max(max_gun_y,p[1]);min_center_x=min(min_center_x,abs(p[0]))
   if p[1]<=1.35:max_sweep_radius_below_deck=max(max_sweep_radius_below_deck,math.hypot(p[0],p[2]))
result['clearance']={'pitchSweepDegrees':[-90,90],'steps':361,'minGunWorldY':min_gun_y,'maxGunWorldY':max_gun_y,'annularWellMinInnerRadius':1.90,'annularSlewMaxY':1.3375,'radialSweepMeasurementYCutoff':1.35,'maxGunRadiusBelowSlewTop':max_sweep_radius_below_deck,'minRadialGunToWell':1.90-max_sweep_radius_below_deck,'minGunAbsXInTurntableSpace':min_center_x,'maxChargedLensAbsX':.235*1.45,'minLensLateralSeparation':min_center_x-.235*1.45,'intentionalContacts':'Pitch bearings overlap seated axles; yoke feet overlap slew deck. No axis relocation or aim clamp. Roof root Y sampled up to8.398; negative pitch required an open annular well.'}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(P/'heavy-turret.glb'))
bpy.context.view_layer.update();result['cleanSceneReimport']=stats(list(bpy.context.scene.objects))
assert result['cleanSceneReimport']['triangles']==result['reopenedBlend']['triangles']
assert result['reopenedBlend']['triangles']<=8000
for i in range(3):
 for side in ['min','max']:assert abs(result['cleanSceneReimport']['bounds'][side][i]-result['reopenedBlend']['bounds'][side][i])<1e-5
result['packedImageCount']=len(bpy.data.images);result['textures']='None required; vertex colors are embedded. Saved blend is self-contained.'
(P/'verification/blender-verification.json').write_text(json.dumps(result,indent=2));(P/'verification/pose-bounds.json').write_text(json.dumps(pose_records,indent=2))
print(json.dumps(result,indent=2))
