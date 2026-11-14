"""Deterministic authored DR-3 clipped-shoulder unmanned drone. No imported geometry."""
import sys, math, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
reset()
H=material('DR_Hull_Oxide',0x995C48,.48,.42)
M=material('DR_Machinery_Slate',0x39495A,.62,.36)
T=material('DR_Trim_Titanium',0xB5B4A5,.60,.40)
K=material('DR_Canopy_Obsidian',0x151C29,.52,.24)
E=material('DR_Cue_Red_ff3d55',0xFF3D55,0,.28,2.3)
F=material('DR_Engine_Amber_ff9a3a',0xFF9A3A,0,.32,2.3)
root=empty('drone_root');root['asset']='DR-3 / Broad clipped-shoulder unmanned drone';root['stage']='pending_deferred_opus_review'
root['game_axes']='X across, Y up, +Z nose; Blender X,-Z,Y';root['gameplay_origin']='unchanged (0,0,0)'
parts=[]
def add(ob):parts.append(ob);return ob
def slab(name,outline,lo,hi,mat,bevel=.025):
    # Fitted perimeter chamfer, with a conforming variable height on shoulders.
    n=len(outline);cx=sum(p[0] for p in outline)/n;cz=sum(p[1] for p in outline)/n
    verts=[]
    for inset,height in [(bevel,lo),(0,lo+bevel),(0,hi-bevel),(bevel,hi)]:
        for x,z in outline:
            d=math.hypot(x-cx,z-cz);q=max(0,1-inset/max(d,.001))
            xx=cx+(x-cx)*q;zz=cz+(z-cz)*q
            yy=height(xx,zz) if callable(height) else height
            verts.append((xx,yy,zz))
    faces=[tuple(range(n-1,-1,-1)),tuple(range(3*n,4*n))]
    for j in range(3):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    return mesh(name,verts,faces,mat)
def plate(name,outline,mat,raise_y=.025):
    # Thin exact conforming upper skin; one clear physical fitted seam at the perimeter.
    n=len(outline);v=[(x,top_y(x,z)+offset,z) for offset in (.008,raise_y) for x,z in outline]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return add(mesh(name,v,f,mat))
def box(name,center,size,mat,bevel=.025):
    x,y,z=center;w,h,d=size
    return slab(name,[(x-w/2,z-d/2),(x+w/2,z-d/2),(x+w/2,z+d/2),(x-w/2,z+d/2)],y-h/2,y+h/2,mat,min(bevel,h*.28,w*.2,d*.2))
def tube(name,x,y,rings,mat,n=16):
    # Rings: (z, x-radius, y-radius). Open lips, intentional inner liner.
    v=[(x+rx*math.cos(i*2*math.pi/n),y+ry*math.sin(i*2*math.pi/n),z) for z,rx,ry in rings for i in range(n)]
    f=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
    return mesh(name,v,f,mat)
def disk(name,x,y,z,rx,ry,mat,n=24,depth=.03):
    v=[(x,y,z)]+[(x+rx*math.cos(i*2*math.pi/n),y+ry*math.sin(i*2*math.pi/n),z) for i in range(n)]
    f=[(0,i+1,(i+1)%n+1) for i in range(n)]
    # Visible back and the circumferential glow belt; no detached particles.
    v += [(x+rx*math.cos(i*2*math.pi/n),y+ry*math.sin(i*2*math.pi/n),z+depth) for i in range(n)]
    f += [(i+1,(i+1)%n+1,(i+1)%n+1+n,i+1+n) for i in range(n)]
    return mesh(name,v,f,mat)

# One continuous closed loft with fitted shoulders rather than independent floating wings.
stations=[(-1.53,.55,.17,-.25),(-1.04,2.30,.28,-.38),(-.67,2.68,.32,-.36),(-.15,2.80,.30,-.32),(.28,2.40,.28,-.24),(.63,.92,.25,-.20),(1.12,.45,.16,-.15),(1.32,.26,.075,-.11)]
def profile(w,t,b):
    return [(0,t),(.28*w,t*.91),(.60*w,.12+t*.10),(.92*w,.065),(w,.015),(w,-.04),(.60*w,b*.55),(0,b),(-.60*w,b*.55),(-w,-.04),(-w,.015),(-.92*w,.065),(-.60*w,.12+t*.10),(-.28*w,t*.91)]
def interp(x,xs,ys):
    if x<=xs[0]:return ys[0]
    for i in range(len(xs)-1):
        if x<=xs[i+1]:
            t=(x-xs[i])/(xs[i+1]-xs[i]);return ys[i]*(1-t)+ys[i+1]*t
    return ys[-1]
def top_y(x,z):
    arr=[]
    for zz,w,t,b in stations:arr.append(interp(abs(x),[0,.28*w,.60*w,.92*w,w],[t,t*.91,.12+t*.10,.065,.015]))
    return interp(z,[q[0] for q in stations],arr)
