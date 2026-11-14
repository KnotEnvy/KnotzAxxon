import array
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
GAME_ROOT = ROOT.parents[2]
PARTS = {}
MATERIALS = {}
BUCKETS = ['hull', 'deck', 'dark', 'paint', 'neon', 'spin']
PALETTE = {
    'armor': 0x8096A9, 'armor_light': 0xA9BAC6, 'edge': 0x5C7288,
    'deck': 0x586B7D, 'deck_light': 0x7A8C9D, 'void': 0x131E2B,
    'machinery': 0x344A60, 'white': 0xD6DDD9, 'amber': 0xFFC27A,
    'cyan': 0x63DCE9, 'red': 0xFF5264, 'blue': 0x5A9AFF,
}


def linear_channel(value):
    value /= 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def color(value, gain=1):
    if isinstance(value, str):
        value = PALETTE[value]
    return tuple(linear_channel((value >> shift) & 255) * gain for shift in (16, 8, 0))


def game_to_blender(position):
    return (position[0], -position[2], position[1])


def blender_to_game(position):
    return (position[0], position[2], -position[1])


class Part:
    def __init__(self, name, bucket, role, anim=None, pivot=None, spin=None, phase_period=None):
        self.name = name
        self.bucket = bucket
        self.role = role
        self.anim = anim or [0, 0, 0]
        self.pivot = pivot or [0, 0, 0]
        self.spin = spin or [0, 1, 0, 0]
        self.phase_period = phase_period
        self.vertices = []
        self.faces = []
        self.colors = []

    def add(self, vertices, faces, tint='armor', gain=1):
        start = len(self.vertices)
        self.vertices.extend(vertices)
        shade = color(tint, gain)
        for face in faces:
            origin = Vector(vertices[face[0]])
            area = sum((Vector(vertices[face[index]]) - origin).cross(Vector(vertices[face[index + 1]]) - origin).length for index in range(1, len(face) - 1))
            if area < 1e-9:
                continue
            self.faces.append(tuple(index + start for index in face))
            self.colors.append(shade)

    def surface(self, vertices, tint='armor', normal=None, gain=1):
        order = tuple(range(len(vertices)))
        if normal is not None:
            first = Vector(vertices[1]) - Vector(vertices[0])
            second = Vector(vertices[2]) - Vector(vertices[0])
            if first.cross(second).dot(Vector(normal)) < 0:
                order = tuple(reversed(order))
        self.add(vertices, [order], tint, gain)


def part(name, bucket, role=None, **kwargs):
    if name not in PARTS:
        PARTS[name] = Part(name, bucket, role or name, **kwargs)
    return PARTS[name]


def box(target, center, size, tint='armor', bevel=0):
    cross_x, cross_y, cross_z = center
    width, height, length = size
    if bevel:
        rings = []
        for altitude, inset in [(cross_y - height / 2, bevel), (cross_y - height / 2 + bevel, 0), (cross_y + height / 2 - bevel, 0), (cross_y + height / 2, bevel)]:
            half_width, half_length = width / 2 - inset, length / 2 - inset
            cut = min(bevel, half_width * 0.3, half_length * 0.3)
            rings.append([(cross_x + offset_x, altitude, cross_z + offset_z) for offset_x, offset_z in [(-half_width + cut, -half_length), (half_width - cut, -half_length), (half_width, -half_length + cut), (half_width, half_length - cut), (half_width - cut, half_length), (-half_width + cut, half_length), (-half_width, half_length - cut), (-half_width, -half_length + cut)]])
        loft(target, rings, tint, axis='y')
        return
    vertices = [(cross_x + offset_x * width / 2, cross_y + offset_y * height / 2, cross_z + offset_z * length / 2) for offset_x, offset_y, offset_z in [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 4, 7, 3), (1, 2, 6, 5), (0, 1, 5, 4), (3, 7, 6, 2)]
    target.add(vertices, faces, tint)


