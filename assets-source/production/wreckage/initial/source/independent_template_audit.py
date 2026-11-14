from collections import Counter, defaultdict
import json
from pathlib import Path
import struct
import sys

from glb_audit import accessor, audit, read_glb

ROOT = Path(sys.argv[1]).resolve()
FILE = ROOT / 'asset/drifting-wreckage-kit.glb'
raw, gltf, binary = read_glb(FILE)
templates = json.loads((ROOT / 'asset/runtime-templates.json').read_text())
report = audit(FILE)
assert len(raw) <= 512 * 1024
assert report['primitive_count'] == 4 and len(gltf['materials']) == 2
assert report['textures'] == report['images'] == 0
assert all(primitive['degenerate_triangles'] == 0 for mesh in report['meshes'] for primitive in mesh['primitives'])


def cross(first, second):
    return (first[1] * second[2] - first[2] * second[1], first[2] * second[0] - first[0] * second[2], first[0] * second[1] - first[1] * second[0])


def subtract(first, second):
    return tuple(first[axis] - second[axis] for axis in range(3))


def dot(first, second):
    return sum(first[axis] * second[axis] for axis in range(3))


def hits(origin, direction, triangles):
    count = 0
    for triangle in triangles:
        first = subtract(triangle[1], triangle[0])
        second = subtract(triangle[2], triangle[0])
        perpendicular = cross(direction, second)
        determinant = dot(first, perpendicular)
        if abs(determinant) < 1e-12:
            continue
        inverse = 1 / determinant
        relative = subtract(origin, triangle[0])
        factor_u = inverse * dot(relative, perpendicular)
        auxiliary = cross(relative, first)
        factor_v = inverse * dot(direction, auxiliary)
        distance = inverse * dot(second, auxiliary)
        if factor_u >= 0 and factor_v >= 0 and factor_u + factor_v <= 1 and distance > 1e-7:
            count += 1
    return count


results = []
for variant in templates['variants']:
    for bucket, data in variant['buckets'].items():
        mesh = next(mesh for mesh in gltf['meshes'] if mesh['name'] == f'{variant["name"]}--{bucket}')
        assert len(mesh['primitives']) == 1
        primitive = mesh['primitives'][0]
        positions = accessor(gltf, binary, primitive['attributes']['POSITION'])
        indices = [item[0] for item in accessor(gltf, binary, primitive['indices'])]
        actual = Counter(tuple(round(value, 6) for value in positions[index]) for index in indices)
        expected = Counter(tuple(round(struct.unpack('<f', struct.pack('<f', value))[0], 6) for value in data['p'][index:index + 3]) for index in range(0, len(data['p']), 3))
        assert actual == expected, (variant['name'], bucket, 'position multiset mismatch')
        assert 'COLOR_0' in primitive['attributes'] and 'NORMAL' in primitive['attributes']
    part = next(part for part in variant['parts'] if part['name'].endswith('continuous-torn-shell'))
    data = variant['buckets']['dark']['p']
    start = part['first_vertex'] * 3
    end = start + part['vertex_count'] * 3
    points = [tuple(round(value, 8) for value in data[index:index + 3]) for index in range(start, end, 3)]
    triangles = [points[index:index + 3] for index in range(0, len(points), 3)]
    edges = Counter()
    directed = Counter()
    adjacency = defaultdict(set)
    for triangle in triangles:
        for first, second in zip(triangle, triangle[1:] + triangle[:1]):
            edges[tuple(sorted((first, second)))] += 1
            directed[(first, second)] += 1
            adjacency[first].add(second)
            adjacency[second].add(first)
    assert set(edges.values()) == {2}
    assert all(directed[(second, first)] == count for (first, second), count in directed.items())
    visited, pending = set(), [points[0]]
    while pending:
        current = pending.pop()
        if current not in visited:
            visited.add(current)
            pending.extend(adjacency[current] - visited)
    assert len(visited) == len(adjacency)
    opening = (0, 1, 0) if variant['name'] == 'gutter-keel' else (-1, 1, 0)
    opening_hits = hits((0, 0, .9), opening, triangles)
    opposite_hits = hits((0, 0, .9), tuple(-value for value in opening), triangles)
    assert opening_hits == 0 and opposite_hits >= 1
    results.append({'name': variant['name'], 'triangles': variant['triangles'], 'two_bucket_primitives': True, 'glb_sidecar_position_multisets_match_1e_6': True, 'continuous_shell_components': 1, 'shell_edges_incidence': 2, 'consistent_shell_winding': True, 'cavity_origin': [0, 0, .9], 'opening_direction': opening, 'opening_ray_shell_hits': opening_hits, 'opposite_ray_shell_hits': opposite_hits, 'proof_scope': 'Topology and explicit cavity rays, not a general solid/collision solver or gameplay feature.'})
output = {'independent_binary_audit': True, 'bytes': len(raw), 'textures': 0, 'variants': results, 'formal_reviews': 0, 'formal_fix_passes': 0}
(ROOT / 'checks/independent-template-audit.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output))
