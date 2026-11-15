"""
STRUCTURE modules (Fable build, deterministic, no RNG state: fixed hash constants only).

  SK_Rock      six low-polygon rock templates for debris gates and debris rings
  SK_Fence     electric-fence pylon hardware, inside the source pylon solids
  SP_Platform  floating platform body, inside the source platform solids
  SP_Truss     distant station truss bay, inside the source 3 x 3 girder box
  SE_Bulkhead  sector-edge bulkhead: cliff ribs, corbel, catwalk, launch rails, launch pylons
  BA_Arena     boss arena piers, coil rings, near blocks and throat-wall frame, inside the source solids

Rule for everything a ship can reach: new geometry stays inside the source solid it
replaces (silhouette subset), so no collider, gap or flight range changes. The bulkhead
parts live below the deck lip (y <= -1.5), under every flight floor.
"""
from kit_dsl import *  # noqa: F401,F403
import math

STEEL = 0x9aa6b4


def octo(x0, x1, z0, z1, c):
    return [(x0 + c, z0), (x1 - c, z0), (x1, z0 + c), (x1, z1 - c), (x1 - c, z1), (x0 + c, z1), (x0, z1 - c), (x0, z0 + c)]


def _hash01(i, salt):
    """Deterministic value in [0, 1) from two integers (no RNG state)."""
    n = (i * 374761393 + salt * 668265263) & 0xffffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
    n ^= n >> 16
    return (n & 0xffffff) / float(0x1000000)


# ===================================================================== #
# SK_Rock: six convex rock templates, max radius 1.0, 32 hull points each
#   Source rocks were IcosahedronGeometry(r, 1|2) = 80 or 320 triangles
#   built and eroded per rock at chunk time. Templates are stamped with the
#   source's seeded axis scales and tints.
# ===================================================================== #
M = 'SK_Rock'
for ri, letter in enumerate('abcdef'):
    p = part(M, f'rock_{letter}', 'rock', 0xffffff, 6, fx={'pivot': 'source', 'spin': 'source'},
             stamp={'origin': 'rock centre', 'scale': 'sx, sy, sz = r * seeded axis scales; rotY from the seeded phase'},
             note='Faceted rock, convex, all vertices within radius 1.0 of the origin (source eroded rocks reach 1.07).')
    pts = []
    N = 32
    for i in range(N):
        # Fibonacci sphere direction, radius cut back by deterministic facets
        y = 1 - 2 * (i + 0.5) / N
        rad = math.sqrt(max(0.0, 1 - y * y))
        th = math.pi * (3 - math.sqrt(5)) * i + ri * 1.37
        k = 0.66 + 0.34 * _hash01(i, ri + 1)
        # one broad flat (impact face) per rock
        d = (math.cos(th) * rad * math.cos(ri * 1.1) + y * 0.5 + math.sin(th) * rad * math.sin(ri * 1.1))
        if d > 0.72:
            k *= 0.8
        pts.append((math.cos(th) * rad * k, y * k, math.sin(th) * rad * k))
    hull_faces(p, pts)

# ===================================================================== #
# SK_Fence: pylon hardware inside the source solids
#   source: column 2.6 x h x 2.6, base 3.6 x 1.2 x 3.6, coil plates 3.4 x 0.5 x 3.4,
#   coil glow 3.5 x 0.2 x 3.5 at +0.15. Local origin = pylon foot centre.
# ===================================================================== #
M = 'SK_Fence'
p = part(M, 'column', 'dark', DARK, 4, stamp={'origin': '(xPylon, 0, z)', 'scale': 'sy=h'},
         note='Octagonal pylon column inscribed in the source 2.6 square, unit height.')
yprism(p, octo(-1.3, 1.3, -1.3, 1.3, 0.55), 0, 1, caps=(False, True))

p = part(M, 'base', 'hull', 0x8a96a6, 4, stamp={'origin': '(xPylon, 0, z)', 'scale': 'none'},
         note='Stepped footing inside the source 3.6 x 1.2 x 3.6 base.')
yprism(p, octo(-1.8, 1.8, -1.8, 1.8, 0.5), 0, 0.65, caps=(False, True))
frustum(p, octo(-1.6, 1.6, -1.6, 1.6, 0.5), 0.65, octo(-1.4, 1.4, -1.4, 1.4, 0.56), 1.2)

p = part(M, 'insulator', 'dark', DARK, 3, stamp={'origin': '(xPylon, yCoil, z)', 'scale': 'none'},
         note='Insulator drum with chamfered rims inside the source coil plate (r <= 1.7, 0.5 tall).')
lathe(p, [(1.32, 0.0), (1.66, 0.07), (1.66, 0.43), (1.32, 0.5)], (0, 0, 0), (0, 1, 0), n=8, phase=math.pi / 8)

