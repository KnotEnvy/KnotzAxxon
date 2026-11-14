import datetime
import hashlib
import json
import pathlib
import socket
import subprocess

WORK = pathlib.Path(__file__).resolve().parents[1]
REPO = WORK.parents[2]
BASELINE = 'ee221ad3e05cd66292fe02b71b50f513696bdda2'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name):
    return json.loads((WORK / 'evidence' / name).read_text())


head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip()
assert head == BASELINE
subprocess.run(['git', 'diff', '--exit-code', '--', 'src', 'public', 'docs'], cwd=REPO, check=True, stdout=subprocess.PIPE)
source_hashes = {}
for snapshot in sorted((WORK / 'source').iterdir()):
    original = REPO / snapshot.name.replace('__', '/')
    assert original.read_bytes() == snapshot.read_bytes(), original
    source_hashes[str(original.relative_to(REPO))] = sha(snapshot)
glb = load('glb-independent.json')
verification = load('blender-verification.json')
contract = load('source-contract.json')
runtime = load('runtime-settings.json')
readability = load('readability.json')
renders = load('renders.json')
baseline = load('baseline-measured.json')
embedded = load('embedded-source.json')
pixel_checks = load('evidence-pixel-checks.json')
assert embedded['embedded_generator_matches_delivered_source']
assert pixel_checks['exact_source_green_rgba_center'] == [82, 255, 168, 255]
asset_files = {}
for name in ['repair-pickup.glb', 'repair-pickup.blend']:
    path = WORK / 'asset' / name
    asset_files['asset/' + name] = {'bytes': path.stat().st_size, 'sha256': sha(path)}
assert glb['bytes'] == asset_files['asset/repair-pickup.glb']['bytes']
assert glb['sha256'] == asset_files['asset/repair-pickup.glb']['sha256']
gameplay_entries = [entry for entry in renders if entry['file'].startswith('offline-') and entry.get('rig')]
assert len(gameplay_entries) == 6
assert all(entry['camera_facing_normal_dot'] > .99999 for entry in gameplay_entries)
required = ['contact-sheet.png', 'offline-gameplay-sheet.png', 'contexts-sheet.png', 'small-gameplay-readability.png',
            'grayscale-front.png', 'grayscale-kind-silhouette-cues.png', 'exact-source-color-swatches.png', 'dense-batch-36.png',
            'identity-sheet.png', 'drift-context-sheet.png', 'exact-green-front.png', 'grayscale-exact-green-front.png',
            'combined-maxpulse-negativewobble.png']
