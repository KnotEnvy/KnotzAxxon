import bpy
import json
import math
import pathlib
import sys
from mathutils import Quaternion, Vector
from bpy_extras.object_utils import world_to_camera_view

WORK = pathlib.Path(__file__).resolve().parents[1]
REPO = WORK.parents[2]
sys.path.insert(0, str(WORK / 'scripts'))
from build_shield import Builder, color, game_point, material, polar

OUT = WORK / 'evidence' / 'png'
OUT.mkdir(exist_ok=True)
REPORT = []
if '--gameplay-only' in sys.argv:
    REPORT = [entry for entry in json.loads((WORK / 'evidence' / 'renders.json').read_text()) if not entry['file'].startswith('offline-')]
SOURCE = json.loads((WORK / 'evidence' / 'source-contract.json').read_text())


def descendants(root):
    return [root] + list(root.children_recursive)


def show(root, visible):
    for obj in descendants(root):
        obj.hide_render = not visible


def import_root(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = set(bpy.data.objects) - before
    container = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(container)
    for obj in objects:
        if obj.parent not in objects:
            obj.parent = container
    return container


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = 800
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    if hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 24
    scene.world = bpy.data.worlds.new('evidence_world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.015, .025, .045, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
    camera_data = bpy.data.cameras.new('offline_camera')
    camera_data.sensor_fit = 'VERTICAL'
    camera_data.sensor_height = 32
    camera_data.clip_start = .35
    camera_data.clip_end = 1000
    camera = bpy.data.objects.new('offline_camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def aim(obj, target):
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = (Vector(game_point(target)) - obj.location).to_track_quat('-Z', 'Y')


def set_camera(camera, eye, target, span=14, fov=None):
    camera.location = game_point(eye)
    aim(camera, target)
    if fov is None:
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = span
    else:
        camera.data.type = 'PERSP'
        camera.data.lens = 16 / math.tan(math.radians(fov) / 2)
    bpy.context.view_layer.update()


def billboard(root, camera):
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = camera.rotation_quaternion @ Quaternion((1, 0, 0), -math.pi / 2)


def add_light(name, eye, target, energy, tint='ffffff', area=True, size=9):
    data = bpy.data.lights.new(name, 'AREA' if area else 'SUN')
    data.energy = energy
    data.color = color(tint)[:3]
    if area:
        data.shape = 'DISK'
        data.size = size
    else:
        data.angle = math.radians(8)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = game_point(eye)
    aim(obj, target)
    return obj


def neutral_lights():
    add_light('common_key', (-12, 22, -12), (0, 0, 0), 2400)
    add_light('common_fill', (14, 12, 8), (0, 0, 0), 1800, 'c9dffc')


def gameplay_lights():
    direction = Vector((-.5, .7, -.52)).normalized()
    eye = (direction.x * 140, direction.y * 140 + 90, direction.z * 140)
    add_light('source_dusk_key', eye, (0, 0, 24), 3.4, 'ffbc86', area=False)
    add_light('source_dusk_rim', (-direction.x * 120, 70, -direction.z * 120), (0, 0, 0), 1.1, '4fd8ff', area=False)
    bpy.context.scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = color('5a6f95')
    bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .32


def source_neon(name, intensity, tint='45e0ff'):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    nodes = result.node_tree.nodes
    nodes.clear()
    rgb = nodes.new('ShaderNodeRGB')
    rgb.outputs[0].default_value = tuple(value * intensity for value in color(tint)[:3]) + (1,)
    output = nodes.new('ShaderNodeOutputMaterial')
    result.node_tree.links.new(rgb.outputs[0], output.inputs[0])
    return result


def baseline():
    root = bpy.data.objects.new('source_baseline_456_triangles', None)
    bpy.context.collection.objects.link(root)
    shell_builder = Builder()
    shell_builder.annulus(32, [(1.98 + .065 * math.cos(index * math.tau / 6), .065 * math.sin(index * math.tau / 6)) for index in range(6)], ['45e0ff'])
    shell_builder.object('baseline_shell', source_neon('baseline_shell_source_1.15', 1.15), root)
    shape_builder = Builder()
    shape_builder.annulus(6, [(1.55 + .26 * math.cos(index * math.tau / 4), .26 * math.sin(index * math.tau / 4)) for index in range(4)], ['45e0ff'])
    shape_builder.object('baseline_shape', source_neon('baseline_shape_source_1.35', 1.35), root, (0, 0, .1))
    core_builder = Builder()
    for depth in [-.08, .08]:
        core_builder.vertices.extend((1.64 * math.sin(index * math.tau / 6), -1.64 * math.cos(index * math.tau / 6), depth) for index in range(6))
    core_builder.vertices.extend([(0, 0, -.08), (0, 0, .08)])
    for index in range(6):
        following = (index + 1) % 6
        core_builder.face([index, following, following + 6, index + 6], '526579')
        core_builder.face([12, following, index], '526579')
        core_builder.face([13, index + 6, following + 6], '526579')
    core_builder.object('baseline_core', material('baseline_core_metal', .56, .38), root, (0, 0, -.30))
    return root


def set_pose(root, phase=0, angle=None, scale=None, wobble=None):
    for obj in root.children_recursive:
        if obj.name in ('shell', 'baseline_shell'):
            obj.rotation_euler.y = -(.3 * phase if angle is None else angle)
            obj.scale = (1 + math.sin(phase * 4) * .025 if scale is None else scale,) * 3
        elif obj.name in ('shape', 'baseline_shape'):
            obj.rotation_euler.y = -(math.sin(phase * 2.2) * .08 if wobble is None else wobble)


def screen_bounds(root, camera):
    bpy.context.view_layer.update()
    points = []
    for obj in root.children_recursive:
        if obj.type == 'MESH' and not obj.hide_render:
            points.extend(world_to_camera_view(bpy.context.scene, camera, obj.matrix_world @ vertex.co) for vertex in obj.data.vertices)
    width = bpy.context.scene.render.resolution_x
    height = bpy.context.scene.render.resolution_y
    return [min(point.x for point in points) * width, (1 - max(point.y for point in points)) * height,
            max(point.x for point in points) * width, (1 - min(point.y for point in points)) * height]


def render(name, root=None, note='', extra=None):
    scene = bpy.context.scene
    scene.render.filepath = str(OUT / (name + '.png'))
    entry = {'file': name + '.png', 'note': note, 'resolution': [scene.render.resolution_x, scene.render.resolution_y],
             'camera_blender_location': list(scene.camera.location), 'camera_projection': scene.camera.data.type,
             'orthographic_vertical_span': scene.camera.data.ortho_scale if scene.camera.data.type == 'ORTHO' else None,
             'asset_scale': [1, 1, 1]}
    if root:
        entry['badge_pixel_bounds'] = screen_bounds(root, scene.camera)
        normal = root.rotation_quaternion @ Vector((0, -1, 0))
        facing = scene.camera.rotation_quaternion @ Vector((0, 0, 1))
        entry['camera_facing_normal_dot'] = normal.dot(facing)
    if extra:
        entry.update(extra)
    REPORT.append(entry)
    bpy.ops.render.render(write_still=True)
    import gpu
    runtime = {'blender_version': bpy.app.version_string, 'build_hash': bpy.app.build_hash.decode(),
               'engine': scene.render.engine, 'render_threads': scene.render.threads,
               'eevee_taa_render_samples': getattr(scene.eevee, 'taa_render_samples', None),
               'view_transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
               'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma,
               'png_bits': scene.render.image_settings.color_depth,
               'gpu_vendor': gpu.platform.vendor_get(), 'gpu_renderer': gpu.platform.renderer_get(),
               'gpu_version': gpu.platform.version_get(),
               'runtime_wrapper': 'Native existing Linux Blender/sysroot; LIBGL_ALWAYS_SOFTWARE=1; LP_NUM_THREADS=4; no installation'}
    (WORK / 'evidence' / 'runtime-settings.json').write_text(json.dumps(runtime, indent=2) + '\n')
    (WORK / 'evidence' / 'renders.json').write_text(json.dumps(REPORT, indent=2) + '\n')


def halo(root, camera, phase=0):
    image = bpy.data.images.new('offline_source_halo_128', width=128, height=128, alpha=True)
    pixels = []
    for row in range(128):
        for column in range(128):
            radius = math.hypot((column - 64) / 64, (row - 64) / 64)
            alpha = round(max(0, min(1, 1 - radius)) ** 2.2 * 255) / 255
            pixels.extend([1, 1, 1, alpha])
    image.pixels = pixels
    result = bpy.data.materials.new('OFFLINE_ONLY_shared_halo_proxy')
    result.use_nodes = True
    nodes = result.node_tree.nodes
    nodes.clear()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Color'].default_value = color('45e0ff')
    emission.inputs['Strength'].default_value = .35
    multiply = nodes.new('ShaderNodeMixShader')
    result.node_tree.links.new(texture.outputs['Alpha'], multiply.inputs[0])
    result.node_tree.links.new(transparent.outputs[0], multiply.inputs[1])
    result.node_tree.links.new(emission.outputs[0], multiply.inputs[2])
    output = nodes.new('ShaderNodeOutputMaterial')
    result.node_tree.links.new(multiply.outputs[0], output.inputs[0])
    result.surface_render_method = 'DITHERED'
    bpy.ops.mesh.primitive_plane_add(size=1)
    obj = bpy.context.object
    obj.name = 'OFFLINE_ONLY_shared_halo_proxy'
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = camera.rotation_quaternion
    obj.location = root.location
    obj.scale = (7 * (1 + math.sin(phase * 4) * .2),) * 3
    obj.data.materials.append(result)
    return obj


def deck():
    builder = Builder()
    builder.vertices = [(-27, -.3, -25), (27, -.3, -25), (27, -.3, 110), (-27, -.3, 110)]
    builder.face([3, 2, 1, 0], '202e41')
    anchor = bpy.data.objects.new('OFFLINE_schematic_deck', None)
    bpy.context.collection.objects.link(anchor)
    builder.object('OFFLINE_schematic_deck_surface', material('OFFLINE_schematic_deck_material', .08, .8), anchor)


if '--gameplay-only' not in sys.argv:
    scene, camera = reset_scene()
    subject = import_root(WORK / 'asset' / 'shield-pickup.glb', 'evidence_subject')
    neutral_lights()
    set_camera(camera, (-16, 24, -30), (0, 0, 0), span=14)
    billboard(subject, camera)
    render('common-neutral-rest', subject, 'Required common neutral camera, span 14 GAME units vertically; key(-12,22,-12), fill(14,12,8); no halo proxy.')
    scene.render.resolution_x, scene.render.resolution_y = 600, 600
    for name, eye in [('front', (0, 0, 12)), ('rear', (0, 0, -12)), ('edge', (12, 0, 0)), ('quarter', (8, 6, 10))]:
        subject.rotation_quaternion = Quaternion()
        set_camera(camera, eye, (0, 0, 0), span=5.7)
        render('view-' + name, subject, 'Static diagnostic view; billboard deliberately disabled ONLY for geometry inspection, not gameplay.')
    set_camera(camera, (0, 0, 12), (0, 0, 0), span=5.7)
    billboard(subject, camera)
    for name, phase in [('pulse-max', math.pi / 8), ('pulse-min', math.pi * 3 / 8), ('wobble-max', math.pi / 4.4), ('wobble-min', math.pi * 3 / 4.4), ('spin-10sec', 10)]:
        set_pose(subject, phase=phase)
        render('action-' + name, subject, 'Actual source-coupled phase/spin/pulse/wobble. No charge or detach mechanics exist.', {'phase': phase})
    set_pose(subject, angle=math.radians(45), scale=.975, wobble=.08)
    render('combined-extremes', subject, 'Independent endpoint clearance diagnostic; not claimed to be a coupled source phase.')
    set_pose(subject)
    scene.render.resolution_x, scene.render.resolution_y = 1100, 660
    reference = import_root(REPO / 'public' / 'models' / 'player.glb', 'shipped_player_style_reference')
    source = baseline()
    subject.location = game_point((-5.4, 0, 0))
    source.location = game_point((0, 0, 0))
    reference.location = game_point((6, 0, 0))
    set_camera(camera, (-16, 24, -30), (0, 0, 0), span=14)
    billboard(subject, camera)
    billboard(source, camera)
    render('world-scale-comparison', subject, 'Left shipped player.glb / middle actual-source baseline / right NEW. Shared WORLD scale 1, no separate normalization; required neutral camera/light geometry.')

scene, camera = reset_scene()
subject = import_root(WORK / 'asset' / 'shield-pickup.glb', 'gameplay_subject')
reference = import_root(REPO / 'public' / 'models' / 'player.glb', 'shipped_player_style_reference')
source = baseline()
reference.location = game_point((0, 6, 0))
gameplay_lights()
deck()
scene.render.resolution_x, scene.render.resolution_y = 960, 540
for rig in SOURCE['rigs']:
    for context, forward in [('near', 12), ('far', 50)]:
        subject.location = game_point((5, 6, forward))
        source.location = game_point((-5, 6, forward))
        set_pose(subject, phase=.3926990817)
        set_pose(source, phase=.3926990817)
        set_camera(camera, rig['eye'], rig['target'], span=2 * rig['halfHeight'], fov=None if rig['mode'] == 'classic' else rig['settings']['fov'])
        billboard(subject, camera)
        billboard(source, camera)
        glow = halo(subject, camera, .3926990817)
        baseline_glow = halo(source, camera, .3926990817)
        render('offline-' + rig['mode'] + '-' + context, subject,
               'OFFLINE reconstruction, NOT live gameplay proof. Actual zero-boost rig eye/target/projection and dusk key/rim directions/intensities; NEW left, baseline right, shipped player world scale 1. Both badges share the same phase/pulse and equivalent halo proxy. Schematic deck; world approximates hemisphere, proxy halo alpha rather than Three additive postfx.',
               {'rig': rig['mode'], 'world_badge_position': [5, 6, forward], 'source_rig': rig})
        bpy.data.objects.remove(glow, do_unlink=True)
        bpy.data.objects.remove(baseline_glow, do_unlink=True)
rig = next(entry for entry in SOURCE['rigs'] if entry['mode'] == 'modern')
set_camera(camera, rig['eye'], rig['target'], fov=rig['settings']['fov'])
show(source, False)
for name, forward in [('magnet-d11', 11), ('precollection-d3-8', 3.8), ('collection-threshold-d3-7', 3.7)]:
    subject.location = game_point((0, 6, forward))
    billboard(subject, camera)
    render('offline-' + name, subject, 'OFFLINE source context snapshot; player radius 1.5 + pickup radius 2.2 => collection at distance <=3.7. No fabricated magnet beam, bubble or charge.', {'center_distance': forward})
show(subject, False)
render('offline-collected-next-update', None, 'OFFLINE lifecycle snapshot: after source collection, pickup.alive=false; next Game.update detaches mesh and halo. Existing source collection VFX/HUD/score/audio are NOT simulated by this still.')
if '--gameplay-only' in sys.argv:
    print('SHIELD_GAMEPLAY_RENDERED', len(REPORT), 'total PNG records')
    raise SystemExit

scene, camera = reset_scene()
gameplay_lights()
set_camera(camera, (-16, 24, -30), (0, 0, 0), span=42)
for row in range(6):
    for column in range(6):
        instance = import_root(WORK / 'asset' / 'shield-pickup.glb', 'batch_%02d' % (row * 6 + column))
        instance.location = game_point(((column - 2.5) * 5.5, (row - 2.5) * 5.5, 0))
        billboard(instance, camera)
        set_pose(instance, phase=(row * 6 + column) * .31)
render('dense-batch-36', None, 'OFFLINE 36 independent imports at true world scale, same geometry. Render density diagnostic ONLY, not GPU memory/lifetime proof, not a claimed live maximum; no halo in this density frame.')
print('SHIELD_RENDERED', len(REPORT), 'PNGs')
