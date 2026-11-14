import collections
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
FORMATS = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
WIDTHS = dict(SCALAR=1, VEC2=2, VEC3=3, VEC4=4, MAT4=16)


def read_glb(filename):
    payload = filename.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', payload)
    assert magic == b'glTF' and version == 2 and size == len(payload)
    offset, chunks = 12, {}
    while offset < len(payload):
        length, kind = struct.unpack_from('<II', payload, offset)
        assert length % 4 == 0 and offset + 8 + length <= len(payload)
        chunks[kind] = payload[offset + 8:offset + 8 + length]
        offset += length + 8
    assert offset == len(payload)
    document = json.loads(chunks[0x4E4F534A])
    binary = chunks.get(0x004E4942, b'')
    def accessor(index):
        record = document['accessors'][index]
        assert 'sparse' not in record
        view = document['bufferViews'][record['bufferView']]
        code, size = FORMATS[record['componentType']]
        width = WIDTHS[record['type']]
        stride = view.get('byteStride', width * size)
        begin = view.get('byteOffset', 0) + record.get('byteOffset', 0)
        assert begin + (record['count'] - 1) * stride + width * size <= view.get('byteOffset', 0) + view['byteLength']
        return [struct.unpack_from('<' + code * width, binary, begin + item * stride) for item in range(record['count'])]
    return document, accessor, payload


def topology(points, triangles):
    unique, vertices, indices = {}, [], []
    for point in points:
        key = tuple(round(value, 6) for value in point)
        if key not in unique:
            unique[key] = len(vertices)
            vertices.append(point)
        indices.append(unique[key])
    edges = collections.Counter()
    directions = collections.Counter()
    adjacency = collections.defaultdict(set)
    volume, min_area = 0, math.inf
    for triangle in triangles:
        mapped = [indices[index] for index in triangle]
        first, second, third = [points[index] for index in triangle]
        arm = [second[axis] - first[axis] for axis in range(3)]
        other = [third[axis] - first[axis] for axis in range(3)]
        cross = [arm[1] * other[2] - arm[2] * other[1], arm[2] * other[0] - arm[0] * other[2], arm[0] * other[1] - arm[1] * other[0]]
        min_area = min(min_area, math.sqrt(sum(value * value for value in cross)) / 2)
        volume += sum(first[axis] * (second[(axis + 1) % 3] * third[(axis + 2) % 3] - second[(axis + 2) % 3] * third[(axis + 1) % 3]) for axis in range(3)) / 6
        for corner in range(3):
            start, end = mapped[corner], mapped[(corner + 1) % 3]
            edge = tuple(sorted([start, end]))
            edges[edge] += 1
            directions[edge] += 1 if start < end else -1
            adjacency[start].add(end)
            adjacency[end].add(start)
    unvisited = set(range(len(vertices)))
    components = 0
    while unvisited:
        stack = [unvisited.pop()]
        components += 1
        while stack:
            for neighbor in adjacency[stack.pop()]:
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    stack.append(neighbor)
    return dict(welded_vertices=len(vertices), edges=len(edges), faces=len(triangles), euler=len(vertices) - len(edges) + len(triangles), connected_components=components, nonmanifold_edges=sum(count != 2 for count in edges.values()), orientation_errors=sum(value != 0 for value in directions.values()), minimum_triangle_area=min_area, signed_volume=volume)


def audit(filename, strict=False):
    document, accessor, payload = read_glb(filename)
    if strict:
        assert len(document['nodes']) == 2
        assert all(not any(key in node for key in ['matrix', 'rotation', 'translation', 'scale', 'children', 'skin']) for node in document['nodes'])
        assert document['materials'][0]['pbrMetallicRoughness'].get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1]
    results = []
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            points = accessor(primitive['attributes']['POSITION'])
            flat = [entry[0] for entry in accessor(primitive['indices'])] if 'indices' in primitive else list(range(len(points)))
            triangles = [flat[index:index + 3] for index in range(0, len(flat), 3)]
            assert all(math.isfinite(value) for point in points for value in point)
            bounds = dict(min=[min(point[axis] for point in points) for axis in range(3)], max=[max(point[axis] for point in points) for axis in range(3)])
            record = dict(name=mesh.get('name'), triangles=len(triangles), vertices=len(points), attributes=list(primitive['attributes']), bounds=bounds)
            if strict:
                stats = topology(points, triangles)
                assert stats['euler'] == 2 and stats['connected_components'] == 1 and stats['nonmanifold_edges'] == 0 and stats['orientation_errors'] == 0 and stats['signed_volume'] > 0 and stats['minimum_triangle_area'] > 1e-10, stats
                assert bounds['min'][1] >= -1e-6 and bounds['max'][1] <= 1 + 1e-6
                assert 'COLOR_0' not in primitive['attributes'] and 'TEXCOORD_0' not in primitive['attributes']
                normals = accessor(primitive['attributes']['NORMAL'])
                assert max(abs(math.sqrt(sum(value * value for value in normal)) - 1) for normal in normals) < 1e-5
                if 'Crate' in mesh['name']:
                    assert len(triangles) == 156
                    assert all(-0.500001 <= point[0] <= 0.500001 and -0.500001 <= point[2] <= 0.500001 for point in points)
                    record['continuous_containment'] = 'Every linear triangle vertex lies in convex source unit box; therefore full triangles lie inside for all affine placements'
                else:
                    assert len(triangles) == 180
                    apothem = math.cos(math.pi / 10)
                    violations = [math.sin((edge + 0.5) * math.tau / 10) * point[0] + math.cos((edge + 0.5) * math.tau / 10) * point[2] - apothem for edge in range(10) for point in points]
                    assert max(violations) < 1e-6
                    record['ten_source_halfplanes_max_error'] = max(violations)
                    record['continuous_containment'] = 'Every vertex satisfies all ten source cylinder halfplanes and 0<=Y<=1; convexity proves full triangle containment, preserved by original affine scale/yaw'
                record['topology'] = stats
            results.append(record)
    return dict(file=str(filename.relative_to(REPO)), bytes=len(payload), sha256=hashlib.sha256(payload).hexdigest(), primitives=len(results), materials=len(document.get('materials', [])), textures=len(document.get('textures', [])), images=len(document.get('images', [])), meshes=results, nodes=[node.get('name') for node in document.get('nodes', [])], node_transforms='identity baked and verified' if strict else 'reference bounds are primitive local-space only', material_definitions=document.get('materials', []))


if __name__ == '__main__':
    cargo = audit(ROOT / 'asset' / 'cargo-kit.glb', strict=True)
    assert cargo['bytes'] <= 512 * 1024 and cargo['primitives'] == 2 and cargo['materials'] == 1 and cargo['textures'] == 0 and cargo['images'] == 0
    shipped = [audit(REPO / 'public' / 'models' / (name + '.glb')) for name in ['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel']]
    report = dict(auditor='independent Python stdlib binary parser; no Blender/Three geometry path', cargo=cargo, shipped_vocabulary_only=shipped)
    (ROOT / 'evidence' / 'binary-audit.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(cargo, indent=2))
