"""Authored initial interceptor. Game units: X right, Y up, nose +Z.
Run from repository: asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/build.py
No geometry is imported, copied or derived from another generator.
"""
import bpy, bmesh, math, json, sys
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parents[1]
OUT.mkdir(parents=True,exist_ok=True)
def cv(p): return (p[0],-p[2],p[1])
def linear(h):
 c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
 return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)
def material(name,h,metal,rough,emission=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');c=linear(h)
 p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 m.diffuse_color=(*c,1);m.use_backface_culling=True
 return m
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):bpy.data.materials.remove(m)
M=[material('INT_Hull','73838b',.56,.34),material('INT_Machinery','202b35',.72,.36),material('INT_Accent','9b5140',.48,.38),material('INT_Canopy','141c30',.7,.20),material('INT_Cue','ff3d55',.05,.25,3),material('INT_Emission','ff5a3a',.05,.27,3)]
FLASH=material('INT_HitFlash','ffffff',0,1)
root=bpy.data.objects.new('interceptor',None);bpy.context.collection.objects.link(root)
root['asset']='ENEMY INTERCEPTOR';root['stage']='pending_deferred_opus_review';root['game_axes']='X lateral / Y up / +Z nose';root['geometry_seed']=0
root['hp']=2;root['score']=320;root['collision_radius']=2.2;root['detach']='N/A; existing explosion/wreck lifecycle'
class Mesh:
 def __init__(self):self.v=[];self.f=[];self.m=[]
 def add(self,v,f,mat=0):
  n=len(self.v);self.v.extend(v);self.f.extend([tuple(n+i for i in face) for face in f]);self.m.extend([mat]*len(f) if isinstance(mat,int) else mat)
 def loft(self,rings,mat=0,n=8):
  # z, x center, y center, halfwidth, upper depth, lower depth; bevelled octagonal airframe.
  v=[]
  for z,x,y,w,t,b in rings:
   v.extend([(x+w*math.cos(a),y+(t if math.sin(a)>=0 else b)*math.sin(a),z) for a in [2*math.pi*k/n for k in range(n)]])
  f=[tuple(range(n-1,-1,-1))]
  for j in range(len(rings)-1):
   for k in range(n):f.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k))
  f.append(tuple(range((len(rings)-1)*n,len(rings)*n)));self.add(v,f,mat)
 def panel(self,poly,y0,y1,mat=0,edge=1,bevel=.035):
  # True solid plate with bevelled perimeter, rather than paper-thin floating panels.
  n=len(poly);cx=sum(x for x,z in poly)/n;cz=sum(z for x,z in poly)/n
  inset=[(x+(cx-x)*bevel,z+(cz-z)*bevel) for x,z in poly]
  v=[(x,y0,z) for x,z in poly]+[(x,y1-.018,z) for x,z in poly]+[(x,y1,z) for x,z in inset]
  f=[tuple(range(n-1,-1,-1))];m=[edge]
  for j in range(2):
   for k in range(n):f.append((j*n+k,j*n+(k+1)%n,(j+1)*n+(k+1)%n,(j+1)*n+k));m.append(edge if j==0 else mat)
  f.append(tuple(range(2*n,3*n)));m.append(mat);self.add(v,f,m)
 def box(self,c,sz,mat=1):
  x,y,z=c;w,h,d=[a/2 for a in sz];self.add([(x+a*w,y+b*h,z+c*d) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat)
 def tube(self,center,sections,mat=1,n=20,caps=False):
  # Annular axial duct: sections = z offset, outside radius, inside radius.
  x,y,z=center;v=[]
  for zz,ro,ri in sections:
   for r in [ro,ri]:v.extend([(x+r*math.cos(2*math.pi*k/n),y+r*math.sin(2*math.pi*k/n),z+zz) for k in range(n)])
  f=[]
  for j in range(len(sections)-1):
   for s in range(2):
    for k in range(n):a=j*2*n+s*n+k;b=j*2*n+s*n+(k+1)%n;f.append((a,b,b+2*n,a+2*n))
  for j in [0,len(sections)-1]:
   for k in range(n):a=j*2*n+k;b=j*2*n+(k+1)%n;f.append((a,a+n,b+n,b))
  self.add(v,f,mat)
 def object(self,name,parent=root,pivot=(0,0,0),materials=M):
  mesh=bpy.data.meshes.new(name+'-geometry');mesh.from_pydata([cv(tuple(v[i]-pivot[i] for i in range(3))) for v in self.v],[],self.f);mesh.update()
  for m in materials:mesh.materials.append(m)
  for p,m in zip(mesh.polygons,self.m):p.material_index=m
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();mesh.update()
  o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.parent=parent;o.location=cv(pivot);return o
B=Mesh()
# Narrow structural center body: smoothly stepped cross sections fitted into the wing roots.
B.loft([(-1.55,0,-.035,.40,.25,.25),(-1.17,0,-.02,.55,.32,.29),(-.52,0,0,.64,.36,.34),(.28,0,0,.53,.35,.29),(.92,0,.04,.35,.25,.20),(1.22,0,.06,.26,.18,.17)],0)
# Swept blades carry a thick structural edge, inset armor and restrained red oxide marking.
for s in [-1,1]:
 def poly(a):return [(s*x,z) for x,z in a]
 wing=[(.40,.68),(.80,.51),(2.86,-1.00),(2.78,-1.35),(2.38,-1.37),(.52,-.67)]
 B.panel(poly(wing),-.13,.095,0,1,.045)
 B.panel(poly([(.87,.34),(2.58,-.99),(2.36,-1.12),(.79,-.55)]),.096,.122,1,1,.035)
 B.panel(poly([(.97,.28),(2.44,-.88),(2.31,-.96),(.94,-.45)]),.123,.147,0,0,.028)
 # Small tip identifier, broad enough to survive game minification.
 B.panel(poly([(2.47,-.80),(2.73,-.97),(2.68,-1.19),(2.44,-1.13)]),.10,.143,2,2,.02)
 # Inner shoulder fairing links intake to blade, no detachable pieces.
 B.loft([(-1.05,s*.65,-.055,.19,.21,.20),(-.53,s*.70,-.025,.24,.25,.24),(.22,s*.63,0,.21,.25,.21),(.58,s*.54,0,.19,.20,.19)],0)
 # Deep inlet collar facing forward (+Z), with separate throat and vanes.
 B.tube((s*.55,0,.59),[(-.20,.185,.132),(-.02,.205,.143),(.04,.187,.139)],1,12)
 B.loft([(.395,s*.55,0,.132,.132,.132),(.40,s*.55,0,.132,.132,.132)],1,12)
 for y in [-.065,0,.065]:B.box((s*.55,y,.492),(.245,.022,.062),1)
 # Cooling louvers are in a fitted dark bed on the engine shoulders.
 B.panel(poly([(.47,-.72),(.83,-.80),(.86,-.20),(.53,-.10)]),.208,.233,1,1,.02)
 for i in range(5):B.box((s*(.65+i*.005),.244,-.23-i*.095),(.27,.029,.034),0)
 # Rear swept vertical stabilizer (side surface, authored cross-section loft).
 fin=[(s*.47,.19,-1.33),(s*.55,.74,-1.48),(s*.58,.69,-.97),(s*.57,.22,-.42)]
 vv=[(x-s*.028,y,z) for x,y,z in fin]+[(x+s*.028,y,z) for x,y,z in fin]
 B.add(vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],[0,0,1,2,0,1])
 # Nose cheek rails form an open centerline weapon channel at the fixed +1.5 spawn.
 B.loft([(.90,s*.285,-.015,.105,.16,.15),(1.25,s*.26,-.005,.10,.16,.14),(1.72,s*.225,0,.07,.115,.115),(1.98,s*.205,0,.028,.06,.06)],0)
 B.panel(poly([(.30,1.16),(.355,1.14),(.281,1.69),(.23,1.77)]),.12,.145,2,2,.02)
