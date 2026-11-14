import bpy
import bmesh
import json
import math
import pathlib
from mathutils import Vector

WORK = pathlib.Path(__file__).resolve().parents[1]
ASSET = WORK / 'asset'
ASSET.mkdir(exist_ok=True)
CYAN = '52ffa8'
CROSS = [(-.31, -1.1), (.31, -1.1), (.31, -.31), (1.1, -.31), (1.1, .31), (.31, .31),
         (.31, 1.1), (-.31, 1.1), (-.31, .31), (-1.1, .31), (-1.1, -.31), (-.31, -.31)]


def offset_polygon(polygon, distance):
    output = []
    for index, point in enumerate(polygon):
        previous, following = polygon[index - 1], polygon[(index + 1) % len(polygon)]
        incoming = Vector((point[0] - previous[0], point[1] - previous[1])).normalized()
        outgoing = Vector((following[0] - point[0], following[1] - point[1])).normalized()
        normal_in = Vector((incoming.y, -incoming.x))
        normal_out = Vector((outgoing.y, -outgoing.x))
        movement = (normal_in + normal_out) / (1 + normal_in.dot(normal_out))
        output.append((point[0] + movement.x * distance, point[1] + movement.y * distance))
    return output


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(value):
    return tuple(linear(int(value[index:index + 2], 16) / 255) for index in (0, 2, 4)) + (1,)


def game_point(point):
    return (point[0], -point[2], point[1])


class Builder:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []

    def face(self, indices, tint):
        self.faces.append(indices)
        self.colors.append(tint)

    def outlines(self, polygons, depths, tints, front_tint):
        start = len(self.vertices)
        count = len(polygons[0])
        for polygon, depth in zip(polygons, depths):
            self.vertices.extend((point[0], point[1], depth) for point in polygon)
        for level in range(len(polygons) - 1):
            for index in range(count):
                self.face([start + level * count + index, start + level * count + (index + 1) % count,
                           start + (level + 1) * count + (index + 1) % count, start + (level + 1) * count + index], tints[level])
        self.face([start + index for index in reversed(range(count))], tints[0])
        self.face([start + (len(polygons) - 1) * count + index for index in range(count)], front_tint)

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
            self.vertices.extend((radius * math.cos(phase + index * math.tau / segments),
                                  radius * math.sin(phase + index * math.tau / segments), depth)
                                 for index in range(segments))
        for level in range(len(profile)):
            for index in range(segments):
                tint = tints[level % len(tints)]
                if alternation and index % 8 in (0, 1) and level in (3, 4):
                    tint = 'c2ffde'
                self.face([start + level * segments + index, start + level * segments + (index + 1) % segments,
                           start + ((level + 1) % len(profile)) * segments + (index + 1) % segments,
                           start + ((level + 1) % len(profile)) * segments + index], tint)

    def object(self, name, material, root, pivot=(0, 0, 0)):
        mesh = bpy.data.meshes.new(name + '_editable')
        mesh.from_pydata([game_point(point) for point in self.vertices], [], self.faces)
        mesh.update()
        attribute = mesh.color_attributes.new(name='RepairTint', type='FLOAT_COLOR', domain='CORNER')
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
        obj['ownership'] = 'clone geometry and material per instance; no textures'
        return obj


