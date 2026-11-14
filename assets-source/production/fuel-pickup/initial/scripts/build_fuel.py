import bpy
import bmesh
import json
import math
import pathlib
import struct

WORK = pathlib.Path(__file__).resolve().parents[1]
ASSET = WORK / 'asset'
ASSET.mkdir(parents=True, exist_ok=True)
YELLOW = 'ffd76a'
CYAN = YELLOW


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def color(value):
    return tuple(linear(int(value[index:index + 2], 16) / 255) for index in (0, 2, 4)) + (1,)


def game_point(point):
    return (point[0], -point[2], point[1])


def polar(radius, angle):
    return (radius * math.cos(angle), radius * math.sin(angle))


def drum_surface(builder, segments, levels, shades, center=(0, 0, 0)):
    start = len(builder.vertices)
    for height, radius in levels:
        builder.vertices.extend((center[0] + radius * math.cos(index * math.tau / segments),
                                 center[1] + height,
                                 center[2] + radius * math.sin(index * math.tau / segments)) for index in range(segments))
    for level in range(len(levels) - 1):
        for index in range(segments):
            front = math.sin((index + .5) * math.tau / segments)
            tint = shades[0] if front < -.1 else shades[1] if front < .55 else shades[2]
            builder.face([start + level * segments + index, start + level * segments + (index + 1) % segments,
                          start + (level + 1) * segments + (index + 1) % segments,
                          start + (level + 1) * segments + index], tint)
    builder.face([start + index for index in reversed(range(segments))], shades[0])
    builder.face([start + (len(levels) - 1) * segments + index for index in range(segments)], shades[2])


class Builder:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []

    def face(self, indices, tint):
        self.faces.append(indices)
        self.colors.append(tint)

    def loft(self, polygon, levels, tints, cap=True):
        start = len(self.vertices)
        count = len(polygon)
        for scale, depth in levels:
            self.vertices.extend((point[0] * scale, point[1] * scale, depth) for point in polygon)
        for level in range(len(levels) - 1):
            for index in range(count):
                self.face([start + level * count + index, start + level * count + (index + 1) % count,
                           start + (level + 1) * count + (index + 1) % count, start + (level + 1) * count + index],
                          tints[level % len(tints)])
        if cap:
            self.face([start + index for index in reversed(range(count))], tints[0])
            self.face([start + (len(levels) - 1) * count + index for index in range(count)], tints[-1])

    def annulus(self, segments, profile, tints, phase=0, alternation=False):
        start = len(self.vertices)
        for radius, depth in profile:
            self.vertices.extend((*polar(radius, phase + index * math.tau / segments), depth) for index in range(segments))
        for level in range(len(profile)):
            for index in range(segments):
                tint = tints[level % len(tints)]
                if alternation and index % 12 in (0, 1) and level in (3, 4):
                    tint = 'b8b8b8'
                self.face([start + level * segments + index, start + level * segments + (index + 1) % segments,
                           start + ((level + 1) % len(profile)) * segments + (index + 1) % segments,
                           start + ((level + 1) % len(profile)) * segments + index], tint)

    def object(self, name, material, root, pivot=(0, 0, 0)):
        mesh = bpy.data.meshes.new(name + '_editable')
        mesh.from_pydata([game_point(point) for point in self.vertices], [], self.faces)
        mesh.update()
        attribute = mesh.color_attributes.new(name='FuelTint', type='FLOAT_COLOR', domain='CORNER')
        for polygon, tint in zip(mesh.polygons, self.colors):
            for index in polygon.loop_indices:
                attribute.data[index].color = color(tint)
        temporary = bmesh.new()
        temporary.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(temporary, faces=list(temporary.faces))
        temporary.to_mesh(mesh)
        temporary.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = root
        obj.location = game_point(pivot)
        mesh.materials.append(material)
        obj['game_pivot'] = list(pivot)
        obj['ownership'] = 'instance-owned geometry/material; textures remain template-owned'
        return obj


