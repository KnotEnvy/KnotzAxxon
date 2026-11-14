import bpy
import json
import math
import os
import struct
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

REPO = Path(os.environ.get('REPO_ROOT', os.getcwd()))
ROOT = REPO / 'asset-work/flak-gun/initial'
EVIDENCE = ROOT / 'evidence'
DATA = json.loads((ROOT / 'asset/flak-gun.template.json').read_text())
REFERENCE = json.loads((EVIDENCE / 'reference-batch.json').read_text())
LABEL = None
LABEL_BACK = None
MATERIALS = {}
CAPTIONS = {}


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgb(value):
    return tuple(linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0))


def game(point):
    return Vector((point[0], -point[2], point[1]))


def setup():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .7
    scene.world = bpy.data.worlds.new('Offline dusk approximation')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (*rgb(0x5a6f95), 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .7
    for name, position, energy, tint, size in [
        ('Dusk_key_source_direction_approx', (-70, -97, 188), 4.0, 0xffbc86, .12),
        ('Source_cyan_rim_approx', (60, 62, 70), 1.1, 0x4fd8ff, .20)]:
        light = bpy.data.lights.new(name, 'SUN')
        light.energy = energy
        light.color = rgb(tint)
        light.angle = size
        obj = bpy.data.objects.new(name, light)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.film_transparent = False
    return scene


def material(bucket):
    if bucket in MATERIALS:
        return MATERIALS[bucket]
    result = bpy.data.materials.new({'hull': 'FG_hull_mapped_response', 'dark': 'FG_darkMetal_unmapped_response', 'neon': 'Evidence_original_neon_proxy'}.get(bucket, bucket))
    result.use_nodes = True
    result.use_backface_culling = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = .36 if bucket == 'hull' else .5
    shader.inputs['Roughness'].default_value = .65 if bucket == 'hull' else .46
    colors = result.node_tree.nodes.new('ShaderNodeVertexColor')
    colors.layer_name = 'BatchTintAO'
    if bucket == 'neon':
        result.node_tree.links.new(colors.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 1
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
    else:
        multiply = result.node_tree.nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        base = rgb(0x3a4a5e) if bucket == 'dark' else tuple(linear(value * .65 + .01) for value in (.40, .45, .52))
        base = tuple(value * 1.1 for value in base)
        multiply.inputs[1].default_value = (*base, 1)
        result.node_tree.links.new(colors.outputs['Color'], multiply.inputs[2])
        result.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
    if bucket != 'neon':
        result['preview_base_color_linear'] = list(base)
    result['runtime_material'] = f'materials.{"hull" if bucket == "hull" else "darkMetal"}'
    result['maps_not_embedded'] = True
    result['offline_approximation'] = 'hull averages source shared map; no actual canvas texture/normal/roughness maps in EEVEE. Runtime binds existing original shared mapped hull, not this preview material.' if bucket == 'hull' else 'original unmapped darkMetal response'
    MATERIALS[bucket] = result
    return result


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    return obj


def build_asset():
    root = empty('FORTRESS_ROOFTOP_FLAK')
    root['source'] = 'Fortress._flakGun scenery ONLY; not enemy Turret/HeavyTurret/Silo'
    root['reference_pitch'] = 1.15
    root['reference_yaw'] = -.85
    root['runtime'] = 'FlakGunRecipe.mjs cached static Batch stamping; do not clone this hierarchy per prop'
    root['units'] = 'world metres; Blender Z up; GLB game Y up'
    yaw = empty('azimuth_turntable', root)
    yaw.rotation_euler.z = -.85
    pitch = empty('barrel_elevation_pivot', yaw)
    pitch.location.z = 2.1
    pitch.rotation_euler.x = -(math.pi / 2 - 1.15)
    by_bucket = {item['bucket']: item for item in REFERENCE}
    offsets = {'hull': 0, 'dark': 0}
    for part in DATA['parts']:
        start, count = part['start'], part['count']
        raw = [DATA['positions'][offset:offset + 3] for offset in range(start * 3, (start + count) * 3, 3)]
        vertices = [game([point[0], point[1] - (2.1 if part['motion'] == 2 else 0), point[2]]) for point in raw]
        mesh = bpy.data.meshes.new(part['name'] + '_editable')
        mesh.from_pydata(vertices, [], [(offset, offset + 1, offset + 2) for offset in range(0, count, 3)])
        mesh.update()
        obj = bpy.data.objects.new(part['name'], mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = [root, yaw, pitch][part['motion']]
        mesh.materials.append(material(part['bucket']))
        obj['runtime_bucket'] = part['bucket']
        obj['source_motion_group'] = part['motion']
        obj['triangles'] = part['triangles']
        obj['tint_srgb'] = part['tint']
        obj['GLB_COLOR0_decode_gain'] = 1.1
        colors = mesh.color_attributes.new(name='BatchTintAO', type='FLOAT_COLOR', domain='CORNER')
        uv = mesh.uv_layers.new(name='Batch_world_boxProjection_scale3')
        bucket = by_bucket[part['bucket']]
        bucket_start = offsets[part['bucket']]
        for index, loop in enumerate(mesh.loops):
            colors.data[index].color = (*(value / 1.1 for value in bucket['c'][(bucket_start + index) * 3:(bucket_start + index) * 3 + 3]), 1)
            uv.data[index].uv = bucket['uv'][(bucket_start + index) * 2:(bucket_start + index) * 2 + 2]
        offsets[part['bucket']] += count
    bpy.context.view_layer.update()
    for obj in bpy.data.objects:
        obj.select_set(obj == root or obj in root.children_recursive)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'asset/fortress-rooftop-flak.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=False, export_normals=True, export_texcoords=True,
                              export_attributes=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_vertex_color='NAME', export_vertex_color_name='BatchTintAO', export_all_vertex_colors=False)
    glb_path = ROOT / 'asset/fortress-rooftop-flak.glb'
    payload = glb_path.read_bytes()
    json_size = struct.unpack_from('<I', payload, 12)[0]
    document = json.loads(payload[20:20 + json_size])
    for entry in document['materials']:
        entry['pbrMetallicRoughness']['baseColorFactor'] = entry['extras']['preview_base_color_linear'] + [1]
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    remaining = payload[20 + json_size:]
    glb_path.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(remaining)) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + remaining)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'asset/fortress-rooftop-flak.blend'))
    return root


