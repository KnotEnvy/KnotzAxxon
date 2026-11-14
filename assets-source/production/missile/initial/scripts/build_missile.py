import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

WORK = Path(__file__).resolve().parents[1]
PALETTE = {
    'armor': '#995c48',
    'shoulder': '#b47555',
    'identification': '#c9b78d',
    'fin_steel': '#526579',
    'fin_edge': '#8698a1',
    'nose_graphite': '#26323e',
    'nozzle_lip': '#60717d',
    'nozzle_wall': '#202b36',
    'nozzle_recess': '#090f17',
}


def linear(hex_color):
    values = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in values)


def xyz(point):
    return point[0], -point[2], point[1]


def mesh_part(name, vertices, faces, colors):
    mesh = bpy.data.meshes.new(name + '_editable_geometry')
    mesh.from_pydata([xyz(point) for point in vertices], [], faces)
    mesh.materials.append(material)
    mesh.update()
    attribute = mesh.color_attributes.new(name='Palette', type='FLOAT_COLOR', domain='CORNER')
    for polygon, key in zip(mesh.polygons, colors):
        polygon.use_smooth = False
        for loop_index in polygon.loop_indices:
            attribute.data[loop_index].color = (*linear(PALETTE[key]), 1)
    mesh.color_attributes.active_color = attribute
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj['palette_faces'] = json.dumps({key: colors.count(key) for key in sorted(set(colors))})
    obj['editable'] = True
    return obj


def rings(name, profile, band_colors, cap=False):
    vertices = []
    for depth, radius in profile:
        vertices.extend([(radius * math.cos(index * math.tau / 12), radius * math.sin(index * math.tau / 12), depth) for index in range(12)])
    faces = []
    colors = []
    for ring_index in range(len(profile) - 1):
        for index in range(12):
            next_index = (index + 1) % 12
            faces.append((ring_index * 12 + index, ring_index * 12 + next_index, (ring_index + 1) * 12 + next_index, (ring_index + 1) * 12 + index))
            colors.append(band_colors[ring_index])
    if cap:
        vertices.append((0, 0, profile[-1][0]))
        center = len(vertices) - 1
        for index in range(12):
            faces.append(((len(profile) - 1) * 12 + index, (len(profile) - 1) * 12 + (index + 1) % 12, center))
            colors.append(band_colors[-1])
    return mesh_part(name, vertices, faces, colors)


ledger = WORK.parent / '.runtime/build-count.txt'
ledger.parent.mkdir(parents=True, exist_ok=True)
count = int(ledger.read_text()) if ledger.exists() else 0
if count >= 2:
    raise RuntimeError('Two-build ceiling reached; do not regenerate.')
ledger.write_text(str(count + 1))
bpy.ops.wm.read_factory_settings(use_empty=True)
material = bpy.data.materials.new('MISSILE_ARMOR_VERTEX_PBR')
material.use_nodes = True
material.diffuse_color = (1, 1, 1, 1)
material.metallic = .48
material.roughness = .42
material.use_backface_culling = True
nodes = material.node_tree.nodes
principled = nodes.get('Principled BSDF')
principled.inputs['Base Color'].default_value = (1, 1, 1, 1)
principled.inputs['Metallic'].default_value = .48
principled.inputs['Roughness'].default_value = .42
principled.inputs['Emission Color'].default_value = (*[value * .16 for value in linear('#4b2419')], 1)
principled.inputs['Emission Strength'].default_value = 1
vertex = nodes.new('ShaderNodeVertexColor')
vertex.layer_name = 'Palette'
material.node_tree.links.new(vertex.outputs['Color'], principled.inputs['Base Color'])
material['runtime_recipe'] = 'One enemyArmor clone per Projectiles pool; white baseColor, vertexColors=true; source rim reapplication; source emissive retained; dispose owned clone only at pool shutdown.'
root = bpy.data.objects.new('MISSILE_ROOT', None)
bpy.context.collection.objects.link(root)
root['source_axes'] = '+Z forward, +Y up; authored Blender coordinates are (source X, -source Z, source Y)'
root['source_origin'] = 'Unchanged procedural projectile root (not center of bounds)'
root['nose_source'] = [0, 0, .93]
root['aft_source'] = [0, 0, -.73]
root['pool_capacity'] = 40
root['motion'] = 'STATIC geometry; source quaternion +Z to velocity, scalar1; no animation or detachable parts'
profile = [(-.70, .178), (-.64, .196), (-.48, .196), (-.445, .210), (-.375, .210), (-.34, .196), (.08, .196), (.10, .201), (.20, .201), (.22, .196), (.32, .196), (.57, .128), (.82, .049)]
body = rings('01_continuous_fitted_body_nose', profile, ['fin_steel', 'armor', 'fin_steel', 'fin_steel', 'fin_steel', 'armor', 'shoulder', 'identification', 'shoulder', 'armor', 'nose_graphite', 'nose_graphite'])
tip_vertices = [tuple(vertex.co) for vertex in body.data.vertices]
tip_source = [(point[0], point[2], -point[1]) for point in tip_vertices]
body_faces = [tuple(polygon.vertices) for polygon in body.data.polygons]
body_colors = []
for key in ['fin_steel', 'armor', 'fin_steel', 'fin_steel', 'fin_steel', 'armor', 'shoulder', 'identification', 'shoulder', 'armor', 'nose_graphite', 'nose_graphite']:
    body_colors.extend([key] * 12)