def material(name, metallic, roughness, unlit=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.use_backface_culling = True
    result.diffuse_color = color(YELLOW if unlit else '486278')
    nodes = result.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    attribute = nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = 'FuelTint'
    if unlit:
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = color(YELLOW)
        result.node_tree.links.new(attribute.outputs['Color'], multiply.inputs[1])
        result.node_tree.links.new(multiply.outputs[0], output.inputs['Surface'])
    else:
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Metallic'].default_value = metallic
        shader.inputs['Roughness'].default_value = roughness
        result.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
        result.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
    result['identity_srgb'] = '#ffd76a'
    result['vertex_colors'] = 'neutral multipliers for source-neon clones; core absolute slate colors'
    return result


def finalize_glb():
    filename = ASSET / 'fuel-pickup.glb'
    data = filename.read_bytes()
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    for entry in document['materials']:
        if entry['name'] in ('fuel_shell_yellow_unlit', 'fuel_shape_yellow_unlit'):
            entry['pbrMetallicRoughness']['baseColorFactor'] = list(color(YELLOW))
            entry.setdefault('extensions', {})['KHR_materials_unlit'] = {}
            entry['extras']['runtime_neon_strength'] = 1.15 if 'shell' in entry['name'] else 1.35
    document['extensionsUsed'] = sorted(set(document.get('extensionsUsed', [])) | {'KHR_materials_unlit'})
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    rest = data[20 + json_length:]
    filename.write_bytes(struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(rest)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + rest)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.data.objects.new('fuel_pickup_root', None)
    bpy.context.collection.objects.link(root)
    root['game_axes'] = 'XY badge plane; +Z front; +Y up. No imported root scale/rotation correction.'
    root['kit_reuse'] = 'Disclosed shield INITIAL loft/annulus utilities and adapted rim/backplate kit profile; freshly generated mesh and original fuel symbol. No shield mesh/binary imported.'
    root['review_status'] = 'INITIAL; zero formal reviews/fix passes; deferred Opus review'
    shell_mat = material('fuel_shell_yellow_unlit', 0, .4, True)
    core_mat = material('fuel_core_titanium', .48, .4)
    shape_mat = material('fuel_shape_yellow_unlit', 0, .4, True)
    ring = Builder()
    ring.annulus(48, [(1.925, -.065), (2.015, -.065), (2.045, -.035), (2.045, .025),
                       (2.015, .065), (1.925, .065), (1.900, .030), (1.900, -.035)],
                 ['626262', '969696', 'bcbcbc', 'ffffff', 'ffffff', 'b2b2b2', '777777', '626262'], alternation=True)
    for index in range(8):
        angle = math.pi / 8 + index * math.tau / 8
        plate = [polar(radius, angle + offset) for radius, offset in [(1.93, -.045), (2.025, -.035),
                                                                      (2.025, .035), (1.93, .045)]]
        ring.loft(plate, [(1, .066), (1, .100)], ['999999', 'e3e3e3'])
    shell = ring.object('shell', shell_mat, root)
    shell['source_motion'] = 'GAME rotation.z+=dt*.3; uniform pulse .975..1.025; source pivot 0,0,0'
    plate = Builder()
    hexagon = [polar(1, math.pi / 6 + index * math.tau / 6) for index in range(6)]
    plate.loft(hexagon, [(1.55, -.080), (1.64, -.035), (1.64, .020), (1.58, .080)],
               ['1a2938', '81919b', '3c5368', '263b4c'])
    for index in range(6):
        angle = index * math.tau / 6
        panel = [polar(radius, angle + offset) for radius, offset in [(1.25, -.20), (1.50, -.16),
                                                                      (1.50, .16), (1.25, .20)]]
        plate.loft(panel, [(1, .081), (.95, .115)], ['344b5e', '526a7e'])
    core = plate.object('core', core_mat, root, (0, 0, -.30))
    symbol = Builder()
    drum_surface(symbol, 16, [(-.8, .60), (-.76, .70), (-.66, .70), (.62, .70), (.70, .66), (.74, .58)],
                 ['646464', 'a5a5a5', 'd8d8d8'])
    for height in [-.45, .45]:
        drum_surface(symbol, 16, [(height - .08, .70), (height - .045, .80),
                                  (height + .045, .80), (height + .08, .70)],
                     ['808080', 'dedede', 'ffffff'])
    drum_surface(symbol, 6, [(0, .12), (.025, .14), (.06, .12)],
                 ['555555', 'bbbbbb', 'ffffff'], center=(.24, .74, .03))
    panel = [(-.28, -.18), (.22, -.18), (.28, -.12), (.28, .18), (-.22, .18), (-.28, .12)]
    symbol.loft(panel, [(1, .704), (.91, .725), (.91, .745)], ['525252', '898989', '727272'])
    symbol.vertices = [(point[0] * .82, point[1] * .82, point[2] * .25) for point in symbol.vertices]
    shape = symbol.object('shape', shape_mat, root, (0, 0, .10))
    shape['source_motion'] = 'GAME rotation.z=sin(phase*2.2)*.08; source pivot 0,0,+.10'
    shape['identity'] = 'Upright drum with two broad rolled hoops, shouldered lid and offset cap. No text, cross, hex crest, chevrons, or mine spikes.'
    shape['source_static_scale'] = 'BAKED into geometry: game (.82,.82,.25); exported node scale is (1,1,1). NEVER apply source fuel scale a second time.'
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = shape
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'fuel-pickup.blend'), compress=True)
    for entry in [shell_mat, shape_mat]:
        attribute = next(node for node in entry.node_tree.nodes if node.type == 'VERTEX_COLOR')
        output = next(node for node in entry.node_tree.nodes if node.type == 'OUTPUT_MATERIAL')
        entry.node_tree.links.new(attribute.outputs['Color'], output.inputs['Surface'])
    bpy.ops.export_scene.gltf(filepath=str(ASSET / 'fuel-pickup.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_normals=True, export_texcoords=False,
                              export_attributes=False, export_extras=True, export_animations=False,
                              export_cameras=False, export_lights=False, export_materials='EXPORT', export_vertex_color='MATERIAL')
    finalize_glb()
    entries = {}
    for obj in [shell, core, shape]:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        entries[obj.name] = {'triangles': len(mesh.loop_triangles), 'vertices': len(mesh.vertices),
                             'polygons': len(mesh.polygons), 'materials': [entry.name for entry in mesh.materials],
                             'game_pivot': list(obj['game_pivot'])}
        evaluated.to_mesh_clear()
    metrics = {'blender': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(), 'objects': entries,
               'triangles': sum(entry['triangles'] for entry in entries.values()),
               'glb_material_normalization': 'Deterministic unlit base factor #ffd76a, neutral COLOR_0; source gains applied by ownership recipe, not baked into glTF factors.'}
    (WORK / 'evidence' / 'build-metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print('FUEL_BUILD', json.dumps(metrics))


if __name__ == '__main__':
    build()
