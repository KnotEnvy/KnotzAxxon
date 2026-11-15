"""
FORTRESS sector modules beyond Reactor Spine (Fable build, deterministic, no RNG).

  EK_Parapet   near (-x) trench parapet, every fortress sector: carved INSIDE the source
               box (x -34..-27, y 0..3.2), so occlusion and silhouette cannot grow
  AF_*         OUTER FORTRESS  - hangar frontage, floodlit crest, control tower
  GB_*         GUN BATTERIES   - casemate armour, ammunition hoist, fire-control director
  IC_*         INNER CITADEL   - buttress fins, attic storey, portal, command keep
  TG_*         THE GAUNTLET    - alarm ribs, saw-tooth crest, blast door, siren tower

Far-wall rules are the Reactor Spine rules: nothing nearer the lane than x 25.7,
fittings on -z / -x / +y faces, large glows under the bloom gate, source animation
tuples wherever a source light is re-housed.
"""
from kit_dsl import *  # noqa: F401,F403
import math

STEEL = 0x9aa6b4      # source pylon / tower tint
ARMOUR = 0xa2acb6
PLATE = 0x8a949e
AMBER = 0xffc36a      # citadel conduit
ALARM = 0xff3d55      # gauntlet conduit / source strobe red
AF_GLASS = 0x8bcbd0   # airfield accent
FLOOD = 0xffe8c0


def octo(x0, x1, z0, z1, c):
    """Octagonal outline (x, z): rectangle with all four corners chamfered by c."""
    return [(x0 + c, z0), (x1 - c, z0), (x1, z0 + c), (x1, z1 - c), (x1 - c, z1), (x0 + c, z1), (x0, z1 - c), (x0, z0 + c)]


def band(P, lo, y0, hi, y1, keep=None):
    """Side quads only between two matching outlines (no caps), each facing away from the axis.
    keep(i, mid_xz) filters faces (e.g. only lane-facing sides)."""
    n = len(lo)
    cx = sum(p[0] for p in lo) / n
    cz = sum(p[1] for p in lo) / n
    for i in range(n):
        j = (i + 1) % n
        a, b, c, d = (lo[i][0], y0, lo[i][1]), (lo[j][0], y0, lo[j][1]), (hi[j][0], y1, hi[j][1]), (hi[i][0], y1, hi[i][1])
        mx, mz = (a[0] + b[0]) / 2, (a[2] + b[2]) / 2
        if keep and not keep(i, (mx, mz)):
            continue
        # outward test in plan: edge normal vs centroid direction
        ex, ez = b[0] - a[0], b[2] - a[2]
        nx, nz = ez, -ex                      # one of the two plan normals
        # quad (a, b, c, d) has plan normal proportional to (b-a) x up -> (ez, -ex) flipped sign by handedness; test numerically
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = d[0] - a[0], d[1] - a[1], d[2] - a[2]
        fx, fz = uy * vz - uz * vy, ux * vy - uy * vx
        if fx * (mx - cx) + fz * (mz - cz) < 0:
            a, b, c, d = b, a, d, c
        quad(P, a, b, c, d)


def grow(outline, k):
    """Offset an outline radially from its centroid by k metres (approximate, for proud bands)."""
    n = len(outline)
    cx = sum(p[0] for p in outline) / n
    cz = sum(p[1] for p in outline) / n
    out = []
    for x, z in outline:
        d = math.hypot(x - cx, z - cz)
        out.append((x + (x - cx) / d * k, z + (z - cz) / d * k))
    return out


# ===================================================================== #
# EK_Parapet: the near trench parapet, carved inside the source box
# ===================================================================== #
M = 'EK_Parapet'
p = part(M, 'channel', 'hull', WALL, 10, stamp={'origin': '(0, 0, zMid)', 'scale': 'sz=len'},
         note='Near parapet section inside the source box x-34..-27, y0..3.2: twin kerbs, a 0.5 deep service channel on top, '
              'a recessed panel band on the outer face. Unit length, capped.')
zprism(p, [(-27.0, 0.0), (-27.0, 3.2), (-27.8, 3.2), (-27.8, 2.7), (-33.2, 2.7), (-33.2, 3.2), (-34.0, 3.2), (-34.0, 2.75),
           (-33.78, 2.55), (-33.78, 1.05), (-34.0, 0.85), (-34.0, 0.0)], -0.5, 0.5, caps=(True, True), convex=False)

p = part(M, 'outer_rib', 'hull', FRAME, 6, stamp={'origin': '(0, 0, zRib)', 'scale': 'none'},
         note='Rib filling the outer recess band at a source rib z, flush with the source outer face x-34.')
box_minmax(p, (-34.0, 0.85, -0.7), (-33.78, 2.75, 0.7), skip=('+x',))

p = part(M, 'bridge', 'hull', FRAME, 6, stamp={'origin': '(0, 0, zRib)', 'scale': 'none'},
         note='Cross rib tying the two kerbs across the channel at a source rib z; top 0.1 under the source top plane.')