# Dorsal canopy has a dedicated glass surface inside a dark frame.
B.loft([(-.62,0,.27,.24,.10,.07),(-.27,0,.32,.31,.25,.08),(.28,0,.32,.25,.28,.075),(.79,0,.24,.15,.12,.06)],1)
B.loft([(-.52,0,.305,.195,.085,.025),(-.23,0,.355,.258,.20,.025),(.26,0,.352,.207,.213,.024),(.69,0,.275,.115,.09,.018)],3)
# Canopy center mullion and a fitted brow continue the spine toward the sensor.
B.loft([(-.53,0,.37,.022,.022,.02),(-.24,0,.565,.022,.021,.02),(.26,0,.577,.021,.022,.02),(.70,0,.363,.018,.022,.02)],0)
B.loft([(.70,0,.26,.14,.08,.06),(1.11,0,.235,.18,.09,.06),(1.46,0,.225,.19,.075,.035)],1)
# Recessed rear nozzle with concentric heat collar and visible petal structure.
B.tube((0,-.035,-1.50),[(.10,.37,.28),(-.17,.385,.315),(-.38,.35,.315)],1,20)
B.tube((0,-.035,-1.50),[(-.20,.386,.354),(-.27,.39,.35),(-.33,.365,.335)],2,20)
for k in range(16):
 a=k*2*math.pi/16;d=.045
 B.add([(r*math.cos(t),-.035+r*math.sin(t),z) for r,z,t in [(.363,-1.69,a-d),(.363,-1.69,a+d),(.337,-1.886,a+d),(.337,-1.886,a-d)]],[(0,1,2,3)],0)