p = part(M, 'insulator_glow', 'neon', 0x9fe8ff, 8, gain=1.3, fx={'anim': [BREATHE, 2.2, 'source k/4 (+0.5 far)']},
         stamp={'origin': '(xPylon, yCoil, z)', 'scale': 'none'},
         note='Current glow between the sheds: the source coil neon tuple and colour, inside the source glow box.')
lathe(p, [(1.6, 0.33), (1.74, 0.33), (1.74, 0.17)], (0, 0, 0), (0, 1, 0), n=8, phase=math.pi / 8)

# ===================================================================== #
# SP_Platform: floating platform body inside the source solids
#   source: deck 16 x 2.4 x 16 (y 0..2.4), skirt 17.5 x 0.5 x 17.5 (y -0.5..0),
#   strut 2 x 6 x 2 (y -6.2..-0.2), corner thrusters 1.6 x 1.2 x 1.6 (y -1.6..-0.4).
#   Local origin = platform centre at the deck underside. Top face unchanged.
# ===================================================================== #
M = 'SP_Platform'
p = part(M, 'deck', 'deck', 0xc8d2de, 8, stamp={'origin': '(f.x, f.y, f.z)', 'scale': 'none'},
         note='Deck slab with a recessed side band (0.25 deep) between corner posts and ribs; top face is the source plane y2.4.')
yprism(p, rect(-8, 8, -8, 8), 0.0, 0.5, caps=(False, True))
yprism(p, rect(-7.75, 7.75, -7.75, 7.75), 0.5, 1.9, caps=(False, False))
yprism(p, rect(-8, 8, -8, 8), 1.9, 2.4, caps=(True, True))
for sx in (-1, 1):
    for sz in (-1, 1):
        x0, x1 = sorted((sx * 8.0, sx * 7.1))
        z0, z1 = sorted((sz * 8.0, sz * 7.1))
        box_minmax(p, (x0, 0.5, z0), (x1, 1.9, z1), skip=('-y', '+y'))
for s in (-1, 1):
    for c in (-2.7, 2.7):
        a, b = sorted((s * 8.0, s * 7.75))
        box_minmax(p, (a, 0.5, c - 0.35), (b, 1.9, c + 0.35), skip=('-y', '+y', '+x' if s < 0 else '-x'))
        box_minmax(p, (c - 0.35, 0.5, a), (c + 0.35, 1.9, b), skip=('-y', '+y', '+z' if s < 0 else '-z'))

p = part(M, 'skirt', 'dark', DARK, 8, stamp={'origin': '(f.x, f.y, f.z)', 'scale': 'none'},
         note='Chamfered skirt inside the source skirt box (17.5 square, y -0.5..0).')
frustum(p, octo(-8.3, 8.3, -8.3, 8.3, 0.9), -0.5, octo(-8.75, 8.75, -8.75, 8.75, 0.7), 0.0)

p = part(M, 'strut', 'dark', DARK, 6, stamp={'origin': '(f.x, f.y, f.z)', 'scale': 'none'},
         note='Tapered station-keeping strut and collar inside the source 2 x 6 x 2 strut.')
frustum(p, rect(-0.5, 0.5, -0.5, 0.5, cf=0.12), -6.2, rect(-1.0, 1.0, -1.0, 1.0, cf=0.25), -0.5)
yprism(p, rect(-0.85, 0.85, -0.85, 0.85, cf=0.2), -3.4, -3.0, caps=(True, True))

p = part(M, 'nacelle', 'dark', DARK, 3, stamp={'origin': '(f.x +- 6.5, f.y, f.z +- 6.5)', 'scale': 'none'},
         note='Thruster nacelle inside the source 1.6 x 1.2 x 1.6 thruster box (local origin on its axis, y -1.6..-0.4).')
cylinder(p, (0, -0.4, 0), (0, -1.15, 0), 0.78, n=10, caps=(False, False))
cylinder(p, (0, -1.15, 0), (0, -1.6, 0), 0.78, 0.6, n=10, caps=(False, True))

# ===================================================================== #
# SP_Truss: distant station truss bay inside the source 3 x 3 girder box
#   local origin = girder centreline at its underside; 16 m bay along z (-8..8)
# ===================================================================== #
M = 'SP_Truss'
p = part(M, 'bay', 'dark', 0x5a6472, 10, stamp={'origin': '(x, y, zBay)', 'scale': 'none'},
         note='Open lattice bay: four chords, an end frame, face and top diagonals. Members 0.4; all inside x+-1.5, y0..3.')
