import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
names = ['offline-magnet-d11.png', 'offline-precollection-d3-8.png', 'offline-collection-threshold-d3-7.png',
         'offline-collected-next-update.png', 'offline-drift-outside-magnet.png']
REPORT = [entry for entry in json.loads((WORK / 'evidence' / 'renders.json').read_text()) if entry['file'] not in names]
scene, camera = reset_scene()
subject = import_root(WORK / 'asset' / 'repair-pickup.glb', 'source_context_subject')
reference = import_root(REPO / 'public/models/player.glb', 'shipped_player_style_reference')
reference.location = game_point((0, 6, 0))
gameplay_lights()
deck()
scene.render.resolution_x, scene.render.resolution_y = 960, 540
rig = next(entry for entry in SOURCE['rigs'] if entry['mode'] == 'modern')
set_camera(camera, rig['eye'], rig['target'], fov=rig['settings']['fov'])
for name, forward, phase in [('magnet-d11', 11, math.pi / 8), ('precollection-d3-8', 3.8, math.pi / 8),
                             ('collection-threshold-d3-7', 3.7, math.pi / 8), ('drift-outside-magnet', 30, 1)]:
    height = 6 + math.sin(phase * 1.6) * .7 if forward == 30 else 6
    subject.location = game_point((0, height, forward))
    set_pose(subject, phase=phase)
    billboard(subject, camera)
    glow = halo(subject, camera, phase)
    render('offline-' + name, subject, 'OFFLINE actual-source context, original shell/shape/halo phase equations and camera-facing root; halo is an approximate alpha proxy, not live additive postfx. D>22 bobs .7 about baseY6; d11 magnet strength15; collection at d<=3.7. No beam/bubble or fabricated collection VFX.',
           {'center_distance': math.hypot(forward, height - 6), 'phase': phase, 'baseY': 6, 'world_position_game': [0, height, forward],
            'halo_width': 7 * (1 + math.sin(phase * 4) * .2), 'halo_opacity_source': .35})
    bpy.data.objects.remove(glow, do_unlink=True)
show(subject, False)
render('offline-collected-next-update', None, 'OFFLINE source lifecycle: alive=false at collection, next pickup loop detaches badge AND shared halo sprite. Original sparks/ring/light/HUD/audio/postfx dispatch/timing are tested numerically, not rendered here.')
