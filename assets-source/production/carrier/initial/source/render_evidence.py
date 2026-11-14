import array
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[2]
WORK = ROOT.parent / 'work'
EVIDENCE = ROOT / 'evidence'
RECORDS = []


def game(position):
    return Vector((position[0], -position[2], position[1]))


def linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def rgb(value):
    return tuple(linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0))


def setup():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.image_settings.compression = 30
    scene.world = bpy.data.worlds.new('offline-void-hemisphere-approximation')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (*rgb(0x30446A), 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.42
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    scene.view_settings.exposure = 0.5
    if hasattr(scene, 'eevee'):
        scene.eevee.taa_render_samples = 24
    return scene


def light(name, position, target, tint, energy, kind='SUN', size=0.12):
    data = bpy.data.lights.new(name, kind)
    data.color = rgb(tint)
    data.energy = energy
    if kind == 'SUN':
        data.angle = size
    else:
        data.shape = 'DISK'
        data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = game(position)
    obj.rotation_euler = (game(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    return obj


def source_lighting(player_station):
    direction = Vector((-0.22, 0.76, -0.61)).normalized()
    source = (direction.x * 140, direction.y * 140 + 90, player_station + direction.z * 140)
    light('source-void-key-2p8', source, (0, 0, player_station + 24), 0xE6F4FF, 2.8)
    light('source-cyan-rim-1p1', (-direction.x * 120, 70, player_station - direction.z * 120), (0, 0, player_station), 0x4FD8FF, 1.1)


def presentation_lighting(station):
    source_lighting(station)
    light('offline-soft-fill', (-90, 100, station + 70), (65, 0, station), 0xABCEE9, 1.2, 'SUN', 0.3)


def camera(position, target, width=1200, height=760, ortho=None, fov=58):
    data = bpy.data.cameras.new('offline-evidence-camera')
    data.clip_start = 0.35
    data.clip_end = 2400
    data.sensor_fit = 'VERTICAL'
    data.sensor_height = 32
    if ortho:
        data.type = 'ORTHO'
        data.ortho_scale = ortho
    else:
        data.type = 'PERSP'
        data.lens = 16 / math.tan(math.radians(fov / 2))
    obj = bpy.data.objects.new('offline-evidence-camera', data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = game(position)
    obj.rotation_euler = (game(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = obj
    bpy.context.scene.render.resolution_x = width
    bpy.context.scene.render.resolution_y = height
    return obj


def render(name, note, rig=None):
    selected = os.environ.get('CARRIER_RENDER_ONLY', '').split(',')
    if selected != [''] and name not in selected:
        return
    scene = bpy.context.scene
    scene.render.filepath = str(EVIDENCE / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    RECORDS.append({'image': name + '.png', 'note': note, 'rig': rig, 'offline': True, 'engine': 'native Linux Blender 5.2.1 LTS BLENDER_EEVEE', 'limitations': 'AgX instead of game ACES; plain vertex palette instead of source procedural textures; sky/fog/bloom/hemisphere/PMREM not identical; no production GPU claim'})


def open_carrier():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'carrier.blend'))
    return setup()


def import_player(position):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(PROJECT / 'public/models/player.glb'))
    imported = set(bpy.data.objects) - before
    for obj in imported:
        if obj.parent not in imported:
            obj.location += game(position)
    return imported


def make_module_scene(player_station):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup()
    with bpy.data.libraries.load(str(ROOT / 'carrier.blend'), link=False) as (source, target):
        target.materials = [name for name in source.materials if name.startswith('carrier-')]
    materials = {material.name.removeprefix('carrier-'): material for material in bpy.data.materials}
    records = json.loads((WORK / 'modules/modules.json').read_text())
    binary = (WORK / 'modules/modules.bin').read_bytes()
    first = math.floor((6510 + player_station - 90) / 96)
    last = math.floor((6510 + player_station + 560) / 96)
    counts = {'triangles': 0, 'primitives': 0, 'chunkIndices': list(range(first, last + 1))}
    for record in records:
        if not first <= record['index'] <= last:
            continue
        attributes = {}
        for name, info in record['attributes'].items():
            values = array.array('f')
            values.frombytes(binary[info['byteOffset']:info['byteOffset'] + info['count'] * 4])
            attributes[name] = values
        positions = attributes['position']
        vertices = [game((positions[offset], positions[offset + 1], positions[offset + 2] - 6510)) for offset in range(0, len(positions), 3)]
        mesh = bpy.data.meshes.new(f"chunk-{record['index']}-{record['key']}")
        mesh.from_pydata(vertices, [], [(offset, offset + 1, offset + 2) for offset in range(0, len(vertices), 3)])
        mesh.materials.append(materials[record['key']])
        colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for index in range(len(vertices)):
            colors.data[index].color = (*attributes['color'][index * 3:index * 3 + 3], 1)
        obj = bpy.data.objects.new(mesh.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        counts['triangles'] += len(vertices) // 3
        counts['primitives'] += 1
    return counts


def source_rig(mode, station=300, altitude=13):
    counts = make_module_scene(station)
    import_player((0, altitude, station))
    source_lighting(station)
    presets = {'classic': (45, 64, 45.255, 52), 'modern': (20, 29, 14, 58), 'chase': (6, 24, 9.5, 66)}
    yaw, distance, elevation, fov = presets[mode]
    yaw = math.radians(yaw)
    offset = (-distance * math.sin(yaw), elevation, -distance * math.cos(yaw))
    if mode == 'classic':
        position = (offset[0], 9 + offset[1], station + 28 + offset[2])
        target = (0, 9, station + 28)
        ortho = 80
    else:
        position = (offset[0], altitude + elevation, station + offset[2])
        target = (0, altitude + 1.2, station + 16)
        ortho = None
    obj = camera(position, target, 1280, 720, ortho=ortho, fov=fov)
    obj.data.clip_end = 560 * 2.4
    rig = {'mode': mode, 'playerGame': [0, altitude, station], 'playerScale': [1, 1, 1], 'eyeGame': position, 'targetGame': target, 'verticalFov': fov, 'orthographicHalfHeight': 40 if mode == 'classic' else None, 'steadyVelocity': [0, 0, 40], 'boostTraumaFraming': [0, 0, 0], 'quality': 'high drawDistance560', 'fixtureGeometry': counts}
    render('game-' + mode, 'SOURCE CAMERA / HIGH STREAMING SNAPSHOT / OFFLINE LIGHTING APPROXIMATION / shipped player unchanged scale1', rig)


def animate_pose(time):
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.get('bucket') != 'spin':
            continue
        pivot = game(obj['aPivot'])
        axis = game(obj['aSpin'][:3])
        rotation = Matrix.Translation(pivot) @ Matrix.Rotation(obj['aSpin'][3] * time, 4, axis) @ Matrix.Translation(-pivot)
        obj.matrix_world = rotation
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.get('bucket') != 'neon':
            continue
        mode, rate, phase = obj['aAnim']
        cycle = (time * rate + phase) % 1
        if mode == 0:
            gain = 1
        elif mode == 1:
            smooth = lambda lower, upper, value: (lambda level: level * level * (3 - 2 * level))(min(1, max(0, (value - lower) / (upper - lower))))
            gain = 0.08 + 1.45 * smooth(0, 0.03, cycle) * (1 - smooth(0.12, 0.2, cycle))
        elif mode == 2:
            gain = 0.18 + 1.35 * cycle ** 6
        else:
            gain = 0.55 + 0.45 * math.sin(cycle * 6.2832)
        layer = obj.data.color_attributes.get('Color')
        for entry in layer.data:
            original = tuple(entry.color)
            entry.color = (*[value * gain for value in original[:3]], original[3])


def main():
    open_carrier()
    presentation_lighting(490)
    camera((-300, 175, 490), (83, -3, 490), 1600, 600, ortho=410)
    render('overview-port', 'Whole 980-unit carrier, -X corridor-facing hangars; not gameplay framing')
    open_carrier()
    presentation_lighting(490)
    camera((355, 200, 490), (83, -3, 490), 1600, 600, ortho=410)
    render('overview-starboard', 'Whole opposite side, keel exchangers, single island; not gameplay framing')
    open_carrier()
    presentation_lighting(320)
    import_player((25, 7, 284))
    camera((-4, 24, 268), (65, 1, 308), 1280, 820, ortho=105)
    render('hangar-structure', 'Actual 15-unit recesses; open portals, ribs, decks; shipped player at world scale1, no normalization')
    open_carrier()
    presentation_lighting(420)
    import_player((55.4, 18, 376))
    camera((5, 76, 353), (80, 15, 417), 1280, 820, ortho=118)
    render('flightdeck-island', 'Recessed catapult channels, seams, rails, bridge; shipped player scale1 displayed above deck, not a new launch origin')
    open_carrier()
    presentation_lighting(960)
    camera((35, 27, 1047), (83, -5, 974), 1100, 850, ortho=87)
    render('stern-bells', 'Hollow stern bells, tapered afterbody, blue cores 6.5 units behind mouths')
    open_carrier()
    presentation_lighting(40)
    camera((-18, 35, -38), (82, -5, 58), 1100, 850, ortho=112)
    render('bow-taper', 'Bow taper and fitted deck lip, no per-object normalization')
    for mode in ['classic', 'modern', 'chase']:
        source_rig(mode)
    for index, time in enumerate([0, 1.3, 2.6]):
        open_carrier()
        animate_pose(time)
        presentation_lighting(420)
        camera((55, 51, 393), (94, 32, 420), 840, 700, ortho=54)
        render(f'cue-radar-{index}', f'CPU reconstruction of source radar and neon cues at t={time}s; no glTF animation claim', {'timeSeconds': time, 'radarPivotGame': [94, 39, 420], 'axisRate': [0, 1, 0, 0.6], 'phaseNote': 'Local phase shown for authored effects; world module preparation subtracts landmarkStart/period.'})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    setup()
    locations = {'sentinel': (27, 0, 0), 'player': (-16, 0, 0), 'turret': (-17, -1, 17), 'radar': (-7, -1, 17), 'silo': (4, -1, 17), 'fuel': (14, -1, 17)}
    for name, position in locations.items():
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(PROJECT / f'public/models/{name}.glb'))
        imported = set(bpy.data.objects) - before
        for obj in imported:
            if obj.parent not in imported:
                obj.location += game(position)
    presentation_lighting(0)
    camera((-38, 55, -51), (9, 0, 7), 1440, 850, ortho=88)
    render('selected-reference-scale', 'Selected shipped references at shared world scale1: Sentinel worldX27, player worldX-16, turret/radar/silo/fuel worldZ17. Gallery translations only; source files not modified/repackaged.')
    if os.environ.get('CARRIER_RENDER_ONLY') and (EVIDENCE / 'renders.json').exists():
        previous = json.loads((EVIDENCE / 'renders.json').read_text())['images']
        refreshed = {record['image']: record for record in RECORDS}
        RECORDS[:] = [refreshed.get(record['image'], record) for record in previous]
    (EVIDENCE / 'renders.json').write_text(json.dumps({'renderer': 'offline Blender EEVEE; source-rig camera transforms exact at steady no-boost/no-trauma sample', 'scale': 'Every imported asset world scale1; carrier remains x48..108.55, y-26..44.5, z0..987', 'lighting': 'Source void sun color/intensity/direction and cyan rim used; World background approximates hemisphere; presentation shots add soft fill; no game PMREM/nebula/fog/bloom/ACES', 'images': RECORDS}, indent=2))


if __name__ == '__main__':
    main()
