"""Render neutral evidence images from a saved blend.

blender --background --factory-startup ASSET.blend --python render.py -- --asset silo|fuel --out DIR

Adds a temporary camera, lights and ground (never saved back to the blend).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import poses  # noqa: E402


def argv():
    a = sys.argv[sys.argv.index('--') + 1:]
    d = {}
    for i in range(0, len(a), 2):
        d[a[i].lstrip('-')] = a[i + 1]
    return d


A = argv()
ASSET, OUT = A['asset'], A['out']
ONLY = set(A.get('only', '').split(',')) - {''}
sc = bpy.context.scene
OBJ = {o.name: o for o in bpy.data.objects}


def lin(hexstr):
    h = hexstr.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def setup():
    sc.render.engine = 'BLENDER_EEVEE'
    sc.eevee.taa_render_samples = 64
    for attr, val in (('use_raytracing', False), ('use_shadows', True)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('neutral')
    sc.world = w
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (*lin('#59606a'), 1)
    bg.inputs['Strength'].default_value = 0.55
    # key / fill / rim
    for name, energy, rot, col in (('key', 3.2, (math.radians(48), 0, math.radians(-35)), '#fff3e6'),
                                   ('fill', 0.9, (math.radians(65), 0, math.radians(145)), '#dfe8ff'),
                                   ('rim', 1.4, (math.radians(100), 0, math.radians(200)), '#ffffff')):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.color = lin(col)
        ld.angle = math.radians(2.5)
        ld.use_shadow = (name == 'key')
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = rot
        sc.collection.objects.link(lo)
    gm = bpy.data.materials.new('ground')
    bsdf = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*lin('#6b6e72'), 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    me = bpy.data.meshes.new('ground')
    s = 400
    me.from_pydata([(-s, -s, -0.001), (s, -s, -0.001), (s, s, -0.001), (-s, s, -0.001)], [], [(0, 1, 2, 3)])
    me.materials.append(gm)
    g = bpy.data.objects.new('ground', me)
    sc.collection.objects.link(g)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    return gm, bsdf, cam


GM, GBSDF, CAM = setup()


def frame(direction, target, ortho=None, lens=None, dist=30.0):
    d = Vector(direction).normalized()
    CAM.location = Vector(target) + d * dist
    CAM.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    if ortho:
        CAM.data.type = 'ORTHO'
        CAM.data.ortho_scale = ortho
    else:
        CAM.data.type = 'PERSP'
        CAM.data.lens = lens or 50
    CAM.data.clip_start = 0.05
    CAM.data.clip_end = 2000


def elev(az_deg, el_deg):
    """Direction from target to camera. az 0 = glTF +Z front (Blender -Y)."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    return (math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))


ISO = Vector((-1.0, 1.0, 1.0)).normalized()  # game classic camera: glTF (-1, 1, -1)
PX_PER_M = 13.5  # classic ortho half height 40 m on a 1080 px tall view


