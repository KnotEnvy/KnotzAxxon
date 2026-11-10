"""Author preview renders (supplementary only; not the judging renders).

blender -b <file.blend> --python render_preview.py -- <outdir> <prefix> <view>[,<view>...] [pose]

Views are defined in game space (X across, Y up, Z forward). The optional pose
name is applied with pose_states.apply_pose before rendering.
"""
import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import kx_common as K  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, PREFIX, VIEWS = argv[0], argv[1], argv[2].split(',')
POSE = argv[3] if len(argv) > 3 else None

if POSE:
    import pose_states
    pose_states.apply_pose(POSE)

sc = bpy.context.scene
asset = sc.objects.get('hero-interceptor') and 'player' or 'sentinel'
R = 4.2 if asset == 'player' else 21.0  # framing radius

# view: (camera offset direction in game space, ortho?, size px, scale multiplier, look-at)
VIEW = {
    'classic': ((-1, 1, -1), True, 900, 1.0, (0, 0, 0)),
    'classic_small': ((-1, 1, -1), True, 160, 1.0, (0, 0, 0)),
    'modern': ((-9.92, 14, -27.25), False, 900, 1.0, (0, 0, 0)),
    'hero': ((1.0, .45, 1.25), False, 1100, 1.0, (0, 0, 0)),
    'rear': ((-.55, .5, -1.0), False, 900, 1.0, (0, 0, 0)),
    'top': ((0, 1, -.0001), True, 900, 1.0, (0, 0, 0)),
    'side': ((1, .0001, 0), True, 900, 1.0, (0, 0, 0)),
    'front': ((0, .12, -1), True, 900, 1.0, (0, 0, 0)),
    'player_pov': ((-.25, .25, -1), False, 900, 1.0, (0, 0, 0)),
    'player_pov_small': ((-.25, .25, -1), False, 200, 1.0, (0, 0, 0)),
    'face3q': ((.75, .35, -1), False, 1100, 1.0, (0, 0, 0)),
    'back3q': ((-.8, .55, 1), False, 900, 1.0, (0, 0, 0)),
}

for o in list(sc.objects):
    if o.type in {'CAMERA', 'LIGHT'}:
        bpy.data.objects.remove(o)

try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.film_transparent = False
w = bpy.data.worlds.new('preview') if not sc.world else sc.world
sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value = (0.018, 0.024, 0.036, 1)
bg.inputs['Strength'].default_value = 1.0
try:
    sc.eevee.use_bloom = True
except Exception:
    pass


def add_light(name, kind, energy, dir_game, color=(1, 1, 1), size=0.2):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color
    if kind == 'SUN':
        ld.angle = size
    o = bpy.data.objects.new(name, ld)
    sc.collection.objects.link(o)
    d = K.C3 @ Vector(dir_game).normalized()
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (-d).to_track_quat('-Z', 'Y')
    return o


add_light('key', 'SUN', 4.2, (-.45, 1.0, -.55), (1.0, .96, .9))
add_light('fill', 'SUN', 0.9, (.8, .35, -.3), (.6, .75, 1.0))
add_light('rim', 'SUN', 2.2, (.3, .5, 1.0), (.75, .9, 1.0))

cam_data = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
cam.rotation_mode = 'QUATERNION'

for v in VIEWS:
    d, ortho, px, mul, look = VIEW[v]
    dvec = Vector(d).normalized()
    look = Vector(look)
    if asset == 'sentinel':
        look = Vector((0, 2.0, -1.0))
    dist = R * 8
    pos_g = look + dvec * dist
    cam.location = K.C3 @ pos_g
    fwd = K.C3 @ (look - pos_g).normalized()
    cam.rotation_quaternion = fwd.to_track_quat('-Z', 'Y')
    cam_data.clip_end = dist * 4
    if ortho:
        cam_data.type = 'ORTHO'
        cam_data.ortho_scale = R * 2.35 * mul
    else:
        cam_data.type = 'PERSP'
        cam_data.angle = 2 * math.atan(R * 1.2 * mul / dist)
    sc.render.resolution_x = px
    sc.render.resolution_y = int(px * (0.62 if asset == 'player' else 0.8))
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.join(OUT, f'{PREFIX}_{v}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
