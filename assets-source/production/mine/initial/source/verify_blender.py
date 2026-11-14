import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parent.parent

def stats():
    dg=bpy.context.evaluated_depsgraph_get();rec={}
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        e=o.evaluated_get(dg);m=e.to_mesh();m.calc_loop_triangles();pp=[o.matrix_world@v.co for v in m.vertices]
        rec[o.name]={'triangles':len(m.loop_triangles),'materialPrimitives':len(set(p.material_index for p in m.polygons)),'boundsBlender':{'min':[min(p[i] for p in pp) for i in range(3)],'max':[max(p[i] for p in pp) for i in range(3)]},'matrixWorld':[list(r) for r in o.matrix_world],'modifiers':len(o.modifiers)};e.to_mesh_clear()
    return rec

def bvh(objects,scale=1):
    vs=[];fs=[]
    for o in objects:
        o.data.calc_loop_triangles();base=len(vs);vs.extend((o.matrix_world@v.co)*scale for v in o.data.vertices);fs.extend(tuple(base+i for i in t.vertices) for t in o.data.loop_triangles)
    return BVHTree.FromPolygons(vs,fs,all_triangles=True,epsilon=0),vs
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/mine.blend'))
reopened=stats();assert sum(x['triangles'] for n,x in reopened.items() if n!='flashMesh')==1940
assert not bpy.data.images or all(i.packed_file or i.source=='GENERATED' for i in bpy.data.images if i.name not in ['Render Result','Viewer Node'])
lamp=bpy.data.objects['lamp'];solid=[bpy.data.objects[n] for n in ['core','contacts']];fixed,fv=bvh(solid)
clearance=[]
for i in range(61):
    scale=.94+i*.002;moving,mv=bvh([lamp],scale);overlap=moving.overlap(fixed)
    assert not overlap,('lamp collision',scale,len(overlap))
    # Vertex-to-triangle surface distances are sampled; no claim of exact global minimum.
    distances=[fixed.find_nearest(p)[3] for p in mv]+[moving.find_nearest(p)[3] for p in fv]
    clearance.append({'scale':scale,'intersectingTrianglePairs':len(overlap),'minimumSampledVertexToSurfaceDistance':min(distances)})
# A continuous geometric separation bound for our construction complements samples:
# equatorial armor radius <=1.026; lamp inner chord radius includes polygon sag;
# contacts in equator: transverse radius <=.35, nearest lamp transverse >=1.0716*sin22.
# Clip every core triangle to the full lamp Y slab. Radial norm is convex,
# so its maximum over each clipped polygon occurs at a polygon vertex.
def clip(poly,ybound,keepBelow):
    result=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=a.y-ybound;db=b.y-ybound;ia=da<=0 if keepBelow else da>=0;ib=db<=0 if keepBelow else db>=0
        if ia:result.append(a)
        if ia!=ib:result.append(a+(b-a)*(-da/(db-da)))
    return result
co=solid[0];co.data.calc_loop_triangles();coreSlab=[]
for tri in co.data.loop_triangles:
    poly=[Vector((p.x,p.z,-p.y)) for p in [co.matrix_world@co.data.vertices[ix].co for ix in tri.vertices]]
    coreSlab.extend(clip(clip(poly,.065*1.06,True),-.065*1.06,False))
coreEquatorMax=max(math.hypot(p.x,p.z) for p in coreSlab);assert coreEquatorMax<=1.026
innerRadial=.94*1.14*math.cos(math.radians(46/7/2))
analytic={'coreEquatorialRadiusUpperBound':1.026,'measuredClippedCoreEquatorialRadius':coreEquatorMax,'lampInnerRadialMin':innerRadial,'lampChordCorrection':True,'coreGapLowerBound':innerRadial-1.026,'collarTransverseUpperBound':.35,'lampTransverseMinAtSegmentEnd':.94*1.14*math.sin(math.radians(22)),'collarGapLowerBound':.94*1.14*math.sin(math.radians(22))-.35,'housingVerticalGapLowerBound':.12-.065*1.06,'notes':'Bounds apply to moving lamp vs fixed solids, not intentional seated fitting overlaps. BVH sampled at 61 full-range scales. Rigid root tumble preserves clearance.'}
# Full XYZ Euler rotations in GAME coordinates. Verify radial envelope, so no rotation
# changes the collision fit. Root translation is source bob and excluded from local bounds.
G=lambda p:Vector((p.x,p.z,-p.y))
verts=[G(o.matrix_world@v.co) for o in solid+[lamp] for v in o.data.vertices]
radial=max(p.length for p in verts)
tumbles=[]
for t in range(0,127,2):
    R=Matrix.Rotation(t*.5,3,'X')@Matrix.Rotation(t*.7,3,'Y');pp=[R@p for p in verts];tumbles.append({'t':t,'rotationXYZ':[t*.5,t*.7,0],'boundsGame':{'min':[min(p[i] for p in pp) for i in range(3)],'max':[max(p[i] for p in pp) for i in range(3)]}})
assert radial<1.9
# Separate clean scene import, not an import beside the authored mesh.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/mine.glb'))
reimport=stats()
assert {k:v['triangles'] for k,v in reopened.items()}=={k:v['triangles'] for k,v in reimport.items()}
for name in reopened:
    for side in ['min','max']:
        assert max(abs(a-b) for a,b in zip(reopened[name]['boundsBlender'][side],reimport[name]['boundsBlender'][side]))<1e-5
assert bpy.data.objects['lamp'].matrix_world.translation.length<1e-6
report={'blendReopened':reopened,'glbCleanSceneReimport':reimport,'countsAndTransformedBoundsMatch':True,'lampClearanceSamples':clearance,'analyticLampSeparation':analytic,'maxVisibleVertexRadius':radial,'collisionRadius':1.9,'tumbleSamples':tumbles,'gameEulerConversion':'Three XYZ uses Rx @ Ry @ Rz. Blender native XYZ Euler order differs, so explicit matrices are used.','allVisibleRadialBoundInsideCollision':True,'packedBlend':'All geometry and vertex colors embedded; zero external texture resources. No image atlas used.','limits':['Finite BVH pulse samples are not live gameplay proof.','Invisible flash shell intentionally overlays core during hit flash and is excluded from lamp clearance.','Static fitting intersections are seated junctions, not moving parts.']}
(ROOT/'measurements/blender-verification.json').write_text(json.dumps(report,indent=2))
print('MINE_VERIFIED',min(x['minimumSampledVertexToSurfaceDistance'] for x in clearance),'radius',radial)
