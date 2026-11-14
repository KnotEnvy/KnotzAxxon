import bpy
import json
import pathlib

HOME = pathlib.Path(__file__).resolve().parents[1]


def inspect():
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    points = [obj.matrix_world @ vertex.co for obj in objects for vertex in obj.data.vertices]
    return {'objects':len(objects),'triangles':sum(len(polygon.vertices)-2 for obj in objects for polygon in obj.data.polygons),'materials':sorted({material.name for obj in objects for material in obj.data.materials}),'gameBounds':{'min':[min(point[axis] for point in points) for axis in [0,2]]+[min(-point.y for point in points)],'max':[max(point[axis] for point in points) for axis in [0,2]]+[max(-point.y for point in points)]},'meshNames':sorted(obj.name for obj in objects),'externalImages':[image.filepath for image in bpy.data.images if image.source=='FILE' and not image.packed_file],'transformsIdentity':all(all(abs(obj.matrix_world[row][column]-(1 if row==column else 0))<1e-6 for row in range(4) for column in range(4)) for obj in objects)}


bpy.ops.wm.open_mainfile(filepath=str(HOME / 'asset' / 'covered-fighter.blend'))
saved = inspect()
assert saved['triangles'] == 1372 and saved['objects'] == 43
assert not saved['externalImages'] and saved['transformsIdentity']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(HOME / 'asset' / 'covered-fighter.glb'))
imported = inspect()
assert imported['triangles'] == saved['triangles']
assert imported['objects'] == saved['objects']
assert imported['meshNames'] == saved['meshNames']
assert not imported['externalImages'] and imported['transformsIdentity']
for label in ['min','max']:
    assert all(abs(first-second)<1e-5 for first,second in zip(saved['gameBounds'][label],imported['gameBounds'][label]))
report = {'status':'pass','reopenedSavedBlend':saved,'factoryCleanGlbImport':imported,'blender':bpy.app.version_string,'hash':bpy.app.build_hash.decode(),'renderer':'BLENDER_EEVEE','packedAssetNoExternalDependencies':True}
(HOME / 'evidence' / 'blender-reopen-reimport.json').write_text(json.dumps(report,indent=2)+'\n')
print('REOPEN_REIMPORT_PASS',saved['triangles'],saved['objects'])
