"""Sweep the gameplay motions (and demonstration poses) and test real mesh clearances.

blender --background --factory-startup ASSET.blend --python clearance.py -- --asset silo|fuel --json OUT.json

For every sample: triangle/triangle intersection test (BVHTree.overlap) between each moving
rigid group and every other group, plus the minimum vertex-to-surface distance in both
directions. Motion formulas come from poses.py, which mirrors src/entities/Enemies.js.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poses  # noqa: E402

a = sys.argv[sys.argv.index('--') + 1:]
opt = {a[i].lstrip('-'): a[i + 1] for i in range(0, len(a), 2)}
asset = opt['asset']
OB = {o.name: o for o in bpy.data.objects}
DATA = {}
for o in bpy.data.objects:
    if o.type == 'MESH':
        me = o.data
        DATA[o.name] = ([v.co.copy() for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
REST = {n: OB[n].matrix_basis.copy() for n in DATA}


def tree(name, M):
    vs, ps = DATA[name]
    w = [M @ v for v in vs]
    return BVHTree.FromPolygons(w, ps, epsilon=0.0), w


def pair(na, Ma, nb, Mb, cache={}):
    ta, wa = tree(na, Ma)
    tb, wb = tree(nb, Mb)
    hits = len(ta.overlap(tb))
    d = 1e9
    for v in wa[::1]:
        r = tb.find_nearest(v)
        if r[0] is not None:
            d = min(d, r[3])
    for v in wb[::1]:
        r = ta.find_nearest(v)
        if r[0] is not None:
            d = min(d, r[3])
    return hits, d


def summarize(rows, label):
    worst = min(rows, key=lambda r: r['min_distance'])
    return {'check': label, 'samples': len(rows), 'intersecting_samples': sum(1 for r in rows if r['overlaps']),
            'total_triangle_overlaps': sum(r['overlaps'] for r in rows),
            'min_distance_m': round(worst['min_distance'], 5), 'worst_sample': worst}


out = {'asset': asset, 'method': 'BVHTree.overlap triangle intersections + bidirectional vertex-to-surface nearest distance'}
checks = []
if asset == 'silo':
    rows_h, rows_g, rows_hg = [], [], []
    for i in range(101):
        d = i / 100
        M = poses.silo_matrices(doors=d)
        h, dist = pair('hatch', M['hatch'], 'body', REST['body'])
        rows_h.append({'doors': d, 'overlaps': h, 'min_distance': dist})
        h, dist = pair('glow', M['glow'], 'body', REST['body'])
        rows_g.append({'doors': d, 'overlaps': h, 'min_distance': dist})
        h, dist = pair('hatch', M['hatch'], 'glow', M['glow'])
        rows_hg.append({'doors': d, 'overlaps': h, 'min_distance': dist})
    checks += [summarize(rows_h, 'hatch vs body over doors 0..1 (101 samples)'),
               summarize(rows_g, 'glow vs body over doors 0..1'),
               summarize(rows_hg, 'hatch vs glow over doors 0..1')]
    M = poses.silo_matrices(doors=1.0, detached=True)
    for other, Mo in (('body', REST['body']), ('glow', M['glow'])):
        h, dist = pair('hatch', M['hatch'], other, Mo)
        checks.append(summarize([{'pose': 'detached', 'overlaps': h, 'min_distance': dist}], f'detached hatch vs {other}'))
    # launch point clearance: nothing may occupy (0, 3, 0) or the column above the open hatch
    M = poses.silo_matrices(doors=1.0)
    lp = Vector(poses.SILO_LAUNCH)
    near = {}
    top_in_mouth = -1e9
    for n, Mn in (('hatch', M['hatch']), ('glow', M['glow']), ('body', REST['body'])):
        t, w = tree(n, Mn)
        near[n] = round(t.find_nearest(lp)[3], 4)
        for v in w:
            if math.hypot(v.x, v.y) < 1.7:
                top_in_mouth = max(top_in_mouth, v.z)
    out['launch_point'] = {'gltf': [0.0, 3.0, 0.0], 'nearest_surface_m_by_group_open': near,
                           'highest_geometry_inside_mouth_radius_1p7_open_gltf_y': round(top_in_mouth, 4)}
else:
    static = ['body', 'cap', 'stave-0', 'stave-1', 'stave-2']
    rows = {n: [] for n in static}
    for i in range(45):
        y = -1.1 + 2.2 * i / 44
        for j in range(72):
            rot = math.radians(5 * j)
            M = poses.fuel_matrices(band_y=y, band_rot=rot)
            for n in static:
                h, dist = pair('band', M['band'], n, REST[n])
                rows[n].append({'band_y_offset': round(y, 4), 'band_rot_deg': 5 * j, 'overlaps': h, 'min_distance': dist})
    for n in static:
        checks.append(summarize(rows[n], f'band vs {n}: Y offset -1.1..+1.1 (45) x rotation 0..355 deg (72)'))
    # rupture sweep: staves slide out then tilt (poses.stave_rupture) against body and each other
    rows_s = []
    for i in range(31):
        f = i / 30
        M = poses.fuel_matrices(rupture=f)
        for k in range(3):
            nk = f'stave-{k}'
            h, dist = pair(nk, M[nk], 'body', REST['body'])
            rows_s.append({'peel_fraction': f, 'stave': k, 'against': 'body', 'overlaps': h, 'min_distance': dist})
            h, dist = pair(nk, M[nk], f'stave-{(k + 1) % 3}', M[f'stave-{(k + 1) % 3}'])
            rows_s.append({'peel_fraction': f, 'stave': k, 'against': 'next stave', 'overlaps': h, 'min_distance': dist})
    checks.append(summarize(rows_s, 'stave blow-out sweep (slide 0.62 m then tilt 22 deg, 31 samples) vs body and neighbouring stave'))
    M = poses.fuel_matrices(rupture=1.0)
    names = ['body', 'cap', 'band', 'stave-0', 'stave-1', 'stave-2']
    rr = []
    for ia in range(len(names)):
        for ib in range(ia + 1, len(names)):
            na, nb = names[ia], names[ib]
            Ma = M.get(na, REST[na])
            Mb = M.get(nb, REST[nb])
            h, dist = pair(na, Ma, nb, Mb)
            rr.append({'pair': f'{na}/{nb}', 'overlaps': h, 'min_distance': dist})
    checks.append(summarize(rr, 'ruptured pose: all rigid-group pairs'))
out['checks'] = checks
out['all_clear'] = all(c['total_triangle_overlaps'] == 0 for c in checks)
with open(opt['json'], 'w') as f:
    json.dump(out, f, indent=1)
for c in checks:
    print('CLEAR', c['check'], 'overlaps', c['total_triangle_overlaps'], 'min', c['min_distance_m'])
print('ALL_CLEAR', out['all_clear'])
