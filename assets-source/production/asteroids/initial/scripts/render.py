import json
import math
import os
import pathlib
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector


ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = pathlib.Path(os.environ.get('ASTEROID_REPO', '/home/knotzuni/code/KnotzAxxon'))
WORLD = json.loads((ROOT / 'measurements/world-scene.json').read_text())
BASELINE = json.loads((ROOT / 'measurements/baseline.json').read_text())
BUILD = json.loads((ROOT / 'measurements/build.json').read_text())
EVIDENCE = ROOT / 'evidence'
FRAMES = []


def game(point):
    return Vector((point[0], -point[2], point[1]))


def material(name, color, emission=0):
    item = bpy.data.materials.new(name)
    item.use_nodes = True
    shader = item.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .9
    shader.inputs['Metallic'].default_value = .08
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return item


def palette_material(tint, source=False):
    item = material('Offline_SourceTint_' + str(tint), (.65, .64, .61))
    nodes = item.node_tree.nodes
    shader = nodes.get('Principled BSDF')
    def linear(channel):
        value = channel / 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    rgb = tuple(linear((tint >> shift) & 255) for shift in [16, 8, 0])
    if source:
        shader.inputs['Base Color'].default_value = (*[value * .74 for value in rgb], 1)
    else:
        vertex = nodes.new('ShaderNodeVertexColor')
        vertex.layer_name = 'AS_Palette'
        multiply = nodes.new('ShaderNodeMixRGB')
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1
        multiply.inputs[2].default_value = (*[value * .74 for value in rgb], 1)
        item.node_tree.links.new(vertex.outputs['Color'], multiply.inputs[1])
        item.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
    return item


def setup(name, width=1024, height=768):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = name
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 24
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .45
    scene.world = bpy.data.worlds.new('Offline_Navy_World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055, .075, .12, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .55
    return scene


def light(name, location, power, color, size=5, kind='AREA'):
    data = bpy.data.lights.new(name, kind)
    data.energy = power
    data.color = color
    if kind == 'AREA':
        data.shape = 'DISK'
        data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def studio_lights():
    light('warm_broad_key', (2, -4, 6), 650, (1, .87, .70), 5)
    light('cool_fill', (-4, -1, 2), 330, (.56, .72, 1), 4)
    light('edge_light', (1, 4, 2), 750, (.68, .82, 1), 3)


def camera(eye, target, ortho=None, fov=50):
    data = bpy.data.cameras.new('Offline_Evidence_Camera')
    obj = bpy.data.objects.new('Offline_Evidence_Camera', data)
    bpy.context.collection.objects.link(obj)
    obj.location = eye
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.clip_start = .01
    data.clip_end = 2000
    data.lens_unit = 'FOV'
    data.sensor_fit = 'HORIZONTAL'
    aspect = bpy.context.scene.render.resolution_x / bpy.context.scene.render.resolution_y
    data.angle = 2 * math.atan(math.tan(math.radians(fov) / 2) * aspect)
    if ortho is not None:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    bpy.context.scene.camera = obj
    return obj


def label(text, x, y, size=.16, color=(.65, .79, .93)):
    cam = bpy.context.scene.camera
    data = bpy.data.curves.new('EvidenceLabel', 'FONT')
    data.body = text
    data.size = size
    data.extrude = 0
    obj = bpy.data.objects.new('EvidenceLabel', data)
    bpy.context.collection.objects.link(obj)
    obj.parent = cam
    obj.location = (x, y, -2)
    data.materials.append(material('EvidenceText', color, 1))
    return obj


def save(name, info):
    scene = bpy.context.scene
    scene.render.filepath = str(EVIDENCE / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    FRAMES.append({'file': 'evidence/' + name + '.png', 'engine': 'BLENDER_EEVEE', 'samples': scene.eevee.taa_render_samples,
                   'resolution': [scene.render.resolution_x, scene.render.resolution_y], **info})


def import_kit():
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'assets/asteroid-scenery-kit.glb'))
    objects = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == 'MESH'}
    preview = palette_material(0xb8b0a4)
    for obj in objects.values():
        obj.data.materials.clear()
        obj.data.materials.append(preview)
    return objects


