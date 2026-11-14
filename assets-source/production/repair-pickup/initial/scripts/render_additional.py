import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
REPORT = json.loads((WORK / 'evidence' / 'renders.json').read_text())

scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 600, 600
set_camera(camera, (0, 0, 12), (0, 0, 0), span=5.7)
subject = import_root(WORK / 'asset' / 'repair-pickup.glb', 'exact_source_green_diagnostic')
billboard(subject, camera)
for obj in subject.children_recursive:
    if obj.type == 'MESH' and obj.name in ('shell', 'shape'):
        for entry in obj.data.color_attributes.active_color.data:
            entry.color = color('52ffa8')
render('exact-green-front', subject, 'Diagnostic ONLY: shell/shape palette replaced in memory by exact unlit sRGB #52ffa8. Exported palette remains green rim / mint ceramic. No resizing, bloom or glow.')

scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 1000, 600
set_camera(camera, (0, 0, 16), (0, 0, 0), span=7)
subject = import_root(WORK / 'asset' / 'repair-pickup.glb', 'repair_vs_source_mine')
subject.location = game_point((-3.5, 0, 0))
billboard(subject, camera)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1.2, location=game_point((3.5, 0, 0)))
bpy.context.object.data.materials.append(material('source_mine_armor_reference', .4, .5))
for direction in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]:
    location = [3.5 + direction[0] * 1.3, direction[1] * 1.3, direction[2] * 1.3]
    bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=.22, radius2=0, depth=1.1, location=game_point(location))
    spike = bpy.context.object
    spike.rotation_mode = 'QUATERNION'
    spike.rotation_quaternion = Vector(game_point(direction)).to_track_quat('Z', 'Y')
    spike.data.materials.append(material('source_mine_metal_reference', .5, .4))
render('danger-mine-distinction', subject, 'Repair LEFT / static source Mine ico radius1.2 with six5-sided .22x1.1 spikes at1.3 RIGHT, common scale1. Mine materials and lamp omission are approximations. No other-worker model used; not a mine asset delivery.')

scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 1000, 600
set_camera(camera, (0, 0, 16), (0, 0, 0), span=7)
subject = import_root(WORK / 'asset' / 'repair-pickup.glb', 'new_repair_kit_comparison')
subject.location = game_point((-3.5, 0, 0))
billboard(subject, camera)
reference = import_root(REPO / 'asset-work' / 'shield-pickup' / 'initial' / 'asset' / 'shield-pickup.glb', 'read_only_frozen_shield_reference')
reference.location = game_point((3.5, 0, 0))
billboard(reference, camera)
render('frozen-kit-comparison', subject, 'NEW repair LEFT / approved-to-read frozen shield INITIAL RIGHT, common scale1. Shared frame/ceramic/slate visual language; distinct CROSS versus shield emblem; imported only into evidence, not source asset.')
