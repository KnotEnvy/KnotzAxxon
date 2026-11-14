"""Original editable geometry. Coordinates in this script are game +Y up/+Z forward.
Blender receives (x,-z,y); glTF exporter converts back to exact game coordinates.
No geometry/generator input from an earlier builder is used.
"""
import bpy, math, json, sys, os
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
OUT=HERE.parent
def B(v): return (v[0],-v[2],v[1])
def linear(h):
    rgb=[((h>>s)&255)/255 for s in (16,8,0)]
    return tuple(c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4 for c in rgb)
COL={'armor':0x596d75,'top':0x839297,'edge':0xb2b9b4,'dark':0x26373f,'black':0x101d25,'steel':0x758a92,'warm':0xbe955f,'red':0x6b2937}
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name!='Collection': bpy.data.collections.remove(c)
asset=bpy.data.collections.get('Collection');asset.name='HEAVY_TURRET_EXPORT'
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE';scene.render.threads_mode='FIXED';scene.render.threads=4
scene.render.resolution_x=960;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.render.image_settings.color_mode='RGBA'
scene.render.fps=60
scene.view_settings.view_transform='AgX'
scene.world.color=(.12,.12,.12)
def mat(name,color=0xffffff,emission=0,vertex=False):
    m=bpy.data.materials.new(name);m.diffuse_color=(*linear(color),1);m.use_nodes=True;m.use_backface_culling=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*linear(color),1)
    n.inputs['Roughness'].default_value=.47;n.inputs['Metallic'].default_value=.28
    if vertex:
        a=m.node_tree.nodes.new('ShaderNodeVertexColor');a.layer_name='Color'
        m.node_tree.links.new(a.outputs['Color'],n.inputs['Base Color'])
    if emission:
        n.inputs['Emission Color'].default_value=(*linear(color),1);n.inputs['Emission Strength'].default_value=emission
    return m
armor=mat('HT_Armor_VertexPalette',vertex=True)
eye_mat=mat('HT_Eye_Red_ff3d55',0xff3d55,3)
flash_mat=mat('HT_HitFlash_RuntimePlaceholder',0xffffff,2)
def empty(name,parent=None,pos=(0,0,0)):
    o=bpy.data.objects.new(name,None);asset.objects.link(o);o.parent=parent;o.location=B(pos);o.empty_display_size=.2;return o
root=empty('heavy-turret');root['asset_status']='INITIAL / pending_deferred_opus_review'
root['game_axes']='+Y up / +Z forward';root['gameplay_hp']=6;root['gameplay_radius']=3.4;root['gameplay_score']=400
turntable=empty('turntable',root,(0,1.5,0));turntable['runtime_rotation']='Three rotation.y yaw; unrestricted source damp'
left=empty('barrel-L',turntable,(-.675,.225,0));right=empty('barrel-R',turntable,(.675,.225,0))
for p in [left,right]: p['runtime_rotation']='Three rotation.x = damp(old,-sourcePitch,6,dt)'
eye=empty('eye',turntable,(0,.87,1.53));eye['runtime_scale']='1 resting; charging 1.25 + sin(time*24)*.2'
def rot(p,axis,a):
    x,y,z=p;c=math.cos(a);s=math.sin(a)
    return [(x,c*y-s*z,s*y+c*z),(c*x+s*z,y,-s*x+c*z),(c*x-s*y,s*x+c*y,z)][axis]
