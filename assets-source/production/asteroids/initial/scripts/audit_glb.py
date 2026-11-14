import hashlib
import json
import math
import pathlib
import struct


ROOT = pathlib.Path(__file__).resolve().parents[1]
COMPONENTS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    quaternion = node.get('rotation', [0, 0, 0, 1])
    x_axis, y_axis, z_axis, scalar = quaternion
    rotation = [[1 - 2 * (y_axis * y_axis + z_axis * z_axis), 2 * (x_axis * y_axis - z_axis * scalar), 2 * (x_axis * z_axis + y_axis * scalar)],
                [2 * (x_axis * y_axis + z_axis * scalar), 1 - 2 * (x_axis * x_axis + z_axis * z_axis), 2 * (y_axis * z_axis - x_axis * scalar)],
                [2 * (x_axis * z_axis - y_axis * scalar), 2 * (y_axis * z_axis + x_axis * scalar), 1 - 2 * (x_axis * x_axis + y_axis * y_axis)]]
    scale = node.get('scale', [1, 1, 1])
    translation = node.get('translation', [0, 0, 0])
    return [[rotation[row][column] * scale[column] for column in range(3)] + [translation[row]] for row in range(3)] + [[0, 0, 0, 1]]


def audit(file):
    blob = file.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', blob)
    assert magic == b'glTF' and version == 2 and length == len(blob)
    offset = 12
    document = None
    binary = None
    while offset < len(blob):
        size, kind = struct.unpack_from('<II', blob, offset)
        assert offset % 4 == 0 and size % 4 == 0 and offset + 8 + size <= len(blob)
        chunk = blob[offset + 8:offset + 8 + size]
        if kind == 0x4e4f534a:
            document = json.loads(chunk)
        elif kind == 0x004e4942:
            binary = chunk
        offset += size + 8
    assert document and binary
    assert not document.get('images') and not document.get('textures')
    assert not document.get('animations') and not document.get('skins')
    assert len(document['materials']) == 1
    assert len(document['buffers']) == 1 and 'uri' not in document['buffers'][0]

    def accessor(index):
        item = document['accessors'][index]
        assert 'sparse' not in item
        view = document['bufferViews'][item['bufferView']]
        code, size = COMPONENTS[item['componentType']]
        width = WIDTHS[item['type']]
        stride = view.get('byteStride', size * width)
        start = view.get('byteOffset', 0) + item.get('byteOffset', 0)
        end = start + max(0, item['count'] - 1) * stride + size * width
        assert end <= view.get('byteOffset', 0) + view['byteLength'] <= len(binary)
        values = [struct.unpack_from('<' + code * width, binary, start + entry * stride) for entry in range(item['count'])]
        if item.get('normalized') and item['componentType'] != 5126:
            maximum = {5121: 255, 5123: 65535, 5120: 127, 5122: 32767}[item['componentType']]
            values = [tuple(max(-1, value / maximum) for value in entry) for entry in values]
        assert all(math.isfinite(value) for entry in values for value in entry)
        return values

    rows = []
    identity = [[int(row == column) for column in range(4)] for row in range(4)]

    def visit(index, parent):
        node = document['nodes'][index]
        transform = multiply(parent, matrix(node))
        if 'mesh' in node:
            mesh = document['meshes'][node['mesh']]
            assert len(mesh['primitives']) == 1
            primitive = mesh['primitives'][0]
            assert primitive.get('mode', 4) == 4 and primitive.get('material', 0) == 0
            assert set(['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']).issubset(primitive['attributes'])
            position = accessor(primitive['attributes']['POSITION'])
            normal = accessor(primitive['attributes']['NORMAL'])
            color = accessor(primitive['attributes']['COLOR_0'])
            uv = accessor(primitive['attributes']['TEXCOORD_0'])
            indices = [item[0] for item in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(position)))
            assert len(indices) % 3 == 0 and max(indices) < len(position) and min(indices) >= 0
            points = [[sum(transform[row][column] * (point[column] if column < 3 else 1) for column in range(4)) for row in range(3)] for point in position]
            areas = []
            signed_volume = 0
            edges = {}
            welded = {point: ordinal for ordinal, point in enumerate(sorted(set(tuple(round(value, 7) for value in point) for point in points)))}
            for start in range(0, len(indices), 3):
                first, second, third = [points[index] for index in indices[start:start + 3]]
                edge_one = [second[axis] - first[axis] for axis in range(3)]
                edge_two = [third[axis] - first[axis] for axis in range(3)]
                cross = [edge_one[1] * edge_two[2] - edge_one[2] * edge_two[1], edge_one[2] * edge_two[0] - edge_one[0] * edge_two[2], edge_one[0] * edge_two[1] - edge_one[1] * edge_two[0]]
                areas.append(math.sqrt(sum(value * value for value in cross)) / 2)
                signed_volume += sum(first[axis] * (second[(axis + 1) % 3] * third[(axis + 2) % 3] - second[(axis + 2) % 3] * third[(axis + 1) % 3]) for axis in range(3)) / 6
                vertex_keys = [welded[tuple(round(value, 7) for value in point)] for point in [first, second, third]]
                for vertex in range(3):
                    edge = tuple(sorted([vertex_keys[vertex], vertex_keys[(vertex + 1) % 3]]))
                    edges[edge] = edges.get(edge, 0) + 1
            assert min(areas) > 1e-10 and signed_volume > 0 and all(count == 2 for count in edges.values())
            assert all(abs(math.sqrt(sum(value * value for value in entry)) - 1) < .0001 for entry in normal)
            rows.append({'node': node['name'], 'triangles': len(indices) // 3, 'primitiveCount': 1, 'verticesExported': len(position),
                         'boundsTransformed': {'min': [min(point[axis] for point in points) for axis in range(3)], 'max': [max(point[axis] for point in points) for axis in range(3)]},
                         'maxRadiusAboutPivot': max(math.sqrt(sum(value * value for value in point)) for point in points),
                         'signedVolume': signed_volume, 'minimumTriangleArea': min(areas), 'weldedClosedEdges': True,
                         'attributes': list(primitive['attributes']), 'worldMatrixRowMajor': transform,
                         'colorLinearRange': [min(value for entry in color for value in entry[:3]), max(value for entry in color for value in entry[:3])]})
        for child in node.get('children', []):
            visit(child, transform)

    for index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(index, identity)
    return {'file': str(file.relative_to(ROOT)), 'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest(), 'textures': 0, 'materials': [item['name'] for item in document['materials']], 'meshes': rows}


if __name__ == '__main__':
    reports = [audit(file) for file in sorted((ROOT / 'assets').glob('*.glb'))]
    kit = next(item for item in reports if item['file'].endswith('asteroid-scenery-kit.glb'))
    assert kit['bytes'] <= 512 * 1024 and len(kit['meshes']) == 3
    (ROOT / 'measurements/binary-audit.json').write_text(json.dumps({'method': 'Independent Python standard-library GLB chunk/accessor/node transform/index/welded edge audit; not the Blender exporter or importer.', 'files': reports}, indent=2) + '\n')
    print(json.dumps(reports, indent=2))