def beam(target, begin, end, width, depth=None, tint='edge'):
    start = Vector(begin)
    finish = Vector(end)
    direction = (finish - start).normalized()
    reference = Vector((0, 1, 0)) if abs(direction.y) < 0.95 else Vector((1, 0, 0))
    across = direction.cross(reference).normalized() * width / 2
    vertical = direction.cross(across).normalized() * (depth or width) / 2
    vertices = [tuple(point + sign_a * across + sign_b * vertical) for point in (start, finish) for sign_a, sign_b in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]
    target.add(vertices, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], tint)


def loft(target, rings, tint='armor', skip=(), caps=True, axis='z'):
    count = len(rings[0])
    vertices = [point for ring in rings for point in ring]
    faces = []
    for station in range(len(rings) - 1):
        for edge in range(count):
            if edge not in skip:
                faces.append((station * count + edge, station * count + (edge + 1) % count, (station + 1) * count + (edge + 1) % count, (station + 1) * count + edge))
    if caps:
        faces.extend([tuple(reversed(range(count))), tuple((len(rings) - 1) * count + index for index in range(count))])
    if axis == 'y':
        faces = [tuple(reversed(face)) for face in faces]
    target.add(vertices, faces, tint)


def ring_yz(center_z, low=-5, high=6.5, half_length=12, cut=1.5):
    return [(low, center_z - half_length + cut), (low, center_z + half_length - cut), (low + cut, center_z + half_length), (high - cut, center_z + half_length), (high, center_z + half_length - cut), (high, center_z - half_length + cut), (high - cut, center_z - half_length), (low + cut, center_z - half_length)]


def ring_strip(target, outer, inner, outer_x, inner_x, tint):
    for index in range(len(outer)):
        following = (index + 1) % len(outer)
        target.surface([(outer_x, *outer[index]), (outer_x, *outer[following]), (inner_x, *inner[following]), (inner_x, *inner[index])], tint, normal=(-1, 0, 0))


def tube_z(target, center_x, center_y, profile, sides=16, tint='machinery'):
    rings = [[(center_x + radius * math.cos(index * math.tau / sides), center_y + radius * math.sin(index * math.tau / sides), station) for index in range(sides)] for station, radius in profile]
    loft(target, rings, tint, caps=False)


def taper(station):
    return max(0.3, min(1, station / 98, (980 - station) / 78.4))


def hull_ring(station):
    factor = taper(station)
    return [(83 + (cross_x - 83) * factor, cross_y, station) for cross_x, cross_y in [(58, -17), (65, -26), (101, -26), (108, -17), (108, 7), (102, 14), (64, 14), (58, 7)]]


def build_hull():
    for title, stations, skip in [('bow', [0, 28, 60, 98], ()), ('midbody', [98, 116] + [132 + index * 32 for index in range(24)] + [884, 901.6], (7,)), ('stern', [901.6, 930, 956, 980], ())]:
        loft(part(f'{title}-fitted-shell', 'hull', 'primary-hull'), [hull_ring(station) for station in stations], 'armor', skip=skip, caps=title != 'midbody')
    lower = part('port-lower-chine-strakes', 'hull', 'primary-hull')
    for station in range(116, 885, 32):
        lower.surface([(58.015, -17, station), (58.015, -17, min(station + 32, 884)), (58.015, -5, min(station + 32, 884)), (58.015, -5, station)], 'edge', normal=(-1, 0, 0))
    for begin, end in [(98, 116), (884, 901.6)]:
        lower.surface([(58, -17, begin), (58, -17, end), (58, 7, end), (58, 7, begin)], 'armor', normal=(-1, 0, 0))
    keel = part('keel-service-spine', 'dark', 'machinery')
    for station in range(128, 873, 64):
        box(keel, (83, -24.8, station), (20, 2.3, 44), 'machinery', bevel=0.7)
        for side in [-1, 1]:
            beam(keel, (83 + side * 17, -24, station - 18), (83 + side * 10, -24, station + 18), 1.1, tint='edge')
    starboard = part('starboard-service-plating', 'hull', 'primary-hull')
    machinery = part('starboard-heat-exchangers', 'dark', 'machinery')
    for station in range(140, 880, 48):
        box(starboard, (107.9, -2.7, station), (0.45, 13, 33), 'edge')
        for offset in range(-12, 13, 4):
            beam(machinery, (108.25, -8, station + offset), (108.25, 2, station + offset + 1.5), 0.55, 0.6, 'void')


