import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
REPORT = json.loads((WORK / 'evidence' / 'renders.json').read_text())
REPORT = [entry for entry in REPORT if entry['file'] != 'kind-silhouette-cues.png']
scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 1400, 420
set_camera(camera, (0, 0, 24), (0, 0, 0), span=7.2)
subject = import_root(WORK / 'asset' / 'spread-pickup.glb', 'new_spread')
subject.location = game_point((-8.8, 0, 0))
billboard(subject, camera)
for index, kind in enumerate(['shield', 'repair', 'fuel', 'mine']):
    reference = source_geometry(kind)
    reference.location = game_point((-4.4 + index * 4.4, 0, 0))
    if kind != 'mine':
        billboard(reference, camera)
render('kind-silhouette-cues', None,
       'LEFT TO RIGHT: new SPREAD / actual-source shield hex / repair cross / fuel drum / danger red mine. Source Three.js vertex/index arrays, no invented silhouettes. Shared world scale 1. Flat-normal Blender reconstruction is not live Three rasterization.')
proof = baseline()
counts = {}
bpy.context.view_layer.update()
points = []
for obj in proof.children:
    obj.data.calc_loop_triangles()
    counts[obj.name] = len(obj.data.loop_triangles)
    points.extend((obj.matrix_world @ vertex.co) for vertex in obj.data.vertices)
assert sum(counts.values()) == SOURCE['baseline']['visibleTriangles']
points = [(point.x, point.z, -point.y) for point in points]
(WORK / 'evidence' / 'baseline-measured.json').write_text(json.dumps({
    'triangles': sum(counts.values()), 'objects': counts,
    'bounds_game': {'min': [min(point[axis] for point in points) for axis in range(3)],
                    'max': [max(point[axis] for point in points) for axis in range(3)]},
    'method': 'Actual saved Pickup spread constructor executed with Three.js 0.185.1; exact vertex/index arrays reconstructed in Blender; no fabricated ring approximation.'}, indent=2) + '\n')
