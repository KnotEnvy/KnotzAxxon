import bpy
import hashlib
import json
import math
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]


def audit():
    bounds=[[math.inf]*3,[-math.inf]*3]
    triangles=0
    meshes=[]
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':
            continue
        evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles+=len(mesh.loop_triangles)
        for vertex in mesh.vertices:
            world=obj.matrix_world@vertex.co
            point=[world.x,world.z,-world.y]
            assert all(math.isfinite(value) for value in point)
            for axis,value in enumerate(point):
                bounds[0][axis]=min(bounds[0][axis],value)
                bounds[1][axis]=max(bounds[1][axis],value)
        meshes.append({'name':obj.name,'triangles':len(mesh.loop_triangles),'materialNames':[slot.material.name for slot in obj.material_slots],'worldMatrix':[list(row) for row in obj.matrix_world]})
        evaluated.to_mesh_clear()
    return {'triangles':triangles,'transformedGameBounds':bounds,'meshes':meshes,'externalImages':[image.filepath for image in bpy.data.images if image.source=='FILE' and not image.packed_file]}


bpy.ops.wm.open_mainfile(filepath=str(OUT/'asset/fortress-bunker.blend'))
reopened=audit()
assert reopened['triangles']==468 and len(reopened['meshes'])==52
assert not reopened['externalImages']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'asset/fortress-bunker.glb'))
clean=audit()
assert clean['triangles']==468 and len(clean['meshes'])==3
for side in range(2):
    for axis in range(3):
        assert abs(clean['transformedGameBounds'][side][axis]-reopened['transformedGameBounds'][side][axis])<1e-5
(OUT/'evidence/blender-reopen-clean-reimport.json').write_text(json.dumps({'status':'PASS','blender':bpy.app.version_string,'buildHash':bpy.app.build_hash.decode(),'inputSHA256':{name:hashlib.sha256((OUT/'asset'/name).read_bytes()).hexdigest() for name in ['fortress-bunker.blend','fortress-bunker.glb']},'reopenedBlend':reopened,'cleanGLBReimport':clean},indent=2))
print('BUNKER_REOPEN_CLEAN_REIMPORT_PASS',reopened['triangles'],clean['triangles'])
