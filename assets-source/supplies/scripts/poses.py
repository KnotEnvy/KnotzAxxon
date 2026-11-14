"""Reproducible pose definitions shared by rendering and clearance checks.

Gameplay motion reproduced exactly (src/entities/Enemies.js):
  Silo:     hatch.position.y = 2.45 + doors * 0.1 ; hatch.scale = 1 - doors * 0.85
            glow.position.y = 2.415 ; glow.scale = 0.4 + doors * 0.55 ; doors in [0, 1]
            missile launch point = entity position + (0, 3, 0)
  FuelCell: band.position.y = 2.2 + sin(...) * 1.1 ; band.rotation.y += dt * 1.2
Blender is Z up, so glTF Y maps to Blender Z and glTF rotation about +Y is Blender rotation about +Z.
Destruction poses (detached hatch, ruptured tank) are demonstration states, not gameplay motion.
"""
import math
from mathutils import Matrix, Vector

SILO_HATCH_PIVOT = 2.45
SILO_GLOW_PIVOT = 2.415
SILO_LAUNCH = (0.0, 0.0, 3.0)
FUEL_BAND_PIVOT = 2.2
FUEL_BAND_TRAVEL = 1.1
FUEL_CAP_PIVOT = 3.76
STAVE_CENTERS = [math.tau / 3 + k * math.tau / 3 for k in range(3)]
HINGE_R, HINGE_Z = 1.25, 0.93

SILO_POSES = {
    'rest': dict(doors=0.0),
    'charge': dict(doors=0.5),
    'open': dict(doors=1.0),
    'launch': dict(doors=1.0, marker=True),
    'detached': dict(doors=1.0, detached=True),
}

FUEL_POSES = {
    'rest': dict(band_y=0.0, band_rot=0.0),
    'band_low': dict(band_y=-1.1, band_rot=0.7),
    'band_high': dict(band_y=1.1, band_rot=1.9),
    'ruptured': dict(band_y=0.0, band_rot=0.0, rupture=1.0),
}

HATCH_DETACHED = dict(location=(1.05, -0.65, 4.35), rotation=(0.62, -0.30, 0.45))
CAP_RUPTURED = dict(location=(0.40, -0.30, 6.05), rotation=(0.62, 0.25, 0.3))
BAND_RUPTURED = dict(location=(-0.10, 0.08, 4.55), rotation=(0.24, -0.08, 0.5))
STAVE_PEEL = math.radians(22)
STAVE_BLOWOUT = 0.62   # radial slide that clears the upper collar overhang before tilting
STAVE_SLIDE_PHASE = 0.6


def stave_rupture(f):
    """Rupture progress f in [0, 1]: slide straight out first, then tilt about the stave foot."""
    slide = STAVE_BLOWOUT * min(1.0, f / STAVE_SLIDE_PHASE)
    tilt = STAVE_PEEL * max(0.0, (f - STAVE_SLIDE_PHASE) / (1 - STAVE_SLIDE_PHASE))
    return Matrix.Translation((slide, 0, 0)) @ Matrix.Rotation(tilt, 4, 'Y')


def silo_state(doors):
    return dict(hatch_z=SILO_HATCH_PIVOT + 0.1 * doors, hatch_scale=1.0 - 0.85 * doors,
                glow_z=SILO_GLOW_PIVOT, glow_scale=0.4 + 0.55 * doors)


def silo_matrices(doors=0.0, detached=False, **_):
    s = silo_state(doors)
    if detached:
        loc, rot = HATCH_DETACHED['location'], HATCH_DETACHED['rotation']
        from mathutils import Euler
        hatch = Matrix.Translation(loc) @ Euler(rot, 'XYZ').to_matrix().to_4x4()
    else:
        hatch = Matrix.Translation((0, 0, s['hatch_z'])) @ Matrix.Scale(s['hatch_scale'], 4)
    glow = Matrix.Translation((0, 0, s['glow_z'])) @ Matrix.Scale(s['glow_scale'], 4)
    return {'hatch': hatch, 'glow': glow}


def stave_hinge(k):
    phi = STAVE_CENTERS[k]
    return Matrix.Translation((HINGE_R * math.cos(phi), HINGE_R * math.sin(phi), HINGE_Z)) @ Matrix.Rotation(phi, 4, 'Z')


def fuel_matrices(band_y=0.0, band_rot=0.0, rupture=0.0, **_):
    from mathutils import Euler
    out = {}
    if rupture > 0:
        L, R = BAND_RUPTURED['location'], BAND_RUPTURED['rotation']
        out['band'] = Matrix.Translation(L) @ Euler(R, 'XYZ').to_matrix().to_4x4()
        L, R = CAP_RUPTURED['location'], CAP_RUPTURED['rotation']
        out['cap'] = Matrix.Translation(L) @ Euler(R, 'XYZ').to_matrix().to_4x4()
    else:
        out['band'] = Matrix.Translation((0, 0, FUEL_BAND_PIVOT + band_y)) @ Matrix.Rotation(band_rot, 4, 'Z')
        out['cap'] = Matrix.Translation((0, 0, FUEL_CAP_PIVOT))
    for k in range(3):
        out[f'stave-{k}'] = stave_hinge(k) @ stave_rupture(rupture)
    return out


def apply(objects, mats):
    for name, m in mats.items():
        objects[name].matrix_basis = m
