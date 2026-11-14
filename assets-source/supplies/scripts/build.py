"""Generate the missile silo and fuel cell (blend + GLB).

blender --background --factory-startup --python build.py -- --out DIR [--asset silo|fuel|both]

Blender space is Z up; glTF export (+Y up) maps Blender (x, y, z) -> glTF (x, z, -y).
Gameplay pivots in glTF space: silo hatch (0, 2.45, 0), silo glow (0, 2.415, 0),
missile launch point (0, 3, 0); fuel band (0, 2.2, 0) moving +/-1.1 in Y.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import TAU, MB, lathe, chamfer_solid, box_pts, xform_pts, tube, torus, bolt, place  # noqa: E402

C8 = math.cos(math.pi / 8)


def fc(d):
    """Octagon flat distance -> corner radius."""
    return d / C8


def texdir(out):
    d = f'{out}\\textures' if '\\' in out else os.path.join(out, 'textures')
    os.makedirs(d, exist_ok=True)
    return d


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out, asset = None, 'both'
    for i, t in enumerate(a):
        if t == '--out':
            out = a[i + 1]
        if t == '--asset':
            asset = a[i + 1]
    return out, asset


# ==========================================================================
# Painted atlases
# ==========================================================================

def paint_region_noise(at, reg, base, amp, rough, metal, rough_amp=0.06, streaks=0, scratches=0, seed_cells=(48, 18, 6)):
    sl = at.region(*reg)
    x0, y0, x1, y1 = reg[1:]
    h, w = y1 - y0, x1 - x0
    n = kit.fbm(h, w, at.rng, cells=seed_cells)
    c = kit.srgb(base)[None, None, :] * (1 + amp * 2 * n[..., None])
    r = np.full((h, w), rough) + rough_amp * 2 * n
    if streaks:
        cols = at.rng.random(w)
        s = np.convolve(cols, np.ones(9) / 9, mode='same')
        mask = np.clip((s - 0.55) * 3, 0, 1)[None, :] * np.linspace(0.3, 1.0, h)[:, None]
        c *= (1 - streaks * mask[..., None])
        r += 0.1 * mask
    for _ in range(scratches):
        yy, xx = at.rng.integers(4, h - 4), at.rng.integers(4, w - 40)
        ln = at.rng.integers(8, 34)
        dy = at.rng.choice([-1, 0, 1])
        for k in range(ln):
            py = min(max(yy + (k * dy) // 6, 0), h - 1)
            c[py, xx + k] = np.clip(c[py, xx + k] * 1.22 + 0.03, 0, 1)
            r[py, xx + k] = max(rough - 0.15, 0.1)
    at.col[sl] = np.clip(c, 0, 1)
    at.mr[sl][..., 1] = np.clip(r, 0.05, 1)
    sub = at.mr[sl]
    sub[..., 1] = np.clip(r, 0.05, 1)
    sub[..., 2] = metal
    at.mr[sl] = sub


def paint_hazard(at, name, reg, c1, c2, rough=0.5, metal=0.3):
    """One diagonal stripe period across the whole region, so lathe tiles repeat seamlessly."""
    sl = at.region(name, *reg)
    x0, y0, x1, y1 = reg
    h, w = y1 - y0, x1 - x0
    period = w
    yy, xx = np.mgrid[0:h, 0:w]
    # 4x supersampled diagonal stripes for clean edges
    acc = np.zeros((h, w))
    for oy in (0.125, 0.375, 0.625, 0.875):
        for ox in (0.125, 0.375, 0.625, 0.875):
            acc += (((xx + ox) + (yy + oy) * (period / h)) % period) < period / 2
    m = acc / 16
    col = kit.srgb(c1)[None, None] * m[..., None] + kit.srgb(c2)[None, None] * (1 - m[..., None])
    n = kit.fbm(h, w, at.rng, cells=(32, 12, 4))
    col *= (1 + 0.08 * n[..., None])
    at.col[sl] = np.clip(col, 0, 1)
    sub = at.mr[sl]
    sub[..., 1] = rough + 0.08 * n
    sub[..., 2] = metal
    at.mr[sl] = sub


def silo_atlas():
    at = kit.Atlas('SILO', 1024, 31337)
    sw = [
        ('armor', '#995c48', .48, .42), ('armor_edge', '#c48e70', .62, .30),
        ('slate', '#526579', .56, .38), ('slate_edge', '#a2b6c8', .78, .24),
        ('dark', '#3a4a5e', .50, .46), ('dark_edge', '#7a8ea4', .72, .28),
        ('cavity', '#121519', .30, .78), ('wall', '#252b34', .50, .55),
        ('black', '#1a1612', .30, .60), ('bolt', '#b8955e', .80, .30),
        ('housing', '#262b32', .55, .45), ('lens', '#5a1418', .10, .20),
        ('floor', '#2c323b', .45, .60), ('cable', '#141517', .0, .80),
        ('hazard_o', '#e0662a', .30, .50), ('edge', '#c48e70', .62, .30),
    ]
    for i, (n, c, m, r) in enumerate(sw):
        at.swatch(n, i, c, m, r)
    paint_region_noise(at, ('armor', 0, 128, 512, 640), '#995c48', 0.07, .42, .48, scratches=160, streaks=0.10)
    paint_region_noise(at, ('metal', 512, 128, 1024, 640), '#4c5d70', 0.06, .47, .56, scratches=90)
    paint_hazard(at, 'hazard', (0, 640, 256, 768), '#e0662a', '#1a1612')
    paint_region_noise(at, ('darkr', 0, 768, 512, 1024), '#3a4a5e', 0.07, .46, .50, scratches=60, streaks=0.12)
    paint_region_noise(at, ('wall', 512, 768, 1024, 1024), '#252b34', 0.10, .55, .50, streaks=0.25, seed_cells=(64, 20, 5))
    return at


def stencil_rects():
    """Block stencil glyphs on a 5 x 7 grid (x0, y0, x1, y1), with bridges."""
    return {
        'F': [(0, 0, 1.55, 7), (1.85, 5.45, 5, 7), (1.85, 2.85, 4.3, 4.4)],
        'U': [(0, 1.85, 1.55, 7), (3.45, 1.85, 5, 7), (0, 0, 5, 1.55)],
        'E': [(0, 0, 1.55, 7), (1.85, 5.45, 5, 7), (1.85, 2.85, 4.5, 4.4), (1.85, 0, 5, 1.55)],
        'L': [(0, 1.85, 1.55, 7), (0, 0, 5, 1.55)],
    }


def fuel_atlas():
    at = kit.Atlas('FUEL', 1024, 4242)
    sw = [
        ('yellow', '#e6b21e', .22, .50), ('yellow_edge', '#f7da78', .55, .30),
        ('dark', '#2f3843', .55, .42), ('dark_edge', '#7d8b99', .75, .28),
        ('slate', '#526579', .56, .38), ('slate_edge', '#a2b6c8', .78, .24),
        ('black', '#1a1612', .20, .60), ('white', '#efece2', .10, .55),
        ('steel', '#8c98a4', .85, .28), ('scorch', '#1f1813', .30, .82),
        ('cavity', '#121418', .30, .78), ('bolt', '#9aa6b2', .85, .30),
        ('gauge', '#e8e4d8', .05, .30), ('red', '#b3271e', .25, .45),
        ('brass', '#b8955e', .80, .30), ('edge', '#f7da78', .55, .30),
    ]
    for i, (n, c, m, r) in enumerate(sw):
        at.swatch(n, i, c, m, r)
    # --- stave livery 768 x 768 px covering 2.566 m (arc) x 2.56 m (height)
    reg = ('label', 0, 128, 768, 896)
    paint_region_noise(at, reg, '#e6b21e', 0.05, .50, .22, streaks=0.16, scratches=70, seed_cells=(64, 20, 6))
    x0, y0, x1, y1 = reg[1:]
    W, H = 2.566, 2.56
    SS = 4
    hpx, wpx = (y1 - y0), (x1 - x0)
    black = np.zeros((hpx * SS, wpx * SS), dtype=np.float32)
    white = np.zeros_like(black)

    def rect(mask, ax, ay, bx, by):
        ix0, ix1 = int(ax / W * wpx * SS), int(bx / W * wpx * SS)
        iy0, iy1 = int(ay / H * hpx * SS), int(by / H * hpx * SS)
        mask[max(iy0, 0):max(iy1, 0), max(ix0, 0):max(ix1, 0)] = 1

    # livery bands
    rect(black, 0, 0.00, W, 0.06)
    rect(white, 0, 0.10, W, 0.27)
    rect(black, 0, 0.30, W, 0.33)
    rect(white, 0, 2.36, W, 2.47)
    rect(black, 0, 2.50, W, 2.56)
    rect(black, 0, 2.31, W, 2.33)
    # hazard ribbon under the stencil
    yy0, yy1 = 1.42, 1.53
    iy0, iy1 = int(yy0 / H * hpx * SS), int(yy1 / H * hpx * SS)
    gy, gx = np.mgrid[iy0:iy1, 0:wpx * SS]
    per = int(0.22 / W * wpx * SS)
    black[iy0:iy1] = np.maximum(black[iy0:iy1], (((gx + gy) % per) < per / 2).astype(np.float32))
    rect(black, 0, 1.39, W, 1.41)
    rect(black, 0, 1.54, W, 1.56)
    # FUEL stencil
    glyphs = stencil_rects()
    lw, lh, gap = 0.46, 0.68, 0.075
    total = 4 * lw + 3 * gap
    sx = (W - total) / 2
    base = 1.60
    for k, ch in enumerate('FUEL'):
        ox = sx + k * (lw + gap)
        for (a, b, c, d) in glyphs[ch]:
            rect(black, ox + a / 5 * lw, base + b / 7 * lh, ox + c / 5 * lw, base + d / 7 * lh)
    # data plate with dummy text lines
    rect(black, 1.80, 0.45, 2.30, 0.78)
    for i in range(4):
        rect(white, 1.85, 0.50 + i * 0.07, 2.25 - (i % 2) * 0.12, 0.53 + i * 0.07)
    # seam darkening at stave edges
    def down(m):
        return m.reshape(hpx, SS, wpx, SS).mean(axis=(1, 3))
    bm, wm = down(black), down(white)
    sl = (slice(y0, y1), slice(x0, x1))
    col = at.col[sl]
    col = col * (1 - bm[..., None]) + kit.srgb('#1a1612')[None, None] * bm[..., None]
    col = col * (1 - wm[..., None]) + kit.srgb('#efece2')[None, None] * wm[..., None] * (col / np.maximum(kit.srgb('#e6b21e')[None, None], 1e-3)).clip(0.85, 1.05)
    edge = np.clip(1 - np.minimum(np.arange(wpx), wpx - 1 - np.arange(wpx)) / 10.0, 0, 1) * 0.35
    col *= (1 - edge[None, :, None])
    at.col[sl] = np.clip(col, 0, 1)
    sub = at.mr[sl]
    sub[..., 1] = sub[..., 1] * (1 - bm) + 0.62 * bm
    sub[..., 2] = sub[..., 2] * (1 - bm) + 0.18 * bm
    at.mr[sl] = sub
    paint_region_noise(at, ('yellow', 768, 128, 1024, 512), '#e6b21e', 0.05, .48, .22, streaks=0.12, scratches=30)
    paint_region_noise(at, ('darkr', 768, 512, 1024, 896), '#2f3843', 0.07, .42, .55, scratches=40)
    paint_hazard(at, 'hazard', (0, 896, 256, 1024), '#e6b21e', '#1a1612', rough=0.5, metal=0.2)
    return at


# ==========================================================================
# Missile silo
# ==========================================================================

def silo_vent(mb, plate_center, n, u, t):
    """Recessed louvred exhaust vent built proud of a sloped armour plate."""
    M = Matrix.Identity(4)
    M.col[0][:3] = t
    M.col[1][:3] = u
    M.col[2][:3] = n
    M.col[3][:3] = plate_center
    W, Hh = 0.46, 0.36
    chamfer_solid(mb, xform_pts(box_pts(2 * W - 0.06, 2 * Hh - 0.06, 0.03, (0, 0, 0.0)), M), 0.0, ('sw', 'cavity'), ('sw', 'cavity'))
    for (sx, sy, cx, cy) in ((2 * W, 0.08, 0, Hh - 0.04), (2 * W, 0.08, 0, -Hh + 0.04),
                             (0.08, 2 * Hh, W - 0.04, 0), (0.08, 2 * Hh, -W + 0.04, 0)):
        chamfer_solid(mb, xform_pts(box_pts(sx, sy, 0.09, (cx, cy, 0.03)), M), 0.018, ('sw', 'dark'), ('sw', 'dark_edge'))
    for k in range(4):
        cy = -0.21 + k * 0.14
        L = Matrix.Translation((0, cy, 0.03)) @ Matrix.Rotation(math.radians(40), 4, 'X')
        chamfer_solid(mb, xform_pts(box_pts(2 * W - 0.12, 0.12, 0.022), M @ L), 0.006, ('sw', 'dark'), ('sw', 'dark_edge'))


def silo_buttress(mb, th):
    """Armoured clamp buttress on a diagonal plate, capped over the collar with a beacon."""
    R = Matrix.Rotation(th, 4, 'Z')
    low = [(r, t, z) for z, (ri, ro) in ((0.27, (2.20, 2.64)), (2.20, (1.96, 2.36))) for r in (ri, ro) for t in (-0.25, 0.25)]
    chamfer_solid(mb, xform_pts(low, R), 0.04, ('plan', 'armor', 2.0), ('sw', 'armor_edge'))
    cap = [(r, t, z) for z in (2.16, 2.64) for r in (1.95, 2.40) for t in (-0.31, 0.31)]
    chamfer_solid(mb, xform_pts(cap, R), 0.05, ('plan', 'darkr', 1.6), ('sw', 'dark_edge'),
                  main_by_normal=lambda n: ('sw', 'hazard_o') if n.z > 0.9 else None)
    # slate strap and bolts across the buttress face
    up = Vector((2.36 - 2.64, 0, 2.20 - 0.27)).normalized()
    nrm = Vector((up.z, 0, -up.x))
    for zc in (0.85, 1.65):
        r_face = 2.64 + (2.36 - 2.64) * (zc - 0.27) / (2.20 - 0.27)
        M = R @ kit.frame_matrix((r_face, 0, zc), (0, 1, 0), nrm)
        chamfer_solid(mb, xform_pts(box_pts(0.58, 0.14, 0.05, (0, 0, 0.0)), M), 0.015, ('sw', 'slate'), ('sw', 'slate_edge'))
        for tx in (-0.19, 0.19):
            bolt(mb, M @ Matrix.Translation((tx, 0, 0.025)), r=0.03, h=0.025)
    # beacon housing + lens on the cap
    hm = MB(mb.atlas)
    lathe(hm, [(0.085, 0.0), (0.085, 0.025), (0.065, 0.035), (0, 0.035)], [('sw', 'housing'), ('sw', 'dark_edge'), ('sw', 'housing')], 12)
    lathe(hm, [(0.05, 0.035), (0.05, 0.045), (0.025, 0.065), (0, 0.068)], [('sw', 'lens')] * 3, 12, mat=1)
    for tx in (-0.17, 0.17):
        bolt(hm, Matrix.Translation((0.12, tx, 0.0)), r=0.03, h=0.025)
    mb.merge(hm.transformed(R @ Matrix.Translation((2.22, 0, 2.64))))


def build_silo(out):
    kit.reset_scene()
    at = silo_atlas()
    imgs = at.images(texdir(out))
    hull = kit.hull_material('SILO_Hull', *imgs)
    glow = kit.glow_material('SILO_Glow', '#ff3d55', 2.4)
    mats = [hull, glow]

    root = kit.make_empty('silo')
    root['kx_role'] = 'missile silo'
    root['kx_hatch_pivot_gltf'] = [0.0, 2.45, 0.0]
    root['kx_glow_pivot_gltf'] = [0.0, 2.415, 0.0]
    root['kx_launch_point_gltf'] = [0.0, 3.0, 0.0]

    body = MB(at)
    # --- stepped octagonal plinth (flats on the X and Z axes)
    a8 = math.pi / 8
    lathe(body, [(fc(2.60), 0.0), (fc(2.60), 0.10), (fc(2.55), 0.15), (fc(2.48), 0.15), (fc(2.48), 0.24),
                 (fc(2.44), 0.28), (fc(2.10), 0.28)],
          [('tile', 'darkr', 1, 0.40, 0.45), ('sw', 'dark_edge'), ('sw', 'dark'), ('tile', 'darkr', 1, 0.5, 0.54),
           ('sw', 'dark_edge'), ('sw', 'dark')], 8, a0=a8, a1=a8 + TAU)
    # --- dark core behind the armour plates
    lathe(body, [(fc(2.26), 0.27), (fc(1.84), 2.12)], [('sw', 'dark')], 8, a0=a8, a1=a8 + TAU)

    # --- eight sloped armour plates between slate frame ribs
    d0, z0, d1, z1 = 2.42, 0.30, 1.94, 2.10
    up = Vector((d1 - d0, 0, z1 - z0)).normalized()
    nrm = Vector((up.z, 0, -up.x))
    thick = 0.16
    plate_frames = []
    for k in range(8):
        th = k * math.pi / 4
        R = Matrix.Rotation(th, 4, 'Z')
        w0 = d0 * math.tan(a8) - 0.10
        w1 = d1 * math.tan(a8) - 0.10
        outer = [(d0, -w0, z0), (d0, w0, z0), (d1, -w1, z1), (d1, w1, z1)]
        inner = [tuple(Vector(p) - nrm * thick) for p in outer]
        chamfer_solid(body, xform_pts(outer + inner, R), 0.035, ('plan', 'armor', 2.4), ('sw', 'armor_edge'))
        mid = Vector(((d0 + d1) / 2, 0, (z0 + z1) / 2))
        plate_frames.append((R, mid))
    # ribs at the octagon corners
    for k in range(8):
        ps = k * math.pi / 4 + a8
        R = Matrix.Rotation(ps, 4, 'Z')
        pts = []
        for z in (0.27, 2.12):
            rc = fc(d0 + (d1 - d0) * (z - z0) / (z1 - z0))
            for dr in (0.05, -0.16):
                for t in (-0.08, 0.08):
                    pts.append((rc + dr, t, z))
        chamfer_solid(body, xform_pts(pts, R), 0.025, ('sw', 'slate'), ('sw', 'slate_edge'))

    # plate-mounted equipment: louvred vents on diagonals, appliques and a control box on cardinals
    for k in range(8):
        R, mid = plate_frames[k]
        n = (R @ nrm.to_4d()).to_3d() if False else (R.to_3x3() @ nrm)
        u = R.to_3x3() @ up
        t = R.to_3x3() @ Vector((0, 1, 0))
        c = R @ mid
        if k % 2 == 1:
            silo_buttress(body, k * math.pi / 4)
        elif k != 0:
            silo_vent(body, c + u * 0.06, n, u, t)
        else:
            # control box on +X
            Mb = Matrix.Translation((0, 0, 0))
            chamfer_solid(body, box_pts(0.46, 0.74, 0.78, (2.33, 0, 0.67)), 0.03, ('plan', 'darkr', 1.5), ('sw', 'dark_edge'))
            chamfer_solid(body, box_pts(0.03, 0.58, 0.60, (2.57, 0, 0.66)), 0.012, ('sw', 'slate'), ('sw', 'slate_edge'))
            chamfer_solid(body, box_pts(0.05, 0.05, 0.20, (2.595, 0.20, 0.66)), 0.012, ('sw', 'bolt'), ('sw', 'bolt'))
            chamfer_solid(body, box_pts(0.10, 0.80, 0.06, (2.30, 0, 1.08)), 0.02, ('sw', 'slate'), ('sw', 'slate_edge'))
            lathe(body, [(0.055, 0.0), (0.055, 0.03), (0, 0.03)], [('sw', 'housing'), ('sw', 'housing')], 10)
            body_lamp = MB(at)
            lathe(body_lamp, [(0.05, 0.0), (0.05, 0.02), (0.035, 0.045), (0, 0.05)], [('sw', 'lens')] * 3, 10, mat=1)
            lamp_m = Matrix.Translation((2.585, -0.20, 0.88)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            body.merge(body_lamp.transformed(lamp_m))
            # conduit from the box into the plinth
            tube(body, kit.fillet_path([(2.30, -0.37, 0.80), (2.30, -0.55, 0.80), (2.30, -0.55, 0.20)], 0.10), 0.05, 8, ('sw', 'cable'))
            del Mb

    # plinth anchor bolts
    for k in range(8):
        th = k * math.pi / 4
        for off in (-0.55, 0.55):
            p = Matrix.Rotation(th, 4, 'Z') @ Vector((2.535, off, 0.15))
            bolt(body, Matrix.Translation(p) @ Matrix.Rotation(th, 4, 'Z'), r=0.04, h=0.035)

    # --- round armoured collar, hazard ring, hatch seat and the well itself (one lathe)
    collar = [(1.95, 2.08), (2.17, 2.08), (2.22, 2.13), (2.22, 2.43), (2.18, 2.48), (2.12, 2.49),
              (1.88, 2.52), (1.82, 2.48), (1.79, 2.40), (1.71, 2.38), (1.71, 0.55), (0.0, 0.55)]
    styles = [('sw', 'dark'), ('sw', 'armor_edge'), ('tile', 'armor', 6, 0.35, 0.62), ('sw', 'armor_edge'),
              ('sw', 'black'), ('tile', 'hazard', 3, 0.30, 0.70), ('sw', 'armor_edge'),
              ('sw', 'dark'), ('sw', 'slate'), ('tile', 'wall', 4, 0.0, 1.0), ('sw', 'cavity')]
    lathe(body, collar, styles, 48)
    # --- well interior: guide rails, stiffening rings, ejector ring and ram plate
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        R = Matrix.Rotation(a, 4, 'Z')
        chamfer_solid(body, xform_pts(box_pts(0.14, 0.14, 1.67, (1.65, 0, 1.385)), R), 0.02, ('sw', 'slate'), ('sw', 'slate_edge'))
    for z in (1.05, 1.55, 2.05):
        lathe(body, [(1.71, z - 0.04), (1.645, z - 0.04), (1.645, z + 0.04), (1.71, z + 0.04)],
              [('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark')], 48)
    lathe(body, [(1.30, 0.55), (1.30, 0.62), (1.26, 0.66), (1.02, 0.66), (0.98, 0.62), (0.98, 0.55)],
          [('sw', 'slate'), ('sw', 'slate_edge'), ('sw', 'slate'), ('sw', 'slate_edge'), ('sw', 'slate')], 48)
    lathe(body, [(0.62, 0.55), (0.62, 0.70), (0.58, 0.74), (0.0, 0.74)], [('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'floor')], 32)
    for k in range(6):
        a = TAU * k / 6
        bolt(body, Matrix.Translation((0.45 * math.cos(a), 0.45 * math.sin(a), 0.74)), r=0.04, h=0.03)

    ob_body = body.to_object('body', mats, parent=root)

    # ======================= hatch (pivot 2.45) ==========================
    hatch = MB(at)
    lathe(hatch, [(0.0, -0.03), (1.66, -0.03), (1.66, 0.0), (0.30, 0.0)], [('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark')], 48)
    seam = 0.022
    for k in range(6):
        b = TAU * k / 6 + TAU / 12
        pts2 = []
        for r_ in (0.38,):
            for s in (-1, 1):
                d = math.asin(seam / r_)
                pts2.append((r_, b + s * (TAU / 12 - d)))
        ro = 1.72
        dro = math.asin(seam / ro)
        for i in range(7):
            pts2.append((ro, b - (TAU / 12 - dro) + 2 * (TAU / 12 - dro) * i / 6))
        poly = [(r_ * math.cos(a), r_ * math.sin(a)) for r_, a in pts2]
        prism = [(x, y, z) for (x, y) in poly for z in (0.0, 0.095)]
        chamfer_solid(hatch, prism, 0.028, ('plan', 'metal', 2.2), ('sw', 'slate_edge'),
                      main_by_normal=lambda n: ('sw', 'dark') if n.z < -0.5 else None)
        R = Matrix.Rotation(b, 4, 'Z')
        chamfer_solid(hatch, xform_pts(box_pts(1.00, 0.10, 0.05, (0.98, 0, 0.115)), R), 0.016, ('sw', 'dark'), ('sw', 'dark_edge'))
        for rr in (1.56,):
            for s in (-1, 1):
                a = b + s * 0.16
                bolt(hatch, Matrix.Translation((rr * math.cos(a), rr * math.sin(a), 0.093)), r=0.032, h=0.025)
    lathe(hatch, [(0.40, -0.01), (0.40, 0.13), (0.36, 0.17), (0.21, 0.17), (0.18, 0.19), (0.0, 0.19)],
          [('sw', 'armor'), ('sw', 'armor_edge'), ('sw', 'armor'), ('sw', 'armor_edge'), ('sw', 'dark')], 32)
    for k in range(6):
        a = TAU * k / 6
        bolt(hatch, Matrix.Translation((0.29 * math.cos(a), 0.29 * math.sin(a), 0.17)), r=0.028, h=0.022)
    ob_hatch = hatch.to_object('hatch', mats, parent=root, location=(0, 0, 2.45))

    # ======================= glow (pivot 2.415) ===========================
    g = MB(at)
    for (ri, ro, zb, zt) in ((1.50, 1.62, -0.14, -0.08), (1.28, 1.40, -0.52, -0.46), (1.00, 1.12, -0.97, -0.91)):
        lathe(g, [(ri, zb), (ro, zb), (ro, zt), (ri, zt), (ri, zb)], [('sw', 'lens')] * 4, 48, mat=1)
    lathe(g, [(0.0, -1.47), (0.55, -1.47), (0.55, -1.42), (0.30, -1.38), (0.0, -1.37)], [('sw', 'lens')] * 4, 32, mat=1)
    ob_glow = g.to_object('glow', mats, parent=root, location=(0, 0, 2.415))
    # glow carries only the glow material slot
    lp = kit.make_empty('launch-point', parent=root, location=(0, 0, 3.0))
    lp['kx_note'] = 'Existing gameplay missile spawn: entity position + (0, 3, 0) in glTF space.'
    return root


# ==========================================================================
# Fuel cell
# ==========================================================================

STAVE_CENTERS = [TAU / 3 + k * TAU / 3 for k in range(3)]  # 120 deg faces the game cameras
STAVE_HALF = math.radians(58.8)
HINGE_R, HINGE_Z, STAVE_TOP = 1.25, 0.93, 3.49


def build_fuel(out):
    kit.reset_scene()
    at = fuel_atlas()
    imgs = at.images(texdir(out))
    hull = kit.hull_material('FUEL_Hull', *imgs)
    band_mat = kit.glow_material('FUEL_Band', '#ff9a22', 2.2)
    mats = [hull, band_mat]

    root = kit.make_empty('fuel')
    root['kx_role'] = 'fuel cell'
    root['kx_band_pivot_gltf'] = [0.0, 2.2, 0.0]
    root['kx_band_travel_y'] = [-1.1, 1.1]

    body = MB(at)
    # --- foot ring, skirt and lower hazard collar
    lathe(body, [(1.70, 0.0), (1.70, 0.08), (1.66, 0.12), (1.56, 0.12), (1.54, 0.14), (1.48, 0.48), (1.44, 0.52),
                 (1.40, 0.52), (1.40, 0.84), (1.36, 0.88), (1.20, 0.90), (1.08, 0.90)],
          [('tile', 'darkr', 4, 0.40, 0.45), ('sw', 'dark_edge'), ('sw', 'dark'), ('sw', 'dark_edge'),
           ('tile', 'darkr', 4, 0.2, 0.6), ('sw', 'dark_edge'), ('sw', 'dark'), ('tile', 'hazard', 2, 0.06, 0.94),
           ('sw', 'yellow_edge'), ('sw', 'dark'), ('sw', 'dark')], 48)
    # inner pressure core (visible only once the staves rupture)
    lathe(body, [(1.10, 0.89), (1.10, 3.50), (0.0, 3.50)], [('sw', 'scorch'), ('sw', 'scorch')], 48)
    # amber leak seams on the core, centred behind each stave
    for phi in STAVE_CENTERS:
        R = Matrix.Rotation(phi, 4, 'Z')
        chamfer_solid(body, xform_pts(box_pts(0.06, 0.07, 1.90, (1.095, 0, 2.25)), R), 0.012, ('sw', 'black'), ('sw', 'black'), mat=1)
        for (zz, ang) in ((1.75, 0.5), (2.65, -0.5)):
            L = R @ Matrix.Translation((1.095, 0.13 * (1 if ang > 0 else -1), zz)) @ Matrix.Rotation(ang, 4, 'X')
            chamfer_solid(body, xform_pts(box_pts(0.06, 0.05, 0.36), L), 0.01, ('sw', 'black'), ('sw', 'black'), mat=1)
    # anchor feet
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        R = Matrix.Rotation(a, 4, 'Z')
        chamfer_solid(body, xform_pts(box_pts(0.32, 0.26, 0.20, (1.53, 0, 0.10)), R), 0.03, ('sw', 'dark'), ('sw', 'dark_edge'))
        bolt(body, R @ Matrix.Translation((1.58, 0, 0.20)), r=0.05, h=0.04, style=('sw', 'bolt'))
    # manifold ring and three riser pipes standing off at the stave seams
    torus(body, 1.61, 0.06, 48, 10, ('sw', 'dark'), matrix=Matrix.Translation((0, 0, 0.21)))
    PIPE_R = 1.61
    for phi in STAVE_CENTERS:
        s = phi + TAU / 6
        cs, sn = math.cos(s), math.sin(s)
        path = kit.fillet_path([(PIPE_R * cs, PIPE_R * sn, 0.21), (PIPE_R * cs, PIPE_R * sn, 3.62),
                                (1.34 * cs, 1.34 * sn, 3.62)], 0.13, steps=5)
        tube(body, path, 0.065, 10, ('sw', 'dark'), cap_start=False)
        for zz in (0.62, 3.50):
            tube(body, [(PIPE_R * cs, PIPE_R * sn, zz), (PIPE_R * cs, PIPE_R * sn, zz + 0.05)], 0.092, 10, ('sw', 'dark_edge'))
        R = Matrix.Rotation(s, 4, 'Z')
        chamfer_solid(body, xform_pts(box_pts(0.24, 0.10, 0.10, (1.47, 0, 0.70)), R), 0.015, ('sw', 'dark'), ('sw', 'dark_edge'))
    # pressure gauge on one riser (outside, facing away from the drum)
    s = STAVE_CENTERS[2] + TAU / 6
    G = Matrix.Rotation(s, 4, 'Z') @ Matrix.Translation((PIPE_R + 0.055, 0, 3.05)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    gm = MB(at)
    lathe(gm, [(0.11, 0.0), (0.11, 0.035), (0.095, 0.045), (0.0, 0.045)], [('sw', 'steel'), ('sw', 'steel'), ('sw', 'gauge')], 16)
    chamfer_solid(gm, box_pts(0.012, 0.075, 0.006, (0.0, 0.03, 0.048)), 0.0, ('sw', 'red'), ('sw', 'red'))
    body.merge(gm.transformed(G))
    # front drain valve on the manifold
    vy = STAVE_CENTERS[0]
    V = Matrix.Rotation(vy, 4, 'Z')
    chamfer_solid(body, xform_pts(box_pts(0.16, 0.22, 0.20, (1.61, 0, 0.24)), V), 0.025, ('sw', 'dark'), ('sw', 'dark_edge'))
    chamfer_solid(body, xform_pts(box_pts(0.05, 0.05, 0.12, (1.61, 0, 0.39)), V), 0.01, ('sw', 'steel'), ('sw', 'steel'))
    torus(body, 0.11, 0.022, 20, 6, ('sw', 'red'), matrix=V @ Matrix.Translation((1.61, 0, 0.45)))
    for k in range(3):
        a = TAU * k / 3
        chamfer_solid(body, xform_pts(box_pts(0.11, 0.018, 0.018, (0.055 * math.cos(a), 0.055 * math.sin(a), 0)),
                                      V @ Matrix.Translation((1.61, 0, 0.45)) @ Matrix.Rotation(a, 4, 'Z')), 0.0, ('sw', 'red'), ('sw', 'red'))
    # upper collar (pipes terminate into it) with radial bolts
    lathe(body, [(1.12, 3.50), (1.38, 3.50), (1.42, 3.54), (1.42, 3.72), (1.38, 3.76), (1.30, 3.76), (1.08, 3.76)],
          [('sw', 'dark'), ('sw', 'dark_edge'), ('tile', 'darkr', 4, 0.3, 0.5), ('sw', 'dark_edge'), ('sw', 'dark'), ('sw', 'dark')], 48)
    for k in range(18):
        a = TAU * k / 18 + TAU / 36
        bolt(body, Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((1.415, 0, 3.63)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'),
             r=0.035, h=0.03, style=('sw', 'bolt'))
    body.to_object('body', mats, parent=root)

    # ======================= staves (rupture groups) =======================
    for k, phi in enumerate(STAVE_CENTERS):
        sm = MB(at)
        lathe(sm, [(HINGE_R, HINGE_Z), (HINGE_R, STAVE_TOP), (1.17, STAVE_TOP), (1.17, HINGE_Z), (HINGE_R, HINGE_Z)],
              [('arc', 'label', 0.0, 1.0), ('sw', 'yellow_edge'), ('sw', 'scorch'), ('sw', 'dark')], 16,
              a0=phi - STAVE_HALF, a1=phi + STAVE_HALF, caps=True, cap_style=('sw', 'yellow_edge'))
        hinge = Matrix.Translation((HINGE_R * math.cos(phi), HINGE_R * math.sin(phi), HINGE_Z)) @ Matrix.Rotation(phi, 4, 'Z')
        ob = sm.transformed(hinge.inverted()).to_object(f'stave-{k}', mats, parent=root)
        ob.matrix_basis = hinge
        ob['kx_rupture_axis'] = 'local Y (tangential hinge at the stave foot)'

    # ======================= cap (detachable) ==============================
    cap = MB(at)
    prof = [(1.10, 0.0), (1.34, 0.0), (1.36, 0.03), (1.36, 0.11), (1.32, 0.15), (1.27, 0.16)]
    sty = [('sw', 'dark'), ('sw', 'dark_edge'), ('tile', 'hazard', 2, 0.38, 0.62), ('sw', 'yellow_edge'), ('sw', 'yellow')]
    nd = 7
    for i in range(1, nd + 1):
        ps = math.radians(70) * i / nd
        prof.append((1.27 * math.cos(ps), 0.16 + 0.50 * math.sin(ps)))
        sty.append(('tile', 'yellow', 6, (i - 1) / nd, i / nd))
    prof += [(0.34, prof[-1][1]), (0.30, 0.67), (0.30, 0.86), (0.37, 0.86), (0.37, 0.92), (0.34, 0.95), (0.0, 0.95)]
    sty += [('sw', 'yellow_edge'), ('sw', 'dark_edge'), ('sw', 'dark'), ('sw', 'dark'), ('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark')]
    lathe(cap, prof, sty, 48)
    for k in range(16):
        a = TAU * k / 16
        bolt(cap, Matrix.Translation((1.30 * math.cos(a), 1.30 * math.sin(a), 0.155)), r=0.035, h=0.03, style=('sw', 'bolt'))
    # handwheel valve on top
    lathe(cap, [(0.06, 0.95), (0.06, 1.00), (0.09, 1.00), (0.09, 1.08), (0.06, 1.11), (0.0, 1.11)],
          [('sw', 'steel'), ('sw', 'steel'), ('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark')], 12)
    torus(cap, 0.33, 0.042, 32, 8, ('sw', 'red'), matrix=Matrix.Translation((0, 0, 1.04)))
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        chamfer_solid(cap, xform_pts(box_pts(0.26, 0.04, 0.035, (0.21, 0, 1.04)), Matrix.Rotation(a, 4, 'Z')), 0.0,
                      ('sw', 'red'), ('sw', 'red'))
    # breather gooseneck and a lifting lug pair
    ga = STAVE_CENTERS[1]
    gx, gy = math.cos(ga), math.sin(ga)
    tube(cap, kit.fillet_path([(0.80 * gx, 0.80 * gy, 0.35), (0.80 * gx, 0.80 * gy, 0.80), (1.02 * gx, 1.02 * gy, 0.80),
                               (1.02 * gx, 1.02 * gy, 0.66)], 0.08, steps=5), 0.05, 10, ('sw', 'dark'))
    for a in (STAVE_CENTERS[0] + 0.0, STAVE_CENTERS[0] + math.pi):
        R = Matrix.Rotation(a, 4, 'Z')
        chamfer_solid(cap, xform_pts(box_pts(0.18, 0.06, 0.20, (0.92, 0, 0.47)), R), 0.015, ('sw', 'dark'), ('sw', 'dark_edge'))
    cap.to_object('cap', mats, parent=root, location=(0, 0, 3.76))

    # ======================= amber band (pivot 2.2) =========================
    band = MB(at)
    prof = [(1.31, -0.13), (1.44, -0.13), (1.46, -0.11), (1.46, -0.08), (1.415, -0.08), (1.415, 0.08),
            (1.46, 0.08), (1.46, 0.11), (1.44, 0.13), (1.31, 0.13), (1.31, -0.13)]
    sty = [('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark'), ('sw', 'dark'), ('sw', 'yellow'), ('sw', 'dark'),
           ('sw', 'dark'), ('sw', 'dark_edge'), ('sw', 'dark'), ('sw', 'dark')]
    lathe(band, prof, sty, 48, mat=[0, 0, 0, 0, 1, 0, 0, 0, 0, 0])
    for k in range(6):
        a = TAU * k / 6
        chamfer_solid(band, xform_pts(box_pts(0.045, 0.08, 0.17, (1.432, 0, 0)), Matrix.Rotation(a, 4, 'Z')), 0.012,
                      ('sw', 'dark'), ('sw', 'dark_edge'))
    band.to_object('band', mats, parent=root, location=(0, 0, 2.2))
    return root


def finish(root, out, name):
    # Drop unused material slots so primitives stay batched per material.
    for ob in root.children:
        if ob.type != 'MESH':
            continue
        used = sorted({p.material_index for p in ob.data.polygons})
        if used != list(range(len(ob.data.materials))):
            remap = {old: new for new, old in enumerate(used)}
            keep = [ob.data.materials[i] for i in used]
            idx = [remap[p.material_index] for p in ob.data.polygons]
            ob.data.materials.clear()
            for m in keep:
                ob.data.materials.append(m)
            ob.data.polygons.foreach_set('material_index', idx)
    bpy.context.view_layer.update()
    blend = os.path.join(out, f'{name}.blend') if '\\' not in out else f'{out}\\{name}.blend'
    glb = os.path.join(out, f'{name}.glb') if '\\' not in out else f'{out}\\{name}.glb'
    kit.export_glb(glb)
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print('BUILT', name, blend, glb)


def main():
    out, asset = args()
    assert out, 'pass -- --out DIR'
    if asset in ('silo', 'both'):
        finish(build_silo(out), out, 'silo')
    if asset in ('fuel', 'both'):
        finish(build_fuel(out), out, 'fuel')


main()