def build_hangars():
    for index in range(24):
        center = 132 + index * 32
        prefix = f'bay-{index + 1:02d}'
        face = part(prefix + '-structural-frame', 'hull', 'hangar-frame')
        outer = ring_yz(center, -5, 7, 16, 0.5)
        aperture = ring_yz(center)
        ring_strip(face, outer, aperture, 58, 58, 'armor_light')
        rim_outer = ring_yz(center, -5.8, 7.3, 12.9, 1.8)
        ring_strip(face, rim_outer, aperture, 57.6, 58.55, 'edge')
        interior = part(prefix + '-recess-and-deck', 'dark', 'hangar-interior')
        ring_strip(interior, aperture, aperture, 58.55, 73.5, 'machinery')
        interior.surface([(73.5, altitude, station) for altitude, station in aperture], 'void', normal=(-1, 0, 0))
        box(interior, (66.1, -4.86, center), (14.2, 0.18, 20), 'machinery')
        for cross_x in [62.5, 68.3]:
            rib_outer = ring_yz(center, -4.9, 6.35, 11.85, 1.45)
            rib_inner = ring_yz(center, -4.45, 5.9, 11.4, 1.2)
            ring_strip(face, rib_outer, rib_inner, cross_x, cross_x + 0.5, 'edge')
        equipment = part(prefix + '-internal-structure', 'hull', 'hangar-interior')
        for offset in [-7, 7]:
            beam(equipment, (73.1, -4.4, center + offset - 2), (73.1, 4.9, center + offset + 2), 0.42, tint='edge')
            box(equipment, (70.7, -2.8, center + offset), (3, 3.5, 2.6), 'edge', bevel=0.25)
        beam(equipment, (61, 5.6, center - 10), (71, 5.6, center - 10), 0.6, tint='armor')
        beam(equipment, (61, 5.6, center + 10), (71, 5.6, center + 10), 0.6, tint='armor')
        floor = part(prefix + '-deck-guides', 'paint', 'hangar-interior')
        for offset in [-5, 5]:
            box(floor, (66, -4.74, center + offset), (11.5, 0.025, 0.16), 'white')
        warm = part(prefix + '-amber-header', 'neon', 'hangar-effect')
        box(warm, (57.52, 7.0, center), (0.16, 0.22, 17), 'amber')
        for offset in [-8, 8]:
            box(warm, (65.4, 5.65, center + offset), (4.4, 0.1, 0.22), 'amber')
        cyan = part(prefix + '-cyan-depth-chase', 'neon', 'hangar-effect', anim=[2, 0.8, (-center / 128) % 1], phase_period=128)
        for offset in [-10.4, 10.4]:
            box(cyan, (65.5, -4.1, center + offset), (11, 0.16, 0.18), 'cyan')


