import bpy
import json
import math
import os
import struct
import sys
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd()))
OUT = ROOT / 'asset-work/antenna/initial'
WORK = ROOT / 'asset-work/antenna/work'
DATA = json.loads((WORK / 'geometry.json').read_text())
ASSET = OUT / 'asset'
EVIDENCE = OUT / 'evidence'
RAW = WORK / 'renders'
RAW.mkdir(exist_ok=True)


def linear(channel):
    value = channel / 255
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def color(hex_value):
    return tuple(linear((hex_value >> shift) & 255) for shift in (16, 8, 0))


def game(point):
    return (point[0], -point[2], point[1])


def material(name, tint, emission=False):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.use_backface_culling = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Metallic'].default_value = 0 if emission else .5
    shader.inputs['Roughness'].default_value = .46
    shader.inputs['Base Color'].default_value = (*tint, 1)
    if emission:
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Emission Color'].default_value = (*tint, 1)
        shader.inputs['Emission Strength'].default_value = 1.6
    else:
        vertex = result.node_tree.nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'BatchTintAO'
        multiply = result.node_tree.nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[1].default_value = (*tint, 1)
        result.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[2])
        result.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
    result['runtime_shared_material'] = 'materials.neonVertex' if emission else 'materials.darkMetal'
    result['no_maps'] = True
    return result


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
SCENE = bpy.context.scene
SCENE.render.engine = 'BLENDER_EEVEE'
SCENE.render.threads_mode = 'FIXED'
SCENE.render.threads = 4
SCENE.render.image_settings.file_format = 'PNG'
SCENE.render.image_settings.color_mode = 'RGBA'
SCENE.render.film_transparent = False
SCENE.render.resolution_percentage = 100
SCENE.render.image_settings.color_depth = '8'
SCENE.eevee.taa_render_samples = 24
SCENE.view_settings.view_transform = 'AgX'
SCENE.view_settings.look = 'AgX - Medium High Contrast'
SCENE.view_settings.exposure = .6
SCENE.world = bpy.data.worlds.new('Offline dark studio')
SCENE.world.use_nodes = True
SCENE.world.node_tree.nodes['Background'].inputs[0].default_value = (*color(0x182536), 1)
SCENE.world.node_tree.nodes['Background'].inputs[1].default_value = .55
DARK = material('darkMetal_shared_response', tuple(value * 1.1 for value in color(0x3a4a5e)))
NEON = material('neonVertex_source_lamp_preview', color(0xff3d55), True)
MOUNT_NAMES = ['continuous_spine', 'mount_flange', 'tapered_mount_shoe', 'socket_clamp', 'anchor_bolt_L_rear', 'anchor_bolt_L_front', 'anchor_bolt_R_rear', 'anchor_bolt_R_front', 'continuous_rear_conduit', 'conduit_lower_elbow', 'conduit_upper_elbow', 'sealed_base_terminal', 'beacon_socket', 'beacon_cap', 'rear_cable_clip']


def asset_objects(variant, prefix=''):
    data = DATA[variant]
    root = bpy.data.objects.new(prefix + 'FORTRESS_ANTENNA', None)
    SCENE.collection.objects.link(root)
    root['source_height'] = data['parts'][-1]['placement'][1]
    root['generator_variant'] = variant
    root['units'] = 'world units; local game X across, Y up, Z forward'
    root['runtime'] = 'AntennaRecipe.mjs startup cached Batch stamping; do not instantiate this scene per prop'
    objects = [root]
    for key, bucket in data['buckets'].items():
        positions = bucket['position']
        vertices = [game(positions[offset:offset + 3]) for offset in range(0, len(positions), 3)]
        faces = [tuple(range(offset, offset + 3)) for offset in range(0, len(vertices), 3)]
        mesh = bpy.data.meshes.new(prefix + key + '_editable_mesh')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(prefix + ('structure_dark' if key == 'dark' else 'obstruction_lamp_neon'), mesh)
        SCENE.collection.objects.link(obj)
        obj.parent = root
        obj.data.materials.append(DARK if key == 'dark' else NEON)
        obj['runtime_bucket'] = key
        obj['runtime_material'] = 'materials.darkMetal' if key == 'dark' else 'materials.neonVertex'
        if key == 'dark':
            attribute = mesh.color_attributes.new(name='BatchTintAO', type='FLOAT_COLOR', domain='POINT')
            colors = bucket['color']
            for index, entry in enumerate(attribute.data):
                entry.color = (*(value / 1.1 for value in colors[index * 3:index * 3 + 3]), 1)
        for index, part in enumerate(data['parts']):
            if part['key'] != key:
                continue
            if index < len(MOUNT_NAMES):
                name = MOUNT_NAMES[index]
            elif key == 'neon':
                name = 'red_obstruction_lens'
            else:
                name = f"aerial_{(index - 15) // 2 + 1:02d}_" + ('rod' if (index - 15) % 2 == 0 else 'clamp')
            group = obj.vertex_groups.new(name=name)
            group.add(list(range(part['firstVertex'], part['firstVertex'] + part['vertexCount'])), 1, 'REPLACE')
        if key == 'neon':
            obj['source_hue_citadel'] = '0xff3d55'
            obj['source_hue_gauntlet'] = '0xff2a3a'
            obj['source_gain'] = 1.6
            obj['source_aAnim'] = bucket['animation'][:3]
            obj['animation_note'] = 'Explicit shared clock shader reconstruction, NOT static glTF animation'
        objects.append(obj)
    return objects


