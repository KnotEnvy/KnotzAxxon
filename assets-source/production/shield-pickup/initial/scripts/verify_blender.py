import bpy
import bmesh
import json
import math
import pathlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree

WORK = pathlib.Path(__file__).resolve().parents[1]


def game(point):
    return (point.x, point.z, -point.y)


def measure():
    points = []
    entries = {}
    geometry = {}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        mesh.calc_loop_triangles()
        vertices = [game(obj.matrix_world @ vertex.co) for vertex in mesh.vertices]
        triangles = [tuple(face.vertices) for face in mesh.loop_triangles]
        temporary = bmesh.new()
        temporary.from_mesh(mesh)
        nonmanifold = sum(not edge.is_manifold for edge in temporary.edges)
        bmesh.ops.remove_doubles(temporary, verts=list(temporary.verts), dist=1e-6)
        welded_nonmanifold = sum(not edge.is_manifold for edge in temporary.edges)
        temporary.free()
        geometry[obj.name] = (vertices, triangles)
        points.extend(vertices)
        entries[obj.name] = {'triangles': len(triangles), 'vertices': len(vertices), 'nonmanifold_edges_raw': nonmanifold,
                             'nonmanifold_edges_position_welded_1e_6': welded_nonmanifold,
                             'material_primitives': len({face.material_index for face in mesh.polygons}),
                             'game_origin': game(obj.matrix_world.translation)}
        obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {'objects': entries, 'triangles': sum(entry['triangles'] for entry in entries.values()),
            'material_primitives': sum(entry['material_primitives'] for entry in entries.values()),
            'bounds_game': {'min': minimum, 'max': maximum, 'size': [maximum[axis] - minimum[axis] for axis in range(3)]}}, geometry


def rotate(points, angle, scale=1, pivot=(0, 0, 0)):
    cosine, sine = math.cos(angle), math.sin(angle)
    return [Vector((pivot[0] + scale * ((point[0] - pivot[0]) * cosine - (point[1] - pivot[1]) * sine),
                    pivot[1] + scale * ((point[0] - pivot[0]) * sine + (point[1] - pivot[1]) * cosine),
                    pivot[2] + scale * (point[2] - pivot[2]))) for point in points]


def radial_segment(left, right):
    dxvalue, dyvalue = right[0] - left[0], right[1] - left[1]
    denominator = dxvalue * dxvalue + dyvalue * dyvalue
    factor = max(0, min(1, -(left[0] * dxvalue + left[1] * dyvalue) / denominator)) if denominator else 0
    return math.hypot(left[0] + factor * dxvalue, left[1] + factor * dyvalue)


bpy.ops.wm.open_mainfile(filepath=str(WORK / 'asset' / 'shield-pickup.blend'))
packed_state = {'linked_libraries': len(bpy.data.libraries), 'image_datablocks': len(bpy.data.images),
                'external_images': [image.filepath for image in bpy.data.images if image.source == 'FILE' and not image.packed_file],
                'pack_all_called_by_generator': True, 'self_contained': True}
assert packed_state['linked_libraries'] == 0 and not packed_state['external_images']
reopened, unused = measure()
assert reopened['triangles'] == 1238 and reopened['material_primitives'] == 3
assert all(entry['nonmanifold_edges_raw'] == 0 for entry in reopened['objects'].values())
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(WORK / 'asset' / 'shield-pickup.glb'))
reimported, meshes = measure()
assert reimported['triangles'] == reopened['triangles']
assert reimported['material_primitives'] == 3
assert all(entry['nonmanifold_edges_position_welded_1e_6'] == 0 for entry in reimported['objects'].values())
for bound in ['min', 'max', 'size']:
    assert max(abs(left - right) for left, right in zip(reopened['bounds_game'][bound], reimported['bounds_game'][bound])) < 2e-6
for name, pivot in [('shell', (0, 0, 0)), ('core', (0, 0, -.3)), ('shape', (0, 0, .1))]:
    assert max(abs(left - right) for left, right in zip(reimported['objects'][name]['game_origin'], pivot)) < 1e-6

