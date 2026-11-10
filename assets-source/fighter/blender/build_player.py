"""Build the KnotzAxxon hero interceptor ("player") in Blender and export player.blend / player.glb.

Run (Windows Blender from WSL, see README):
    blender.exe -b --factory-startup --python build_player.py -- <output-dir>

Game-space axes: X across, Y up, nose +Z.  Every coordinate below is in game space
(see kzlib.py for the single place where it is converted to Blender space).
"""
import sys, os, math, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
import kzlib as K
from kzlib import (hexlin, XF, T, Rx, Ry, Rz, S, MIRX, SWAP_XY, along, Part, build_object, make_mat, empty, place,
                   box, tbox, loft, ring_c, ring_s, cyl, lathe, sphere, torus, plate_xz, tube, arc_pts, smooth_interp)

SIL, IVO, SLA, GLD = hexlin(0x91acbd), hexlin(0xd6e1e4), hexlin(0x47637b), hexlin(0xeeb369)
DARK = hexlin(0x2c3d52)

# --------------------------------------------------------------------------------------
# Fuselage definition: (z, half width, top, bottom, superellipse exponent)
FUS = [(-2.40, .30, .15, -.21, 2.2), (-2.30, .40, .20, -.28, 2.4), (-1.90, .58, .38, -.38, 2.6),
       (-1.65, .69, .46, -.43, 2.6), (-1.20, .74, .53, -.46, 2.7), (-.55, .78, .56, -.48, 2.7),
       (.20, .70, .55, -.43, 2.6), (.50, .65, .52, -.39, 2.6), (.90, .56, .44, -.34, 2.5),
       (1.30, .49, .35, -.28, 2.4), (1.80, .36, .24, -.21, 2.2), (2.35, .24, .12, -.15, 2.1),
       (2.85, .10, .04, -.075, 2.0)]
NOSE_TIP = Vector((0, -.018, 3.04))
GLASS = [(-.68, .18, .59, .50, 2.2), (-.52, .32, .80, .50, 2.3), (-.25, .395, 1.00, .50, 2.2),
         (.15, .385, .99, .50, 2.2), (.60, .32, .86, .44, 2.2), (1.00, .24, .64, .36, 2.2),
         (1.30, .15, .45, .30, 2.2)]
GLASS_TIP = Vector((0, .335, 1.56))


def fus_at(z):
    return smooth_interp(FUS, z)


def fuselage_colour(c, n):
    if c.z > 2.2: return IVO
    if -2.04 < c.z < -1.92: return GLD
    if abs(c.x) < .24 and n.y > .55 and c.z < -.7: return SLA
    return SIL


