"""
KnotzAxxon environment kit generator (deterministic, CPU only; Blender never renders).

blender --background --factory-startup -noaudio --python generate.py -- <outdir>

Writes:
  <outdir>/environment-kit.blend       editable kit, one collection per module
  <outdir>/modules/<Module>.glb        one GLB per module, one mesh node per part
  <outdir>/runtime/environment-kit.glb every module in one GLB: the file the game loads
  <outdir>/kit-recipe.json             part metadata: bucket, tint, uvScale, gain, fx rule,
                                       stamp frame, owner, triangles, bounds, hashes

Part metadata the runtime needs (bucket, tint, uv scale, gain) travels inside
the GLB as node extras (rs_bucket / rs_tint / rs_uv / rs_gain), so the game
fetches one file and no side-car JSON.
"""
import bpy
import json
import sys
import hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import kit_geometry as K  # noqa: E402
import kit_dsl  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = Path(argv[0]) if argv else HERE.parent
(OUT / 'modules').mkdir(parents=True, exist_ok=True)
(OUT / 'runtime').mkdir(parents=True, exist_ok=True)

PART_FILES = ['parts_reactor.py', 'parts_fortress.py', 'parts_structures.py']
for name in PART_FILES:
    f = HERE / name
    if f.exists():
        exec(compile(f.read_text(), str(f), 'exec'), {'__name__': name[:-3], '__file__': str(f)})
PARTS = kit_dsl.PARTS

for coll in list(bpy.data.collections):
    bpy.data.collections.remove(coll)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.context.scene
scene.name = 'KnotzAxxonEnvironmentKit'
scene.unit_settings.system = 'METRIC'

modules = {}
for prt in PARTS:
    modules.setdefault(prt.module, []).append(prt)
names = [p.full_name for p in PARTS]
assert len(set(names)) == len(names), 'duplicate part name'

recipe = {'schema': 'knotzaxxon-environment-kit-v1',
          'axes': 'game metres: +x far wall, +y up, +z flight; GLB vertices equal game coordinates (absolute x unless a part note says local)',
          'animModes': {'STEADY': 0, 'STROBE': 1, 'CHASE': 2, 'BREATHE': 3, 'FLICKER': 4}, 'modules': {}}
for mod, parts in modules.items():
    coll = bpy.data.collections.new(mod)
    scene.collection.children.link(coll)
    entries = []
    for prt in parts:
        obj = K.build_object(prt, coll)
        obj['rs_owner'] = prt.owner
        lo, hi = prt.bounds()
        entries.append({
            'part': prt.name, 'node': prt.full_name, 'bucket': prt.bucket, 'tint': f'0x{prt.tint:06x}', 'uvScale': prt.uv, 'gain': prt.gain,
            'fx': prt.fx, 'stamp': prt.stamp, 'owner': prt.owner, 'note': prt.note, 'triangles': len(obj.data.polygons),
            'localBounds': {'min': [round(v, 4) for v in lo], 'max': [round(v, 4) for v in hi]},
        })
    recipe['modules'][mod] = {'parts': entries, 'triangles': sum(e['triangles'] for e in entries)}

bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'environment-kit.blend'), compress=True)


def export(path, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    kwargs = dict(filepath=str(path), export_format='GLB', use_selection=True, export_apply=True, export_normals=True,
                  export_texcoords=False, export_materials='EXPORT', export_yup=True, export_animations=False, export_extras=True)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_vertex_color='NONE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


for mod in modules:
    recipe['modules'][mod]['glb'] = {'file': f'modules/{mod}.glb', **export(OUT / 'modules' / f'{mod}.glb', bpy.data.collections[mod].objects)}
recipe['runtime'] = {'file': 'runtime/environment-kit.glb',
                     **export(OUT / 'runtime' / 'environment-kit.glb', [o for m in modules for o in bpy.data.collections[m].objects])}

recipe['totals'] = {m: v['triangles'] for m, v in recipe['modules'].items()}
recipe['parts'] = len(PARTS)
recipe['triangles'] = sum(recipe['totals'].values())
recipe['orientation'] = {'facesChecked': K.ORIENT['faces'], 'flipped': sorted(set(K.ORIENT['flipped'])), 'degenerate': sorted(set(K.ORIENT['degenerate']))}
recipe['generator'] = {'blender': bpy.app.version_string,
                       'build': bpy.app.build_hash.decode() if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
                       'sources': {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(HERE.glob('*.py'))}}
(OUT / 'kit-recipe.json').write_text(json.dumps(recipe, indent=1) + '\n')
print('KIT', json.dumps(recipe['totals']), 'parts', len(PARTS), 'triangles', recipe['triangles'])
print('ORIENT', json.dumps(recipe['orientation']))
