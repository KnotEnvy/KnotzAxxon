import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(sys.argv[1]).resolve()
REPO = Path(sys.argv[2]).resolve()


def read(name):
    return json.loads((ROOT / name).read_text())


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


authoring = read('checks/authoring.json')
binary = read('checks/glb-binary-audit.json')[0]
runtime = read('checks/runtime-proof.json')
source = read('checks/source-measurements.json')
render = read('checks/render-record.json')
inspection = read('checks/viewed-evidence.json')
independent = read('checks/independent-template-audit.json')
assets = ['asset/drifting-wreckage-kit.glb', 'asset/drifting-wreckage-kit.blend', 'asset/runtime-templates.json']
source_references = ['assets-source/fighter/blender/build_player.py', 'assets-source/fighter/blender/kzlib.py', 'assets-source/supplies/scripts/kit.py', 'assets-source/sentinel/manifest.json']
manifest = {
    'asset': 'DRIFTING WRECKAGE SCENERY KIT', 'delivery': 'initial / best effort — frozen',
    'status': 'pending_deferred_opus_review', 'pending_deferred_opus_review': True, 'formal_reviews': 0, 'formal_fix_passes': 0,
    'baseline': 'ee221ad3e05cd66292fe02b71b50f513696bdda2', 'date': '2026-11-14', 'execution_host': 'NitroBliss',
    'execution': {'requested_model': 'Sol', 'requested_reasoning_effort': 'XHigh', 'requested_speed': 'available speed', 'executed_harness': 'T3 Code / Codex', 'executed_model': 'gpt-6.1-sol', 'executed_reasoning_effort': 'xhigh', 'executed_speed': 'No service-tier/speed parameter exposed or overridden; not asserted as a named tier.', 'helpers': 0, 'delegates': 0, 'claude_retries': 0, 'opus_review': 'DEFERRED', 'implementation_validation': 'Source measurement, authoring/debugging and asset validation only; no formal reviewer or formal polish/fix pass.'},
    'scope': 'ONLY Fortress._voidProps rng.bool(0.5) drifting wreck branch. No production source installed; no asteroids, stations, gates, dreadnought, carrier or gameplay edits.',
    'static': True, 'axes': 'Game +Y up, +Z forward. Blender uses (x,-z,y). Origin exactly source tapered hull origin: shell extends forward, not centered on Z.',
    'toolchain': {'blender': authoring['blender'], 'build_hash': authoring['build'], 'platform': 'native Linux', 'engine': 'BLENDER_EEVEE', 'render_threads': 4, 'three_cpu': runtime['three_version'], 'new_installs': False, 'tooling_distributed': False},
    'files': {name: {'bytes': (ROOT / name).stat().st_size, 'sha256': sha(ROOT / name)} for name in assets},
    'budget': {'target_triangles_each': [400, 700], 'ceiling_triangles_each': 1000, 'max_merged_primitives_per_wreck': 2, 'kit_glb_ceiling_bytes': 512 * 1024, 'kit_glb_bytes': binary['bytes'], 'kit_glb_triangles': binary['triangles'], 'kit_glb_primitives': binary['primitive_count'], 'new_textures': 0, 'materials': 2, 'all_budget_checks_pass': True},
    'variants': authoring['variants'],
    'named_node_map': [{'variant_root': name, 'dark_node': f'{name}--dark', 'neon_node': f'{name}--neon', 'runtime': 'Never instantiate the root per wreck. Select only one cached variant and append all its vertices to the existing two chunk buckets.'} for name in ('gutter-keel', 'sheared-chine')],
    'material_runtime_map': {'WR_Dark__bind_shared_darkMetal': {'bucket': 'dark', 'shared_runtime_material': 'materials.darkMetal', 'source_color': '0x3a4a5e', 'metalness': .5, 'roughness': .46, 'vertexColors': True, 'textures_at_baseline': [], 'response': 'Retain shared source material, source AO, front/side lift, and world box-projected UV reconstruction; do not clone it.'}, 'WR_Ember__reconstruct_aAnim': {'bucket': 'neon', 'shared_runtime_material': 'materials.neonVertex', 'gain': 1.4, 'color': '0xff7a2a', 'mode': 4, 'mode_name': 'FLICKER', 'rate_and_phase': 'Exact original four random pairs. Vertex-to-slot association explicit in sidecar.', 'clock': 'Existing uLightTime, controlled by game.', 'GLB_fallback': 'Static warm emissive glTF material, not the game shader.'}},
    'material_requirement_correction': source['material_correction'],
    'random_contract': source['random_draws'],
    'deterministic_selection': 'Avalanche hash of existing branch-entry rng._s XOR chunk index; no call to rng.next, bool, range, int or a separate random generator.',
    'legacy_ember_geometry': 'Consumes every original width/offset draw in order but fits four static emissive faces to torn shell. Original four rates/phases and flicker mode/gain retained. Wreck placement, s, yaw and bank retained. Exact old individual ember box positions are deliberately not retained.',
    'shader_sidecar': {'required': True, 'file': 'asset/runtime-templates.json', 'cached_typed_array_bytes': runtime['cached_template_typed_array_bytes'], 'reconstruction': 'Float32 p/n/linear c, Int8 ember slot. Append helper reconstructs bank/yaw/scale, source world projected UVs, AO/front/side lift, neon gain and per-vertex aAnim. Ordinary GLB alone cannot carry source material clocks, GLSL hooks, or this complete Batch behavior.'},
    'ownership': 'Prepare immutable typed-array templates before Game construction. No per-frame mesh generation; no per-wreck GLTF roots, material/texture clones or parts draws. Actual Batch merges two existing chunk buckets. Chunk owns merged BufferGeometry; source _disposeChunk disposes each exactly once. Shared materials/textures retained until existing shutdown, template array references released only then. Pools reuse CPU buffers. Do not render whole kit per wreck.',
    'source_placement': source['placement'], 'continuous_clearance': source['continuous_clearance'],
    'bounds': {'canonical_evaluated': 'variants[*].bounds', 'transformed_evaluated': 'checks/transformed-bounds.json (36 actual Batch evaluations; samples explicitly NOT continuous extrema)', 'proof': 'Every template vertex/triangle inside original convex source hull, hence every allowed size/bank/yaw/translation stays inside its full transformed envelope. No flight, player, aim or altitude range narrowed.', 'common_world_sample': 'checks/world-scene.json'},
    'validation': {'source_random_geometry_trials': len(runtime['exact_rng_and_unchanged_geometry_trials']), 'rng_and_downstream_geometry': 'Exact full next() sequences/state + next 32 draws + per-operation binary attribute hashes outside the wreck; actual source _voidProps including untouched carrier/dreadnought/rocks/station in sector 2/4 trials.', 'source_batch_fixture_max_attr_error': runtime['source_batch_transform_uv_ao_fixture_maximum_attribute_error'], 'neon_all_vertices_checked': True, 'chunk_geometry_dispose_events': runtime['chunk_geometry_disposal_events'], 'shared_material_dispose_events': runtime['shared_material_disposal_events'], 'blend_reopened': True, 'glb_clean_scene_reimport': True, 'independent_binary_audit': True, 'manifold_thickness_shells_with_real_open_cavity_rays': independent['variants']},
    'density_proxy': runtime['density_proxy'], 'density_proxy_limitations': runtime['density_limit'],
    'memory_scope': runtime['retained_typed_array_packing'],
    'evidence': {'rendered_pngs': [item['file'] for item in render['renders']], 'actually_viewed': inspection, 'source_cameras': 'Actual source FlightCamera + CameraRig.snap CPU math, 16:9. Classic ortho, Modern58deg/Chase66deg; same geometry, source positions, unit-scale shipped player. Examples are framing-selected original-seed placements, not an average gameplay composition. No placement/scale/rotation edited.', 'lighting': 'Studio diagnostic lighting in kit views. Source deepspace key/rim numeric parameters in WORLD views. Analytic Blender world is a hemisphere/IBL approximation. Source PMREM, procedural sky, FogExp2, bloom and tone-mapping are NOT reproduced. Static source t=0 flicker snapshot only.', 'not_live_acceptance': True},
    'vocabulary': {'six_shipped_GLBs': 'checks/shipped-vocabulary-audit.json and evidence/00-shipped-vocabulary.png; NOT redistributed', 'selected_assets_source_inspected': {name: sha(REPO / name) for name in source_references}, 'use': 'Plate bevel/chine language, attached exposed structure and restrained steel/ember contrast; new hull-fragment templates authored from scratch, not old contest design disguises.'},
    'limitations': ['Offline Blender EEVEE with software graphics requested by existing wrapper; not live WebGL/GPU or final acceptance.', *runtime['camera_test_doubles'], 'CPU protocol/buffer/disposal checks do not validate shader compilation, renderer scheduling or driver memory.', 'Finite aggregate density proxy, not a live scene maximum. Excludes unrelated geometry/materials/driver/CPU allocator overhead.', 'No formal Opus review/polish; pending_deferred_opus_review, 0 formal reviews/fix passes.', 'Transfer receipt is sender-side only; receiver verification belongs to orchestrator.'],
    'transfer_policy': 'Only assigned asset/source/reference snapshots/evidence/checksums packaged. No wrapper, executable, runtime, libs, node_modules, caches, temporary data or unrelated asset work. Initial frozen bytes unchanged; archive/receipt outside initial.',
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': manifest['asset'], 'variants': [(item['name'], item['triangles']) for item in authoring['variants']], 'glb_bytes': binary['bytes'], 'viewed_pngs': len(inspection['images'])}))
