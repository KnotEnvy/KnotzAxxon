import argparse
import hashlib
import json
import math
import struct
from pathlib import Path


def identity():
    return [[float(row == column) for column in range(4)] for row in range(4)]


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def node_matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    translation = node.get('translation', [0, 0, 0])
    scale = node.get('scale', [1, 1, 1])
    quaternion_x, quaternion_y, quaternion_z, quaternion_w = node.get('rotation', [0, 0, 0, 1])
    rotation = [
        [1 - 2 * (quaternion_y ** 2 + quaternion_z ** 2), 2 * (quaternion_x * quaternion_y - quaternion_z * quaternion_w), 2 * (quaternion_x * quaternion_z + quaternion_y * quaternion_w)],
        [2 * (quaternion_x * quaternion_y + quaternion_z * quaternion_w), 1 - 2 * (quaternion_x ** 2 + quaternion_z ** 2), 2 * (quaternion_y * quaternion_z - quaternion_x * quaternion_w)],
        [2 * (quaternion_x * quaternion_z - quaternion_y * quaternion_w), 2 * (quaternion_y * quaternion_z + quaternion_x * quaternion_w), 1 - 2 * (quaternion_x ** 2 + quaternion_y ** 2)],
    ]
    result = identity()
    for row in range(3):
        for column in range(3):
            result[row][column] = rotation[row][column] * scale[column]
        result[row][3] = translation[row]
    return result


def read_glb(path):
    payload = Path(path).read_bytes()
    magic, version, length = struct.unpack_from('<4sII', payload)
    assert magic == b'glTF' and version == 2 and length == len(payload)
    offset = 12
    document = None
    binary = b''
    while offset < length:
        size, kind = struct.unpack_from('<II', payload, offset)
        chunk = payload[offset + 8:offset + 8 + size]
        if kind == 0x4e4f534a:
            document = json.loads(chunk)
        elif kind == 0x004e4942:
            binary = chunk
        offset += 8 + size
    return document, binary


def accessor(document, binary, index):
    entry = document['accessors'][index]
    view = document['bufferViews'][entry['bufferView']]
    component = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}[entry['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[entry['type']]
    form = '<' + component * width
    stride = view.get('byteStride', struct.calcsize(form))
    start = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
    return [struct.unpack_from(form, binary, start + row * stride) for row in range(entry['count'])]


def audit(path):
    document, binary = read_glb(path)
    minimum = [math.inf] * 3
    maximum = [-math.inf] * 3
    meshes = []
    triangles = 0
    primitives = 0
    zero_area = 0
    material_names = [item.get('name', str(index)) for index, item in enumerate(document.get('materials', []))]

    def visit(index, parent):
        nonlocal triangles, primitives, zero_area
        node = document['nodes'][index]
        matrix = multiply(parent, node_matrix(node))
        if 'mesh' in node:
            record = {'node': node.get('name', str(index)), 'worldMatrix': matrix, 'primitives': []}
            for primitive in document['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode', 4) == 4
                positions = accessor(document, binary, primitive['attributes']['POSITION'])
                transformed = [tuple(sum(matrix[axis][inner] * position[inner] for inner in range(3)) + matrix[axis][3] for axis in range(3)) for position in positions]
                indices = [item[0] for item in accessor(document, binary, primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
                assert len(indices) % 3 == 0
                assert all(0 <= item < len(positions) for item in indices)
                count = len(indices) // 3
                for position in transformed:
                    for axis in range(3):
                        assert math.isfinite(position[axis])
                        minimum[axis] = min(minimum[axis], position[axis])
                        maximum[axis] = max(maximum[axis], position[axis])
                for offset in range(0, len(indices), 3):
                    first, second, third = [transformed[item] for item in indices[offset:offset + 3]]
                    edge_a = [second[axis] - first[axis] for axis in range(3)]
                    edge_b = [third[axis] - first[axis] for axis in range(3)]
                    cross = [edge_a[1] * edge_b[2] - edge_a[2] * edge_b[1], edge_a[2] * edge_b[0] - edge_a[0] * edge_b[2], edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]]
                    if sum(item * item for item in cross) < 1e-14:
                        zero_area += 1
                record['primitives'].append({'triangles': count, 'vertices': len(positions), 'material': material_names[primitive['material']], 'attributes': list(primitive['attributes'])})
                triangles += count
                primitives += 1
            meshes.append(record)
        for child in node.get('children', []):
            visit(child, matrix)

    for index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(index, identity())
    return {'path': str(path), 'bytes': Path(path).stat().st_size, 'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'triangles': triangles, 'materialPrimitives': primitives, 'declaredMaterials': material_names, 'images': len(document.get('images', [])), 'boundsTransformedGame': {'min': minimum, 'max': maximum, 'size': [maximum[axis] - minimum[axis] for axis in range(3)]}, 'zeroAreaTriangles': zero_area, 'nodes': meshes}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('paths', nargs='+')
    parser.add_argument('--out', required=True)
    arguments = parser.parse_args()
    result = [audit(path) for path in arguments.paths]
    Path(arguments.out).write_text(json.dumps(result, indent=2))
    print(json.dumps([{key: item[key] for key in ['path', 'bytes', 'triangles', 'materialPrimitives', 'boundsTransformedGame', 'zeroAreaTriangles']} for item in result], indent=2))
