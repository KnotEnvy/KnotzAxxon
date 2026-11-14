import collections
import json
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from geometry import generate

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'asset'
ASSET.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
data = generate()
neutral = bpy.data.materials.new('Cargo_Neutral_UseExistingHull')
neutral.diffuse_color = (1, 1, 1, 1)
neutral.use_nodes = True
shader = neutral.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
shader.inputs['Metallic'].default_value = 0.36
shader.inputs['Roughness'].default_value = 1
parts = {}
for model in data['models']:
    mesh = bpy.data.meshes.new(model['name'] + '_EditableTopology')
    mesh.from_pydata([(point[0], -point[2], point[1]) for point in model['vertices']], [], model['triangles'])
    mesh.materials.append(neutral)
    mesh.update()
    obj = bpy.data.objects.new(model['name'], mesh)
    bpy.context.collection.objects.link(obj)
    names = list(dict.fromkeys(model['parts']))
    attribute = mesh.attributes.new('cargo_part_id', 'INT', 'FACE')
    for index, part in enumerate(model['parts']):
        attribute.data[index].value = names.index(part)
    for name in names:
        group = obj.vertex_groups.new(name=name)
        indices = sorted({vertex for index, triangle in enumerate(model['triangles']) if model['parts'][index] == name for vertex in triangle})
        group.add(indices, 1, 'REPLACE')
    obj['runtime_bucket'] = 'hull'
    obj['neutral_vertex_multiplier'] = 1.0
    obj['part_names'] = json.dumps(names)
    obj['source_envelope'] = 'unit bottom-center cube' if 'Crate' in obj.name else 'source ten-sided unit cylinder, identical angular phase'
    parts[obj.name] = dict(triangles=len(model['triangles']), vertices=len(model['vertices']), parts=dict(collections.Counter(model['parts'])), runtime='single cached template stamped into existing hull', imported_material='Cargo_Neutral_UseExistingHull', live_material='existing Materials.hull; imported material is not used live', neutral_vertex_multiplier=1)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.world = bpy.data.worlds.new('AuthoringWorld')
scene.world.color = (0.03, 0.04, 0.06)
scene.view_settings.view_transform = 'Standard'
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'cargo-kit.blend'))
bpy.ops.export_scene.gltf(filepath=str(ASSET / 'cargo-kit.glb'), export_format='GLB', export_yup=True, export_normals=True, export_materials='EXPORT', export_texcoords=False, export_vertex_color='NONE', export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_apply=False)
(ASSET / 'cargo-topology.json').write_text(json.dumps(data, indent=2) + '\n')
(ASSET / 'part-runtime-map.json').write_text(json.dumps(parts, indent=2) + '\n')
(ROOT / 'evidence' / 'build-settings.json').write_text(json.dumps(dict(blender=bpy.app.version_string, build_hash=bpy.app.build_hash.decode(), platform=sys.platform, engine=scene.render.engine, threads=4, generated_by='gpt-6.1-sol', reasoning='xhigh', speed='available/default; no alternate speed override', review='pending_deferred_opus_review', formal_review_rounds=0, formal_fix_rounds=0, export='glTF 2.0 GLB / no UV or COLOR_0 / one neutral material / two nodes'), indent=2) + '\n')
print(json.dumps(parts, indent=2))