BASE_OBJECTS = asset_objects('seed42')
SCENE['asset_status'] = 'pending_deferred_opus_review'
SCENE['formal_reviews'] = 0
SCENE['formal_fix_rounds'] = 0
SCENE['model'] = 'gpt-6.1-sol'
SCENE['reasoning_effort'] = 'xhigh'
SCENE['speed'] = 'available; no numeric speed control exposed'
SCENE['source_control'] = 'ee221ad; production source untouched'
SCENE['generator'] = 'initial/source/build-geometry.mjs + source/AntennaRecipe.mjs + source/build-blender.py'
for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in BASE_OBJECTS:
    obj.select_set(True)
bpy.context.view_layer.objects.active = BASE_OBJECTS[1]
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ASSET / 'fortress-antenna.blend'))
bpy.ops.export_scene.gltf(filepath=str(ASSET / 'fortress-antenna.glb'), export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_materials='EXPORT', export_extras=True, export_apply=False, export_cameras=False, export_lights=False)
glb_path = ASSET / 'fortress-antenna.glb'
glb_bytes = glb_path.read_bytes()
json_length = struct.unpack_from('<I', glb_bytes, 12)[0]
document = json.loads(glb_bytes[20:20 + json_length])
for entry in document['materials']:
    if entry['name'] == DARK.name:
        entry['pbrMetallicRoughness']['baseColorFactor'] = [*(value * 1.1 for value in color(0x3a4a5e)), 1]
for mesh in document['meshes']:
    for primitive in mesh['primitives']:
        attrs = primitive['attributes']
        if 'COLOR_1' in attrs:
            attrs['COLOR_0'] = attrs.pop('COLOR_1')
json_bytes = json.dumps(document, separators=(',', ':')).encode()
json_bytes += b' ' * (-len(json_bytes) % 4)
remainder = glb_bytes[20 + json_length:]
header = struct.pack('<4sII', b'glTF', 2, 20 + len(json_bytes) + len(remainder))
glb_path.write_bytes(header + struct.pack('<I4s', len(json_bytes), b'JSON') + json_bytes + remainder)
if os.environ.get('ANTENNA_ASSET_ONLY') == '1':
    print('ANTENNA_ASSET_ONLY_COMPLETE')
    sys.exit(0)


