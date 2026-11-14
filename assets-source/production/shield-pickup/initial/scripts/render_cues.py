import pathlib

WORK = pathlib.Path(__file__).resolve().parents[1]
helper_source = (WORK / 'scripts' / 'render_evidence.py').read_text().split("if '--gameplay-only' not in sys.argv:")[0]
exec(compile(helper_source, str(WORK / 'scripts' / 'render_evidence.py'), 'exec'))
REPORT = json.loads((WORK / 'evidence' / 'renders.json').read_text())


def other_kind(kind, tint):
    root = baseline()
    shape_obj = next(obj for obj in root.children if obj.name.startswith('baseline_shape'))
    bpy.data.objects.remove(shape_obj, do_unlink=True)
    shell_obj = next(obj for obj in root.children if obj.name.startswith('baseline_shell'))
    shell_obj.data.materials.clear()
    shell_obj.data.materials.append(source_neon(kind + '_shell_reference', 1.15, tint))
    builder = Builder()
    if kind == 'spread':
        for index in range(3):
            polygon = [(-.9, -.15), (0, .48), (.9, -.15), (.7, -.37), (0, .13), (-.7, -.37)]
            shifted = [(point[0], point[1] - .8 + index * .8) for point in polygon]
            builder.loft(shifted, [(.96, -.035), (1, 0), (1, .12), (.96, .155)], [tint])
    elif kind == 'repair':
        polygon = [(-.31, -1.1), (.31, -1.1), (.31, -.31), (1.1, -.31), (1.1, .31), (.31, .31),
                   (.31, 1.1), (-.31, 1.1), (-.31, .31), (-1.1, .31), (-1.1, -.31), (-.31, -.31)]
        builder.loft(polygon, [(.96, -.04), (1, 0), (1, .12), (.96, .16)], [tint])
    else:
        for height in [-.8, .8]:
            builder.vertices.extend((.7 * math.sin(index * math.tau / 10), height, .7 * math.cos(index * math.tau / 10)) for index in range(10))
        builder.vertices.extend([(0, -.8, 0), (0, .8, 0)])
        for index in range(10):
            following = (index + 1) % 10
            builder.face([index, following, following + 10, index + 10], tint)
            builder.face([20, following, index], tint)
            builder.face([21, index + 10, following + 10], tint)
        for height in [-.45, .45]:
            ring = Builder()
            ring.annulus(12, [(.72 + .1 * math.cos(index * math.tau / 4), .1 * math.sin(index * math.tau / 4)) for index in range(4)], [tint])
            offset = len(builder.vertices)
            builder.vertices.extend((point[0], -point[2] + height, point[1]) for point in ring.vertices)
            for face in ring.faces:
                builder.face([index + offset for index in face], tint)
        builder.vertices = [(point[0] * .82, point[1] * .82, point[2] * .25) for point in builder.vertices]
    builder.object('reference_' + kind, source_neon(kind + '_shape_reference', 1.35, tint), root, (0, 0, .1))
    return root


scene, camera = reset_scene()
neutral_lights()
scene.render.resolution_x, scene.render.resolution_y = 1200, 400
set_camera(camera, (0, 0, 20), (0, 0, 0), span=8)
subject = import_root(WORK / 'asset' / 'shield-pickup.glb', 'new_shield')
subject.location = game_point((-7.2, 0, 0))
billboard(subject, camera)
for index, (kind, tint) in enumerate([('spread', 'ffb43a'), ('repair', '52ffa8'), ('fuel', 'ffd76a')]):
    reference = other_kind(kind, tint)
    reference.location = game_point((-2.4 + index * 4.8, 0, 0))
    billboard(reference, camera)
render('kind-silhouette-cues', None, 'OFFLINE source cue reconstruction: NEW shield / procedural spread / repair / fuel, all at world scale 1. Core/shell exact source dimensions, spread/repair outer contours and depth from source with approximate bevel offsets; fuel source cylinder/torus and .82,.82,.25 scale. Not exported, other kinds remain procedural.')
proof = baseline()
proof.hide_render = True
counts = {}
baseline_points = []
for obj in proof.children:
    obj.data.calc_loop_triangles()
    counts[obj.name] = len(obj.data.loop_triangles)
    baseline_points.extend((obj.matrix_world @ vertex.co) for vertex in obj.data.vertices)
assert sum(counts.values()) == 456
bpy.context.view_layer.update()
baseline_points = [(obj.matrix_world @ vertex.co) for obj in proof.children for vertex in obj.data.vertices]
game_points = [(point.x, point.z, -point.y) for point in baseline_points]
(WORK / 'evidence' / 'baseline-measured.json').write_text(json.dumps({'triangles': sum(counts.values()), 'mesh_nodes': 3,
    'bounds_game': {'min': [min(point[axis] for point in game_points) for axis in range(3)],
                    'max': [max(point[axis] for point in game_points) for axis in range(3)]},
    'objects': counts, 'method': 'Native Blender reconstruction from exact Pickup.js shield constructor radii, segments, cylinder rotation and pivots; actual evaluated triangle counts. Not a shipped baseline GLB, because no pickup GLB exists.'}, indent=2) + '\n')
