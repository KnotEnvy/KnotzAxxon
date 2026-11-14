import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
REPORT = json.loads((WORK / 'evidence' / 'renders.json').read_text())
scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 600, 600
set_camera(camera, (0, 0, 12), (0, 0, 0), span=5.7)
subject = import_root(WORK / 'asset' / 'spread-pickup.glb', 'exact_amber_subject')
billboard(subject, camera)
for obj in subject.children_recursive:
    if obj.type == 'MESH' and obj.name.split('.')[0] in ('shell', 'shape'):
        multiply = next(node for node in obj.data.materials[0].node_tree.nodes if node.type == 'MIX_RGB')
        multiply.inputs[2].default_value = color('ffb43a')
render('view-exact-amber', subject, 'NOMINAL GLB #ffb43a identity, gains=1 for exact sRGB diagnostic ONLY; runtime recipe retains source neon gains1.15/1.35. White neutral COLOR_0 faces render exact amber.')
for obj in subject.children_recursive:
    if obj.type == 'MESH' and obj.name.split('.')[0] in ('shell', 'shape'):
        strength = 1.15 if obj.name.split('.')[0] == 'shell' else 1.35
        multiply = next(node for node in obj.data.materials[0].node_tree.nodes if node.type == 'MIX_RGB')
        multiply.inputs[2].default_value = tuple(channel * strength for channel in color('ffb43a')[:3]) + (1,)
for name, angle, scale, wobble in [('spin-0', 0, .975, -.08), ('spin-90', math.pi / 2, 1.025, .08),
                                    ('spin-180', math.pi, .975, .08), ('spin-270', math.pi * 1.5, 1.025, -.08)]:
    set_pose(subject, angle=angle, scale=scale, wobble=wobble)
    render(name, subject, 'Independent spin/pulse/wobble endpoint diagnostic; motion ranges unchanged. Numeric exhaustive-angle clearance bound and finite samples are separately recorded.',
           {'shell_radians': angle, 'shell_scale': scale, 'shape_radians': wobble})
scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 1000, 520
set_camera(camera, (0, 0, 14), (0, 0, 0), span=7)
subject = import_root(WORK / 'asset' / 'spread-pickup.glb', 'new_spread')
reference = import_root(REPO / 'asset-work' / 'shield-pickup' / 'initial' / 'asset' / 'shield-pickup.glb', 'read_only_delivered_shield_reference')
subject.location = game_point((-3, 0, 0))
reference.location = game_point((3, 0, 0))
billboard(subject, camera)
billboard(reference, camera)
render('kit-reference-comparison', subject, 'LEFT newly generated spread / RIGHT read-only delivered shield INITIAL. Shared world scale1 and same camera/light. Deliberate common rim/backplate palette language; no reference geometry merged/exported.')
REPORT = [entry for entry in REPORT if entry['file'] != 'offline-drift-d30.png']
scene, camera = reset_scene()
subject = import_root(WORK / 'asset' / 'spread-pickup.glb', 'source_drift_subject')
reference = import_root(REPO / 'public' / 'models' / 'player.glb', 'shipped_player_style_reference')
reference.location = game_point((0, 6, 0))
gameplay_lights()
deck()
scene.render.resolution_x, scene.render.resolution_y = 960, 540
rig = next(entry for entry in SOURCE['rigs'] if entry['mode'] == 'modern')
set_camera(camera, rig['eye'], rig['target'], fov=rig['settings']['fov'])
drift = next(entry for entry in SOURCE['samples'] if entry['phase'] == 3)
subject.location = game_point(drift['position'])
set_pose(subject, phase=3)
billboard(subject, camera)
halo(subject, camera, 3)
render('offline-drift-d30', subject, 'Actual source phase3 drift position and named-mesh motion, outside magnet range; baseY6, y=6+sin(4.8)*.7. Source halo proxy retained; offline reconstruction, not live rasterization.', {'source_sample': drift})