T_ = 0.4
for cx in (-1.3, 1.3):
    for cy in (0.2, 2.8):
        box_minmax(p, (cx - T_ / 2, cy - T_ / 2, -8), (cx + T_ / 2, cy + T_ / 2, 8), skip=('-z', '+z'))
for cx in (-1.3, 1.3):
    box_minmax(p, (cx - T_ / 2, 0.4, -8), (cx + T_ / 2, 2.6, -7.6), skip=('-y', '+y'))
for cy in (0.2, 2.8):
    box_minmax(p, (-1.1, cy - T_ / 2, -8), (1.1, cy + T_ / 2, -7.6), skip=('-x', '+x'))
for cx in (-1.3, 1.3):
    hull_faces(p, [(cx - 0.15, 0.4, -7.6), (cx + 0.15, 0.4, -7.6), (cx - 0.15, 0.4, -7.1), (cx + 0.15, 0.4, -7.1),
                   (cx - 0.15, 2.6, 7.6), (cx + 0.15, 2.6, 7.6), (cx - 0.15, 2.6, 7.1), (cx + 0.15, 2.6, 7.1)])
hull_faces(p, [(-1.1, 2.65, -7.6), (-1.1, 2.95, -7.6), (-1.1, 2.65, -7.1), (-1.1, 2.95, -7.1),
               (1.1, 2.65, 7.6), (1.1, 2.95, 7.6), (1.1, 2.65, 7.1), (1.1, 2.95, 7.1)])

# ===================================================================== #
# SE_Bulkhead: where a fortress deck meets open space
#   Authored for the arrival face: cliff face plane local z = 0 facing -z, deck top y 0,
#   slab underside y -2.4, cliff down to y -40.4. Stamp rotY = pi for a departure lip
#   (every part is symmetric in x). All parts are at y <= -1.5: under every flight floor.
# ===================================================================== #
M = 'SE_Bulkhead'
BS = {'origin': '(0, 0, zEdge)', 'scale': 'none; rotY 0 arrival, pi departure'}
p = part(M, 'ribs', 'hull', STRUCT, 8, stamp=BS,
         note='Seven battered buttress ribs down the cliff face, 1.7 proud at the shoulder.')
for xc in (-27, -18, -9, 0, 9, 18, 27):
    xprism(p, [(0.0, -3.3), (-1.7, -7.0), (-1.7, -29.0), (0.0, -38.4)], xc - 0.9, xc + 0.9)

p = part(M, 'corbel', 'hull', FRAME, 6, stamp=BS, note='Stepped corbel course under the deck lip, full width.')
xprism(p, [(0.0, -5.4), (-0.55, -4.7), (-0.9, -4.7), (-0.9, -3.3), (0.0, -3.3)], -31.0, 31.0)

p = part(M, 'catwalk', 'dark', DARK, 6, stamp=BS, note='Inspection catwalk between the ribs at y -9, with a two-bar rail.')
for xa, xb in ((-26.1, -18.9), (-17.1, -9.9), (-8.1, -0.9), (0.9, 8.1), (9.9, 17.1), (18.9, 26.1)):
    box_minmax(p, (xa, -9.3, -1.45), (xb, -9.0, 0.0), skip=('+z',))
    box_minmax(p, (xa, -8.0, -1.45), (xb, -7.9, -1.35), skip=('-x', '+x'))
    box_minmax(p, (xa, -8.5, -1.43), (xb, -8.44, -1.37), skip=('-x', '+x'))

p = part(M, 'launch_rail', 'dark', DARK, 5, stamp={'origin': '(+-8, 0, zEdge)', 'scale': 'none; rotY as the bulkhead'},
         note='Launch rail cantilevered 10 m beyond the lip just under deck level (y -2.3..-1.5), end stop and two raking struts.')
box_minmax(p, (-0.45, -2.3, -10.0), (0.45, -1.5, 0.0), skip=('+z',))
box_minmax(p, (-0.7, -2.5, -10.4), (0.7, -1.5, -10.0))
for za, zb in ((-9.0, -1.7), (-5.0, -1.7)):
    hull_faces(p, [(-0.2, -2.3, za - 0.25), (0.2, -2.3, za - 0.25), (-0.2, -2.3, za + 0.25), (0.2, -2.3, za + 0.25),
                   (-0.2, -7.2, zb), (0.2, -7.2, zb), (-0.2, -6.6, zb), (0.2, -6.6, zb)])

p = part(M, 'rail_lamp', 'neon', 0xffb43a, 8, gain=1.2, fx={'anim': [CHASE, 0.8, 'k/5']}, stamp={'origin': '(+-8, 0, zEdge - dir*(2k+1))', 'scale': 'none'},
         note='Small launch-rail chase lamp on the rail top (source lip-lamp colour and rate).')
box_minmax(p, (-0.2, -1.5, -0.2), (0.2, -1.36, 0.2), skip=('-y',))

