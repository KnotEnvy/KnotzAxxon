import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]


def snapshot():
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    triangles = 0
    positions = []
    primitives = 0
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(dependency_graph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        primitives += len({polygon.material_index for polygon in mesh.polygons})
        for vertex in mesh.vertices:
            point = obj.matrix_world @ vertex.co
            positions.append((point.x,point.z,-point.y))
        evaluated.to_mesh_clear()
    return {'evaluatedTriangles':triangles,'materialPrimitives':primitives,
            'objectNames':sorted(obj.name for obj in bpy.context.scene.objects),
            'materialNames':sorted(material.name for material in bpy.data.materials if material.users),
            'transformedBoundsGameYUp':{'min':[min(point[axis] for point in positions) for axis in range(3)],
                                        'max':[max(point[axis] for point in positions) for axis in range(3)]},
            'externalImages':[image.filepath for image in bpy.data.images if image.users and image.source == 'FILE' and not image.packed_file],
            'packedImageCount':sum(bool(image.packed_file) for image in bpy.data.images if image.users),
            'fileImagesUsed':sum(image.source == 'FILE' for image in bpy.data.images if image.users),
            'actionCount':len(bpy.data.actions)}


bpy.ops.wm.open_mainfile(filepath=str(ROOT/'cooling-stack.blend'))
saved = snapshot()
assert saved['evaluatedTriangles'] == 460 and saved['materialPrimitives'] == 3
assert not saved['externalImages'] and saved['fileImagesUsed'] == 0
assert bpy.data.objects['CS_CoolingStack'].data.attributes.get('_CS_HEIGHT') is not None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'cooling-stack.glb'))
reimported = snapshot()
assert reimported['evaluatedTriangles'] == saved['evaluatedTriangles']
assert reimported['materialPrimitives'] == saved['materialPrimitives']
assert reimported['materialNames'] == saved['materialNames']
assert set(saved['objectNames']) <= set(reimported['objectNames'])
for bound in ('min','max'):
    assert all(abs(original-reopened)<.00001 for original,reopened in zip(saved['transformedBoundsGameYUp'][bound],reimported['transformedBoundsGameYUp'][bound]))
report = {'status':'PASS','savedBlendReopened':saved,'cleanGLBReimport':reimported,'blender':bpy.app.version_string,
          'buildHash':bpy.app.build_hash.decode(),'packedBlend':'Self-contained zero-image .blend; no external files to pack.'}
(ROOT/'evidence/blender-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
