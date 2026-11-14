"""Shared geometry, atlas and export helpers for the silo and fuel-cell generators.

Everything is authored in Blender space (Z up). glTF export with +Y up maps
Blender (x, y, z) to glTF (x, z, -y), so glTF +Z forward is Blender -Y.
"""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

TAU = math.tau


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def srgb(hexstr):
    h = hexstr.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


# --------------------------------------------------------------------------
# Texture atlas (base colour + glTF metallic/roughness), painted with numpy.
# Arrays are indexed [row_from_bottom, column] so v = row / size.
# --------------------------------------------------------------------------

def vnoise(h, w, cell, rng, periodic_x=True):
    gh = h // cell + 2
    gw = max(1, w // cell)
    g = rng.random((gh, gw + 1))
    if periodic_x:
        g[:, gw] = g[:, 0]
    y = np.arange(h) / cell
    x = np.arange(w) / cell
    y0 = np.floor(y).astype(int)
    x0 = np.floor(x).astype(int) % gw
    fy = (y - np.floor(y))[:, None]
    fx = (x - np.floor(x))[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(h, w, rng, cells=(64, 24, 8), weights=(0.55, 0.3, 0.15)):
    out = np.zeros((h, w))
    for c, wt in zip(cells, weights):
        out += wt * vnoise(h, w, c, rng)
    return out - 0.5


class Atlas:
    """A packed palette: flat swatches plus a few painted regions."""

    CELL = 64

    def __init__(self, name, size, seed):
        self.name = name
        self.S = size
        self.col = np.zeros((size, size, 3))
        self.mr = np.zeros((size, size, 3))
        self.mr[..., 0] = 1.0  # unused R (occlusion slot) kept white
        self.sw = {}
        self.reg = {}
        self.rng = np.random.default_rng(seed)

    def swatch(self, name, index, color, metal, rough, noise=0.025):
        per_row = self.S // self.CELL
        cx, cy = index % per_row, index // per_row
        x0, y0 = cx * self.CELL, cy * self.CELL
        c = srgb(color) if isinstance(color, str) else np.asarray(color)
        n = fbm(self.CELL, self.CELL, self.rng, cells=(16, 6, 2)) * noise * 2
        self.col[y0:y0 + self.CELL, x0:x0 + self.CELL] = np.clip(c[None, None, :] + n[..., None], 0, 1)
        self.mr[y0:y0 + self.CELL, x0:x0 + self.CELL, 1] = rough
        self.mr[y0:y0 + self.CELL, x0:x0 + self.CELL, 2] = metal
        self.sw[name] = ((x0 + self.CELL / 2) / self.S, (y0 + self.CELL / 2) / self.S)

    def region(self, name, x0, y0, x1, y1):
        self.reg[name] = (x0, y0, x1, y1)
        return (slice(y0, y1), slice(x0, x1))

    def ruv(self, name, u, v, margin=4):
        """Region-relative (0..1) to atlas UV, inset by a few texels against bleeding."""
        x0, y0, x1, y1 = self.reg[name]
        m = margin
        return ((x0 + m + u * (x1 - x0 - 2 * m)) / self.S, (y0 + m + v * (y1 - y0 - 2 * m)) / self.S)

    def images(self, folder):
        imgs = []
        for suffix, arr, cs in (('BaseColor', self.col, 'sRGB'), ('MetalRough', self.mr, 'Non-Color')):
            nm = f'{self.name}_{suffix}'
            img = bpy.data.images.new(nm, self.S, self.S, alpha=False)
            img.colorspace_settings.name = cs  # must precede pixel writes (changing it regenerates the buffer)
            rgba = np.ones((self.S, self.S, 4), dtype=np.float32)
            rgba[..., :3] = np.clip(arr, 0, 1)
            img.pixels.foreach_set(rgba.ravel())
            img.update()
            path = f'{folder}\\{nm}.png' if '\\' in folder else f'{folder}/{nm}.png'
            img.filepath_raw = path
            img.file_format = 'PNG'
            img.save()
            img.pack()
            imgs.append(img)
        return imgs


def hull_material(name, base_img, mr_img):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    t1 = nt.nodes.new('ShaderNodeTexImage')
    t1.image = base_img
    t1.location = (-600, 300)
    t2 = nt.nodes.new('ShaderNodeTexImage')
    t2.image = mr_img
    t2.location = (-600, -100)
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    sep.location = (-300, -100)
    nt.links.new(t1.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(t2.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    return m


def glow_material(name, color_hex, strength):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    c = srgb(color_hex)
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.5
    bsdf.inputs['Emission Color'].default_value = (*lin, 1)
    bsdf.inputs['Emission Strength'].default_value = strength
    m.diffuse_color = (*lin, 1)
    return m


# --------------------------------------------------------------------------
# Mesh accumulator with per-loop UVs and material slots.
# --------------------------------------------------------------------------

class MB:
    def __init__(self, atlas):
        self.atlas = atlas
        self.v = []
        self.f = []  # (indices, uvs, mat)

    def vert(self, p):
        self.v.append(tuple(float(c) for c in p))
        return len(self.v) - 1

    def face(self, pts, uvs, mat=0):
        idx = [self.vert(p) for p in pts]
        self.f.append((idx, list(uvs), mat))

    def face_idx(self, idx, uvs, mat=0):
        self.f.append((list(idx), list(uvs), mat))

    # ---- UV helpers -------------------------------------------------------
    def uv_style(self, style, pts, normal):
        a = self.atlas
        if style[0] == 'sw':
            return [a.sw[style[1]]] * len(pts)
        if style[0] == 'plan':  # per-face planar projection centred in a region
            _, reg, metres = style[:3]
            n = Vector(normal)
            up = Vector((0, 0, 1))
            t = up.cross(n) if abs(n.z) < 0.9 else Vector((1, 0, 0))
            if t.length < 1e-6:
                t = Vector((1, 0, 0))
            t.normalize()
            b = n.cross(t).normalized()
            c = sum((Vector(p) for p in pts), Vector()) / len(pts)
            jit = Vector(((hash((round(c.x, 2), round(c.y, 2))) % 97) / 97 - 0.5,
                          (hash((round(c.z, 2), round(c.x, 2))) % 89) / 89 - 0.5)) * 0.3
            out = []
            for p in pts:
                d = Vector(p) - c
                u = 0.5 + jit.x + d.dot(t) / metres
                v = 0.5 + jit.y + d.dot(b) / metres
                out.append(a.ruv(reg, min(max(u, 0), 1), min(max(v, 0), 1)))
            return out
        raise ValueError(style)

    def poly(self, pts, style, mat=0, normal=None):
        if normal is None:
            normal = newell(pts)
        self.face(pts, self.uv_style(style, pts, normal), mat)

    def merge(self, other):
        off = len(self.v)
        self.v.extend(other.v)
        for idx, uvs, m in other.f:
            self.f.append(([i + off for i in idx], uvs, m))

    def transformed(self, matrix):
        out = MB(self.atlas)
        out.v = [tuple(matrix @ Vector(p)) for p in self.v]
        out.f = [(list(i), list(u), m) for i, u, m in self.f]
        if matrix.determinant() < 0:
            out.f = [(i[::-1], u[::-1], m) for i, u, m in out.f]
        return out

    def to_object(self, name, materials, parent=None, location=(0, 0, 0), sharp_deg=34.0):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], [f[0] for f in self.f])
        me.validate(clean_customdata=False)
        uvl = me.uv_layers.new(name='UVMap')
        flat_uv = []
        for f in self.f:
            flat_uv.extend(f[1])
        assert len(flat_uv) == len(me.loops), (name, len(flat_uv), len(me.loops))
        uvl.data.foreach_set('uv', [c for uv in flat_uv for c in uv])
        me.polygons.foreach_set('material_index', [f[2] for f in self.f])
        for m in materials:
            me.materials.append(m)
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = location
        if parent is not None:
            ob.parent = parent
        return ob


def newell(pts):
    n = Vector()
    for i in range(len(pts)):
        a = Vector(pts[i])
        b = Vector(pts[(i + 1) % len(pts)])
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))