assert all((WORK / 'evidence' / 'png' / name).is_file() for name in required)
limits = [
    'Frozen INITIAL only; pending_deferred_opus_review; zero formal reviews or formal review/fix rounds; no final art approval.',
    'No production adapter exists or is edited here. Integration must preload repair-pickup, use per-instance instantiate clones, retain full normal Pickup constructor and shared halo, bind named handles, and explicitly dispose only imported per-instance root resources.',
    'Node harness executes actual source classes/methods with minimal THREE test doubles, not actual Three.js, GLTFLoader, renderer, physics or GPU memory. Real integrated dense-batch/material/lifetime testing remains required. 128 diagnostic instances and 36 Blender imports are not a hard live maximum.',
    'Offline gameplay images are reconstruction, NOT live gameplay proof. Source Classic/Modern/Chase zero-boost rigs/projections and dusk key/rim are reconstructed; schematic deck, world/hemisphere and alpha-dithered halo are approximations. No exact game fog/IBL/bloom, camera shake/boost/lag/aspect sweep, live HUD/audio/particle/light/postfx simulation.',
    'Collection context images do not render actual collection sparks, expanding ring, light flash, HUD, score or audio; source dispatch and ring timing are exercised numerically and must remain source driven in integration.',
    'Finite BVH overlap and vertex-to-triangle samples are not an exact global minimum-distance solver. A separately measured conservative radial separating bound covers full spin/pulse/wobble ranges with float precision caveats.',
    'GLB vertices intentionally split at normal/color seams. Raw reimport topology reports boundary edges; geometric position-welded components are closed. Editable blend is manifold before export.',
    'Unlit authored palettes retain exact green #52ffa8 plus deliberate #ddffeb ceramic/front and mint/green/slate facets, not identical to source uniform neon gains1.15/1.35. Set cloned shell/shape toneMapped=false; verify receiver postfx.',
    'Baseline is a 500-triangle Blender source-dimension reconstruction with analytic mitered cross bevel, not an actual Three.js geometry capture. Source kind-cue references approximate spread bevel offsets/materials; no other kinds are redesigned/exported.',
    'Mechanical charge/detachment, targeting, projectiles and deployed healing bubble are N/A; normal collection/lifecycle detach is unchanged. No exported halo, tiny-text dependency or formal readability acceptance.',
    'Native startup logs may contain software EGL_BAD_MATCH context-probe warnings or read-only global extension-cache warnings; successful saved PNGs and renderer identity are independently recorded.',
    'Receiver-side Taildrop archive verification and real production integration are orchestrator responsibilities; transfer status is recorded outside immutable initial/.'
]
node_map = {
    'coordinate_contract': {'game': '+Y up / +Z forward', 'local_badge_plane': 'XY', 'front_normal': '+Z',
                            'blender_from_game': '(x,-z,y)', 'gltf_from_blender': '(x,z,-y)',
                            'export_yup': True, 'post_load_correction': 'NONE; no scaling, normalization or extra rotation'},
    'root': {'name': 'repair_pickup_root', 'translation': [0, 0, 0], 'rotation_xyzw': [0, 0, 0, 1], 'scale': [1, 1, 1],
             'parent': 'existing Pickup.group (pos pointer retained, quaternion copies ctx.camera.quaternion every frame)'},
    'handles': {
        'shell': {'type': 'Mesh', 'game_pivot': [0, 0, 0], 'axis': 'local +Z', 'material': 'repair_shell_green_unlit',
                  'motion': 'rotation.z+=dt*.3; scale.setScalar(1+sin(phase*4)*.025)', 'owned_per_clone': True, 'toneMapped': False},
        'core': {'type': 'Mesh', 'game_pivot': [0, 0, -.3], 'axis': 'static', 'material': 'repair_core_titanium',
                 'motion': 'none relative to billboard root', 'owned_per_clone': True, 'toneMapped': True},
        'shape': {'type': 'Mesh', 'game_pivot': [0, 0, .1], 'axis': 'local +Z', 'material': 'repair_shape_ceramic',
                  'motion': 'rotation.z=sin(phase*2.2)*.08', 'owned_per_clone': True, 'toneMapped': False}},
    'halo': {'exported': False, 'runtime_handle': 'Pickup.halo', 'type': 'existing THREE.Sprite', 'color': '0x52ffa8',
             'shared_cache': 'mats._pickupHalos.get(def.color)', 'owner': 'Materials (not imported asset, instance or adapter)',
             'opacity': .35, 'motion': 'scale.setScalar(7*(1+sin(phase*4)*.2))', 'dispose_by_pickup': False},
    'per_instance': {'geometries': 3, 'materials': 3, 'visible_material_primitives': 3, 'additional_unchanged_halo_sprite': 1,
                     'textures_created_by_asset': 0, 'material_owner_list': 'importedRoot.userData.modelOwnedMaterials',
                     'dispose': 'disposeModel(this._importedRoot) once; null pointer; detach group. Never dispose halo/template/shared caches.'},
    'integration': 'scripts/adapter_recipe.mjs; recipe only, source unchanged. Invoke after full normal constructor. Existing instantiate() cloning semantics; do not return early before state/halo initialization.',
    'not_applicable': ['charge', 'mechanical detach', 'targeting', 'shot origins', 'healing bubble'],
}
for name, handle in node_map['handles'].items():
    position = handle['game_pivot']
    handle['source_local_matrix_row_major'] = [1, 0, 0, position[0], 0, 1, 0, position[1], 0, 0, 1, position[2], 0, 0, 0, 1]
    handle['authored_local_rotation_xyzw'] = [0, 0, 0, 1]
    handle['authored_local_scale'] = [1, 1, 1]
    handle['authored_world_matrix_row_major'] = next(obj['matrix_world_row_major'] for obj in glb['objects'] if obj['node'] == name)
node_map['root']['source_local_matrix_row_major'] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
node_map['source_behavior'] = contract['sourceState']
node_map['per_instance']['geometry_owner'] = 'Per-instance importedRoot; instantiate() clones; disposeModel(importedRoot) frees geometry once. Never procedural/template caches.'
node_map['per_instance']['material_owner'] = 'Per-instance modelOwnedMaterials array only; template textures remain global. No asset textures.'
(WORK / 'runtime-map.json').write_text(json.dumps(node_map, indent=2) + '\n')
(WORK / 'evidence' / 'limitations.json').write_text(json.dumps(limits, indent=2) + '\n')
(WORK / 'evidence' / 'source-preservation.json').write_text(json.dumps({'git_head': head, 'production_diff_empty_src_public_docs': True,
    'snapshots_match_current_source': True, 'source_sha256': source_hashes}, indent=2) + '\n')