def marker(show):
    m = OBJ.get('_marker')
    if show and m is None:
        me = bpy.data.meshes.new('_marker')
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=0.12)
        bm.to_mesh(me)
        mm = bpy.data.materials.new('_marker')
        b = next(n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (0, 0, 0, 1)
        b.inputs['Emission Color'].default_value = (0.1, 0.9, 1.0, 1)
        b.inputs['Emission Strength'].default_value = 4
        me.materials.append(mm)
        m = bpy.data.objects.new('_marker', me)
        sc.collection.objects.link(m)
        m.location = poses.SILO_LAUNCH
        OBJ['_marker'] = m
    if m is not None:
        m.hide_render = not show


def pose(name):
    if ASSET == 'silo':
        p = poses.SILO_POSES[name]
        poses.apply(OBJ, poses.silo_matrices(**p))
        marker(p.get('marker', False))
    else:
        poses.apply(OBJ, poses.fuel_matrices(**poses.FUEL_POSES[name]))
    bpy.context.view_layer.update()


def shot(name, posename, direction, target, res, ortho=None, lens=None, dist=30.0, ground='#6b6e72'):
    if ONLY and name not in ONLY:
        return None
    pose(posename)
    frame(direction, target, ortho, lens, dist)
    GBSDF.inputs['Base Color'].default_value = (*lin(ground), 1)
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    path = os.path.join(OUT, f'{ASSET}_{name}.png') if '\\' not in OUT else f'{OUT}\\{ASSET}_{name}.png'
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('RENDERED', path)
    return path


DECK = '#2b3440'
if ASSET == 'silo':
    T = (0, 0, 1.25)
    shots = [
        ('front', 'rest', elev(0, 10), T, (1024, 768), 6.6),
        ('rear', 'rest', elev(180, 10), T, (1024, 768), 6.6),
        ('side', 'rest', elev(90, 10), T, (1024, 768), 6.6),
        ('top', 'rest', (0.0001, -0.0001, 1), (0, 0, 1), (768, 768), 6.0),
        ('hero', 'rest', elev(-35, 28), T, (1024, 1024), None, 50, 12),
        ('iso_game_rest', 'rest', ISO, T, (1024, 1024), 6.8),
        ('close_hatch', 'rest', elev(-25, 42), (0, 0, 2.3), (1024, 768), None, 50, 7.5),
        ('close_open', 'open', elev(-25, 50), (0, 0, 2.0), (1024, 768), None, 50, 7.5),
        ('close_vent', 'rest', elev(45, 12), (1.55, -1.55, 1.15), (1024, 768), None, 50, 5.0),
        ('state_charge', 'charge', ISO, T, (1024, 1024), 6.8),
        ('state_open', 'open', ISO, T, (1024, 1024), 6.8),
        ('state_launch', 'launch', elev(-30, 20), (0, 0, 1.6), (1024, 1024), 7.6),
        ('state_detached', 'detached', elev(-30, 20), (0, 0, 2.4), (1024, 1024), 9.0),
        ('front_level_open', 'open', elev(0, 0.01), T, (1024, 768), 6.6),
    ]
    for st in ('rest', 'charge', 'open'):
        shots.append((f'small_{st}', st, ISO, T, (128, 128), 128 / PX_PER_M, None, 30, DECK))
else:
    T = (0, 0, 2.43)
    shots = [
        ('front', 'rest', elev(0, 10), T, (768, 1024), 6.4),
        ('rear', 'rest', elev(180, 10), T, (768, 1024), 6.4),
        ('side', 'rest', elev(90, 10), T, (768, 1024), 6.4),
        ('top', 'rest', (0.0001, -0.0001, 1), (0, 0, 2), (768, 768), 4.4),
        ('hero', 'rest', elev(150, 24), T, (1024, 1024), None, 50, 12.5),
        ('iso_game_rest', 'rest', ISO, T, (1024, 1024), 6.6),
        ('close_label', 'rest', elev(180, 12), (0, 0, 2.6), (1024, 768), None, 50, 7.5),
        ('close_top', 'rest', elev(160, 40), (0, 0, 4.1), (1024, 768), None, 50, 5.5),
        ('close_base', 'rest', elev(170, 18), (0, 1.0, 0.55), (1024, 768), None, 50, 5.0),
        ('state_band_low', 'band_low', ISO, T, (1024, 1024), 6.6),
        ('state_band_high', 'band_high', ISO, T, (1024, 1024), 6.6),
        ('state_ruptured', 'ruptured', elev(160, 18), (0, 0, 3.0), (1024, 1024), 8.6),
        ('state_ruptured_iso', 'ruptured', ISO, (0, 0, 3.0), (1024, 1024), 8.6),
    ]
    for st in ('rest', 'band_low', 'band_high'):
        shots.append((f'small_{st}', st, ISO, T, (128, 128), 128 / PX_PER_M, None, 30, DECK))

done = []
for s in shots:
    name, posename, d, tgt, res = s[:5]
    ortho = s[5] if len(s) > 5 else None
    lens = s[6] if len(s) > 6 else None
    dist = s[7] if len(s) > 7 else 30.0
    ground = s[8] if len(s) > 8 else '#6b6e72'
    p = shot(name, posename, d, tgt, res, ortho, lens, dist, ground)
    if p:
        done.append(p)
pose('rest')
print('RENDER_DONE', len(done))
