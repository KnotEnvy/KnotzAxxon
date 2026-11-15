"""
World-scale environment composition (no rendering). Adapted from the Reactor Spine
composer (Fable build) for any sector slice of the integrated runtime.

blender --background --factory-startup -noaudio --python compose_scene.py -- \
    <composition-data dir> <kit.blend> <repo root> <out composition.blend> [scene name]

Collections
  KIT_streamed       actual kit-on output of the exported chunks (visible)
  SOURCE_streamed    unchanged source output of the same chunks (hidden)
  GAMEPLAY           shipped player + threat GLBs at scale 1, source positions
  REFERENCE          flight envelope (x+-16, y 1.3..25) and posed gate gaps (display only)
  CAMERAS            exact CameraRig.snap Classic/Modern/Chase per pose
  KIT_LIBRARY        editable kit modules appended from reactor-kit.blend (hidden)
Every streamed mesh keeps the runtime attributes: corner colour `Col`
(linear, with gains), `aAnim`, `aPivot`, `aSpin` where the bucket carries them.
"""
import bpy
import json
import math
import struct
import sys
from pathlib import Path
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
DATA, KIT_BLEND, REPO, OUT = Path(argv[0]), Path(argv[1]), Path(argv[2]), Path(argv[3])
NAME = argv[4] if len(argv) > 4 else 'Environment_Composition'
doc = json.loads((DATA / 'composition-data.json').read_text())
blob = (DATA / 'composition-data.bin').read_bytes()


def floats(rec):
    return struct.unpack_from(f'<{rec["count"]}f', blob, rec['offset'])


def g2b(x, y, z):
    return (x, -z, y)


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = NAME
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.view_settings.view_transform = 'AgX'
scene.unit_settings.system = 'METRIC'
scene['rs_provenance'] = json.dumps({k: doc[k] for k in ('schema', 'seed', 'loop', 'chunks', 'gateTime', 'note', 'fortressSha')})
scene['rs_reuse'] = ('Approved shipped props in this scene: player and threat GLBs at scale 1 (GAMEPLAY); scenery templates that load in Node '
                     '(cargo kit, cooling stack, covered fighter, fuel depot, flak gun, antenna, wreckage, carrier) are inside the streamed chunk '
                     'meshes exactly as the runtime stamps them. Bunker, dreadnought and asteroid templates load only in the browser, so those props '
                     'show their procedural fallback here.')
scene['rs_not_live_gpu'] = 'Offline reconstruction of actual CPU-streamed chunk geometry with proxy materials; not a live WebGL capture.'

SKY = {'dusk': ((0.11, 0.09, 0.13), (1.0, 0.72, 0.48)), 'ember': ((0.20, 0.035, 0.02), (1.0, 0.56, 0.29)),
       'deepspace': ((0.012, 0.016, 0.03), (0.85, 0.9, 1.0)), 'void': ((0.03, 0.012, 0.03), (1.0, 0.5, 0.45))}
mid = (doc['chunks'][0] + doc['chunks'][1] + 1) * 48
sky_name = next((s['sky'] for s in doc['sectors'] if s['zStart'] <= mid < s['zEnd']), 'ember')
sky_bg, sky_sun = SKY.get(sky_name, SKY['ember'])
world = bpy.data.worlds.new(f'{sky_name}_world')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (*sky_bg, 1)
bg.inputs[1].default_value = 0.6
scene.world = world


def coll(name, parent=None, hide=False):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    c.hide_render = hide
    c.hide_viewport = hide
    return c


C_KIT, C_SRC, C_GAME, C_REF, C_CAM = coll('KIT_streamed'), coll('SOURCE_streamed', hide=True), coll('GAMEPLAY'), coll('REFERENCE'), coll('CAMERAS')
C_REF.hide_render = True

BASE = {
    'hull': (0.50, 0.50, 0.50), 'deck': (0.55, 0.55, 0.55), 'dark': (0.054, 0.083, 0.131), 'grate': (0.33, 0.35, 0.38),
    'hazard': (0.62, 0.42, 0.10), 'paint': (0.9, 0.9, 0.9), 'rock': (0.5, 0.48, 0.45), 'spin': (0.054, 0.083, 0.131),
}


