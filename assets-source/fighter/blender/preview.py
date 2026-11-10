"""Author preview renders (supplementary).  Imports a GLB (so the *exported* data is what is shown)
or opens a .blend, lights it neutrally and renders the game's CLASSIC-45 view plus orthographic checks.

    blender.exe -b --factory-startup --python preview.py -- <asset.glb|asset.blend> <outdir> <prefix> <player|sentinel> [views]

views (comma list): iso, isosmall, top, side, front, rear, iso2   (default iso,isosmall,top,side,front,rear)
"""
import sys, os, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from kzlib import G2B


def setup(src, kind='player'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if src.lower().endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=src)
    else:
        bpy.ops.wm.open_mainfile(filepath=src)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    try:
        sc.eevee.taa_render_samples = 48
    except Exception:
        pass
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    # world: dim blue gradient so metals reflect a horizon
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld'); bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35; ramp.color_ramp.elements[0].color = (0.020, 0.030, 0.050, 1)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = (0.55, 0.70, 0.90, 1)
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bg.inputs['Strength'].default_value = 1.1
    # lights (game-space directions from scripts/qa/model-capture.cjs)
    def sun(name, gdir, color, strength):
        d = bpy.data.lights.new(name, 'SUN'); d.energy = strength; d.color = color
        o = bpy.data.objects.new(name, d); sc.collection.objects.link(o)
        v = G2B(Vector(gdir)).normalized()
        o.rotation_euler = v.to_track_quat('Z', 'Y').to_euler()   # light shines along -Z local; point +Z at the source
        d.angle = math.radians(12)
    if kind == 'sentinel':   # the boss faces -Z: light its front like the camera side of the arena
        sun('key', (-3, 8, -7), (1.0, 0.94, 0.86), 3.4)
        sun('fill', (7, 3, -4), (0.43, 0.81, 1.0), 1.5)
        sun('rim', (4, 9, 6), (1.0, 0.94, 0.86), 1.4)
    else:
        sun('key', (4, 9, 6), (1.0, 0.94, 0.86), 3.2)
        sun('fill', (-6, 3, -4), (0.43, 0.81, 1.0), 1.4)
    sun('top', (0, 10, 0), (0.8, 0.9, 1.0), 0.8)
    sc.render.film_transparent = False
    return sc


def bounds_game():
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.context.scene.objects:
        if o.type != 'MESH': continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            g = Vector((p.x, p.z, -p.y))   # Blender -> game
            lo = Vector(map(min, lo, g)); hi = Vector(map(max, hi, g))
    return lo, hi


def camera(sc, kind, view, lo, hi):
    ctr = (lo + hi) / 2; ext = (hi - lo)
    big = max(ext)
    views = {   # name: (game-space direction camera->target negated, i.e. camera offset dir, ortho scale mult, up)
        'iso':  (Vector((-45.255, 45.255, -45.255)), 1.0),
        'iso2': (Vector((45.255, 45.255, 45.255)), 1.0),
        'top':  (Vector((0, 100, -0.001)), 1.0),
        'side': (Vector((-100, 0, 0)), 1.0),
        'front': (Vector((0, 8, -100 if kind == 'sentinel' else 100)), 1.0),
        'rear': (Vector((0, 8, 100 if kind == 'sentinel' else -100)), 1.0),
    }
    key = 'iso' if view == 'isosmall' else view
    off, mult = views[key]
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
    cam_d.ortho_scale = big * 1.18 * mult
    cam_d.clip_start = 0.1; cam_d.clip_end = 1000
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
    pos = ctr + off.normalized() * 200
    cam.location = G2B(pos)
    d = G2B(ctr) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    return cam


def main():
    a = sys.argv[sys.argv.index('--') + 1:]
    src, outdir, prefix, kind = a[:4]
    views = (a[4] if len(a) > 4 else 'iso,isosmall,top,side,front,rear').split(',')
    sc = setup(src, kind)
    lo, hi = bounds_game()
    print('GAME_BOUNDS', [round(x, 3) for x in lo], [round(x, 3) for x in hi])
    os.makedirs(outdir, exist_ok=True)
    for v in views:
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']: bpy.data.objects.remove(o)
        cam = camera(sc, kind, v, lo, hi)
        if v == 'isosmall':
            sc.render.resolution_x, sc.render.resolution_y = (160, 120) if kind == 'player' else (192, 144)
            if kind == 'player': cam.data.ortho_scale = max(hi - lo) * 1.12
        else:
            sc.render.resolution_x, sc.render.resolution_y = 960, 720
        sc.render.filepath = os.path.join(outdir, f'{prefix}_{v}.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
