import hashlib
import json
import math
import os
import struct
from pathlib import Path

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd()))
OUT = ROOT / 'asset-work/antenna/initial'
IDENTITY = [[1 if row == column else 0 for column in range(4)] for row in range(4)]


def multiply(first, second):
    return [[sum(first[row][inner] * second[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def transform(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    translation = node.get('translation', [0, 0, 0])
    scale = node.get('scale', [1, 1, 1])
    quat_x, quat_y, quat_z, quat_w = node.get('rotation', [0, 0, 0, 1])
    rotation = [
        [1 - 2 * (quat_y ** 2 + quat_z ** 2), 2 * (quat_x * quat_y - quat_z * quat_w), 2 * (quat_x * quat_z + quat_y * quat_w)],
        [2 * (quat_x * quat_y + quat_z * quat_w), 1 - 2 * (quat_x ** 2 + quat_z ** 2), 2 * (quat_y * quat_z - quat_x * quat_w)],
        [2 * (quat_x * quat_z - quat_y * quat_w), 2 * (quat_y * quat_z + quat_x * quat_w), 1 - 2 * (quat_x ** 2 + quat_y ** 2)],
    ]
    return [[rotation[row][column] * scale[column] if column < 3 else translation[row] for column in range(4)] for row in range(3)] + [[0, 0, 0, 1]]


def parse(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and length == len(data)
    offset = 12
    chunks = []
    while offset < len(data):
        size, kind = struct.unpack_from('<I4s', data, offset)
        assert size % 4 == 0 and offset + 8 + size <= len(data)
        chunks.append((kind, data[offset + 8:offset + 8 + size]))
        offset += 8 + size
    assert [kind for kind, value in chunks] == [b'JSON', b'BIN\x00']
    return data, json.loads(chunks[0][1]), chunks[1][1]


def audit(path):
    data, document, binary = parse(path)
    formats = {5120: ('b', 1, 127), 5121: ('B', 1, 255), 5122: ('h', 2, 32767), 5123: ('H', 2, 65535), 5125: ('I', 4, 4294967295), 5126: ('f', 4, 1)}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

    def accessor(index):
        entry = document['accessors'][index]
        view = document['bufferViews'][entry['bufferView']]
        code, size, divisor = formats[entry['componentType']]
        width = widths[entry['type']]
        stride = view.get('byteStride', size * width)
        first = view.get('byteOffset', 0) + entry.get('byteOffset', 0)
        assert first + max(0, entry['count'] - 1) * stride + size * width <= view.get('byteOffset', 0) + view['byteLength']
        result = [struct.unpack_from('<' + code * width, binary, first + ordinal * stride) for ordinal in range(entry['count'])]
        if entry.get('normalized'):
            result = [tuple(value / divisor for value in row) for row in result]
        assert all(math.isfinite(value) for row in result for value in row)
        return result

    bounds = [[float('inf')] * 3, [-float('inf')] * 3]
    primitives = []
    degenerate = 0
    all_positions = []
    diffuse_errors = []

    def visit(index, parent):
        nonlocal degenerate
        node = document['nodes'][index]
        matrix = multiply(parent, transform(node))
        if 'mesh' in node:
            mesh = document['meshes'][node['mesh']]
            for primitive in mesh['primitives']:
                assert primitive.get('mode', 4) == 4
                positions = accessor(primitive['attributes']['POSITION'])
                normals = accessor(primitive['attributes']['NORMAL'])
                assert all(abs(math.sqrt(sum(value * value for value in row)) - 1) < 1e-4 for row in normals)
                transformed = [tuple(sum(matrix[row][column] * (*point, 1)[column] for column in range(4)) for row in range(3)) for point in positions]
                all_positions.extend(transformed)
                for point in transformed:
                    for axis in range(3):
                        bounds[0][axis] = min(bounds[0][axis], point[axis])
                        bounds[1][axis] = max(bounds[1][axis], point[axis])
                indices = [entry[0] for entry in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
                assert len(indices) % 3 == 0
                assert all(0 <= index < len(positions) for index in indices)
                for offset in range(0, len(indices), 3):
                    first, second, third = [transformed[index] for index in indices[offset:offset + 3]]
                    edge_a = [second[axis] - first[axis] for axis in range(3)]
                    edge_b = [third[axis] - first[axis] for axis in range(3)]
                    cross = [edge_a[1] * edge_b[2] - edge_a[2] * edge_b[1], edge_a[2] * edge_b[0] - edge_a[0] * edge_b[2], edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]]
                    if sum(value * value for value in cross) < 1e-18:
                        degenerate += 1
                colors = accessor(primitive['attributes']['COLOR_0']) if 'COLOR_0' in primitive['attributes'] else None
                material = document['materials'][primitive['material']]
                if material['name'] == 'darkMetal_shared_response':
                    source_bucket = json.loads((ROOT / 'asset-work/antenna/work/geometry.json').read_text())['seed42']['buckets']['dark']
                    base_channels = [int(channel, 16) / 255 for channel in ['3a', '4a', '5e']]
                    source_base = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in base_channels]
                    factor = material['pbrMetallicRoughness']['baseColorFactor']
                    expected_colors = sorted((tuple(round(value, 6) for value in source_bucket['position'][offset:offset + 3]), tuple(source_bucket['color'][offset + axis] * source_base[axis] for axis in range(3))) for offset in range(0, len(source_bucket['position']), 3))
                    actual_colors = sorted((tuple(round(value, 6) for value in point), tuple(rgb[axis] * factor[axis] for axis in range(3))) for point, rgb in zip(transformed, colors))
                    assert len(expected_colors) == len(actual_colors)
                    for (expected_point, expected_rgb), (actual_point, actual_rgb) in zip(expected_colors, actual_colors):
                        assert expected_point == actual_point
                        diffuse_errors.extend(abs(expected_rgb[axis] - actual_rgb[axis]) for axis in range(3))
                    assert max(diffuse_errors) < 3e-6
                primitives.append({ 'node': node.get('name'), 'mesh': mesh.get('name'), 'triangles': len(indices) // 3, 'vertices': len(positions), 'material': primitive['material'], 'attributes': list(primitive['attributes']), 'colorRange': [min(value for row in colors for value in row[:3]), max(value for row in colors for value in row[:3])] if colors else None })
        for child in node.get('children', []):
            visit(child, matrix)

    for index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(index, IDENTITY)
    return { 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'triangles': sum(primitive['triangles'] for primitive in primitives), 'primitiveCount': len(primitives), 'materialCount': len(document.get('materials', [])), 'transformedBoundsGameAxes': bounds, 'degenerateTriangles': degenerate, 'primitives': primitives, 'materials': document.get('materials', []), 'imageCount': len(document.get('images', [])), 'textureCount': len(document.get('textures', [])), 'animationCount': len(document.get('animations', [])), 'externalURIs': [entry['uri'] for key in ['buffers', 'images'] for entry in document.get(key, []) if 'uri' in entry], 'accessorCount': len(document['accessors']), 'darkDiffuseProductComparedVertices': len(diffuse_errors) // 3, 'darkDiffuseProductMaxAbsoluteError': max(diffuse_errors, default=0) }


result = audit(OUT / 'asset/fortress-antenna.glb')
assert result['triangles'] == 304 and result['primitiveCount'] == 2 and result['materialCount'] == 2
assert result['bytes'] <= 384 * 1024 and result['degenerateTriangles'] == 0
assert result['imageCount'] == result['textureCount'] == result['animationCount'] == 0
assert result['externalURIs'] == []
expected = json.loads((OUT / 'evidence/generated-geometry.json').read_text())['seed42']['bounds']
for side in range(2):
    for axis in range(3):
        assert abs(result['transformedBoundsGameAxes'][side][axis] - expected[side][axis]) < 1e-6
dark = next(entry for entry in result['materials'] if entry['name'] == 'darkMetal_shared_response')
assert abs(dark['pbrMetallicRoughness']['metallicFactor'] - .5) < 1e-6
assert abs(dark['pbrMetallicRoughness']['roughnessFactor'] - .46) < 1e-6
result['status'] = 'PASS'
result['method'] = 'Independent Python standard-library GLB chunk/accessor/index/TRS hierarchy audit; no Blender or Three loader.'
result['materialPortability'] = 'The Blender glTF exporter omits a linked Multiply base factor and exports active white COLOR_0 plus used AO COLOR_1. Generator explicitly restores source dark factor *1.1 and remaps normalized AO/1.1 to COLOR_0. Product equals shared darkMetal response without clipping 1.1 top-face AO. Runtime uses original unnormalized Batch tints and shared material.'
(OUT / 'evidence/independent-binary-audit.json').write_text(json.dumps(result, indent=2))
references = {}
for name in ['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel']:
    path = ROOT / 'public/models' / (name + '.glb')
    data, document, binary = parse(path)
    references[name] = { 'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'materials': document.get('materials', []) }
(OUT / 'evidence/style-vocabulary.json').write_text(json.dumps({ 'readOnlyReferences': references, 'sourceVocabulary': ['assets-source/fighter', 'assets-source/sentinel', 'assets-source/ground', 'assets-source/supplies'], 'interpretation': 'Slender fitted hardware, slate structure, angular tapered mounting, clamped functional elements, restrained red point warning. All antenna geometry is new; only the unchanged shipped player is imported into labeled world-scale evidence.', 'copiedReferenceGeometryIntoAntenna': False }, indent=2))
print(json.dumps({ key: result[key] for key in ['status', 'bytes', 'triangles', 'primitiveCount', 'materialCount', 'transformedBoundsGameAxes', 'degenerateTriangles'] }))