tip_source.append((0, 0, .93))
for index in range(12):
    body_faces.append((144 + index, 144 + (index + 1) % 12, 156))
    body_colors.append('nose_graphite')
old_body_mesh = body.data
bpy.data.objects.remove(body, do_unlink=True)
bpy.data.meshes.remove(old_body_mesh)
body = mesh_part('01_continuous_fitted_body_nose', tip_source, body_faces, body_colors)
nozzle = rings('02_recessed_aft_nozzle', [(-.70, .178), (-.73, .147), (-.69, .107), (-.53, .09)], ['nozzle_lip', 'nozzle_lip', 'nozzle_wall', 'nozzle_recess'], cap=True)
for polygon in nozzle.data.polygons:
    polygon.flip()
nozzle.data.update()
footprint = [(.17, -.25), (.24, -.34), (.42, -.64), (.38, -.76), (.21, -.70), (.17, -.62)]
fins = []
for fin_index in range(4):
    angle = fin_index * math.pi / 2
    vertices = []
    for side in (-1, 1):
        for radius, depth in footprint:
            thickness = .022 - .010 * min(1, (radius - .17) / .25)
            tangent = side * thickness
            vertices.append((radius * math.cos(angle) - tangent * math.sin(angle), radius * math.sin(angle) + tangent * math.cos(angle), depth))
    faces = [tuple(reversed(range(6))), tuple(range(6, 12))]
    colors = ['fin_steel', 'fin_steel']
    for index in range(6):
        faces.append((index, (index + 1) % 6, (index + 1) % 6 + 6, index + 6))
        colors.append('fin_edge' if index in (0, 1) else 'fin_steel')
    fin = mesh_part(f'0{fin_index + 3}_fitted_control_fin_{fin_index}', vertices, faces, colors)
    bpy.context.view_layer.objects.active = fin
    fin.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    fin.select_set(False)
    fins.append(fin)
parts = [body, nozzle, *fins]
for obj in bpy.data.objects:
    obj.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active = body
scene = bpy.context.scene
scene.unit_settings.system = 'NONE'
scene['build_number'] = count + 1
scene['stage'] = 'pending_deferred_opus_review'
scene['formal_reviews'] = 0
scene['fix_passes'] = 0
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(WORK / 'assets/missile.blend'))
duplicates = []
for obj in parts:
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    bpy.context.collection.objects.link(duplicate)
    duplicate.select_set(True)
    duplicates.append(duplicate)
body.select_set(False)
bpy.context.view_layer.objects.active = duplicates[0]
bpy.ops.object.join()
export_mesh = bpy.context.view_layer.objects.active
export_mesh.name = 'MISSILE_POOLED'
export_mesh.data.name = 'MISSILE_STATIC_VERTEX_GEOMETRY'
export_mesh['primitive_contract'] = 'ONE material primitive, pooled InstancedMesh; no individual slot resources'
root.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(WORK / 'assets/missile.glb'), export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_materials='EXPORT', export_vertex_color='MATERIAL', export_cameras=False, export_lights=False, export_animations=False)
export_mesh.data.calc_loop_triangles()
metrics = {'blender': bpy.app.version_string, 'build_number': count + 1, 'palette_srgb': PALETTE, 'palette_linear': {key: linear(value) for key, value in PALETTE.items()}, 'triangles': len(export_mesh.data.loop_triangles), 'editable_parts': [obj.name for obj in parts], 'textures': 0, 'material_count': 1, 'world_units': 'Source world units, no normalization', 'profile_source_z_radius': profile + [[.93, 0]], 'source_to_blender': '(x,y,z) -> (x,-z,y)', 'export_root': 'MISSILE_ROOT', 'export_mesh': 'MISSILE_POOLED'}
assert 400 <= metrics['triangles'] <= 600
assert (WORK / 'assets/missile.glb').stat().st_size <= 128 * 1024
(WORK / 'evidence/build-metrics.json').write_text(json.dumps(metrics, indent=2))
print('MISSILE_BUILD', json.dumps(metrics))