def build_deck():
    for name, stations in [('bow', [0, 28, 60, 98]), ('stern', [901.6, 930, 956, 980])]:
        rings = []
        for station in stations:
            width = 50 * taper(station) + 10
            rings.append([(78 - width / 2, 14, station), (78 + width / 2, 14, station), (78 + width / 2, 15.4, station), (78 - width / 2, 15.4, station)])
        loft(part(name + '-flightdeck', 'deck', 'flightdeck'), rings, 'deck_light')
    base = part('midbody-flightdeck-soffit', 'deck', 'flightdeck')
    base.surface([(48, 14, 98), (108, 14, 98), (108, 14, 901.6), (48, 14, 901.6)], 'deck', normal=(0, -1, 0))
    for cross_x in [48, 108]:
        base.surface([(cross_x, 14, 98), (cross_x, 14, 901.6), (cross_x, 15.4, 901.6), (cross_x, 15.4, 98)], 'edge', normal=(-1 if cross_x == 48 else 1, 0, 0))
    channels = part('recessed-catapult-channel-liners', 'dark', 'catapult')
    for cross_x in [51.35, 59.35]:
        channels.surface([(cross_x - 0.35, 14.94, 98), (cross_x + 0.35, 14.94, 98), (cross_x + 0.35, 14.94, 901.6), (cross_x - 0.35, 14.94, 901.6)], 'void', normal=(0, 1, 0))
        for edge in [-1, 1]:
            channels.surface([(cross_x + edge * 0.35, 14.94, 98), (cross_x + edge * 0.35, 15.4, 98), (cross_x + edge * 0.35, 15.4, 901.6), (cross_x + edge * 0.35, 14.94, 901.6)], 'machinery', normal=(-edge, 0, 0))
    for index, begin in enumerate(range(98, 902, 16)):
        finish = min(begin + 16, 901.6)
        tile = part(f'deck-panel-{index:02d}', 'deck', 'flightdeck')
        for left, right in [(48, 51), (51.7, 59), (59.7, 77.9), (78.05, 108)]:
            tile.surface([(left + 0.035, 15.4, begin + 0.045), (right - 0.035, 15.4, begin + 0.045), (right - 0.035, 15.4, finish - 0.045), (left + 0.035, 15.4, finish - 0.045)], 'deck_light' if index % 4 == 0 else 'deck', normal=(0, 1, 0))
        seams = part('engraved-deck-seam-beds', 'dark', 'flightdeck')
        for left, right in [(48, 51), (51.7, 59), (59.7, 108)]:
            seams.surface([(left, 15.21, finish - 0.12), (right, 15.21, finish - 0.12), (right, 15.21, finish + 0.12), (left, 15.21, finish + 0.12)], 'void', normal=(0, 1, 0))
    paint = part('flightdeck-operating-markings', 'paint', 'flightdeck')
    for station in range(112, 892, 16):
        box(paint, (55.4, 15.42, station), (0.28, 0.025, 8), 'amber')
        box(paint, (77.95, 15.42, station), (0.18, 0.025, 8), 'white')
    for station in [112, 304, 592, 880]:
        for offset in [-1, 1]:
            beam(paint, (55.4, 15.43, station + 4), (55.4 + offset * 1.6, 15.43, station), 0.23, 0.035, 'white')
    for index, station in enumerate(range(110, 891, 12)):
        light = part(f'catapult-chase-{index:02d}', 'neon', 'catapult-effect', anim=[2, 1.4, (-station / 96) % 1], phase_period=96)
        for cross_x in [51.35, 59.35]:
            box(light, (cross_x, 15.02, station), (0.32, 0.1, 1.2), 'amber')
    rail = part('port-continuous-safety-rail', 'hull', 'flightdeck-rail')
    for station in range(108, 899, 16):
        box(rail, (48.4, 16.15, station), (0.38, 1.5, 0.42), 'armor_light')
    beam(rail, (48.4, 16.85, 104), (48.4, 16.85, 899), 0.24, tint='armor_light')
    beam(rail, (48.4, 16.05, 104), (48.4, 16.05, 899), 0.18, tint='edge')
    bracing = part('cantilever-deck-web-frames', 'hull', 'flightdeck-structure')
    for station in range(116, 885, 32):
        beam(bracing, (58, 6.9, station), (48.5, 13.9, station), 0.65, 0.9, 'edge')
        beam(bracing, (57.5, 13.7, station), (48.5, 13.7, station), 0.55, 0.9, 'armor')
    for station in [205, 705]:
        seven_segment(paint, 0, 87, 15.46, station, 3.3)
        seven_segment(paint, 4, 94.5, 15.46, station, 3.3)


