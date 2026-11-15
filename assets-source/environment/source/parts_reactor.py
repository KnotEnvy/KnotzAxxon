"""REACTOR SPINE modules. Part definitions from the frozen Fable generator; changes made in the studio-completion
build are limited to budget trims: pier cap split into its own part, fan cowl/void 16 -> 12 sides, rotor blades 3 -> 2 sections."""
from kit_dsl import *  # noqa: F401,F403
import math

# ===================================================================== #
# RS_WallFrame: the structural skin in front of the recessed wall field
# ===================================================================== #
M = 'RS_WallFrame'
SHAFT = rect(PIER, FIELD, -1.3, 1.3, cf=0.28)

p = part(M, 'plinth', 'hull', FRAME, 6, stamp={'origin': '(0, 0, zMid)', 'scale': 'sz=len'},
         note='Stepped base course x26.3..27.4; the source base conduit sits in its kerb step. Unit length.')
zprism(p, [(FIELD, 0), (26.3, 0), (26.3, 0.55), (26.75, 0.55), (26.75, 1.25), (WX, 1.5), (FIELD, 1.5)], -0.5, 0.5, caps=(False, False), convex=False)

p = part(M, 'pier_foot', 'hull', STRUCT, 6, stamp={'origin': '(0, 0, zRib)', 'scale': 'none'},
         note='Battered pier footing at a source rib z: block to y1.9, shoulder to the shaft section at y2.5.')
FOOT = rect(NOSE, FIELD, -1.62, 1.62, cf=0.3)
yprism(p, FOOT, 0, 1.9, caps=(False, False))
frustum(p, FOOT, 1.9, SHAFT, 2.5)

p = part(M, 'pier_shaft', 'hull', STRUCT, 6, stamp={'origin': '(0, 2.5, zRib)', 'scale': 'sy=H-4.3'},
         note='Pier shaft x25.95..27.4, z+-1.3, chamfered. Unit height; the source rib height H sets sy.')
yprism(p, SHAFT, 0, 1, caps=(False, False))

p = part(M, 'pier_head', 'hull', STRUCT, 6, stamp={'origin': '(0, H-1.8, zRib)', 'scale': 'none'},
         note='Corbelled pier head: flares to x25.8, block, stepped cap. 1.8 tall, top at the source rib height.')
HEAD = rect(25.8, FIELD, -1.5, 1.5, cf=0.25)
frustum(p, SHAFT, 0, HEAD, 0.6)
yprism(p, HEAD, 0.6, 1.5, caps=(False, True))

p = part(M, 'pier_cap', 'hull', STRUCT, 6, stamp={'origin': '(0, H-1.8, zRib)', 'scale': 'none'},
         note='Stepped cap block on the pier head (split from pier_head so the two heaviest sectors can omit it).')
yprism(p, rect(26.15, FIELD, -1.05, 1.05, cf=0.2), 1.5, 1.8, caps=(False, True))

p = part(M, 'pier_lamp', 'neon', ACCENT, 8, gain=0.55, fx={'anim': [BREATHE, 0.4, 'i*0.17']}, stamp={'origin': '(0, H-1.8, zRib)', 'scale': 'none'},
         note='Dim head lamp (sub-bloom), mirrors the source near-side rib beacon rate/phase.')
box_minmax(p, (25.74, 0.85, -0.5), (25.8, 1.2, 0.5), skip=('+x',))

p = part(M, 'stile', 'hull', FRAME, 6, stamp={'origin': '(0, y0, z)', 'scale': 'sy=height'},
         note='Vertical frame member 0.4 proud of the field, unit height.')
box_minmax(p, (WX, 0, -0.25), (FIELD, 1, 0.25), skip=('+x', '-y', '+y'))

p = part(M, 'rail', 'hull', FRAME, 6, stamp={'origin': '(0, yMid, zMid)', 'scale': 'sz=len'},
         note='Horizontal frame member (frieze) 0.45 proud, 0.5 tall, unit length.')
box_minmax(p, (26.95, -0.25, -0.5), (FIELD, 0.25, 0.5), skip=('+x', '-z', '+z'))

p = part(M, 'coping', 'hull', FRAME, 6, stamp={'origin': '(0, h, zMid)', 'scale': 'sz=len'},
         note='Wall coping x26.8..34.2 with a weathered nose; sits on the source wall top y=h. Unit length.')