def bottom_y(x,z):
    arr=[interp(abs(x),[0,.6*w,w],[b,b*.55,-.04]) for zz,w,t,b in stations]
    return interp(z,[q[0] for q in stations],arr)
def belly_plate(name,outline,mat,depth=.028):
    n=len(outline);v=[(x,bottom_y(x,z)-offset,z) for offset in (.006,depth) for x,z in outline]
    f=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return add(mesh(name,v,f,mat))
v=[(x,y,z) for z,w,t,b in stations for x,y in profile(w,t,b)];n=14
f=[tuple(range(n-1,-1,-1)),tuple(range((len(stations)-1)*n,len(stations)*n))]
for j in range(len(stations)-1):
    for i in range(n):f.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
airframe=add(mesh('Continuous pressure airframe',v,f,H))

# Clipped shoulder service skins, edge wear strips, recessed intake cheeks and cooling fins.
for side,label in [(-1,'L'),(1,'R')]:
    def mirrored(points):return [(side*x,z) for x,z in points]
    plate('Shoulder inset '+label,mirrored([(1.12,.30),(2.22,.10),(2.55,-.19),(2.45,-.55),(2.18,-.81),(1.10,-.77)]),M,.023)
    plate('Shoulder armor '+label,mirrored([(1.20,.245),(2.16,.06),(2.43,-.20),(2.34,-.49),(2.13,-.70),(1.20,-.68)]),H,.039)
    plate('Clipped leading edge '+label,mirrored([(1.22,.26),(2.20,.075),(2.32,-.05),(2.20,-.10),(1.22,.12)]),T,.047)
    # Three broad vanes are designed to survive small-scale viewing.
    for j in range(3):
        z=-.30-j*.125
        plate('Shoulder heat slot '+label+str(j),mirrored([(1.47,z),(2.08,z-.035),(2.08,z-.085),(1.47,z-.052)]),K,.047)
    # Cheek duct is a true open mouth. Wide enough to show the dark inner wall.
    x=side*.77
    add(tube('Cheek duct armored lip '+label,x,.08,[(.67,.225,.165),(.53,.245,.19),(.27,.22,.15)],M,12))
    add(tube('Cheek duct inner recess '+label,x,.08,[(.675,.179,.12),(.41,.155,.105)],K,12))
    add(disk('Cheek intake dark back '+label,x,.08,.40,.155,.105,K,12))
    for j in [-1,0,1]:add(box('Intake grille '+label+str(j),(x+j*.092,.08,.59),(.022,.23,.045),T,.008))
    # Structural heat exchanger over aft shoulder root; intentional integrated attachments.
    add(box('Aft heat bed '+label,(side*.75,.235,-.77),(.35,.10,.63),M))
    for j in range(4):add(box('Aft radiator vane '+label+str(j),(side*.75,.315,-.52-j*.14),(.34,.075,.045),T,.008))
    plate('Service latch '+label,mirrored([(1.07,-.32),(1.19,-.33),(1.19,-.47),(1.07,-.46)]),T,.043)
    # Sparse serial identification bars, in the existing trim batch.
    for j in range(3):
        x=side*(2.16+j*.083)
        plate('Identification bar '+label+str(j),[(x,-.38),(x+side*.035,-.39),(x+side*.035,-.51),(x,-.50)],T,.053)

# Dorsal avionics fairing: no human cockpit; compact black sensor head and red cue.
add(slab('Dorsal sensor plinth',[(-.38,-.12),(-.30,.67),(-.21,1.12),(.21,1.12),(.30,.67),(.38,-.12)],.22,.46,M,.035))
add(slab('Dorsal sensor armor',[(-.28,-.10),(-.25,.65),(-.17,.98),(.17,.98),(.25,.65),(.28,-.10)],.32,.64,H,.035))
add(slab('Sensor ceramic crown',[(-.18,.12),(-.18,.66),(-.12,.91),(.12,.91),(.18,.66),(.18,.12)],.56,.72,K,.025))
add(tube('Sensor eye bezel',0,.40,[(1.11,.255,.155),(1.27,.235,.14),(1.28,.205,.105),(1.18,.202,.102)],M,16))
eye_obj=disk('Sensor red optical cue',0,.40,1.258,.192,.094,E,24,-.025)
eye=join([eye_obj],'eye',root,(0,.40,1.258));eye['runtime']='enemy.eye; cue #ff3d55; no gameplay aiming'

# Centerline open weapon mouth near the existing unrotated world spawn +1.5Z.
# Body ends at +1.32; the annular mouth reaches +1.49 and has an unobstructed center.
add(tube('Weapon annular housing',0,-.045,[(1.15,.235,.19),(1.40,.215,.175),(1.49,.185,.15),(1.49,.133,.108),(1.18,.133,.108)],M,16))
add(tube('Weapon inner bore',0,-.045,[(1.48,.131,.106),(1.07,.12,.095)],K,16))

