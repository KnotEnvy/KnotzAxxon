import hashlib
import json
import math
import struct
from pathlib import Path

WORK = Path(__file__).resolve().parents[1]


def load_glb(filename):
    data = Path(filename).read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    document = None
    binary = None
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from('<II', data, offset)
        chunk = data[offset + 8:offset + 8 + size]
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + size
    assert document is not None and binary is not None
    return document, binary


def accessor(document, binary, index):
    entry = document['accessors'][index]
    view = document['bufferViews'][entry['bufferView']]
    code, size = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}[entry['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[entry['type']]
    stride = view.get('byteStride', size * width)
    offset = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
    values = [struct.unpack_from('<' + code * width, binary, offset + stride * position) for position in range(entry['count'])]
    if entry.get('normalized') and code in ('B', 'H'):
        maximum = 255 if code == 'B' else 65535
        values = [tuple(component / maximum for component in value) for value in values]
    return values


def matmul(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def transform(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    translation = node.get('translation', [0, 0, 0])
    scale = node.get('scale', [1, 1, 1])
    quat_x, quat_y, quat_z, quat_w = node.get('rotation', [0, 0, 0, 1])
    rotation = [[1 - 2 * (quat_y ** 2 + quat_z ** 2), 2 * (quat_x * quat_y - quat_z * quat_w), 2 * (quat_x * quat_z + quat_y * quat_w)], [2 * (quat_x * quat_y + quat_z * quat_w), 1 - 2 * (quat_x ** 2 + quat_z ** 2), 2 * (quat_y * quat_z - quat_x * quat_w)], [2 * (quat_x * quat_z - quat_y * quat_w), 2 * (quat_y * quat_z + quat_x * quat_w), 1 - 2 * (quat_x ** 2 + quat_y ** 2)]]
    return [[rotation[row][column] * scale[column] if column < 3 else translation[row] for column in range(4)] for row in range(3)] + [[0, 0, 0, 1]]


def inspect():
    filename = WORK / 'assets/missile.glb'
    document, binary = load_glb(filename)
    identity = [[float(row == column) for column in range(4)] for row in range(4)]
    positions = []
    colors = set()
    primitive_count = 0
    triangle_count = 0
    nodes = []
    degenerate = 0
    nozzle_checks = {'aft_cap_facing_minusZ': 0, 'recess_wall_facing_axis': 0, 'outer_lip_facing_out': 0}

    def visit(index, parent):
        nonlocal primitive_count, triangle_count, degenerate
        node = document['nodes'][index]
        world = matmul(parent, transform(node))
        nodes.append({'name': node.get('name'), 'local_matrix': transform(node), 'world_matrix': world, 'mesh': node.get('mesh')})
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                primitive_count += 1
                assert primitive.get('mode', 4) == 4
                assert primitive.get('material') == 0
                source_positions = accessor(document, binary, primitive['attributes']['POSITION'])
                points = [tuple(sum(world[row][inner] * (*point, 1)[inner] for inner in range(4)) for row in range(3)) for point in source_positions]
                assert all(math.isfinite(component) for point in points for component in point)
                positions.extend(points)
                indices = [value[0] for value in accessor(document, binary, primitive['indices'])] if 'indices' in primitive else list(range(len(points)))
                triangle_count += len(indices) // 3
                for offset in range(0, len(indices), 3):
                    first, second, third = [points[indices[offset + step]] for step in range(3)]
                    edge_a = [second[axis] - first[axis] for axis in range(3)]
                    edge_b = [third[axis] - first[axis] for axis in range(3)]
                    cross = [edge_a[1] * edge_b[2] - edge_a[2] * edge_b[1], edge_a[2] * edge_b[0] - edge_a[0] * edge_b[2], edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]]
                    degenerate += sum(component ** 2 for component in cross) < 1e-16
                    center = [sum(value[axis] for value in (first, second, third)) / 3 for axis in range(3)]
                    radial_dot = cross[0] * center[0] + cross[1] * center[1]
                    if max(abs(value[2] + .53) for value in (first, second, third)) < 1e-6:
                        assert cross[2] < 0
                        nozzle_checks['aft_cap_facing_minusZ'] += 1
                    if all(abs(math.hypot(value[0], value[1]) - (.09 if value[2] > -.60 else .107)) < 1e-5 and -.691 < value[2] < -.529 for value in (first, second, third)) and len({round(value[2], 3) for value in (first, second, third)}) == 2:
                        assert radial_dot < 0
                        nozzle_checks['recess_wall_facing_axis'] += 1
                    if all(-.731 < value[2] < -.699 for value in (first, second, third)):
                        assert radial_dot > 0
                        nozzle_checks['outer_lip_facing_out'] += 1
                colors.update(tuple(round(component, 6) for component in color) for color in accessor(document, binary, primitive['attributes']['COLOR_0']))
        for child in node.get('children', []):
            visit(child, world)

    for root_index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(root_index, identity)
    minimum = [min(point[axis] for point in positions) for axis in range(3)]
    maximum = [max(point[axis] for point in positions) for axis in range(3)]
    size = [maximum[axis] - minimum[axis] for axis in range(3)]
    assert primitive_count == 1 and len(document['materials']) == 1
    assert 400 <= triangle_count <= 600 and triangle_count <= 800
    assert not document.get('images') and not document.get('textures') and not document.get('animations') and not document.get('skins')
    assert filename.stat().st_size <= 128 * 1024
    assert degenerate == 0
    assert nozzle_checks == {'aft_cap_facing_minusZ': 12, 'recess_wall_facing_axis': 24, 'outer_lip_facing_out': 24}
    assert not document['materials'][0].get('doubleSided', False)
    assert {node['name'] for node in nodes} == {'MISSILE_ROOT', 'MISSILE_POOLED'}
    assert all(max(abs(node['world_matrix'][row][column] - identity[row][column]) for row in range(4) for column in range(4)) < 1e-6 for node in nodes)
    assert max(abs(minimum[axis] - [-.42, -.42, -.76][axis]) for axis in range(3)) < 1e-5
    assert max(abs(maximum[axis] - [.42, .42, .93][axis]) for axis in range(3)) < 1e-5
    nose_points = [point for point in positions if point[2] > .925]
    assert nose_points and all(abs(point[0]) < 1e-6 and abs(point[1]) < 1e-6 for point in nose_points)
    fin_tips = []
    for axis, sign in [(0, 1), (1, 1), (0, -1), (1, -1)]:
        candidates = [point for point in positions if abs(point[axis] - sign * .42) < 1e-6 and abs(point[2] + .64) < 1e-6]
        assert len(candidates) >= 2
        fin_tips.append({'radial_axis': 'XY'[axis], 'sign': sign, 'tip_source_z': -.64, 'radius': .42, 'present_in_binary': True})
    palette = json.loads((WORK / 'evidence/build-metrics.json').read_text())['palette_linear']
    palette_error = {key: min(max(abs(value[axis] - color[axis]) for axis in range(3)) for color in colors) for key, value in palette.items()}
    assert max(palette_error.values()) < 1e-5
    source_contract = json.loads((WORK / 'evidence/source-contract.json').read_text())
    transformed_bounds = []
    source_poses = [('velocity_' + str(entry['direction']), entry['matrix']) for entry in source_contract['orientations']]
    source_poses.extend((entry['label'], entry['matrix']) for context in source_contract['contexts'] for entry in context['samples'])
    for label, values in source_poses:
        matrix = [[values[column * 4 + row] for column in range(4)] for row in range(4)]
        transformed = [tuple(sum(matrix[row][inner] * (*point, 1)[inner] for inner in range(4)) for row in range(3)) for point in positions]
        transformed_bounds.append({'label': label, 'matrix_column_major': values, 'min': [min(point[axis] for point in transformed) for axis in range(3)], 'max': [max(point[axis] for point in transformed) for axis in range(3)]})
    report = {'independent_reader': 'Python stdlib binary GLB parser, no Blender/Three normalization', 'bytes': filename.stat().st_size, 'sha256': hashlib.sha256(filename.read_bytes()).hexdigest(), 'triangles': triangle_count, 'visible_primitives': primitive_count, 'materials': document['materials'], 'images': len(document.get('images', [])), 'textures': len(document.get('textures', [])), 'animations': len(document.get('animations', [])), 'nodes': nodes, 'world_bounds': {'min': minimum, 'max': maximum, 'size': size}, 'source_axes': '+Z nose verified from unique tip; +Y up from identity scene transforms and author coordinate conversion', 'color_0_unique_linear_values': sorted(colors), 'palette_max_abs_errors': palette_error, 'degenerate_triangles': degenerate, 'nozzle_face_winding': nozzle_checks, 'triangles_at_capacity40': triangle_count * 40, 'draw_call_contract': 'One primitive -> ONE InstancedMesh draw, provided adapter uses one material; CPU contract only, not measured GPU submission.'}
    report['transformed_bounds_source_matrices'] = transformed_bounds
    report['four_cardinal_control_fins'] = fin_tips
    (WORK / 'evidence/glb-binary-inspection.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    inspect()
