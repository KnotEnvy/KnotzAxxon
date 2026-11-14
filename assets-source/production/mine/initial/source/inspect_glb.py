"""Independent standard-library GLB reader. Measures actual accessor values, node TRS,
instantiated triangles and bounds, not JSON accessor min/max claims."""
import json, struct, math, sys
from pathlib import Path
I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def mul(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def transform(m,p):return tuple(sum(m[c*4+r]*p[c] for c in range(3))+m[12+r] for r in range(3))
def trs(n):
    if 'matrix'in n:return n['matrix']
    x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);tx,ty,tz=n.get('translation',[0,0,0])
    return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,(2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,(2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1]
def load(p):
    blob=Path(p).read_bytes();magic,ver,length=struct.unpack_from('<4sII',blob)
    assert magic==b'glTF' and ver==2 and length==len(blob)
    pos=12;js=None;binary=None
    while pos<len(blob):
        size,kind=struct.unpack_from('<II',blob,pos);chunk=blob[pos+8:pos+8+size];pos+=8+size
        if kind==0x4e4f534a:js=json.loads(chunk)
        if kind==0x004e4942:binary=chunk
    return js,binary
class GLB:
 def __init__(self,p):self.p=Path(p);self.j,self.bin=load(p)
 def accessor(self,i):
    a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];fmt,size={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];stride=v.get('byteStride',size*n);off=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*n,self.bin,off+k*stride) for k in range(a['count'])]
 def inspect(self):
    j=self.j;result=[];allpts=[];vpts=[];visible=0;hidden=0;vp=0;hp=0
    def visit(i,parent,parentName=None):
        nonlocal visible,hidden,vp,hp
        n=j['nodes'][i];m=mul(parent,trs(n));name=n.get('name',f'node-{i}');isHidden=name=='flashMesh' or n.get('extras',{}).get('runtime_hidden',False);rec={'index':i,'name':name,'parent':parentName,'localTranslation':n.get('translation',[0,0,0]),'localRotation_xyzw':n.get('rotation',[0,0,0,1]),'localScale':n.get('scale',[1,1,1]),'worldMatrix_columnMajor':m,'worldOrigin':transform(m,[0,0,0]),'hiddenByRuntimeContract':isHidden}
        if 'mesh'in n:
            pts=[];tri=0;mats=[];vertexCount=0;degenerate=0
            for prim in j['meshes'][n['mesh']]['primitives']:
                assert prim.get('mode',4)==4
                coords=self.accessor(prim['attributes']['POSITION']);assert all(math.isfinite(x) for p in coords for x in p);vertexCount+=len(coords);pts.extend(transform(m,p) for p in coords)
                indices=[x[0] for x in self.accessor(prim['indices'])] if 'indices'in prim else list(range(len(coords)));assert len(indices)%3==0;assert all(0<=x<len(coords) for x in indices);tri+=len(indices)//3
                for k in range(0,len(indices),3):
                    a,b,c=[coords[ix] for ix in indices[k:k+3]];u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)];cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                    if sum(x*x for x in cross)<1e-18:degenerate+=1
                mats.append(j['materials'][prim['material']]['name'])
            rec.update(triangles=tri,primitives=len(mats),accessorVertexCount=vertexCount,degenerateTriangles=degenerate,materials=mats,bounds={'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]})
            allpts.extend(pts)
            if isHidden:hidden+=tri;hp+=len(mats)
            else:visible+=tri;vp+=len(mats);vpts.extend(pts)
        result.append(rec)
        for child in n.get('children',[]):visit(child,m,name)
    for n in j['scenes'][j.get('scene',0)]['nodes']:visit(n,I)
    bounds=lambda pts:{'min':[min(p[k] for p in pts) for k in range(3)],'max':[max(p[k] for p in pts) for k in range(3)]}
    return {'file':self.p.name,'bytes':self.p.stat().st_size,'visibleTriangles':visible,'hiddenTriangles':hidden,'visibleMaterialPrimitives':vp,'hiddenPrimitives':hp,'totalInstantiatedTriangles':visible+hidden,'restBoundsGame':bounds(vpts),'allBoundsGame':bounds(allpts),'textures':len(j.get('textures',[])),'images':len(j.get('images',[])),'animations':len(j.get('animations',[])),'nodes':result,'materials':j.get('materials',[])}
if __name__=='__main__':
    p=Path(sys.argv[1]);r=GLB(p).inspect()
    if p.name=='mine.glb':
        assert r['visibleTriangles']<=2000 and r['visibleMaterialPrimitives']==3 and r['bytes']<=512*1024
        assert r['hiddenTriangles']==20 and r['textures']==0
        for node,expected in [('axis-game-up-Y',[0,1,0]),('axis-game-forward-Z',[0,0,1]),('axis-game-right-X',[1,0,0])]:
            found=next(n for n in r['nodes'] if n['name']==node);assert all(abs(a-b)<1e-5 for a,b in zip(found['worldOrigin'],expected))
        assert next(n for n in r['nodes'] if n['name']=='lamp')['worldOrigin']==(0,0,0)
    output=Path(sys.argv[2]);output.write_text(json.dumps(r,indent=2));print(json.dumps({k:v for k,v in r.items() if k not in ['nodes','materials']}))
