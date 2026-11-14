"""Independent GLB binary inspection: actual indices/positions and composed TRS."""
import json,struct,math,sys
from pathlib import Path
P=Path(__file__).resolve().parent.parent
I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def mul(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def point(m,p):return [sum(m[c*4+r]*p[c] for c in range(3))+m[12+r] for r in range(3)]
def local(n):
 if 'matrix'in n:return n['matrix']
 x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1])
 return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,*n.get('translation',[0,0,0]),1]
def inspect(filename,pose=None):
 raw=Path(filename).read_bytes();magic,version,total=struct.unpack_from('<4sII',raw);assert magic==b'glTF' and version==2 and total==len(raw)
 off=12;doc=None;binary=None
 while off<len(raw):
  size,kind=struct.unpack_from('<II',raw,off);chunk=raw[off+8:off+8+size];off+=8+size
  if kind==0x4e4f534a:doc=json.loads(chunk)
  if kind==0x004e4942:binary=chunk
 if pose:
  for n in doc['nodes']:
   if n.get('name')=='turntable':n['rotation']=[0,math.sin(pose['yaw']/2),0,math.cos(pose['yaw']/2)]
   if n.get('name') in ['barrel-L','barrel-R']:n['rotation']=[math.sin(pose['pitchX']/2),0,0,math.cos(pose['pitchX']/2)]
   if n.get('name')=='eye':n['scale']=[pose['eyeScale']]*3
 def accessor(i):
  a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];fmt,size={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
  start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',n*size)
  return [struct.unpack_from('<'+fmt*n,binary,start+j*stride) for j in range(a['count'])]
 nodes=[];vertices=[];triangles=0;prims=0
 def walk(i,parent):
  nonlocal triangles,prims
  n=doc['nodes'][i];m=mul(parent,local(n));entry={'name':n.get('name',str(i)),'translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1]),'worldOrigin':point(m,[0,0,0]),'children':[doc['nodes'][c].get('name',str(c)) for c in n.get('children',[])]}
  if 'mesh'in n:
   entry['primitives']=[]
   for p in doc['meshes'][n['mesh']]['primitives']:
    assert p.get('mode',4)==4
    v=accessor(p['attributes']['POSITION']);idx=accessor(p['indices']) if 'indices'in p else [(j,) for j in range(len(v))]
    assert len(idx)%3==0 and max(x[0] for x in idx)<len(v)
    vertices.extend(point(m,p) for p in v);triangles+=len(idx)//3;prims+=1
    entry['primitives'].append({'vertices':len(v),'indices':len(idx),'triangles':len(idx)//3,'material':doc['materials'][p['material']]['name'],'attributes':list(p['attributes'])})
  nodes.append(entry)
  for c in n.get('children',[]):walk(c,m)
 for i in doc['scenes'][doc.get('scene',0)]['nodes']:walk(i,I)
 result={'bytes':len(raw),'triangles':triangles,'materialPrimitives':prims,'materials':doc.get('materials',[]),'images':len(doc.get('images',[])),'bounds':{'min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]},'nodes':nodes}
 return result
if __name__=='__main__':
 f=Path(sys.argv[1]) if len(sys.argv)>1 else P/'heavy-turret.glb';r=inspect(f);dest=P/'verification/glb-independent.json';dest.write_text(json.dumps(r,indent=2));print(json.dumps({k:r[k] for k in ['bytes','triangles','materialPrimitives','images','bounds']},indent=2))
 source=json.loads((P/'verification/source-samples.json').read_text());samples=source['settled']+[p['frames'][i] for p in source['trajectories'] for i in [0,20,40,60,80,100]]
 checks=[]
 for s in samples:
  a=inspect(f,s);nodes={n['name']:n for n in a['nodes']}
  for name,expected in zip(['barrel-L','barrel-R'],s['pivots']):assert max(abs(x-y) for x,y in zip(nodes[name]['worldOrigin'],expected))<1e-5
  checks.append({'label':s['label'],'time':s['time'],'bounds':a['bounds']})
 (P/'verification/glb-motion-independent.json').write_text(json.dumps({'method':'Actual binary POSITION/indices and composed glTF transforms. Source yaw around+Y, pitch around+X, eye scaling. Independent of Blender. All barrel WORLD pivots agree within1e-5.', 'states':len(checks),'checks':checks},indent=2))