class Builder:
    def __init__(self):self.v=[];self.f=[];self.c=[];self.parts={}
    def add(self,name,v,f,color='armor',center=(0,0,0),axis=None,angle=0):
        start=len(self.v)
        if axis is not None:v=[rot(p,axis,angle) for p in v]
        self.v.extend([B(tuple(p[i]+center[i] for i in range(3))) for p in v])
        self.f.extend([tuple(start+i for i in face) for face in f]);self.c.extend([color]*len(f));self.parts[name]=list(range(start,len(self.v)))
    def box(self,name,center,size,color='armor',bevel=.04,axis=None,angle=0,tilt=0):
        # Chamfered rectangular prism, eight-point horizontal outline.
        x,y,z=[v/2 for v in size];b=min(bevel,x*.45,z*.45)
        ring=[(-x+b,-z),(x-b,-z),(x,-z+b),(x,z-b),(x-b,z),(-x+b,z),(-x,z-b),(-x,-z+b)]
        v=[(a,h,c) for h in [-y,y] for a,c in ring]
        if tilt:v=[rot(p,0,tilt) for p in v]
        f=[tuple(reversed(range(8))),tuple(range(8,16))]+[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]
        self.add(name,v,f,color,center,axis,angle)
    def ring(self,name,center,ro,ri,depth,n=24,color='steel',axis='y',r2=None):
        # Closed radial annulus / tapered annulus; axes use game coordinates.
        v=[]
        for h,r in [(-depth/2,ro),(-depth/2,ri),(depth/2,ri),(depth/2,r2 or ro)]:
            for i in range(n):
                a=2*math.pi*i/n;p=(r*math.cos(a),h,r*math.sin(a))
                if axis=='z':p=(p[0],p[2],p[1])
                if axis=='x':p=(p[1],p[0],p[2])
                v.append(p)
        f=[]
        for j in range(4):
            for i in range(n):f.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
        self.add(name,v,f,color,center)
    def disk(self,name,center,r,depth,n=12,color='steel',axis='y',r2=None):
        v=[]
        for h,rad in [(-depth/2,r),(depth/2,r2 or r)]:
            for i in range(n):
                a=2*math.pi*i/n;p=(rad*math.cos(a),h,rad*math.sin(a))
                if axis=='z':p=(p[0],p[2],p[1])
                if axis=='x':p=(p[1],p[0],p[2])
                v.append(p)
        f=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        self.add(name,v,f,color,center)
    def object(self,name,parent,material):
        mesh=bpy.data.meshes.new(name+'_editable');mesh.from_pydata(self.v,[],self.f);mesh.materials.append(material);mesh.update()
        # Fix winding / normals independently of generator outline direction.
        import bmesh
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
        if material==armor:
            attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
            for poly,col in zip(mesh.polygons,self.c):
                for j in poly.loop_indices:attr.data[j].color=(*linear(COL.get(col,0xffffff)),1)
        o=bpy.data.objects.new(name,mesh);asset.objects.link(o);o.parent=parent
        for name,indices in self.parts.items():o.vertex_groups.new(name=name).add(indices,1,'REPLACE')
        return o

# Fixed foundation: broad low octagonal skirt, raised segmented applique and tie-downs.
b=Builder()
b.ring('foundation-octagon',(0,.16,0),2.85,2.00,.32,16,'dark',r2=2.72)
b.ring('tapered-armored-plinth',(0,.6,0),2.65,1.95,.62,16,'armor',r2=2.28)
b.ring('upper-deck',(0,.965,0),2.28,1.95,.13,32,'top',r2=2.22)
b.ring('slew-recess',(0,1.045,0),2.18,1.93,.08,32,'black')
b.ring('slew-bearing',(0,1.11,0),2.12,1.91,.11,32,'steel')
for i in range(8):
    a=(i+.5)*math.tau/8;x,z=math.sin(a),math.cos(a)
    b.box(f'skirt-applique-{i}',(x*2.53,.60,z*2.53),(.92,.37,.13),'top',.085,1,a,tilt=-.54)
    b.box(f'foot-toe-{i}',(x*2.57,.22,z*2.57),(.66,.22,.35),'dark',.08,1,a)
    b.disk(f'tie-bolt-{i}',(x*2.49,.355,z*2.49),.075,.055,6,'warm')
    b.box(f'panel-key-{i}',(x*2.21,.77,z*2.21),(.24,.07,.12),'warm',.018,1,a)
b.object('foundation',root,armor)

# Low rotating deck and two outside cheeks leave the entire central pitch corridor open.
b=Builder()
b.ring('slew-top',(0,-.29,0),2.12,1.91,.18,32,'dark')
b.ring('yaw-rim',(0,-.19,0),2.10,1.93,.055,32,'warm')
for s in [-1,1]:
    b.box(f'cheek-foot-{s}',(s*1.36,-.15,-.05),(.66,.28,1.65),'dark',.12)
    b.box(f'outer-ring-bridge-{s}',(s*1.78,-.22,-.05),(.84,.18,.67),'steel',.10)
    b.box(f'armored-yoke-{s}',(s*1.32,.24,-.12),(.62,.86,1.27),'armor',.17)
    b.box(f'shoulder-cap-{s}',(s*1.32,.72,-.19),(.68,.15,1.05),'top',.15)
    b.box(f'side-applique-{s}',(s*1.66,.27,-.17),(.085,.5,.8),'top',.025)
    b.disk(f'seated-axle-{s}',(s*1.0,.225,0),.29,.55,16,'steel','x')
    b.disk(f'axle-outer-cap-{s}',(s*1.72,.225,0),.28,.12,12,'dark','x')
    b.disk(f'axle-lock-{s}',(s*1.79,.225,0),.17,.045,8,'warm','x')
    for j in range(4):
        b.box(f'cooling-gill-{s}-{j}',(s*1.665,.29,-.47+j*.19),(.018,.26,.075),'black',.008)
    b.box(f'forward-yoke-face-{s}',(s*1.31,.17,.554),(.45,.41,.055),'edge',.055)
    b.box(f'caution-notch-{s}',(s*1.31,.21,.586),(.17,.20,.012),'warm',.012)
