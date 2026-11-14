import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
REPO = Path(sys.argv[sys.argv.index('--') + 2]).resolve()
WORLD = json.loads((ROOT / 'checks/world-scene.json').read_text())
WORLD_ONLY = '--world-only' in sys.argv
RECORDS = [item for item in json.loads((ROOT / 'checks/render-record.json').read_text())['renders'] if not item['file'].startswith('world-')] if WORLD_ONLY else []


def g2b(point):
    return Vector((point[0], -point[2], point[1]))


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgb(value):
    return tuple(linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0))


def setup(studio=False):
    scene = bpy.context.scene
    for item in list(scene.objects):
        if item.type in ('LIGHT', 'CAMERA', 'FONT'):
            bpy.data.objects.remove(item, do_unlink=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.eevee.taa_render_samples = 32
    scene.render.resolution_x = 1120 if studio else 1024
    scene.render.resolution_y = 700 if studio else 576
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0
    world = bpy.data.worlds.new('Offline analytic environment — NOT game PMREM')
    world.use_nodes = True
    nodes = world.node_tree.nodes
    background = nodes.get('Background')
    coordinate = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0
    ramp.color_ramp.elements[0].color = (*rgb(0x111C32 if studio else 0x0E1C3A), 1)
    ramp.color_ramp.elements[1].position = 1
    ramp.color_ramp.elements[1].color = (*rgb(0x607A9F if studio else 0x3A5680), 1)
    world.node_tree.links.new(coordinate.outputs['Normal'], separate.inputs[0])
    world.node_tree.links.new(separate.outputs['Z'], ramp.inputs[0])
    world.node_tree.links.new(ramp.outputs[0], background.inputs['Color'])
    background.inputs['Strength'].default_value = 1.5 if studio else 1.6
    scene.world = world
    if studio:
        light('Studio key', (20, 45, -25), (0, 0, 18), 'AREA', 150000, 0xD6ECFF, 45)
        light('Studio edge', (-28, 25, 45), (0, 0, 18), 'AREA', 110000, 0x73B7EB, 32)
        light('Studio warm fill', (-28, 15, -12), (0, 0, 18), 'AREA', 50000, 0xF4C094, 24)
    else:
        direction = Vector((.45, .75, -.5)).normalized()
        light('Source deepspace key parameters', (direction.x * 140, direction.y * 140 + 90, direction.z * 140), (0, 0, 24), 'SUN', 2.9, 0xD6ECFF)
        light('Source rim parameters', (-direction.x * 120, 70, -direction.z * 120), (0, 0, 0), 'SUN', 1.1, 0x4FD8FF)
    return scene


def light(name, position, target, kind, energy, tint, size=1):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = rgb(tint)
    if kind == 'AREA':
        data.shape = 'DISK'
        data.size = size
    else:
        data.angle = .10
    item = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(item)
    item.location = g2b(position)
    item.rotation_euler = (g2b(target) - item.location).to_track_quat('-Z', 'Y').to_euler()


def camera(position, target, width=None, source=None):
    scene = bpy.context.scene
    data = bpy.data.cameras.new('Evidence camera')
    item = bpy.data.objects.new('Evidence camera', data)
    scene.collection.objects.link(item)
    scene.camera = item
    item.location = g2b(position)
    item.rotation_euler = (g2b(target) - item.location).to_track_quat('-Z', 'Y').to_euler()
    data.clip_start, data.clip_end = .1, 1800
    aspect = scene.render.resolution_x / scene.render.resolution_y
    if width is not None or source and source['orthographic']:
        data.type = 'ORTHO'
        data.ortho_scale = width if width is not None else 2 * source['halfHeight'] * aspect
    else:
        data.type = 'PERSP'
        data.sensor_fit = 'VERTICAL'
        data.sensor_height = 24
        data.sensor_width = 24 * aspect
        data.lens = 12 / math.tan(math.radians(source['fov']) / 2)
    return item


def label(title, footer):
    scene = bpy.context.scene
    camera_item = scene.camera
    data = camera_item.data
    aspect = scene.render.resolution_x / scene.render.resolution_y
    half_width = data.ortho_scale / 2 if data.type == 'ORTHO' else math.tan(math.atan(12 / data.lens)) * aspect
    half_height = half_width / aspect
    material = bpy.data.materials.get('Evidence label — not asset')
    if material is None:
        material = bpy.data.materials.new('Evidence label — not asset')
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Emission Color'].default_value = (.6, .8, 1, 1)
        shader.inputs['Emission Strength'].default_value = 1
    labels = []
    for text, y in ((title, half_height * .91), (footer, -half_height * .93)):
        font = bpy.data.curves.new('Evidence annotation', 'FONT')
        font.body = text
        font.size = half_height * .047
        font.align_y = 'TOP_BASELINE'
        font.materials.append(material)
        item = bpy.data.objects.new('Evidence annotation', font)
        scene.collection.objects.link(item)
        item.parent = camera_item
        item.location = (-half_width * .95, y, -1)
        labels.append(item)
    return labels


def render(name, title, footer, notes):
    scene = bpy.context.scene
    annotations = label(title, footer)
    file = ROOT / 'evidence' / name
    scene.render.filepath = str(file)
    started = time.monotonic()
    bpy.ops.render.render(write_still=True)
    frame = [list(point) for point in scene.camera.data.view_frame(scene=scene)]
    RECORDS.append({'file': name, 'title': title, 'footer': footer, 'engine': 'BLENDER_EEVEE', 'threads': 4, 'seconds': round(time.monotonic() - started, 3), 'resolution': [scene.render.resolution_x, scene.render.resolution_y], 'camera_frame': frame, 'notes': notes})
    for item in annotations:
        bpy.data.objects.remove(item, do_unlink=True)


def visibility(variants=('gutter-keel', 'sheared-chine'), isolation=False):
    for collection in bpy.data.collections:
        if collection.name not in ('gutter-keel', 'sheared-chine'):
            continue
        collection.hide_viewport = False
        collection.hide_render = False
        offset = -16 if collection.name == 'gutter-keel' else 16
        if len(variants) == 1:
            offset = 0
        for item in collection.objects:
            item.hide_render = collection.name not in variants
            if isolation and any(fragment in item.name for fragment in ('continuous-torn-shell', 'fitted-lap-plate', 'ember-face')):
                item.hide_render = True
            item.location = g2b((offset, 0, 0))
            item.scale = (22, 22, 22)


bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'asset/drifting-wreckage-kit.blend'))
for name, eye, target, width in (() if WORLD_ONLY else (
    ('01-kit-three-quarter.png', (49, 44, -61), (0, 0, 18), 94),
    ('02-kit-torn-aft.png', (-43, 34, 89), (0, 0, 18), 92),
    ('03-kit-open-top.png', (0, 91, 19), (0, 0, 18), 88),
    ('04-kit-underside.png', (35, -48, -61), (0, 0, 18), 94),
)):
    setup(True)
    visibility()
    camera(eye, target, width)
    render(name, 'DRIFTING WRECKAGE | gutter-keel 532 tris / sheared-chine 480 tris', 'OFFLINE EEVEE | studio lights, size 22 | two buckets / variant | no textures', 'Both independent templates at identical scale; bright studio inspection lighting, not a game screenshot.')
