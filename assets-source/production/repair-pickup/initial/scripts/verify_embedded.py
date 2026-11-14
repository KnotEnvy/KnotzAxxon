import bpy
import hashlib
import json
import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(WORK / 'asset/repair-pickup.blend'))
generator = (WORK / 'scripts/build_repair.py').read_text()
embedded = bpy.data.texts['build_repair.py'].as_string()
assert embedded == generator
assert len([obj for obj in bpy.context.scene.objects if obj.type == 'MESH']) == 3
assert len(bpy.data.libraries) == 0
report = {'embedded_generator_matches_delivered_source': True,
          'generator_sha256': hashlib.sha256(generator.encode()).hexdigest(),
          'mesh_names': sorted(obj.name for obj in bpy.context.scene.objects if obj.type == 'MESH'),
          'linked_libraries': 0, 'source_reopened_without_resave': True}
(WORK / 'evidence/embedded-source.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