box_minmax(p, (-33.2, 2.7, -0.5), (-27.8, 3.19, 0.5), skip=('-y', '-x', '+x'))

p = part(M, 'bridge_lamp', 'neon', ACCENT, 8, gain=0.5, fx={'anim': [BREATHE, 0.4, 'i*0.17']}, stamp={'origin': '(0, 0, zRib)', 'scale': 'none'},
         note='Dim marker in the bridge top (sub-bloom); top face is the source top plane y3.2. Tint = sector accent.')
quad(p, (-30.95, 3.2, -0.22), (-30.95, 3.2, 0.22), (-30.05, 3.2, 0.22), (-30.05, 3.2, -0.22))

p = part(M, 'hatch', 'dark', DARK, 4, stamp={'origin': '(0, 0, z)', 'scale': 'none'},
         note='Service hatch on the channel floor with two grab bars.')
box_minmax(p, (-32.2, 2.7, -1.2), (-29.6, 2.84, 1.2), skip=('-y',))
for zz in (-0.6, 0.6):
    box_minmax(p, (-31.6, 2.84, zz - 0.05), (-30.2, 2.92, zz + 0.05), skip=('-y',))

p = part(M, 'tray', 'dark', DARK, 4, stamp={'origin': '(0, 0, zMid)', 'scale': 'sz=len'},
         note='Cable tray along the inner kerb of the channel, unit length.')
box_minmax(p, (-28.75, 2.7, -0.5), (-28.1, 2.92, 0.5), skip=('-y', '-z', '+z'))

# ===================================================================== #
# AF_Hangar: hangar door set for the source bay (airfield)
# ===================================================================== #
M = 'AF_Hangar'
p = part(M, 'door_leaf', 'hull', STEEL, 4, stamp={'origin': '(0, 0, zLeaf)', 'scale': 'sy=h, sz=leafWidth'},
         note='Sliding hangar door leaf parked half open, 0.45 inside the opening; two pressed ribs. Unit y/z.')
box_minmax(p, (27.55, 0.0, -0.5), (27.75, 1.0, 0.5), skip=('+x', '-y'))
for yy in (0.3, 0.7):
    box_minmax(p, (27.47, yy - 0.02, -0.5), (27.55, yy + 0.02, 0.5), skip=('+x',))

p = part(M, 'door_track', 'dark', DARK, 4, stamp={'origin': '(0, h, z)', 'scale': 'sz=w'},
         note='Door head track under the header, unit length.')
box_minmax(p, (27.42, -0.26, -0.5), (27.9, -0.06, 0.5), skip=('+x', '+y'))

p = part(M, 'apron_bar', 'neon', FLOOD, 8, gain=0.6, stamp={'origin': '(0, h, z)', 'scale': 'sz=w-1'},
         note='Flood bar under the header lip lighting the apron (sub-bloom, steady).')
box_minmax(p, (26.6, -0.1, -0.5), (26.86, -0.02, 0.5), skip=('+y',))

# ===================================================================== #
# AF_Crest: floodlit service crest
# ===================================================================== #
M = 'AF_Crest'
p = part(M, 'rail', 'dark', DARK, 4, stamp={'origin': '(0, h, zMid)', 'scale': 'sz=len'},
         note='Two-bar crest handrail above the coping, unit length.')
box_minmax(p, (27.05, 1.37, -0.5), (27.17, 1.49, 0.5), skip=('-z', '+z'))
box_minmax(p, (27.08, 0.92, -0.5), (27.14, 0.98, 0.5), skip=('-z', '+z'))

p = part(M, 'post', 'dark', DARK, 4, stamp={'origin': '(0, h, z)', 'scale': 'none'}, note='Crest rail stanchion.')
box_minmax(p, (27.06, 0.45, -0.05), (27.16, 1.37, 0.05), skip=('-y', '+y'))

