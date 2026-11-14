"""Original contact mine. All construction coordinates are game +Y up/+Z forward.
No shipped geometry/generator is used. Run with Blender --background --python.
"""
import bpy, bmesh, math, json, itertools, sys
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
ASSET=ROOT/'assets'; ASSET.mkdir(exist_ok=True)

def B(p): return (p[0],-p[2],p[1])
def srgb(v): return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def color(h):
    h=h.lstrip('#');return tuple(srgb(int(h[i:i+2],16)/255) for i in (0,2,4))+(1,)
ARM=color('794338'); EDGE=color('ac7057'); DARK=color('27333e'); STEEL=color('8495a0'); BLACK=color('26313b'); RED=color('ff3d55')
class Bucket:
    def __init__(self):self.v=[];self.f=[];self.c=[]
    def add(self,verts,faces,colors):
        j=len(self.v);self.v.extend([B(p) for p in verts]);self.f.extend([[j+i for i in f] for f in faces]);self.c.extend(colors if isinstance(colors,list) else [colors]*len(faces))
    def obj(self,name,mat,parent):
        m=bpy.data.meshes.new(name+'_editable');m.from_pydata(self.v,[],self.f);m.update()
        bm=bmesh.new();bm.from_mesh(m);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(m);bm.free();m.update()
        a=m.color_attributes.new(name='COLOR_0',type='FLOAT_COLOR',domain='CORNER')
        for p,c in zip(m.polygons,self.c):
            for li in p.loop_indices:a.data[li].color=c
        o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);o.parent=parent;m.materials.append(mat);return o

def material(name,metal,rough,emission=False):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(.24,.13,.1,1);m.use_backface_culling=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if emission:
        bs.inputs['Base Color'].default_value=RED;bs.inputs['Emission Color'].default_value=RED;bs.inputs['Emission Strength'].default_value=3.2;m.diffuse_color=RED
    else:
        vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='COLOR_0';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
    return m

def planar(pts,n):
    c=sum((Vector(p) for p in pts),Vector())/len(pts);n=Vector(n).normalized();u=(Vector(pts[0])-c).normalized();v=n.cross(u)
    return sorted([Vector(p) for p in pts],key=lambda p:math.atan2((p-c).dot(v),(p-c).dot(u)))

def panel(bucket,pts,n):
    n=Vector(n).normalized();pts=planar(pts,n);c=sum(pts,Vector())/len(pts);k=len(pts)
    base=[c+(p-c)*.91+n*.006 for p in pts]
    side=[p+n*.032 for p in base]
    top=[c+(p-c)*.81+n*.066 for p in pts]
    verts=base+side+top
    faces=[tuple(reversed(range(k)))];colors=[DARK]
    for j in range(k):
        q=(j+1)%k;faces.append((j,q,k+q,k+j));colors.append(DARK)
        faces.append((k+j,k+q,2*k+q,2*k+j));colors.append(EDGE)
    faces.append(tuple(range(2*k,3*k)));colors.append(ARM)
    bucket.add(verts,faces,colors)

def axis_basis(d):
    d=Vector(d);u=d.cross(Vector((0,1,0)))
    if u.length<.1:u=d.cross(Vector((1,0,0)))
    u.normalize();return d,u,d.cross(u).normalized()

def lathe(bucket,d,profile,segments=6):
    d,u,v=axis_basis(d);verts=[]
    for axial,r in profile:
        for j in range(segments):
            a=2*math.pi*j/segments;verts.append(d*axial+r*(u*math.cos(a)+v*math.sin(a)))
    faces=[tuple(reversed(range(segments)))];cols=[BLACK]
    for k in range(len(profile)-1):
        for j in range(segments):
            q=(j+1)%segments;faces.append((k*segments+j,k*segments+q,(k+1)*segments+q,(k+1)*segments+j))
            cols.append(STEEL if k in [0,2,3,5,7,8] else BLACK)
    faces.append(tuple(range((len(profile)-1)*segments,len(profile)*segments)));cols.append(STEEL)
    bucket.add(verts,faces,cols)

def prism(bucket,c,u,v,n,l,w,h):
    c,u,v,n=map(Vector,(c,u,v,n));verts=[c+u*x*l/2+v*y*w/2+n*z*h for z in [0,1] for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    # Open back fitted against the solid armor; no unseen bottom triangles.
    bucket.add(verts,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],BLACK)