def seven_segment(target, number, cross_x, altitude, station, size):
    segments = {0: [0, 1, 2, 3, 4, 5], 4: [1, 2, 5, 6]}[number]
    locations = [(0, 2), (1, 1), (1, -1), (0, -2), (-1, -1), (-1, 1), (0, 0)]
    for segment in segments:
        offset_x, offset_z = locations[segment]
        box(target, (cross_x + offset_x * size, altitude, station + offset_z * size), (size * (1.7 if segment in [0, 3, 6] else 0.25), 0.03, size * (0.25 if segment in [0, 3, 6] else 1.7)), 'white')


def island_ring(altitude, width, length, station=420, cross_x=94):
    cut = 1.5
    return [(cross_x + offset_x, altitude, station + offset_z) for offset_x, offset_z in [(-width / 2 + cut, -length / 2), (width / 2 - cut, -length / 2), (width / 2, -length / 2 + cut), (width / 2, length / 2 - cut), (width / 2 - cut, length / 2), (-width / 2 + cut, length / 2), (-width / 2, length / 2 - cut), (-width / 2, -length / 2 + cut)]]


def build_island():
    housing = part('island-single-tiered-bridge', 'hull', 'island')
    loft(housing, [island_ring(15.4, 13, 31), island_ring(17, 13, 31), island_ring(29, 9.6, 24), island_ring(30.2, 12.4, 27), island_ring(34.4, 10.8, 25), island_ring(35.5, 10, 24)], 'armor_light', axis='y')
    glass = part('island-recessed-wrap-glazing', 'dark', 'island')
    loft(glass, [island_ring(30.7, 12.43, 26.7), island_ring(33.7, 11.3, 25.5)], 'void', caps=False, axis='y')
    mullion = part('island-bridge-mullions-and-platforms', 'hull', 'island')
    for station in [410, 415, 420, 425, 430]:
        beam(mullion, (87.95, 30.7, station), (88.42, 33.7, station), 0.23, tint='edge')
    for altitude, width, length in [(22.4, 11.7, 26), (29.9, 13.1, 28), (35.55, 10.6, 25)]:
        loft(mullion, [island_ring(altitude, width, length), island_ring(altitude + 0.24, width, length)], 'edge', axis='y')
    windows = part('island-amber-bridge-ribbons', 'neon', 'island-effect')
    for altitude in [18.6, 22.3, 26]:
        box(windows, (88.2 + (altitude - 18.6) * 0.09, altitude, 420), (0.12, 0.28, 17), 'amber')
    box(windows, (87.85, 31.1, 420), (0.12, 0.16, 21), 'amber')
    mast = part('island-mast-and-ladder', 'dark', 'island')
    beam(mast, (94, 35.5, 420), (94, 43, 420), 0.6, tint='machinery')
    beam(mast, (90.8, 35.7, 417), (94, 39, 420), 0.32, tint='edge')
    for altitude in [19, 21, 23, 25, 27, 29]:
        beam(mast, (98.7, altitude, 427), (99.7, altitude, 427), 0.16, tint='edge')
    radar = part('island-rotating-open-radar', 'spin', 'radar', pivot=[94, 39, 420], spin=[0, 1, 0, 0.6])
    beam(radar, (94, 37.5, 420), (94, 40.6, 420), 0.7, tint='armor_light')
    for row in [-1, 0, 1]:
        beam(radar, (89.2, 39 + row * 0.85, 420.55), (98.8, 39 + row * 0.85, 420.55), 0.25, tint='armor_light')
    for column in range(-4, 5):
        beam(radar, (94 + column * 1.1, 37.9, 420.55), (94 + column * 1.1, 40.1, 420.55), 0.19, tint='edge')
    beam(radar, (90, 38, 420.55), (94, 39, 418.6), 0.3, tint='armor')
    beam(radar, (98, 38, 420.55), (94, 39, 418.6), 0.3, tint='armor')
    beacon = part('island-red-strobe', 'neon', 'island-effect', anim=[1, 0.7, 0])
    box(beacon, (94, 44, 420), (0.7, 1, 0.7), 'red')
    service = part('island-aft-machinery', 'dark', 'machinery')
    for station in [438, 444, 450]:
        box(service, (96, 17.5, station), (9, 4.2, 4.5), 'machinery', bevel=0.5)
        for offset in [-1.5, 0, 1.5]:
            box(service, (96, 19.7, station + offset), (6.5, 0.18, 0.28), 'void')


