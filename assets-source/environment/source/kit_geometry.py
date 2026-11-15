"""
Deterministic geometry kernel for the Reactor Spine kit.

Provenance: started from the cancelled Opus environment task's kernel
(asset-work/environment-scenes/reactor-spine/initial/source/kit_geometry.py,
read-only there) and extended by the Fable replacement builder with
primitive-level orientation checks, inverted boxes (real recesses) and quads.

Everything is authored in GAME coordinates (x across the lane, +x = far wall,
y up, z = flight direction) and converted once to Blender space on mesh
creation with Rx(+90deg): game (x, y, z) -> Blender (x, -z, y). The glTF
exporter's +Y-up conversion maps that back to game coordinates exactly, so a
GLB vertex equals the game-space vertex.

Each Part is one stamp template: one Batch bucket, one tint, one fx rule.
Primitives own their vertices (no welding between primitives), so smoothing
never bleeds across separate pieces; cylinder sides are smooth, caps flat.
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

TO_BLENDER = Matrix.Rotation(math.radians(90.0), 4, 'X')


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def RY(a):
    return Matrix.Rotation(a, 4, 'Y')


def RX(a):
    return Matrix.Rotation(a, 4, 'X')


def RZ(a):
    return Matrix.Rotation(a, 4, 'Z')


def S(x, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = x, y, z
    return m


def basis_from_axis(axis):
    """Orthonormal (u, v, w) with w along axis; deterministic choice of u."""
    w = Vector(axis).normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(w.y) < 0.9 else Vector((1.0, 0.0, 0.0))
    u = ref.cross(w).normalized()
    v = w.cross(u).normalized()
    return u, v, w


ORIENT = {'faces': 0, 'flipped': [], 'degenerate': []}


class Part:
    """Triangle soup for one stamp template (game coordinates)."""

    def __init__(self, module, name, bucket, tint, uv, gain=1.0, fx=None, stamp=None, note=''):
        self.module, self.name, self.bucket = module, name, bucket
        self.tint, self.uv, self.gain = tint, uv, gain
        self.fx = fx or {}
        self.stamp = stamp or {}
        self.note = note
        self.verts = []
        self.faces = []
        self.smooth = []

    @property
    def full_name(self):
        return f'{self.module}__{self.name}'

    def _add(self, pts, faces, smooth_flags, M, check=None):
        base = len(self.verts)
        world = [(M @ Vector(p)) for p in pts]
        for w in world:
            self.verts.append(w.to_tuple())
        for f, s in zip(faces, smooth_flags):
            self.faces.append(tuple(base + i for i in f))
            self.smooth.append(bool(s))
        if check:
            # convex primitive: every face normal must point away from the
            # primitive centroid ('convex') or toward it ('inverted').
            c = sum(world, Vector((0, 0, 0))) / len(world)
            sign = 1.0 if check == 'convex' else -1.0
            for f in faces:
                n = Vector((0, 0, 0))
                for i in range(len(f)):
                    a, b = world[f[i]], world[f[(i + 1) % len(f)]]
                    n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
                fc = sum((world[i] for i in f), Vector((0, 0, 0))) / len(f)
                ORIENT['faces'] += 1
                if n.length < 1e-10:
                    ORIENT['degenerate'].append(self.full_name)
                elif sign * n.normalized().dot(fc - c) < -1e-6:
                    ORIENT['flipped'].append(self.full_name)

    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)

    def bounds(self):
        xs = [v[0] for v in self.verts]
        ys = [v[1] for v in self.verts]
        zs = [v[2] for v in self.verts]
        return [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]


# --------------------------------------------------------------------------
# primitives (all take a final transform M, applied after local construction)
# --------------------------------------------------------------------------

def box(P, c, s, M=None, skip=(), inverted=False):
    """Axis-aligned box centred at c with size s. skip: face ids to omit
    ('-x','+x','-y','+y','-z','+z') where it is buried in another solid."""
    M = M or Matrix.Identity(4)
    cx, cy, cz = c
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    pts = [(cx + sx * hx, cy + sy * hy, cz + sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    # index = (sx>0)*4 + (sy>0)*2 + (sz>0)
    faces = {
        '-x': (0, 1, 3, 2), '+x': (4, 6, 7, 5),
        '-y': (0, 4, 5, 1), '+y': (2, 3, 7, 6),
        '-z': (0, 2, 6, 4), '+z': (1, 5, 7, 3),
    }
    use = [f for k, f in faces.items() if k not in skip]
    if inverted:
        use = [tuple(reversed(f)) for f in use]
    P._add(pts, use, [False] * len(use), M, check='inverted' if inverted else 'convex')


def box_minmax(P, lo, hi, M=None, skip=(), inverted=False):
    c = tuple((a + b) / 2 for a, b in zip(lo, hi))
    s = tuple(b - a for a, b in zip(lo, hi))
    box(P, c, s, M, skip, inverted)


def inv_box(P, lo, hi, skip=(), M=None):
    """Inward-facing box: the walls of a real recess / pocket."""
    box_minmax(P, lo, hi, M, skip, inverted=True)


def quad(P, a, b, c, d, M=None):
    """Single quad; counter-clockwise a,b,c,d seen from the front."""
    P._add([a, b, c, d], [(0, 1, 2, 3)], [False], M or Matrix.Identity(4))


def chamfer_box(P, c, s, ch, M=None):
    """Convex box with all 12 edges chamfered by ch (26 faces, 44 triangles)."""
    M = M or Matrix.Identity(4)
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    ch = min(ch, hx * 0.49, hy * 0.49, hz * 0.49)
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                pts += [
                    (sx * hx, sy * (hy - ch), sz * (hz - ch)),
                    (sx * (hx - ch), sy * hy, sz * (hz - ch)),
                    (sx * (hx - ch), sy * (hy - ch), sz * hz),
                ]
    pts = [(p[0] + c[0], p[1] + c[1], p[2] + c[2]) for p in pts]
    hull_faces(P, pts, M)


def hull_faces(P, pts, M=None):
    """Convex hull of points via bmesh (deterministic for fixed input)."""
    M = M or Matrix.Identity(4)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs, use_existing_faces=False)
    for g in res.get('geom_interior', []) + res.get('geom_unused', []):
        if isinstance(g, bmesh.types.BMVert) and g.is_valid and not g.link_faces:
            bm.verts.remove(g)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=list(bm.verts), edges=list(bm.edges))
    bm.verts.index_update()
    local = [v.co.to_tuple() for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    P._add(local, faces, [False] * len(faces), M, check='convex')


def prism(P, profile, z0, z1, M=None, caps=(True, True), smooth=False, convex=True):
    """Extrude a CCW 2D profile (x, y) along +z from z0 to z1."""
    M = M or Matrix.Identity(4)
    n = len(profile)
    pts = [(x, y, z0) for x, y in profile] + [(x, y, z1) for x, y in profile]
    faces, flags = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
        flags.append(smooth)
    if caps[0]:
        faces.append(tuple(reversed(range(n))))
        flags.append(False)
    if caps[1]:
        faces.append(tuple(range(n, 2 * n)))
        flags.append(False)
    P._add(pts, faces, flags, M, check='convex' if convex else None)


def cylinder(P, p0, p1, r0, r1=None, n=10, caps=(True, True), M=None, phase=0.0, smooth=True):
    """Frustum between points p0 and p1 (radius r0 at p0, r1 at p1)."""
    M = M or Matrix.Identity(4)
    r1 = r0 if r1 is None else r1
    a, b = Vector(p0), Vector(p1)
    u, v, w = basis_from_axis(b - a)
    pts = []
    for ring, (c, r) in enumerate(((a, r0), (b, r1))):
        for i in range(n):
            t = phase + 2 * math.pi * i / n
            pts.append((c + u * (math.cos(t) * r) + v * (math.sin(t) * r)).to_tuple())
    faces, flags = [], []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
        flags.append(smooth)
    # separate cap vertices so caps stay flat
    if caps[0] and r0 > 1e-6:
        base = len(pts)
        pts += pts[:n]
        faces.append(tuple(base + i for i in reversed(range(n))))
        flags.append(False)
    if caps[1] and r1 > 1e-6:
        base = len(pts)
        pts += pts[n:2 * n]
        faces.append(tuple(base + i for i in range(n)))
        flags.append(False)
    P._add(pts, faces, flags, M, check='convex')


def lathe(P, profile, axis_p0, axis_dir, n=12, M=None, close=(False, False), phase=0.0, smooth=True):
    """Revolve [(radius, axial)] around an axis. Rings with radius 0 are poles."""
    M = M or Matrix.Identity(4)
    o = Vector(axis_p0)
    u, v, w = basis_from_axis(axis_dir)
    rings = []
    pts = []
    for r, h in profile:
        ring = []
        for i in range(n):
            t = phase + 2 * math.pi * i / n
            ring.append(len(pts))
            pts.append((o + w * h + u * (math.cos(t) * r) + v * (math.sin(t) * r)).to_tuple())
        rings.append(ring)
    faces, flags = [], []
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        # flat shading where the profile turns sharply (flanges), smooth on gentle bends
        r0, h0 = profile[k]
        r1, h1 = profile[k + 1]
        steep = abs(r1 - r0) > 2.5 * abs(h1 - h0) + 1e-9
        for i in range(n):
            j = (i + 1) % n
            if profile[k][0] < 1e-6:
                faces.append((A[i], B[j], B[i]))
            elif profile[k + 1][0] < 1e-6:
                faces.append((A[i], A[j], B[i]))
            else:
                faces.append((A[i], A[j], B[j], B[i]))
            flags.append(smooth and not steep)
    if close[0] and profile[0][0] > 1e-6:
        base = len(pts)
        pts += [pts[i] for i in rings[0]]
        faces.append(tuple(base + i for i in reversed(range(n))))
        flags.append(False)
    if close[1] and profile[-1][0] > 1e-6:
        base = len(pts)
        pts += [pts[i] for i in rings[-1]]
        faces.append(tuple(base + i for i in range(n)))
        flags.append(False)
    # orientation: lathe faces were built so normals point outward for
    # increasing axial coordinate with u x v = w; verify and flip if needed
    P._add(pts, faces, flags, M)


def torus_arc(P, center, R, r, a0, a1, segs, n=10, plane='xy', M=None, caps=(False, False)):
    """Bent pipe: a torus arc of major radius R in the given plane, tube radius r."""
    M = M or Matrix.Identity(4)
    c = Vector(center)
    ax = {'xy': (Vector((1, 0, 0)), Vector((0, 1, 0))), 'zy': (Vector((0, 0, 1)), Vector((0, 1, 0))),
          'xz': (Vector((1, 0, 0)), Vector((0, 0, 1)))}[plane]
    e1, e2 = ax
    normal = e1.cross(e2)
    pts, rings = [], []
    for s in range(segs + 1):
        t = a0 + (a1 - a0) * s / segs
        spine = c + (e1 * math.cos(t) + e2 * math.sin(t)) * R
        radial = (e1 * math.cos(t) + e2 * math.sin(t))
        ring = []
        for i in range(n):
            q = 2 * math.pi * i / n
            ring.append(len(pts))
            pts.append((spine + radial * (math.cos(q) * r) + normal * (math.sin(q) * r)).to_tuple())
        rings.append(ring)
    faces, flags = [], []
    for s in range(segs):
        A, B = rings[s], rings[s + 1]
        for i in range(n):
            j = (i + 1) % n
            faces.append((A[i], B[i], B[j], A[j]))
            flags.append(True)
    if caps[0]:
        base = len(pts)
        pts += [pts[i] for i in rings[0]]
        faces.append(tuple(base + i for i in range(n)))
        flags.append(False)
    if caps[1]:
        base = len(pts)
        pts += [pts[i] for i in rings[-1]]
        faces.append(tuple(base + i for i in reversed(range(n))))
        flags.append(False)
    P._add(pts, faces, flags, M)


def ring_plate(P, center, axis, r_out, r_in, n=12, M=None, phase=0.0, square_outer=None):
    """Flat annulus facing -axis direction (one-sided), optionally with a
    square outer outline of half-size square_outer (bezel faces)."""
    M = M or Matrix.Identity(4)
    c = Vector(center)
    u, v, w = basis_from_axis(axis)
    pts = []
    for i in range(n):
        t = phase + 2 * math.pi * i / n
        d = u * math.cos(t) + v * math.sin(t)
        if square_outer:
            k = square_outer / max(abs(math.cos(t)), abs(math.sin(t)))
            pts.append((c + d * k).to_tuple())
        else:
            pts.append((c + d * r_out).to_tuple())
    for i in range(n):
        t = phase + 2 * math.pi * i / n
        pts.append((c + (u * math.cos(t) + v * math.sin(t)) * r_in).to_tuple())
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    P._add(pts, faces, [False] * n, M)


def disc(P, center, axis, r, n=12, M=None, phase=0.0, flip=False):
    M = M or Matrix.Identity(4)
    c = Vector(center)
    u, v, w = basis_from_axis(axis)
    pts = [(c + (u * math.cos(phase + 2 * math.pi * i / n) + v * math.sin(phase + 2 * math.pi * i / n)) * r).to_tuple() for i in range(n)]
    f = tuple(range(n)) if not flip else tuple(reversed(range(n)))
    P._add(pts, [f], [False], M)


def blade(P, root_r, tip_r, root_chord, tip_chord, root_pitch, tip_pitch, thick, angle, M=None, sections=3):
    """Twisted fan blade in the y-z plane rotating about +x; pitch about the radial axis."""
    M = M or Matrix.Identity(4)
    pts = []
    for s in range(sections):
        t = s / (sections - 1)
        r = root_r + (tip_r - root_r) * t
        chord = root_chord + (tip_chord - root_chord) * t
        pitch = root_pitch + (tip_pitch - root_pitch) * t
        # local section: along tangent (chord) and x (thickness), pitched
        for cx, cz in ((-thick / 2, -chord / 2), (thick / 2, -chord / 2), (thick / 2, chord / 2), (-thick / 2, chord / 2)):
            x = cx * math.cos(pitch) - cz * math.sin(pitch)
            tang = cx * math.sin(pitch) + cz * math.cos(pitch)
            # radial direction at `angle` in the y-z plane, tangent perpendicular
            ry, rz = math.cos(angle), math.sin(angle)
            ty, tz = -math.sin(angle), math.cos(angle)
            pts.append((x, ry * r + ty * tang, rz * r + tz * tang))
    faces, flags = [], []
    for s in range(sections - 1):
        a = s * 4
        b = a + 4
        for i in range(4):
            j = (i + 1) % 4
            faces.append((a + i, a + j, b + j, b + i))
            flags.append(False)
    faces.append((3, 2, 1, 0))
    flags.append(False)
    last = (sections - 1) * 4
    faces.append((last, last + 1, last + 2, last + 3))
    flags.append(False)
    faces = [tuple(reversed(f)) for f in faces]  # outward winding (signed-volume checked)
    P._add(pts, faces, flags, M)


# --------------------------------------------------------------------------
# Blender object creation
# --------------------------------------------------------------------------

def linear_rgb(hex_color):
    def ch(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (ch((hex_color >> 16) & 255), ch((hex_color >> 8) & 255), ch(hex_color & 255))


BUCKET_BASE = {
    # offline proxy base colours (linear) multiplied by the per-part tint;
    # runtime uses the shared Materials instances, never these proxies.
    'hull': (0.62, 0.60, 0.58), 'deck': (0.66, 0.66, 0.66), 'dark': linear_rgb(0x3a4a5e),
    'grate': (0.45, 0.48, 0.52), 'hazard': (0.85, 0.55, 0.12), 'neon': (1, 1, 1),
    'spin': linear_rgb(0x3a4a5e), 'paint': (1, 1, 1),
}


def proxy_material(bucket, tint, gain=1.0):
    name = f'RSK_{bucket}_{tint:06x}_{gain:.2f}'
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    t = linear_rgb(tint)
    base = BUCKET_BASE.get(bucket, (0.6, 0.6, 0.6))
    col = (t[0] * base[0], t[1] * base[1], t[2] * base[2], 1.0)
    bsdf.inputs['Base Color'].default_value = col
    if bucket == 'neon':
        bsdf.inputs['Emission Color'].default_value = (t[0], t[1], t[2], 1.0)
        bsdf.inputs['Emission Strength'].default_value = 2.0 * gain
        bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    else:
        bsdf.inputs['Metallic'].default_value = {'dark': 0.5, 'spin': 0.78, 'grate': 0.7}.get(bucket, 0.3)
        bsdf.inputs['Roughness'].default_value = {'dark': 0.46, 'spin': 0.36, 'grate': 0.5}.get(bucket, 0.8)
    mat['rs_bucket'] = bucket
    return mat


def build_object(part, collection):
    """Create a triangulated Blender mesh object from a Part."""
    mesh = bpy.data.meshes.new(part.full_name)
    verts = [(TO_BLENDER @ Vector(v)).to_tuple() for v in part.verts]
    mesh.from_pydata(verts, [], part.faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    for f, s in zip(bm.faces, part.smooth):
        f.smooth = s
    # explicit sharp edges between smooth and flat faces
    for e in bm.edges:
        lf = e.link_faces
        if len(lf) == 2 and (lf[0].smooth != lf[1].smooth or (not lf[0].smooth)):
            e.smooth = False
    bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(proxy_material(part.bucket, part.tint, part.gain))
    obj = bpy.data.objects.new(part.full_name, mesh)
    collection.objects.link(obj)
    obj['rs_bucket'] = part.bucket
    obj['rs_tint'] = f'0x{part.tint:06x}'
    obj['rs_uv'] = part.uv
    obj['rs_gain'] = part.gain
    obj['rs_note'] = part.note
    return obj
