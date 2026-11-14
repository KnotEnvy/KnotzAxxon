import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
PARTS = []


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def color(value):
    return [linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0)]


def game_to_blender(point):
    return (point[0], -point[2], point[1])


def skin_point(profile, depth, radial):
    return Vector((profile[0] * (.3 - .125 * depth / 1.8) * radial, profile[1] * (.25 - .1 * depth / 1.8) * radial, depth))


def material(name, neon=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    vertex = nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'Color'
    if neon:
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        result.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 1.4
        shader.inputs['Roughness'].default_value = .5
    else:
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = (*color(0x3A4A5E), 1)
        result.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[1])
        result.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
        shader.inputs['Metallic'].default_value = .5
        shader.inputs['Roughness'].default_value = .46
    result['runtime'] = 'materials.neonVertex' if neon else 'materials.darkMetal'
    result['preview_only_shader'] = True
    return result


def add_part(variant, name, vertices, faces, tint=0x6A7482, slot=None):
    points = [Vector(point) for point in vertices]
    triangles = []
    for face in faces:
        for index in range(1, len(face) - 1):
            triangles.append([face[0], face[index], face[index + 1]])
    positions, normals = [], []
    for triangle in triangles:
        normal = (points[triangle[1]] - points[triangle[0]]).cross(points[triangle[2]] - points[triangle[0]]).normalized()
        assert normal.length > .99, name
        for index in triangle:
            positions.extend(points[index])
            normals.extend(normal)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([game_to_blender(point) for point in points], [], triangles)
    mesh.update()
    item = bpy.data.objects.new(name, mesh)
    COLLECTIONS[variant].objects.link(item)
    item.data.materials.append(NEON if slot is not None else DARK)
    tint_linear = color(tint)
    attribute = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for entry in attribute.data:
        entry.color = (*tint_linear, 1)
    item['part'] = name
    item['variant'] = variant
    item['bucket'] = 'neon' if slot is not None else 'dark'
    if slot is not None:
        item['aAnim_slot'] = slot
    PARTS.append({'variant': variant, 'name': name, 'bucket': item['bucket'], 'tint_hex': hex(tint), 'slot': slot, 'triangles': len(triangles), 'p': positions, 'n': normals, 'c': tint_linear})
    return item


def beam(variant, name, start, end, width=.026, depth=.025, tint=0x4A5462):
    start, end = Vector(start), Vector(end)
    along = (end - start).normalized()
    reference = Vector((0, 0, 1)) if abs(along.z) < .9 else Vector((0, 1, 0))
    across = along.cross(reference).normalized() * width / 2
    up = along.cross(across).normalized() * depth / 2
    vertices = [center + across * side_x + up * side_y for center in (start, end) for side_x, side_y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return add_part(variant, name, vertices, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], tint)


def conduit(variant, name, start, end, radius=.009):
    start, end = Vector(start), Vector(end)
    along = (end - start).normalized()
    across = along.cross(Vector((0, 1, 0))).normalized()
    up = along.cross(across).normalized()
    vertices = [center + radius * (across * math.cos(index * math.tau / 6) + up * math.sin(index * math.tau / 6)) for center in (start, end) for index in range(6)]
    faces = [[index, (index + 1) % 6, (index + 1) % 6 + 6, index + 6] for index in range(6)]
    faces.extend([list(reversed(range(6))), list(range(6, 12))])
    return add_part(variant, name, vertices, faces, 0x7E8A94)