zprism(p, [(26.8, 0), (26.8, 0.3), (WX, 0.45), (34.2, 0.45), (34.2, 0)], -0.5, 0.5, caps=(False, False))

p = part(M, 'win_frame', 'dark', SHUT, 4, stamp={'origin': '(0, yMid, z)', 'scale': 'sy, sz'},
         note='Window bezel on the recessed field; unit y/z.')
box_minmax(p, (27.2, -0.5, -0.5), (FIELD, 0.5, 0.5), skip=('+x',))

p = part(M, 'win_glass', 'neon', 0xffffff, 8, fx={'anim': 'source window flicker tuple or none'}, stamp={'origin': '(0, yMid, z)', 'scale': 'sy, sz'},
         note='Lit pane; source size/warm flag/flicker tuple. Unit y/z.')
box_minmax(p, (27.14, -0.5, -0.5), (27.2, 0.5, 0.5), skip=('+x',))

p = part(M, 'sign_hood', 'hull', FRAME, 6, stamp={'origin': '(0, y+h+0.45, z)', 'scale': 'sz=w+1.4'},
         note='Hood over the source neon sign, unit length.')
zprism(p, [(FIELD, 0), (26.15, 0), (26.15, 0.1), (FIELD, 0.34)], -0.5, 0.5)

p = part(M, 'sign_arm', 'dark', DARK, 4, stamp={'origin': '(0, y, z)', 'scale': 'none'},
         note='Stand-off arm carrying the source sign backing off the recessed field.')
box_minmax(p, (26.88, -0.1, -0.1), (FIELD, 0.1, 0.1), skip=('+x', '-x'))

# ===================================================================== #
# RS_PipeRun: coolant mains threaded through the piers, risers to the crest
# ===================================================================== #
M = 'RS_PipeRun'
p = part(M, 'main', 'dark', DARK, 4, stamp={'origin': 'segment start on axis', 'scale': 'sx=sy=r, sz=len'},
         note='Unit pipe along +z (radius 1, 10 sides, open ends that always die inside a pier, pylon or collar).')
cylinder(p, (0, 0, 0), (0, 0, 1), 1.0, n=10, caps=(False, False), phase=PI / 10)

p = part(M, 'collar', 'hull', 0x8894a4, 4, stamp={'origin': '(26.4, yPipe, zFace)', 'scale': 'none'},
         note='Penetration collar where a main enters the approach (-z) face of a pier / pylon / bastion. Source collar tint.')
cylinder(p, (0, 0, -0.26), (0, 0, 0.02), 0.5, n=8, caps=(True, False), phase=PI / 8)

p = part(M, 'elbow_end', 'dark', DARK, 4, stamp={'origin': '(26.4, yPipe, zRunEnd)', 'scale': 'none'},
         note='Run end beside a bay or fan: quarter bend from +z into the wall with a wall flange. Local origin = end of the straight run.')
torus_arc(p, (0.6, 0, 0), 0.6, 0.34, PI / 2, PI, 2, n=8, plane='xz')
cylinder(p, (0.6, 0, 0.6), (1.05, 0, 0.6), 0.34, n=8, caps=(False, False))
cylinder(p, (0.78, 0, 0.6), (1.0, 0, 0.6), 0.52, n=6, caps=(True, False))

p = part(M, 'elbow_start', 'dark', DARK, 4, stamp={'origin': '(26.4, yPipe, zRunStart)', 'scale': 'none'},
         note='Mirror of elbow_end for the start of a run.')
torus_arc(p, (0.6, 0, 0), 0.6, 0.34, PI, 3 * PI / 2, 2, n=8, plane='xz')
cylinder(p, (0.6, 0, -0.6), (1.05, 0, -0.6), 0.34, n=8, caps=(False, False))
cylinder(p, (0.78, 0, -0.6), (1.0, 0, -0.6), 0.52, n=6, caps=(True, False))

p = part(M, 'riser', 'dark', DARK, 4, stamp={'origin': '(26.4, 5.1, z)', 'scale': 'sy=h-5.1+0.5'},
         note='Riser from the upper main to the crest, unit height, r0.26.')
cylinder(p, (0, 0, 0), (0, 1, 0), 0.26, n=8, caps=(False, False))

p = part(M, 'riser_tee', 'hull', 0x8894a4, 4, stamp={'origin': '(26.4, 5.1, z)', 'scale': 'none'},
         note='Tee sleeve on the upper main at the riser foot.')
