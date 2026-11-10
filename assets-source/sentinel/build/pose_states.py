"""Reproducible gameplay-state poses for review renders.

Usable inside Blender (after opening player.blend or sentinel.blend):
    import pose_states; pose_states.apply_pose('reactor_open')

Each pose evaluates the matching exported NLA clip at its final frame, i.e. it
is exactly the state the GLB animation ends on. Poses can be combined with '+':
    'reactor_open+charge+destroyed_R'
"""
import bpy

POSES = {
    'rest': [],
    'reactor_closed': ['ReactorClose'],
    'reactor_open': ['ReactorOpen'],
    'charge': ['LauncherCharge'],
    'destroyed_L': ['ShoulderDestroyed_L'],
    'destroyed_R': ['ShoulderDestroyed_R'],
    'guard': ['Idle'],
    'engine_boost': ['Boost'],
}


# Emission strengths that mirror the runtime material cues in Boss.js:
#   core:   uIntensity = 0.35 + coreOpen * 1.5      (closed ~0.35, open ~1.85)
#   seam:   r = 0.8 + phase * 0.5 + coreOpen * 0.4
#   charge: glow = 0.6 + charge * 3 (+ flicker)     (idle 0.35)
MAT_CUES = {
    'reactor_closed': {'SN_Core': 0.6, 'SN_Seam': 1.0},
    'reactor_open': {'SN_Core': 3.0, 'SN_Seam': 1.8},
    'charge': {'SN_Charge': 3.6, 'SN_Core': 0.5},
    'destroyed_L': {'SN_Seam': 1.6},
    'destroyed_R': {'SN_Seam': 1.6},
}


def set_strength(name, value):
    m = bpy.data.materials.get(name)
    if m and m.use_nodes:
        b = m.node_tree.nodes.get('Principled BSDF')
        if b:
            b.inputs['Emission Strength'].default_value = value


def clip_end(clip):
    end = 0
    for o in bpy.context.scene.objects:
        ad = o.animation_data
        if not ad:
            continue
        for tr in ad.nla_tracks:
            if tr.name == clip:
                for st in tr.strips:
                    end = max(end, int(st.frame_end))
    return end


def apply_pose(name):
    clips = []
    for part in name.split('+'):
        clips += POSES[part]
    sc = bpy.context.scene
    frame = 0
    for o in sc.objects:
        ad = o.animation_data
        if not ad:
            continue
        for tr in ad.nla_tracks:
            tr.mute = tr.name not in clips
            tr.is_solo = False
    for c in clips:
        frame = max(frame, clip_end(c))
    for part in name.split('+'):
        for mat, val in MAT_CUES.get(part, {}).items():
            set_strength(mat, val)
    sc.frame_set(frame)
    bpy.context.view_layer.update()
    return frame