# Narrow central eye support does not occupy either gun's swept x range.
b.box('sensor-spine',(0,.03,.91),(.26,.6,.35),'dark',.04)
b.box('rear-yoke-crossbeam',(0,-.12,-.78),(2.9,.26,.28),'dark',.05)
b.box('suspended-sensor-keel',(0,-.08,.25),(.25,.22,2.02),'steel',.035)
b.box('sensor-mast',(0,.50,1.21),(.22,1.05,.21),'steel',.035)
b.box('sensor-pod',(0,.87,1.43),(.69,.48,.43),'dark',.075)
b.box('sensor-brow',(0,1.14,1.49),(.73,.10,.44),'top',.055)
b.box('sensor-cheek-left',(-.32,.87,1.58),(.065,.34,.14),'warm',.018)
b.box('sensor-cheek-right',(.32,.87,1.58),(.065,.34,.14),'warm',.018)
dome=b.object('dome',turntable,armor)
for s,parent in [(-1,left),(1,right)]:
    b=Builder()
    b.disk('pitch-bearing',(0,0,0),.275,.47,16,'dark','x')
    b.box('breech-block',(0,0,.17),(.43,.43,.69),'dark',.075)
    b.box('upper-receiver',(0,.24,.27),(.4,.08,.53),'top',.045)
    b.disk('barrel-tube',(0,0,.91),.165,1.13,12,'steel','z',r2=.14)
    b.ring('rear-sleeve',(0,0,.59),.225,.17,.42,12,'armor','z')
    for j in range(3):b.ring(f'recoil-band-{j}',(0,0,.80+j*.19),.19,.16,.055,12,'dark','z')
    b.box('muzzle-brake',(0,0,1.46),(.43,.36,.28),'top',.055)
    b.ring('muzzle-lip',(0,0,1.609),.19,.115,.035,12,'edge','z')
    b.disk('recessed-dark-bore',(0,0,1.515),.113,.01,12,'black','z')
    for side in [-1,1]:
        for j in range(2):b.box(f'muzzle-port-{side}-{j}',(side*.217,0,1.40+j*.1),(.014,.14,.05),'black',.004)
    b.box('receiver-service-panel',(s*.223,0,.19),(.018,.28,.40),'armor',.015)
    b.box('rear-cap',(0,0,-.205),(.35,.32,.055),'steel',.035)
    b.object('weapon-'+('L' if s<0 else 'R'),parent,armor)
    muzzle=empty('muzzle-'+('L' if s<0 else 'R'),parent,(0,0,1.6));muzzle['diagnostic_only']='Actual shot uses predictive world aim from barrel pivot + aim*1.6. Never substitute this marker.'
b=Builder();b.box('charge-optic',(0,0,.106),(.47,.245,.12),'edge',.045)
b.object('charge-lens',eye,eye_mat)
flash_anchor=empty('flash-anchor',turntable)
flash_anchor['runtime']='Create additive dome shell under turntable, hidden except Enemy.flash>0; do not flash eye.'

# Editable hidden prototype is deliberately excluded from GLB (glTF has no core visibility).
flash_col=bpy.data.collections.new('HIDDEN_FLASH_PROTOTYPE_DO_NOT_EXPORT');scene.collection.children.link(flash_col)
flash=dome.copy();flash.data=dome.data.copy();flash_col.objects.link(flash);flash.name='hit-flash-prototype'
flash.data.materials.clear();flash.data.materials.append(flash_mat);flash.scale=(1.045,)*3
flash.hide_render=True;flash.hide_viewport=True;flash['runtime_hidden']=True
flash_col.hide_render=True
scene['requested_provider']='codex';scene['requested_model']='gpt-6.1-sol';scene['requested_reasoningEffort']='xhigh'
scene['speed']='available speed; no exposed fast-mode toggle; no fast-mode claim'
scene['formal_review_count']=0;scene['status']='pending_deferred_opus_review'
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
for o in bpy.context.selected_objects:o.select_set(False)
for o in asset.objects:o.select_set(True)
bpy.context.view_layer.objects.active=dome
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'heavy-turret.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'heavy-turret.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT')
print('HEAVY_TURRET_BUILT',str(OUT))