def build_engines():
    for index, altitude in enumerate([-18, -2]):
        housing = part(f'stern-bell-{index}-housing', 'hull', 'stern-engine')
        tube_z(housing, 83, altitude, [(972, 7.5), (978.8, 7.5), (983, 7.1), (987, 6.8), (987, 6.1), (981, 5.4), (980.1, 4.7)], 20, 'edge')
        inner = part(f'stern-bell-{index}-recess', 'dark', 'stern-engine')
        tube_z(inner, 83, altitude, [(980.1, 4.7), (981, 4.8), (982.5, 5.1), (986.9, 6.08)], 20, 'machinery')
        inner.surface([(83 + 4.7 * math.cos(step * math.tau / 20), altitude + 4.7 * math.sin(step * math.tau / 20), 980.1) for step in range(20)], 'void', normal=(0, 0, 1))
        glow = part(f'stern-bell-{index}-breathe-core', 'neon', 'stern-effect', anim=[3, 0.8, [8 / 30, 24 / 30][index]])
        tube_z(glow, 83, altitude, [(980.25, 2.8), (980.45, 3.2), (980.55, 2.8)], 20, 'blue')
        glow.surface([(83 + 2.75 * math.cos(step * math.tau / 20), altitude + 2.75 * math.sin(step * math.tau / 20), 980.2) for step in range(20)], 'blue', normal=(0, 0, 1))
        for step in range(0, 20, 2):
            angle = step * math.tau / 20
            beam(housing, (83 + 5.8 * math.cos(angle), altitude + 5.8 * math.sin(angle), 980), (83 + 6.9 * math.cos(angle), altitude + 6.9 * math.sin(angle), 985.8), 0.35, tint='armor_light')


def build_bow_machinery():
    machinery = part('bow-shielded-machinery-and-keel', 'dark', 'machinery')
    for station in [24, 45, 70, 92]:
        factor = taper(station)
        for side in [-1, 1]:
            cross_x = 83 + side * 18 * factor
            beam(machinery, (cross_x, -21, station - 4), (cross_x, 5, station + 4), 0.6, tint='machinery')
    armor = part('bow-buttress-fitted-plates', 'hull', 'primary-hull')
    for station in [30, 62, 94]:
        factor = taper(station)
        box(armor, (83, 13.6, station), (30 * factor, 0.6, 7), 'edge', bevel=0.2)


def material(bucket):
    result = bpy.data.materials.new('carrier-' + bucket)
    result.use_nodes = True
    shader = result.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (1, 1, 1, 1)
    shader.inputs['Metallic'].default_value = {'hull': 0.36, 'deck': 0.22, 'dark': 0.5, 'spin': 0.36}.get(bucket, 0.05)
    shader.inputs['Roughness'].default_value = {'hull': 0.65, 'deck': 0.78, 'dark': 0.55, 'spin': 0.55}.get(bucket, 0.65)
    attribute = result.node_tree.nodes.new('ShaderNodeVertexColor')
    attribute.layer_name = 'Color'
    result.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
    if bucket == 'neon':
        result.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Emission Color'])
        shader.inputs['Emission Strength'].default_value = 2.2
    MATERIALS[bucket] = result
    return result


