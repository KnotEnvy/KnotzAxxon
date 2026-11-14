import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_glb(path):
    payload = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', payload)
    assert (magic, version, length) == (b'glTF', 2, len(payload))
    chunks = []
    cursor = 12
    while cursor < length:
        size, kind = struct.unpack_from('<I4s', payload, cursor)
        assert size % 4 == 0 and cursor + size + 8 <= length
        chunks.append((kind, payload[cursor + 8:cursor + 8 + size]))
        cursor += size + 8
    assert cursor == length and chunks[0][0] == b'JSON'
    document = json.loads(chunks[0][1])
    binary = next(block for kind, block in chunks if kind == b'BIN\x00')
    assert not any('uri' in buffer for buffer in document.get('buffers', []))
    return payload, document, binary


def access(document, binary, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    formats = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
    counts = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    code = formats[accessor['componentType']]
    width = counts[accessor['type']]
    element_size = struct.calcsize('<' + code * width)
    stride = view.get('byteStride', element_size)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    assert start + (accessor['count'] - 1) * stride + element_size <= view.get('byteOffset', 0) + view['byteLength']
    result = [struct.unpack_from('<' + code * width, binary, start + offset * stride) for offset in range(accessor['count'])]
    assert all(math.isfinite(value) for item in result for value in item)
    if accessor.get('normalized'):
        maximum = {5121: 255, 5123: 65535}[accessor['componentType']]
        result = [tuple(value / maximum for value in item) for item in result]
    return result


def multiply(left, right):
    return [[sum(left[row][inner] * right[inner][column] for inner in range(4)) for column in range(4)] for row in range(4)]


def matrix(node):
    if 'matrix' in node:
        return [[node['matrix'][column * 4 + row] for column in range(4)] for row in range(4)]
    quat_x, quat_y, quat_z, quat_w = node.get('rotation', [0, 0, 0, 1])
    scale = node.get('scale', [1, 1, 1])
    translation = node.get('translation', [0, 0, 0])
    rotation = [
        [1 - 2 * (quat_y * quat_y + quat_z * quat_z), 2 * (quat_x * quat_y - quat_z * quat_w), 2 * (quat_x * quat_z + quat_y * quat_w)],
        [2 * (quat_x * quat_y + quat_z * quat_w), 1 - 2 * (quat_x * quat_x + quat_z * quat_z), 2 * (quat_y * quat_z - quat_x * quat_w)],
        [2 * (quat_x * quat_z - quat_y * quat_w), 2 * (quat_y * quat_z + quat_x * quat_w), 1 - 2 * (quat_x * quat_x + quat_y * quat_y)]
    ]
    return [[rotation[row][column] * scale[column] for column in range(3)] + [translation[row]] for row in range(3)] + [[0, 0, 0, 1]]


payload, document, binary = read_glb(ROOT / 'asset/fortress-rooftop-flak.glb')
assert len(payload) <= 512 * 1024
assert len(document['materials']) == 2
assert not document.get('textures') and not document.get('images') and not document.get('animations') and not document.get('skins')
assert len(document['meshes']) == 21
assert {material['extras']['runtime_material'] for material in document['materials']} == {'materials.hull', 'materials.darkMetal'}
identity = [[int(row == column) for column in range(4)] for row in range(4)]
bounds = [[math.inf] * 3, [-math.inf] * 3]
primitive_reports = []
triangle_count = 0
minimum_triangle_area = math.inf
maximum_normal_error = 0
maximum_color_error = 0
maximum_uv_error = 0
maximum_mapped_normal_error = 0
reference = json.loads((ROOT / 'evidence/reference-batch.json').read_text())
reference_bounds = [[min(record['p'][axis::3]) for axis in range(3)] for record in reference]
template = json.loads((ROOT / 'asset/flak-gun.template.json').read_text())
parts = {part['name']: part for part in template['parts']}
reference_colors = {}
reference_uv = {}
reference_normals = {}
offsets = {'hull': 0, 'dark': 0}
by_bucket = {entry['bucket']: entry for entry in reference}
for part in template['parts']:
    start = offsets[part['bucket']]
    reference_colors[part['name']] = by_bucket[part['bucket']]['c'][start * 3:(start + part['count']) * 3]
    reference_uv[part['name']] = by_bucket[part['bucket']]['uv'][start * 2:(start + part['count']) * 2]
    reference_normals[part['name']] = by_bucket[part['bucket']]['n'][start * 3:(start + part['count']) * 3]
    offsets[part['bucket']] += part['count']


def visit(index, parent):
    global triangle_count, minimum_triangle_area, maximum_normal_error, maximum_color_error, maximum_uv_error, maximum_mapped_normal_error
    node = document['nodes'][index]
    world = multiply(parent, matrix(node))
    if 'mesh' in node:
        part = parts[node['name']]
        for primitive in document['meshes'][node['mesh']]['primitives']:
            assert primitive.get('mode', 4) == 4
            assert {'POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'} <= primitive['attributes'].keys()
            attributes = {key: access(document, binary, accessor) for key, accessor in primitive['attributes'].items()}
            positions = attributes['POSITION']
            normals = attributes['NORMAL']
            colors = attributes['COLOR_0']
            indices = [item[0] for item in access(document, binary, primitive['indices'])] if 'indices' in primitive else list(range(len(positions)))
            assert len(indices) % 3 == 0 and max(indices) < len(positions)
            count = len(indices) // 3
            assert count == part['triangles']
            triangle_count += count
            for point in positions:
                transformed = [sum(world[row][column] * point[column] for column in range(3)) + world[row][3] for row in range(3)]
                for axis in range(3):
                    bounds[0][axis] = min(bounds[0][axis], transformed[axis])
                    bounds[1][axis] = max(bounds[1][axis], transformed[axis])
            for normal in normals:
                maximum_normal_error = max(maximum_normal_error, abs(math.sqrt(sum(value * value for value in normal)) - 1))
            for offset in range(0, len(indices), 3):
                points = [positions[indices[offset + corner]] for corner in range(3)]
                edge_a = [points[1][axis] - points[0][axis] for axis in range(3)]
                edge_b = [points[2][axis] - points[0][axis] for axis in range(3)]
                cross = [edge_a[1] * edge_b[2] - edge_a[2] * edge_b[1], edge_a[2] * edge_b[0] - edge_a[0] * edge_b[2], edge_a[0] * edge_b[1] - edge_a[1] * edge_b[0]]
                area = math.sqrt(sum(value * value for value in cross)) * .5
                minimum_triangle_area = min(minimum_triangle_area, area)
                assert area > 1e-8
                for corner in range(3):
                    assert sum(cross[axis] * normals[indices[offset + corner]][axis] for axis in range(3)) > 0
                    expected = reference_colors[node['name']][(offset + corner) * 3:(offset + corner) * 3 + 3]
                    actual = [value * node['extras']['GLB_COLOR0_decode_gain'] for value in colors[indices[offset + corner]][:3]]
                    maximum_color_error = max(maximum_color_error, *(abs(actual[axis] - expected[axis]) for axis in range(3)))
                    actual_uv = attributes['TEXCOORD_0'][indices[offset + corner]]
                    expected_uv = reference_uv[node['name']][(offset + corner) * 2:(offset + corner) * 2 + 2]
                    maximum_uv_error = max(maximum_uv_error, abs(actual_uv[0] - expected_uv[0]), abs(1 - actual_uv[1] - expected_uv[1]))
                    normal = normals[indices[offset + corner]]
                    transformed_normal = [sum(world[row][column] * normal[column] for column in range(3)) for row in range(3)]
                    expected_normal = reference_normals[node['name']][(offset + corner) * 3:(offset + corner) * 3 + 3]
                    maximum_mapped_normal_error = max(maximum_mapped_normal_error, *(abs(transformed_normal[axis] - expected_normal[axis]) for axis in range(3)))
            primitive_reports.append({'node': node['name'], 'material': document['materials'][primitive['material']]['name'], 'triangles': count, 'vertices': len(positions), 'attributes': sorted(attributes)})
    for child in node.get('children', []):
        visit(child, world)


for root in document['scenes'][document.get('scene', 0)]['nodes']:
    visit(root, identity)
expected_bounds = [[min(min(record['p'][axis::3]) for record in reference) for axis in range(3)], [max(max(record['p'][axis::3]) for record in reference) for axis in range(3)]]
bounds_error = max(abs(bounds[row][axis] - expected_bounds[row][axis]) for row in range(2) for axis in range(3))
assert triangle_count == 704 and maximum_normal_error < 1e-6 and maximum_color_error < .0001 and bounds_error < .00001, (triangle_count, maximum_normal_error, maximum_color_error, bounds_error)
assert maximum_uv_error < .00001 and maximum_mapped_normal_error < .0001, (maximum_uv_error, maximum_mapped_normal_error)
shipped = {}
for name in ['player', 'sentinel', 'turret', 'radar', 'silo', 'fuel']:
    path = ROOT.parents[2] / 'public/models' / (name + '.glb')
    raw, content, unused = read_glb(path)
    category = {'player': 'fighter', 'sentinel': 'sentinel', 'turret': 'ground', 'radar': 'ground', 'silo': 'supplies', 'fuel': 'supplies'}[name]
    blend_source = ROOT.parents[2] / 'assets-source' / category / (name + '.blend')
    shipped[name] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'editableSourceSHA256': hashlib.sha256(blend_source.read_bytes()).hexdigest(), 'meshes': len(content['meshes']), 'materials': [entry.get('name') for entry in content['materials']], 'use': 'style reference only; player rendered at unmodified actual scale in WORLD evidence'}