p = part(M, 'mast', 'dark', DARK, 4, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Floodlight mast on the crest at a source rib: tapered column, outreach arm and lamp housing over the apron (x >= 26.3).')
cylinder(p, (28.1, 0.45, 0), (28.1, 6.6, 0), 0.24, 0.14, n=6, caps=(False, True))
box_minmax(p, (26.7, 6.28, -0.08), (28.2, 6.44, 0.08))
zprism(p, [(27.9, 4.9), (28.0, 4.9), (27.15, 6.28), (27.0, 6.28)], -0.05, 0.05)
box_minmax(p, (26.32, 6.02, -1.0), (27.0, 6.3, 1.0))

p = part(M, 'mast_lamp', 'neon', FLOOD, 8, gain=0.62, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Flood lamp face (sub-bloom, steady): the opening sector stays calm.')
box_minmax(p, (26.3, 6.06, -0.9), (26.32, 6.26, 0.9), skip=('+x',))
box_minmax(p, (26.36, 6.0, -0.9), (26.96, 6.02, 0.9), skip=('+y',))

# ===================================================================== #
# AF_Tower: control tower - the airfield landmark
#   podium y0..4, shaft to wall height + 2, neck, flared cab, roof gear
# ===================================================================== #
M = 'AF_Tower'
TS = {'origin': '(0, y, zTower)', 'scale': 'see note'}
SH = rect(26.3, 35.0, -6.0, 6.0, cf=0.6)
p = part(M, 'base', 'hull', FRAME, 8, stamp=TS, note='Battered base y0..4 (stamp y=0).')
frustum(p, rect(25.95, 35.0, -7.4, 7.4, cf=0.5), 0, SH, 4.0)

p = part(M, 'shaft', 'hull', STRUCT, 8, stamp=TS, note='Tower shaft, unit height (stamp y=4, sy=h+2-4).')
yprism(p, SH, 0, 1, caps=(False, True))

p = part(M, 'shaft_ribs', 'hull', FRAME, 6, stamp=TS, note='Three vertical ribs on the lane face, unit height with the shaft.')
for zc in (-3.6, 0.0, 3.6):
    box_minmax(p, (26.05, 0.0, zc - 0.28), (26.3, 1.0, zc + 0.28), skip=('+x', '-y'))

NK = rect(27.2, 34.2, -3.6, 3.6, cf=0.5)
CA = octo(26.2, 35.2, -5.6, 5.6, 1.6)
CB = octo(25.9, 35.5, -6.0, 6.0, 1.7)
CR = octo(27.0, 34.4, -4.4, 4.4, 1.3)
NH = 12.0   # neck height above the shaft: lifts the cab clear of the wall line
p = part(M, 'cab', 'hull', STRUCT, 8, stamp=TS,
         note='Neck, flared cab floor, slanted cab walls and roof above the shaft (stamp y=h+2). Cab x 25.9..35.5, floor at +14.2.')
yprism(p, NK, 0, NH, caps=(False, False))
frustum(p, NK, NH, CA, NH + 2.2)
frustum(p, CA, NH + 2.2, CB, NH + 4.4)
frustum(p, CB, NH + 4.4, CR, NH + 5.6)

p = part(M, 'cab_glass', 'neon', AF_GLASS, 8, gain=0.55, stamp=TS,
         note='Cab glazing band on the lane-facing and approach-facing sides (sub-bloom, sector accent).')
band(p, grow([(x + (bx - x) * 0.14, z + (bz - z) * 0.14) for (x, z), (bx, bz) in zip(CA, CB)], 0.03), NH + 2.5,
     grow([(x + (bx - x) * 0.86, z + (bz - z) * 0.86) for (x, z), (bx, bz) in zip(CA, CB)], 0.03), NH + 4.1,
     keep=lambda i, m: m[0] < 30.7 or m[1] < -5.0)

p = part(M, 'cab_trim', 'dark', DARK, 4, stamp=TS, note='Sill and head bands around the cab, neck collars.')
yprism(p, grow(CA, 0.12), NH + 2.2, NH + 2.46, caps=(False, False))
yprism(p, grow(CB, 0.12), NH + 4.14, NH + 4.4, caps=(False, True))
yprism(p, grow(NK, 0.14), NH - 0.6, NH, caps=(False, True))
yprism(p, grow(NK, 0.14), 4.0, 4.5, caps=(False, True))

p = part(M, 'neck_lights', 'neon', AF_GLASS, 8, gain=0.5, stamp=TS, note='Stair-core window slots up the neck lane face (sub-bloom).')
for yy in (1.6, 6.0, 8.6):
    box_minmax(p, (27.17, yy, -0.9), (27.2, yy + 1.5, 0.9), skip=('+x',))

p = part(M, 'roof_gear', 'dark', DARK, 4, stamp=TS, note='Roof mast, yard arm, radar pedestal and plant boxes (stamp y=h+2).')
cylinder(p, (32.4, NH + 5.6, 0), (32.4, NH + 11.4, 0), 0.2, 0.12, n=6, caps=(False, True))
box_minmax(p, (32.32, NH + 9.4, -1.5), (32.48, NH + 9.52, 1.5))
cylinder(p, (29.6, NH + 5.6, 0), (29.6, NH + 6.5, 0), 0.5, 0.36, n=8, caps=(False, True))
box_minmax(p, (30.6, NH + 5.6, 2.0), (32.2, NH + 6.2, 3.4), skip=('-y',))

p = part(M, 'radar', 'spin', 0xa8b4c2, 4, fx={'pivot': 'stamp origin', 'spin': '[0,1,0,0.9]'},
         stamp={'origin': '(29.6, h+2+18.5, zTower)', 'scale': 'none'},
         note='Airfield surveillance radar bar rotating about +y; local origin is the pivot; sweep radius 2.3 (x >= 27.3).')
box_minmax(p, (-2.3, 0.1, -0.1), (2.3, 0.95, 0.1))
box_minmax(p, (-1.7, 0.4, 0.1), (1.7, 0.6, 0.34))
cylinder(p, (0, 0, 0), (0, 0.5, 0), 0.16, n=6, caps=(False, False))

p = part(M, 'beacon', 'neon', RED, 8, gain=1.4, fx={'anim': [STROBE, 0.7, 0.0]}, stamp={'origin': '(32.4, h+2+23.4, zTower)', 'scale': 'none'},
         note='Mast-head obstruction beacon.')
box_minmax(p, (-0.24, 0, -0.24), (0.24, 0.46, 0.24), skip=('-y',))

# ===================================================================== #
# GB_Armor: casemate armour on the far wall (battery)
# ===================================================================== #
M = 'GB_Armor'
p = part(M, 'glacis', 'hull', ARMOUR, 6, stamp={'origin': '(0, 0, zMid)', 'scale': 'sz=len'},
         note='Sloped armour skirt between piers, y1.5..7.2, toe x26.02 overhanging the plinth kerb. Unit length.')
zprism(p, [(FIELD, 1.5), (26.02, 1.5), (26.02, 2.05), (27.0, 7.2), (FIELD, 7.2)], -0.5, 0.5, caps=(False, False), convex=False)

p = part(M, 'glacis_cap', 'dark', DARK, 4, stamp={'origin': '(0, 0, zMid)', 'scale': 'sz=len'},
         note='Cap rail on the glacis head, unit length.')
box_minmax(p, (26.86, 7.2, -0.5), (FIELD, 7.46, 0.5), skip=('+x', '-y'))

p = part(M, 'strake', 'hull', FRAME, 6, stamp={'origin': '(0, 0, z)', 'scale': 'none'},
         note='Raised armour strake on the glacis slope.')
zprism(p, [(FIELD, 1.5), (25.88, 1.5), (25.88, 2.05), (26.86, 7.2), (FIELD, 7.2)], -0.16, 0.16, convex=False)

# ===================================================================== #
# GB_Casemate: armoured ammunition bay with a shell hoist
# ===================================================================== #
M = 'GB_Casemate'
p = part(M, 'blast_door', 'hull', PLATE, 4, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Closed two-leaf armoured door 0.6 inside the opening; pressed ribs and a centre seam. Unit y/z.')
for za, zb in ((-0.5, -0.006), (0.006, 0.5)):
    box_minmax(p, (27.6, 0.0, za), (27.9, 1.0, zb), skip=('+x', '-y', '+y'))
for yy in (0.2, 0.5, 0.8):
    box_minmax(p, (27.5, yy - 0.03, -0.5), (27.6, yy + 0.03, 0.5), skip=('+x',))

p = part(M, 'hoist_rail', 'dark', DARK, 4, stamp={'origin': '(0, y0, z)', 'scale': 'sy=height'},
         note='Twin hoist guide rails climbing the wall field above the bay, unit height.')
for zc in (-0.95, 0.95):
    box_minmax(p, (27.05, 0.0, zc - 0.09), (FIELD, 1.0, zc + 0.09), skip=('+x', '-y', '+y'))

p = part(M, 'hoist_car', 'hull', FRAME, 4, stamp={'origin': '(0, yCar, z)', 'scale': 'none'},
         note='Shell hoist carriage on the rails: cage, three shells upright.')
box_minmax(p, (26.72, -0.75, -0.8), (27.08, 0.75, 0.8))
for zc in (-0.48, 0.0, 0.48):
    cylinder(p, (26.56, -0.6, zc), (26.56, 0.35, zc), 0.15, n=6, caps=(False, False))
    cylinder(p, (26.56, 0.35, zc), (26.56, 0.7, zc), 0.15, 0.03, n=6, caps=(False, True))
box_minmax(p, (26.4, -0.75, -0.8), (26.72, -0.6, 0.8), skip=('+x',))

p = part(M, 'hoist_head', 'dark', DARK, 4, stamp={'origin': '(0, yTop, z)', 'scale': 'none'},
         note='Sheave housing at the head of the hoist.')
box_minmax(p, (26.7, -0.5, -1.25), (FIELD, 0.35, 1.25), skip=('+x',))
cylinder(p, (26.9, -0.1, -1.25), (26.9, -0.1, -1.42), 0.42, n=8, caps=(False, True))

# ===================================================================== #
# GB_Crest: armoured crest
# ===================================================================== #
M = 'GB_Crest'
p = part(M, 'merlon', 'hull', STRUCT, 6, stamp={'origin': '(0, h, z)', 'scale': 'none'},
         note='Armour merlon on the coping, 3.6 long, sloped head.')
hull_faces(p, [(26.9, 0.45, -1.8), (28.5, 0.45, -1.8), (26.9, 0.45, 1.8), (28.5, 0.45, 1.8),
               (26.9, 1.6, -1.8), (28.5, 1.6, -1.8), (26.9, 1.6, 1.8), (28.5, 1.6, 1.8),
               (27.45, 2.3, -1.35), (28.5, 2.3, -1.35), (27.45, 2.3, 1.35), (28.5, 2.3, 1.35)])

p = part(M, 'deflector', 'hull', FRAME, 6, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Blast deflector behind the merlons: a plate leaning away from the lane on two struts.')
hull_faces(p, [(30.0, 0.45, -3.2), (30.3, 0.45, -3.2), (32.1, 4.6, -3.2), (31.8, 4.6, -3.2),
               (30.0, 0.45, 3.2), (30.3, 0.45, 3.2), (32.1, 4.6, 3.2), (31.8, 4.6, 3.2)])
for zc in (-2.2, 2.2):
    hull_faces(p, [(32.9, 0.45, zc - 0.12), (33.2, 0.45, zc - 0.12), (31.75, 3.4, zc - 0.12), (31.5, 3.4, zc - 0.12),
                   (32.9, 0.45, zc + 0.12), (33.2, 0.45, zc + 0.12), (31.75, 3.4, zc + 0.12), (31.5, 3.4, zc + 0.12)])

# ===================================================================== #
# GB_Director: fire-control director tower - the battery landmark
# ===================================================================== #
M = 'GB_Director'
DT = rect(26.4, 35.2, -7.4, 7.4, cf=1.0)
p = part(M, 'barbette', 'hull', FRAME, 8, stamp=TS, note='Battered barbette y0..5 (stamp y=0).')
frustum(p, rect(25.95, 35.2, -8.4, 8.4, cf=0.8), 0, DT, 5.0)

p = part(M, 'tower', 'hull', STRUCT, 8, stamp=TS, note='Armoured tower body, unit height (stamp y=5, sy=h+1-5).')
yprism(p, DT, 0, 1, caps=(False, True))

p = part(M, 'plates', 'hull', FRAME, 6, stamp=TS, note='Applique armour plates on the lane face (stamp y=h-5).')
for za, zb in ((-5.6, -2.2), (-1.7, 1.7), (2.2, 5.6)):
    box_minmax(p, (26.2, 0.0, za), (26.4, 3.6, zb), skip=('+x',))

p = part(M, 'slits', 'neon', 0xffb43a, 8, gain=0.5, stamp=TS, note='Vision slits in the applique plates (sub-bloom, steady).')
for zc in (-3.9, 0.0, 3.9):
    box_minmax(p, (26.18, 2.2, zc - 1.0), (26.2, 2.42, zc + 1.0), skip=('+x',))

HA = octo(27.0, 34.6, -6.2, 6.2, 1.9)
HB = octo(27.6, 34.0, -5.4, 5.4, 1.6)
p = part(M, 'house', 'hull', STRUCT, 8, stamp=TS, note='Octagonal director house and roof on the tower (stamp y=h+1).')
frustum(p, HA, 0.0, HB, 4.6)
yprism(p, grow(HB, 0.25), 4.6, 5.0, caps=(False, True))

p = part(M, 'house_trim', 'dark', DARK, 4, stamp=TS, note='Base ring, roof hatch and the rangefinder pedestal.')
yprism(p, grow(HA, 0.2), 0.0, 0.5, caps=(False, True))
cylinder(p, (30.8, 5.0, 0), (30.8, 5.9, 0), 0.9, 0.7, n=8, caps=(False, True))

p = part(M, 'rangefinder', 'spin', 0xa8b4c2, 4, fx={'pivot': 'stamp origin', 'spin': '[0,1,0,0.25]'},
         stamp={'origin': '(30.8, h+1+5.9, zTower)', 'scale': 'none'},
         note='Coincidence rangefinder turning slowly about +y: tube, end optics, centre housing. Sweep radius 4.8 (x >= 26.0).')
cylinder(p, (0, 0.6, -4.5), (0, 0.6, 4.5), 0.34, n=8, caps=(False, False))
for zc in (-4.5, 4.5):
    box_minmax(p, (-0.5, 0.15, zc - 0.3), (0.5, 1.05, zc + 0.3))
box_minmax(p, (-0.8, 0.0, -1.0), (0.8, 1.3, 1.0), skip=('-y',))

p = part(M, 'mast', 'dark', DARK, 4, stamp=TS, note='Signal mast behind the director (stamp y=h+1).')
cylinder(p, (33.2, 4.8, 0), (33.2, 11.0, 0), 0.18, 0.1, n=6, caps=(False, True))
box_minmax(p, (33.12, 9.2, -1.2), (33.28, 9.32, 1.2))

p = part(M, 'beacon', 'neon', RED, 8, gain=1.4, fx={'anim': [STROBE, 0.7, 0.0]}, stamp={'origin': '(33.2, h+1+11.0, zTower)', 'scale': 'none'},
         note='Mast-head beacon.')
box_minmax(p, (-0.22, 0, -0.22), (0.22, 0.42, 0.22), skip=('-y',))

# ===================================================================== #
# IC_Buttress: citadel buttress fins and crest finials
# ===================================================================== #
M = 'IC_Buttress'
p = part(M, 'fin', 'hull', STRUCT, 6, stamp={'origin': '(0, H, zRib)', 'scale': 'sy=h-H'},
         note='Flying fin from a pier head up to the crest, unit height, z+-0.45.')
zprism(p, [(FIELD, 0.0), (PIER, 0.0), (27.0, 1.0), (FIELD, 1.0)], -0.45, 0.45)

p = part(M, 'finial', 'hull', FRAME, 6, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Obelisk finial on the crest above each pier.')
frustum(p, rect(26.95, 28.25, -0.65, 0.65), 0.45, rect(27.42, 27.78, -0.18, 0.18), 3.7)

p = part(M, 'finial_lamp', 'neon', AMBER, 8, gain=0.55, fx={'anim': [BREATHE, 0.22, 'i*0.17']}, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Dim amber lamp in the finial foot (sub-bloom).')
box_minmax(p, (26.9, 0.62, -0.3), (26.96, 0.98, 0.3), skip=('+x',))

# ===================================================================== #
# IC_Crest: attic storey on the citadel crest
# ===================================================================== #
M = 'IC_Crest'
p = part(M, 'attic', 'hull', STRUCT, 8, stamp={'origin': '(0, h, zMid)', 'scale': 'sz=len'},
         note='Attic storey x27.9..33.4, y h+0.45..h+3.3, chamfered head. Unit length.')
zprism(p, [(33.4, 0.45), (27.9, 0.45), (27.9, 2.9), (28.3, 3.3), (33.4, 3.3)], -0.5, 0.5, caps=(False, False))

p = part(M, 'attic_band', 'neon', AMBER, 8, gain=0.5, fx={'anim': [BREATHE, 0.22, 'bay phase']}, stamp={'origin': '(0, h, zMid)', 'scale': 'sz=len'},
         note='Command-deck light slot in the attic face, one per bay (sub-bloom). Unit length.')
box_minmax(p, (27.86, 1.45, -0.5), (27.9, 1.95, 0.5), skip=('+x',))

p = part(M, 'attic_pilaster', 'hull', FRAME, 6, stamp={'origin': '(0, h, zRib)', 'scale': 'none'}, note='Pilaster on the attic face at each pier line.')
box_minmax(p, (27.66, 0.45, -0.75), (27.9, 3.3, 0.75), skip=('+x', '-y'))

# ===================================================================== #
# IC_Portal: citadel portal dressing for the source bay
# ===================================================================== #
M = 'IC_Portal'
p = part(M, 'grille', 'dark', DARK, 4, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Portcullis grille 0.5 inside the opening: nine bars and two cross rails. Unit y/z.')
for k in range(9):
    zz = -0.44 + k * 0.11
    box_minmax(p, (27.86, 0.0, zz - 0.012), (27.96, 1.0, zz + 0.012), skip=('-y', '+y'))
for yy in (0.34, 0.72):
    box_minmax(p, (27.84, yy - 0.015, -0.5), (27.98, yy + 0.015, 0.5), skip=('-z', '+z'))

p = part(M, 'keystone', 'hull', FRAME, 6, stamp={'origin': '(0, h+1.5, z)', 'scale': 'none'},
         note='Stepped crest block over the header.')
yprism(p, rect(26.62, FIELD, -2.2, 2.2, cf=0.16), 0.0, 1.0, caps=(False, True))
yprism(p, rect(26.8, FIELD, -1.4, 1.4, cf=0.14), 1.0, 2.1, caps=(False, True))

p = part(M, 'crest_light', 'neon', AMBER, 8, gain=0.6, fx={'anim': [BREATHE, 0.22, 0.0]}, stamp={'origin': '(0, h+1.5, z)', 'scale': 'none'},
         note='Amber slot in the crest block (sub-bloom).')
box_minmax(p, (26.6, 0.3, -1.5), (26.62, 0.7, 1.5), skip=('+x',))

# ===================================================================== #
# IC_Keep: buttressed command keep - the citadel landmark
# ===================================================================== #
M = 'IC_Keep'
K1 = rect(26.4, 36.0, -8.0, 8.0, cf=1.2)
K2 = rect(27.4, 35.2, -6.4, 6.4, cf=1.0)
K3 = rect(28.6, 34.2, -4.4, 4.4, cf=0.8)
p = part(M, 'base', 'hull', FRAME, 8, stamp=TS, note='Battered base y0..5 (stamp y=0).')
frustum(p, rect(25.95, 36.0, -9.0, 9.0, cf=0.8), 0, K1, 5.0)

p = part(M, 'body', 'hull', STRUCT, 8, stamp=TS, note='Keep body, unit height (stamp y=5, sy=h+3-5).')
yprism(p, K1, 0, 1, caps=(False, True))

p = part(M, 'buttress', 'hull', FRAME, 6, stamp=TS, note='Front corner buttresses and slot cheeks, unit height with the body.')
for za, zb in ((-8.3, -6.5), (6.5, 8.3)):
    yprism(p, rect(25.95, 27.3, za, zb, cf=0.25), 0, 1, caps=(False, True))
for za, zb in ((-1.5, -1.0), (1.0, 1.5)):
    box_minmax(p, (26.1, 0.0, za), (26.4, 1.0, zb), skip=('+x', '-y'))

p = part(M, 'slot', 'neon', AMBER, 8, gain=0.6, fx={'anim': [BREATHE, 0.22, 0.0]}, stamp=TS,
         note='Tall command light slot between the cheeks (sub-bloom). Unit height with the body.')
box_minmax(p, (26.36, 0.1, -0.8), (26.4, 0.92, 0.8), skip=('+x',))

p = part(M, 'tiers', 'hull', STRUCT, 8, stamp=TS, note='Two setback tiers and the roof above the body (stamp y=h+3).')
frustum(p, K1, 0.0, K2, 1.2)
yprism(p, K2, 1.2, 7.0, caps=(False, False))
frustum(p, K2, 7.0, K3, 8.0)
yprism(p, K3, 8.0, 12.4, caps=(False, False))
frustum(p, K3, 12.4, rect(29.6, 33.2, -3.0, 3.0, cf=0.5), 13.5)

p = part(M, 'tier_trim', 'dark', DARK, 4, stamp=TS, note='String courses at the tier heads.')
yprism(p, grow(K2, 0.14), 6.6, 7.0, caps=(False, True))
yprism(p, grow(K3, 0.14), 12.0, 12.4, caps=(False, True))

p = part(M, 'bridge_band', 'neon', AMBER, 8, gain=0.55, fx={'anim': [BREATHE, 0.22, 0.4]}, stamp=TS,
         note='Command bridge window band on the lane and approach faces of both tiers (sub-bloom).')
quad(p, (27.37, 4.5, 5.2), (27.37, 4.5, -5.2), (27.37, 5.4, -5.2), (27.37, 5.4, 5.2))
quad(p, (28.5, 4.5, -6.43), (34.0, 4.5, -6.43), (34.0, 5.4, -6.43), (28.5, 5.4, -6.43))
quad(p, (28.57, 10.2, 3.4), (28.57, 10.2, -3.4), (28.57, 10.9, -3.4), (28.57, 10.9, 3.4))

p = part(M, 'masts', 'dark', DARK, 4, stamp=TS, note='Twin command masts and yard on the roof.')
for zc in (-1.6, 1.6):
    cylinder(p, (31.4, 13.5, zc), (31.4, 20.5, zc), 0.2, 0.1, n=6, caps=(False, True))
box_minmax(p, (31.32, 17.8, -2.4), (31.48, 17.94, 2.4))

p = part(M, 'beacon', 'neon', RED, 8, gain=1.4, fx={'anim': [STROBE, 0.6, 'k*0.5']}, stamp={'origin': '(31.4, h+3+20.5, zKeep+-1.6)', 'scale': 'none'},
         note='Mast-head beacons, two stamps.')
box_minmax(p, (-0.22, 0, -0.22), (0.22, 0.42, 0.22), skip=('-y',))

# ===================================================================== #
# TG_Alarm: gauntlet alarm ribs
# ===================================================================== #
M = 'TG_Alarm'
p = part(M, 'rib_light', 'neon', ALARM, 8, gain=0.7, fx={'anim': [BREATHE, 0.5, 'i*0.17']}, stamp={'origin': '(0, 3.0, zRib)', 'scale': 'sy=height'},
         note='Red alarm strip up the front of a pier shaft (sub-bloom), unit height.')
box_minmax(p, (25.92, 0.0, -0.15), (PIER, 1.0, 0.15), skip=('+x',))

p = part(M, 'rib_guard', 'dark', DARK, 4, stamp={'origin': '(0, 3.0, zRib)', 'scale': 'sy=height'},
         note='Twin guard rails flanking the alarm strip, unit height.')
for za, zb in ((-0.3, -0.2), (0.2, 0.3)):
    box_minmax(p, (25.86, 0.0, za), (PIER, 1.0, zb), skip=('+x',))

# ===================================================================== #
# TG_Crest: saw-tooth crest
# ===================================================================== #
M = 'TG_Crest'
p = part(M, 'tooth', 'hull', STRUCT, 6, stamp={'origin': '(0, h, z)', 'scale': 'none'},
         note='Saw tooth on the coping, 3.4 long, rising toward +z (against the approach).')
hull_faces(p, [(27.1, 0.45, -1.7), (28.5, 0.45, -1.7), (27.1, 0.45, 1.7), (28.5, 0.45, 1.7), (27.35, 2.4, 1.7), (28.5, 2.4, 1.7)])

p = part(M, 'barb', 'dark', DARK, 4, stamp={'origin': '(0, h, zRib)', 'scale': 'none'},
         note='Barbed mast behind the teeth at each pier line.')
frustum(p, rect(29.0, 29.8, -0.4, 0.4), 0.45, rect(29.34, 29.46, -0.06, 0.06), 6.0)
box_minmax(p, (29.3, 4.2, -1.3), (29.5, 4.4, 1.3))
for zc in (-1.3, 1.3):
    frustum(p, rect(29.3, 29.5, zc - 0.12, zc + 0.12), 4.4, rect(29.38, 29.42, zc - 0.02, zc + 0.02), 5.3)

# ===================================================================== #
# TG_Blast: sealed blast door for the source bay (no pocket: the Gauntlet is shut)
# ===================================================================== #
M = 'TG_Blast'
p = part(M, 'door', 'hull', 0x7c8690, 4, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Sealed blast door on the wall field between the jambs, x26.95..27.4, two heavy ribs. Unit y/z.')
box_minmax(p, (26.95, 0.0, -0.5), (FIELD, 1.0, 0.5), skip=('+x', '-y'))
for yy in (0.3, 0.7):
    box_minmax(p, (26.84, yy - 0.045, -0.5), (26.95, yy + 0.045, 0.5), skip=('+x',))

p = part(M, 'chevrons', 'hazard', 0xffffff, 3, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Hazard band across the door foot. Unit y/z.')
box_minmax(p, (26.92, 0.02, -0.5), (26.95, 0.2, 0.5), skip=('+x',))

p = part(M, 'lock', 'dark', DARK, 4, stamp={'origin': '(0, h/2, z)', 'scale': 'none'},
         note='Centre lock wheel and bolt bar.')
cylinder(p, (26.95, 0, 0), (26.72, 0, 0), 0.85, 0.7, n=10, caps=(False, True))
box_minmax(p, (26.66, -0.12, -1.6), (26.84, 0.12, 1.6))

# ===================================================================== #
# TG_Siren: siren tower - the gauntlet landmark
# ===================================================================== #
M = 'TG_Siren'
S1 = rect(26.6, 34.6, -5.2, 5.2, cf=0.8)
p = part(M, 'base', 'hull', FRAME, 8, stamp=TS, note='Battered base y0..5 (stamp y=0).')
frustum(p, rect(25.95, 34.6, -6.4, 6.4, cf=0.6), 0, S1, 5.0)

p = part(M, 'body', 'hull', STRUCT, 8, stamp=TS, note='Tower body, unit height (stamp y=5, sy=h+2-5).')
yprism(p, S1, 0, 1, caps=(False, True))

p = part(M, 'slots', 'neon', ALARM, 8, gain=0.62, fx={'anim': [BREATHE, 0.5, 0.0]}, stamp=TS,
         note='Three alarm slots on the lane face (sub-bloom). Unit height with the body.')
for zc in (-2.6, 0.0, 2.6):
    box_minmax(p, (26.56, 0.12, zc - 0.5), (26.6, 0.9, zc + 0.5), skip=('+x',))

p = part(M, 'slot_fins', 'hull', FRAME, 6, stamp=TS, note='Fins between the slots, unit height with the body.')
for zc in (-3.9, -1.3, 1.3, 3.9):
    box_minmax(p, (26.3, 0.0, zc - 0.28), (26.6, 1.0, zc + 0.28), skip=('+x', '-y'))

p = part(M, 'blades', 'hull', FRAME, 8, stamp=TS, note='Twin blade pylons above the body (stamp y=h+2), 15 tall.')
for s in (-1, 1):
    za, zb = sorted((s * 2.0, s * 4.6))
    ta, tb = sorted((s * 3.0, s * 3.6))
    frustum(p, rect(27.2, 33.8, za, zb), 0.0, rect(29.7, 31.3, ta, tb), 15.0)

p = part(M, 'horns', 'dark', DARK, 4, stamp=TS, note='Siren horns between the blades, mouths toward the lane (stamp y=h+2).')
for yy, r in ((4.2, 1.0), (7.4, 0.85), (10.4, 0.7)):
    cylinder(p, (27.5, yy, 0), (29.6, yy, 0), r, r * 0.3, n=10, caps=(True, True))
    box_minmax(p, (29.5, yy - 0.14, -2.9), (30.0, yy + 0.14, 2.9))

p = part(M, 'beacon_bar', 'spin', 0xa8b4c2, 4, fx={'pivot': 'stamp origin', 'spin': '[0,1,0,1.6]'},
         stamp={'origin': '(30.5, h+2+15.3, zTower)', 'scale': 'none'},
         note='Rotating beacon carrier about +y, sweep radius 2.2 (x >= 28.3).')
box_minmax(p, (-2.2, 0.0, -0.22), (2.2, 0.36, 0.22))
cylinder(p, (0, -0.5, 0), (0, 0.0, 0), 0.3, n=6, caps=(False, False))

p = part(M, 'beacon', 'neon', ALARM, 8, gain=1.4, fx={'anim': [STROBE, 1.1, 0.0]}, stamp={'origin': '(30.5, h+2+15.66, zTower)', 'scale': 'none'},
         note='Alarm beacon on the carrier hub (source gauntlet strobe rate 1.1).')
box_minmax(p, (-0.3, 0, -0.3), (0.3, 0.5, 0.3), skip=('-y',))
