import bpy
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd()))
OUT = ROOT / 'asset-work/antenna/initial'


def audit():
    bounds = [[float('inf')] * 3, [-float('inf')] * 3]
    triangles = 0
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        for vertex in mesh.vertices:
            world = obj.matrix_world @ vertex.co
            point = (world.x, world.z, -world.y)
            for axis in range(3):
                bounds[0][axis] = min(bounds[0][axis], point[axis])
                bounds[1][axis] = max(bounds[1][axis], point[axis])
        meshes.append({ 'name': obj.name, 'triangles': len(mesh.loop_triangles), 'materials': [slot.material.name for slot in obj.material_slots], 'vertexGroups': [group.name for group in obj.vertex_groups], 'transform': [list(row) for row in obj.matrix_world] })
        evaluated.to_mesh_clear()
    return { 'triangles': triangles, 'worldBoundsGameAxes': bounds, 'meshes': meshes, 'packedImages': [image.name for image in bpy.data.images if image.packed_file], 'sceneObjects': len(bpy.context.scene.objects) }


bpy.ops.wm.open_mainfile(filepath=str(OUT / 'asset/fortress-antenna.blend'))
reopened = audit()
assert reopened['triangles'] == 304
assert len(reopened['meshes']) == 2
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT / 'asset/fortress-antenna.glb'))
reimport = audit()
assert reimport['triangles'] == 304
assert len(reimport['meshes']) == 2
for axis in range(3):
    for side in range(2):
        assert abs(reopened['worldBoundsGameAxes'][side][axis] - reimport['worldBoundsGameAxes'][side][axis]) < 1e-5
(OUT / 'evidence/blender-reopen-clean-reimport.json').write_text(json.dumps({ 'status': 'PASS', 'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'reopenedBlend': reopened, 'cleanGLBReimport': reimport }, indent=2))
print('ANTENNA_REOPEN_REIMPORT_PASS', reopened['triangles'], reimport['triangles'])