# --------------------------------------------------------------------------
# Lathe (surfaces of revolution) with per-profile-segment UV styles.
# style kinds: ('sw', name) | ('tile', region, segs_per_tile, v0, v1)
#              | ('arc', region, v0, v1)  (u spans the whole arc a0..a1)
# --------------------------------------------------------------------------

def lathe(mb, profile, styles, seg, a0=0.0, a1=TAU, mat=0, caps=False, cap_style=None):
    full = abs((a1 - a0) - TAU) < 1e-9
    nring = seg if full else seg + 1
    angs = [a0 + (a1 - a0) * i / seg for i in range(nring)]
    rings = []
    for (r, z) in profile:
        if r < 1e-9:
            rings.append([mb.vert((0, 0, z))])
        else:
            rings.append([mb.vert((r * math.cos(a), r * math.sin(a), z)) for a in angs])
    if not isinstance(styles, list):
        styles = [styles] * (len(profile) - 1)
    if isinstance(mat, int):
        mats = [mat] * (len(profile) - 1)
    else:
        mats = mat
    for j in range(len(profile) - 1):
        st = styles[j]
        if st is None:
            continue
        A, B = rings[j], rings[j + 1]
        for i in range(seg):
            i1 = (i + 1) % nring if full else i + 1
            fa, fb = i / seg, (i + 1) / seg

            def uvs_for(n):
                if st[0] == 'sw':
                    return [mb.atlas.sw[st[1]]] * n
                if st[0] == 'tile':
                    _, reg, per, v0, v1 = st
                    k = i % per
                    ua, ub = k / per, (k + 1) / per
                elif st[0] == 'arc':
                    _, reg, v0, v1 = st
                    ua, ub = fa, fb
                else:
                    raise ValueError(st)
                # quad loop order: A[i], A[i1], B[i1], B[i]
                q = [(ua, v0), (ub, v0), (ub, v1), (ua, v1)]
                return [mb.atlas.ruv(reg, u, v) for u, v in q]

            if len(A) == 1 and len(B) == 1:
                continue
            if len(A) == 1:
                uv = uvs_for(4)
                mb.face_idx([A[0], B[i1], B[i]], [uv[0], uv[2], uv[3]], mats[j])
            elif len(B) == 1:
                uv = uvs_for(4)
                mb.face_idx([A[i], A[i1], B[0]], [uv[0], uv[1], uv[2]], mats[j])
            else:
                mb.face_idx([A[i], A[i1], B[i1], B[i]], uvs_for(4), mats[j])
    if caps and not full:
        # end caps for a closed profile loop at a0 and a1
        for ang, flip in ((a0, False), (a1, True)):
            pts = [(r * math.cos(ang), r * math.sin(ang), z) for r, z in profile]
            if profile[0] == profile[-1]:
                pts = pts[:-1]
            if flip:  # profile loop is CCW in (r, z): outward at a0, reversed at a1
                pts = pts[::-1]
            mb.poly(pts, cap_style or ('sw', 'edge'), mats[0])
    return rings


