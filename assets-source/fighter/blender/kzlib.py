"""KnotzAxxon contest entry - shared Blender geometry/material/export library.

All modelling is expressed in GAME space (X across, Y up, fighter nose +Z,
boss front -Z) and converted to Blender (Z-up) at object-creation time with
(x, y, z) -> (x, -z, y), a pure +90 deg rotation about X.  The glTF exporter
(export_yup=True) then maps Blender back to exactly the same game-space axes.
Runs inside Blender 5.x (bpy, bmesh, mathutils, numpy).
"""
import math, json, os, sys, struct, random
import bpy, bmesh
from mathutils import Vector, Matrix

# ----------------------------------------------------------------- colour
def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hexlin(h, mul=1.0):
    r, g, b = ((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0
    return (lin(r) * mul, lin(g) * mul, lin(b) * mul, 1.0)

def G2B(p):
    return Vector((p[0], -p[2], p[1]))

# ----------------------------------------------------------------- matrices
def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
def Rx(a): return Matrix.Rotation(a, 4, 'X')
def Ry(a): return Matrix.Rotation(a, 4, 'Y')
def Rz(a): return Matrix.Rotation(a, 4, 'Z')
def S(x, y=None, z=None):
    y = x if y is None else y; z = x if z is None else z
    return Matrix.Diagonal((x, y, z, 1.0))
def XF(pos=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """three.js Euler 'XYZ' (R = Rx*Ry*Rz) then translation."""
    m = T(*pos) @ Rx(rot[0]) @ Ry(rot[1]) @ Rz(rot[2])
    if scale is not None:
        m = m @ (S(*scale) if isinstance(scale, (tuple, list)) else S(scale))
    return m
MIRX = S(-1, 1, 1)

def along(p0, p1):
    """Matrix mapping local +Z to the p0->p1 direction, origin at p0."""
    p0 = Vector(p0); d = Vector(p1) - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return T(*p0) @ q.to_matrix().to_4x4()

# ----------------------------------------------------------------- primitives
# A primitive is (verts, faces); faces are index lists, oriented outward
# (fixed afterwards with a signed-volume test for closed shapes).
def _volume(verts, faces):
    v = 0.0
    for f in faces:
        a = verts[f[0]]
        for i in range(1, len(f) - 1):
            v += a.dot(verts[f[i]].cross(verts[f[i + 1]]))
    return v / 6.0

def _orient(verts, faces):
    if _volume(verts, faces) < 0:
        faces = [list(reversed(f)) for f in faces]
    return verts, faces

def hexa(c8, ch=0.0):
    """Hexahedron from 8 corners indexed x + 2*y + 4*z (bit set = positive side),
    optionally chamfered by `ch` (26 faces)."""
    P = [Vector(c) for c in c8]
    center = sum(P, Vector()) / 8
    verts, faces = [], []
    def flip(i, a): return i ^ (1 << a)
    if ch <= 1e-6:
        verts = P
        for a in range(3):
            for s in (0, 1):
                b, c = [x for x in range(3) if x != a]
                quad = []
                for (bb, cc) in ((0, 0), (1, 0), (1, 1), (0, 1)):
                    quad.append((s << a) | (bb << b) | (cc << c))
                faces.append(quad)
    else:
        vid = {}
        for i in range(8):
            for a in range(3):
                b, c = [x for x in range(3) if x != a]
                e1 = (P[flip(i, b)] - P[i]).normalized(); e2 = (P[flip(i, c)] - P[i]).normalized()
                vid[(i, a)] = len(verts); verts.append(P[i] + (e1 + e2) * ch)
        for a in range(3):
            b, c = [x for x in range(3) if x != a]
            for s in (0, 1):
                faces.append([vid[((s << a) | (bb << b) | (cc << c), a)] for (bb, cc) in ((0, 0), (1, 0), (1, 1), (0, 1))])
        for a in range(3):
            for b in range(a + 1, 3):
                c = 3 - a - b
                for sa in (0, 1):
                    for sb in (0, 1):
                        i0 = (sa << a) | (sb << b); i1 = i0 | (1 << c)
                        faces.append([vid[(i0, a)], vid[(i1, a)], vid[(i1, b)], vid[(i0, b)]])
        for i in range(8):
            faces.append([vid[(i, 0)], vid[(i, 1)], vid[(i, 2)]])
    out = []
    for f in faces:
        n = (verts[f[1]] - verts[f[0]]).cross(verts[f[2]] - verts[f[0]])
        cen = sum((verts[i] for i in f), Vector()) / len(f)
        out.append(f if n.dot(cen - center) > 0 else list(reversed(f)))
    return verts, out

def box(w, h, d, ch=0.0, center=True):
    x, y, z = w / 2, h / 2, d / 2
    c = [(sx * x, sy * y, sz * z) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
    return hexa(c, ch)

def tbox(wb, wt, h, db, dt, ch=0.0):
    """Tapered box matching GeoUtils.taperedBox: base at y=0, top at y=h."""
    c = []
    for sz in (-1, 1):
        for sy in (0, 1):
            for sx in (-1, 1):
                w = (wt if sy else wb) / 2; d = (dt if sy else db) / 2
                c.append((sx * w, sy * h, sz * d))
    return hexa(c, ch)

def loft(rings, cap0=True, cap1=True, wrap=False):
    """Skin through rings (lists of Vectors; len 1 = apex). Orientation auto-fixed."""
    verts, faces, starts = [], [], []
    for r in rings:
        starts.append(len(verts)); verts += [Vector(p) for p in r]
    n = len(rings)
    segs = n if wrap else n - 1
    for s in range(segs):
        a, b = rings[s], rings[(s + 1) % n]
        sa, sb = starts[s], starts[(s + 1) % n]
        if len(a) == 1 and len(b) == 1: continue
        if len(a) == 1:
            for i in range(len(b)): faces.append([sa, sb + (i + 1) % len(b), sb + i])
        elif len(b) == 1:
            for i in range(len(a)): faces.append([sa + i, sa + (i + 1) % len(a), sb])
        else:
            m = len(a)
            for i in range(m):
                j = (i + 1) % m
                faces.append([sa + i, sa + j, sb + j, sb + i])
    if not wrap:
        if cap0 and len(rings[0]) > 2: faces.append(list(reversed(range(starts[0], starts[0] + len(rings[0])))))
        if cap1 and len(rings[-1]) > 2: faces.append(list(range(starts[-1], starts[-1] + len(rings[-1]))))
    return _orient(verts, faces)

def ring_c(r, z, n=16, cx=0.0, cy=0.0, ry=None, phase=0.0):
    ry = r if ry is None else ry
    return [Vector((cx + r * math.cos(phase + 2 * math.pi * i / n), cy + ry * math.sin(phase + 2 * math.pi * i / n), z)) for i in range(n)]

def ring_s(z, hw, top, bot, n=20, p=2.5, cx=0.0):
    """Superellipse section: half width hw, y from bot to top (p=2 ellipse, large p boxy)."""
    pts = []
    cy = (top + bot) / 2; ht = (top - bot) / 2
    e = 2.0 / p
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        pts.append(Vector((cx + hw * math.copysign(abs(c) ** e, c), cy + ht * math.copysign(abs(s) ** e, s), z)))
    return pts

def cyl(r0, r1, length, seg=16, caps=(True, True), z0=0.0):
    """Along +Z from z0 to z0+length, radius r0 at start, r1 at end."""
    return loft([ring_c(r0, z0, seg), ring_c(r1, z0 + length, seg)], caps[0], caps[1])

def lathe(profile, seg=16, closed_start=True):
    """profile: [(radius, z)], axis +Z.  radius 0 -> apex vertex."""
    rings = []
    for r, z in profile:
        rings.append([Vector((0, 0, z))] if r < 1e-6 else ring_c(r, z, seg))
    return loft(rings, cap0=True, cap1=True)

def sphere(rx, ry=None, rz=None, seg=16, rings=8):
    ry = rx if ry is None else ry; rz = rx if rz is None else rz
    prof = []
    for k in range(rings + 1):
        a = math.pi * k / rings
        prof.append((math.sin(a), -math.cos(a)))
    rr = []
    for r, z in prof:
        rr.append([Vector((0, 0, z * rz))] if r < 1e-6 else [Vector((p.x * rx / 1.0, p.y * ry / 1.0, z * rz)) for p in ring_c(r, 0, seg)])
    return loft(rr)

def torus(R, r, seg=24, tseg=6, ry=None, z=0.0):
    rings = []
    for k in range(tseg):
        a = 2 * math.pi * k / tseg
        rad = R + r * math.cos(a)
        rings.append(ring_c(rad, z + r * math.sin(a), seg))
    return loft(rings, wrap=True)

def prism(bottom, top):
    """Two matching polygons (lists of Vectors) -> closed solid with n-gon caps."""
    return loft([bottom, top])

def inset_poly(pts, d):
    """Offset a (near-)convex polygon of (x,z) tuples inward by d."""
    n = len(pts)
    area = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2
    sg = 1 if area > 0 else -1
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        def nrm(a, b):
            e = (b - a).normalized(); return Vector((-e.y, e.x)) * sg
        n1, n2 = nrm(p0, p1), nrm(p1, p2)
        k = 1 + n1.dot(n2)
        q = p1 + (n1 + n2) * (d / max(k, 0.25))
        out.append((q.x, q.y))
    return out

def poly_ring(pts_xz, y_of):
    return [Vector((x, y_of(x, z), z)) for (x, z) in pts_xz]

def plate_xz(pts, y_top, thick, dihedral=0.0, inset=0.0, inset_bot=None, mid=0.5):
    """Chamfered slab from an (x,z) outline.  Top surface y = y_top + |x|*dihedral."""
    inset_bot = inset if inset_bot is None else inset_bot
    f = lambda off: (lambda x, z: y_top - off + abs(x) * dihedral)
    bot = poly_ring(inset_poly(pts, inset_bot) if inset_bot > 0 else pts, f(thick))
    midr = poly_ring(pts, f(thick * mid))
    top = poly_ring(inset_poly(pts, inset) if inset > 0 else pts, f(0))
    return loft([bot, midr, top])

def poly_face(verts):
    return [Vector(v) for v in verts], [list(range(len(verts)))]

def tube(path, r, seg=6, caps=True):
    """Constant/variable-radius tube along a polyline/spline of points (game space)."""
    pts = [Vector(p) for p in path]
    rings = []
    up = Vector((0, 1, 0))
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(up)
        if a.length < 1e-3: a = t.cross(Vector((1, 0, 0)))
        a.normalize(); b = t.cross(a).normalized()
        rr = r(i / max(1, len(pts) - 1)) if callable(r) else r
        rings.append([p + (a * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * rr for k in range(seg)])
    return loft(rings, caps, caps)

def arc_pts(center, radius, a0, a1, n=12, plane='xy', z=0.0):
    """Points along a circular arc in a coordinate plane (angles in radians)."""
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        c, s = math.cos(a) * radius, math.sin(a) * radius
        if plane == 'xy': out.append(Vector((center[0] + c, center[1] + s, z)))
        elif plane == 'xz': out.append(Vector((center[0] + c, z, center[1] + s)))
        else: out.append(Vector((z, center[0] + c, center[1] + s)))
    return out

def smooth_interp(table, z):
    """table: sorted list of (z, v0, v1, ...). Cosine-eased linear interpolation."""
    if z <= table[0][0]: return list(table[0][1:])
    if z >= table[-1][0]: return list(table[-1][1:])
    for a, b in zip(table, table[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0]); t = 0.5 - 0.5 * math.cos(math.pi * t)
            return [a[i] + (b[i] - a[i]) * t for i in range(1, len(a))]

SWAP_YZ = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
SWAP_XY = Matrix(((0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1)))

# ----------------------------------------------------------------- part
class Part:
    """Collects primitives (game space) that become one Blender mesh object."""
    def __init__(self, name):
        self.name = name; self.verts = []; self.faces = []

    def add(self, prim, m=None, mat='hull', col=None, uv=None, flat=False, group=None):
        """col: RGBA tuple or callable(centroid_vec, normal_vec)->rgba.  uv: tile size (box-projected)."""
        verts, faces = prim
        m = Matrix.Identity(4) if m is None else m
        base = len(self.verts)
        tv = [m @ v for v in verts]
        self.verts += tv
        det = m.to_3x3().determinant()
        for f in faces:
            idx = [base + i for i in f]
            if det < 0: idx.reverse()
            self.faces.append(dict(idx=idx, mat=mat, col=col, uv=uv, flat=flat))
        return self

    def bounds(self):
        xs = [v.x for v in self.verts]; ys = [v.y for v in self.verts]; zs = [v.z for v in self.verts]
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

def _face_normal(vs):
    n = Vector()
    for i in range(len(vs)):
        a, b = vs[i], vs[(i + 1) % len(vs)]
        n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    return n.normalized() if n.length > 0 else Vector((0, 1, 0))

def build_object(part, mats, collection, smooth_deg=32.0, tint=None):
    """Create a Blender mesh object from a Part.  mats: dict key->bpy material."""
    me = bpy.data.meshes.new(part.name)
    bm = bmesh.new()
    keys = []
    for f in part.faces:
        if f['mat'] not in keys: keys.append(f['mat'])
    col_layer = bm.loops.layers.float_color.new("Color")
    uv_layer = None
    if any(f['uv'] for f in part.faces): uv_layer = bm.loops.layers.uv.new("UVMap")
    bv = [bm.verts.new(G2B(v)) for v in part.verts]
    for f in part.faces:
        idx = f['idx']
        # drop consecutive duplicate indices
        clean = [i for k, i in enumerate(idx) if i != idx[k - 1]]
        if len(set(clean)) < 3: continue
        try:
            face = bm.faces.new([bv[i] for i in clean])
        except ValueError:
            continue
        face.material_index = keys.index(f['mat'])
        face.smooth = not f['flat']
        gv = [part.verts[i] for i in clean]
        cen = sum(gv, Vector()) / len(gv); nrm = _face_normal(gv)
        c = f['col']
        if callable(c): c = c(cen, nrm)
        if c is None: c = (1.0, 1.0, 1.0, 1.0)
        if len(c) == 3: c = (*c, 1.0)
        for lp in face.loops:
            lp[col_layer] = c
        if uv_layer is not None and f['uv']:
            tile = f['uv']; ax = max(range(3), key=lambda k: abs(nrm[k]))
            for lp, gp in zip(face.loops, gv):
                if callable(tile): lp[uv_layer].uv = tile(gp, nrm); continue
                if ax == 0: u, v = gp.z, gp.y
                elif ax == 1: u, v = gp.x, gp.z
                else: u, v = gp.x, gp.y
                lp[uv_layer].uv = (u / tile, v / tile)
    bm.normal_update()
    lim = math.radians(smooth_deg)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = (e.calc_face_angle(0.0) <= lim) and all(fc.smooth for fc in e.link_faces)
    bm.to_mesh(me); bm.free()
    for k in keys: me.materials.append(mats[k])
    obj = bpy.data.objects.new(part.name, me)
    collection.objects.link(obj)
    return obj

# ----------------------------------------------------------------- scene helpers
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'NONE'
    sc.render.fps = 30
    sc.frame_current = 0        # every animation's frame 0 equals the rest pose, so the saved scene shows rest
    return sc

def empty(name, pos=(0, 0, 0), rot=(0, 0, 0), parent=None, collection=None, kind='PLAIN_AXES', size=0.5, scale=None, extras=None):
    """Create an Empty with GAME-space local position/rotation (three.js XYZ order)."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind; e.empty_display_size = size
    (collection or bpy.context.scene.collection).objects.link(e)
    set_local(e, pos, rot, scale)
    if parent is not None: e.parent = parent
    if extras:
        for k, v in extras.items(): e[k] = v
    return e

def game_matrix_to_blender(m):
    """Conjugate a game-space local matrix into the Blender frame (Rx90 * M * Rx90^-1)."""
    c = Rx(math.pi / 2)
    return c @ m @ c.inverted()

def set_local(obj, pos=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """Set an object's local transform from game-space pos/rot/scale.  Both a game
    child and its parent are expressed in the same rotated frame, so local
    transforms conjugate by the same +90deg X rotation."""
    m = game_matrix_to_blender(XF(pos, rot, scale))
    obj.rotation_mode = 'QUATERNION'
    loc, quat, sc = m.decompose()
    obj.location = loc; obj.rotation_quaternion = quat; obj.scale = sc

def parent_keep(obj, parent):
    """Parent where `obj` verts are already authored in the parent's GAME frame at the
    origin: vertex data are given relative to the parent's pivot by the caller."""
    obj.parent = parent

# ----------------------------------------------------------------- materials
def make_mat(name, base=(0.8, 0.8, 0.8, 1), metallic=0.0, rough=0.5, emit=None, emit_strength=1.0,
             vcol=False, alpha=None, image=None, coat=0.0, coat_rough=0.1, backface=True, extras=None, emit_image=False, emit_image_strength=0.45):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL': nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    b.inputs['Base Color'].default_value = base
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if coat > 0:
        b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = coat_rough
    if vcol:
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Color'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = base       # A
        nt.links.new(vc.outputs['Color'], mix.inputs[7])  # B
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        b.inputs['Base Color'].default_value = base
    if image is not None:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = image; tn.interpolation = 'Linear'; tn.extension = 'REPEAT'
        nt.links.new(tn.outputs['Color'], b.inputs['Base Color'])
        if emit_image:
            nt.links.new(tn.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = emit_image_strength
    if emit is not None:
        b.inputs['Base Color'].default_value = (0.0, 0.0, 0.0, 1)
        for l in list(b.inputs['Base Color'].links): nt.links.remove(l)
        b.inputs['Emission Color'].default_value = emit
        b.inputs['Emission Strength'].default_value = emit_strength
        b.inputs['Metallic'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.6
    if alpha is not None:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = backface
    if extras:
        for k, v in extras.items(): m[k] = v
    return m

def set_emission(mat, strength=None, color=None):
    b = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if strength is not None: b.inputs['Emission Strength'].default_value = strength
    if color is not None: b.inputs['Emission Color'].default_value = color

def hazard_image(name="KZ_HazardChevron", size=256):
    """Re-creation of the game's canvas hazard texture (dark ground, amber 45deg bars)."""
    import numpy as np
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'sRGB'      # must precede pixel writes: changing it later clears generated buffers
    ys, xs = np.mgrid[0:size, 0:size]
    period = size / 4.5; width = size / 9.0
    d = np.mod((xs - ys), period * 1.0)
    # distance of each pixel to nearest stripe centre along the x-axis offset
    dd = np.minimum(d, period - d)
    bar = (dd * 0.7071 * 1.0) < (width * 0.5)
    ground = np.array([0x0d, 0x11, 0x17]) / 255.0; amber = np.array([0xff, 0xb4, 0x3a]) / 255.0
    rgb = np.where(bar[..., None], amber[None, None, :], ground[None, None, :])
    rng = np.random.default_rng(0x5150)
    rgb = np.clip(rgb * (0.9 + 0.2 * rng.random((size, size, 1))), 0, 1)
    px = np.concatenate([rgb, np.ones((size, size, 1))], axis=-1).astype(np.float32)
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()
    return img

# ----------------------------------------------------------------- statistics
def eval_stats(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0; per = {}
    for o in (objs or [o for o in bpy.context.scene.objects if o.type == 'MESH']):
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        me.calc_loop_triangles(); t = len(me.loop_triangles)
        used = len({p.material_index for p in me.polygons})
        per[o.name] = dict(tris=t, primitives=used); tris += t
        ev.to_mesh_clear()
    return tris, per

# ----------------------------------------------------------------- export
def export_glb(path, animations=True, **kw):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_extras=True, export_materials='EXPORT', export_vertex_color='MATERIAL',
        export_all_vertex_colors=False, export_active_vertex_color_when_no_material=False,
        export_normals=True, export_texcoords=True, export_cameras=False, export_lights=False,
        export_animations=animations, export_animation_mode='NLA_TRACKS' if animations else 'ACTIVE_ACTIONS',
        export_force_sampling=True, export_image_format='AUTO', export_optimize_animation_size=False,
        export_skins=False, export_morph=False, **kw)

def place(obj, pos=(0, 0, 0), rot=(0, 0, 0), scale=None):
    """Set + remember the GAME-space local rest transform of an object."""
    set_local(obj, pos, rot, scale)
    obj['kz_rest_pos'] = list(pos); obj['kz_rest_rot'] = list(rot)
    obj['kz_rest_scale'] = list(scale) if isinstance(scale, (tuple, list)) else [scale if scale else 1.0] * 3
    return obj

def rest_of(obj):
    return tuple(obj.get('kz_rest_pos', (0, 0, 0))), tuple(obj.get('kz_rest_rot', (0, 0, 0))), tuple(obj.get('kz_rest_scale', (1, 1, 1)))

def pose(obj, pos=None, rot=None, scale=None):
    """Pose an object using game-space absolute local values; omitted channels use the rest value."""
    rp, rr, rs = rest_of(obj)
    set_local(obj, pos if pos is not None else rp, rot if rot is not None else rr,
              tuple(scale) if isinstance(scale, (tuple, list)) else ((scale,) * 3 if scale is not None else rs))

def animate(obj, anim_name, keys):
    """Create an action from {frame: dict(pos=,rot=,scale=)} (game-space local) and push it
    to an NLA track named anim_name so the exporter writes it as its own glTF animation.
    RULE: the key at frame 0 must equal the object's rest transform (NLA evaluation at frame 0 then
    reproduces the rest pose, which is also what the exporter records as the node's TRS)."""
    ad = obj.animation_data_create()
    act = bpy.data.actions.new(f"{anim_name}|{obj.name}")
    ad.action = act
    for fr in sorted(keys):
        k = keys[fr]
        pose(obj, k.get('pos'), k.get('rot'), k.get('scale'))
        obj.keyframe_insert('location', frame=fr)
        obj.keyframe_insert('rotation_quaternion', frame=fr)
        obj.keyframe_insert('scale', frame=fr)
    rp, rr, rs = rest_of(obj)
    pose(obj)  # back to rest
    ad.action = None
    tr = ad.nla_tracks.new(); tr.name = anim_name
    tr.strips.new(anim_name, int(min(keys)), act)   # default HOLD: frame-0 keys MUST equal the rest pose
    return act
