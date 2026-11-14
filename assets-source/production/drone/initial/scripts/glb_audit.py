"""Independent stdlib binary glTF reader: no bpy, no exporter accessor min/max trust."""
import struct,json,math,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent;OUT=HERE.parent
def read(path):
    data=Path(path).read_bytes();magic,version,total=struct.unpack_from('<4sII',data);assert magic==b'glTF' and version==2 and total==len(data)
    chunks=[];off=12
    while off<len(data):
        n,kind=struct.unpack_from('<I4s',data,off);chunks.append((kind,data[off+8:off+8+n]));off+=8+n
    return json.loads(chunks[0][1]), next((c[1] for c in chunks if c[0]==b'BIN\0'),b'')
def write(path,j,b):
    a=json.dumps(j,separators=(',',':')).encode();a+=b' '*((-len(a))%4);b+=b'\0'*((-len(b))%4)
    Path(path).write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(a)+8+len(b))+struct.pack('<I4s',len(a),b'JSON')+a+struct.pack('<I4s',len(b),b'BIN\0')+b)
def separate_flash(path):
    j,b=read(path);ids={n['name']:i for i,n in enumerate(j['nodes'])};fi=ids['flash_shell'];root=j['nodes'][ids['drone_root']]
    if fi in root.get('children',[]):root['children'].remove(fi)
    j['scenes']=[{'name':'drone_runtime_visible','nodes':[ids['drone_root']]},{'name':'hit_flash_template_NOT_default_scene','nodes':[fi]}];j['scene']=0
    j['nodes'][fi].setdefault('extras',{})['runtime_initial_visible']=False
    j['asset']['extras']={'stage':'pending_deferred_opus_review','formal_reviews':0,'formal_fix_passes':0,'flash_scene_contract':'Load scene 0. Obtain flash_shell from scenes[1]; reparent under drone_root, visible=false, additive material per runtime map.'}
    write(path,j,b)
def ident():return [[float(a==b) for b in range(4)] for a in range(4)]
def mul(a,b):return [[sum(a[i][k]*b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def tr(m,p):return [sum(m[i][k]*([*p,1][k]) for k in range(4)) for i in range(3)]
def mat(n):
    if 'matrix'in n:return [[n['matrix'][c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=n.get('rotation',[0,0,0,1]);s=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0]);m=ident()
    r=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    for i in range(3):
        for k in range(3):m[i][k]=r[i][k]*s[k]
        m[i][3]=t[i]
    return m
def accessor(j,b,idx):
    a=j['accessors'][idx];assert 'sparse'not in a;v=j['bufferViews'][a['bufferView']]
    n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}[a['componentType']];size=struct.calcsize('<'+fmt*n);stride=v.get('byteStride',size);off=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+fmt*n,b,off+i*stride) for i in range(a['count'])]
def audit(path):
    j,b=read(path);world={};parents={};scene_nodes=[]
    def visit(idx,m,si):
        n=j['nodes'][idx];w=mul(m,mat(n));world[idx]=w;scene_nodes.append((si,idx))
        for child in n.get('children',[]):parents[child]=idx;visit(child,w,si)
    for si,sc in enumerate(j['scenes']):
        for idx in sc['nodes']:visit(idx,ident(),si)
    allvv={0:[],1:[]};counts={0:[0,0],1:[0,0]};nodes=[];points={}
    for si,idx in scene_nodes:
        n=j['nodes'][idx];pts=[];mn=[]
        if 'mesh'in n:
            for p in j['meshes'][n['mesh']]['primitives']:
                assert p.get('mode',4)==4
                vv=accessor(j,b,p['attributes']['POSITION']);ii=accessor(j,b,p['indices']) if 'indices'in p else [(k,) for k in range(len(vv))]
                assert len(ii)%3==0 and max(k[0] for k in ii)<len(vv)
                assert all(math.isfinite(v) for p in vv for v in p)
                counts[si][0]+=len(ii)//3;counts[si][1]+=1;mn.append(j['materials'][p['material']]['name'])
                pts.extend(tr(world[idx],p) for p in vv)
        allvv[si].extend(pts);points[n['name']]=pts
        nodes.append({'name':n['name'],'scene':si,'parent':j['nodes'][parents[idx]]['name']if idx in parents else None,'local_translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1]),'world_origin':tr(world[idx],[0,0,0]),'materials':mn,'mesh':n.get('mesh')})
    def bb(vv):return {'min':[min(p[k]for p in vv)for k in range(3)],'max':[max(p[k]for p in vv)for k in range(3)]}
    byname={n['name']:n for n in nodes};assert byname['drone_root']['local_translation']==[0,0,0];assert byname['body']['parent']=='drone_root';assert byname['eye']['parent']=='drone_root';assert byname['engine']['parent']=='drone_root'
    axis={'nose_world':byname['axis_nose_plusZ']['world_origin'],'up_world':byname['axis_up_plusY']['world_origin']};assert abs(axis['nose_world'][2]-2)<1e-5 and abs(axis['up_world'][1]-1)<1e-5
    dynamic_normals={}
    for name,expected in [('eye',1),('engine',-1)]:
        node=next(n for n in j['nodes']if n['name']==name);p=j['meshes'][node['mesh']]['primitives'][0]
        vv=accessor(j,b,p['attributes']['POSITION']);nn=accessor(j,b,p['attributes']['NORMAL'])
        normals=[list(n)for v,n in zip(vv,nn)if abs(v[0])<1e-6 and abs(v[1])<1e-6]
        assert normals and all(abs(n[2]-expected)<1e-5 for n in normals)
        dynamic_normals[name]={'cap_center_normals_local_game':normals,'expected_front_z_sign':expected,'front_side_material_compatible':True}
    report={'reader':'independent Python stdlib, binary accessor positions and indices, full node TRS traversal, all scene roots','file_bytes':Path(path).stat().st_size,'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'visible':{'triangles':counts[0][0],'material_primitives':counts[0][1],'bounds_game':bb(allvv[0])},'hidden_flash':{'triangles':counts[1][0],'material_primitives':counts[1][1],'bounds_game':bb(allvv[1])},'all_bounds':bb(allvv[0]+allvv[1]),'nodes':nodes,'materials':j['materials'],'axis_proof':axis,'images':j.get('images',[]),'textures':j.get('textures',[]),'default_scene':j.get('scene',0),'external_uris':[x['uri'] for x in j.get('buffers',[]) if 'uri'in x],'checks':{'visible_triangle_ceiling':counts[0][0]<=6000,'visible_primitives':counts[0][1]<=6,'under_1MiB':Path(path).stat().st_size<=1048576,'no_textures':not j.get('images'),'identity_root':mat(j['nodes'][next(i for i,n in enumerate(j['nodes']) if n['name']=='drone_root')])==ident(),'flash_separate_from_default_scene':byname['flash_shell']['scene']==1,'axes_correct':True}}
    report['dynamic_front_face_normals']=dynamic_normals
    assert all(report['checks'].values());(OUT/'evidence/reports/glb_independent.json').write_text(json.dumps(report,indent=2)+'\n');return report
if __name__=='__main__':
    import sys
    if '--separate-flash'in sys.argv:separate_flash(OUT/'drone.glb')
    r=audit(OUT/'drone.glb');print(json.dumps({k:r[k] for k in ['file_bytes','visible','hidden_flash','checks']},indent=2))