def shell(variant, profile, phase):
    rings = []
    for station in range(4):
        values = []
        for index, point in enumerate(profile):
            if station == 0:
                depth = .05 + ((index * 3 + phase) % 5) * .028
            elif station == 3:
                depth = 1.73 - ((index * 7 + phase) % 5) * .034
            else:
                depth = [.0, .61, 1.12][station] + .014 * math.sin(index * 2 + phase)
            values.append(skin_point(point, depth, .87))
        rings.append(values)
    width = len(profile)
    vertices = [point for ring in rings for point in ring]
    vertices += [skin_point(profile[index % width], point.z, .76) for index, point in enumerate(vertices)]
    inner_offset = width * 4
    faces = []
    for station in range(3):
        for side in range(width - 1):
            first = station * width + side
            face = [first, first + width, first + width + 1, first + 1]
            faces.append(face)
            faces.append([index + inner_offset for index in reversed(face)])
    for side in range(width - 1):
        faces.append([side, side + 1, side + 1 + inner_offset, side + inner_offset])
        first = 3 * width + side
        faces.append([first, first + inner_offset, first + 1 + inner_offset, first + 1])
    for station in range(3):
        first = station * width
        faces.append([first, first + inner_offset, first + width + inner_offset, first + width])
        first += width - 1
        faces.append([first, first + width, first + width + inner_offset, first + inner_offset])
    add_part(variant, f'{variant}--continuous-torn-shell', vertices, faces)
    for station, depth in enumerate((.31, .88, 1.43)):
        for side in range(width - 1):
            beam(variant, f'{variant}--frame-{station:02d}-web-{side:02d}', skin_point(profile[side], depth, .75), skin_point(profile[side + 1], depth, .75), .030, .027)
    for side in (1, width - 2):
        beam(variant, f'{variant}--longeron-{side:02d}', skin_point(profile[side], .20, .74), skin_point(profile[side], 1.53, .74), .025, .032)
    keel = max(range(width), key=lambda index: -profile[index][1])
    beam(variant, f'{variant}--keel-spline', skin_point(profile[keel], .19, .73), skin_point(profile[keel], 1.52, .73), .033, .027)
    for patch, (side, low, high) in enumerate(((1, .25, .72), (1, .94, 1.42), (width - 3, .32, .79), (width - 3, 1.03, 1.49))):
        vertices = [skin_point(profile[index], depth, radial) for radial in (.874, .952) for depth in (low, high) for index in (side, side + 1)]
        add_part(variant, f'{variant}--fitted-lap-plate-{patch:02d}', vertices, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], 0x89949F)
    for index, side in enumerate((2, width - 3)):
        conduit(variant, f'{variant}--exposed-conduit-{index:02d}', skin_point(profile[side], .23, .63), skin_point(profile[side], 1.51, .63))
    for index, depth in enumerate((.52, 1.21)):
        beam(variant, f'{variant}--diagonal-gusset-{index:02d}', skin_point(profile[1], depth - .13, .75), skin_point(profile[2], depth + .13, .75), .022, .022, 0x667482)
    for slot, side in enumerate((0, 1, width - 3, width - 2)):
        point_a, point_b = profile[side], profile[side + 1]
        factor_a = .18 + slot * .04
        factor_b = factor_a + .35
        first = [point_a[axis] * (1 - factor_a) + point_b[axis] * factor_a for axis in range(2)]
        second = [point_a[axis] * (1 - factor_b) + point_b[axis] * factor_b for axis in range(2)]
        depth = (.13, 1.61, .16, 1.60)[slot]
        vertices = [skin_point(first, depth, .878), skin_point(second, depth, .878), skin_point(second, depth + .014, .878), skin_point(first, depth + .014, .878)]
        add_part(variant, f'{variant}--ember-face-{slot}', vertices, [[0, 1, 2, 3]], 0xFF7A2A, slot)