def mesh_from_data(name, data, points=None, tint=0xb8b0a4, source=False):
    coordinates = points if points is not None else [data['position'][offset:offset + 3] for offset in range(0, len(data['position']), 3)]
    indices = data.get('index') or list(range(len(coordinates)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([game(point) for point in coordinates], [], [tuple(indices[offset:offset + 3]) for offset in range(0, len(indices), 3)])
    mesh.update()
    if data.get('color'):
        palette = mesh.color_attributes.new(name='AS_Palette', type='FLOAT_COLOR', domain='POINT')
        stride = data['colorItemSize']
        for index in range(len(coordinates)):
            palette.data[index].color = (*data['color'][index * stride:index * stride + 3], 1)
    mesh.materials.append(palette_material(tint, source))
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def studio(backs_only=False):
    if not backs_only:
        setup('Offline_EEVEE_Authored_Three_Quarter', 1400, 700)
        objects = import_kit()
        for index, spec in enumerate(BUILD['templates']):
            objects[spec['node']].location.x = (index - 1) * 2.7
        studio_lights()
        camera((1.0, 7.8, 5.4), (0, 0, .05), ortho=8.5)
        label('ASTEROID SCENERY KIT / INITIAL', -3.95, 1.76, .16)
        label('OFFLINE EEVEE / authored units / no texture / not live WebGL', -3.95, -1.88, .105)
        for index, spec in enumerate(BUILD['templates']):
            label(spec['node'].replace('AS_', '').replace('_', ' ') + ' / ' + str(spec['evaluatedTriangles']) + ' tris', -3.95 + index * 2.7, -1.58, .12)
        save('kit-three-quarter', {'kind': 'studio comparison', 'worldScale': False, 'note': 'One common camera; common authored units, no per-template normalization.'})

    for template in BUILD['templates']:
        if os.environ.get('ASTEROID_BACK_NODE') and template['node'] != os.environ['ASTEROID_BACK_NODE']:
            continue
        for view in ['crater', 'back']:
            if backs_only and view != 'back':
                continue
            setup('Offline_EEVEE_' + template['node'] + '_' + view, 900, 900)
            objects = import_kit()
            for name, obj in objects.items():
                obj.hide_render = name != template['node']
            studio_lights()
            axis = Vector(template['spec']['axis']).normalized()
            eye = game(axis * 4 + Vector((.65, .12, -.15))) if view == 'crater' else Vector((-3.4, -3.4, -1.8))
            camera(eye, (0, 0, .06), ortho=2.75)
            label(template['node'] + ' / ' + view.upper(), -1.26, 1.13, .078)
            label('OFFLINE EEVEE / 1 continuous closed surface', -1.26, -1.23, .058)
            save(template['file'].split('/')[-1].replace('.glb', '') + '-' + view, {'kind': view, 'node': template['node'], 'worldScale': False})


def spin_study():
    selected = max((rock for chunk in WORLD['chunks'] for rock in chunk['rocks'] if 45 < abs(rock['x']) < 90 and abs(rock['y'] - 20) < 30), key=lambda rock: rock['s'])
    source = next(rock for chunk in BASELINE['chunks'] if chunk['seed'] == 42 for rock in chunk['rocks'] if abs(rock['z'] - selected['z']) < 1e-9)
    data = next(item for item in WORLD['templates'] if item['name'] == selected['node'])
    points = [Vector((data['position'][offset] * selected['s'] * selected['shape']['sx'], data['position'][offset + 1] * selected['s'] * selected['shape']['sy'], data['position'][offset + 2] * selected['s'] * selected['shape']['sz'])) for offset in range(0, len(data['position']), 3)]
    for turn, angle in enumerate([0, math.pi / 2, math.pi, math.pi * 1.5]):
        setup('Offline_EEVEE_Actual_Placement_FullSpin', 1000, 700)
        axis = Vector(selected['spin'][:3]).normalized()
        rotation = Quaternion(axis, angle)
        mesh_from_data('AuthoredActualRadius', data, [rotation @ point for point in points], selected['tint'])
        legacy_data = source['geometry']
        legacy_points = [Vector(legacy_data['position'][offset:offset + 3]) for offset in range(0, len(legacy_data['position']), 3)]
        legacy_obj = mesh_from_data('SourceActualRadius', legacy_data, [rotation @ point for point in legacy_points], source['tint'], True)
        spacing = 42
        legacy_obj.location.x = -spacing / 2
        authored_obj = bpy.data.objects['AuthoredActualRadius']
        authored_obj.location.x = spacing / 2
        key = light('Shared_sun', (3, -8, 12), 3, (1, .88, .75), kind='SUN')
        light('Shared_fill', (-4, -1, 4), 1.0, (.55, .7, 1), kind='SUN')
        camera((5, -85, 55), (0, 0, 0), ortho=88)
        label('SOURCE                                 AUTHORED KIT', -40, 24, 1.4)
        label('ACTUAL s=' + format(selected['s'], '.4f') + ' / same anisotropy / spin ' + str(turn * 90) + ' deg', -40, -23, .9)
        label('OFFLINE EEVEE / origin translated for comparison only / no size normalization', -40, -26, .72)
        save('actual-radius-spin-' + str(turn * 90).zfill(3), {'kind': 'rest/full-spin', 'worldScale': True,
             'placement': [selected['x'], selected['y'], selected['z']], 's': selected['s'], 'shape': selected['shape'], 'axis': selected['spin'][:3],
             'angleRadians': angle, 'radiusAuthored': selected['radius'], 'radiusSource': selected['sourceRadius'],
             'note': 'Selected source rock and corresponding kit rock at exact sampled radius/aniso. Translation offsets only for side-by-side comparison; common fixed ortho camera.'})


def beam(start, end, thickness, mat):
    midpoint = (Vector(start) + Vector(end)) / 2
    delta = Vector(end) - Vector(start)
    bpy.ops.mesh.primitive_cylinder_add(vertices=4, radius=thickness, depth=delta.length, location=midpoint)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(mat)


def world_frames(classic_density=False):
    spin_time = float(os.environ.get('ASTEROID_SPIN_TIME', '0'))
    cameras = [WORLD['classicDensityCamera']] if classic_density else WORLD['cameras']
    for data_camera in cameras:
        for variant in ['source', 'kit']:
            setup('Offline_EEVEE_' + data_camera['mode'] + '_' + variant, 1280, 720)
            player_z = data_camera['player'][2]
            first = math.floor((player_z - 90) / 96)
            last = math.floor((player_z + 700) / 96)
            chunks = [chunk for chunk in WORLD['chunks'] if first <= chunk['index'] <= last]
            rocks = [rock for chunk in chunks for rock in chunk['rocks']]
            for rock in rocks:
                if variant == 'source':
                    original = next(item for chunk in BASELINE['chunks'] if chunk['seed'] == 42 and chunk['index'] == math.floor(rock['z'] / 96) for item in chunk['rocks'] if item['ordinal'] == rock['ordinal'])
                    data = original['geometry']
                    points = [data['position'][offset:offset + 3] for offset in range(0, len(data['position']), 3)]
                else:
                    data = next(item for item in WORLD['templates'] if item['name'] == rock['node'])
                    points = [(data['position'][offset] * rock['s'] * rock['shape']['sx'], data['position'][offset + 1] * rock['s'] * rock['shape']['sy'], data['position'][offset + 2] * rock['s'] * rock['shape']['sz']) for offset in range(0, len(data['position']), 3)]
                rotation = Quaternion(Vector(rock['spin'][:3]).normalized(), rock['spin'][3] * spin_time)
                points = [rotation @ Vector(point) for point in points]
                obj = mesh_from_data('Scenery_' + str(rock['ordinal']) + '_' + str(rock['z']), data, points, rock['tint'], variant == 'source')
                obj.location = game((rock['x'], rock['y'], rock['z'] - player_z))
            before = set(bpy.context.scene.objects)
            bpy.ops.import_scene.gltf(filepath=str(REPO / 'public/models/player.glb'))
            imported = set(bpy.context.scene.objects) - before
            roots = [obj for obj in imported if obj.parent not in imported]
            for root in roots:
                root.location += game((0, 9, 0))
            grid = material('Offline_Grid_Guide', (.025, .16, .22), .45)
            for x in [-16, 0, 16]:
                beam(game((x, 0, -45)), game((x, 0, 700)), .045, grid)
            for z in range(-32, 700, 24):
                beam(game((-16, 0, z)), game((16, 0, z)), .026, grid)
            light('Offline_Sun_Warm', (2, -4, 7), 3.0, (1, .86, .72), kind='SUN')
            light('Offline_Sky_Fill', (-4, -1, 2), 1.2, (.55, .74, 1), kind='SUN')
            eye = data_camera['eye'].copy()
            target = data_camera['target'].copy()
            eye[2] -= player_z
            target[2] -= player_z
            ortho = data_camera['halfHeight'] * 2 * data_camera['aspect'] if data_camera['orthographic'] else None
            cam = camera(game(eye), game(target), ortho=ortho, fov=data_camera['fov'])
            cam.data.clip_start = data_camera['near']
            cam.data.clip_end = data_camera['far']
            if ortho:
                title_scale = ortho / 2
            else:
                title_scale = math.tan(cam.data.angle / 2) * 2
            label(data_camera['mode'].upper() + ' / ' + variant.upper() + ' / seed42 z' + str(player_z) + ' / t' + str(spin_time) + ' / player 1:1', -title_scale * .94, title_scale * .48, title_scale * .031)
            label('OFFLINE EEVEE reconstruction / source camera / no shader, textures, landmarks or gameplay proof', -title_scale * .94, -title_scale * .51, title_scale * .022)
            suffix = '' if spin_time == 0 else '-t' + str(spin_time).replace('.', '-')
            if data_camera.get('sampleTag'):
                suffix += '-' + data_camera['sampleTag']
            save('world-' + data_camera['mode'] + '-' + variant + suffix, {'kind': 'world-scale source comparison', 'worldScale': True,
                'cameraSource': data_camera, 'asteroidsResident': len(rocks), 'variant': variant, 'spinTime': spin_time,
                'playerSha256': WORLD['playerSha256'], 'note': 'Exact rock placements and source camera snap. Origin translated -playerZ only. Shipped player not resized. Neutral texture attenuation .74 approximates shared map; no actual Three.js rockTexture/addRim shader. No wreck/truss/landmark/gates/enemies.'})


mode = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'all'
if mode in ['all', 'studio']:
    studio()
if mode == 'backs':
    studio(backs_only=True)
if mode in ['all', 'spin']:
    spin_study()
if mode in ['all', 'world']:
    world_frames()
if mode == 'classic-density':
    world_frames(classic_density=True)
report_suffix = '-t' + os.environ['ASTEROID_SPIN_TIME'].replace('.', '-') if 'ASTEROID_SPIN_TIME' in os.environ else ''
report_file = ROOT / ('measurements/render-' + mode + report_suffix + '.json')
report_file.write_text(json.dumps({'engine': 'BLENDER_EEVEE', 'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(),
                                  'threads': 4, 'frames': FRAMES, 'liveWebGL': False}, indent=2) + '\n')
