import bpy
import json
from pathlib import Path

WORK = Path(__file__).resolve().parents[1]


def measure():
    objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    points = []
    entries = []
    for obj in objects:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        entries.append({'name': obj.name, 'triangles': len(mesh.loop_triangles), 'material_slots': len(obj.material_slots), 'vertex_color_layers': list(mesh.color_attributes.keys()), 'modifiers': len(obj.modifiers)})
        for vertex in mesh.vertices:
            point = obj.matrix_world @ vertex.co
            points.append((point.x, point.z, -point.y))
        evaluated.to_mesh_clear()
    return {'parts': entries, 'triangles': sum(entry['triangles'] for entry in entries), 'bounds_source': {'min': [min(point[axis] for point in points) for axis in range(3)], 'max': [max(point[axis] for point in points) for axis in range(3)]}, 'external_images': [image.filepath for image in bpy.data.images if image.source == 'FILE' and not image.packed_file]}


bpy.ops.wm.open_mainfile(filepath=str(WORK / 'assets/missile.blend'))
blend = measure()
assert len(blend['parts']) == 6 and blend['triangles'] == 464
assert not blend['external_images']
assert bpy.data.objects['MISSILE_ROOT'].parent is None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(WORK / 'assets/missile.glb'))
reimport = measure()
assert len(reimport['parts']) == 1 and reimport['triangles'] == blend['triangles']
assert bpy.data.objects.get('MISSILE_ROOT') and bpy.data.objects.get('MISSILE_POOLED')
assert reimport['parts'][0]['material_slots'] == 1
for side in ['min', 'max']:
    assert max(abs(left - right) for left, right in zip(blend['bounds_source'][side], reimport['bounds_source'][side])) < 1e-5
report = {'blend_reopened': blend, 'glb_clean_scene_reimport': reimport, 'save_reopen_pass': True, 'no_corrective_normalization': True}
(WORK / 'evidence/blender-reopen-reimport.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