# --------------------------------------------------------------------------
# Convex chamfered solids: hull -> inset every face in its plane -> hull.
# Original faces receive `main`; generated bevel faces receive `edge`.
# --------------------------------------------------------------------------

def _hull(points):
    bm = bmesh.new()
    seen = set()
    for p in points:
        key = tuple(round(c, 6) for c in p)
        if key in seen:
            continue
        seen.add(key)
        bm.verts.new(p)
    bm.verts.ensure_lookup_table()
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    junk = list({g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)})
    if junk:
        bmesh.ops.delete(bm, geom=junk, context='VERTS')
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.3), verts=list(bm.verts), edges=list(bm.edges))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return bm


def chamfer_solid(mb, points, c, main, edge, mat=0, main_by_normal=None):
    bm = _hull(points)
    normals = []
    inset_pts = []
    for f in bm.faces:
        n = f.normal.copy()
        normals.append(n)
        vs = [v.co.copy() for v in f.verts]
        k = len(vs)
        for i in range(k):
            p, a, b = vs[i], vs[i - 1], vs[(i + 1) % k]
            e1 = (p - a).normalized()
            e2 = (b - p).normalized()
            m1 = n.cross(e1).normalized()
            m2 = n.cross(e2).normalized()
            denom = 1 + m1.dot(m2)
            inset_pts.append(p + (m1 + m2) * (c / max(denom, 0.2)) if c > 0 else p)
    bm.free()
    bm2 = _hull(inset_pts)
    for f in bm2.faces:
        n = f.normal
        pts = [tuple(v.co) for v in f.verts]
        is_main = any(n.dot(o) > 0.9995 for o in normals)
        st = main if is_main else edge
        if is_main and main_by_normal:
            st = main_by_normal(n) or main
        mb.poly(pts, st, mat, normal=n)
    bm2.free()


def box_pts(sx, sy, sz, center=(0, 0, 0)):
    cx, cy, cz = center
    return [(cx + x * sx / 2, cy + y * sy / 2, cz + z * sz / 2)
            for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]


def xform_pts(pts, matrix):
    return [tuple(matrix @ Vector(p)) for p in pts]


def frame_matrix(origin, x_axis, z_axis):
    """Orthonormal frame with given X and approximately given Z."""
    x = Vector(x_axis).normalized()
    z = Vector(z_axis)
    y = z.cross(x).normalized()
    z = x.cross(y).normalized()
    m = Matrix.Identity(4)
    m.col[0][:3] = x
    m.col[1][:3] = y
    m.col[2][:3] = z
    m.col[3][:3] = Vector(origin)
    return m


# --------------------------------------------------------------------------
# Tubes, tori, bolts
# --------------------------------------------------------------------------