for variant, number in (() if WORLD_ONLY else (('gutter-keel', '05'), ('sheared-chine', '06'))):
    setup(True)
    visibility((variant,))
    camera((19, 20, -24), (0, -1, 10), 35)
    render(f'{number}-{variant}-structural-closeup.png', f'{variant.upper()} | open torn end / fitted plates / attached exposed frames', 'OFFLINE EEVEE | structural closeup | static geometry, no damage or detached parts', 'Canonical shell opening, thickness, torn end rims, exposed frames and fitted lap plates; no painted hole.')
setup(True)
visibility(('gutter-keel',), isolation=True)
camera((24, 27, -37), (0, 0, 18), 51)
if not WORLD_ONLY:
    render('07-frame-conduit-isolation.png', 'STRUCTURE ISOLATION | transverse frames / longerons / conduits', 'OFFLINE EEVEE | evidence-only visibility: shell, plates and embers hidden', 'An inspection layer only, not a runtime state or a detach/damage feature.')


def batch_material(bucket):
    material = bpy.data.materials.new('Source darkMetal approximation' if bucket == 'dark' else 'Source neonVertex snapshot')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    attribute = nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = 'Color'
    if bucket == 'dark':
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = (*rgb(0x3A4A5E), 1)
        material.node_tree.links.new(attribute.outputs['Color'], multiply.inputs[1])
        material.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
        shader.inputs['Metallic'].default_value = .5
        shader.inputs['Roughness'].default_value = .46
    else:
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        material.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 1
    return material