# Wing root fastening pads and machined countersunk fastener faces.
for s in [-1,1]:
 for x,z in [(1.01,-.42),(1.51,-.70),(2.08,-.99)]:
  # Recessed washer in the wing XZ plane (axial direction game Y).
  vs=[]
  for y,r in [(.147,.033),(.155,.033),(.155,.014)]:
   vs.extend([(s*x+r*math.cos(k*math.pi/4),y,z+r*math.sin(k*math.pi/4)) for k in range(8)])
  fs=[]
  for j in range(2):
   for k in range(8):fs.append((j*8+k,j*8+(k+1)%8,(j+1)*8+(k+1)%8,(j+1)*8+k))
  fs.append(tuple(range(16,24)));B.add(vs,fs,1)
 # Underbody keel links wing loads to fuselage.
 B.loft([(-1.17,s*.23,-.24,.08,.05,.10),(-.35,s*.29,-.29,.09,.05,.10),(.67,s*.20,-.19,.06,.05,.10)],1)
body=B.object('body');body['role']='Rigid airframe; four merged material primitives; no body animation'
# Eye sits above the shot tunnel; red cue remains intentionally different from exhaust.
E=Mesh();E.loft([(1.438,0,.245,.145,.045,.043),(1.488,0,.245,.145,.045,.043)],4,12)
eye=E.object('eye',pivot=(0,.245,1.463));eye['cue_color_srgb']='#ff3d55'
G=Mesh();G.loft([(-1.80,0,-.035,.265,.265,.265),(-1.84,0,-.035,.268,.268,.268)],5,20)
engine=G.object('engine',pivot=(0,-.035,-1.84));engine['normal_scale']='0.97..1.03';engine['launch_scale']='1.015..1.065';engine['cue_color_srgb']='#ff5a3a'
# A dedicated silhouette shell is present but guaranteed invisible in a generic glTF viewer.
# glTF has no standard visibility bit: zero rest scale is intentional. Adapter sets scale=1.018 and visible=false.
H=Mesh();selected=[(f,m) for f,m in zip(B.f,B.m) if m==0]
H.v=B.v.copy();H.f=[f for f,m in selected];H.m=[0]*len(H.f)
shell=H.object('hit-flash-shell',materials=[FLASH]);shell.scale=(0,0,0);shell.hide_render=True;shell.hide_set(True)
shell['initialVisible']=False;shell['activation_scale']=1.018;shell['role']='Set unit activation scale, then existing additive Enemy flash controls visibility/opacity; no gameplay collision'
for name,p in [('nose-forward',(0,0,1.98)),('up-reference',(0,.74,0)),('shot-spawn-rest',(0,0,1.5)),('gameplay-origin',(0,0,0))]:
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=root;o.location=cv(p);o.empty_display_size=.08
# Keep an editable, packed scene with named semantic parts; lights/cameras are evidence-only.
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.threads_mode='FIXED';scene.render.threads=4
scene.world.color=(.03,.03,.03)
scene['coordinate_conversion']='Blender=(game.x,-game.z,game.y); exporter Y-up produces identity game frame'
scene['review_status']='INITIAL; pending deferred Opus review; formal reviews=0; formal review fix passes=0'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'interceptor.blend'))
# Export zero-scale shell as an explicit node, do not rely on renderer visibility metadata.
shell.hide_set(False);shell.hide_render=False
for o in bpy.context.scene.objects:o.select_set(o==root or o.parent==root)
bpy.context.view_layer.objects.active=body
bpy.ops.export_scene.gltf(filepath=str(OUT/'interceptor.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT')
shell.hide_render=True;shell.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'interceptor.blend'))
print('INTERCEPTOR_BUILD_COMPLETE',OUT)