p = part(M, 'pylon_shaft', 'hull', STEEL, 5, stamp={'origin': '(+-25, 0, zPylon)', 'scale': 'sy=h'},
         note='Launch pylon shaft, octagonal, inset 0.15 inside the source 3 x h x 3 box. Unit height.')
yprism(p, octo(-1.35, 1.35, -1.35, 1.35, 0.5), 0, 1, caps=(False, True))

p = part(M, 'pylon_band', 'dark', DARK, 4, stamp={'origin': '(+-25, y, zPylon)', 'scale': 'none'},
         note='Band collar at the full source width (3 x 3), 0.5 tall.')
yprism(p, octo(-1.5, 1.5, -1.5, 1.5, 0.5), 0.0, 0.5, caps=(True, True))

# ===================================================================== #
# BA_Arena: boss arena architecture inside the source solids
#   far buttress 8 x h x 8 (h seeded 26..44), near block 8 x 3.2 x 8, coil plates 9 x 0.6 x 9,
#   throat wall 14 x 40 x 96 (far). Local origin = solid foot centre unless noted.
# ===================================================================== #
M = 'BA_Arena'
PB = rect(-3.4, 3.4, -3.4, 3.4, cf=0.7)
p = part(M, 'pier_base', 'hull', FRAME, 8, stamp={'origin': '(xPier, 0, zPier)', 'scale': 'none; rotY pi on the near side is not used'},
         note='Battered pier footing y0..5 from the full source footprint.')
frustum(p, rect(-4, 4, -4, 4, cf=0.5), 0, PB, 5.0)

p = part(M, 'pier_shaft', 'hull', 0x9fb0c2, 8, stamp={'origin': '(xPier, 5, zPier)', 'scale': 'sy=h-9'},
         note='Pier shaft, chamfered, unit height (source buttress tint).')
yprism(p, PB, 0, 1, caps=(False, False))

p = part(M, 'pier_fins', 'hull', FRAME, 6, stamp={'origin': '(xPier, 5, zPier)', 'scale': 'sy=h-9'},
         note='Twin fins on the lane face out to the source face plane, unit height; the source light strip runs between them.')
for za, zb in ((-2.2, -1.5), (1.5, 2.2)):
    box_minmax(p, (-4.0, 0.0, za), (-3.4, 1.0, zb), skip=('+x', '-y', '+y'))

p = part(M, 'pier_crown', 'hull', FRAME, 8, stamp={'origin': '(xPier, h-4, zPier)', 'scale': 'none'},
         note='Flared crown back out to the full source footprint, 4 tall, top at the seeded buttress height.')
frustum(p, PB, 0.0, rect(-4, 4, -4, 4, cf=0.35), 1.6)
yprism(p, rect(-4, 4, -4, 4, cf=0.35), 1.6, 3.0, caps=(False, False))
frustum(p, rect(-4, 4, -4, 4, cf=0.35), 3.0, rect(-3.0, 3.0, -3.0, 3.0, cf=0.3), 4.0)

p = part(M, 'coil', 'dark', DARK, 3, stamp={'origin': '(xPier, yCoil, zPier)', 'scale': 'none'},
         note='Octagonal conduit coil ring inside the source 9 x 0.6 x 9 plate.')
yprism(p, octo(-4.5, 4.5, -4.5, 4.5, 1.5), 0.0, 0.6, caps=(True, True))

p = part(M, 'near_block', 'hull', 0x9fb0c2, 8, stamp={'origin': '(xBlock, 0, zBlock)', 'scale': 'none'},
         note='Near-side block inside the source 8 x 3.2 x 8 solid: chamfered body, sloped shoulders.')
NB = rect(-4, 4, -4, 4, cf=0.6)
yprism(p, NB, 0, 2.3, caps=(False, False))
frustum(p, NB, 2.3, rect(-3.1, 3.1, -3.1, 3.1, cf=0.4), 3.2)

p = part(M, 'throat_rib', 'hull', FRAME, 8, stamp={'origin': '(0, 0, zRib)', 'scale': 'sy=40'},
         note='Rib on the far throat wall, flush with the source face x41 (wall mass moves back to x41.5). Unit height, absolute x.')
box_minmax(p, (41.0, 0.0, -0.9), (41.5, 1.0, 0.9), skip=('+x', '-y'))

p = part(M, 'throat_band', 'hull', FRAME, 8, stamp={'origin': '(0, y, zMid)', 'scale': 'sz=len'},
         note='Horizontal band on the far throat wall, flush with the source face. Unit length, absolute x.')
box_minmax(p, (41.0, -0.5, -0.5), (41.5, 0.5, 0.5), skip=('+x', '-z', '+z'))
