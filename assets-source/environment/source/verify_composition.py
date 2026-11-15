"""
Reopen composition.blend and check what it actually contains (no rendering).

blender --background --factory-startup -noaudio --python verify_composition.py -- <composition.blend> <out.json>
"""
import bpy
import json
import math
import sys
import hashlib
from pathlib import Path

argv = sys.argv[sys.argv.index('--') + 1:]
BLEND, OUT = Path(argv[0]), Path(argv[1])
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
scene = bpy.context.scene
failures = []
RIGS = {'classic': dict(yaw=45, dist=64, height=45.255, ortho=True), 'modern': dict(yaw=20, dist=29, height=14, fov=58), 'chase': dict(yaw=6, dist=24, height=9.5, fov=66)}


def tri_count(coll):
    n = 0
    for o in coll.all_objects:
        if o.type == 'MESH':
            o.data.calc_loop_triangles()
            n += len(o.data.loop_triangles)
    return n


top = {c.name: c for c in scene.collection.children}
for need in ('KIT_streamed', 'SOURCE_streamed', 'GAMEPLAY', 'REFERENCE', 'CAMERAS', 'KIT_LIBRARY'):
    if need not in top:
        failures.append(f'missing collection {need}')
rep = {'file': BLEND.name, 'sha256': hashlib.sha256(BLEND.read_bytes()).hexdigest(), 'bytes': BLEND.stat().st_size, 'blender': bpy.app.version_string,
       'scene': scene.name, 'unit': scene.unit_settings.system, 'libraries': [l.filepath for l in bpy.data.libraries],
       'provenance': json.loads(scene['rs_provenance']), 'reuse': scene.get('rs_reuse'), 'notLiveGpu': scene.get('rs_not_live_gpu'),
       'collections': {k: {'objects': len(c.all_objects), 'triangles': tri_count(c), 'hiddenInViewport': c.hide_viewport} for k, c in top.items()}}
if rep['libraries']:
    failures.append('composition links external libraries')
# streamed meshes keep the runtime attributes
attrs = {}
for o in top['KIT_streamed'].all_objects:
    if o.type != 'MESH':
        continue
    b = o.get('rs_bucket')
    have = sorted(a.name for a in o.data.attributes if a.name in ('Col', 'aAnim', 'aPivot', 'aSpin'))
    attrs.setdefault(b, set()).add(','.join(have))
    if b == 'neon' and 'aAnim' not in have:
        failures.append(f'{o.name}: neon mesh without aAnim')
    if b == 'spin' and not {'aPivot', 'aSpin'} <= set(have):
        failures.append(f'{o.name}: spin mesh without aPivot/aSpin')
rep['kitStreamedAttributesByBucket'] = {k: sorted(v) for k, v in attrs.items()}
# gameplay models: shipped GLBs at scale 1
game = []
for o in top['GAMEPLAY'].objects:
    if o.parent is None and o.type == 'EMPTY' and (o.name.startswith('PLAYER') or o.name.startswith('THREAT')):
        s = tuple(round(v, 6) for v in o.scale)
        kids = [c for c in o.children_recursive]
        game.append({'name': o.name, 'gamePosition': [round(o.location.x, 3), round(o.location.z, 3), round(-o.location.y, 3)], 'scale': s, 'meshes': len([c for c in kids if c.type == 'MESH'])})
        if s != (1.0, 1.0, 1.0):
            failures.append(f'{o.name}: holder scale {s}')
rep['gameplay'] = game
if not any(g['name'].startswith('PLAYER') for g in game):
    failures.append('no shipped player model in the composition')
# cameras against the CameraRig.snap formulas
cams = []
for o in top['CAMERAS'].objects:
    rig = RIGS[o['rs_rig']]
    eye, target = list(o['rs_eye_game']), list(o['rs_target_game'])
    yaw = math.radians(rig['yaw'])
    off = [-rig['dist'] * math.sin(yaw), rig['height'], -rig['dist'] * math.cos(yaw)]
    if rig.get('ortho'):
        pz = target[2] - 28
        want_eye, want_target = [off[0], 9 + off[1], pz + 28 + off[2]], [0, 9, pz + 28]
        ok = o.data.type == 'ORTHO' and abs(o.data.ortho_scale - 80) < 1e-6
    else:
        p = [target[0], target[1] - 1.2, target[2] - 16]
        want_eye, want_target = [p[0] + off[0], p[1] + off[1], p[2] + off[2]], target
        fov = 2 * math.degrees(math.atan(o.data.sensor_height / 2 / o.data.lens))
        ok = o.data.type == 'PERSP' and abs(fov - rig['fov']) < 1e-3
    game_loc = [o.location.x, o.location.z, -o.location.y]
    d = max(max(abs(a - b) for a, b in zip(eye, want_eye)), max(abs(a - b) for a, b in zip(game_loc, eye)), max(abs(a - b) for a, b in zip(target, want_target)))
    # object transforms are float32: at world z ~ 5,300 one ulp is 4.9e-4, so 1e-3 is the tightest honest tolerance
    if not ok or d > 1e-3:
        failures.append(f'{o.name}: camera does not match the source rig ({d})')
    cams.append({'name': o.name, 'rig': o['rs_rig'], 'type': o.data.type, 'eyeGame': [round(v, 3) for v in eye], 'targetGame': [round(v, 3) for v in target], 'maxDelta': round(d, 7)})
rep['cameras'] = cams
if len(cams) < 3 or {c['rig'] for c in cams} != set(RIGS):
    failures.append('composition does not hold all three source rigs')
rep['packedImages'] = sum(1 for i in bpy.data.images if i.packed_file)
rep['images'] = len(bpy.data.images)
rep['failures'] = failures
rep['passed'] = not failures
OUT.write_text(json.dumps(rep, indent=1) + '\n')
print('COMPVERIFY', json.dumps({'passed': rep['passed'], 'failures': failures[:8], 'collections': rep['collections'], 'cameras': len(cams), 'gameplay': [(g['name'], g['scale']) for g in game], 'attrs': rep['kitStreamedAttributesByBucket']}))