def camera(eye, focus, half_height=4, orthographic=True, fov=58):
    scene = bpy.context.scene
    current = bpy.data.objects.get('Evidence_camera')
    if current is None:
        current = bpy.data.objects.new('Evidence_camera', bpy.data.cameras.new('Evidence_camera'))
        scene.collection.objects.link(current)
    scene.camera = current
    current.location = game(eye)
    current.rotation_euler = (game(focus) - current.location).to_track_quat('-Z', 'Y').to_euler()
    current.data.type = 'ORTHO' if orthographic else 'PERSP'
    current.data.ortho_scale = half_height * 2 * scene.render.resolution_x / scene.render.resolution_y
    current.data.sensor_fit = 'HORIZONTAL'
    current.data.angle = 2 * math.atan(math.tan(math.radians(fov) / 2) * scene.render.resolution_x / scene.render.resolution_y)
    current.data.clip_start = .1
    current.data.clip_end = 1600
    return current


def caption(text):
    global LABEL, LABEL_BACK
    scene = bpy.context.scene
    cam = scene.camera
    if LABEL is None or LABEL.name not in bpy.data.objects:
        font = bpy.data.curves.new('Evidence_caption', 'FONT')
        font.size = 1
        LABEL = bpy.data.objects.new('Evidence_caption', font)
        scene.collection.objects.link(LABEL)
        ink = bpy.data.materials.new('Caption_unlit')
        ink.use_nodes = True
        shader = ink.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Emission Color'].default_value = (.75, .82, .94, 1)
        shader.inputs['Emission Strength'].default_value = 1
        font.materials.append(ink)
        mesh = bpy.data.meshes.new('Caption_backplate')
        mesh.from_pydata([(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [], [(0, 1, 2, 3)])
        LABEL_BACK = bpy.data.objects.new('Evidence_caption_background', mesh)
        scene.collection.objects.link(LABEL_BACK)
        paper = bpy.data.materials.new('Caption_dark')
        paper.use_nodes = True
        shader = paper.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Roughness'].default_value = 1
        mesh.materials.append(paper)
    aspect = scene.render.resolution_x / scene.render.resolution_y
    half_height = cam.data.ortho_scale / (2 * aspect) if cam.data.type == 'ORTHO' else math.tan(cam.data.angle / 2) / aspect
    LABEL.parent = cam
    LABEL.location = (-half_height * aspect * .96, -half_height * .81, -1)
    LABEL.rotation_euler = (0, 0, 0)
    LABEL.scale = (half_height * .036,) * 3
    LABEL.data.body = text
    LABEL.data.space_line = 1.1
    LABEL_BACK.parent = cam
    LABEL_BACK.location = (0, -half_height * .90 * 1.01, -1.01)
    LABEL_BACK.rotation_euler = (0, 0, 0)
    LABEL_BACK.scale = (half_height * aspect * 1.01, half_height * .10 * 1.01, 1)
    return LABEL


def render(name, text):
    caption(text)
    CAPTIONS[name] = text
    bpy.context.scene.render.filepath = str(EVIDENCE / name)
    bpy.ops.render.render(write_still=True)


def from_batch(name, record):
    vertices = [game(record['p'][offset:offset + 3]) for offset in range(0, len(record['p']), 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(offset, offset + 1, offset + 2) for offset in range(0, len(vertices), 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(material(record['bucket']))
    colors = mesh.color_attributes.new(name='BatchTintAO', type='FLOAT_COLOR', domain='CORNER')
    uv = mesh.uv_layers.new(name='Batch_world_boxProjection_scale3')
    for index, loop in enumerate(mesh.loops):
        colors.data[index].color = (*(value / (1 if record['bucket'] == 'neon' else 1.1) for value in record['c'][index * 3:index * 3 + 3]), 1)
        uv.data[index].uv = record['uv'][index * 2:index * 2 + 2]
    return obj


def studio(root):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 1000, 900
    views = [
        ('hardware-front.png', (-9, 8, -13), (0, 2.9, -.3), 3.9, 'FRONT / connected yoke, paired receivers and recoil pistons'),
        ('hardware-rear.png', (9, 7, 11), (0, 2.9, -.3), 3.9, 'REAR / fitted bearing, cross-shaft and cradle'),
        ('hardware-side.png', (12, 6, 0), (0, 2.9, -.3), 3.9, 'SIDE / original 4.2 barrel length and pivot Y=2.1'),
        ('hardware-top.png', (5, 15, -3), (.3, 2.8, -.5), 3.6, 'TOP / roof-contact footprint 3.3 x 3.3; no new roof cover'),
        ('hardware-bore-close.png', (4.2, 9.8, -4.3), (1.38, 5.80, -.95), 1.15, 'MUZZLE CLOSE / real .27-deep recessed bores; two steel jackets'),
        ('hardware-mount-close.png', (-4.5, 4.0, -5.5), (0, 1.5, 0), 1.95, 'MOUNT CLOSE / shoulder yokes, split race, receiver/recoil articulation')]
    for name, eye, focus, half_height, text in views:
        camera(eye, focus, half_height)
        render(name, text + '\nOFFLINE EEVEE / source-dusk lighting and mapped-hull average approximation / reference p1.15 y-.85')
    for obj in [root, *root.children_recursive]:
        obj.hide_render = True
    extrema = json.loads((EVIDENCE / 'pose-extrema-fixture.json').read_text())
    active = []
    for index, record in enumerate(extrema):
        for obj in active:
            bpy.data.objects.remove(obj, do_unlink=True)
        active = [from_batch('Exact_pose_extreme_' + str(index) + '_' + str(bucket), data) for bucket, data in enumerate(record['candidate'])]
        camera((-10, 8, -13), (0, 2.9, -.3), 3.9)
        render(f'pose-extreme-{index + 1}.png', f'FULL SOURCE EXTREME / pitch {record["pitch"]:.3f} yaw {record["yaw"]:.3f} / roofY 0\nOFFLINE EEVEE / analytic static Batch stamp / emitter remains at source center-between-tips')
    for obj in active:
        bpy.data.objects.remove(obj, do_unlink=True)


def world_views():
    global LABEL, LABEL_BACK
    bpy.ops.wm.read_factory_settings(use_empty=True)
    LABEL = LABEL_BACK = None
    MATERIALS.clear()
    scene = setup()
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    fixture = json.loads((EVIDENCE / 'world-fixture.json').read_text())
    selected = fixture['selected']
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO / 'public/models/player.glb'))
    player_objects = [obj for obj in bpy.data.objects if obj not in before]
    for obj in player_objects:
        if obj.parent not in player_objects:
            obj.location += game(selected['player'])
    active = []
    checks = []
    from bpy_extras.object_utils import world_to_camera_view
    for rig in fixture['rigs']:
        current = camera(rig['eye'], rig['lookAt'], rig['halfHeight'] or 40, rig['orthographic'], rig['fov'])
        bpy.context.view_layer.update()
        point = game([selected['x'], selected['roofY'], selected['z']])
        projected = world_to_camera_view(scene, current, point)
        checks.append({'mode': rig['mode'], 'roofCenterNDC': [projected.x * 2 - 1, projected.y * 2 - 1], 'sourcePredictedPropNDC': [rig['ndcMin'], rig['ndcMax']], 'actualSourceRig': rig})
        for variant in ('source', 'candidate'):
            for obj in active:
                bpy.data.objects.remove(obj, do_unlink=True)
            active = [from_batch(f'Actual_{variant}_chunk_{index}', record) for index, record in enumerate(fixture[variant])]
            render(f'world-{rig["mode"]}-{variant}.png', f'WORLD {rig["mode"].upper()} / {variant.upper()} / actual seed{selected["seed"]} chunk{selected["chunk"]} roof({selected["x"]:.2f},{selected["roofY"]:.2f},{selected["z"]:.2f})\nCOMMON 1:1 world scale, shipped player at legal x16/y25 / source CameraRig.snap, no retarget\nOFFLINE EEVEE approximations / no live GPU, VFX, fog, bloom or acceptance claim')
    (EVIDENCE / 'render-camera-checks.json').write_text(json.dumps(checks, indent=2) + '\n')


def references():
    global LABEL, LABEL_BACK
    for name in ['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel']:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        LABEL = LABEL_BACK = None
        MATERIALS.clear()
        scene = setup()
        scene.render.resolution_x, scene.render.resolution_y = 700, 620
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(REPO / 'public/models' / (name + '.glb')))
        imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH']
        points = [obj.matrix_world @ Vector(corner) for obj in imported for corner in obj.bound_box]
        minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        center = (minimum + maximum) * .5
        radius = (maximum - minimum).length * .60
        focus = [center.x, center.z, -center.y]
        eye = [focus[0] - radius * 1.4, focus[1] + radius, focus[2] - radius * 1.6]
        camera(eye, focus, radius)
        render(f'reference-{name}.png', f'SHIPPED {name.upper()} / style reference ONLY / original GLB, not copied geometry\nOFFLINE EEVEE / individually auto-framed, NOT common world scale')


def sheets():
    groups = {
        'inspection-hardware-sheet.png': ['hardware-front.png', 'hardware-rear.png', 'hardware-side.png', 'hardware-top.png', 'hardware-bore-close.png', 'hardware-mount-close.png'],
        'inspection-pose-extrema-sheet.png': [f'pose-extreme-{index}.png' for index in range(1, 5)],
        'inspection-world-sheet.png': [f'world-{mode}-{variant}.png' for mode in ('classic', 'modern', 'chase') for variant in ('source', 'candidate')],
        'inspection-shipped-references-sheet.png': [f'reference-{name}.png' for name in ('player', 'sentinel', 'turret', 'radar', 'silo', 'fuel')]
    }
    for name, items in groups.items():
        columns = 2 if 'pose' in name or 'world' in name else 3
        rows = math.ceil(len(items) / columns)
        width, height = (640, 360) if 'world' in name else (500, 450)
        pixels = np.zeros((rows * height, columns * width, 4), dtype=np.float32)
        pixels[:, :, 3] = 1
        for index, filename in enumerate(items):
            image = bpy.data.images.load(str(EVIDENCE / filename), check_existing=False)
            image.scale(width, height)
            array = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
            row, column = index // columns, index % columns
            row = rows - 1 - row
            pixels[row * height:(row + 1) * height, column * width:(column + 1) * width, :] = array
            bpy.data.images.remove(image)
        sheet = bpy.data.images.new(name, width=columns * width, height=rows * height, alpha=True)
        sheet.pixels.foreach_set(pixels.ravel())
        sheet.filepath_raw = str(EVIDENCE / name)
        sheet.file_format = 'PNG'
        sheet.save()


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
if '--sheets-only' in sys.argv:
    sheets()
elif '--asset-only' in sys.argv:
    setup()
    build_asset()
else:
    setup()
    root = build_asset()
    studio(root)
    world_views()
    references()
    sheets()
    (EVIDENCE / 'render-settings.json').write_text(json.dumps({'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'engine': 'BLENDER_EEVEE', 'threads': 4, 'softwareGL': True, 'samples': 32, 'viewTransform': 'AgX', 'exposure': .7, 'captions': CAPTIONS, 'limits': 'Offline EEVEE on software GL, no live game renderer or GPU/FPS. Existing mapped hull represented by albedo average; original shared maps stay in runtime. No gameplay/VFX changes.'}, indent=2) + '\n')
