"""Shared helpers for the KnotzAxxon contest asset builds.

Everything is authored in *game space* (three.js travel space): X across,
Y up, fighter nose +Z, boss front -Z. Vertices and object transforms are
converted to Blender's Z-up space on creation, so the glTF exporter's +Y-up
conversion lands every node back on the exact game coordinates.

    game (x, y, z)  ->  blender (x, -z, y)

All geometry is generated from code; no external assets are loaded.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector

# game -> blender basis change and its inverse
C4 = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
C4I = C4.inverted()
C3 = C4.to_3x3()
TAU = math.tau


# --------------------------------------------------------------------------
# colour helpers
# --------------------------------------------------------------------------
def hex_srgb(h):
    return ((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def hex_lin(h, scale=1.0):
    return tuple(v * scale for v in srgb_to_linear(hex_srgb(h)))


# --------------------------------------------------------------------------
# transforms (three.js Euler order XYZ => R = Rx * Ry * Rz)
# --------------------------------------------------------------------------
def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = Matrix.Translation(Vector(loc))
    m = m @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[2], 4, 'Z')
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    m = m @ Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0)))
    return m


def to_blender_matrix(m_game):
    return C4 @ m_game @ C4I


def from_blender_matrix(m_bl):
    return C4I @ m_bl @ C4


# --------------------------------------------------------------------------
# primitive generators, all returning (verts, faces) in local game space
# --------------------------------------------------------------------------
def loft(rings, cap0=True, cap1=True):
    """Join equal-length closed rings; optional n-gon caps."""
    n = len(rings[0])
    verts = [Vector(p) for r in rings for p in r]
    faces = []
    for s in range(len(rings) - 1):
        for j in range(n):
            a, b = s * n + j, s * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    if cap0:
        faces.append(tuple(reversed(range(n))))
    if cap1:
        e = (len(rings) - 1) * n
        faces.append(tuple(range(e, e + n)))
    return verts, faces


def circle_pts(r, seg, axis='Y', at=0.0, phase=0.0, rx=None):
    """Ring of points around an axis; rx gives an elliptical second radius."""
    rx = r if rx is None else rx
    out = []
    for i in range(seg):
        a = phase + i * TAU / seg
        u, v = math.cos(a) * rx, math.sin(a) * r
        if axis == 'Y':
            out.append((u, at, v))
        elif axis == 'Z':
            out.append((u, v, at))
        else:
            out.append((at, v, u))
    return out


def cylinder(rt, rb, h, seg=16, axis='Y', phase=None):
    """three.js convention: centred, radiusTop at +axis."""
    phase = (math.pi / seg) if phase is None else phase
    return loft([circle_pts(rb, seg, axis, -h / 2, phase), circle_pts(rt, seg, axis, h / 2, phase)])


def tube(r_out, r_in, z0, z1, seg=24, phase=0.0):
    """Closed thick ring (annulus) along Z from z0 to z1."""
    o0, o1 = circle_pts(r_out, seg, 'Z', z0, phase), circle_pts(r_out, seg, 'Z', z1, phase)
    i0, i1 = circle_pts(r_in, seg, 'Z', z0, phase), circle_pts(r_in, seg, 'Z', z1, phase)
    verts = [Vector(p) for p in o0 + o1 + i1 + i0]
    faces = []
    for k in range(4):
        for j in range(seg):
            a, b = k * seg + j, k * seg + (j + 1) % seg
            c = ((k + 1) % 4) * seg
            faces.append((a, b, c + (j + 1) % seg, c + j))
    return verts, faces


def revolve(profile, seg=16, closed=True, phase=None):
    """Revolve (r, z) profile points around the Z axis.

    closed=True joins the last point back to the first (a ring section).
    Points with r == 0 collapse to a single pole vertex (solid caps).
    """
    phase = (math.pi / seg) if phase is None else phase
    verts, rows = [], []
    for r, z in profile:
        if r < 1e-6:
            verts.append(Vector((0, 0, z)))
            rows.append([len(verts) - 1] * seg)
        else:
            row = []
            for i in range(seg):
                a = phase + i * TAU / seg
                verts.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
                row.append(len(verts) - 1)
            rows.append(row)
    faces = []
    n = len(rows)
    for k in range(n if closed else n - 1):
        r0, r1 = rows[k], rows[(k + 1) % n]
        for j in range(seg):
            q = [r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]]
            u = []
            for v in q:
                if v not in u:
                    u.append(v)
            if len(u) >= 3:
                faces.append(tuple(u))
    if not closed:
        if len(set(rows[0])) > 1:
            faces.append(tuple(reversed(rows[0])))
        if len(set(rows[-1])) > 1:
            faces.append(tuple(rows[-1]))
    return verts, faces


def box(w, h, d):
    x, y, z = w / 2, h / 2, d / 2
    v = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]
    return [Vector(p) for p in v], f


def cbox(w, h, d, c=0.2):
    """Chamfered box: an octagonal prism along Z with corner cut c (absolute)."""
    x, y = w / 2, h / 2
    c = min(c, x * 0.45, y * 0.45)
    pts = [(x - c, y), (-x + c, y), (-x, y - c), (-x, -y + c), (-x + c, -y), (x - c, -y), (x, -y + c), (x, y - c)]
    return loft([[(px, py, -d / 2) for px, py in pts], [(px, py, d / 2) for px, py in pts]])


def tapered_box(wb, wt, h, db=None, dt=None):
    """GeoUtils.taperedBox: y 0..h, bottom wb x db narrowing to wt x dt."""
    db = wb if db is None else db
    dt = wt if dt is None else dt
    r0 = [(-wb / 2, 0, -db / 2), (wb / 2, 0, -db / 2), (wb / 2, 0, db / 2), (-wb / 2, 0, db / 2)]
    r1 = [(-wt / 2, h, -dt / 2), (wt / 2, h, -dt / 2), (wt / 2, h, dt / 2), (-wt / 2, h, dt / 2)]
    return loft([r0, r1])


def prism(outline, z0, z1):
    """Extrude an XY outline along Z."""
    return loft([[(x, y, z0) for x, y in outline], [(x, y, z1) for x, y in outline]])


def torus(R, r, seg=24, segr=6):
    """three.js TorusGeometry: ring in XY plane around Z."""
    verts, faces = [], []
    for i in range(seg):
        a = i * TAU / seg
        for j in range(segr):
            b = j * TAU / segr
            rr = R + r * math.cos(b)
            verts.append(Vector((rr * math.cos(a), rr * math.sin(a), r * math.sin(b))))
    for i in range(seg):
        for j in range(segr):
            a = i * segr + j
            b = ((i + 1) % seg) * segr + j
            c = ((i + 1) % seg) * segr + (j + 1) % segr
            d = i * segr + (j + 1) % segr
            faces.append((a, b, c, d))
    return verts, faces


def sphere(r, seg=12, rings=8):
    verts = [Vector((0, r, 0))]
    for i in range(1, rings):
        t = math.pi * i / rings
        for j in range(seg):
            a = j * TAU / seg
            verts.append(Vector((r * math.sin(t) * math.cos(a), r * math.cos(t), r * math.sin(t) * math.sin(a))))
    verts.append(Vector((0, -r, 0)))
    faces = []
    for j in range(seg):
        faces.append((0, 1 + (j + 1) % seg, 1 + j))
    for i in range(rings - 2):
        for j in range(seg):
            a = 1 + i * seg + j
            b = 1 + i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    last = len(verts) - 1
    base = 1 + (rings - 2) * seg
    for j in range(seg):
        faces.append((base + j, base + (j + 1) % seg, last))
    return verts, faces


def icosphere(r, subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    verts = [Vector(v.co) for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts, faces


def disc(r, seg=16, thick=0.03, cone=0.0):
    """Closed thin disc facing -Z (front face at z=0); optional cone dimple on the -Z face."""
    front = [(math.cos(i * TAU / seg) * r, math.sin(i * TAU / seg) * r, 0.0) for i in range(seg)]
    back = [(x, y, thick) for x, y, _ in front]
    verts = [Vector(p) for p in front + back] + [Vector((0, 0, cone))]
    c = len(verts) - 1
    faces = []
    for j in range(seg):
        a, b = j, (j + 1) % seg
        faces.append((a, b, b + seg, a + seg))
        faces.append((b, a, c))
    faces.append(tuple(range(seg, 2 * seg)))
    return verts, faces


# --------------------------------------------------------------------------
# mesh builder
# --------------------------------------------------------------------------
class MB:
    """Collects transformed parts with a material slot and palette cell per face."""

    def __init__(self):
        self.verts, self.faces = [], []  # faces: (idx tuple, mat, uv-or-cell)

    def add(self, prim, mat, cell=0, M=None, uvfn=None):
        verts, faces = prim
        base = len(self.verts)
        flip = M is not None and M.to_3x3().determinant() < 0
        for v in verts:
            v = Vector(v)
            if M is not None:
                v = (M @ v.to_4d()).to_3d()
            self.verts.append(v)
        for f in faces:
            idx = tuple(base + i for i in (reversed(f) if flip else f))
            self.faces.append((idx, mat, uvfn if uvfn else cell))
        return self

    def tris(self):
        return sum(len(f[0]) - 2 for f in self.faces)


def link_object(obj, parent=None, collection=None):
    (collection or bpy.context.scene.collection).objects.link(obj)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)


def empty(name, m_game=None, parent=None, size=0.3, collection=None):
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = size
    o.empty_display_type = 'PLAIN_AXES'
    link_object(o, parent, collection)
    o.matrix_basis = to_blender_matrix(m_game if m_game is not None else Matrix.Identity(4))
    return o


def mesh_object(name, mb, materials, cells_uv, m_game=None, parent=None, bevel=None,
                sharp_angle=40.0, recalc=True, collection=None, segments=2):
    """materials: list of bpy materials (slot order); cells_uv(mat, cell) -> (u, v)."""
    me = bpy.data.meshes.new(name)
    verts = [C3 @ v for v in mb.verts]
    me.from_pydata(verts, [], [f[0] for f in mb.faces])
    for m in materials:
        me.materials.append(m)
    uvl = me.uv_layers.new(name='UVMap')
    for poly, (idx, mat, cell) in zip(me.polygons, mb.faces):
        poly.material_index = mat
        if callable(cell):
            for li, vi in zip(poly.loop_indices, idx):
                uvl.data[li].uv = cell(mb.verts[vi], poly.normal)
        else:
            uv = cells_uv(mat, cell)
            for li in poly.loop_indices:
                uvl.data[li].uv = uv
    me.validate(clean_customdata=False)
    if recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(sharp_angle))
    obj = bpy.data.objects.new(name, me)
    link_object(obj, parent, collection)
    obj.matrix_basis = to_blender_matrix(m_game if m_game is not None else Matrix.Identity(4))
    if bevel:
        mod = obj.modifiers.new('chamfer', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(sharp_angle)
        mod.harden_normals = True
        mod.use_clamp_overlap = True
        mod.miter_outer = 'MITER_ARC'
    return obj


# --------------------------------------------------------------------------
# materials and generated textures (packed into the .blend and the GLB)
# --------------------------------------------------------------------------
class Palette:
    """A tiny colour atlas: each cell is a flat colour, faces map to a cell centre."""

    def __init__(self, name, colors, cols=4, cell=8):
        self.colors, self.cols, self.cell = colors, cols, cell
        self.rows = max(1, math.ceil(len(colors) / cols))
        rows_p2 = 1
        while rows_p2 < self.rows:
            rows_p2 *= 2
        self.rows = rows_p2
        w, h = cols * cell, self.rows * cell
        img = bpy.data.images.new(name, w, h, alpha=False)
        px = [0.0] * (w * h * 4)
        for i, c in enumerate(colors):
            r, g, b = hex_srgb(c)
            cx, cy = i % cols, i // cols
            for yy in range(cy * cell, (cy + 1) * cell):
                for xx in range(cx * cell, (cx + 1) * cell):
                    k = (yy * w + xx) * 4
                    px[k:k + 4] = [r, g, b, 1.0]
        img.pixels = px
        img.filepath_raw = '//' + name + '.png'
        img.file_format = 'PNG'
        img.pack()
        self.image = img

    def uv(self, i):
        return ((i % self.cols) + 0.5) / self.cols, ((i // self.cols) + 0.5) / self.rows


def hazard_image(name, size=128, stripes=4):
    """Diagonal amber/black chevron stripes."""
    img = bpy.data.images.new(name, size, size, alpha=False)
    amber, black = hex_srgb(0xf0a02c), hex_srgb(0x16171b)
    px = [0.0] * (size * size * 4)
    period = size / stripes
    for y in range(size):
        for x in range(size):
            c = amber if ((x + y) % period) < period / 2 else black
            k = (y * size + x) * 4
            px[k:k + 4] = [c[0], c[1], c[2], 1.0]
    img.pixels = px
    img.filepath_raw = '//' + name + '.png'
    img.file_format = 'PNG'
    img.pack()
    return img


def material(name, base=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5, base_img=None,
             emission=None, emission_img=None, strength=1.0, alpha=None, unlit_black=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*base, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if base_img is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = base_img
        t.interpolation = 'Closest'
        t.location = (-500, 200)
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if emission is not None or emission_img is not None:
        bsdf.inputs['Emission Strength'].default_value = strength
        if emission_img is not None:
            t2 = nt.nodes.new('ShaderNodeTexImage')
            t2.image = emission_img
            t2.interpolation = 'Closest'
            t2.location = (-500, -200)
            nt.links.new(t2.outputs['Color'], bsdf.inputs['Emission Color'])
        else:
            bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
        m.use_backface_culling = False
    m.diffuse_color = (*base, 1.0) if emission is None else (*[min(1, e) for e in emission], 1.0)
    return m


# --------------------------------------------------------------------------
# animation via NLA tracks (tracks with equal names merge into one glTF clip)
# --------------------------------------------------------------------------
FPS = 30


def key_pose(obj, frame, m_game):
    obj.matrix_basis = to_blender_matrix(m_game)
    obj.keyframe_insert('location', frame=frame)
    obj.keyframe_insert('rotation_quaternion', frame=frame)
    obj.keyframe_insert('scale', frame=frame)


def add_clip(clip, obj, keys, interp='LINEAR'):
    """keys: list of (seconds, game matrix). Leaves the object at its rest matrix."""
    rest = obj.matrix_basis.copy()
    obj.rotation_mode = 'QUATERNION'
    ad = obj.animation_data or obj.animation_data_create()
    act = bpy.data.actions.new(f'{clip}__{obj.name}')
    ad.action = act
    for t, m in keys:
        key_pose(obj, round(t * FPS), m)
    try:
        for fc in _fcurves(act):
            for kp in fc.keyframe_points:
                kp.interpolation = interp
    except Exception:
        pass
    slot = getattr(ad, 'action_slot', None)
    ad.action = None
    track = ad.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, 0, act)
    if slot is not None and hasattr(strip, 'action_slot'):
        try:
            strip.action_slot = slot
        except Exception:
            pass
    track.mute = True
    obj.matrix_basis = rest
    return act


def _fcurves(act):
    if hasattr(act, 'fcurves') and len(getattr(act, 'fcurves', [])):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


# --------------------------------------------------------------------------
# stats (evaluated, i.e. after modifiers) in game space
# --------------------------------------------------------------------------
def evaluated_stats(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    tris = prims = 0
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    per = {}
    for o in objs:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        me.calc_loop_triangles()
        used = {p.material_index for p in me.polygons}
        n = len(me.loop_triangles)
        tris += n
        prims += len(used)
        mw = from_blender_matrix(oe.matrix_world) @ C4I  # blender-local -> game world
        for v in me.vertices:
            p = (mw @ v.co.to_4d()).to_3d()
            for k in range(3):
                lo[k] = min(lo[k], p[k])
                hi[k] = max(hi[k], p[k])
        per[o.name] = {'triangles': n, 'primitives': len(used),
                       'materials': sorted({o.material_slots[i].material.name for i in used if o.material_slots[i].material})}
        oe.to_mesh_clear()
    return {'triangles': tris, 'primitives': prims, 'min': [round(v, 4) for v in lo],
            'max': [round(v, 4) for v in hi], 'size': [round(hi[k] - lo[k], 4) for k in range(3)], 'objects': per}


def game_world(obj):
    return from_blender_matrix(obj.matrix_world)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.unit_settings.system = 'METRIC'
    return sc


def export_glb(path, objects_root=None):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_optimize_animation_size=True, export_materials='EXPORT', export_image_format='AUTO',
        export_texcoords=True, export_normals=True, export_tangents=False, export_extras=True,
        export_cameras=False, export_lights=False, export_def_bones=False, export_skins=False,
        export_morph=False, export_vertex_color='NONE', export_frame_range=False,
        export_nla_strips_merged_animation_name='Animation', export_copyright='KnotzAxxon contest entry',
    )