def source_flicker(anim, seconds=0):
    mode, rate, phase = anim
    noise = math.sin(math.floor(seconds * rate * 7 + phase * 91) * 12.9898) * 43758.5453
    return 1 if noise - math.floor(noise) > .22 else .25


def world_meshes(baseline=False):
    data = WORLD['source_baseline_buckets'] if baseline else WORLD['buckets']
    for key, bucket in data.items():
        points = [g2b(bucket['p'][index:index + 3]) for index in range(0, len(bucket['p']), 3)]
        mesh = bpy.data.meshes.new(f'actual-Batch-{key}')
        mesh.from_pydata(points, [], [list(range(index, index + 3)) for index in range(0, len(points), 3)])
        mesh.update()
        item = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(item)
        item.data.materials.append(batch_material(key))
        attribute = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for index, entry in enumerate(attribute.data):
            tint = bucket['c'][index * 3:index * 3 + 3]
            gain = source_flicker(bucket['anim'][index * 3:index * 3 + 3]) if bucket['anim'] else 1
            entry.color = (*[value * gain for value in tint], 1)
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO / 'public/models/player.glb'))
    for item in set(bpy.context.scene.objects) - before:
        if item.parent is None:
            item.location += g2b(WORLD['player']['pos'])


for camera_data in WORLD['cameras']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup(False)
    world_meshes()
    camera(camera_data['position'], camera_data['lookAt'], source=camera_data)
    render(f'world-{camera_data["mode"]}.png', f'WORLD SCALE | {camera_data["mode"].upper()} source camera | shipped player at 1:1', 'OFFLINE EEVEE | source light params / AO / t=0 flicker | sky, IBL and fog NOT WebGL', 'Identical actual Batch scene across all three source cameras. Framing-selected source-legal seeded placements, not average gameplay: no individual placement/scale/rotation changed. Analytic environment replaces game PMREM; no game nebula, exp2 fog, bloom or tone-map equivalence claimed. Camera dimensions are source-exact.')
bpy.ops.wm.read_factory_settings(use_empty=True)
setup(False)
world_meshes(True)
camera_data = WORLD['cameras'][0]
camera(camera_data['position'], camera_data['lookAt'], source=camera_data)
render('world-classic-source-baseline.png', 'WORLD SCALE | CLASSIC source baseline | original 120-triangle wrecks', 'OFFLINE EEVEE | same placements / source lights / player / camera as new kit', 'Only original wreck branch geometry, not asteroids/stations/landmarks. Source-shader CPU t=0 flicker snapshot, not WebGL.')

bpy.ops.wm.read_factory_settings(use_empty=True)
setup(True)
names = ('player', 'sentinel', 'turret', 'radar', 'silo', 'fuel')
for index, name in enumerate(() if WORLD_ONLY else names):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO / f'public/models/{name}.glb'))
    imported = set(bpy.context.scene.objects) - before
    meshes = [item for item in imported if item.type == 'MESH']
    points = [item.matrix_world @ Vector(corner) for item in meshes for corner in item.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    scale = 15 / max(high - low)
    center = (high + low) / 2
    offset = g2b(((index % 3 - 1) * 25, 0, (index // 3) * 29))
    for item in imported:
        if item.parent is None:
            item.location = item.location * scale - center * scale + offset
            item.scale *= scale
camera((30, 63, -67), (0, 0, 14), 95)
if not WORLD_ONLY:
    render('00-shipped-vocabulary.png', 'SHIPPED VOCABULARY | front: player / sentinel / turret; rear: radar / silo / fuel', 'OFFLINE EEVEE | reference sheet NORMALIZED FOR INSPECTION, not common world scale', 'Six shipped GLBs used for bevelled plate vocabulary, exposed structure, low-key steel and restrained warm/cyan emissive accents. No reference design copied as wreckage.')
(ROOT / 'checks/render-record.json').write_text(json.dumps({'blender': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(), 'environment': 'Native Linux BLENDER_EEVEE, wrapper forces LIBGL_ALWAYS_SOFTWARE=1, Mesa llvmpipe where reported. Offline render, no live WebGL/GPU benchmark.', 'source_camera': WORLD['cameras'], 'renders': RECORDS, 'formal_reviews': 0, 'formal_fix_passes': 0}, indent=2) + '\n')
print('WRECKAGE_EVIDENCE_COMPLETE', len(RECORDS))