def write_templates():
    variants = []
    for variant in COLLECTIONS:
        output = {'name': variant, 'buckets': {}, 'parts': []}
        for bucket in ('dark', 'neon'):
            data = {'p': [], 'n': [], 'c': [], 'slots': []}
            for part in [part for part in PARTS if part['variant'] == variant and part['bucket'] == bucket]:
                start = len(data['p']) // 3
                data['p'].extend(round(value, 9) for value in part['p'])
                data['n'].extend(round(value, 9) for value in part['n'])
                data['c'].extend(part['c'] * (len(part['p']) // 3))
                data['slots'].extend([part['slot'] if part['slot'] is not None else -1] * (len(part['p']) // 3))
                output['parts'].append({key: part[key] for key in ('name', 'bucket', 'tint_hex', 'slot', 'triangles')} | {'first_vertex': start, 'vertex_count': len(part['p']) // 3})
            output['buckets'][bucket] = data
        points = [part['p'] for part in PARTS if part['variant'] == variant]
        all_points = [value for values in points for value in values]
        output['bounds'] = {'min': [min(all_points[axis::3]) for axis in range(3)], 'max': [max(all_points[axis::3]) for axis in range(3)]}
        output['triangles'] = sum(part['triangles'] for part in output['parts'])
        variants.append(output)
    document = {'schema': 'wreckage-cached-templates-v1', 'axes': 'game +Y up, +Z forward; unit size multiplied by original s', 'reconstruct': 'Float32 positions/normals/linear colors; Int8 ember slot. Batch world projected UV, source AO, aAnim reconstructed at append time. GLB does not encode the game shader.', 'variants': variants}
    (ROOT / 'asset/runtime-templates.json').write_text(json.dumps(document, separators=(',', ':')) + '\n')
    return document


def export_glb(document):
    bpy.ops.object.select_all(action='DESELECT')
    temporary = []
    for variant in document['variants']:
        parent = bpy.data.objects.new(variant['name'], None)
        bpy.context.scene.collection.objects.link(parent)
        temporary.append(parent)
        for bucket, data in variant['buckets'].items():
            points = [data['p'][index:index + 3] for index in range(0, len(data['p']), 3)]
            mesh = bpy.data.meshes.new(f'{variant["name"]}--{bucket}')
            mesh.from_pydata([game_to_blender(point) for point in points], [], [list(range(index, index + 3)) for index in range(0, len(points), 3)])
            mesh.update()
            item = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.scene.collection.objects.link(item)
            item.parent = parent
            item.data.materials.append(NEON if bucket == 'neon' else DARK)
            attribute = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
            for index, entry in enumerate(attribute.data):
                entry.color = (*data['c'][index * 3:index * 3 + 3], 1)
            item['bucket'] = bucket
            item['runtime_sidecar'] = 'runtime-templates.json'
            item.select_set(True)
            temporary.append(item)
        parent.select_set(True)
    file = ROOT / 'asset/drifting-wreckage-kit.glb'
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', use_selection=True, export_yup=True, export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_texcoords=False, export_normals=True, export_materials='EXPORT', export_attributes=False, export_vertex_color='ACTIVE')
    raw = file.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + json_length])
    for entry in gltf['materials']:
        neon = 'Ember' in entry['name']
        entry['pbrMetallicRoughness'] = {'baseColorFactor': [0, 0, 0, 1] if neon else color(0x3A4A5E) + [1], 'metallicFactor': 0 if neon else .5, 'roughnessFactor': .5 if neon else .46}
        if neon:
            entry['emissiveFactor'] = color(0xFF7A2A)
            entry['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': 1.4}}
        entry['extras'] = {'runtime': 'materials.neonVertex' if neon else 'materials.darkMetal', 'shader_reconstruction': 'runtime-templates.json; source aAnim and AO are not GLB features'}
    gltf['extensionsUsed'] = sorted(set(gltf.get('extensionsUsed', []) + ['KHR_materials_emissive_strength']))
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * ((-len(encoded)) % 4)
    tail = raw[20 + json_length:]
    file.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(tail)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + tail)
    for item in temporary:
        bpy.data.objects.remove(item, do_unlink=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
bpy.context.scene.render.threads_mode = 'FIXED'
bpy.context.scene.render.threads = 4
DARK = material('WR_Dark__bind_shared_darkMetal')
NEON = material('WR_Ember__reconstruct_aAnim')
COLLECTIONS = {}
for name in ('gutter-keel', 'sheared-chine'):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    COLLECTIONS[name] = collection
shell('gutter-keel', [(.84, .90), (1, .54), (1, -.57), (.68, -.97), (-.68, -.97), (-1, -.57), (-1, .54), (-.84, .90)], 1)
shell('sheared-chine', [(.10, .93), (.92, .80), (1, .05), (.82, -.82), (-.15, -.98), (-.91, -.60), (-.98, -.20)], 3)
DOCUMENT = write_templates()
for variant in DOCUMENT['variants']:
    assert 400 <= variant['triangles'] <= 700
    for data in variant['buckets'].values():
        for index in range(0, len(data['p']), 3):
            across, up, depth = data['p'][index:index + 3]
            assert 0 <= depth <= 1.8
            assert abs(across) <= .3 - .125 * depth / 1.8 + 1e-8
            assert abs(up) <= .25 - .1 * depth / 1.8 + 1e-8
export_glb(DOCUMENT)
bpy.context.scene['asset'] = 'DRIFTING WRECKAGE SCENERY KIT — initial'
bpy.context.scene['status'] = 'pending_deferred_opus_review'
bpy.context.scene['formal_reviews'] = 0
bpy.context.scene['formal_fix_passes'] = 0
bpy.context.scene['axes'] = 'Mesh authoring converted game (x,y,z) to Blender (x,-z,y).'
bpy.context.scene['runtime'] = 'Only Fortress._voidProps drifting wreck; static; append to dark/neon Batch buckets.'
for collection in COLLECTIONS.values():
    collection.hide_render = collection.name != 'gutter-keel'
    collection.hide_viewport = collection.name != 'gutter-keel'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'asset/drifting-wreckage-kit.blend'))
summary = {'blender': bpy.app.version_string, 'build': bpy.app.build_hash.decode(), 'engine': 'BLENDER_EEVEE', 'threads': 4, 'variants': [{key: value for key, value in variant.items() if key != 'buckets'} for variant in DOCUMENT['variants']], 'packed_external_images': len(bpy.data.images), 'new_textures': 0}
(ROOT / 'checks/authoring.json').write_text(json.dumps(summary, indent=2) + '\n')
print('WRECKAGE_AUTHORED', [(variant['name'], variant['triangles']) for variant in DOCUMENT['variants']])
