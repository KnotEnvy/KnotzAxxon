import bpy
import hashlib
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]


def measured(objects):
    graph=bpy.context.evaluated_depsgraph_get()
    positions=[]
    parts=[]
    for obj in objects:
        if obj.type!='MESH':
            continue
        evaluated=obj.evaluated_get(graph)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        parts.append(dict(name=obj.name,triangles=len(mesh.loop_triangles),materials=[material.name for material in obj.data.materials]))
        for vertex in mesh.vertices:
            point=obj.matrix_world@vertex.co
            positions.append((point.x,point.z,-point.y))
        evaluated.to_mesh_clear()
    bounds=[[min(point[axis] for point in positions) for axis in range(3)],[max(point[axis] for point in positions) for axis in range(3)]]
    return dict(parts=parts,triangles=sum(part['triangles'] for part in parts),bounds=bounds)


bpy.ops.wm.open_mainfile(filepath=str(ROOT/'asset/fortress-fuel-depot.blend'))
collection=bpy.data.collections['DEPOT_SOURCE_EDITABLE']
blend=measured(list(collection.objects))
assert blend['triangles']==992
assert len({material for part in blend['parts'] for material in part['materials']})==2
assert len(blend['parts'])==len({part['name'] for part in blend['parts']})
assert not [image for image in bpy.data.images if image.source=='FILE' and not image.packed_file]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'asset/fortress-fuel-depot.glb'))
reimport=measured(list(bpy.context.scene.objects))
assert reimport['triangles']==992
assert len(reimport['parts'])==2
for first,second in zip(blend['bounds'],reimport['bounds']):
    assert max(abs(first_component-second_component) for first_component,second_component in zip(first,second))<1e-5
report=dict(blender=bpy.app.version_string,buildHash=bpy.app.build_hash.decode(),reopenedBlend=blend,cleanGLBReimport=reimport,packedNoExternalImageDependencies=True,passed=True)
(ROOT/'evidence/blender-reopen-reimport.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