def bucket_material(bucket):
    name = f'RS_proxy_{bucket}'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'Col'
    attr.attribute_type = 'GEOMETRY'
    if bucket == 'neon':
        bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
        nt.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 2.2
    elif bucket == 'forceField':
        bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.25, 0.06, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.4
        bsdf.inputs['Alpha'].default_value = 0.22
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else m.surface_render_method
    else:
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = (*BASE.get(bucket, (0.6, 0.6, 0.6)), 1)
        nt.links.new(attr.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        bsdf.inputs['Metallic'].default_value = {'dark': 0.5, 'spin': 0.78, 'grate': 0.7, 'hull': 0.36, 'deck': 0.22}.get(bucket, 0.3)
        bsdf.inputs['Roughness'].default_value = {'dark': 0.46, 'spin': 0.36, 'grate': 0.5}.get(bucket, 0.85)
    m['rs_bucket'] = bucket
    return m


def build_mesh(name, rec, collection):
    a = rec['attributes']
    P = floats(a['position'])
    n = len(P) // 3
    verts = [g2b(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) for i in range(n)]
    faces = [(i, i + 1, i + 2) for i in range(0, n, 3)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    if 'normal' in a:
        N = floats(a['normal'])
        loops = [None] * n
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                loops[li] = g2b(N[vi * 3], N[vi * 3 + 1], N[vi * 3 + 2])
        me.normals_split_custom_set(loops)
    if 'color' in a:
        Cc = floats(a['color'])
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', [v for i in range(n) for v in (Cc[i * 3], Cc[i * 3 + 1], Cc[i * 3 + 2], 1.0)])
    else:
        col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        col.data.foreach_set('color', [1.0] * (n * 4))
    for key, size in (('aAnim', 3), ('aPivot', 3), ('aSpin', 4)):
        if key in a:
            vals = floats(a[key])
            at = me.attributes.new(key, 'FLOAT_VECTOR' if size == 3 else 'FLOAT_COLOR', 'POINT')
            if size == 3:
                at.data.foreach_set('vector', vals)
            else:
                at.data.foreach_set('color', vals)
    me.materials.append(bucket_material(rec['bucket']))
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    px, py, pz = rec['position']
    sx, sy, sz = rec['scale']
    ob.location = g2b(px, py, pz)
    ob.scale = (sx, sz, sy)
    ob['rs_bucket'] = rec['bucket']
    ob['rs_feature_owned'] = rec['feature']
    return ob


counts = {}
for variant, target in (('kit', C_KIT), ('source', C_SRC)):
    tri = 0
    for ch in doc['variants'][variant]:
        cc = coll(f'{variant.upper()}_chunk_{ch["index"]:03d}', target)
        for k, rec in enumerate(ch['meshes']):
            ob = build_mesh(f'{variant}_{ch["index"]:03d}_{k:02d}_{rec["bucket"]}{"_feature" if rec["feature"] else ""}', rec, cc)
            tri += len(ob.data.polygons)
    counts[variant] = tri

# ---- gameplay models (shipped GLBs at scale 1) ----
MODEL = {
    'turret': 'public/models/turret.glb', 'radar': 'public/models/radar.glb', 'silo': 'public/models/silo.glb', 'fuel': 'public/models/fuel.glb',
    'heavyTurret': 'public/models/production/heavy-turret.glb', 'drone': 'public/models/production/drone.glb', 'mine': 'public/models/production/mine.glb',
    'parked': 'public/models/production/parked-fighter.glb', 'interceptor': 'public/models/production/interceptor.glb',
}


def place_glb(path, loc, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO / path))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new(name, None)
    C_GAME.objects.link(holder)
    holder.location = g2b(*loc)
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        C_GAME.objects.link(o)
    for r in roots:
        r.parent = holder
    return holder


if doc['poses']:
    place_glb('public/models/player.glb', doc['poses'][0]['player'], 'PLAYER_shipped_scale1')
for f in doc['features']:
    if f['kind'] in MODEL and len(C_GAME.objects) < 400:
        place_glb(MODEL[f['kind']], (f.get('x', 0), f.get('y', 0), f['z']), f'THREAT_{f["kind"]}_{f["z"]:.0f}')

# ---- reference: flight envelope + posed gate gaps (display only) ----
z0 = doc['chunks'][0] * 96
z1 = (doc['chunks'][1] + 1) * 96


def ref_box(name, lo, hi):
    me = bpy.data.meshes.new(name)
    xs, ys, zs = (lo[0], hi[0]), (lo[1], hi[1]), (lo[2], hi[2])
    v = [g2b(x, y, z) for x in xs for y in ys for z in zs]
    me.from_pydata(v, [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)], [])
    ob = bpy.data.objects.new(name, me)
    C_REF.objects.link(ob)
    ob.display_type = 'WIRE'
    ob.hide_render = True
    return ob


