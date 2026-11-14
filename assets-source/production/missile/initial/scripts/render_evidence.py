import bpy
import json
import math
import os
from pathlib import Path
from mathutils import Matrix, Vector

WORK = Path(__file__).resolve().parents[1]
OUT = WORK / 'evidence/png'
OUT.mkdir(parents=True, exist_ok=True)
CONTRACT = json.loads((WORK / 'evidence/source-contract.json').read_text())
BASELINE = json.loads((WORK / 'source/baseline_projectile.json').read_text())
SOURCE_TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
RECORDS = []
FONT = Path('/mnt/c/Windows/Fonts/arial.ttf')


def point(value):
    return Vector((value[0], -value[2], value[1]))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('Offline-neutral-world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .15, .20, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    scene.view_settings.view_transform = 'AgX'
    return scene


def light(name, position, energy, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = point(position)
    obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()


def neutral():
    light('Common-key', (-12, 22, -12), 2500, 10)
    light('Common-fill', (14, 12, 8), 1800, 12, (.68, .8, 1))


def dusk():
    scene = bpy.context.scene
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.10, .14, .24, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    data = bpy.data.lights.new('Source-dusk-key-approximation', 'SUN')
    data.energy = 3.4
    data.color = (1, .503, .238)
    data.angle = .12
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = point((.5, -.7, .52)).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.lights.new('Source-cyan-rim-approximation', 'SUN')
    data.energy = 1.1
    data.color = (.078, .687, 1)
    obj = bpy.data.objects.new(data.name, data)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler = point((-.7, -.3, .6)).to_track_quat('-Z', 'Y').to_euler()


def camera(eye, target=(0, 0, 0), span=None, fov=58):
    data = bpy.data.cameras.new('Evidence-camera')
    obj = bpy.data.objects.new('Evidence-camera', data)
    bpy.context.collection.objects.link(obj)
    obj.location = point(eye)
    obj.rotation_euler = (point(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    if span is not None:
        data.type = 'ORTHO'
        data.ortho_scale = span * 16 / 9
    else:
        data.type = 'PERSP'
        data.sensor_fit = 'VERTICAL'
        data.sensor_height = 24
        data.lens = 12 / math.tan(math.radians(fov) / 2)
    data.clip_start = .01
    data.clip_end = 1000
    bpy.context.scene.camera = obj
    return obj


def import_model(name):
    before = set(bpy.context.scene.objects)
    filename = WORK / 'assets/missile.glb' if name == 'missile' else WORK / 'references' / (name + '.glb')
    bpy.ops.import_scene.gltf(filepath=str(filename))
    objects = set(bpy.context.scene.objects) - before
    root = bpy.data.objects.new(name + '_evidence_placement', None)
    bpy.context.collection.objects.link(root)
    for obj in objects:
        if obj.parent not in objects:
            obj.parent = root
    return root


def baseline():
    mesh = bpy.data.meshes.new('ACTUAL_SOURCE_204_TRIANGLES')
    indices = BASELINE['indices']
    mesh.from_pydata([point(vertex) for vertex in BASELINE['vertices']], [], [indices[index:index + 3] for index in range(0, len(indices), 3)])
    mesh.update()
    material = bpy.data.materials.new('source_enemyArmor_no_shader_rim')
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (.31854678, .10702310, .06480327, 1)
    node.inputs['Metallic'].default_value = .48
    node.inputs['Roughness'].default_value = .42
    node.inputs['Emission Color'].default_value = (.0112577, .0028227, .001554, 1)
    mesh.materials.append(material)
    obj = bpy.data.objects.new('PROCEDURAL_BASELINE', mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def apply_pose(obj, sample):
    values = sample['matrix']
    matrix = Matrix([[values[column * 4 + row] for column in range(4)] for row in range(4)])
    obj.matrix_world = SOURCE_TO_BLENDER @ matrix @ SOURCE_TO_BLENDER.inverted()


def children(root):
    return [root] + list(root.children_recursive)


def flat_material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*color, 1)
    return material


def deck():
    bpy.ops.mesh.primitive_cube_add(size=1, location=point((0, -.35, 35)))
    obj = bpy.context.object
    obj.name = 'OFFLINE_context_deck'
    obj.scale = (40, 140, .7)
    obj.data.materials.append(flat_material('offline_deck', (.035, .045, .065)))
    for location in [(-16, .006, 30), (16, .006, 30)]:
        bpy.ops.mesh.primitive_cube_add(size=1, location=point(location))
        stripe = bpy.context.object
        stripe.scale = (.12, 140, .018)
        stripe.data.materials.append(flat_material('lane_slate', (.16, .20, .24)))


def overlay(title, subtitle):
    scene = bpy.context.scene
    cam = scene.camera
    distance = .5
    vertical = cam.data.ortho_scale * 9 / 16 if cam.data.type == 'ORTHO' else 2 * distance * math.tan(cam.data.angle_y / 2)
    horizontal = vertical * 16 / 9
    for text, height, size in [(title, .46, .031), (subtitle, .407, .019)]:
        curve = bpy.data.curves.new('Evidence caption only', 'FONT')
        curve.body = text
        if FONT.exists():
            curve.font = bpy.data.fonts.load(str(FONT))
        curve.size = vertical * size
        obj = bpy.data.objects.new('NOT_EXPORTED_caption', curve)
        bpy.context.collection.objects.link(obj)
        obj.parent = cam
        obj.location = (-horizontal * .48, vertical * height, -distance)
        material = bpy.data.materials.new('caption_emission')
        material.use_nodes = True
        material.node_tree.nodes.clear()
        output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
        emission = material.node_tree.nodes.new('ShaderNodeEmission')
        emission.inputs[0].default_value = (.75, .86, 1, 1)
        material.node_tree.links.new(emission.outputs[0], output.inputs[0])
        curve.materials.append(material)
        if hasattr(obj, 'visible_shadow'):
            obj.visible_shadow = False


def render(name, title, subtitle, details):
    overlay(title, subtitle)
    scene = bpy.context.scene
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    cam = scene.camera
    RECORDS.append({'file': 'png/' + name + '.png', 'title': title, 'subtitle': subtitle, 'camera_position_blender': list(cam.location), 'projection': cam.data.type, 'vertical_span': cam.data.ortho_scale * 9 / 16 if cam.data.type == 'ORTHO' else None, 'vertical_fov': math.degrees(cam.data.angle_y), 'resolution': [960, 540], 'subject_world_scale': 1, **details})


def diagnostic_views():
    for name, eye, title in [('quarter', (-2, 1.4, 2.6), 'Fitted body / graphite seeker / four tail fins'), ('side', (4, .4, 0), 'Side silhouette | +Z nose to screen left'), ('nose', (.01, .01, 4), 'Nose-on diagnostic | four-control-fin silhouette'), ('aft', (.01, .01, -4), 'Aft diagnostic | recessed static nozzle; no flame geometry')]:
        reset()
        neutral()
        import_model('missile')
        camera(eye, (0, 0, .05), 2.3)
        render('diagnostic-' + name, title, 'CLOSE-UP DIAGNOSTIC | unit world scale; camera tightened only | offline Blender', {'kind': 'closeup', 'source_axes': '+Z forward / +Y up'})


def neutral_views():
    for name in ['missile', 'baseline', 'lineup']:
        reset()
        neutral()
        camera((-16, 24, -30), (0, 0, 0), 14)
        if name == 'missile':
            import_model('missile')
        elif name == 'baseline':
            baseline()
        else:
            import_model('missile').location = point((-7, 0, 0))
            baseline().location = point((-5, 0, 0))
            import_model('player').location = point((0, 0, 0))
            import_model('silo').location = point((6, 0, 0))
        render('common-neutral-' + name, 'COMMON NEUTRAL | ' + name.upper(), 'Camera (-16,24,-30), target origin, vertical span14 | ALL assets world scale1', {'kind': 'common_neutral', 'lineup': 'new x-7 / baseline x-5 / shipped player x0 / selected silo x6' if name == 'lineup' else name})


def extremes():
    for index, orientation in enumerate(CONTRACT['orientations']):
        reset()
        neutral()
        subject = import_model('missile')
        apply_pose(subject, orientation)
        camera((-2, 1.7, -3), (0, 0, 0), 2.4)
        render(f'orientation-{index}', 'SOURCE _drawMissiles | velocity ' + str(orientation['direction']), 'CLOSE-UP | actual +Z-to-velocity matrix; unit scale; zero case explicitly labeled', {'kind': 'extreme_orientation', 'source_matrix': orientation['matrix'], 'forward': orientation['forward']})


def source_contexts():
    cases = [('silo', 0, 'classic'), ('silo', 0, 'modern'), ('silo', 1, 'chase'), ('sentinel-heavy', 0, 'classic'), ('sentinel-heavy', 1, 'modern'), ('sentinel-heavy', 2, 'chase'), ('sentinel-salvo', 0, 'classic'), ('sentinel-salvo', 2, 'classic')]
    filters = os.environ.get('MISSILE_CONTEXT_FILTER', '').split(',')
    if filters != ['']:
        cases = [entry for entry in cases if entry[0] in filters]
    for label, sample_index, mode in cases:
        context = next(entry for entry in CONTRACT['contexts'] if entry['label'] == label)
        sample = context['samples'][sample_index]
        for variant in ['new', 'baseline']:
            reset()
            dusk()
            deck()
            subject = import_model('missile') if variant == 'new' else baseline()
            apply_pose(subject, sample)
            player = import_model('player')
            player.location = point(sample['player_position'])
            if label == 'silo':
                silo = import_model('silo')
                silo.location = point(CONTRACT['silo_state']['position'])
                for obj in children(silo):
                    if obj.name.split('.')[0] == 'hatch':
                        obj.location = point(CONTRACT['silo_state']['hatch_position'])
                        scale = CONTRACT['silo_state']['hatch_scale'][0]
                        obj.scale = (scale, scale, scale)
                    if obj.name.split('.')[0] == 'glow':
                        scale = CONTRACT['silo_state']['glow_scale'][0]
                        obj.scale = (scale, scale, scale)
            else:
                boss = import_model('sentinel')
                boss.location = point(CONTRACT['sentinel_reference']['root'])
            rig = next(entry for entry in sample['cameras'] if entry['mode'] == mode)
            camera(rig['eye'], rig['target'], rig['vertical_span'] if rig['orthographic'] else None, rig['fov'])
            prefix = f'context-{label}-{sample_index}-{mode}-{variant}'
            render(prefix, f'{label.upper()} | t={sample["time"]:.2f}s | {mode.upper()} | {variant.upper()}', 'SOURCE CAMERA + CPU POSE | tiny missile is intentional | offline, no WebGL/FX/collision simulation', {'kind': 'source_camera', 'source_sample': sample, 'variant': variant, 'boss_pose': 'shipped rest hierarchy only' if label != 'silo' else None, 'trail': 'not rendered; original source burst behavior independently captured'})
    for label in ['silo', 'sentinel-heavy', 'sentinel-salvo']:
        if filters != [''] and label not in filters:
            continue
        reset()
        neutral()
        context = next(entry for entry in CONTRACT['contexts'] if entry['label'] == label)
        for index, sample in enumerate(context['samples'][:4]):
            subject = import_model('missile')
            pose = dict(sample)
            pose['matrix'] = list(sample['matrix'])
            pose['matrix'][12:15] = [-3.3 + index * 2.2, 0, 0]
            apply_pose(subject, pose)
        camera((-5, 5, -9), (0, 0, 0), 4.3)
        render('homing-attitudes-' + label, label.upper() + ' | actual homing attitudes at 0 / .2 / .5 / 1.0s', 'DIAGNOSTIC STRIP | actual source rotations; translations reset for comparison; static snapshots, NO animation', {'kind': 'homing_attitudes', 'samples': context['samples'][:4], 'translation_override': 'x=-3.3,-1.1,1.1,3.3; y=z=0 ONLY for diagnostic arrangement'})


def launcher_closeups():
    for label in ['silo', 'sentinel-heavy']:
        reset()
        dusk()
        context = next(entry for entry in CONTRACT['contexts'] if entry['label'] == label)
        sample = context['samples'][0]
        subject = import_model('missile')
        apply_pose(subject, sample)
        if label == 'silo':
            reference = import_model('silo')
            reference.location = point(CONTRACT['silo_state']['position'])
            for obj in children(reference):
                if obj.name.split('.')[0] == 'hatch':
                    obj.location = point(CONTRACT['silo_state']['hatch_position'])
                    scale = CONTRACT['silo_state']['hatch_scale'][0]
                    obj.scale = (scale, scale, scale)
                if obj.name.split('.')[0] == 'glow':
                    scale = CONTRACT['silo_state']['glow_scale'][0]
                    obj.scale = (scale, scale, scale)
        else:
            reference = import_model('sentinel')
            reference.location = point(CONTRACT['sentinel_reference']['root'])
        center = sample['position']
        camera([center[0] - 5, center[1] + 4, center[2] - 7], center, 5.5)
        render('launcher-detail-' + label, label.upper() + ' | SOURCE LAUNCH ROOT / EXIT ATTITUDE', 'CLOSE-UP DIAGNOSTIC | world scale1; source pose unchanged; rest Sentinel / sampled Silo hatch', {'kind': 'launcher_detail', 'source_sample': sample, 'camera_not_gameplay': True})


group = os.environ.get('MISSILE_RENDER_GROUP', 'all')
if group in ('all', 'diagnostics'):
    diagnostic_views()
if os.environ.get('MISSILE_DIAGNOSTIC_ONLY') != '1' and group == 'all':
    neutral_views()
    extremes()
if os.environ.get('MISSILE_DIAGNOSTIC_ONLY') != '1' and group in ('all', 'contexts'):
    source_contexts()
    launcher_closeups()
record_path = WORK / 'evidence/render-records.json'
if group != 'all' and record_path.exists():
    previous = json.loads(record_path.read_text())
    replaced = {entry['file'] for entry in RECORDS}
    RECORDS = [entry for entry in previous['records'] if entry['file'] not in replaced] + RECORDS
record_path.write_text(json.dumps({'engine': 'Blender Cycles CPU, 24 samples, AgX', 'proof_type': 'OFFLINE reconstruction, NOT live WebGL', 'common_camera': {'eye': [-16, 24, -30], 'target': [0, 0, 0], 'vertical_span': 14, 'key': [-12, 22, -12], 'fill': [14, 12, 8]}, 'records': RECORDS}, indent=2))
print('RENDERED', len(RECORDS), 'actual PNGs')