def build():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    root=bpy.data.objects.new('mine',None);bpy.context.collection.objects.link(root)
    root['game_axes']='+Y up, +Z forward';root['contract']='HP1 / radius1.9 / score80; all parts tumble with Enemy.group'
    armor=material('MN_Armor',.48,.44);metal=material('MN_ContactMetal',.65,.34);lampmat=material('MN_Danger',0,.3,True)
    core=Bucket();contacts=Bucket();lamp=Bucket()
    # Truncated octahedral pressure vessel, six mounting faces, eight shield faces.
    a=.44;allpts=sorted(set(tuple(v*s for v,s in zip(perm,signs)) for perm in itertools.permutations((0,a,2*a)) for signs in itertools.product([-1,1],repeat=3)))
    assert len(allpts)==24
    faces=[]
    for axis in range(3):
        for sign in [-1,1]:
            n=Vector((0,0,0));n[axis]=sign;pts=[p for p in allpts if abs(p[axis]-sign*2*a)<1e-6];faces.append((pts,n))
    for signs in itertools.product([-1,1],repeat=3):
        n=Vector(signs).normalized();pts=[p for p in allpts if abs(sum(v*s for v,s in zip(p,signs))-3*a)<1e-6];faces.append((pts,n))
    for pts,n in faces:
        pts=planar(pts,n);core.add(pts,[tuple(range(len(pts)))],DARK);panel(core,pts,n)
        if len(pts)==6:
            c=sum(pts,Vector())/6+n*.067;u=(pts[0]-sum(pts,Vector())/6).normalized();v=n.cross(u)
            for off in [-.08,.08]:prism(contacts,c+v*off+u*.055,u,v,n,.34,.035,.014)
            # Single fitted hex fastener per shield panel.
            bc=c-u*.255;verts=[]
            for h in [0,.025]:
                for j in range(6):verts.append(bc+n*h+.043*(u*math.cos(j*math.tau/6)+v*math.sin(j*math.tau/6)))
            ff=[tuple(reversed(range(6))),tuple(range(6,12))]+[(j,(j+1)%6,(j+1)%6+6,j+6) for j in range(6)]
            contacts.add(verts,ff,STEEL)
    profile=[(.85,.29),(.88,.35),(.98,.35),(1.035,.29),(1.035,.215),(1.12,.215),(1.14,.16),(1.26,.16),(1.72,.045),(1.85,.012)]
    for axis in range(3):
        for sign in [-1,1]:
            d=[0,0,0];d[axis]=sign;lathe(contacts,d,profile)
    # Four flat armored warning windows, not a pickup aura. Radial travel stays
    # outside body and between the cardinal collars over the full 0.94..1.06 pulse.
    for quadrant in range(4):
        vv=[];steps=7
        for j in range(steps+1):
            t=math.radians(quadrant*90+22+46*j/steps)
            for r,y in [(1.14,-.065),(1.23,-.065),(1.23,.065),(1.14,.065)]:vv.append((r*math.cos(t),y,r*math.sin(t)))
        ff=[(3,2,1,0)]
        for j in range(steps):
            for k in range(4):ff.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
        ff.append(tuple(range(steps*4,steps*4+4)));lamp.add(vv,ff,RED)
        # A fixed shallow channel supports each pulsing light window. The entire
        # lamp travel stays above its backing; the bracket seats in the vessel.
        # Open support rails leave the luminous window readable from either
        # side during full tumble. Three structural segments are sufficient.
        for inner,outer in [(1.02,1.075),(1.30,1.355)]:
            backing=[];railSteps=3
            for j in range(railSteps+1):
                t=math.radians(quadrant*90+22+46*j/railSteps)
                for r,y in [(inner,-.16),(outer,-.16),(outer,-.12),(inner,-.12)]:backing.append((r*math.cos(t),y,r*math.sin(t)))
            railFaces=[(3,2,1,0)]
            for j in range(railSteps):
                for k in range(4):railFaces.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
            railFaces.append(tuple(range(railSteps*4,railSteps*4+4)));contacts.add(backing,railFaces,BLACK)
        t=math.radians(quadrant*90+45);radial=Vector((math.cos(t),0,math.sin(t)));tangent=Vector((-math.sin(t),0,math.cos(t)))
        prism(contacts,radial*1.04+Vector((0,-.22,0)),radial,tangent,(0,1,0),.36,.12,.08)
    c=core.obj('core',armor,root);ct=contacts.obj('contacts',metal,root);l=lamp.obj('lamp',lampmat,root)
    l['runtime_binding']='Mine.lamp; uniform scale only about gameplay origin [0,0,0]'
    # Keep the existing 20-triangle ico hit-shell source and scale, hidden at rest.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1.2)
    flash=bpy.context.object;flash.name='flashMesh';flash.parent=root;flash.scale=(1.2,)*3;flash.hide_render=True
    fm=bpy.data.materials.new('MN_FlashPlaceholder');fm.diffuse_color=(1,1,1,0);fm.use_nodes=True
    bs=fm.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(1,1,1,1);bs.inputs['Alpha'].default_value=0
    flash.data.materials.append(fm);flash['runtime_hidden']=True;flash['runtime_binding']='replace material with instance-owned Enemy.flashMat; visible=false before first frame; opacity=flash*.75'
    # Explicit asymmetric axis markers make independent Y-up export verifiable.
    for name,p in [('axis-game-up-Y',(0,1,0)),('axis-game-forward-Z',(0,0,1)),('axis-game-right-X',(1,0,0))]:
        o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=root;o.location=B(p);o.empty_display_size=.08;o.hide_render=True
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:o.select_set(True)
    bpy.context.view_layer.objects.active=c
    bpy.context.scene['status']='INITIAL pending_deferred_opus_review; formal_review_count=0; formal_fix_pass_count=0'
    bpy.context.scene['authoring_axes']='Blender +Z up / -Y game-forward; glTF conversion exports +Y up / +Z forward'
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET/'mine.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(ASSET/'mine.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    stats={}
    for o in [c,ct,l,flash]:
        o.data.calc_loop_triangles();pts=[o.matrix_world@v.co for v in o.data.vertices]
        game=[(p.x,p.z,-p.y) for p in pts]
        stats[o.name]={'evaluated_triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'materials':[m.name for m in o.data.materials],'restBoundsGame':{'min':[min(p[i] for p in game) for i in range(3)],'max':[max(p[i] for p in game) for i in range(3)]},'hidden':o==flash}
    (ROOT/'measurements'/'build-statistics.json').write_text(json.dumps({'blender_version':bpy.app.version_string,'build_hash':bpy.app.build_hash.decode(),'objects':stats},indent=2))
    print('MINE_BUILD',json.dumps(stats))
if __name__=='__main__':build()
