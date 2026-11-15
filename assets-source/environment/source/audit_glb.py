#!/usr/bin/env python3
"""
Independent binary audit of the exported kit modules.

Pure Python standard library: parses the GLB container and accessors directly
(no Blender, no three.js, no glTF library), then cross-checks every mesh node
against kit-recipe.json.

python3 audit_glb.py <kitDir> [out.json]
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

KIT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else KIT / 'evidence' / 'glb-audit.json'
recipe = json.loads((KIT / 'kit-recipe.json').read_text())

COMP = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NUM = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    assert magic == b'glTF' and version == 2 and length == len(data), f'bad GLB header {path.name}'
    off, chunks = 12, []
    while off < length:
        clen, ctype = struct.unpack_from('<I4s', data, off)
        chunks.append((ctype, data[off + 8: off + 8 + clen]))
        off += 8 + clen
    assert chunks[0][0] == b'JSON' and chunks[1][0] == b'BIN\x00' and len(chunks) == 2, 'unexpected chunk layout'
    return data, json.loads(chunks[0][1]), chunks[1][1]


def accessor(doc, bin_, idx):
    a = doc['accessors'][idx]
    bv = doc['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NUM[a['type']]
    stride = bv.get('byteStride') or size * n
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    out = []
    for i in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, bin_, base + i * stride))
    return a, out


report = {'method': 'Stdlib-only GLB parse (header, JSON chunk, BIN chunk, accessors); independent of the generator, Blender and three.js.',
          'modules': {}, 'failures': []}


def fail(msg):
    report['failures'].append(msg)


total_tris = 0
for mod, entry in recipe['modules'].items():
    path = KIT / entry['glb']['file']
    data, doc, bin_ = read_glb(path)
    sha = hashlib.sha256(data).hexdigest()
    if sha != entry['glb']['sha256']:
        fail(f'{mod}: sha256 differs from recipe')
    if len(data) != entry['glb']['bytes']:
        fail(f'{mod}: byte length differs from recipe')
    nodes = {n.get('name'): n for n in doc['nodes']}
    by_part = {e['node']: e for e in entry['parts']}
    if set(nodes) != set(by_part):
        fail(f'{mod}: node set differs from recipe: {sorted(set(nodes) ^ set(by_part))}')
    mrec = {'file': entry['glb']['file'], 'bytes': len(data), 'sha256': sha, 'nodes': len(doc['nodes']), 'meshes': len(doc['meshes']),
            'materials': len(doc.get('materials', [])), 'images': len(doc.get('images', [])), 'textures': len(doc.get('textures', [])),
            'animations': len(doc.get('animations', [])), 'skins': len(doc.get('skins', [])), 'scenes': len(doc['scenes']),
            'extensionsUsed': doc.get('extensionsUsed', []), 'triangles': 0, 'parts': []}
    for name, node in nodes.items():
        for key in ('translation', 'rotation', 'scale', 'matrix'):
            if key in node:
                ident = {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1],
                         'matrix': [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]}[key]
                if any(abs(a - b) > 1e-9 for a, b in zip(node[key], ident)):
                    fail(f'{name}: non-identity {key}')
        if node.get('children'):
            fail(f'{name}: unexpected children')
        mesh = doc['meshes'][node['mesh']]
        if len(mesh['primitives']) != 1:
            fail(f'{name}: {len(mesh["primitives"])} primitives (expected 1)')
        prim = mesh['primitives'][0]
        if prim.get('mode', 4) != 4:
            fail(f'{name}: primitive mode {prim.get("mode")} is not TRIANGLES')
        extra_attrs = sorted(set(prim['attributes']) - {'POSITION', 'NORMAL'})
        pa, pos = accessor(doc, bin_, prim['attributes']['POSITION'])
        na, nrm = accessor(doc, bin_, prim['attributes']['NORMAL'])
        _, idx = accessor(doc, bin_, prim['indices'])
        idx = [i[0] for i in idx]
        tris = len(idx) // 3
        if len(idx) % 3 or max(idx) >= len(pos):
            fail(f'{name}: bad index buffer')
        lo = [min(p[k] for p in pos) for k in range(3)]
        hi = [max(p[k] for p in pos) for k in range(3)]
        if any(abs(a - b) > 1e-5 for a, b in zip(lo, pa['min'])) or any(abs(a - b) > 1e-5 for a, b in zip(hi, pa['max'])):
            fail(f'{name}: accessor min/max differ from the data')
        nonfinite = sum(1 for p in pos for v in p if not math.isfinite(v)) + sum(1 for p in nrm for v in p if not math.isfinite(v))
        bad_normals = sum(1 for n in nrm if abs(math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) - 1) > 1e-3)
        degenerate, flipped_vs_normal = 0, 0
        for t in range(tris):
            a, b, c = (pos[idx[t * 3 + k]] for k in range(3))
            e1 = [b[k] - a[k] for k in range(3)]
            e2 = [c[k] - a[k] for k in range(3)]
            fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
            area2 = math.sqrt(sum(v * v for v in fn))
            if area2 < 1e-10:
                degenerate += 1
                continue
            # winding must agree with the exported vertex normals (front faces)
            vn = [sum(nrm[idx[t * 3 + k]][j] for k in range(3)) for j in range(3)]
            if sum(fn[j] * vn[j] for j in range(3)) <= 0:
                flipped_vs_normal += 1
        rec = by_part.get(name)
        prec = {'node': name, 'triangles': tris, 'vertices': len(pos), 'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi],
                'degenerate': degenerate, 'windingAgainstNormals': flipped_vs_normal, 'nonUnitNormals': bad_normals, 'nonFinite': nonfinite,
                'extraAttributes': extra_attrs, 'material': doc['materials'][prim['material']]['name'] if 'material' in prim else None}
        if rec:
            if rec['triangles'] != tris:
                fail(f'{name}: {tris} triangles, recipe says {rec["triangles"]}')
            # GLB coordinates must equal game coordinates (recipe bounds are from the generator's game-space vertices)
            if any(abs(a - b) > 2e-4 for a, b in zip(lo, rec['localBounds']['min'])) or any(abs(a - b) > 2e-4 for a, b in zip(hi, rec['localBounds']['max'])):
                fail(f'{name}: GLB bounds differ from game-space recipe bounds')
            prec['bucket'], prec['owner'] = rec['bucket'], rec['owner']
        if degenerate or flipped_vs_normal or bad_normals or nonfinite:
            fail(f'{name}: degenerate={degenerate} winding={flipped_vs_normal} normals={bad_normals} nonfinite={nonfinite}')
        mrec['parts'].append(prec)
        mrec['triangles'] += tris
    if mrec['triangles'] != entry['triangles']:
        fail(f'{mod}: module triangle total differs from recipe')
    if mrec['images'] or mrec['textures'] or mrec['animations'] or mrec['skins']:
        fail(f'{mod}: unexpected images/textures/animations/skins')
    lo = [min(p['min'][k] for p in mrec['parts']) for k in range(3)]
    hi = [max(p['max'][k] for p in mrec['parts']) for k in range(3)]
    mrec['bounds'] = {'min': lo, 'max': hi}
    total_tris += mrec['triangles']
    report['modules'][mod] = mrec

# gate-feature parts must sit inside the source gate solids (silhouette subset); checked on raw GLB bounds
GATE = {'collar': ([24.2, 0.0, -1.9], [27.4, 0.7, 1.9]), 'emitter': ([24.15, 0.22, -1.95], [27.45, 0.47, 1.95]),
        'truss': ([-27, 35, -1.7], [27, 36.6, 1.7]), 'manifold': ([-27, 35, -1.7], [27, 36.6, 1.7]),
        'lamp_arm': ([-0.3, 35.0, -1.7], [0.3, 36.6, -1.5])}
for prec in report['modules']['RS_GateHousing']['parts']:
    part = prec['node'].split('__')[1]
    if prec.get('owner') == 'gate-feature':
        lo, hi = GATE[part]
        if any(prec['min'][k] < lo[k] - 1e-4 for k in range(3)) or any(prec['max'][k] > hi[k] + 1e-4 for k in range(3)):
            fail(f'{prec["node"]}: outside its source gate solid')
        prec['insideSourceSolid'] = {'min': lo, 'max': hi}
# chunk-owned parts with absolute x must not come nearer the lane than the nearest replaced source solid
nearest = min(p['min'][0] for m in report['modules'].values() for p in m['parts'] if p.get('owner') == 'chunk' and p['min'][0] > 20)
report['nearestAbsoluteX'] = nearest
if nearest < 24.15:
    fail(f'chunk-owned absolute-x part reaches x={nearest}')

report['totals'] = {'modules': len(report['modules']), 'parts': sum(len(m['parts']) for m in report['modules'].values()), 'triangles': total_tris,
                    'bytes': sum(m['bytes'] for m in report['modules'].values()),
                    'materialsPerModule': {k: m['materials'] for k, m in report['modules'].items()}}
report['passed'] = not report['failures']
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, indent=1) + '\n')
print(json.dumps({'passed': report['passed'], 'failures': report['failures'][:12], 'totals': report['totals'], 'nearestAbsoluteX': nearest}, indent=1))
