import bpy
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def inspect():
    dependency=bpy.context.evaluated_depsgraph_get()
    result={'triangles':0,'meshObjects':0,'bounds':{'min':[float('inf')]*3,'max':[float('-inf')]*3},'meshNames':[]}
    for obj in bpy.context.scene.objects:
        if obj.type!='MESH':
            continue
        evaluated=obj.evaluated_get(dependency)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        result['triangles']+=len(mesh.loop_triangles)
        result['meshObjects']+=1
        result['meshNames'].append(obj.name)
        for vertex in mesh.vertices:
            world=obj.matrix_world@vertex.co
            game=(world.x,world.z,-world.y)
            for axis in range(3):
                result['bounds']['min'][axis]=min(result['bounds']['min'][axis],game[axis])
                result['bounds']['max'][axis]=max(result['bounds']['max'][axis],game[axis])
        evaluated.to_mesh_clear()
    return result


bpy.ops.wm.open_mainfile(filepath=str(ROOT/'asset/dreadnought.blend'))
blend=inspect()
assert blend['triangles']==16698
external_images=[image.name for image in bpy.data.images if image.source in {'FILE','TILED','MOVIE','SEQUENCE'} and image.users>0]
assert not external_images
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'asset/dreadnought.glb'))
reimport=inspect()
assert reimport['triangles']==blend['triangles']
for side in ['min','max']:
    for actual,expected in zip(reimport['bounds'][side],blend['bounds'][side]):
        assert abs(actual-expected)<.001,(actual,expected)
result={'saved_blend_reopened':blend,'clean_scene_glb_reimport':reimport,'packed_external_files':0,
        'packed_note':'No image textures or external linked resources; geometry/material-only .blend is self-contained.',
        'evaluated_triangle_scope':'All actual saved mesh objects, not a selection. Render fixtures and shipped player are not saved into the deliverable blend.',
        'blender':bpy.app.version_string,'build_hash':bpy.app.build_hash.decode()}
(ROOT/'checks/blender-reopen-reimport.json').write_text(json.dumps(result,indent=2)+'\n')
print('REOPEN_REIMPORT_PASS',blend['triangles'],reimport['bounds'])