report = {'method': 'Independent stdlib binary GLB parser, buffer/accessor bounds, topology, node TRS recursion, transformed game-space bounds, color/UV/normal equivalence to actual Batch reference; no Blender importer used', 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(), 'triangles': triangle_count, 'primitives': len(primitive_reports), 'meshes': len(document['meshes']), 'nodes': len(document['nodes']), 'materials': document['materials'], 'textures': 0, 'images': 0, 'animations': 0, 'skins': 0, 'bounds': bounds, 'maximumBoundsErrorVersusRuntimeReference': bounds_error, 'minimumTriangleArea': minimum_triangle_area, 'maximumUnitNormalError': maximum_normal_error, 'maximumLinearVertexColorErrorVersusBatch': maximum_color_error, 'maximumBoxProjectionUVErrorWithGLTFVDecode': maximum_uv_error, 'maximumTransformedNormalErrorVersusBatch': maximum_mapped_normal_error, 'vertexMapping': {'color': 'COLOR_0 * node.extras.GLB_COLOR0_decode_gain (1.1) restores source linear tint/AO without glTF clipping; preview baseColorFactor carries this gain', 'uv': 'glTF (u,1-v) -> source Batch (u,v), world dominant-axis box projection /3', 'normal': 'flat normals, node world orthonormal transform; no nonuniform scale'}, 'parts': primitive_reports, 'shippedReferences': shipped}
(ROOT / 'evidence/independent-binary-audit.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['bytes', 'triangles', 'primitives', 'nodes', 'bounds', 'maximumBoundsErrorVersusRuntimeReference', 'maximumLinearVertexColorErrorVersusBatch']}, indent=2))