cylinder(p, (0, 0.2, 0), (0, 0.75, 0), 0.38, n=8, caps=(False, True))
cylinder(p, (0, 0, -0.42), (0, 0, 0.42), 0.46, n=8, caps=(True, True), phase=PI / 8)

p = part(M, 'riser_head', 'dark', DARK, 4, stamp={'origin': '(0, h, z)', 'scale': 'none'},
         note='Riser bend over the coping into the crest coolant main (x28.2, y h+1.0). Absolute x.')
torus_arc(p, (26.9, 0.5, 0), 0.5, 0.26, PI / 2, PI, 4, n=8, plane='xy')
cylinder(p, (26.9, 1.0, 0), (28.2, 1.0, 0), 0.26, n=8, caps=(False, False))

p = part(M, 'riser_sleeve', 'hull', 0x8894a4, 4, stamp={'origin': '(26.4, L, z)', 'scale': 'none'},
         note='Deck sleeve where a riser passes through the gallery slab.')
cylinder(p, (0, -0.42, 0), (0, 0.14, 0), 0.4, n=8, caps=(True, True))

# ===================================================================== #
# RS_Gallery: belt-level service gallery at the source ledge height
# ===================================================================== #
M = 'RS_Gallery'
p = part(M, 'deck', 'dark', DARK, 6, stamp={'origin': '(0, L, zMid)', 'scale': 'sz=len'},
         note='Gallery slab x25.95..27.4, top at the source ledge y. Unit length.')
box_minmax(p, (PIER, -0.3, -0.5), (FIELD, 0.0, 0.5), skip=('+x',))

p = part(M, 'rail', 'dark', DARK, 4, stamp={'origin': '(0, L, zMid)', 'scale': 'sz=len'},
         note='Top rail and toe board, unit length.')
box_minmax(p, (25.97, 1.0, -0.5), (26.09, 1.12, 0.5), skip=('-z', '+z'))
box_minmax(p, (25.97, 0.0, -0.5), (26.03, 0.16, 0.5), skip=('-z', '+z', '-y'))

p = part(M, 'post', 'dark', DARK, 4, stamp={'origin': '(0, L, z)', 'scale': 'none'}, note='Stanchion.')
box_minmax(p, (25.98, 0.0, -0.05), (26.08, 1.0, 0.05), skip=('-y', '+y'))

p = part(M, 'brace', 'dark', DARK, 4, stamp={'origin': '(0, L, z)', 'scale': 'none'}, note='Knee brace under the slab.')
zprism(p, [(FIELD, -2.0), (FIELD, -0.3), (26.1, -0.3)], -0.09, 0.09)

