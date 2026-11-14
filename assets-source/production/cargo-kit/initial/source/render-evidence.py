import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
FRAMES = ROOT / 'evidence/frames'
FRAMES.mkdir(parents=True, exist_ok=True)
payload = json.loads((ROOT / 'evidence/render-payload.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.eevee.taa_render_samples = 24
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'Medium High Contrast'
scene.render.resolution_percentage = 100
world = bpy.data.worlds.new('OfflineSourceDuskApproximation')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.10, 0.15, 0.23, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.65
scene.world = world


def space(point):
    return Vector((point[0], -point[2], point[1]))


def face_camera(obj, target):
    obj.rotation_euler = (space(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def material(name, color, metallic=0.36, roughness=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    return mat


hull = material('OfflineExistingHullResponseApprox_NoMaps', (1, 1, 1))
attribute = hull.node_tree.nodes.new('ShaderNodeAttribute')
attribute.attribute_name = 'BatchTint'
hull.node_tree.links.new(attribute.outputs['Color'], hull.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
deck_mat = material('DECK_TEST_DOUBLE', (0.09, 0.12, 0.16), 0.22, 0.82)
mark_mat = material('LANE_MARK_TEST_DOUBLE', (0.39, 0.44, 0.40), 0.1, 1)


def light(name, position, energy, color, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.color, data.shape, data.size = energy, color, 'DISK', size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = space(position)
    face_camera(obj, (0, 0, 0))
    return obj


sun_data = bpy.data.lights.new('SOURCE_DUSK_KEY_APPROX', 'SUN')
sun_data.energy = 2.4
sun_data.color = (1, 0.77, 0.56)
sun_data.angle = math.radians(12)
sun = bpy.data.objects.new('SOURCE_DUSK_KEY_APPROX', sun_data)
scene.collection.objects.link(sun)
sun.location = space((-50, 70, -52))
face_camera(sun, (0, 0, 0))
light('SOURCE_COOL_RIM_APPROX', (20, 30, 24), 1600, (0.36, 0.68, 1), 15)
light('NEUTRAL_READABILITY_FILL_APPROX', (-10, 15, -10), 900, (0.65, 0.76, 1), 14)
camera_data = bpy.data.cameras.new('EvidenceCamera')
camera = bpy.data.objects.new('EvidenceCamera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.clip_start, camera.data.clip_end = 0.05, 1500
camera.data.sensor_fit = 'HORIZONTAL'
temporary = []
rendered = []


def clear():
    for obj in temporary:
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(data, bpy.types.Mesh) and data.users == 0:
            bpy.data.meshes.remove(data)
    temporary.clear()


def mesh_from_batch(buffers, name, begin=0, count=None):
    end = len(buffers['pos']) // 3 if count is None else begin + count
    points = [space(buffers['pos'][index * 3:index * 3 + 3]) for index in range(begin, end)]
    faces = [(index, index + 1, index + 2) for index in range(0, len(points), 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(hull)
    mesh.update()
    color = mesh.color_attributes.new(name='BatchTint', type='FLOAT_COLOR', domain='POINT')
    for index in range(len(points)):
        color.data[index].color = (*buffers['col'][(begin + index) * 3:(begin + index) * 3 + 3], 1)
    normals = [space(buffers['nrm'][index * 3:index * 3 + 3]).normalized() for index in range(begin, end)]
    mesh.normals_split_custom_set_from_vertices(normals)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    temporary.append(obj)
    return obj


def block(name, center, scale, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=space(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0], scale[2], scale[1])
    obj.data.materials.append(mat)
    temporary.append(obj)
    return obj


def focus(obj):
    points = [obj.matrix_world @ Vector(point) for point in obj.bound_box]
    center = sum(points, Vector()) / len(points)
    return (center.x, center.z, -center.y)


def render(name, eye, target, width=960, height=720, orthographic=None, fov=48):
    if '--only' in sys.argv and name != sys.argv[sys.argv.index('--only') + 1]:
        return
    camera.location = space(eye)
    face_camera(camera, target)
    camera.data.type = 'ORTHO' if orthographic else 'PERSP'
    if orthographic:
        camera.data.ortho_scale = orthographic
    else:
        camera.data.angle = math.radians(fov)
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.filepath = str(FRAMES / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    rendered.append(dict(file='frames/' + name + '.png', eye=eye, look=target, pixels=[width, height], orthographic_width=orthographic, horizontal_fov=None if orthographic else fov))


sample = payload['samples']['3.2-42']
for name, offset in [('front-quarter', (-7, 5.4, -8)), ('rear-quarter', (7, 4.8, 8)), ('top', (-0.01, 12, 0)), ('underside', (6, -4.5, -7))]:
    clear()
    obj = mesh_from_batch(sample['kit'], 'ACTUAL_BATCH_KIT_3_HIGH')
    center = focus(obj)
    render(name, tuple(center[axis] + offset[axis] for axis in range(3)), center, orthographic=7.8)
clear()
obj = mesh_from_batch(payload['samples']['1.9-1']['kit'], 'ACTUAL_FIRST_CRATE_HARDWARE', count=156 * 3)
center = focus(obj)
render('crate-hardware', (center[0] - 3.2, center[1] + 2.1, center[2] - 3.6), center, orthographic=3.6)
clear()
obj = mesh_from_batch(sample['kit'], 'ACTUAL_FIRST_DRUM_HARDWARE', begin=3 * 156 * 3, count=180 * 3)
center = focus(obj)
render('drum-hardware', (center[0] - 2.2, center[1] + 2.5, center[2] - 2.8), center, orthographic=2.3)
for max_height in [1.9, 3.2]:
    for seed in [1, 7, 42, 123]:
        sample = payload['samples'][f'{max_height}-{seed}']
        for version in ['source', 'kit']:
            clear()
            obj = mesh_from_batch(sample[version], 'ACTUAL_BATCH_' + version.upper())
            center = focus(obj)
            block('GROUND_TEST_DOUBLE', (center[0], -0.075, center[2]), (12, 0.12, 12), deck_mat)
            render(f'stack-{max_height}-{seed}-{version}', (center[0] - 7, 6.5, center[2] - 8), (center[0], 1.25, center[2]), width=640, height=500, orthographic=8.4)
for rig in payload['cameras']:
    for version in ['source', 'kit']:
        clear()
        block('DECK_TEST_DOUBLE', (0, -0.10, 34), (54, 0.18, 144), deck_mat)
        for side in [-1, 1]:
            block('CORRIDOR_EDGE_TEST_DOUBLE', (side * 16, 0.003, 34), (0.12, 0.01, 144), mark_mat)
        for seed, depth in [(1, 18), (42, 42), (123, 68)]:
            for max_height in [1.9, 3.2]:
                obj = mesh_from_batch(payload['samples'][f'{max_height}-{seed}'][version], f'ACTUAL_POSE_{max_height}_{seed}_{version}')
                obj.location.y -= depth - 32
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(REPO / 'public/models/player.glb'))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        for obj in imported:
            if obj.parent not in imported:
                obj.location += space(rig['player'])
            temporary.append(obj)
        aspect = 16 / 9
        ortho = rig['halfHeight'] * 2 * aspect if rig['classic'] else None
        horizontal = math.degrees(2 * math.atan(math.tan(math.radians(rig['fov']) / 2) * aspect))
        render(f'world-{rig["mode"]}-{version}', rig['eye'], rig['look'], width=1280, height=720, orthographic=ortho, fov=horizontal)
clear()
report = dict(engine='BLENDER_EEVEE', blender=bpy.app.version_string, build_hash=bpy.app.build_hash.decode(), threads=4, samples=24, software_mesa_forced=True, source='actual source Batch positions/normals/linear tint/AO; actual source CameraRig snap / aspect 16:9; shipped public/models/player.glb imported unscaled', approximation='Offline EEVEE source-dusk-inspired SUN/fill/rim and no mapped hull textures/normal/roughness maps. Deck and lane marks are test doubles; no gameplay/collider claims. Player is shipped GLB, not a proxy. Not live WebGL/GPU/FPS or final acceptance.', world_scale='one game unit = one Blender meter; no per-rig object scaling, only camera changes. Repeated source pile fixtures at Z18/42/68 are intentional layout test doubles, not a claimed live generated chunk.', inspection='Inspection views focus actual source pile bounds; underside omits deck intentionally.', files=rendered)
report_file = ROOT / 'evidence/render-provenance.json'
if '--only' in sys.argv and report_file.exists():
    previous = json.loads(report_file.read_text())
    replacements = {entry['file']: entry for entry in rendered}
    report['files'] = [replacements.get(entry['file'], entry) for entry in previous['files']]
report_file.write_text(json.dumps(report, indent=2) + '\n')
