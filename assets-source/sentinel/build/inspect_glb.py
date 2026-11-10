"""Independent GLB inspector (plain CPython, no Blender, no third-party modules).

python3 -I contest-entry/build/inspect_glb.py contest-entry/player.glb [more.glb ...] > report.json

Reports file size, triangles (from index accessors), primitive count, materials,
textures (PNG dimensions read from the embedded bytes), node TRS and parents,
animations (channels, duration) and extensions.
"""
import json
import struct
import sys
import os


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2 and length == len(data), 'not a valid GLB 2.0 container'
    off, js, binc = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == b'JSON':
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == b'BIN\x00':
            binc = chunk
        off += 8 + clen
    return js, binc, len(data)


def png_size(b):
    if b[:8] != b'\x89PNG\r\n\x1a\n':
        return None
    w, h = struct.unpack('>II', b[16:24])
    return [w, h]


def accessor_minmax(js, idx):
    a = js['accessors'][idx]
    return a.get('min'), a.get('max'), a['count']


NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_accessor(js, binc, idx):
    a = js['accessors'][idx]
    assert a['componentType'] == 5126, 'animation data expected as float32'
    bv = js['bufferViews'][a['bufferView']]
    n = NCOMP[a['type']]
    stride = bv.get('byteStride', 4 * n)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [list(struct.unpack_from('<%df' % n, binc, base + i * stride)) for i in range(a['count'])]


def inspect(path):
    js, binc, size = read_glb(path)
    rep = {'file': os.path.basename(path), 'bytes': size, 'asset': js.get('asset', {}),
           'extensionsUsed': js.get('extensionsUsed', []), 'extensionsRequired': js.get('extensionsRequired', [])}
    tris = prims = 0
    meshes = []
    for m in js.get('meshes', []):
        mt = 0
        mats = []
        for p in m['primitives']:
            mode = p.get('mode', 4)
            assert mode == 4, 'non-triangle primitive'
            if 'indices' in p:
                n = js['accessors'][p['indices']]['count'] // 3
            else:
                n = js['accessors'][p['attributes']['POSITION']]['count'] // 3
            mt += n
            prims += 1
            mats.append(js['materials'][p['material']]['name'] if 'material' in p else None)
        tris += mt
        meshes.append({'name': m.get('name'), 'primitives': len(m['primitives']), 'triangles': mt, 'materials': mats})
    rep['triangles'] = tris
    rep['primitives'] = prims
    rep['meshes'] = meshes
    rep['materials'] = []
    for m in js.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        rep['materials'].append({
            'name': m.get('name'), 'baseColorFactor': pbr.get('baseColorFactor'),
            'metallic': pbr.get('metallicFactor', 1.0), 'roughness': pbr.get('roughnessFactor', 1.0),
            'baseColorTexture': 'baseColorTexture' in pbr, 'emissiveFactor': m.get('emissiveFactor'),
            'emissiveTexture': 'emissiveTexture' in m, 'alphaMode': m.get('alphaMode', 'OPAQUE'),
            'extensions': sorted(m.get('extensions', {}).keys()),
            'emissiveStrength': m.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength'),
        })
    imgs = []
    for im in js.get('images', []):
        bv = js['bufferViews'][im['bufferView']]
        b = binc[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        imgs.append({'name': im.get('name'), 'mimeType': im.get('mimeType'), 'bytes': bv['byteLength'], 'size': png_size(b)})
    rep['images'] = imgs
    parent = {}
    for i, n in enumerate(js.get('nodes', [])):
        for c in n.get('children', []):
            parent[c] = i
    nodes = []
    for i, n in enumerate(js.get('nodes', [])):
        nodes.append({'name': n.get('name'), 'parent': js['nodes'][parent[i]].get('name') if i in parent else None,
                      'mesh': js['meshes'][n['mesh']]['name'] if 'mesh' in n else None,
                      'translation': [round(v, 4) for v in n.get('translation', [0, 0, 0])],
                      'rotation': [round(v, 5) for v in n.get('rotation', [0, 0, 0, 1])],
                      'scale': [round(v, 5) for v in n.get('scale', [1, 1, 1])],
                      'extras': n.get('extras')})
    rep['nodes'] = nodes
    anims = []
    for a in js.get('animations', []):
        dur = 0.0
        targets = set()
        end = {}
        for ch in a['channels']:
            s = a['samplers'][ch['sampler']]
            mn, mx, cnt = accessor_minmax(js, s['input'])
            if mx:
                dur = max(dur, mx[0])
            node = js['nodes'][ch['target']['node']].get('name')
            targets.add(node)
            vals = read_accessor(js, binc, s['output'])
            end[f"{node}.{ch['target']['path']}"] = [round(v, 4) for v in vals[-1]]
        anims.append({'name': a.get('name'), 'channels': len(a['channels']), 'duration_s': round(dur, 4),
                      'targets': sorted(targets), 'end_values': end})
    rep['animations'] = anims
    rep['scenes'] = [{'name': s.get('name'), 'roots': [js['nodes'][r].get('name') for r in s.get('nodes', [])]}
                     for s in js.get('scenes', [])]
    return rep


def check(rep, expect):
    """Assert rest pivots, parents, budgets and clips against expected_nodes.json."""
    errs = []
    by = {n['name']: n for n in rep['nodes']}
    for name, parent, loc in expect['nodes']:
        n = by.get(name)
        if n is None:
            errs.append(f'missing node {name}')
            continue
        if n['parent'] != parent:
            errs.append(f'{name}: parent {n["parent"]} != {parent}')
        d = max(abs(a - b) for a, b in zip(n['translation'], loc))
        if d > 1e-3:
            errs.append(f'{name}: translation {n["translation"]} != {loc}')
    if rep['triangles'] > expect['budget']['triangles']:
        errs.append('triangle budget exceeded')
    if rep['primitives'] > expect['budget']['primitives']:
        errs.append('primitive budget exceeded')
    names = {a['name'] for a in rep['animations']}
    errs += [f'missing animation {c}' for c in expect['clips'] if c not in names]
    errs += [f'texture {i["name"]} over 2048' for i in rep['images'] if i['size'] and max(i['size']) > 2048]
    if rep['bytes'] > 16 * 1024 * 1024:
        errs.append('GLB over 16 MiB')
    return errs


if __name__ == '__main__':
    args = sys.argv[1:]
    exp = None
    if args and args[0] == '--check':
        with open(args[1]) as f:
            exp = json.load(f)
        args = args[2:]
    out = [inspect(p) for p in args]
    bad = False
    if exp:
        for r in out:
            key = 'player' if r['file'].startswith('player') else 'sentinel'
            r['check_errors'] = check(r, exp[key])
            r['check'] = 'PASS' if not r['check_errors'] else 'FAIL'
            bad |= bool(r['check_errors'])
    print(json.dumps(out if len(out) > 1 else out[0], indent=1))
    sys.exit(1 if bad else 0)