shell_points, shell_triangles = meshes['shell']
core_points, core_triangles = meshes['core']
shape_points, shape_triangles = meshes['shape']
inner_radius = min(radial_segment(shell_points[triangle[index]], shell_points[triangle[(index + 1) % 3]])
                   for triangle in shell_triangles for index in range(3))
shape_radius = max(math.hypot(point[0], point[1]) for point in shape_points)
core_radius = max(math.hypot(point[0], point[1]) for point in core_points)
radial_bound = inner_radius * .975 - max(shape_radius, core_radius)
assert radial_bound > .12
core_bvh = BVHTree.FromPolygons([Vector(point) for point in core_points], core_triangles, all_triangles=True)
minimum_sample = float('inf')
minimum_pose = None
overlaps = 0
samples = 0
for shape_angle in [-.08, -.04, 0, .04, .08]:
    shape_vertices = rotate(shape_points, shape_angle, pivot=(0, 0, .1))
    shape_bvh = BVHTree.FromPolygons(shape_vertices, shape_triangles, all_triangles=True)
    for scale in [.975, 1, 1.025]:
        for degrees in range(0, 360, 5):
            angle = math.radians(degrees)
            shell_vertices = rotate(shell_points, angle, scale)
            shell_bvh = BVHTree.FromPolygons(shell_vertices, shell_triangles, all_triangles=True)
            overlaps += len(shell_bvh.overlap(shape_bvh)) + len(shell_bvh.overlap(core_bvh))
            distances = [shell_bvh.find_nearest(vertex)[3] for vertex in shape_vertices]
            distances.extend(shape_bvh.find_nearest(vertex)[3] for vertex in shell_vertices)
            distances.extend(core_bvh.find_nearest(vertex)[3] for vertex in shell_vertices)
            sample_min = min(distances)
            if sample_min < minimum_sample:
                minimum_sample = sample_min
                minimum_pose = {'shell_degrees': degrees, 'shell_scale': scale, 'shape_radians': shape_angle}
            samples += 1
assert overlaps == 0
source_pose_overlaps = 0
for frame in range(241):
    phase = frame / 12
    shell_vertices = rotate(shell_points, .3 * phase, 1 + math.sin(phase * 4) * .025)
    shape_vertices = rotate(shape_points, math.sin(phase * 2.2) * .08, pivot=(0, 0, .1))
    shell_bvh = BVHTree.FromPolygons(shell_vertices, shell_triangles, all_triangles=True)
    shape_bvh = BVHTree.FromPolygons(shape_vertices, shape_triangles, all_triangles=True)
    source_pose_overlaps += len(shell_bvh.overlap(shape_bvh)) + len(shell_bvh.overlap(core_bvh))
assert source_pose_overlaps == 0
report = {'blend_reopened': reopened, 'blend_packed_state': packed_state, 'glb_clean_scene_reimport': reimported,
          'axis_conversion': 'Blender (x,y,z) -> game/glTF (x,z,-y), exporter export_yup=True; no root normalization or corrective game rotation',
          'clearance': {'independent_pose_samples': samples, 'ring_angles_degrees': '0..355 step 5',
                        'shape_wobbles_radians': [-.08, -.04, 0, .04, .08], 'ring_scales': [.975, 1, 1.025],
                        'triangle_overlap_pairs': overlaps, 'minimum_sampled_vertex_to_triangle_distance': minimum_sample,
                        'minimum_sample_pose': minimum_pose, 'shell_projected_inner_radius_mesh_edges': inner_radius,
                        'shape_max_radius': shape_radius, 'core_max_radius': core_radius,
                        'continuous_conservative_radial_clearance_lower_bound': radial_bound,
                        'source_timeline_samples': 241, 'source_timeline_seconds': [0, 20], 'source_timeline_overlap_pairs': source_pose_overlaps,
                        'method_limits': 'Finite BVH overlap and bidirectional vertex-to-triangle distance do not find every triangle-interior distance minimum. Conservative radial separating-cylinder bound additionally covers all shell spin angles, pulse range and badge wobbles: all projected shell triangles stay outside its inner edge/chord radius; all core/shape triangles are inside their convex vertex radial maximum. Float tolerance, not collision/physics integration proof.'}}
(WORK / 'evidence' / 'blender-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print('SHIELD_VERIFIED', json.dumps(report))
