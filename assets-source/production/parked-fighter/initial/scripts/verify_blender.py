import bpy
import json
import pathlib
from mathutils import Matrix, Vector

ROOT=pathlib.Path(__file__).resolve().parents[1]
binary_report=json.loads((ROOT/'evidence/glb_binary_report.json').read_text())

def measure(objects):
    points=[]
    triangles=0
    primitives=0
    nodes=[]
    depsgraph=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        nodes.append({'name':obj.name,'location_blender':list(obj.location),'rotation_blender_euler':list(obj.rotation_euler),'scale':list(obj.scale),'parent':obj.parent.name if obj.parent else None})
        if obj.type!='MESH':
            continue
        evaluated=obj.evaluated_get(depsgraph)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles+=len(mesh.loop_triangles)
        primitives+=len(set(polygon.material_index for polygon in mesh.polygons))
        for vertex in mesh.vertices:
            point=evaluated.matrix_world@vertex.co
            points.append((point.x,point.z,-point.y))
        evaluated.to_mesh_clear()
    minimum=[min(point[axis] for point in points) for axis in range(3)]
    maximum=[max(point[axis] for point in points) for axis in range(3)]
    return {'triangles':triangles,'materialPrimitives':primitives,'bounds_game':{'min':minimum,'max':maximum,'size':[maximum[axis]-minimum[axis] for axis in range(3)]},'nodes':nodes}

bpy.ops.wm.open_mainfile(filepath=str(ROOT/'build/parked-fighter.blend'))
reopened=measure(list(bpy.data.collections['RUNTIME_export_only'].objects))
reopened['editablePartCount']=len(bpy.data.collections['EDITABLE_PARTS_not_exported'].objects)
reopened['externalImages']=[image.filepath for image in bpy.data.images if image.source=='FILE' and not image.packed_file]
reopened['version']=bpy.app.version_string
reopened['build']=bpy.app.build_hash.decode()
assert reopened['editablePartCount']==103
assert not reopened['externalImages']
assert reopened['triangles']==binary_report['triangles']
assert reopened['materialPrimitives']==5
for axis in range(3):
    assert abs(reopened['bounds_game']['min'][axis]-binary_report['bounds']['min'][axis])<1e-5
    assert abs(reopened['bounds_game']['max'][axis]-binary_report['bounds']['max'][axis])<1e-5
contract=json.loads((ROOT/'source/source_contract.json').read_text())
conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
motion=[]
for state in contract['samples']:
    root=bpy.data.objects['parked_fighter']
    root.location=(state['pos'][0],-state['pos'][2],state['pos'][1])
    game_rotation=Matrix.Rotation(state['pitch'],4,'X')@Matrix.Rotation(state['yaw'],4,'Y')
    root.rotation_euler=(conversion@game_rotation@conversion.inverted()).to_euler()
    bpy.data.objects['engine'].scale=(state['engineScale'],)*3
    bpy.context.view_layer.update()
    objects=[obj for obj in bpy.data.collections['RUNTIME_export_only'].objects if obj.name!='beacon_lens' or state['beaconVisible']]
    actual=measure(objects)
    expected=next(sample for sample in binary_report['sourceMotionTransformedBounds'] if sample['label']==state['label'])
    maximum_delta=max(abs(actual['bounds_game'][bound][axis]-expected['bounds'][bound][axis]) for bound in ['min','max'] for axis in range(3))
    assert maximum_delta<5e-5,(state['label'],maximum_delta)
    motion.append({'label':state['label'],'bounds_game':actual['bounds_game'],'maximumDeltaFromIndependentGLB':maximum_delta})
bpy.ops.wm.read_factory_settings(use_empty=True)
assert len(bpy.data.objects)==0
bpy.ops.import_scene.gltf(filepath=str(ROOT/'build/parked-fighter.glb'))
reimport=measure(list(bpy.data.objects))
assert reimport['triangles']==binary_report['triangles']
assert reimport['materialPrimitives']==5
for axis in range(3):
    assert abs(reimport['bounds_game']['min'][axis]-binary_report['bounds']['min'][axis])<1e-5
    assert abs(reimport['bounds_game']['max'][axis]-binary_report['bounds']['max'][axis])<1e-5
report={'savedBlendReopened':True,'cleanSceneGLBReimported':True,'noExternalDependencies':True,'sourceMotionSamplesMatchedIndependentGLB':motion,'sourceEulerOrderVerified':'Three XYZ with pitch/yaw is Rx @ Ry; explicitly converted to Blender basis, not Mathutils Euler XYZ angles.','axisConversionVerified':'Blender (x,-gameZ,gameY), glTF exports (x,gameY,gameZ). Engine/beacon local transforms confirmed independently by binary parser.','reopened':reopened,'reimport':reimport}
(ROOT/'evidence/blender_verification.json').write_text(json.dumps(report,indent=2))
print('PASS saved blend reopen, editable source parts, clean-scene GLB import, evaluated triangles/material primitives/bounds, axes')
