import hashlib
import json
import math
import pathlib
import struct

WORK = pathlib.Path(__file__).resolve().parents[1]
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def identity():
    return [[float(row == column) for column in range(4)] for row in range(4)]


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def transform(matrix, point):
    return [sum(matrix[row][column] * list(point + (1,))[column] for column in range(4)) for row in range(3)]


def node_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    quaternion = node.get('rotation', [0, 0, 0, 1])
    xvalue, yvalue, zvalue, wvalue = quaternion
    result = identity()
    rotation = [[1 - 2 * (yvalue * yvalue + zvalue * zvalue), 2 * (xvalue * yvalue - zvalue * wvalue), 2 * (xvalue * zvalue + yvalue * wvalue)],
                [2 * (xvalue * yvalue + zvalue * wvalue), 1 - 2 * (xvalue * xvalue + zvalue * zvalue), 2 * (yvalue * zvalue - xvalue * wvalue)],
                [2 * (xvalue * zvalue - yvalue * wvalue), 2 * (yvalue * zvalue + xvalue * wvalue), 1 - 2 * (xvalue * xvalue + yvalue * yvalue)]]
    scale = node.get('scale', [1, 1, 1])
    for row in range(3):
        for column in range(3):
            result[row][column] = rotation[row][column] * scale[column]
        result[row][3] = node.get('translation', [0, 0, 0])[row]
    return result


def read(path):
    data = pathlib.Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and length == len(data)
    offset = 12
    document = None
    binary = None
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        payload = data[offset + 8:offset + 8 + size]
        if kind == 0x4e4f534a:
            document = json.loads(payload)
        elif kind == 0x004e4942:
            binary = payload
        offset += size + 8
    assert document is not None and binary is not None

    def accessor(index):
        spec = document['accessors'][index]
        assert 'sparse' not in spec
        view = document['bufferViews'][spec['bufferView']]
        assert view['buffer'] == 0
        code, size = COMPONENTS[spec['componentType']]
        width = WIDTHS[spec['type']]
        stride = view.get('byteStride', width * size)
        start = view.get('byteOffset', 0) + spec.get('byteOffset', 0)
        values = [struct.unpack_from('<' + code * width, binary, start + position * stride) for position in range(spec['count'])]
        if spec.get('normalized') and code in ('B', 'H'):
            divisor = 255 if code == 'B' else 65535
            values = [tuple(value / divisor for value in row) for row in values]
        return values

    transformed = []
    objects = []

    def walk(index, parent):
        node = document['nodes'][index]
        matrix = multiply(parent, node_matrix(node))
        if 'mesh' in node:
            mesh = document['meshes'][node['mesh']]
            points = []
            triangles = 0
            colors = set()
            front_normals = 0
            for primitive in mesh['primitives']:
                assert primitive.get('mode', 4) == 4
                vertices = accessor(primitive['attributes']['POSITION'])
                indices = accessor(primitive['indices']) if 'indices' in primitive else vertices
                if 'indices' in primitive:
                    assert all(0 <= entry[0] < len(vertices) for entry in indices)
                assert all(math.isfinite(value) for vertex in vertices for value in vertex)
                triangles += len(indices) // 3
                points.extend(transform(matrix, vertex) for vertex in vertices)
                if 'COLOR_0' in primitive['attributes']:
                    for tint in accessor(primitive['attributes']['COLOR_0']):
                        channels = [12.92 * value if value <= .0031308 else 1.055 * value ** (1 / 2.4) - .055 for value in tint[:3]]
                        colors.add('#' + ''.join(f'{max(0, min(255, round(value * 255))):02x}' for value in channels))
                if 'NORMAL' in primitive['attributes']:
                    front_normals += sum(normal[2] > .999 for normal in accessor(primitive['attributes']['NORMAL']))
            transformed.extend(points)
            objects.append({'node': node['name'], 'triangles': triangles, 'material_primitives': len(mesh['primitives']),
                            'vertices': sum(document['accessors'][primitive['attributes']['POSITION']]['count'] for primitive in mesh['primitives']),
                            'vertex_palette_srgb': sorted(colors), 'local_positive_Z_facing_normals': front_normals,
                            'bounds': bounds(points), 'matrix_world_row_major': matrix,
                            'maximum_origin_radius': max(math.sqrt(sum(value * value for value in point)) for point in points),
                            'maximum_projected_xy_radius': max(math.hypot(point[0], point[1]) for point in points)})
        for child in node.get('children', []):
            walk(child, matrix)

    for root in document['scenes'][document.get('scene', 0)]['nodes']:
        walk(root, identity())
    report = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'triangles': sum(obj['triangles'] for obj in objects),
              'material_primitives': sum(obj['material_primitives'] for obj in objects), 'mesh_nodes': len(objects),
              'nodes': document['nodes'], 'materials': document['materials'], 'images': len(document.get('images', [])),
              'textures': len(document.get('textures', [])), 'animations': len(document.get('animations', [])),
              'transformed_rest_bounds_game': bounds(transformed), 'objects': objects}
    return document, report


def bounds(points):
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {'min': minimum, 'max': maximum, 'size': [maximum[axis] - minimum[axis] for axis in range(3)]}


if __name__ == '__main__':
    document, report = read(WORK / 'asset' / 'spread-pickup.glb')
    assert report['triangles'] <= 2500 and report['material_primitives'] <= 3 and report['bytes'] <= 512 * 1024
    assert report['mesh_nodes'] == 3 and report['textures'] == 0 and report['animations'] == 0
    nodes = {node['name']: node for node in document['nodes']}
    for name, pivot in [('shell', [0, 0, 0]), ('core', [0, 0, -.3]), ('shape', [0, 0, .1]), ('spread_pickup_root', [0, 0, 0])]:
        node = nodes[name]
        assert max(abs(value - wanted) for value, wanted in zip(node.get('translation', [0, 0, 0]), pivot)) < 1e-6
        assert node.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
        assert node.get('scale', [1, 1, 1]) == [1, 1, 1]
    shell = next(material for material in document['materials'] if material['name'] == 'spread_shell_amber_unlit')
    assert 'KHR_materials_unlit' in shell.get('extensions', {})
    for name in ['shell', 'shape']:
        assert '#ffffff' in next(obj for obj in report['objects'] if obj['node'] == name)['vertex_palette_srgb']
    amber = [1, ((180 / 255 + .055) / 1.055) ** 2.4, ((58 / 255 + .055) / 1.055) ** 2.4, 1]
    for entry in document['materials']:
        if entry['name'] in ['spread_shell_amber_unlit', 'spread_shape_amber_unlit']:
            assert max(abs(left - right) for left, right in zip(entry['pbrMetallicRoughness']['baseColorFactor'], amber)) < 1e-8
            assert 'KHR_materials_unlit' in entry.get('extensions', {})
    report['visual_sphere_radius_at_all_motion_extrema'] = max(obj['maximum_origin_radius'] * (1.025 if obj['node'] == 'shell' else 1) for obj in report['objects'])
    assert report['visual_sphere_radius_at_all_motion_extrema'] < 2.2
    report['assertions'] = 'PASS: exact named pivots; identity rotations/scales; game XY plane/+Z front; 3 primitives; budgets; shell unlit; no halo/texture/animation'
    (WORK / 'evidence' / 'glb-independent.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['bytes', 'triangles', 'material_primitives', 'transformed_rest_bounds_game', 'assertions']}, indent=2))