# ===================================================================== #
# RS_ServiceBay: a true recessed bay at the source hangar placement
# ===================================================================== #
M = 'RS_ServiceBay'
BAYX = 30.6
p = part(M, 'shell', 'dark', RECESS, 6, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Pocket walls x27.0..30.6 (ceiling, back, both sides), inward facing. Unit y/z.')
inv_box(p, (WX, 0, -0.5), (BAYX, 1, 0.5), skip=('-x', '-y'))

p = part(M, 'floor', 'grate', GRATE, 3, stamp={'origin': '(0, 0, z)', 'scale': 'sz=w'}, note='Bay floor grating, unit length.')
quad(p, (WX - 0.7, 0.04, -0.5), (WX - 0.7, 0.04, 0.5), (BAYX, 0.04, 0.5), (BAYX, 0.04, -0.5))

p = part(M, 'jamb', 'hull', FRAME, 6, stamp={'origin': '(0, 0, zJamb)', 'scale': 'sy=h+1.5'},
         note='Bay jamb x26.55..27.4, 0.9 wide, unit height; one per side at z+-(w/2+0.45).')
yprism(p, rect(26.55, FIELD, -0.45, 0.45, cf=0.16), 0, 1, caps=(False, False))

p = part(M, 'header', 'hull', FRAME, 6, stamp={'origin': '(0, h, z)', 'scale': 'sz=w+1.8'},
         note='Header beam over the opening, unit length.')
zprism(p, [(FIELD, 0), (26.75, 0), (26.55, 0.2), (26.55, 1.3), (26.75, 1.5), (FIELD, 1.5)], -0.5, 0.5)

p = part(M, 'hazard', 'hazard', 0xffffff, 3, stamp={'origin': '(0, h, z)', 'scale': 'sz=w+1.2'},
         note='Source hazard lintel band on the header face, unit length.')
box_minmax(p, (26.5, 0.45, -0.5), (26.55, 1.05, 0.5), skip=('+x',))

p = part(M, 'shutter', 'dark', SHUT, 4, stamp={'origin': '(0, 0, z)', 'scale': 'sy=h, sz=w'},
         note='Half-raised roller shutter 1.6 m inside the bay; unit y/z.')
box_minmax(p, (28.5, 0.46, -0.5), (28.62, 1.0, 0.5), skip=('+x', '+y', '-z', '+z'))
for yy in (0.46, 0.62, 0.8):
    box_minmax(p, (28.42, yy, -0.5), (28.5, yy + 0.035, 0.5), skip=('+x', '-z', '+z'))

p = part(M, 'ceiling_light', 'neon', WARM, 8, gain=0.85, stamp={'origin': '(0, h, z)', 'scale': 'sz=w-1'},
         note='Source warm ceiling strip (tuple kept) at the bay mouth, unit length.')
box_minmax(p, (27.45, -0.14, -0.5), (27.75, -0.02, 0.5))

p = part(M, 'back_light', 'neon', 0xffd9a0, 8, gain=0.7, fx={'anim': [CHASE, 0.5, 0]}, stamp={'origin': '(0, 0, z)', 'scale': 'sz=w-2'},
         note='Source floor chase strip (tuple kept, warm white instead of player cyan) at the back wall, unit length.')
box_minmax(p, (30.38, 0.08, -0.5), (30.58, 0.3, 0.5), skip=('+x',))

p = part(M, 'strobe_housing', 'dark', DARK, 3, stamp={'origin': '(0, h+1.5, z)', 'scale': 'none'}, note='Strobe housing on the header.')
box_minmax(p, (26.66, 0, -0.34), (27.3, 0.3, 0.34), skip=('-y',))

p = part(M, 'strobe', 'neon', WARM, 8, gain=1.6, fx={'anim': [STROBE, 0.8, 'source phase']}, stamp={'origin': '(0, h+1.8, z)', 'scale': 'none'},
         note='Source warning strobe (size 0.55, gain 1.6, STROBE 0.8, source phase).')
box_minmax(p, (26.7, 0, -0.275), (27.25, 0.55, 0.275), skip=('-y',))

# ===================================================================== #
# RS_FanHousing: cowled extractor fan at the source pivot / radius / rate
# ===================================================================== #
M = 'RS_FanHousing'
HS = {'origin': '(0, y, z)', 'scale': 'sy=sz=r (x unscaled)'}
p = part(M, 'cowl', 'hull', FRAME, 5, stamp=HS, note='Round cowl from the field (x27.4) to a lip at x25.95, bore radius 1.0r.')
lathe(p, [(1.26, 0.0), (1.26, 0.85), (1.15, 1.45), (1.0, 1.45), (1.0, 0.04)], (FIELD, 0, 0), (-1, 0, 0), n=12, phase=PI / 12)

p = part(M, 'mount', 'dark', MECH, 5, stamp=HS, note='Square mounting plate on the field (source housing is 2.3r square).')
box_minmax(p, (27.26, -1.4, -1.4), (FIELD, 1.4, 1.4), skip=('+x',))

p = part(M, 'void', 'neon', 0x0c1418, 8, stamp=HS, note='Source near-black shroud void (neon bucket, 0x0c1418) at the duct back.')
disc(p, (27.24, 0, 0), (-1, 0, 0), 1.0, n=12, phase=PI / 12)

p = part(M, 'stator', 'dark', DARK, 4, stamp=HS, note='Three stator struts and the bearing behind the rotor sweep.')
for k in range(3):
    a = PI / 2 + k * 2 * PI / 3
    box_minmax(p, (-0.06, 0.17, -0.05), (0.06, 1.0, 0.05), T(26.9, 0, 0) @ RX(a - PI / 2))
cylinder(p, (27.24, 0, 0), (26.62, 0, 0), 0.18, n=8, caps=(False, True))

p = part(M, 'rotor', 'spin', 0xa8b4c2, 4, fx={'pivot': 'stamp origin', 'spin': 'source [1,0,0,rate]'},
         stamp={'origin': 'source pivot (26.3, y, z)', 'scale': 's=r'},
         note='Six twisted blades and spinner about +x; local origin is the source pivot; tip 0.9r inside the 1.0r bore.')
for k in range(6):
    blade(p, 0.16, 0.9, 0.34, 0.24, math.radians(36), math.radians(17), 0.035, k * PI / 3 + 0.3, sections=2)
lathe(p, [(0.17, -0.07), (0.17, 0.02), (0.11, 0.09), (0.0, 0.12)], (0, 0, 0), (-1, 0, 0), n=10)

# ===================================================================== #
# RS_ExhaustTrunk: the thermal exhaust trunk and coolant main on the crest
# ===================================================================== #
M = 'RS_ExhaustTrunk'
TR = [(29.6, 0.9), (29.6, 2.85), (30.05, 3.3), (32.55, 3.3), (33.0, 2.85), (33.0, 0.9)]
p = part(M, 'trunk', 'hull', STRUCT, 8, stamp={'origin': '(0, h, zMid)', 'scale': 'sz=len'},
         note='Exhaust trunk section x29.6..33.0, y h+0.9..h+3.3, chamfered crown. Unit length.')
zprism(p, TR, -0.5, 0.5, caps=(False, False))

p = part(M, 'joint', 'dark', DARK, 4, stamp={'origin': '(0, h, z)', 'scale': 'none'},
         note='Expansion joint rib with the trunk saddle and the coolant-main saddle, every 16 m.')
G = 0.16
zprism(p, [(29.6 - G, 0.9), (29.6 - G, 2.92), (30.0, 3.3 + G), (32.6, 3.3 + G), (33.0 + G, 2.92), (33.0 + G, 0.9)], -0.3, 0.3)
box_minmax(p, (29.9, 0.45, -0.4), (32.7, 0.9, 0.4), skip=('-y', '+y'))
box_minmax(p, (27.75, 0.45, -0.22), (28.65, 0.72, 0.22), skip=('-y',))

p = part(M, 'vent', 'dark', MECH, 4, stamp={'origin': '(0, h, z)', 'scale': 'none'}, note='Vent hood on the trunk crown.')
box_minmax(p, (30.4, 3.3, -1.2), (32.2, 3.78, 1.2), skip=('-y',))

p = part(M, 'vent_glow', 'neon', CONDUIT, 8, gain=0.8, fx={'anim': [CHASE, 0.35, 'fract(|z - zCore| / 160)']}, stamp={'origin': '(0, h, z)', 'scale': 'none'},
         note='Vent throat glow on the lane side of the hood; chase phase converges on the reactor core.')
box_minmax(p, (30.34, 3.4, -1.0), (30.4, 3.68, 1.0), skip=('+x',))

p = part(M, 'house_body', 'hull', STRUCT, 8, stamp={'origin': '(0, yMin, zSeam)', 'scale': 'sy=height'},
         note='Junction house on a chunk seam where the seeded wall height steps; x27.05..34.3, z0..4.4. Unit height.')
yprism(p, rect(27.05, 34.3, 0.0, 4.4, cf=0.4), 0, 1, caps=(False, False))

p = part(M, 'house_roof', 'dark', DARK, 4, stamp={'origin': '(0, yTop, zSeam)', 'scale': 'none'}, note='Junction house roof slab and twin flues.')
chamfer_box(p, (30.6, 0.25, 2.2), (7.9, 0.5, 5.0), 0.18)
for zc in (1.3, 3.1):
    cylinder(p, (31.3, 0.5, zc), (31.3, 2.1, zc), 0.5, n=8, caps=(False, True))

p = part(M, 'house_louvre', 'dark', SHUT, 4, stamp={'origin': '(0, yTop-2.6, zSeam)', 'scale': 'none'}, note='Lane-facing louvres.')
for k in range(3):
    zprism(p, [(26.93, k * 0.6), (27.1, k * 0.6), (27.1, k * 0.6 + 0.44), (26.84, k * 0.6 + 0.36)], 0.9, 3.5)

p = part(M, 'house_lamp', 'neon', RED, 8, gain=1.4, fx={'anim': [STROBE, 0.7, 'fract(zSeam/97)']}, stamp={'origin': '(0, yTop+0.5, zSeam)', 'scale': 'none'}, note='Roof warning lamp.')
box_minmax(p, (27.5, 0, 2.0), (27.9, 0.4, 2.4), skip=('-y',))

# ===================================================================== #
# RS_GateHousing
#   pylon_*  static far-wall structure in the CHUNK batch (persists)
#   others   gate-feature ornament in the obstacle batch, strictly inside the
#            source gate solids (posts / coil rings / lintel), so the picture
#            can only shrink relative to the source silhouette
# ===================================================================== #
M = 'RS_GateHousing'
GS = {'origin': '(0, 0, gate.z)', 'scale': 'none'}
PYL = rect(26.7, 34.3, -3.3, 3.3, cf=0.5)
p = part(M, 'pylon_body', 'hull', STRUCT, 8, stamp=GS, note='Gate pylon behind the far post, x26.7..34.3, z+-3.3, y0..36.6.')
yprism(p, PYL, 0, 36.6, caps=(False, True))

p = part(M, 'pylon_footing', 'hull', FRAME, 8, stamp=GS, note='Battered footing, y0..6, flaring to z+-4.7.')
frustum(p, rect(26.2, 34.3, -4.7, 4.7, cf=0.6), 0, PYL, 6.0)

p = part(M, 'pylon_cheeks', 'hull', FRAME, 6, stamp=GS, note='Two cheeks x25.9..26.7 flanking the far post so it sits in a channel.')
for s in (-1, 1):
    a, b = (2.15, 3.0) if s > 0 else (-3.0, -2.15)
    yprism(p, rect(25.9, 26.75, a, b, cf=0.14), 0, 35.6, caps=(False, True))

p = part(M, 'pylon_bands', 'dark', DARK, 4, stamp=GS, note='Dark bands wrapping the pylon at y 12 / 24.')
for yy in (12.0, 24.0):
    yprism(p, rect(26.5, 34.5, -3.5, 3.5, cf=0.55), yy - 0.3, yy + 0.3, caps=(True, True))

p = part(M, 'pylon_crown', 'dark', DARK, 4, stamp=GS, note='Crown block and beacon mast above the gate header.')
chamfer_box(p, (30.45, 37.4, 0), (8.5, 1.6, 7.4), 0.3)
box_minmax(p, (30.3, 38.2, -0.2), (30.7, 39.6, 0.2), skip=('-y',))

p = part(M, 'pylon_beacon', 'neon', RED, 8, gain=1.4, fx={'anim': [STROBE, 0.9, 'fract(gate.z/53)']}, stamp=GS, note='Mast beacon.')
box_minmax(p, (30.2, 39.6, -0.3), (30.8, 40.2, 0.3))

FEAT = dict(owner='gate-feature')
OCT = [(24.55, -1.9), (27.05, -1.9), (27.4, -1.55), (27.4, 1.55), (27.05, 1.9), (24.55, 1.9), (24.2, 1.55), (24.2, -1.55)]
p = part(M, 'collar', 'dark', DARK, 3, stamp={'origin': '(0, yCoil, gate.z)', 'scale': 'none; rotY 0 far, pi near'}, **FEAT,
         note='Emitter collar at a source coil height: two chamfered plates and a core, inside the source coil box (x24.2..27.4, 0.7 tall, z+-1.9).')
yprism(p, OCT, 0.0, 0.2, caps=(True, True))
yprism(p, OCT, 0.5, 0.7, caps=(True, True))
yprism(p, rect(24.5, 27.1, -1.62, 1.62), 0.2, 0.5, caps=(False, False))

p = part(M, 'emitter', 'neon', CONDUIT, 8, gain=1.3, fx={'anim': [BREATHE, 1.4, 'yCoil/top']}, stamp={'origin': '(0, yCoil, gate.z)', 'scale': 'none; rotY 0 far, pi near'}, **FEAT,
         note='Emitter slot glow, the source coil neon tuple, recessed between the plates.')
yprism(p, rect(24.32, 27.28, -1.78, 1.78), 0.24, 0.46, caps=(False, False))

p = part(M, 'truss', 'dark', DARK, 4, stamp=GS, **FEAT,
         note='Open box-girder header inside the source lintel volume (x-27..27, y35..36.6, z+-1.7).')
X0, X1 = -27.0, 27.0
for ya, yb in ((35.0, 35.34), (36.26, 36.6)):
    for za, zb in ((-1.7, -1.3), (1.3, 1.7)):
        box_minmax(p, (X0, ya, za), (X1, yb, zb), skip=('-x', '+x'))
panels = 9
step = (X1 - X0) / panels
for k in range(panels + 1):
    x = X0 + k * step
    for zc in (-1.5, 1.5):
        box_minmax(p, (max(X0, x - 0.11), 35.34, zc - 0.11), (min(X1, x + 0.11), 36.26, zc + 0.11), skip=('-y', '+y'))
    box_minmax(p, (max(X0, x - 0.1), 36.3, -1.3), (min(X1, x + 0.1), 36.5, 1.3), skip=('-z', '+z'))
for k in range(panels):
    xa, xb = X0 + k * step, X0 + (k + 1) * step
    a, b = ((xa + 0.2, 35.36), (xb - 0.2, 36.24)) if k % 2 == 0 else ((xa + 0.2, 36.24), (xb - 0.2, 35.36))
    dx, dy = b[0] - a[0], b[1] - a[1]
    ln = math.hypot(dx, dy)
    nx, ny = -dy / ln * 0.085, dx / ln * 0.085
    for zc in (-1.5, 1.5):
        zprism(p, [(a[0] + nx, a[1] + ny), (a[0] - nx, a[1] - ny), (b[0] - nx, b[1] - ny), (b[0] + nx, b[1] + ny)], zc - 0.07, zc + 0.07)

p = part(M, 'manifold', 'dark', DARK, 4, stamp=GS, **FEAT, note='Coolant manifold inside the header girder.')
cylinder(p, (-26.9, 35.8, 0), (26.9, 35.8, 0), 0.34, n=10, caps=(False, False))

p = part(M, 'lamp_arm', 'dark', DARK, 3, stamp={'origin': '(x, 0, gate.z)', 'scale': 'none'}, **FEAT,
         note='Arm from the bottom chord to each source chase lamp (x step 3, z-1.8).')
box_minmax(p, (-0.07, 35.0, -1.7), (0.07, 35.14, -1.5), skip=('+z',))

# ===================================================================== #
# RS_ReactorCore: the containment bastion - the sector landmark
#   plan x25.95..34.6, 26 m long; body stretches with the seeded wall height
# ===================================================================== #
M = 'RS_ReactorCore'
CS = {'origin': '(0, y, zCore)', 'scale': 'see note'}
BODY = [(PIER, -7.5), (PIER, 7.5), (FIELD, 13.0), (34.6, 13.0), (34.6, -13.0), (FIELD, -13.0)]
BASE = [(NOSE, -7.9), (NOSE, 7.9), (27.2, 13.7), (34.6, 13.7), (34.6, -13.7), (27.2, -13.7)]
SLOTS = [(-5.5, -4.1), (-1.0, 1.0), (4.1, 5.5)]   # core sight slots on the front face (z ranges)
SY0, SY1 = 0.14, 0.9                               # slot span in unit body height

p = part(M, 'podium', 'hull', FRAME, 8, stamp=CS, note='Battered podium y0..5 (stamp y=0).')
frustum(p, BASE, 0, BODY, 5.0)

p = part(M, 'body', 'hull', STRUCT, 8, stamp=CS,
         note='Bastion body, unit height (stamp y=5, sy=Hb-5): flanks, back, and a front wall with three true slot pockets 0.55 deep.')
# flanks + back as open prism sides (front face built by hand below)
pts = [(x, 0.0, z) for x, z in BODY] + [(x, 1.0, z) for x, z in BODY]
n = len(BODY)
side_faces = []
for i in range(n):
    j = (i + 1) % n
    if i == 0:
        continue  # front face (PIER plane) handled below
    side_faces.append((i, j, n + j, n + i))
p._add(pts, side_faces, [False] * len(side_faces), T())
zs = [-7.5] + [v for s in SLOTS for v in s] + [7.5]
for k in range(0, len(zs), 2):                      # solid strips between slots
    quad(p, (PIER, 0, zs[k]), (PIER, 0, zs[k + 1]), (PIER, 1, zs[k + 1]), (PIER, 1, zs[k]))
for za, zb in SLOTS:
    quad(p, (PIER, 0, za), (PIER, 0, zb), (PIER, SY0, zb), (PIER, SY0, za))
    quad(p, (PIER, SY1, za), (PIER, SY1, zb), (PIER, 1, zb), (PIER, 1, za))
    inv_box(p, (PIER, SY0, za), (PIER + 0.55, SY1, zb), skip=('-x', '+x'))

p = part(M, 'slot_glow', 'neon', CONDUIT, 8, gain=0.78, fx={'anim': [BREATHE, 0.5, 'k*0.33']}, stamp=CS,
         note='Core glow at the back of each slot (sub-bloom lit panel). Unit height with the body.')
for za, zb in SLOTS:
    quad(p, (PIER + 0.54, SY0, za), (PIER + 0.54, SY0, zb), (PIER + 0.54, SY1, zb), (PIER + 0.54, SY1, za))

p = part(M, 'slot_bars', 'dark', DARK, 4, stamp=CS, note='Shield bars across the slots. Unit height with the body.')
for za, zb in SLOTS:
    for k in range(1, 8):
        yy = SY0 + (SY1 - SY0) * k / 8
        box_minmax(p, (PIER + 0.12, yy - 0.006, za), (PIER + 0.3, yy + 0.006, zb), skip=('+x', '-z', '+z'))

p = part(M, 'fins', 'hull', FRAME, 6, stamp=CS, note='Vertical fins between the slots, 0.2 proud. Unit height with the body.')
for zc in (-7.1, -2.55, 2.55, 7.1):
    box_minmax(p, (NOSE, 0.0, zc - 0.3), (PIER, 1.0, zc + 0.3), skip=('+x', '-y', '+y'))

DX, DR = 33.5, 6.0   # containment drum axis x and radius (front arc sits behind the bastion front)
p = part(M, 'crown', 'hull', FRAME, 8, stamp=CS, note='Cornice at the body top (stamp y=Hb).')
CORN = [(25.7, -7.8), (25.7, 7.8), (27.2, 13.35), (34.9, 13.35), (34.9, -13.35), (27.2, -13.35)]
yprism(p, CORN, 0.0, 0.9, caps=(True, True))

p = part(M, 'drum', 'hull', STRUCT, 10, stamp=CS,
         note='Containment drum below the dome (axis x33.5, r6): its rear arc stands behind the wall line. Unit height (stamp y=0, sy=Hb+0.9).')
cylinder(p, (DX, 0, 0), (DX, 1, 0), DR, n=20, caps=(False, False))

p = part(M, 'dome', 'hull', STRUCT, 10, stamp=CS, note='Drum ring, springing and containment dome above the cornice (stamp y=Hb).')
lathe(p, [(DR + 0.6, 0.9), (DR + 0.6, 1.7), (DR, 1.7), (DR, 4.0), (DR - 0.25, 5.4), (DR - 1.15, 7.3), (DR - 2.7, 8.7), (1.7, 9.4), (1.7, 10.3)],
      (DX, 0, 0), (0, 1, 0), n=20, close=(False, True))

p = part(M, 'dome_band', 'neon', CONDUIT, 8, gain=0.8, fx={'anim': [BREATHE, 0.35, 0.18]}, stamp=CS, note='Heat band at the dome springing (sub-bloom).')
lathe(p, [(DR + 0.08, 3.4), (DR + 0.08, 3.85)], (DX, 0, 0), (0, 1, 0), n=20)

p = part(M, 'stacks', 'dark', DARK, 4, stamp=CS, note='Vent stacks on the dome shoulder and the flue cap.')
for k in range(6):
    a = k * 2 * PI / 6 + PI / 6
    cylinder(p, (DX + math.cos(a) * 3.4, 8.2, math.sin(a) * 3.4), (DX + math.cos(a) * 3.4, 11.2, math.sin(a) * 3.4), 0.45, n=8, caps=(False, True))
lathe(p, [(1.95, 10.1), (1.95, 10.9), (0.0, 11.1)], (DX, 0, 0), (0, 1, 0), n=12)

p = part(M, 'strobe', 'neon', RED, 8, gain=1.6, fx={'anim': [STROBE, 0.6, 'k*0.5']}, stamp={'origin': '(33.5+-1, Hb+11.1, zCore)', 'scale': 'none'}, note='Crown strobes, two stamps.')
box_minmax(p, (-0.3, 0, -0.3), (0.3, 0.55, 0.3), skip=('-y',))

p = part(M, 'vent', 'dark', SHUT, 4, stamp={'origin': '(0, y, z)', 'scale': 'none'},
         note='Flush vent grille on the bastion front for a source fan steam emitter that falls inside the bastion.')
for k in range(4):
    zprism(p, [(25.83, -0.9 + k * 0.5), (PIER, -0.9 + k * 0.5), (PIER, -0.9 + k * 0.5 + 0.36), (25.8, -0.9 + k * 0.5 + 0.28)], -1.1, 1.1)