def build(out_dir):
    sc = K.reset_scene()
    col = sc.collection
    mats = dict(
        hull=make_mat('KZ_PlayerHull', (1, 1, 1, 1), metallic=.52, rough=.34, vcol=True,
                      extras=dict(kz_runtime='mats.playerHull')),
        accent=make_mat('KZ_PlayerAccent', hexlin(0x233548), metallic=.58, rough=.38, extras=dict(kz_runtime='mats.playerAccent')),
        glass=make_mat('KZ_PlayerGlass', hexlin(0x123e52), metallic=.58, rough=.16, coat=1.0, coat_rough=.08,
                       extras=dict(kz_runtime='mats.glass')),
        neon=make_mat('KZ_NeonCyan', None or (0, 0, 0, 1), emit=hexlin(0x52bdcf), emit_strength=1.0,
                      extras=dict(kz_runtime='player neon bucket (MeshBasic vertex colour 0x52bdcf)')),
        navp=make_mat('KZ_NavPort', (0, 0, 0, 1), emit=hexlin(0xff4563), emit_strength=1.0,
                      extras=dict(kz_runtime='player neon bucket (0xff4563, -X wingtip)')),
        navs=make_mat('KZ_NavStarboard', (0, 0, 0, 1), emit=hexlin(0x65dfac), emit_strength=1.0,
                      extras=dict(kz_runtime='player neon bucket (0x65dfac, +X wingtip)')),
        engine=make_mat('KZ_EngineGlow', (0, 0, 0, 1), emit=hexlin(0x8fe4ff), emit_strength=1.35,
                        extras=dict(kz_runtime='mats.neon(0x8fe4ff, 1.35)')),
    )
    root = empty('hero-interceptor', collection=col, kind='ARROWS', size=1.0,
                 extras=dict(kz_runtime='buildShip() group'))

    hull = Part('airframe-hull'); acc = Part('airframe-accent'); gls = Part('airframe-glass')
    neon = Part('airframe-neon'); navp = Part('airframe-nav-port'); navs = Part('airframe-nav-starboard')

    # ---------------------------------------------------------------- fuselage
    zs = [-2.40, -2.30, -2.12, -1.90, -1.65, -1.40, -1.15, -.85, -.55, -.20, .20, .50, .90, 1.30, 1.80, 2.35, 2.85]
    rings = []
    for z in zs:
        hw, top, bot, p = fus_at(z)
        rings.append(ring_s(z, hw, top, bot, n=24, p=p))
    rings.append([NOSE_TIP])
    hull.add(loft(rings), mat='hull', col=fuselage_colour)

    # dorsal spine fairing (slate) running into the canopy, ventral keel (dark)
    spine = [(-2.25, .20, .26, .12, 2.3), (-1.95, .30, .44, .22, 2.4), (-1.35, .42, .60, .36, 2.5),
             (-.80, .40, .64, .44, 2.5), (-.50, .30, .62, .50, 2.4)]
    rr = []
    for z in [-2.25, -2.0, -1.7, -1.35, -1.0, -.75, -.5]:
        h, t, b, p = smooth_interp(spine, z); rr.append(ring_s(z, h, t, b, n=18, p=p))
    hull.add(loft(rr), mat='hull', col=SLA)
    keel = [(-1.95, .06, -.30, -.40, 2.4), (-1.2, .10, -.40, -.50, 2.4), (-.4, .13, -.40, -.57, 2.4),
            (.6, .11, -.30, -.50, 2.4), (1.7, .05, -.20, -.26, 2.2)]
    rr = []
    for z in [-1.95, -1.6, -1.2, -.8, -.4, 0, .6, 1.1, 1.7]:
        h, t, b, p = smooth_interp(keel, z); rr.append(ring_s(z, h, t, b, n=14, p=p))
    acc.add(loft(rr), mat='accent')
    # ivory belt collars (manufactured seams) and aft cap
    for z0 in (-1.0, 1.05):
        a = fus_at(z0); b = fus_at(z0 + .05)
        r0 = ring_s(z0, a[0] * 1.014, a[1] + .008, a[2] - .008, n=24, p=a[3])
        r1 = ring_s(z0 + .05, b[0] * 1.014, b[1] + .008, b[2] - .008, n=24, p=b[3])
        acc.add(loft([r0, r1], False, False, wrap=False), mat='accent')
    # tail cap: recessed dark plate with a gold bar, so the aft view reads as built hardware
    tail = ring_s(-2.41, .24, .09, -.15, n=24, p=2.2)
    acc.add(K.poly_face(list(reversed(tail))), mat='accent')
    hull.add(box(.30, .028, .04, ch=.006), XF((0, -.03, -2.405)), mat='hull', col=GLD)
    # nose probe
    hull.add(cyl(.020, .012, .24, 8, z0=2.95), mat='hull', col=IVO)

    # ---------------------------------------------------------------- canopy
    gz = [-.68, -.52, -.25, .15, .60, 1.00, 1.30]
    grings = [ring_s(z, *smooth_interp(GLASS, z)[:3], n=20, p=2.2) for z in gz]
    gl_h = lambda z: smooth_interp(GLASS, z)
    grings.append([GLASS_TIP])
    gls.add(loft(grings), mat='glass')
    # dark sill frame (wider, lower) so the dome rises out of it
    srings = [ring_s(-.76, .14, .58, .46, n=20, p=2.2)]
    for z in [-.52, -.25, .15, .60, 1.00, 1.30]:
        hw, top, bot, p = smooth_interp(GLASS, z)
        fz = fus_at(z)[1]
        srings.append(ring_s(z, hw + .06, fz + .5 * (top - fz), bot - .06, n=20, p=2.4))
    fz = fus_at(1.46)[1]
    srings.append(ring_s(1.46, .09, fz + .03, fz - .12, n=20, p=2.2))
    acc.add(loft(srings), mat='accent')
    # ivory canopy bows + centre seam, set 6 mm proud of the glass
    for zb in (-.30, .42, .95):
        hw, top, bot, p = smooth_interp(GLASS, zb)
        pts = [Vector((hw * 1.004 * math.copysign(abs(math.cos(t)) ** (2 / p), math.cos(t)),
                       (top + bot) / 2 + (top - bot) / 2 * math.copysign(abs(math.sin(t)) ** (2 / p), math.sin(t)) * 1.004 + .002, zb))
               for t in [math.radians(a) for a in range(-8, 189, 14)]]
        hull.add(tube(pts, .016, 5), mat='hull', col=IVO)
    spine_pts = [Vector((0, smooth_interp(GLASS, z)[1] * 1.002 + .004 if z <= 1.30 else .415, z)) for z in
                 [-.62, -.45, -.25, 0, .25, .5, .75, 1.0, 1.2, 1.36]]
    hull.add(tube(spine_pts, .014, 5), mat='hull', col=IVO)

    # ---------------------------------------------------------------- wings (both sides)
    WING = [(.55, 1.10), (3.95, -1.40), (3.80, -2.02), (2.74, -1.86), (.60, -.90)]
    DIH, TOP, THK = .045, .055, .18
    def zle(x): return 1.10 - (x - .55) * (2.5 / 3.4)
    def zte(x): return -.90 - (x - .60) * (.96 / 2.14) if x <= 2.74 else -1.86 - (x - 2.74) * .151
    def panel(xa, xb, f0, f1):
        z = lambda x, f: zle(x) - f * (zle(x) - zte(x))
        return [(xa, z(xa, f0)), (xb, z(xb, f0)), (xb, z(xb, f1)), (xa, z(xa, f1))]
    panels = dict(
        ivory=panel(1.05, 3.52, .05, .22), cyan=panel(1.30, 3.34, .085, .165),
        slate=panel(1.15, 3.45, .26, .54), flap=panel(1.10, 2.62, .64, .84),
        aileron=panel(2.98, 3.66, .62, .84), gold=panel(2.72, 2.92, .52, .88),
    )
    for side in (-1, 1):
        sm = lambda pts: [(x * side, z) for x, z in pts]
        hull.add(plate_xz(sm(WING), TOP, THK, DIH, inset=.05, inset_bot=.03, mid=.5), mat='hull', col=SIL)
        t_over = .026
        def over(pts, base=0.0, thick=t_over, inset=.008):
            return plate_xz(sm(pts), TOP + base + thick, thick + .006, DIH, inset=inset, inset_bot=0)
        hull.add(over(panels['ivory']), mat='hull', col=IVO)
        hull.add(over(panels['slate'], inset=.014), mat='hull', col=SLA)
        hull.add(over(panels['flap'], inset=.01), mat='hull', col=hexlin(0x6f8ba1))
        hull.add(over(panels['aileron'], inset=.01), mat='hull', col=hexlin(0x6f8ba1))
        hull.add(over(panels['gold'], base=.008), mat='hull', col=GLD)
        neon.add(plate_xz(sm(panels['cyan']), TOP + t_over + .020, .020, DIH, inset=0, inset_bot=0), mat='neon')
        tip = navp if side < 0 else navs
        tip.add(box(.15, .07, .28, ch=.014), XF((side * 3.80, TOP + DIH * 3.8 + .035, -1.78), (0, side * -.2, 0)), mat='navp' if side < 0 else 'navs')
        hull.add(box(.05, .15, .55, ch=.01), XF((side * 3.86, TOP + DIH * 3.86 + .09, -1.74), (0, side * -.26, 0)), mat='hull', col=SLA)

    # ---------------------------------------------------------------- nacelles (both sides)
    for side in (-1, 1):
        x = side * 1.05; y = -.10
        mx = XF((x, y, 0)) if side > 0 else XF((x, y, 0))
        # main body: lathe profile (r, z), front to rear
        prof = [(.0, .075), (.34, .075), (.36, .0), (.375, -.30), (.405, -.90), (.435, -1.50), (.46, -1.95), (.45, -2.18), (.0, -2.18)]
        hull.add(lathe(prof, 28), mx, mat='hull', col=SLA)
        # intake: closed lip ring standing proud of the nose, dark throat disc, fan hub
        lip = [ring_c(.365, .20, 28), ring_c(.365, .03, 28), ring_c(.305, .03, 28), ring_c(.305, .20, 28)]
        hull.add(loft(lip, wrap=True), mx, mat='hull', col=IVO)
        acc.add(K.poly_face([Vector((.30 * math.cos(2 * math.pi * i / 24), .30 * math.sin(2 * math.pi * i / 24), .082)) for i in range(24)]), mx, mat='accent')
        acc.add(cyl(.09, .04, .13, 12, z0=.075), mx, mat='accent')
        # collars
        hull.add(torus(.385, .028, 28, 5, z=-.30), mx, mat='hull', col=IVO)
        hull.add(torus(.447, .026, 28, 5, z=-1.52), mx, mat='hull', col=GLD)
        hull.add(torus(.462, .022, 28, 5, z=-1.95), mx, mat='hull', col=SIL)
        # top vents
        for j in range(5):
            acc.add(box(.40, .035, .085, ch=.008), mx @ XF((0, .37 + (0 if j < 4 else 0) - j * .008, -.55 - j * .22)), mat='accent')
        # exhaust: hollow flared nozzle, petal ring, recessed dark liner
        nozzle = [ring_c(.45, -2.18, 28), ring_c(.43, -2.34, 28), ring_c(.405, -2.50, 28), ring_c(.34, -2.50, 28), ring_c(.37, -2.34, 28), ring_c(.40, -2.18, 28)]
        acc.add(loft(nozzle, wrap=True), mx, mat='accent')
        hull.add(torus(.41, .045, 28, 6, z=-2.44), mx, mat='hull', col=SIL)
        hull.add(torus(.43, .035, 28, 6, z=-2.24), mx, mat='hull', col=IVO)
        for k in range(12):
            a = 2 * math.pi * k / 12
            acc.add(box(.03, .09, .26, ch=.006), mx @ Rz(a) @ T(0, .36, -2.34), mat='accent')
        acc.add(lathe([(.34, -2.50), (.30, -2.46), (.0, -2.46)], 24), mx, mat='accent')

        # ------------------------------------------------ fins
        fin_pts = [(-2.03, .24), (-2.02, 1.28), (-1.66, 1.43), (-.58, .29)]  # (z, y)
        fin_xz = [(y_, z_) for z_, y_ in fin_pts]
        fin = plate_xz(fin_xz, .0, .09, 0, inset=.02, inset_bot=.02, mid=.5)
        fin_m = XF((side * .79, 0, 0), (0, 0, -side * .18)) @ SWAP_XY @ T(0, .045, 0)
        hull.add(fin, fin_m, mat='hull', col=SLA)
        ov_m = XF((side * .79, 0, 0), (0, 0, -side * .18)) @ SWAP_XY @ T(0, .056, 0)
        le = plate_xz([(.31, -.60), (1.42, -1.64), (1.337, -1.727), (.227, -.687)], .0, .112, 0, inset=.0, inset_bot=0)
        hull.add(le, ov_m, mat='hull', col=IVO)
        gd = plate_xz([(.50, -2.0), (1.20, -2.0), (1.20, -1.86), (.50, -1.86)], .0, .112, 0, inset=.0, inset_bot=0)
        hull.add(gd, ov_m, mat='hull', col=GLD)

        # ------------------------------------------------ gun pod, barrel, muzzle (muzzle station z=2.4)
        gx = side * 1.6
        pod = [(-.30, .10, .09, -.22, 2.4), (-.05, .17, .11, -.27, 2.5), (.70, .18, .11, -.27, 2.6), (1.15, .13, .05, -.22, 2.4), (1.38, .075, .005, -.12, 2.2)]
        prs = []
        for z in [-.30, -.05, .30, .70, 1.0, 1.15, 1.28, 1.38]:
            h, t, b, p = smooth_interp(pod, z); prs.append(ring_s(z, h, t, b, n=16, p=p))
        hull.add(loft(prs), XF((gx, 0, 0)), mat='hull', col=SLA)
        hull.add(box(.30, .028, .5, ch=.008), XF((gx, .118, .30)), mat='hull', col=IVO)
        b = XF((gx, -.10, 0))
        hull.add(cyl(.095, .075, 1.15, 14, z0=1.25), b, mat='hull', col=SIL)
        hull.add(cyl(.125, .125, .10, 14, z0=1.30), b, mat='hull', col=SLA)
        hull.add(torus(.088, .022, 16, 5, z=1.80), b, mat='hull', col=IVO)
        hull.add(cyl(.105, .105, .14, 14, z0=2.26), b, mat='hull', col=IVO)
        acc.add(cyl(.050, .050, .02, 12, z0=2.40), b, mat='accent')

    # ---------------------------------------------------------------- build objects
    objs = {}
    for part in (hull, acc, gls, neon, navp, navs):
        o = build_object(part, mats, col)
        o.parent = root; objs[part.name] = o
        o['kz_rest_pos'] = [0, 0, 0]

    # engine cores: separate nodes, origin at the engine centre, face -Z (dome toward the exhaust)
    cores = []
    for side in (-1, 1):
        p = Part(f'engine-core-{side}')
        p.add(lathe([(.0, -.022), (.11, -.019), (.20, -.010), (.255, .0)], 24), mat='engine')
        o = build_object(p, {'engine': mats['engine']}, col)
        o.parent = root
        place(o, (side * 1.05, -.10, -2.515))
        o['kz_runtime'] = 'userData.engines[%d] (uniform scale pulse about this origin)' % (0 if side < 0 else 1)
        cores.append(o); objs[p.name] = o

    # functional sockets
    sockets = []
    for side in (-1, 1):
        e = empty(f'muzzle-socket-{side}', (side * 1.6, -.10, 2.40), parent=root, collection=col, size=.15,
                  extras=dict(kz_runtime='Player.fire(): pos + (side*1.6, -0.1, 2.4)'))
        place(e, (side * 1.6, -.10, 2.40)); sockets.append(e)
    # the `engine-core-*` nodes double as engine-centre markers

    # materials -> runtime names, node mapping
    mapping = dict(
        asset='player', root='hero-interceptor', axes='X across, Y up, nose +Z (glTF)',
        nodes={
            'hero-interceptor': 'group = buildShip() result; add to Player.group',
            'airframe-hull': 'mesh; runtime mats.playerHull (vertexColors, livery in COLOR_0)',
            'airframe-accent': 'mesh; runtime mats.playerAccent',
            'airframe-glass': 'mesh; runtime mats.glass',
            'airframe-neon': 'mesh; runtime player neon bucket (cyan strips)',
            'airframe-nav-port': 'mesh; neon, red 0xff4563 (-X wingtip)',
            'airframe-nav-starboard': 'mesh; neon, green 0x65dfac (+X wingtip)',
            'engine-core--1': 'group.userData.engines[0]; scale pulse about origin (-1.05,-0.1,-2.515)',
            'engine-core-1': 'group.userData.engines[1]; scale pulse about origin (+1.05,-0.1,-2.515)',
            'muzzle-socket--1': 'empty at (-1.6,-0.1,2.4): Player.fire() spawn point',
            'muzzle-socket-1': 'empty at (+1.6,-0.1,2.4): Player.fire() spawn point',
            'occluded-airframe': 'NOT in asset: build at load by merging airframe-hull/accent/glass geometry '
                                 '(renderOrder 5, GreaterDepth silhouette material) exactly as PlayerShip.js does today',
        },
        materials={
            'KZ_PlayerHull': 'mats.playerHull', 'KZ_PlayerAccent': 'mats.playerAccent', 'KZ_PlayerGlass': 'mats.glass',
            'KZ_NeonCyan': 'MeshBasicMaterial 0x52bdcf, toneMapped=false', 'KZ_NavPort': 'MeshBasicMaterial 0xff4563',
            'KZ_NavStarboard': 'MeshBasicMaterial 0x65dfac', 'KZ_EngineGlow': 'mats.neon(0x8fe4ff, 1.35)',
        },
        animation_cues={'engine-core-*': 'runtime scales nodes 0.95-0.99 (+/-0.01 sine); asset ships a 1 s loop `engine_pulse` doing the same'},
    )

    # exportable engine pulse (runtime: scale 0.95 + 0.04*boost + 0.01*sin(9t)); frame 0 / 30 = rest scale 1
    for o in cores:
        keys = {0: 1.0, 5: .96, 10: .985, 15: .95, 20: .99, 25: .96, 30: 1.0}
        K.animate(o, 'engine_pulse', {fr: dict(scale=(v, v, v)) for fr, v in keys.items()})

    bpy.context.view_layer.update()
    return sc, root, objs, mapping


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = argv[0] if argv else os.path.abspath(os.path.join(HERE, '..'))
    os.makedirs(os.path.join(out_dir, 'build'), exist_ok=True)
    sc, root, objs, mapping = build(out_dir)
    tris, per = K.eval_stats()
    mapping['evaluated_triangles'] = tris
    mapping['per_object'] = per
    json.dump(mapping, open(os.path.join(out_dir, 'build', 'player.mapping.json'), 'w'), indent=2)
    K.export_glb(os.path.join(out_dir, 'player.glb'))
    bpy.context.preferences.filepaths.save_version = 0      # no .blend1 backups
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, 'player.blend'), compress=True)
    print('PLAYER_TRIS', tris)
    print('PLAYER_OBJECTS', json.dumps(per))


if __name__ == '__main__':
    main()
