#!/usr/bin/env python3
"""Independent GLB inspection with the Python standard library only (no Blender).

python3 inspect_glb.py ASSET.glb > report.json
Reports bytes, sha256, nodes with TRS, transformed bounds (via the node hierarchy and
accessor data), triangles, primitives, material mapping per node, textures and PNG sizes.
"""
import hashlib
import json
import math
import struct
import sys


def quat_mat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def trs(node):
    if 'matrix' in node:
        m = node['matrix']
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = node.get('translation', [0, 0, 0])
    r = node.get('rotation', [0, 0, 0, 1])
    s = node.get('scale', [1, 1, 1])
    R = quat_mat(r)
    return [[R[i][0] * s[0], R[i][1] * s[1], R[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def main(path):
    raw = open(path, 'rb').read()
    magic, ver, length = struct.unpack('<4sII', raw[:12])
    assert magic == b'glTF' and ver == 2
    jl, jt = struct.unpack('<I4s', raw[12:20])
    J = json.loads(raw[20:20 + jl])
    off = 20 + jl
    bl, bt = struct.unpack('<I4s', raw[off:off + 8])
    BIN = raw[off + 8:off + 8 + bl]

    def acc_data(i):
        a = J['accessors'][i]
        bv = J['bufferViews'][a['bufferView']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        comp = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        size = struct.calcsize(comp)
        stride = bv.get('byteStride', size * n)
        return [struct.unpack_from('<' + comp * n, BIN, start + k * stride) for k in range(a['count'])]

    scene = J['scenes'][J.get('scene', 0)]
    mn, mx = [1e9] * 3, [-1e9] * 3
    nodes_out = []
    tri = prim = 0

    def walk(ni, parent_m, parent_name):
        nonlocal tri, prim
        node = J['nodes'][ni]
        M = mul(parent_m, trs(node))
        e = {'name': node.get('name'), 'parent': parent_name,
             'translation': node.get('translation', [0, 0, 0]), 'rotation': node.get('rotation', [0, 0, 0, 1]),
             'scale': node.get('scale', [1, 1, 1]), 'world_translation': [round(M[i][3], 5) for i in range(3)]}
        if 'extras' in node:
            e['extras'] = node['extras']
        if 'mesh' in node:
            mesh = J['meshes'][node['mesh']]
            e['primitives'] = []
            for p in mesh['primitives']:
                pos = acc_data(p['attributes']['POSITION'])
                n = J['accessors'][p['indices']]['count'] // 3 if 'indices' in p else len(pos) // 3
                tri += n
                prim += 1
                mat = J['materials'][p['material']]['name'] if 'material' in p else None
                e['primitives'].append({'material': mat, 'triangles': n, 'vertices': len(pos),
                                        'attributes': sorted(p['attributes'].keys())})
                for v in pos:
                    w = [sum(M[i][k] * v[k] for k in range(3)) + M[i][3] for i in range(3)]
                    for k in range(3):
                        mn[k] = min(mn[k], w[k])
                        mx[k] = max(mx[k], w[k])
        nodes_out.append(e)
        for c in node.get('children', []):
            walk(c, M, node.get('name'))

    I4 = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    for r in scene['nodes']:
        walk(r, I4, None)
    roots = [J['nodes'][r] for r in scene['nodes']]
    root_identity = all(not any(k in r for k in ('matrix', 'rotation', 'scale', 'translation'))
                        or (r.get('translation', [0, 0, 0]) == [0, 0, 0] and r.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1]
                            and r.get('scale', [1, 1, 1]) == [1, 1, 1]) for r in roots)
    images = []
    for im in J.get('images', []):
        bv = J['bufferViews'][im['bufferView']]
        data = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        w, h = struct.unpack('>II', data[16:24]) if data[:8] == b'\x89PNG\r\n\x1a\n' else (None, None)
        images.append({'name': im.get('name'), 'mimeType': im.get('mimeType'), 'bytes': len(data), 'width': w, 'height': h,
                       'embedded': True})
    mats = []
    for m in J.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        mats.append({'name': m['name'], 'doubleSided': m.get('doubleSided', False),
                     'baseColorTexture': 'baseColorTexture' in pbr, 'metallicRoughnessTexture': 'metallicRoughnessTexture' in pbr,
                     'metallicFactor': pbr.get('metallicFactor', 1), 'roughnessFactor': pbr.get('roughnessFactor', 1),
                     'emissiveFactor': m.get('emissiveFactor'),
                     'emissiveStrength': m.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength')})
    rep = {'file': path, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
           'generator': J['asset'].get('generator'), 'extensionsUsed': J.get('extensionsUsed', []),
           'root_nodes': [r.get('name') for r in roots], 'root_identity_transform': root_identity,
           'triangles': tri, 'primitives': prim,
           'bounds': {'min': [round(x, 5) for x in mn], 'max': [round(x, 5) for x in mx],
                      'size': [round(mx[k] - mn[k], 5) for k in range(3)]},
           'nodes': nodes_out, 'materials': mats, 'images': images,
           'animations': len(J.get('animations', [])), 'buffers_external': [b for b in J['buffers'] if 'uri' in b]}
    return rep


if __name__ == '__main__':
    print(json.dumps(main(sys.argv[1]), indent=1))