# Open aft nozzle with a thick exhaust lip, recessed amber face, turbine vanes and spine saddle.
add(tube('Engine structural casing',0,-.035,[(-1.21,.46,.29),(-1.55,.43,.31),(-1.83,.39,.30),(-1.94,.37,.285),(-1.94,.31,.235),(-1.58,.30,.225)],M,24))
add(tube('Engine machined lip',0,-.035,[(-1.88,.39,.30),(-1.95,.37,.285),(-1.95,.32,.244),(-1.88,.34,.258)],T,24))
add(tube('Exhaust dark liner',0,-.035,[(-1.947,.315,.240),(-1.80,.29,.217)],K,24))
engine_glow=disk('Recessed amber thrust face',0,-.035,-1.895,.264,.193,F,32,.022)
engine=join([engine_glow],'engine',root,(0,-.035,-1.95));engine['runtime']='uniform scalar .97..1.03 normal, 1.015..1.065 launch; exhaust-local pivot'
for j in range(12):
    a=2*math.pi*j/12;cx=.309*math.cos(a);cy=-.035+.234*math.sin(a)
    add(box('Nozzle radial vane '+str(j),(cx,cy,-1.86),(.016,.016,.14),M,.003))
add(slab('Aft spine saddle',[(-.25,-1.50),(-.23,-.55),(.23,-.55),(.25,-1.50)],.255,.39,H,.025))
add(box('Spine inset', (0,.405,-1.06),(.10,.026,.51),K,.006))

# Fitted belly service hatch and heat rails remain legible during carrier bank.
# They follow the lower loft rather than hanging as unrelated boxes beneath it.
belly_plate('Ventral avionics service hatch',[(-.30,-1.15),(-.38,-.75),(-.28,.42),(-.15,.70),(.15,.70),(.28,.42),(.38,-.75),(.30,-1.15)],M,.040)
for side in [-1,1]:
    belly_plate('Belly heat rail '+str(side),[(side*.15,-1.04),(side*.22,-.78),(side*.17,.28),(side*.105,.37),(side*.09,-.80)],T,.052)
for j in range(3):
    zz=-.70+j*.22
    belly_plate('Ventral service recess '+str(j),[(-.085,zz),(-.085,zz+.07),(.085,zz+.07),(.085,zz)],K,.054)

body=join(parts,'body',root);body['runtime']='enemy.body, static fitted assemblies; four merged material batches'
# Only the main shell is cloned for flash, exactly as current Flyer bodyGeo does.
shell=mesh('flash_shell',v,f,H,root);shell.data.name='Flash envelope main loft';shell.data.materials.clear();shell.scale=(1.04,)*3
flash=material('DR_Flash_White',0xFFFFFF,0,.5,1);shell.data.materials.append(flash)
shell.hide_render=True;shell.hide_set(True);shell['runtime']='hidden except hit; bind enemy.flashMesh and enemy.flashMat; runtime additive opacity, depthWrite false, toneMapped false, renderOrder 5'
empty('axis_nose_plusZ',root,(0,0,2));empty('axis_up_plusY',root,(0,1,0))
empty('weapon_mouth_reference',root,(0,-.045,1.49));empty('shot_world_offset_reference',root,(0,0,1.5))
bpy.context.view_layer.update()
stats_body=stats([body,eye,engine]);stats_shell=stats([shell]);dump('build_evaluated.json',{'visible':stats_body,'hidden_flash':stats_shell,'all_bounds':bounds([body,eye,engine,shell]),'blender_version':bpy.app.version_string,'engine_pivot_game':list(G(engine.location)),'eye_pivot_game':list(G(eye.location)),'static_material_slots':[m.name for m in body.data.materials]})
assert stats_body['triangles']<=6000 and stats_body['material_primitives']<=6
assert len(body.data.materials)==4
bpy.ops.object.select_all(action='DESELECT')
for ob in [root,body,eye,engine]+[o for o in root.children if o.type=='EMPTY']:ob.select_set(True)
# glTF has no generic node visibility. Deliver the hidden shell in blend; export as a
# separate GLB scene selected explicitly by integration (never default-rendered).
shell.hide_set(False);shell.select_set(True)
bpy.context.scene['authored_asset']='DR-3, new deterministic geometry, initial pending deferred Opus review'
shell.hide_set(True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'drone.blend'),compress=True)
shell.hide_set(False);shell.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'drone.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',export_normals=True,export_texcoords=False,export_attributes=False)
from glb_audit import separate_flash,audit
separate_flash(OUT/'drone.glb');audit(OUT/'drone.glb')
print('DRONE_BUILD_COMPLETE',json.dumps(stats_body))