manifest = {
    'asset': 'repair-pickup', 'delivery': 'frozen_INITIAL', 'status': 'pending_deferred_opus_review',
    'formal_reviews': 0, 'formal_review_fix_rounds': 0, 'final_art_acceptance': False,
    'technical_validation_only': 'Generator/export checks, source-preservation/contract harness, reopen/reimport, independent binary scan, full-range clearance and manual evidence viewing; not formal review or polish.',
    'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': socket.gethostname(), 'baseline_commit': head,
    'requested_and_used': {'provider': 'codex', 'model': 'gpt-6.1-sol', 'reasoningEffort': 'xhigh', 'speed': 'available speed',
                           'fast_mode': 'No fast-mode claim',
                           'helpers': 0, 'delegations': 0, 'claude_retries': 0, 'deferred': 'Opus formal review/polish when SuperBeast is free'},
    'files': asset_files, 'runtime_settings': runtime,
    'measurements': {'evaluated_blend_triangles': verification['blend_reopened']['triangles'],
                     'glb_binary_triangles': glb['triangles'], 'clean_reimport_triangles': verification['glb_clean_scene_reimport']['triangles'],
                     'mesh_nodes': glb['mesh_nodes'], 'glb_nodes': len(glb['nodes']), 'material_primitives': glb['material_primitives'],
                     'materials': len(glb['materials']), 'glb_vertices_including_seams': sum(obj['vertices'] for obj in glb['objects']),
                     'bounds_transformed_rest_game': glb['transformed_rest_bounds_game'],
                     'conservative_dynamic_envelope_game': {'min': [-2.096127, -2.096127, -.380001], 'max': [2.096127, 2.096127, .260001],
                                                           'note': 'shell radius2.045 * max pulse1.025, core/shape bounded inside; front/back unchanged; all-angle envelope, not every corner simultaneously occupied'},
                     'textures': glb['textures'], 'images': glb['images'], 'animations': glb['animations'],
                     'blend_packed_state': verification['blend_packed_state'], 'embedded_generator': embedded, 'per_mesh': glb['objects']},
    'budget': {'triangle_target': 1500, 'triangle_ceiling': 2500, 'primitive_ceiling': 3, 'glb_bytes_ceiling': 524288,
               'texture_atlas': 'None; optional <=512 atlas not used', 'all_ceilings_pass': True},
    'baseline_measured': baseline, 'clearance': verification['clearance'],
    'source_contract': {'kind': 'repair', 'color': '0x52ffa8', 'label': 'HULL +1', 'score': 250, 'pickup_radius': 2.2,
                        'collection_center_distance_with_player': 3.7, 'magnet_distance': 22, 'despawn_behind': 55,
                        'timed_lifetime': None, 'hard_max_live_instances': None, 'random_phase_unchanged': True,
                        'velocity_Vector3_retained': True, 'camera_quaternion_copy_unchanged': True,
                        'repair': 'player.repair(1), actual Player.repair caps at original hullMax',
                        'no_new_damage_invulnerability_mechanics': True, 'detach': 'mechanical detach N/A; lifecycle detach unchanged', 'charge': 'N/A', 'full_samples': 'evidence/source-contract.json'},
    'deliberate_kit_reuse': {'authorized_reference': 'asset-work/shield-pickup/initial',
        'reference_generator_sha256': sha(REPO / 'asset-work/shield-pickup/initial/scripts/build_shield.py'),
        'reference_glb_sha256': sha(REPO / 'asset-work/shield-pickup/initial/asset/shield-pickup.glb'),
        'reused': 'Adapted self-contained builder/palette/verification/render/freeze tooling; frame/slate/ceramic material language.',
        'not_reused': 'No shield emblem/geometry, worker state or spread/parked-fighter/other-worker assets. Frozen shield GLB imported into labeled evidence only.',
        'runtime_coupling': False},
    'ownership_harness': contract['importedAdapterOwnershipHarness'], 'readability': readability, 'evidence_pixel_checks': pixel_checks,
    'style_reference': {'path_in_repo': 'public/models/player.glb', 'sha256': sha(REPO / 'public/models/player.glb'),
                        'usage': 'Style/world-scale evidence reference only; no geometry copied into new asset or archive'},
    'common_neutral': {'camera_game': [-16, 24, -30], 'target_game': [0, 0, 0], 'orthographic_vertical_span': 14,
                       'key_game': [-12, 22, -12], 'fill_game': [14, 12, 8], 'shared_world_scale': 1},
    'evidence': {'individual_png_count': len(list((WORK / 'evidence' / 'png').glob('*.png'))),
                 'render_record_count': len(renders), 'camera_facing_rig_dot_min': min(entry['camera_facing_normal_dot'] for entry in gameplay_entries),
                 'contact_sheet': 'evidence/png/contact-sheet.png', 'offline_gameplay_sheet': 'evidence/png/offline-gameplay-sheet.png',
                 'small_native_pixels': 'evidence/png/small-gameplay-readability.png', 'offline_not_live': True,
                 'viewed_record': 'evidence/viewed-pngs.json'},
    'production_src_public_docs_edited': False, 'git_fetch_update_commit_push_publish': False,
    'freeze_policy': 'Immutable initial/. Checksums cover every file except SHA256SUMS. Later changes require separate authorized revision, never edits here.',
    'limitations': limits,
}
(WORK / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'asset': manifest['asset'], 'status': manifest['status'], 'files': asset_files,
                  'triangles': glb['triangles'], 'primitives': glb['material_primitives'], 'PNGs': manifest['evidence']['individual_png_count']}, indent=2))
