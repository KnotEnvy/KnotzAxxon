"""
KnotzAxxon asset set (round 2): standard ground turret + radar tower. Final pass.

Run (Windows Blender 5.2.1 from WSL; paths converted with wslpath -w):
  blender.exe -b --factory-startup -P build_assets.py -- --out <dir> --only turret|radar|both

Authoring convention
  * Every node is authored in glTF space (X across, Y up, +Z forward).
  * Blender coordinates are derived with a fixed change of basis C4 so that
    the Blender-side blend and the exported GLB agree with glTF orientation.
    Vertices: glTF (x,y,z) -> Blender (x,-z,y).   Node matrices: M_b = C^T M_g C.
  * Each glTF node is one Blender object (mesh or empty) whose origin is the node
    pivot, so pose scripts can address nodes by name.
  * Materials are flat PBR factors (no image textures) so the GLB has no texture
    budget. Eye/emitter use emissive factors.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Matrix, Vector

TAU = 2.0 * math.pi
DEG = math.pi / 180.0


def arg(name, default=None):
    argv = sys.argv
    if "--" in argv:
        rest = argv[argv.index("--") + 1:]
        for i, v in enumerate(rest):
            if v == name and i + 1 < len(rest):
                return rest[i + 1]
    return default


# ---------------------------------------------------------------------------
# Coordinate conventions
# ---------------------------------------------------------------------------
# Blender -> glTF change of basis (rotation, det +1).  v_gltf = C4 @ v_blender
C4 = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
C4I = C4.inverted()


def G(p):
    """glTF-space point -> Blender-space point."""
    return (p[0], -p[2], p[1])


def node_matrix_b(t=(0, 0, 0), rot=(), s=(1, 1, 1)):
    """glTF local transform (translate, then rotations in order, then scale),
    returned as a Blender-space local matrix."""
    m = Matrix.Translation(Vector(t))
    for axis, ang in rot:
        ax = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}[axis]
        m = m @ Matrix.Rotation(ang, 4, Vector(ax))
    m = m @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    return C4I @ m @ C4


# ---------------------------------------------------------------------------
# Materials (glTF PBR factors; sRGB hex authored -> linear factor)
# ---------------------------------------------------------------------------
def srgb_to_linear(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def hex_lin(h):
    return (srgb_to_linear((h >> 16) & 255), srgb_to_linear((h >> 8) & 255), srgb_to_linear(h & 255), 1.0)


_mats = {}


def make_mat(name, color_hex, metallic, roughness, emit_hex=None, emit_strength=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_lin(color_hex)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emit_hex is not None:
        bsdf.inputs["Emission Color"].default_value = hex_lin(emit_hex)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    _mats[name] = m
    return m


def materials_for(kind):
    _mats.clear()
    if kind == "turret":
        return {
            "warm": make_mat("warm_armor", 0x995C48, 0.48, 0.42),
            "slate": make_mat("cool_slate", 0x526579, 0.56, 0.38),
            "dark": make_mat("dark_structure", 0x3A4A5E, 0.50, 0.46),
            "amber": make_mat("amber_eye", 0xFF8A3A, 0.0, 0.30, 0xFF8A3A, 3.0),
        }
    return {
        "warm": make_mat("warm_armor", 0x995C48, 0.48, 0.42),
        "slate": make_mat("cool_slate", 0x526579, 0.56, 0.38),
        "dark": make_mat("dark_structure", 0x3A4A5E, 0.50, 0.46),
        "dish": make_mat("dish_warm", 0x9C6A55, 0.42, 0.34),
        "green": make_mat("radar_emitter", 0x52FFA8, 0.0, 0.25, 0x52FFA8, 2.2),
    }


# ---------------------------------------------------------------------------
# Geometry builder (pure python, glTF space)
# ---------------------------------------------------------------------------
def ring_pt(r, h, ph, axis):
    c, s = math.cos(ph) * r, math.sin(ph) * r
    if axis == "y":
        return (c, h, s)
    if axis == "z":
        return (c, s, h)
    raise ValueError(axis)


class Geo:
    def __init__(self):
        self.v = []
        self.f = []

    def grid(self, rings, wrap_rings=False, caps=False):
        """rings: list of equal-length lists of points (each ring wraps around)."""
        n = len(rings)
        seg = len(rings[0])
        base = len(self.v)
        for ring in rings:
            self.v.extend(ring)

        def idx(i, j):
            return base + i * seg + (j % seg)

        last = n if wrap_rings else n - 1
        for i in range(last):
            i2 = (i + 1) % n
            for j in range(seg):
                self.f.append((idx(i, j), idx(i, j + 1), idx(i2, j + 1), idx(i2, j)))
        if caps:
            for ring_i, flip in ((0, True), (n - 1, False)):
                cidx = len(self.v)
                cx = [sum(p[k] for p in rings[ring_i]) / seg for k in range(3)]
                self.v.append(tuple(cx))
                for j in range(seg):
                    a, b = idx(ring_i, j), idx(ring_i, j + 1)
                    self.f.append((cidx, b, a) if flip else (cidx, a, b))

    def revolve(self, profile, seg, axis="y", phase=0.0, caps=False):
        rings = [[ring_pt(r, h, phase + TAU * j / seg, axis) for j in range(seg)] for (r, h) in profile]
        self.grid(rings, caps=caps)

    def revolve_closed(self, profile, seg, axis="y"):
        """Closed profile loop (e.g. a torus cross-section)."""
        rings = [[ring_pt(r, h, TAU * j / seg, axis) for j in range(seg)] for (r, h) in profile]
        self.grid(rings, wrap_rings=True)

    def tube(self, a, b, r0, r1=None, seg=8, caps=True, phase=0.0):
        a = Vector(a)
        b = Vector(b)
        r1 = r0 if r1 is None else r1
        d = (b - a).normalized()
        ref = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        u = d.cross(ref).normalized()
        w = d.cross(u).normalized()
        rings = []
        for end, r in ((a, r0), (b, r1)):
            rings.append([tuple(end + (u * math.cos(phase + TAU * j / seg) + w * math.sin(phase + TAU * j / seg)) * r)
                          for j in range(seg)])
        self.grid(rings, caps=caps)

    def hexa(self, c, U, V, W):
        """Box with centre c and half-axes U, V, W (Vectors)."""
        c = Vector(c)
        pts = []
        for i in range(8):
            sx = 1 if i & 1 else -1
            sy = 1 if i & 2 else -1
            sz = 1 if i & 4 else -1
            p = c + U * sx + V * sy + W * sz
            pts.append(tuple(p))
        base = len(self.v)
        self.v.extend(pts)
        for quad in ((0, 2, 6, 4), (1, 3, 7, 5), (0, 1, 5, 4), (2, 3, 7, 6), (0, 1, 3, 2), (4, 5, 7, 6)):
            self.f.append(tuple(base + q for q in quad))

    def sphere(self, R, rings=6, seg=12, axis="y"):
        profile = []
        for i in range(rings + 1):
            th = math.pi * i / rings
            profile.append((R * math.sin(th), R * math.cos(th)))
        self.revolve(profile, seg, axis=axis)

    def transform(self, fn):
        self.v = [tuple(fn(p)) for p in self.v]

    def to_blender_mesh(self, name, mat, smooth=False):
        me = bpy.data.meshes.new(name + "_mesh")
        me.from_pydata([G(p) for p in self.v], [], self.f)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = smooth
        return me


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------
def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def empty(name, parent=None, t=(0, 0, 0), rot=(), s=(1, 1, 1)):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = "PLAIN_AXES"
    ob.empty_display_size = 0.35
    link(ob)
    if parent is not None:
        ob.parent = parent
    ob.matrix_basis = node_matrix_b(t, rot, s)
    return ob


def mesh_node(name, geo, mat, parent=None, t=(0, 0, 0), rot=(), s=(1, 1, 1), smooth=False):
    me = geo.to_blender_mesh(name, mat, smooth=smooth)
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if parent is not None:
        ob.parent = parent
    ob.matrix_basis = node_matrix_b(t, rot, s)
    return ob


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def save_and_export(out_dir, stem):
    blend = os.path.join(out_dir, stem + ".blend")
    glb = os.path.join(out_dir, stem + ".glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=False,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print("WROTE", blend, glb, os.path.getsize(glb))


# ---------------------------------------------------------------------------
# TURRET  (glTF units; base at y=0; forward +Z)
# ---------------------------------------------------------------------------
TURRET = dict(
    base_r_bottom=1.9, base_r_top=1.6, base_h=0.9, bearing_h=0.1, bearing_r=1.5,
    turntable_y=1.0, dome_port=dict(half_x=0.40, y0=-0.20, y1=0.95, z0=0.60),
    dome_bottom_y=-0.08,
    eye=(0.0, 0.58, 1.02), eye_r=0.11, eye_lat_r=0.17, eye_geo_dy=0.12,
    pivot=(2.30, 0.15, 0.0), muzzle_z=2.80,
)


def build_turret():
    mats = materials_for("turret")
    root = empty("turret")
    T = TURRET

    # static base: octagonal plinth + bearing ring (slate), armor skirt (warm)
    g = Geo()
    # plinth top sits at y = base_h (0.90). The head's turntable is at y = 1.0, so the
    # barrel's underside clears the static top at depressions down to about -2 deg.
    g.revolve([(0, 0), (T["base_r_bottom"], 0), (T["base_r_top"], T["base_h"]), (0, T["base_h"])], 8, "y", caps=False)
    base = mesh_node("base", g, mats["slate"], parent=root)

    # eight armour plates sitting on the plinth faces, following its slope
    slope = math.atan((T["base_r_bottom"] - T["base_r_top"]) / T["base_h"])
    gp = Geo()
    ym = 0.42
    r_mid = T["base_r_bottom"] + (T["base_r_top"] - T["base_r_bottom"]) * (ym / T["base_h"])
    apo = r_mid * math.cos(math.radians(22.5))
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        u = Vector((math.cos(a), 0, math.sin(a)))
        t_ = Vector((-math.sin(a), 0, math.cos(a)))
        n = Vector((u.x * math.cos(slope), math.sin(slope), u.z * math.cos(slope))).normalized()
        face_c = u * apo + Vector((0, ym, 0))
        c = face_c + n * 0.05
        v_ = (Vector((0, 1, 0)) - n * n.y).normalized()
        gp.hexa(c, t_ * 0.30, v_ * 0.32, n * 0.07)
    mesh_node("base_armor", gp, mats["warm"], parent=base)

    # turntable (yaw group) at (0, 1, 0)
    tt = empty("turntable", parent=root, t=(0, T["turntable_y"], 0))

    # detachable dome armour: closed lathe, port cut by a boolean
    gd = Geo()
    gd.revolve([(0, -0.08), (1.15, -0.08), (1.20, 0.18), (1.02, 0.76), (0.65, 1.05), (0, 1.05)], 24, "y")
    dome = mesh_node("dome", gd, mats["warm"], parent=tt, smooth=True)
    p = T["dome_port"]
    cutter_geo = Geo()
    cutter_geo.hexa(((0.0), (p["y0"] + p["y1"]) / 2, (p["z0"] + 1.6) / 2),
                    Vector((p["half_x"], 0, 0)), Vector((0, (p["y1"] - p["y0"]) / 2, 0)),
                    Vector((0, 0, (1.6 - p["z0"]) / 2)))
    cutter = mesh_node("port_cutter", cutter_geo, mats["dark"], parent=tt)
    mod = dome.modifiers.new("port_cut", "BOOLEAN")
    mod.object = cutter
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = dome.evaluated_get(dg)
    new_me = bpy.data.meshes.new_from_object(ev)
    dome.modifiers.remove(mod)
    old = dome.data
    dome.data = new_me
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(cutter, do_unlink=True)
    # Smooth-shade the cut dome; sharp edges around the port come from the boolean.
    for pol in dome.data.polygons:
        pol.use_smooth = True
    # dark port assembly (one dark primitive): backing plate inside the port,
    # a bezel frame standing proud of the port edges, and a rear sensor block
    gb = Geo()
    py0 = T["dome_bottom_y"]
    gb.hexa((0.0, (py0 + p["y1"]) / 2, 0.0), Vector((p["half_x"], 0, 0)),
            Vector((0, (p["y1"] - py0) / 2, 0)), Vector((0, 0, 0.02)))
    for sx in (-1, 1):
        gb.hexa((sx * (p["half_x"] + 0.035), (py0 + p["y1"]) / 2, 0.92),
                Vector((0.035, 0, 0)), Vector((0, (p["y1"] - py0) / 2 + 0.02, 0)), Vector((0, 0, 0.34)))
    gb.hexa((0.0, p["y1"] + 0.03, 0.88), Vector((p["half_x"] + 0.07, 0, 0)), Vector((0, 0.035, 0)), Vector((0, 0, 0.30)))
    gb.hexa((0.0, 1.02, -0.80), Vector((0.24, 0, 0)), Vector((0, 0.13, 0)), Vector((0, 0, 0.22)))
    mesh_node("port_plate", gb, mats["dark"], parent=dome)

    # trim: collar ring at dome base, top cap, trunnion axle stubs on the pivot axis
    gt = Geo()
    gt.revolve_closed([(1.16 + 0.065 * math.cos(TAU * k / 10), 0.10 + 0.065 * math.sin(TAU * k / 10))
                       for k in range(10)], 16, "y")
    gt.revolve([(0, 1.02), (0.50, 1.02), (0.44, 1.14), (0, 1.14)], 12, "y")
    gt.tube((-1.42, 0.15, 0), (-1.10, 0.15, 0), 0.26, seg=10)
    gt.tube((1.10, 0.15, 0), (2.30, 0.15, 0), 0.26, seg=10)
    mesh_node("trim", gt, mats["slate"], parent=tt)

    # barrel pitch group at the trunnion axis
    # 'barrel' is the pitch pivot (empty); its visible tube/sleeve/muzzle is a child mesh
    barrel = empty("barrel", parent=tt, t=T["pivot"])
    gbar = Geo()
    gbar.tube((0, 0, 0.25), (0, 0, 0.80), 0.30, seg=10)
    gbar.tube((0, 0, 0.58), (0, 0, 0.74), 0.36, seg=10)  # breech clamp ring
    gbar.tube((0, 0, 0.78), (0, 0, 2.36), 0.19, seg=8)
    gbar.revolve([(0, 2.30), (0.25, 2.30), (0.25, 2.68), (0.21, 2.80), (0, 2.80)], 10, "z")
    mesh_node("barrel_visual", gbar, mats["slate"], parent=barrel)
    empty("muzzle", parent=barrel, t=(0, 0, T["muzzle_z"]))
    gbore = Geo()
    gbore.tube((0, 0, T["muzzle_z"] - 0.01), (0, 0, T["muzzle_z"] + 0.015), 0.13, seg=10)
    mesh_node("bore", gbore, mats["dark"], parent=barrel)

    # eye: node sits at the locked spec point; the lens geometry is offset upward
    # inside the node so the barrel clears it at rest, at +10 deg and at 1.45x charge
    # final pass: the lens is widened across X and Z (0.17) but keeps its vertical radius (0.11)
    # and its +0.12 geometry offset, so the vertical barrel gap is unchanged.
    ge = Geo()
    ge.sphere(T["eye_lat_r"], rings=6, seg=12, axis="z")
    k_y = T["eye_r"] / T["eye_lat_r"]
    ge.transform(lambda p: (p[0], p[1] * k_y + T["eye_geo_dy"], p[2]))
    mesh_node("eye", ge, mats["amber"], parent=tt, t=T["eye"])

    return root


# ---------------------------------------------------------------------------
# RADAR TOWER
# ---------------------------------------------------------------------------
RADAR = dict(
    dish_R=2.35, dish_y=7.2, tilt=-0.28,
    feed=(0.0, 0.42, 1.65), feed_r=0.34,
    mast_r_bottom=0.80, mast_r_top=0.46, mast_y0=1.16, mast_y1=7.0,
)


def tilt_x(p, ang=RADAR["tilt"]):
    """Rotate about X by ang (rad), the same sense as three.js rotateX."""
    x, y, z = p
    c, s = math.cos(ang), math.sin(ang)
    return (x, y * c - z * s, y * s + z * c)


def build_radar():
    mats = materials_for("radar")
    R = RADAR
    root = empty("radar")

    # static base (warm) with slate foot and top rings
    gbw = Geo()
    gbw.revolve([(0, 0.12), (2.10, 0.12), (1.80, 1.00), (0, 1.00)], 8, "y")
    mesh_node("base", gbw, mats["warm"], parent=root)
    gbt = Geo()
    gbt.revolve([(0, 0), (2.20, 0), (2.20, 0.12), (0, 0.12)], 8, "y")
    gbt.revolve([(0, 1.00), (1.90, 1.00), (1.90, 1.16), (0, 1.16)], 8, "y")
    mesh_node("base_trim", gbt, mats["slate"], parent=root)

    # static mast (slate), dark braces and dark cap
    gm = Geo()
    gm.revolve([(0, R["mast_y0"]), (R["mast_r_bottom"], R["mast_y0"]), (R["mast_r_top"], R["mast_y1"]), (0, R["mast_y1"])], 8, "y")
    mast = mesh_node("mast", gm, mats["slate"], parent=root)
    gbr = Geo()
    for a_deg in (90, 210, 330):
        a = math.radians(a_deg)
        gbr.tube((math.cos(a) * 1.62, 1.16, math.sin(a) * 1.62), (math.cos(a) * 0.58, 4.5, math.sin(a) * 0.58),
                 0.08, seg=6)
    mesh_node("mast_braces", gbr, mats["dark"], parent=mast)
    gcap = Geo()
    gcap.revolve([(0, 6.96), (0.52, 6.96), (0.52, 7.20), (0, 7.20)], 8, "y")
    mesh_node("mast_cap", gcap, mats["dark"], parent=mast)

    # dish yaw group at the mast top
    dish = empty("dish", parent=root, t=(0, R["dish_y"], 0))

    # reflector shell: baseline profile, revolved about the dish axis (Z), then tilted
    prof = [[0, 0], [.25, .015], [.60, .08], [.97, .27], [1, .31], [.98, .35], [.94, .32], [.60, .13], [.25, .07], [0, .06]]
    gdish = Geo()
    rings = []
    for (r, h) in [(r_ * R["dish_R"], h_ * R["dish_R"]) for r_, h_ in prof]:
        rings.append([tilt_x(ring_pt(r, h, TAU * j / 28, "z")) for j in range(28)])
    gdish.grid(rings, caps=False)
    mesh_node("dish_shell", gdish, mats["dish"], parent=dish, smooth=True)

    # dish frame: rear hub, central feed strut, three rim struts (baked tilt)
    gf = Geo()
    fx, fy, fz = R["feed"]
    gf.tube((0, 0, -0.44), (0, 0, 0.04), 0.60, seg=12)
    gf.tube((0, -0.10, -0.18), (fx, fy, fz), 0.10, seg=6, caps=True)
    for i in range(3):
        a = i * TAU / 3
        gf.tube((math.cos(a) * 2.05, math.sin(a) * 2.05, 0.59), (fx, fy, fz), 0.055, seg=6)
    # six radial ribs on the rear (-Z) face, following the rear profile
    chain = [(0, 0), (.25 * R["dish_R"], .015 * R["dish_R"]), (.60 * R["dish_R"], .08 * R["dish_R"]),
             (.97 * R["dish_R"], .27 * R["dish_R"]), (R["dish_R"], .31 * R["dish_R"])]

    def rear_z(r):
        for (r0, z0), (r1, z1) in zip(chain, chain[1:]):
            if r0 <= r <= r1:
                return z0 + (z1 - z0) * (r - r0) / (r1 - r0)
        return chain[-1][1]

    for k in range(6):
        phi = k * TAU / 6
        samples = [0.62, 1.20, 1.80, 2.20]
        for ra, rb in zip(samples, samples[1:]):
            a_p = Vector((ra * math.cos(phi), ra * math.sin(phi), rear_z(ra)))
            b_p = Vector((rb * math.cos(phi), rb * math.sin(phi), rear_z(rb)))
            mid = (a_p + b_p) / 2
            U = (b_p - a_p) / 2
            V = Vector((-math.sin(phi), math.cos(phi), 0)) * 0.08
            W = U.cross(V).normalized()
            if W.z > 0:
                W = -W
            center = mid + W * 0.03
            gf.hexa(center, U, V, W * 0.05)
    gf.v = [tilt_x(p) for p in gf.v]
    mesh_node("dish_frame", gf, mats["dark"], parent=dish)

    # feed housing: open slate cup (rectangular section, revolved) around the emitter
    gh = Geo()
    ring_profile = [(0.47, -0.25), (0.55, -0.25), (0.55, 0.10), (0.47, 0.10)]
    rings = []
    for (r, h) in ring_profile:
        ring = []
        for j in range(16):
            x, y, z = ring_pt(r, h, TAU * j / 16, "z")
            ring.append((x, y + fy, z + fz))  # profile heights are relative to the feed centre
        rings.append(ring)
    gh.grid(rings, wrap_rings=True)
    gh.v = [tilt_x(p) for p in gh.v]
    mesh_node("feed_housing", gh, mats["slate"], parent=dish)

    # emitter: child of dish at the exact tilted feed position, rotated -0.28 about X
    ex, ey, ez = tilt_x(R["feed"])
    ge = Geo()
    ge.sphere(R["feed_r"], rings=6, seg=12, axis="z")
    emitter = mesh_node("emitter", ge, mats["green"], parent=dish, t=(ex, ey, ez), rot=(("x", R["tilt"]),))
    return root


# ---------------------------------------------------------------------------
if __name__ == "__main__" or True:
    out = arg("--out", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    which = arg("--only", "both")
    os.makedirs(out, exist_ok=True)
    if which in ("turret", "both"):
        reset_scene()
        build_turret()
        save_and_export(out, "turret")
    if which in ("radar", "both"):
        reset_scene()
        build_radar()
        save_and_export(out, "radar")