def create_object(record, collection):
    mesh = bpy.data.meshes.new(record.name)
    mesh.from_pydata([game_to_blender(position) for position in record.vertices], [], record.faces)
    mesh.update()
    mesh.materials.append(MATERIALS[record.bucket])
    layer = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    for polygon in mesh.polygons:
        normal_game = blender_to_game(polygon.normal)
        shade = 1
        if record.bucket in ['hull', 'deck', 'dark']:
            shade = 1.08 if normal_game[1] > 0.65 else 0.76 if normal_game[1] < -0.65 else 0.92
        tint = record.colors[polygon.index]
        for index in polygon.loop_indices:
            layer.data[index].color = (*[value * shade for value in tint], 1)
    uv_layer = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        normal_game = blender_to_game(polygon.normal)
        dominant = max(range(3), key=lambda axis: abs(normal_game[axis]))
        for index in polygon.loop_indices:
            position = record.vertices[mesh.loops[index].vertex_index]
            uv_layer.data[index].uv = ((position[2] if dominant == 0 else position[0]) / 10, (position[2] if dominant == 1 else position[1]) / 10)
    obj = bpy.data.objects.new(record.name, mesh)
    collection.objects.link(obj)
    obj['bucket'] = record.bucket
    obj['role'] = record.role
    obj['aAnim'] = record.anim
    obj['aPivot'] = record.pivot
    obj['aSpin'] = record.spin
    obj['phase_period'] = record.phase_period or 0
    obj['game_axes'] = 'X across, Y up, +Z travel; local Z=0 is sector.zStart+160'
    obj['runtime'] = 'template only; chunk-clip and merge; never attach per-part roots'
    return obj


