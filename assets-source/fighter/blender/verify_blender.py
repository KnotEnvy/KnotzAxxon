"""Reopen both saved .blend files and re-import both GLBs; write verification.blender.json.

    blender.exe -b --factory-startup --python verify_blender.py -- <contest-entry dir>
"""
import sys, os, json
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kzlib as K


def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in objs:
        if o.type != 'MESH': continue
        ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles(); n += len(me.loop_triangles); ev.to_mesh_clear()
    return n


def snapshot():
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    return dict(objects=len(bpy.data.objects), mesh_objects=len(meshes), empties=sum(o.type == 'EMPTY' for o in bpy.data.objects),
                evaluated_triangles=tri_count(meshes), materials=sorted(m.name for m in bpy.data.materials if m.users),
                images=[dict(name=i.name, packed=i.packed_file is not None, size=list(i.size)) for i in bpy.data.images if i.users],
                actions=sorted(a.name for a in bpy.data.actions),
                nla_tracks=sorted({t.name for o in bpy.data.objects if o.animation_data for t in o.animation_data.nla_tracks}),
                object_names=sorted(o.name for o in bpy.data.objects), frame_current=bpy.context.scene.frame_current)


def main():
    root = sys.argv[sys.argv.index('--') + 1]
    rep = {}
    for asset in ('player', 'sentinel'):
        r = {}
        bpy.ops.wm.open_mainfile(filepath=os.path.join(root, f'{asset}.blend'))
        r['blend'] = snapshot()
        blend_names = set(r['blend']['object_names'])
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(root, f'{asset}.glb'))
        r['glb_reimport'] = snapshot()
        r['glb_reimport']['actions_imported'] = sorted({a.name.split('|')[0].split('_Action')[0] for a in bpy.data.actions})
        glb_names = set(r['glb_reimport']['object_names'])
        extra = sorted(glb_names - blend_names); missing = sorted(blend_names - glb_names)
        r['name_diff'] = dict(only_in_glb=extra[:20], only_in_blend=missing[:20])
        r['triangles_match'] = r['blend']['evaluated_triangles'] == r['glb_reimport']['evaluated_triangles']
        r['materials_match'] = sorted(r['blend']['materials']) == sorted(m for m in r['glb_reimport']['materials'])
        r['ok'] = (not missing) and r['triangles_match'] and (asset != 'sentinel' or all(i['packed'] for i in r['blend']['images']))
        rep[asset] = r
    json.dump(rep, open(os.path.join(root, 'build', 'verification.blender.json'), 'w'), indent=1)
    for a, r in rep.items():
        print('VERIFY', a, 'ok' if r['ok'] else 'FAIL', 'blend tris', r['blend']['evaluated_triangles'], 'glb tris', r['glb_reimport']['evaluated_triangles'],
              'objects', r['blend']['objects'], '/', r['glb_reimport']['objects'], 'missing', r['name_diff']['only_in_blend'])


if __name__ == '__main__':
    main()
