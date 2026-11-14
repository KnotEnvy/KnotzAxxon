import json
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[1]


def inspect():
    report = []
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        mesh = obj.to_mesh()
        mesh.calc_loop_triangles()
        world = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        points = [(point.x, point.z, -point.y) for point in world]
        report.append(dict(name=obj.name, triangles=len(mesh.loop_triangles), primitives=len(mesh.materials), vertices=len(mesh.vertices), bounds=dict(min=[min(point[axis] for point in points) for axis in range(3)], max=[max(point[axis] for point in points) for axis in range(3)]), has_editable_part_ids='cargo_part_id' in mesh.attributes, vertex_groups=len(obj.vertex_groups)))
        obj.to_mesh_clear()
    return report


bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'asset/cargo-kit.blend'))
reopened = inspect()
assert sorted(entry['triangles'] for entry in reopened) == [156, 180]
assert all(entry['has_editable_part_ids'] and entry['vertex_groups'] > 0 for entry in reopened)
assert not [image for image in bpy.data.images if image.source == 'FILE' and not image.packed_file]
authoring = []
for obj in bpy.context.scene.objects:
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    authoring.append(dict(name=obj.name, connected_closed=all(edge.is_manifold for edge in mesh.edges), volume=mesh.calc_volume(signed=True)))
    assert authoring[-1]['connected_closed'] and authoring[-1]['volume'] > 0
    mesh.free()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'asset/cargo-kit.glb'))
reimported = inspect()
assert sorted(entry['triangles'] for entry in reimported) == [156, 180]
for left, right in zip(reopened, reimported):
    assert left['name'] == right['name'] and left['triangles'] == right['triangles'] and left['primitives'] == right['primitives'] == 1
    for side in ['min', 'max']:
        assert max(abs(first - second) for first, second in zip(left['bounds'][side], right['bounds'][side])) < 1e-6
report = dict(blender=bpy.app.version_string, build_hash=bpy.app.build_hash.decode(), reopened_packed_editable_blend=reopened, authoring_manifold=authoring, clean_scene_glb_reimport=reimported, images=len(bpy.data.images), external_asset_dependencies=0, pass_status=True)
(ROOT / 'evidence/blender-reopen-clean-reimport.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