def template_and_export(objects):
    payload = bytearray()
    descriptor = {'format': 'carrier-nonindexed-f32le-v1', 'axes': 'game X across, +Y up, +Z travel', 'anchor': 'translation [0,0,sector.zStart+160]', 'buckets': [], 'parts': [], 'phase': 'stored local phase; subtract start/phase_period modulo 1 at module preparation', 'runtimeMaterials': {'hull': 'Materials.hull', 'deck': 'Materials.deck', 'dark': 'Materials.darkMetal', 'paint': 'Materials.paint ?? Materials.deck', 'neon': 'Materials.neonVertex', 'spin': 'Materials.spinMetal ?? Materials.darkMetal'}}
    grouped = defaultdict(list)
    minimum = [math.inf] * 3
    maximum = [-math.inf] * 3
    for obj in objects:
        grouped[obj['bucket']].append(obj)
    merged_collection = bpy.data.collections.new('EXPORT-SIX-BUCKET-TEMPLATES')
    bpy.context.scene.collection.children.link(merged_collection)
    meshes = []
    for bucket in BUCKETS:
        attributes = {'position': [], 'normal': [], 'uv': [], 'color': []}
        if bucket == 'neon':
            attributes['aAnim'] = []
        if bucket == 'spin':
            attributes['aPivot'] = []
            attributes['aSpin'] = []
        combined_vertices = []
        combined_colors = []
        combined_uv = []
        for obj in grouped[bucket]:
            mesh = obj.data
            mesh.calc_loop_triangles()
            base = len(attributes['position']) // 3
            record = PARTS[obj.name]
            for triangle in mesh.loop_triangles:
                for loop_index in triangle.loops:
                    vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
                    position = blender_to_game(obj.matrix_world @ vertex.co)
                    normal = blender_to_game(triangle.normal)
                    tint = mesh.color_attributes['Color'].data[loop_index].color[:3]
                    uv = mesh.uv_layers.active.data[loop_index].uv[:]
                    for axis in range(3):
                        minimum[axis] = min(minimum[axis], position[axis])
                        maximum[axis] = max(maximum[axis], position[axis])
                    attributes['position'].extend(position)
                    attributes['normal'].extend(normal)
                    attributes['color'].extend(tint)
                    attributes['uv'].extend(uv)
                    if bucket == 'neon':
                        attributes['aAnim'].extend(record.anim)
                    if bucket == 'spin':
                        attributes['aPivot'].extend(record.pivot)
                        attributes['aSpin'].extend(record.spin)
                    combined_vertices.append(game_to_blender(position))
                    combined_colors.append(tint)
                    combined_uv.append(uv)
            descriptor['parts'].append({'name': obj.name, 'bucket': bucket, 'role': obj['role'], 'firstVertex': base, 'vertexCount': len(attributes['position']) // 3 - base, 'aAnim': record.anim if bucket == 'neon' else None, 'aPivot': record.pivot if bucket == 'spin' else None, 'aSpin': record.spin if bucket == 'spin' else None, 'phase_period': record.phase_period, 'bounds': {'min': [min(point[axis] for point in record.vertices) for axis in range(3)], 'max': [max(point[axis] for point in record.vertices) for axis in range(3)]}})
        info = {'key': bucket, 'vertices': len(combined_vertices), 'triangles': len(combined_vertices) // 3, 'attributes': {}}
        for name, values in attributes.items():
            values_array = array.array('f', values)
            if sys.byteorder != 'little':
                values_array.byteswap()
            info['attributes'][name] = {'byteOffset': len(payload), 'count': len(values), 'itemSize': 2 if name == 'uv' else 4 if name == 'aSpin' else 3}
            payload.extend(values_array.tobytes())
        descriptor['buckets'].append(info)
        mesh = bpy.data.meshes.new('carrier-template-' + bucket)
        mesh.from_pydata(combined_vertices, [], [(offset, offset + 1, offset + 2) for offset in range(0, len(combined_vertices), 3)])
        mesh.materials.append(MATERIALS[bucket])
        layer = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        uv_layer = mesh.uv_layers.new(name='UVMap')
        for index, tint in enumerate(combined_colors):
            layer.data[index].color = (*tint, 1)
            uv_layer.data[index].uv = combined_uv[index]
        obj = bpy.data.objects.new('carrier-template-' + bucket, mesh)
        merged_collection.objects.link(obj)
        obj['bucket'] = bucket
        obj['shader_attribute_notice'] = 'GLB is static. Source binary and JSON reconstruct aAnim/aPivot/aSpin.'
        meshes.append(obj)
    descriptor['bounds'] = {'min': minimum, 'max': maximum}
    descriptor['triangles'] = sum(bucket['triangles'] for bucket in descriptor['buckets'])
    descriptor['binary'] = 'carrier-template.bin'
    descriptor['binarySHA256'] = hashlib.sha256(payload).hexdigest()
    (ROOT / 'carrier-template.bin').write_bytes(payload)
    (ROOT / 'carrier-template.json').write_text(json.dumps(descriptor, indent=2))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'carrier.glb'), export_format='GLB', use_selection=True, export_yup=True, export_apply=False, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=True, export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO', export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    for obj in meshes:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(merged_collection)
    return descriptor


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    bpy.context.scene.render.threads_mode = 'FIXED'
    bpy.context.scene.render.threads = 4
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene['artifact_status'] = 'INITIAL BEST EFFORT; pending_deferred_opus_review; 0 formal reviews/fix passes'
    bpy.context.scene['model_settings'] = 'codex / gpt-6.1-sol / reasoningEffort xhigh / available speed'
    for bucket in BUCKETS:
        material(bucket)
    build_hull()
    build_hangars()
    build_deck()
    build_island()
    build_engines()
    build_bow_machinery()
    collections = {}
    objects = []
    for record in PARTS.values():
        if record.role not in collections:
            collection = bpy.data.collections.new(record.role)
            bpy.context.scene.collection.children.link(collection)
            collections[record.role] = collection
        objects.append(create_object(record, collections[record.role]))
    bpy.context.view_layer.update()
    descriptor = template_and_export(objects)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'carrier.blend'), compress=True)
    report = {'blender': bpy.app.version_string, 'buildHash': bpy.app.build_hash.decode(), 'objects': len(objects), 'triangles': descriptor['triangles'], 'buckets': {entry['key']: entry['triangles'] for entry in descriptor['buckets']}, 'bounds': descriptor['bounds'], 'glbBytes': (ROOT / 'carrier.glb').stat().st_size, 'textures': 0, 'packed': True}
    (ROOT / 'checks/build.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
