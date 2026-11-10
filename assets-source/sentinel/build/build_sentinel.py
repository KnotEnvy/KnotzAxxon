"""Build the KnotzAxxon Iron Sentinel boss (contest entry).

Run (from WSL):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w contest-entry/build/build_sentinel.py)" -- "$(wslpath -w contest-entry)"

Writes sentinel.blend and sentinel.glb into the given output directory.
Game space: X across, Y up, boss front (face, reactor, guns) toward -Z.
Node layout mirrors src/entities/Boss.js so every runtime pivot is preserved.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import kx_common as K  # noqa: E402

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = K.T
TAU = K.TAU

K.reset_scene()

# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
RUST, BURNT, PALE, DRUST = range(4)
armor_pal = K.Palette('SN_ArmorPalette', [0x995c48, 0x74402f, 0xc0805f, 0x55301f])
DARK, FRAME, DEEP, STEEL = range(4)
frame_pal = K.Palette('SN_FramePalette', [0x313f50, 0x546b88, 0x1e2632, 0x8296ab])
hazard_img = K.hazard_image('SN_Hazard', 128, 4)

M = {
    'armor': K.material('SN_Armor', metallic=.48, roughness=.42, base_img=armor_pal.image),
    'frame': K.material('SN_Frame', metallic=.5, roughness=.46, base_img=frame_pal.image),
    'hazard': K.material('SN_Hazard', metallic=.4, roughness=.65, base_img=hazard_img,
                         emission_img=hazard_img, emission=(1, 1, 1), strength=.45),
    'metal': K.material('SN_Metal', base=K.hex_lin(0x526579), metallic=.56, roughness=.38),
    'seam': K.material('SN_Seam', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff3d55), strength=1.2),
    'glow': K.material('SN_Glow', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff7a3a), strength=2.0),
    'visor': K.material('SN_Visor', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff3d55), strength=2.2),
    'charge': K.material('SN_Charge', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xffb43a), strength=1.0),
    'core': K.material('SN_Core', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff3d55), strength=1.5),
    'shell': K.material('SN_CoreShell', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff3d55),
                        strength=1.0, alpha=.35),
    'eye': K.material('SN_PodEye', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xffb43a), strength=2.5),
    'beacon': K.material('SN_Beacon', base=(0, 0, 0), roughness=1, emission=K.hex_lin(0xff3d55), strength=3.0),
}


class Part(K.MB):
    """Mesh builder keyed by material name; resolves slots at object creation."""

    def __init__(self):
        super().__init__()
        self.keys = []

    def put(self, prim, key, cell=0, M_=None, uvfn=None):
        if key not in self.keys:
            self.keys.append(key)
        return self.add(prim, self.keys.index(key), cell, M_, uvfn)

    def build(self, name, m_game=None, parent=None, bevel=.05, sharp=35, segments=1):
        mats = [M[k] for k in self.keys]

        def cells(mi, cell):
            k = self.keys[mi]
            if k == 'armor':
                return armor_pal.uv(cell)
            if k == 'frame':
                return frame_pal.uv(cell)
            return (.5, .5)
        return K.mesh_object(name, self, mats, cells, m_game=m_game, parent=parent,
                             bevel=bevel, sharp_angle=sharp, segments=segments)


def hazard_uv(v, n):
    k = .32
    ax, ay, az = abs(n.x), abs(n.z), abs(n.y)  # blender normal -> game axes
    if ay >= ax and ay >= az:
        return (v.x * k, v.z * k)
    if ax >= az:
        return (v.z * k, v.y * k)
    return (v.x * k, v.y * k)


# ---------------------------------------------------------------------------
# geometry helpers
# ---------------------------------------------------------------------------
def oct_ring(y, hw, zf, zb, c):
    return [(-hw + c, y, zf), (hw - c, y, zf), (hw, y, zf + c), (hw, y, zb - c),
            (hw - c, y, zb), (-hw + c, y, zb), (-hw, y, zb - c), (-hw, y, zf + c)]


def oct_loft(st):
    return K.loft([oct_ring(*s) for s in st])


def prism_x(outline_zy, x0, x1):
    return K.loft([[(x0, y, z) for z, y in outline_zy], [(x1, y, z) for z, y in outline_zy]])


def band(poly_xz, y0, y1, o0, o1, center=(0, 0)):
    """Rectangular strip swept along an XZ polyline, offset outward from center."""
    secs = []
    n = len(poly_xz)
    for i, (x, z) in enumerate(poly_xz):
        a = poly_xz[max(0, i - 1)]
        b = poly_xz[min(n - 1, i + 1)]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1
        nx, nz = dz / L, -dx / L
        if nx * (x - center[0]) + nz * (z - center[1]) < 0:
            nx, nz = -nx, -nz
        secs.append([(x + nx * o0, y0, z + nz * o0), (x + nx * o1, y0, z + nz * o1),
                     (x + nx * o1, y1, z + nz * o1), (x + nx * o0, y1, z + nz * o0)])
    return K.loft(secs)


def arc_strip(cx, cy, r, a0, a1, w, z0, z1, n=10):
    """Curved bar in the XY plane (for seams that follow the reactor ring)."""
    secs = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        ca, sa = math.cos(a), math.sin(a)
        secs.append([(cx + ca * (r - w / 2), cy + sa * (r - w / 2), z0), (cx + ca * (r + w / 2), cy + sa * (r + w / 2), z0),
                     (cx + ca * (r + w / 2), cy + sa * (r + w / 2), z1), (cx + ca * (r - w / 2), cy + sa * (r - w / 2), z1)])
    return K.loft(secs)


def thin_disc_y(r, seg, y, h=.06):
    return K.cylinder(r, r, h, seg, 'Y')


# ---------------------------------------------------------------------------
# hierarchy roots
# ---------------------------------------------------------------------------
root = K.empty('iron-sentinel', size=4)
root['contest_asset'] = 'iron_sentinel'

# ===========================================================================
# TORSO (static body, pauldrons, upper arms, reactor housing)
# ===========================================================================
t = Part()
# V-chest: chamfered octagonal stations, broad at the shoulders.
t.put(oct_loft([(-4.2, 6.0, -4.0, 3.9, 1.5), (-1.5, 7.0, -4.5, 4.3, 1.6), (2.0, 8.2, -5.0, 4.8, 1.7),
                (4.8, 8.6, -5.1, 5.0, 1.8), (6.0, 8.0, -4.6, 4.6, 1.7), (6.8, 6.6, -3.6, 3.8, 1.4)]),
      'frame', FRAME)
# Hover skirt narrowing to the jets.
t.put(oct_loft([(-3.6, 6.4, -4.2, 4.2, 1.4), (-6.4, 5.6, -3.9, 3.9, 1.3), (-8.4, 4.6, -3.2, 3.2, 1.1),
                (-9.0, 4.0, -2.9, 2.9, 1.0)]), 'frame', DARK)
# Belt and hazard band.
t.put(oct_loft([(-4.85, 7.5, -5.1, 5.0, 1.7), (-3.75, 7.5, -5.1, 5.0, 1.7)]), 'frame', DEEP)
t.put(oct_loft([(-5.55, 6.75, -4.75, 4.75, 1.5), (-4.95, 6.75, -4.75, 4.75, 1.5)]), 'hazard', 0, None, hazard_uv)
# Tassets: hanging hip armour, front codpiece plate.
for s in (-1, 1):
    t.put(K.cbox(.7, 3.8, 5.6, .3), 'armor', BURNT, T((s * 6.55, -6.4, 0), (0, 0, s * .2)))
    t.put(K.cbox(.5, 2.6, 4.4, .2), 'frame', FRAME, T((s * 6.95, -6.3, 0), (0, 0, s * .2)))
t.put(K.loft([[(-2.6, -4.3, -4.65), (2.6, -4.3, -4.65), (2.0, -7.6, -4.05), (-2.0, -7.6, -4.05)],
              [(-2.4, -4.3, -5.55), (2.4, -4.3, -5.55), (1.7, -7.4, -4.85), (-1.7, -7.4, -4.85)]]), 'armor', RUST)
for k in range(3):
    t.put(K.box(3.2 - k * .5, .16, .25), 'frame', DEEP, T((0, -5.0 - k * .8, -5.4 + k * .18), (-.18, 0, 0)))
# Hover jets: four nozzles under the skirt (wash spawns at y -10.6).
for s in (-1, 1):
    for zz in (-2.2, 2.2):
        t.put(K.revolve([(.95, .7), (1.3, -.7), (1.05, -.7), (.75, .3), (0, .3)], 16, closed=False), 'frame', DEEP,
              T((s * 3.2, -9.6, zz), (math.pi / 2, 0, 0)))
        t.put(K.torus(1.25, .12, 16, 5), 'frame', STEEL, T((s * 3.2, -10.15, zz), (math.pi / 2, 0, 0)))
        t.put(thin_disc_y(1.0, 16, 0), 'glow', 0, T((s * 3.2, -10.33, zz)))
# Abdomen plates below the reactor.
t.put(K.cbox(7.0, 1.1, 1.0, .3), 'frame', FRAME, T((0, -3.55, -4.55)))
t.put(K.cbox(5.4, .9, .9, .25), 'frame', DARK, T((0, -2.55, -4.85)))
# Pectoral plates frame the reactor in a V; their inner edge follows the ring.
pec = [(2.0, 6.5), (8.3, 6.5), (8.75, 4.2), (7.9, .5), (5.35, .1), (5.2, 1.0), (4.85, 2.75), (3.9, 4.3), (2.6, 5.55)]
for s in (-1, 1):
    outline = [(s * x, y) for x, y in pec]
    if s < 0:
        outline = list(reversed(outline))
    t.put(K.prism(outline, -5.95, -5.0), 'armor', RUST, T(rot=(0, -s * .17, 0)))
    trim = [(2.2, 6.5), (8.3, 6.5), (8.55, 5.6), (2.9, 5.6)]
    o2 = [(s * x, y) for x, y in trim]
    if s < 0:
        o2 = list(reversed(o2))
    t.put(K.prism(o2, -6.15, -5.8), 'armor', PALE, T(rot=(0, -s * .17, 0)))
    # flank armour and ribs
    t.put(K.cbox(.8, 5.2, 6.4, .3), 'armor', BURNT, T((s * 8.35, 1.6, .2), (0, 0, s * .1)))
    t.put(K.cbox(.6, 3.4, 1.0, .2), 'frame', DEEP, T((s * 8.75, 1.4, -2.0), (0, 0, s * .1)))
    t.put(K.cbox(.6, 3.4, 1.0, .2), 'frame', DEEP, T((s * 8.75, 1.4, 2.4), (0, 0, s * .1)))
    # chest vents above the reactor
    for k in range(4):
        t.put(K.box(2.0, .18, .35), 'frame', DEEP, T((s * 1.25, 6.05 - k * .42, -5.45)))
    # red seams follow the reactor ring and underline the chest
    a0, a1 = (math.radians(8), math.radians(62)) if s > 0 else (math.radians(118), math.radians(172))
    t.put(arc_strip(0, 1, 5.2, a0, a1, .16, -6.05, -5.6, 12), 'seam')
    t.put(K.box(3.0, .16, .2), 'seam', 0, T((s * 3.9, -2.65, -5.0)))
# Reactor housing: thick bolted ring, dark cavity, inner seam ring.
RC = T((0, 1, 0))
t.put(K.revolve([(3.7, -5.0), (4.85, -5.0), (4.85, -6.2), (4.55, -6.65), (3.95, -6.65), (3.7, -6.4)], 32), 'frame',
      FRAME, RC)
t.put(K.revolve([(3.72, -5.0), (3.72, -4.85), (2.0, -4.62), (0, -4.55)], 32, closed=False), 'frame', DEEP, RC)
t.put(K.torus(3.62, .09, 32, 5), 'seam', 0, T((0, 1, -6.0)))
for k in range(12):
    a = k * TAU / 12 + TAU / 24
    t.put(K.cylinder(.17, .17, .18, 8, 'Z'), 'frame', STEEL, T((math.cos(a) * 4.25, 1 + math.sin(a) * 4.25, -6.72)))
for k in range(4):
    a = k * TAU / 4 + TAU / 8
    t.put(K.cbox(1.0, 1.5, 1.1, .25), 'frame', DARK,
          T((math.cos(a) * 5.05, 1 + math.sin(a) * 5.05, -5.95), (0, 0, a + math.pi / 2)))
# Collar, trapezius armour and neck.
t.put(oct_loft([(6.4, 4.8, -3.6, 3.4, 1.2), (7.5, 4.3, -3.3, 3.1, 1.1)]), 'frame', DEEP)
t.put(K.cylinder(1.5, 1.7, 2.0, 12), 'frame', DARK, T((0, 7.6, -.6)))
for s in (-1, 1):
    tz = [(-3.1, 6.5), (3.3, 6.5), (3.0, 7.6), (-2.6, 7.9)]
    t.put(K.loft([[(s * 3.9, y, z) for z, y in tz], [(s * 8.9, y - .35, z) for z, y in tz]]), 'armor', RUST)
# Back: armoured backpack, exhaust stacks, thruster housings.
t.put(K.cbox(6.0, 7.6, 1.6, .7), 'armor', BURNT, T((0, 2.4, 5.3)))
t.put(K.cbox(4.6, 1.0, .5, .3), 'hazard', 0, T((0, -.4, 6.15)), hazard_uv)
for s in (-1, 1):
    t.put(K.cylinder(.9, 1.2, 5.0, 12), 'frame', DEEP, T((s * 3.6, 6.5, 5.2), (.5, 0, 0)))
    t.put(K.cylinder(1.05, 1.05, .5, 12), 'frame', STEEL, T((s * 3.6, 8.45, 6.25), (.5, 0, 0)))
    t.put(K.cylinder(.72, .72, .12, 12), 'glow', 0, T((s * 3.6, 8.72, 6.4), (.5, 0, 0)))
    t.put(K.cylinder(2.5, 2.25, 1.5, 20, 'Z'), 'frame', FRAME, T((s * 5, 0, 5.1)))
    t.put(K.torus(2.45, .24, 24, 6), 'frame', DEEP, T((s * 5, 0, 6.0)))
    t.put(K.cbox(1.2, 4.8, 1.0, .25), 'frame', DARK, T((s * 5.2, -.7, 5.5)))
# Pauldrons, shoulder yokes, upper arms with pistons, elbow hinges.
PAUL = [(-4.0, 4.0), (-4.15, 6.0), (-3.1, 7.6), (0, 8.3), (3.1, 7.6), (4.15, 6.0), (3.9, 4.0)]


def paul_ring(x, s_):
    return [(x, 6.1 + (y - 6.1) * s_, z * s_) for z, y in PAUL]


for s in (-1, 1):
    rings = [paul_ring(s * x, sc) for x, sc in ((6.0, .80), (7.4, 1.0), (10.1, 1.0), (11.3, .84))]
    t.put(K.loft(rings), 'armor', RUST)
    # layered rim plates on the outer edge
    for k, (x0, sc) in enumerate(((10.15, 1.05), (9.0, 1.06))):
        rr = [paul_ring(s * x0, sc), paul_ring(s * (x0 + .55), sc * .98)]
        t.put(K.loft(rr), 'armor', PALE if k == 0 else BURNT)
    t.put(K.cbox(5.4, .8, 8.4, .3), 'frame', DEEP, T((s * 8.8, 4.0, 0), (0, math.pi / 2, 0)))
    t.put(K.cylinder(2.1, 2.1, 1.6, 16, 'X'), 'frame', FRAME, T((s * 11.0, 5.6, -.6)))
    t.put(K.cylinder(1.3, 1.3, 6.0, 16), 'frame', FRAME, T((s * 10.4, .8, .4)))
    t.put(K.cbox(1.2, 4.2, 2.6, .35), 'armor', BURNT, T((s * 11.6, .9, .4), (0, 0, -s * .06)))
    for zz in (-.95, 1.75):
        t.put(K.cylinder(.22, .22, 4.6, 8), 'frame', STEEL, T((s * 10.4, .3, zz)))
        t.put(K.cylinder(.36, .36, 1.6, 8), 'frame', DEEP, T((s * 10.4, 2.4, zz)))
    t.put(K.cylinder(1.65, 1.65, 3.2, 16, 'X'), 'frame', DEEP, T((s * 10.4, -2.6, .4)))
    t.put(K.cylinder(1.05, 1.05, 3.5, 12, 'X'), 'frame', STEEL, T((s * 10.4, -2.6, .4)))

torso = t.build('torso', parent=root, bevel=.06)

# ===========================================================================
# HEAD (pivot (0, 8.4, -0.6) relative torso)
# ===========================================================================
h = Part()


def helm_ring(y, hw, zf, zb, nose):
    return [(0, y, zf - nose), (hw * .5, y, zf), (hw, y, zf + .9), (hw, y, zb - .8), (hw * .55, y, zb), (0, y, zb),
            (-hw * .55, y, zb), (-hw, y, zb - .8), (-hw, y, zf + .9), (-hw * .5, y, zf)]


HELM = [(-1.4, 2.9, -2.8, 2.4, .5), (-.5, 3.3, -3.15, 2.7, .75), (.7, 3.3, -3.15, 2.7, .75),
        (1.75, 3.15, -2.85, 2.6, .62), (2.65, 2.6, -2.2, 2.35, .42), (3.15, 2.05, -1.5, 1.95, .25)]
h.put(K.loft([helm_ring(*s) for s in HELM]), 'armor', RUST)
hw, zf, nose = 3.3, -3.15, .75
front = [(-hw, zf + .9), (-hw * .5, zf), (0, zf - nose), (hw * .5, zf), (hw, zf + .9)]
h.put(band(front, -.62, .52, -.05, .06), 'frame', DEEP)                       # visor recess
h.put(band(front, -.16, .26, .0, .14), 'visor')                                # visor slit
h.put(band(front, .52, 1.05, -.05, .42), 'armor', BURNT)                       # brow
h.put(band([(-1.7, zf - .05), (0, zf - nose - .05), (1.7, zf - .05)], -1.25, -.68, -.1, .12), 'frame', FRAME)
for k in (-2, -1, 0, 1, 2):
    h.put(K.box(.16, .5, .3), 'frame', DEEP, T((k * .55, -.96, zf - .25 - (nose - abs(k) * .26) * .9)))
for s in (-1, 1):
    h.put(K.cbox(.9, 2.7, 3.6, .3), 'frame', FRAME, T((s * 3.45, -.15, -.2)))
    h.put(K.cylinder(.85, .85, .5, 12, 'X'), 'frame', STEEL, T((s * 3.85, -.15, .1)))
    # low swept cheek plates carry the visor line back along the helm
    blade = [(-2.5, -.75), (-1.9, -.2), (2.3, .25), (2.5, -.35), (-.6, -1.0)]
    h.put(prism_x(blade, s * 3.9, s * 4.18), 'armor', PALE)
    h.put(K.cylinder(.08, .11, 3.4, 6), 'frame', STEEL, T((s * 2.6, 4.2, 1.2), (.3, 0, 0)))
    h.put(K.cbox(.6, .7, .9, .15), 'frame', DEEP, T((s * 2.6, 2.75, .7), (.3, 0, 0)))
crest = [(-1.8, 2.9), (2.5, 2.9), (2.8, 4.35), (1.5, 4.8), (-.9, 4.0)]
h.put(prism_x(crest, -.28, .28), 'armor', PALE)

head = h.build('head', m_game=T((0, 8.4, -.6)), parent=torso, bevel=.04)
for s, tag in ((-1, 'L'), (1, 'R')):
    tp = Part()
    tp.put(K.sphere(.28, 8, 6), 'beacon')
    tp.build(f'antenna-tip-{tag}', m_game=T((s * 2.6, 5.85, 1.7)), parent=head, bevel=None)

# ===========================================================================
# REACTOR (group at (0, 1, -5.6)) and four iris shutters
# ===========================================================================
reactor = K.empty('reactor', T((0, 1, -5.6)), torso, 1.0)
cp = Part()
cp.put(K.icosphere(3.1, 1), 'core')
core = cp.build('reactor-core', m_game=T(scale=(1, 1, .3)), parent=reactor, bevel=None, sharp=10)
sp = Part()
sp.put(K.icosphere(3.5, 0), 'shell')
shell = sp.build('reactor-shell', m_game=T(scale=(1, 1, .3)), parent=reactor, bevel=None, sharp=10)

PETAL_R, GAP = 4.3, math.radians(2.0)
shutters, holders = [], []
for i in range(4):
    holder = K.empty(f'shutter-holder-{i}', T((0, 1, 0), (0, 0, i * TAU / 4 + math.pi / 4)), torso, .6)
    sh = Part()
    arc = [math.pi / 2 - math.pi / 4 + GAP + (math.pi / 2 - 2 * GAP) * k / 8 for k in range(9)]
    outline = [(0, .06)] + [(math.cos(a) * PETAL_R, math.sin(a) * PETAL_R) for a in arc]
    tilt = T(rot=(.12, 0, 0))
    base = T((0, -3.4, 0))  # holder-local geometry expressed in shutter-local space
    sh.put(K.prism(list(reversed(outline)), -.28, .25), 'armor', RUST, base @ tilt)
    # raised spine and a dark lip on the outer arc
    sh.put(K.loft([[(-.22, .5, -.28), (.22, .5, -.28), (.16, PETAL_R - .45, -.28), (-.16, PETAL_R - .45, -.28)],
                   [(-.12, .5, -.48), (.12, .5, -.48), (.08, PETAL_R - .5, -.42), (-.08, PETAL_R - .5, -.42)]]),
           'armor', BURNT, base @ tilt)
    lip_in = [(math.cos(a) * (PETAL_R - .35), math.sin(a) * (PETAL_R - .35)) for a in arc]
    lip_out = [(math.cos(a) * PETAL_R, math.sin(a) * PETAL_R) for a in arc]
    secs = [[(xi, yi, -.30), (xo, yo, -.30), (xo, yo, -.40), (xi, yi, -.40)] for (xi, yi), (xo, yo) in zip(lip_in, lip_out)]
    sh.put(K.loft(secs), 'armor', DRUST, base @ tilt)
    o = sh.build(f'shutter-{i}', m_game=T((0, 3.4, -7.0)), parent=holder, bevel=.04)
    o['runtime_base_y'] = 3.4
    shutters.append(o)
    holders.append(holder)

# ===========================================================================
# FOREARMS (pivot at the elbows) — +X carries the missile launcher
# ===========================================================================
forearms = {}
for s, tag in ((1, 'R'), (-1, 'L')):
    fa = Part()
    fa.put(K.cylinder(1.45, 1.45, 2.6, 14, 'X'), 'frame', FRAME)
    fa.put(K.cbox(3.0, 3.0, 6.6, .55), 'frame', FRAME, T((0, 0, -3.3)))
    fa.put(K.cbox(3.5, .6, 4.8, .25), 'armor', BURNT, T((0, 1.75, -3.7)))
    fa.put(K.cbox(.5, 2.0, 4.0, .2), 'frame', DEEP, T((s * 1.6, -.2, -3.6)))
    if s > 0:
        fa.put(K.cbox(4.8, 4.8, 5.8, .9), 'armor', RUST, T((0, .3, -6.5)))
        fa.put(K.cbox(5.0, .9, 6.0, .35), 'frame', DEEP, T((0, 2.95, -6.4)))
        fa.put(K.cbox(4.4, 4.4, .35, .7), 'frame', DEEP, T((0, .3, -9.45)))
        for sx in (-1, 1):
            fa.put(K.box(.28, 3.6, 5.0), 'hazard', 0, T((sx * 2.5, .3, -6.4)), hazard_uv)
        for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            fa.put(K.revolve([(.78, -8.9), (.78, -9.75), (.92, -9.85), (.92, -10.05), (.66, -10.05), (.66, -9.9),
                              (.66, -9.0)], 14), 'frame', STEEL, T((dx * 1.1, .3 + dy * 1.1, 0)))
    else:
        fa.put(K.cbox(3.7, 3.7, 1.0, .5), 'armor', BURNT, T((0, 0, -6.7)))
        fa.put(K.cbox(3.8, 3.8, 2.4, .6), 'frame', DEEP, T((0, 0, -8.0)))
        fa.put(K.cbox(4.2, 1.4, 2.3, .4), 'armor', RUST, T((0, 1.35, -8.25)))
        for k in (-1, 0, 1):
            fa.put(K.loft([[(-.4 + k * 1.2, -.9, -9.0), (.4 + k * 1.2, -.9, -9.0), (.4 + k * 1.2, .1, -9.0), (-.4 + k * 1.2, .1, -9.0)],
                           [(-.35 + k * 1.2, -1.2, -10.2), (.35 + k * 1.2, -1.2, -10.2), (.35 + k * 1.2, -.4, -10.3), (-.35 + k * 1.2, -.4, -10.3)],
                           [(-.15 + k * 1.2, -2.4, -10.7), (.15 + k * 1.2, -2.4, -10.7), (.15 + k * 1.2, -2.0, -10.9), (-.15 + k * 1.2, -2.0, -10.9)]]),
                   'frame', STEEL)
        fa.put(K.loft([[(-1.9, -.4, -8.6), (-1.9, .4, -8.6), (-1.9, .4, -7.6), (-1.9, -.4, -7.6)],
                       [(-2.5, -.9, -9.6), (-2.5, -.2, -9.6), (-2.5, -.2, -9.0), (-2.5, -.9, -9.0)]]), 'frame', STEEL)
    o = fa.build(f'forearm-{tag}', m_game=T((s * 10.4, -2.6, .4)), parent=torso, bevel=.05)
    forearms[tag] = o

launcher = forearms['R']
K.empty('missile-mouth', T((0, .3, -8.8)), launcher, .6)
ch = Part()
for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
    ch.put(K.disc(.62, 14, .05, -.12), 'charge', 0, T((dx * 1.1, dy * 1.1, 0)))
charge = ch.build('launcher-charge', m_game=T((0, .3, -9.92)), parent=launcher, bevel=None)

# ===========================================================================
# SHOULDER CANNON PODS (groups at (+/-13.8, 5.6, -0.6))
# ===========================================================================
pods = {}
for s, tag in ((1, 'R'), (-1, 'L')):
    pod = K.empty(f'pod-{tag}', T((s * 13.8, 5.6, -.6)), torso, 1.0)
    b = Part()
    b.put(K.revolve([(3.0, -3.0), (3.2, -3.35), (3.85, -3.35), (4.0, -3.0), (4.0, -1.0), (3.95, 1.6), (3.6, 2.95),
                     (3.1, 3.3), (0, 3.3)], 16, closed=False, phase=0), 'armor', RUST)
    b.put(K.revolve([(3.02, -3.05), (3.02, -2.9), (0, -2.9)], 16, closed=False), 'frame', DEEP)
    b.put(K.torus(3.85, .16, 24, 5), 'frame', FRAME, T((0, 0, -3.28)))
    b.put(K.torus(3.5, .16, 24, 5), 'frame', FRAME, T((0, 0, 2.95)))
    b.put(K.revolve([(4.06, -.9), (4.06, .1), (4.0, .1), (4.0, -.9)], 16, phase=0), 'frame', DARK)
    for x in (-1.3, 1.3):
        b.put(K.torus(.85, .17, 16, 6), 'frame', STEEL, T((x, 0, -3.36)))
    b.put(K.torus(1.0, .14, 16, 5), 'frame', DEEP, T((0, 2.2, -3.05)))
    # side radiator blocks and a dorsal spine
    for sx in (-1, 1):
        b.put(K.cbox(.7, 2.4, 3.6, .2), 'frame', DEEP, T((sx * 3.85, 0, .3)))
        for k in range(4):
            b.put(K.box(.25, 2.0, .2), 'frame', FRAME, T((sx * 4.22, 0, -.9 + k * .8)))
    b.put(K.revolve([(3.1, 3.25), (2.7, 3.55), (1.5, 3.7), (0, 3.7)], 16, closed=False, phase=0), 'frame', DEEP)
    b.put(K.torus(2.1, .14, 16, 5), 'frame', FRAME, T((0, 0, 3.66)))
    b.put(prism_x([(-2.2, 3.6), (2.6, 3.4), (2.9, 4.2), (-1.4, 4.7)], -.35, .35), 'armor', BURNT)
    body = b.build(f'pod-{tag}-body', parent=pod, bevel=.05)

    barrels = []
    for k, ox in enumerate((-1.3, 1.3)):
        br = Part()
        br.put(K.revolve([(.66, .35), (.66, -.6), (.62, -1.0), (.5, -5.2), (.72, -5.25), (.72, -6.0), (.34, -6.0),
                          (.34, -5.4), (.3, -.6), (.3, .35)], 14), 'metal')
        for z in (-1.4, -2.3, -3.2):
            br.put(K.torus(.6, .1, 14, 5), 'metal', 0, T((0, 0, z)))
        o = br.build(f'pod-{tag}-barrel-{k}', m_game=T((ox, 0, -3)), parent=pod, bevel=.03)
        barrels.append(o)

    ep = Part()
    ep.put(K.sphere(.9, 12, 8), 'eye')
    eye = ep.build(f'pod-{tag}-eye', m_game=T((0, 2.2, -2.4)), parent=pod, bevel=None)

    st = Part()
    st.put(K.cylinder(2.2, 3.0, 2.2, 7), 'frame', DEEP, T((0, 0, .6), (math.pi / 2, 0, 0)))
    for k in range(5):
        a = k * 1.26
        st.put(K.box(.6, 1.8, .5), 'frame', DARK, T((math.cos(a) * 2, math.sin(a) * 2, -.8), (.4, 0, a)))
    st.put(K.disc(1.6, 10, .04, -.2), 'glow', 0, T((0, 0, -.52)))
    stump = st.build(f'pod-{tag}-stump', parent=pod, bevel=.04)
    stump['runtime_initial_visible'] = False
    pods[tag] = dict(group=pod, body=body, barrels=barrels, eye=eye, stump=stump)

# ===========================================================================
# rear thrusters (scale-animated by the runtime) and sockets
# ===========================================================================
thrusters = []
for s, tag in ((-1, 'L'), (1, 'R')):
    tp = Part()
    tp.put(K.disc(2.2, 20, .04, .25), 'glow')
    o = tp.build(f'thruster-{tag}', m_game=T((s * 5, 0, 6.1), (0, math.pi, 0)), parent=torso, bevel=None)
    thrusters.append(o)
K.empty('hover-wash', T((0, -10.6, 0)), torso, .8)

# ===========================================================================
# animation clips (transform-only; glTF native)
# ===========================================================================
def local(o):
    return K.from_blender_matrix(o.matrix_basis)


# Idle guard: breathing torso, swaying forearms, scanning head and pods.
tor0 = local(torso)
K.add_clip('Idle', torso, [(tt, T((0, math.sin(tt / 2 * TAU) * .35, 0), (math.sin(tt / 2 * TAU) * .02, 0, 0)))
                            for tt in (0, .5, 1, 1.5, 2)])
for tag, o in forearms.items():
    s = 1 if tag == 'R' else -1
    K.add_clip('Idle', o, [(tt, T((s * 10.4, -2.6, .4), (.35 + math.sin(tt / 2 * TAU + s) * .08, 0, 0)))
                           for tt in (0, .5, 1, 1.5, 2)])
K.add_clip('Idle', head, [(tt, T((0, 8.4, -.6), (0, math.sin(tt / 2 * TAU) * .35, 0))) for tt in (0, .5, 1, 1.5, 2)])
for tag, p in pods.items():
    g = p['group']
    s = 1 if tag == 'R' else -1
    K.add_clip('Idle', g, [(tt, T((s * 13.8, 5.6, -.6), (0, math.sin(tt / 2 * TAU + s) * .2, 0)))
                           for tt in (0, .5, 1, 1.5, 2)])

# Reactor iris: shutters slide outward along their holder +Y by 4.6, then hide
# (runtime: mesh.position.y = 3.4 + coreOpen * 4.6; visible while coreOpen < 0.98).
HIDE = 1e-4
for o in shutters:
    open_keys = [(0, T((0, 3.4, -7.0))), (.9, T((0, 8.0, -7.0))), (.93, T((0, 8.0, -7.0))),
                 (.96, T((0, 8.0, -7.0), scale=HIDE)), (1.0, T((0, 8.0, -7.0), scale=HIDE))]
    K.add_clip('ReactorOpen', o, open_keys)
    close_keys = [(0, T((0, 8.0, -7.0), scale=HIDE)), (.04, T((0, 8.0, -7.0), scale=HIDE)),
                  (.07, T((0, 8.0, -7.0))), (.1, T((0, 8.0, -7.0))), (1.0, T((0, 3.4, -7.0)))]
    K.add_clip('ReactorClose', o, close_keys)
K.add_clip('ReactorOpen', shell, [(0, T(scale=(.9, .9, .27))), (1.0, T(scale=(1.1, 1.1, .33)))])
K.add_clip('ReactorClose', shell, [(0, T(scale=(1.1, 1.1, .33))), (1.0, T(scale=(.9, .9, .27)))])
K.add_clip('ReactorOpen', core, [(0, T(scale=(1, 1, .3))), (1.0, T(rot=(0, 0, .5), scale=(1, 1, .3)))])
K.add_clip('ReactorClose', core, [(0, T(rot=(0, 0, .5), scale=(1, 1, .3))), (1.0, T(scale=(1, 1, .3)))])

# Launcher charge (2.6 s, CHARGE_TIME): arm levels at the ship, tube glow pulses faster.
K.add_clip('LauncherCharge', launcher, [(0, T((10.4, -2.6, .4), (.35, 0, 0))), (.4, T((10.4, -2.6, .4), (0, 0, 0))),
                                         (2.6, T((10.4, -2.6, .4), (0, 0, 0)))])
ck = []
tt, k = 0.0, 0
while tt < 2.6:
    ck.append((round(tt, 3), T((0, .3, -9.92), scale=(1.08 if k % 2 else 1.0))))
    tt += max(.08, .32 - tt * .1)
    k += 1
ck.append((2.6, T((0, .3, -9.92), scale=1.08)))
K.add_clip('LauncherCharge', charge, ck)
K.add_clip('LauncherCharge', head, [(0, T((0, 8.4, -.6))), (.4, T((0, 8.4, -.6), (.12, .18, 0))),
                                     (2.6, T((0, 8.4, -.6), (.12, .18, 0)))])

# Shoulder destroyed: body, barrels and eye collapse; the torn stump remains.
for tag, p in pods.items():
    for o in [p['body'], p['eye']] + p['barrels']:
        m0 = local(o)
        loc = m0.to_translation()
        K.add_clip(f'ShoulderDestroyed_{tag}', o, [(0, m0), (.1, m0), (.133, T(tuple(loc), scale=HIDE)),
                                                   (.2, T(tuple(loc), scale=HIDE))], interp='CONSTANT')

bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 78

all_objs = [o for o in bpy.context.scene.objects]
stats = K.evaluated_stats(all_objs)
print('SENTINEL_STATS', stats['triangles'], stats['primitives'], stats['min'], stats['max'], stats['size'])

blend = os.path.join(OUT, 'sentinel.blend')
glb = os.path.join(OUT, 'sentinel.glb')
bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
K.export_glb(glb)
print('WROTE', blend, glb)
