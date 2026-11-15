"""
Shared authoring DSL for the KnotzAxxon environment kit (deterministic, no RNG).

Extracted unchanged from the Reactor Spine generator (generate_kit.py, Fable
build, sha256 in evidence/provenance.json) so later sector modules author parts
with exactly the same helpers, axes and palette.

All dimensions are game metres in game axes (kit_geometry.py). Unless a part
says otherwise its x is ABSOLUTE game x (stamp with x = 0) and its z is local.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kit_geometry as K  # noqa: E402,F401
from kit_geometry import (Part, T, RY, RX, RZ, S, box_minmax, inv_box, quad, chamfer_box, hull_faces, prism,  # noqa: E402,F401
                          cylinder, lathe, disc, blade, torus_arc, ring_plate)

PI = math.pi
WX = 27.0             # source wall face
FIELD = 27.4          # recessed wall-field plane (front of the new wall mass)
BACK = 34.0           # source wall back
PIER = 25.95          # pier shaft / gallery front
NOSE = 25.75          # pier foot front (source ledge reaches 25.7)
TOP = 35.0            # ALT_MAX + 10

# Restrained palette: the source wall tint, two structural greys, source darks,
# and only the reactor theme's own emissive colours.
WALL = 0xc8d2de       # source trench wall tint (mass keeps it)
STRUCT = 0xaab2bc     # piers, pylons, bastion
FRAME = 0x8e96a0      # rails, stiles, coping, jambs
DARK = 0xffffff       # darkMetal as authored by the source
RECESS = 0x303844     # source hangar recess tint
MECH = 0x5a6878       # source fan housing tint
SHUT = 0x56606c
GRATE = 0x7f8a99      # source vent grate tint
CONDUIT = 0xff7a3a    # theme conduit
ACCENT = 0xffbf69     # theme accent
WARM = 0xff8a3a       # theme warm
RED = 0xff3d55
STEADY, STROBE, CHASE, BREATHE, FLICKER = 0, 1, 2, 3, 4

PARTS = []


def part(module, name, bucket, tint, uv, gain=1.0, fx=None, stamp=None, note='', owner='chunk'):
    p = Part(module, name, bucket, tint, uv, gain, fx, stamp, note)
    p.owner = owner
    PARTS.append(p)
    return p


def plan(pts_xz):
    """(x, z) outline -> CCW (px, py) profile for yprism (py = -z)."""
    prof = [(x, -z) for x, z in pts_xz]
    area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof)))
    return prof if area > 0 else list(reversed(prof))


def rect(x0, x1, z0, z1, cf=0.0, cb=0.0):
    """Rectangle outline with optional front (x0) / back (x1) corner chamfers."""
    pts = []
    pts += [(x0 + cf, z0), (x1 - cb, z0)] if cb else [(x0 + cf, z0), (x1, z0)]
    if cb:
        pts += [(x1, z0 + cb), (x1, z1 - cb), (x1 - cb, z1)]
    else:
        pts += [(x1, z1)]
    pts += [(x0 + cf, z1)]
    if cf:
        pts += [(x0, z1 - cf), (x0, z0 + cf)]
    return pts


def yprism(P, outline_xz, y0, y1, caps=(False, True), M=None, convex=True):
    prism(P, plan(outline_xz), y0, y1, (M if M is not None else T()) @ RX(-PI / 2), caps, convex=convex)


def zprism(P, profile_xy, z0, z1, caps=(True, True), M=None, convex=True):
    prof = list(profile_xy)
    area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof)))
    if area < 0:
        prof.reverse()
    prism(P, prof, z0, z1, M if M is not None else T(), caps, convex=convex)


def xprism(P, profile_zy, x0, x1, caps=(True, True), M=None):
    prof = [(-z, y) for z, y in profile_zy]
    area = sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1] for i in range(len(prof)))
    if area < 0:
        prof.reverse()
    prism(P, prof, x0, x1, (M if M is not None else T()) @ RY(PI / 2), caps)


def frustum(P, lo_xz, y0, hi_xz, y1):
    """Convex solid between two convex outlines at different heights."""
    hull_faces(P, [(x, y0, z) for x, z in lo_xz] + [(x, y1, z) for x, z in hi_xz])
