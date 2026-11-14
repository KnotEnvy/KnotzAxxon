import hashlib
import json
import math
from pathlib import Path
import struct
import sys


def read_glb(file):
    raw = Path(file).read_bytes()
    magic, version, total = struct.unpack_from('<4sII', raw)
    assert magic == b'glTF' and version == 2 and total == len(raw)
    offset = 12
    chunks = []
    while offset < total:
        length, kind = struct.unpack_from('<II', raw, offset)
        assert length % 4 == 0
        chunks.append((kind, raw[offset + 8:offset + 8 + length]))
        offset += length + 8
    assert offset == total and chunks[0][0] == 0x4E4F534A
    document = json.loads(chunks[0][1])
    binary = next(data for kind, data in chunks if kind == 0x004E4942)
    return raw, document, binary


def accessor(document, binary, index):
    item = document['accessors'][index]
    view = document['bufferViews'][item['bufferView']]
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    formats = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
    width = widths[item['type']]
    code = formats[item['componentType']]
    packed = struct.calcsize('<' + code * width)
    stride = view.get('byteStride', packed)
    start = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    assert start + max(0, item['count'] - 1) * stride + packed <= view.get('byteOffset', 0) + view['byteLength']
    return [struct.unpack_from('<' + code * width, binary, start + row * stride) for row in range(item['count'])]


def audit(file):
    raw, document, binary = read_glb(file)
    meshes = []
    for mesh in document.get('meshes', []):
        primitives = []
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            positions = accessor(document, binary, primitive['attributes']['POSITION'])
            indices = [item[0] for item in accessor(document, binary, primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
            assert len(indices) % 3 == 0 and all(0 <= index < len(positions) for index in indices)
            assert all(math.isfinite(value) for point in positions for value in point)
            degenerate = 0
            for start in range(0, len(indices), 3):
                points = [positions[index] for index in indices[start:start + 3]]
                edge_a = [points[1][axis] - points[0][axis] for axis in range(3)]
                edge_b = [points[2][axis] - points[0][axis] for axis in range(3)]
                cross = [edge_a[1] * edge_b[2] - edge_a[2] * edge_b[1], edge_a[2] * edge_b[0] - edge_a[0] * edge_b[2], edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]]
                degenerate += sum(value * value for value in cross) < 1e-20
            primitives.append({'triangles': len(indices) // 3, 'vertices': len(positions), 'material': document['materials'][primitive['material']]['name'], 'attributes': sorted(primitive['attributes']), 'min': [min(point[axis] for point in positions) for axis in range(3)], 'max': [max(point[axis] for point in positions) for axis in range(3)], 'degenerate_triangles': degenerate})
        meshes.append({'name': mesh.get('name'), 'primitives': primitives})
    return {'file': str(file), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'triangles': sum(primitive['triangles'] for mesh in meshes for primitive in mesh['primitives']), 'primitive_count': sum(len(mesh['primitives']) for mesh in meshes), 'meshes': meshes, 'nodes': [{'name': node.get('name'), 'mesh': node.get('mesh'), 'children': node.get('children', [])} for node in document.get('nodes', [])], 'materials': document.get('materials', []), 'images': len(document.get('images', [])), 'textures': len(document.get('textures', [])), 'extensions_used': document.get('extensionsUsed', [])}


if __name__ == '__main__':
    output, *files = sys.argv[1:]
    result = [audit(file) for file in files]
    Path(output).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps([{'file': item['file'], 'triangles': item['triangles'], 'primitives': item['primitive_count'], 'bytes': item['bytes']} for item in result]))