def light(name, location, target, tint, power, area=None):
    data = bpy.data.lights.new(name, 'AREA' if area else 'SUN')
    data.energy = power
    data.color = color(tint)
    if area:
        data.shape = 'DISK'
        data.size = area
    else:
        data.angle = math.radians(6)
    obj = bpy.data.objects.new(name, data)
    SCENE.collection.objects.link(obj)
    obj.location = game(location)
    obj.rotation_euler = (Vector(game(target)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


LIGHTS = [light('Studio large cool key', (5, 10, -6), (0, 5, 0), 0xd7e7ff, 1500, 7), light('Studio warm edge', (-5, 7, 4), (0, 5, 0), 0xffc28b, 1200, 6), light('Studio front fill', (-1, 4, -9), (0, 4, 0), 0x9fd3ff, 850, 5)]
camera_data = bpy.data.cameras.new('Offline evidence camera')
camera_data.sensor_fit = 'HORIZONTAL'
CAMERA = bpy.data.objects.new('Offline evidence camera', camera_data)
SCENE.collection.objects.link(CAMERA)
SCENE.camera = CAMERA
CAMERA.data.clip_start = .05
CAMERA.data.clip_end = 800
TEXTS = []


def labels(title, footer, width, height):
    for obj in TEXTS:
        bpy.data.objects.remove(obj, do_unlink=True)
    TEXTS.clear()
    if CAMERA.data.type == 'ORTHO':
        horizontal = CAMERA.data.ortho_scale
        vertical = horizontal * height / width
    else:
        horizontal = 2 * math.tan(CAMERA.data.angle_x / 2)
        vertical = horizontal * height / width
    for text, ypos, size in [(title, vertical * .445, horizontal / 64), (footer, -vertical * .46, horizontal / 91)]:
        curve = bpy.data.curves.new('Evidence caption', 'FONT')
        curve.body = text
        curve.size = size
        curve.extrude = 0
        obj = bpy.data.objects.new('Evidence caption', curve)
        SCENE.collection.objects.link(obj)
        obj.parent = CAMERA
        obj.location = (-horizontal * .47, ypos, -1)
        mat = bpy.data.materials.get('Caption self lit')
        if not mat:
            mat = bpy.data.materials.new('Caption self lit')
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            nodes.clear()
            emit = nodes.new('ShaderNodeEmission')
            emit.inputs[0].default_value = (.7, .82, .95, 1)
            output = nodes.new('ShaderNodeOutputMaterial')
            mat.node_tree.links.new(emit.outputs[0], output.inputs[0])
        curve.materials.append(mat)
        TEXTS.append(obj)


def camera(location, target, scale=None, fov=None):
    CAMERA.location = game(location)
    CAMERA.rotation_euler = (Vector(game(target)) - CAMERA.location).to_track_quat('-Z', 'Y').to_euler()
    CAMERA.data.type = 'ORTHO' if scale else 'PERSP'
    if scale:
        CAMERA.data.ortho_scale = scale
    else:
        CAMERA.data.sensor_fit = 'HORIZONTAL'
        CAMERA.data.angle = math.radians(fov)


def render(name, title, footer, width, height):
    SCENE.render.resolution_x = width
    SCENE.render.resolution_y = height
    labels(title, footer, width, height)
    SCENE.render.filepath = str(RAW / f'{name}.png')
    bpy.ops.render.render(write_still=True)
    return str(RAW / f'{name}.png')


def sheet(paths, columns, destination):
    arrays = []
    for path in paths:
        image = bpy.data.images.load(path, check_existing=False)
        width, height = image.size
        values = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(values)
        arrays.append(values.reshape(height, width, 4))
        bpy.data.images.remove(image)
    rows = math.ceil(len(arrays) / columns)
    result = np.zeros((height * rows, width * columns, 4), dtype=np.float32)
    for index, values in enumerate(arrays):
        row, column = divmod(index, columns)
        start = (rows - row - 1) * height
        result[start:start + height, column * width:(column + 1) * width] = values
    image = bpy.data.images.new(destination, width=width * columns, height=height * rows, alpha=True)
    image.pixels.foreach_set(result.ravel())
    image.filepath_raw = str(EVIDENCE / destination)
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


views = []
for name, location in [('front', (0, 5.5, -24)), ('rear', (0, 5.5, 24)), ('three-quarter', (14, 8, -20))]:
    camera(location, (0, 5.5, 0), scale=6.8)
    views.append(render(name, f'ANTENNA INITIAL | {name}', 'Offline EEVEE studio | source seed 42 | 304 triangles', 600, 1100))
sheet(views, 3, '01-multiview.png')
closeups = []
for name, location, target, scale in [('mount', (.9, .85, -1.3), (0, .5, 0), 1.5), ('clamped-aerial', (2.7, 2.7, -4), (0, 2.05, 0), 2.8), ('beacon', (.9, 11.2, -1.3), (0, 10.72, 0), 1.3)]:
    camera(location, target, scale=scale)
    closeups.append(render(name, f'HARDWARE | {name}', 'Offline EEVEE | unmapped shared-dark response approximation', 800, 720))
sheet(closeups, 3, '02-hardware-closeups.png')

for obj in BASE_OBJECTS:
    obj.hide_render = True
for obj in LIGHTS:
    obj.hide_render = True
sun = light('Source dusk key approximation', (-50, 70, -52), (0, 0, 0), 0xffbc86, 3.4)
rim = light('Source cyan rim approximation', (50, 45, 52), (0, 0, 0), 0x4fd8ff, 1.1)
SCENE.world.node_tree.nodes['Background'].inputs[0].default_value = (*color(0x5a6f95), 1)
SCENE.world.node_tree.nodes['Background'].inputs[1].default_value = .7


def proxy_box(name, dimensions, center, tint):
    bpy.ops.mesh.primitive_cube_add(size=1, location=game(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (dimensions[0], dimensions[2], dimensions[1])
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color(tint), 1)
    obj.data.materials.append(mat)
    return obj


proxy_box('TEST DOUBLE deck, not source fortress', (54, .08, 125), (0, -.08, 38), 0x344154)
proxy_box('TEST DOUBLE channel surface', (32, .01, 125), (0, -.03, 38), 0x182a3d)
for side in [-1, 1]:
    proxy_box('TEST DOUBLE lane edge marker', (.06, .01, 125), (side * 16, -.015, 38), 0xd4984d)
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/models/player.glb'))
ship_objects = set(bpy.data.objects) - before
ship_roots = [obj for obj in ship_objects if obj.parent not in ship_objects]
for obj in ship_roots:
    obj.location += Vector(game((12, 6, 0)))
world_paths = []
world_meta = []
for height in [7, 13]:
    variant_objects = asset_objects(f'h{height}', f'evidence_h{height}_')
    variant_objects[0].location = game((19.5, 0, 30))
    for state, gain, hue in [('dim', .08, 0xff3d55), ('peak', 1.53, 0xff2a3a)]:
        shader = NEON.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Color'].default_value = (*color(hue), 1)
        shader.inputs['Emission Strength'].default_value = 1.6 * gain
        for rig, yaw, distance, rise, fov in [('Classic', 45, 64, 45.255, 52), ('Modern', 20, 29, 14, 58), ('Chase', 6, 24, 9.5, 66)]:
            angle = math.radians(yaw)
            if rig == 'Classic':
                eye = (-distance * math.sin(angle), 9 + rise, 28 - distance * math.cos(angle))
                target = (0, 9, 28)
                camera(eye, target, scale=120)
            else:
                eye = (12 - distance * math.sin(angle), 6 + rise, -distance * math.cos(angle))
                target = (12, 7.2, 16)
                horizontal_fov = math.degrees(2 * math.atan(math.tan(math.radians(fov / 2)) * 1.5))
                camera(eye, target, fov=horizontal_fov)
            title = f'{rig.upper()} | h={height} | STROBE {state} {gain}'
            world_paths.append(render(f'world-{rig}-h{height}-{state}', title, 'WORLD 1:1 | shipped player x12,y6 | EEVEE lighting/deck proxies, NOT live', 900, 600))
            world_meta.append({ 'rig': rig, 'height': height, 'strobe': state, 'gain': gain, 'hue': hex(hue), 'eyeGame': eye, 'targetGame': target, 'verticalFov': fov if rig != 'Classic' else None, 'orthoHalfHeight': 40 if rig == 'Classic' else None, 'playerGame': [12, 6, 0], 'antennaGame': [19.5, 0, 30] })
    for obj in variant_objects:
        obj.hide_render = True
sheet(world_paths, 3, '03-world-scale-classic-modern-chase.png')
(EVIDENCE / 'render-settings.json').write_text(json.dumps({ 'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'engine': 'BLENDER_EEVEE', 'threads': 4, 'samples': 24, 'viewTransform': 'AgX', 'look': SCENE.view_settings.look, 'exposure': .6, 'world': world_meta, 'limitations': ['Offline CPU software EEVEE, not live game, GPU or FPS capture.', 'Dusk key/rim color and intensity approximations; hemisphere, PMREM, fog, tone mapping, bloom and screen-space lighting are NOT source-equivalent.', 'Deck/channel/edge markers are labeled test doubles, not source fortress geometry.', 'Common world cameras are exact no-boost source rig formulas at 3:2; Classic halfHeight40; player actual shipped GLB at original scale.', 'h7 and h13 are forced-height endpoint fixtures, with explicit widths/spacing, not claimed random source draws.', 'GLB is reference seed42 static preview only; source hue/gain/rate/phase are rebuilt through aAnim in the runtime recipe.'] }, indent=2))
print('ANTENNA_BUILD_AND_EVIDENCE_COMPLETE')