ref_box('REF_flight_envelope_x16_y1.3-25', (-16, 1.3, z0), (16, 25, z1))
for f in doc['features']:
    if f['kind'] == 'gate':
        gy = f.get('gapYAtPose', f['gapY'])
        ref_box(f'REF_gate_gap_z{f["z"]:.1f}_pose', (-16, gy, f['z'] - 0.2), (16, gy + f['gapH'], f['z'] + 0.2))
        lo = f['gapY'] - (4.5 if f['cycle'] > 0 else 0)
        ref_box(f'REF_gate_sweep_z{f["z"]:.1f}_full', (-16, lo, f['z'] - 0.1), (16, lo + f['gapH'] + (9 if f['cycle'] > 0 else 0), f['z'] + 0.1))

# ---- cameras: exact CameraRig.snap formulas ----
for pi, pose in enumerate(doc['poses']):
    for rig, cam in pose['cameras'].items():
        data = bpy.data.cameras.new(f'CAM_{rig}_pose{pi}')
        ob = bpy.data.objects.new(f'CAM_{rig}_pose{pi}_z{pose["player"][2]:.0f}', data)
        C_CAM.objects.link(ob)
        ob.location = g2b(*cam['eye'])
        d = Vector(g2b(*cam['target'])) - ob.location
        ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()   # camera looks down -Z with +Y up (level horizon)
        data.sensor_fit = 'VERTICAL'
        data.sensor_height = 32
        if cam['ortho']:
            data.type = 'ORTHO'
            data.ortho_scale = cam['halfHeight'] * 2
        else:
            data.type = 'PERSP'
            data.lens = 16 / math.tan(math.radians(cam['fov']) / 2)
        data.clip_start, data.clip_end = cam['near'], cam['far']
        ob['rs_rig'] = rig
        ob['rs_eye_game'] = cam['eye']
        ob['rs_target_game'] = cam['target']
        if pi == 0 and rig == 'classic':
            scene.camera = ob

# ---- ember key light (Sky.js ember sunDir, colour) ----
sun = bpy.data.lights.new('Key_sun', 'SUN')
sun.color = sky_sun
sun.energy = 3.2
so = bpy.data.objects.new('Key_sun', sun)
scene.collection.objects.link(so)
sd = Vector(g2b(0.34, 0.60, -0.72)).normalized()
so.rotation_euler = sd.to_track_quat('Z', 'Y').to_euler()

# ---- editable kit library ----
with bpy.data.libraries.load(str(KIT_BLEND), link=False) as (src, dst):
    dst.collections = [c for c in src.collections]
lib = coll('KIT_LIBRARY', hide=True)
for c in dst.collections:
    if c is not None:
        lib.children.link(c)

bpy.ops.file.pack_all()
scene['rs_triangles'] = json.dumps(counts)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT), compress=True)
print('COMPOSITION', json.dumps({'triangles': counts, 'objects': len(bpy.data.objects), 'cameras': len(C_CAM.objects), 'gameplay': len(C_GAME.objects)}))