def material(name, metallic, roughness, unlit=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.use_backface_culling = True
    result.diffuse_color = color(CYAN if unlit else 'b3d3e0')
    nodes = result.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    output.location = (440, 0)
    attribute = nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = 'RepairTint'
    attribute.location = (-250, 0)
    if unlit:
        result.node_tree.links.new(attribute.outputs['Color'], output.inputs['Surface'])
    else:
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Metallic'].default_value = metallic
        shader.inputs['Roughness'].default_value = roughness
        result.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
        result.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
    result['identity_srgb'] = '#52ffa8'
    result['external_halo'] = 'not present; retain Materials._pickupHalos shared sprite opacity .35'
    return result


def polar(radius, angle):
    return (radius * math.cos(angle), radius * math.sin(angle))


def build():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for material_data in list(bpy.data.materials):
        bpy.data.materials.remove(material_data)
    root = bpy.data.objects.new('repair_pickup_root', None)
    bpy.context.collection.objects.link(root)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = .6
    root['game_axes'] = '+X across / +Y up / +Z camera-facing badge normal; XY badge plane'
    root['source_contract'] = 'Pickup.js ee221ad3e05cd66292fe02b71b50f513696bdda2; root copies ctx.camera.quaternion'
    root['review_status'] = 'pending_deferred_opus_review; frozen INITIAL only'
    shell_mat = material('repair_shell_green_unlit', 0, .38, unlit=True)
    core_mat = material('repair_core_titanium', .48, .40)
    shape_mat = material('repair_shape_ceramic', .25, .30, unlit=True)

    shell_builder = Builder()
    shell_builder.annulus(48, [(1.98 + .065 * math.cos(index * math.tau / 8),
                               .065 * math.sin(index * math.tau / 8)) for index in range(8)],
                            ['39785f', CYAN, CYAN, 'baffd8', '5cbd8a', '244d40', '16392f', '244d40'], alternation=True)
    shell = shell_builder.object('shell', shell_mat, root)
    shell['motion'] = 'rotation.z += dt*.3 in GAME local Z; uniform scale 1+sin(phase*4)*.025'

    hexagon = [polar(1, math.pi / 2 + index * math.tau / 6) for index in range(6)]
    core_builder = Builder()
    core_builder.loft(hexagon, [(1.55, -.080), (1.64, -.035), (1.64, .020), (1.59, .080)],
                      ['162f2c', '6c9186', '25423e', '1d3633'])
    core = core_builder.object('core', core_mat, root, (0, 0, -.30))
    core['motion'] = 'static relative to billboard root; original pivot (0,0,-.30)'

    shape_builder = Builder()
    shape_builder.outlines([CROSS, offset_polygon(CROSS, .04), offset_polygon(CROSS, .04), CROSS,
                            offset_polygon(CROSS, -.055)], [-.04, 0, .12, .16, .16],
                           ['264b3e', '3c8f66', CYAN, CYAN], 'ddffeb')
    shape = shape_builder.object('shape', shape_mat, root, (0, 0, .10))
    shape['motion'] = 'GAME local rotation.z=sin(phase*2.2)*.08; original pivot (0,0,.10)'
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.world.color = (.06, .07, .10)
    scene['initial_delivery'] = 'INITIAL: technical self-checks only; zero formal reviews/fix passes'
    scene['no_detach_no_charge'] = 'N/A; no invented mechanic. Shared runtime halo omitted from export.'
    scene['deliberate_kit_reuse'] = 'Frozen shield INITIAL tooling and palette/frame language adapted; no shield crest geometry reused. Self-contained repair source.'
    scene['source_envelope'] = 'shell major1.98 tube.065 outer2.045; core radius1.64 depth.16; cross +-1.1 halfwidth.31 depth.12 bevel.04'
    bpy.data.texts.new('build_repair.py').write(pathlib.Path(__file__).read_text())
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, shell, core, shape]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = shape
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'repair-pickup.blend'), compress=True)
    bpy.ops.export_scene.gltf(filepath=str(ASSET / 'repair-pickup.glb'), export_format='GLB',
                              use_selection=True, export_yup=True, export_apply=False,
                              export_normals=True, export_texcoords=False, export_attributes=False,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_materials='EXPORT', export_vertex_color='MATERIAL')
    scene_info = {'blender': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(),
                  'threads': scene.render.threads, 'engine': scene.render.engine, 'objects': {}}
    for obj in [shell, core, shape]:
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        mesh.calc_loop_triangles()
        scene_info['objects'][obj.name] = {'triangles': len(mesh.loop_triangles), 'vertices': len(mesh.vertices),
                                         'polygons': len(mesh.polygons), 'materials': [slot.name for slot in mesh.materials],
                                         'game_pivot': list(obj['game_pivot'])}
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    scene_info['triangles'] = sum(entry['triangles'] for entry in scene_info['objects'].values())
    (WORK / 'evidence' / 'build-metrics.json').write_text(json.dumps(scene_info, indent=2) + '\n')
    print('REPAIR_BUILD', json.dumps(scene_info))


if __name__ == '__main__':
    build()