def tube(mb, path, radius, seg, style, mat=0, cap_start=True, cap_end=True, cap_style=None):
    """Sweep a circle along a polyline (parallel transport frames)."""
    P = [Vector(p) for p in path]
    T = []
    for i in range(len(P)):
        if i == 0:
            t = P[1] - P[0]
        elif i == len(P) - 1:
            t = P[-1] - P[-2]
        else:
            t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        T.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(T[0].z) < 0.9 else Vector((1, 0, 0))
    N = ref.cross(T[0]).normalized()
    rings = []
    for i, p in enumerate(P):
        if i > 0:
            q = T[i - 1].rotation_difference(T[i])
            N = (q @ N).normalized()
        Bv = T[i].cross(N).normalized()
        scale = 1.0
        if 0 < i < len(P) - 1:
            d1 = (P[i] - P[i - 1]).normalized()
            cosh = max(d1.dot(T[i]), 0.3)
            scale = 1.0 / cosh
        ring = []
        for k in range(seg):
            a = TAU * k / seg
            off = N * math.cos(a) + Bv * math.sin(a)
            # mitre: stretch along the bend direction
            if scale != 1.0:
                proj = off - T[i] * off.dot(T[i])
                off = proj
                bend = (P[i + 1] - P[i]).normalized() - (P[i] - P[i - 1]).normalized()
                if bend.length > 1e-6:
                    bend = (bend - T[i] * bend.dot(T[i])).normalized()
                    comp = off.dot(bend)
                    off = off + bend * comp * (scale - 1)
            ring.append(mb.vert(p + off * radius))
        rings.append(ring)
    uv = [mb.atlas.sw[style[1]]] * 4
    for i in range(len(rings) - 1):
        A, B = rings[i], rings[i + 1]
        for k in range(seg):
            k1 = (k + 1) % seg
            mb.face_idx([A[k], A[k1], B[k1], B[k]], uv, mat)
    cs = [mb.atlas.sw[(cap_style or style)[1]]]
    if cap_start:
        mb.face_idx(rings[0][::-1], cs * seg, mat)
    if cap_end:
        mb.face_idx(rings[-1], cs * seg, mat)


def fillet_path(points, r, steps=4):
    P = [Vector(p) for p in points]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d1 = (b - a).normalized()
        d2 = (c - b).normalized()
        ang = d1.angle(d2)
        if ang < 1e-3:
            out.append(b)
            continue
        t = r * math.tan(ang / 2)
        p0 = b - d1 * t
        p1 = b + d2 * t
        for s in range(steps + 1):
            u = s / steps
            # quadratic bezier approximates the arc well enough for small radii
            q = p0 * (1 - u) ** 2 + b * 2 * u * (1 - u) + p1 * u * u
            out.append(q)
    out.append(P[-1])
    return out


def torus(mb, R, r, seg, rseg, style, mat=0, matrix=None):
    m = matrix or Matrix.Identity(4)
    rings = []
    for i in range(seg):
        a = TAU * i / seg
        ring = []
        for j in range(rseg):
            b = TAU * j / rseg
            p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
            ring.append(mb.vert(m @ p))
        rings.append(ring)
    uv = [mb.atlas.sw[style[1]]] * 4
    for i in range(seg):
        A, B = rings[i], rings[(i + 1) % seg]
        for j in range(rseg):
            j1 = (j + 1) % rseg
            mb.face_idx([A[j], B[j], B[j1], A[j1]], uv, mat)


def bolt(mb, matrix, r=0.045, h=0.035, style=('sw', 'bolt'), mat=0, sides=6):
    """Hex bolt head as a frustum: the narrower top reads as a bevel highlight; no hidden underside."""
    lo, hi = [], []
    for k in range(sides):
        a = TAU * k / sides + math.pi / sides
        lo.append(mb.vert(matrix @ Vector((r * math.cos(a), r * math.sin(a), 0.0))))
        hi.append(mb.vert(matrix @ Vector((0.74 * r * math.cos(a), 0.74 * r * math.sin(a), h))))
    uv = [mb.atlas.sw[style[1]]] * 4
    for k in range(sides):
        k1 = (k + 1) % sides
        mb.face_idx([lo[k], lo[k1], hi[k1], hi[k]], uv, mat)
    mb.face_idx(hi, [mb.atlas.sw[style[1]]] * sides, mat)


def place(origin, angle_z, tilt=0.0):
    """Matrix: rotate about Z by angle, optional tilt about local Y, then translate."""
    return Matrix.Translation(origin) @ Matrix.Rotation(angle_z, 4, 'Z') @ Matrix.Rotation(tilt, 4, 'Y')


def make_empty(name, parent=None, location=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.25
    bpy.context.scene.collection.objects.link(e)
    e.location = location
    if parent is not None:
        e.parent = parent
    return e


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False, use_visible=False,
        export_yup=True, export_apply=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials='EXPORT', export_image_format='AUTO',
        export_animations=False, export_extras=True, export_cameras=False, export_lights=False,
        export_vertex_color='NONE')
