"""Independent stdlib binary glTF reader. Evaluates node matrices and indexed triangles.
No Blender API, no accessor min/max assumptions, no geometry generator import.
"""
import json,struct,math,hashlib
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]
blob=(OUT/'interceptor.glb').read_bytes();magic,ver,length=struct.unpack_from('<4sII',blob);assert(magic,ver,length)==(b'glTF',2,len(blob))
pos=12;chunks={}
while pos<len(blob):
 n,t=struct.unpack_from('<II',blob,pos);chunks[t]=blob[pos+8:pos+8+n];pos+=8+n
j=json.loads(chunks[0x4e4f534a]);buf=chunks[0x004e4942]
I=[[int(a==b) for b in range(4)] for a in range(4)]
def mul(a,b):return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
def matrix(n):
 if 'matrix'in n:return [[n['matrix'][c*4+r] for c in range(4)] for r in range(4)]
 x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0])
 return [[(1-2*(y*y+z*z))*sx,2*(x*y-z*w)*sy,2*(x*z+y*w)*sz,t[0]],[2*(x*y+z*w)*sx,(1-2*(x*x+z*z))*sy,2*(y*z-x*w)*sz,t[1]],[2*(x*z-y*w)*sx,2*(y*z+x*w)*sy,(1-2*(x*x+y*y))*sz,t[2]],[0,0,0,1]]
def point(m,p):return [sum(m[r][k]*p[k] for k in range(3))+m[r][3] for r in range(3)]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];fmt={5121:'B',5123:'H',5125:'I',5126:'f'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];size=struct.calcsize('<'+fmt*n);stride=v.get('byteStride',size);start=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+fmt*n,buf,start+k*stride) for k in range(a['count'])]
def bounds(p):return {'min':[min(v[k] for v in p) for k in range(3)],'max':[max(v[k] for v in p) for k in range(3)]}
records=[];visible=[];hidden=[];tris=0;prims=0;hidden_tris=0;hidden_prims=0;degenerate=0;all_used=[]
def walk(i,parent,pm):
 global tris,prims,hidden_tris,hidden_prims,degenerate
 n=j['nodes'][i];m=mul(pm,matrix(n));ishidden=n.get('name')=='hit-flash-shell'
 record={'name':n.get('name'), 'parent':parent,'translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1]),'world_translation':[m[k][3] for k in range(3)],'primitives':[]}
 if 'mesh'in n:
  for p in j['meshes'][n['mesh']]['primitives']:
   assert p.get('mode',4)==4;v=acc(p['attributes']['POSITION']);idx=[a[0] for a in acc(p['indices'])] if 'indices'in p else list(range(len(v)));assert len(idx)%3==0
   assert all(0<=a<len(v) for a in idx);assert all(math.isfinite(x) for vv in v for x in vv)
   wp=[point(m,vv) for vv in v];mat=j['materials'][p['material']]['name'];ntri=len(idx)//3
   record['primitives'].append({'material':mat,'triangles':ntri,'vertices':len(v),'bounds_local':bounds(v)})
   for k in range(0,len(idx),3):
    a,b,c=[v[idx[k+q]] for q in range(3)];u=[b[q]-a[q] for q in range(3)];w=[c[q]-a[q] for q in range(3)];cross=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]
    if sum(x*x for x in cross)<1e-18:degenerate+=1
   if ishidden:hidden_tris+=ntri;hidden_prims+=1;hidden.extend(v)
   else:tris+=ntri;prims+=1;visible.extend(wp);all_used.append(mat)
 records.append(record)
 for child in n.get('children',[]):walk(child,n.get('name'),m)
for i in j['scenes'][j.get('scene',0)]['nodes']:walk(i,None,I)
by={n['name']:n for n in records};assert by['interceptor']['translation']==[0,0,0] and by['interceptor']['rotation']==[0,0,0,1]
assert by['nose-forward']['world_translation'][2]>1.97 and abs(by['nose-forward']['world_translation'][1])<1e-5
assert by['up-reference']['world_translation'][1]>.73 and abs(by['up-reference']['world_translation'][2])<1e-5
assert by['engine']['parent']=='interceptor' and abs(by['engine']['translation'][2]+1.84)<1e-5
assert by['hit-flash-shell']['scale']==[0,0,0]
assert tris<=6000 and prims<=6 and len(blob)<=1048576 and not j.get('textures') and degenerate==0
report={'format':'glTF2 GLB','bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest(),'visible_triangles':tris,'visible_primitives':prims,'visible_materials':sorted(set(all_used)),'hidden_flash_triangles':hidden_tris,'hidden_flash_primitives':hidden_prims,'total_exported_triangles':tris+hidden_tris,'rest_bounds_game':bounds(visible),'hidden_shell_local_bounds':bounds(hidden),'nodes':records,'material_definitions':j['materials'],'textures':j.get('textures',[]),'degenerate_triangles':degenerate,'axis_verified':True,'target4000':tris<=4000,'ceiling6000':tris<=6000,'under1MiB':len(blob)<=1048576,'method':'Independently read raw POSITION/index buffers, compose glTF TRS/quaternion matrices recursively. Hidden shell reported separately at activation scale by Blender verifier. No accessor min/max trusted.'}
(OUT/'evidence'/'glb-inspection.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['nodes','material_definitions']},indent=2))
