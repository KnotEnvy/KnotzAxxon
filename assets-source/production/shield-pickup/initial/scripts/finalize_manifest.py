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
asset_files = {}
for name in ['shield-pickup.glb', 'shield-pickup.blend']:
    path = WORK / 'asset' / name
    asset_files['asset/' + name] = {'bytes': path.stat().st_size, 'sha256': sha(path)}
assert glb['bytes'] == asset_files['asset/shield-pickup.glb']['bytes']
assert glb['sha256'] == asset_files['asset/shield-pickup.glb']['sha256']
gameplay_entries = [entry for entry in renders if entry['file'].startswith('offline-') and entry.get('rig')]
assert len(gameplay_entries) == 6
assert all(entry['camera_facing_normal_dot'] > .99999 for entry in gameplay_entries)
required = ['contact-sheet.png', 'offline-gameplay-sheet.png', 'contexts-sheet.png', 'small-gameplay-readability.png',
            'grayscale-front.png', 'grayscale-kind-silhouette-cues.png', 'exact-source-color-swatches.png', 'dense-batch-36.png']
assert all((WORK / 'evidence' / 'png' / name).is_file() for name in required)
limits = [
    'Frozen INITIAL only; pending_deferred_opus_review; zero formal reviews or formal review/fix rounds; no final art approval.',
    'No production adapter exists or is edited here. Integration must preload shield-pickup, use per-instance instantiate clones, retain full normal Pickup constructor and shared halo, bind named handles, and explicitly dispose only imported per-instance root resources.',
    'Node harness executes actual source classes/methods with minimal THREE test doubles, not actual Three.js, GLTFLoader, renderer, physics or GPU memory. Real integrated dense-batch/material/lifetime testing remains required. 128 diagnostic instances and 36 Blender imports are not a hard live maximum.',
    'Offline gameplay images are reconstruction, NOT live gameplay proof. Source Classic/Modern/Chase zero-boost rigs/projections and dusk key/rim are reconstructed; schematic deck, world/hemisphere and alpha-dithered halo are approximations. No exact game fog/IBL/bloom, camera shake/boost/lag/aspect sweep, live HUD/audio/particle/light/postfx simulation.',
    'Collection context images do not render actual collection sparks, expanding ring, light flash, HUD, score or audio; source dispatch and ring timing are exercised numerically and must remain source driven in integration.',
    'Finite BVH overlap and vertex-to-triangle samples are not an exact global minimum-distance solver. A separately measured conservative radial separating bound covers full spin/pulse/wobble ranges with float precision caveats.',
    'GLB vertices intentionally split at normal/color seams. Raw reimport topology reports boundary edges; geometric position-welded components are closed. Editable blend is manifold before export.',
    'Unlit authored palettes preserve exact cyan and improve small-scale crest readability but are not identical to source uniform neon intensity responses. Set cloned shell/shape toneMapped=false in adapter; verify actual postfx on receiver.',
    'Source kind-cue references approximate spread/repair bevel offsets; no other pickup kinds are redesigned or exported.',
    'Charge, detachment, targeting, projectiles and deployed shield bubble are N/A; no invented mechanism or exported halo. Far tiny views retain limited bevel/detail visibility; no tiny-text dependency or formal readability acceptance claimed.',
    'Native startup logs may contain software EGL_BAD_MATCH context-probe warnings or read-only global extension-cache warnings; successful saved PNGs and renderer identity are independently recorded.',
    'Receiver-side Taildrop archive verification and real production integration are orchestrator responsibilities; transfer status is recorded outside immutable initial/.'
]
node_map = {
    'coordinate_contract': {'game': '+Y up / +Z forward', 'local_badge_plane': 'XY', 'front_normal': '+Z',
                            'blender_from_game': '(x,-z,y)', 'gltf_from_blender': '(x,z,-y)',
                            'export_yup': True, 'post_load_correction': 'NONE; no scaling, normalization or extra rotation'},
    'root': {'name': 'shield_pickup_root', 'translation': [0, 0, 0], 'rotation_xyzw': [0, 0, 0, 1], 'scale': [1, 1, 1],
             'parent': 'existing Pickup.group (pos pointer retained, quaternion copies ctx.camera.quaternion every frame)'},
    'handles': {
        'shell': {'type': 'Mesh', 'game_pivot': [0, 0, 0], 'axis': 'local +Z', 'material': 'shield_shell_cyan_unlit',
                  'motion': 'rotation.z+=dt*.3; scale.setScalar(1+sin(phase*4)*.025)', 'owned_per_clone': True, 'toneMapped': False},
        'core': {'type': 'Mesh', 'game_pivot': [0, 0, -.3], 'axis': 'static', 'material': 'shield_core_titanium',
                 'motion': 'none relative to billboard root', 'owned_per_clone': True, 'toneMapped': True},
        'shape': {'type': 'Mesh', 'game_pivot': [0, 0, .1], 'axis': 'local +Z', 'material': 'shield_shape_ceramic',
                  'motion': 'rotation.z=sin(phase*2.2)*.08', 'owned_per_clone': True, 'toneMapped': False}},
    'halo': {'exported': False, 'runtime_handle': 'Pickup.halo', 'type': 'existing THREE.Sprite', 'color': '0x45e0ff',
             'shared_cache': 'mats._pickupHalos.get(def.color)', 'owner': 'Materials (not imported asset, instance or adapter)',
             'opacity': .35, 'motion': 'scale.setScalar(7*(1+sin(phase*4)*.2))', 'dispose_by_pickup': False},
    'per_instance': {'geometries': 3, 'materials': 3, 'visible_material_primitives': 3, 'additional_unchanged_halo_sprite': 1,
                     'textures_created_by_asset': 0, 'material_owner_list': 'importedRoot.userData.modelOwnedMaterials',
                     'dispose': 'disposeModel(this._importedRoot) once; null pointer; detach group. Never dispose halo/template/shared caches.'},
    'integration': 'scripts/adapter_recipe.mjs; recipe only, source unchanged. Invoke after full normal constructor. Existing instantiate() cloning semantics; do not return early before state/halo initialization.',
    'not_applicable': ['charge', 'detach', 'targeting', 'shot origins', 'shield bubble'],
}
(WORK / 'runtime-map.json').write_text(json.dumps(node_map, indent=2) + '\n')
(WORK / 'evidence' / 'limitations.json').write_text(json.dumps(limits, indent=2) + '\n')
(WORK / 'evidence' / 'source-preservation.json').write_text(json.dumps({'git_head': head, 'production_diff_empty_src_public_docs': True,
    'snapshots_match_current_source': True, 'source_sha256': source_hashes}, indent=2) + '\n')
manifest = {
    'asset': 'shield-pickup', 'delivery': 'frozen_INITIAL', 'status': 'pending_deferred_opus_review',
    'formal_reviews': 0, 'formal_review_fix_rounds': 0, 'final_art_acceptance': False,
    'initial_technical_self_corrections': 'Completed before freeze: Blender export option/unlit graph parity, small-camera emissive readability, source-harness scaffolding, fair equivalent halo/phase evidence and correct screen-side labels. Not formal reviews or polish rounds.',
    'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': socket.gethostname(), 'baseline_commit': head,
    'requested_and_used': {'provider': 'codex', 'model': 'gpt-6.1-sol', 'reasoningEffort': 'xhigh', 'speed': 'available speed',
                           'fast_mode': 'No exposed toggle; explicitly accepted by user; no fast-mode claim',
                           'helpers': 0, 'delegations': 0, 'claude_retries': 0, 'deferred': 'Opus formal review/polish when SuperBeast is free'},
    'files': asset_files, 'runtime_settings': runtime,
    'measurements': {'evaluated_blend_triangles': verification['blend_reopened']['triangles'],
                     'glb_binary_triangles': glb['triangles'], 'clean_reimport_triangles': verification['glb_clean_scene_reimport']['triangles'],
                     'mesh_nodes': glb['mesh_nodes'], 'glb_nodes': len(glb['nodes']), 'material_primitives': glb['material_primitives'],
                     'materials': len(glb['materials']), 'glb_vertices_including_seams': sum(obj['vertices'] for obj in glb['objects']),
                     'bounds_transformed_rest_game': glb['transformed_rest_bounds_game'],
                     'conservative_dynamic_envelope_game': {'min': [-2.096127, -2.096127, -.380001], 'max': [2.096127, 2.096127, .315001],
                                                           'note': 'shell radius2.045 * max pulse1.025, core/shape bounded inside; front/back unchanged; all-angle envelope, not every corner simultaneously occupied'},
                     'textures': glb['textures'], 'images': glb['images'], 'animations': glb['animations'],
                     'blend_packed_state': verification['blend_packed_state'], 'per_mesh': glb['objects']},
    'budget': {'triangle_target': 1500, 'triangle_ceiling': 2500, 'primitive_ceiling': 3, 'glb_bytes_ceiling': 524288,
               'texture_atlas': 'None; optional <=512 atlas not used', 'all_ceilings_pass': True},
    'baseline_measured': baseline, 'clearance': verification['clearance'],
    'source_contract': {'color': '0x45e0ff', 'label': 'SHIELD', 'score': 250, 'pickup_radius': 2.2,
                        'collection_center_distance_with_player': 3.7, 'magnet_distance': 22, 'despawn_behind': 55,
                        'timed_lifetime': None, 'hard_max_live_instances': None, 'random_phase_unchanged': True,
                        'velocity_Vector3_retained': True, 'camera_quaternion_copy_unchanged': True,
                        'detach': 'N/A', 'charge': 'N/A', 'full_samples': 'evidence/source-contract.json'},
    'ownership_harness': contract['importedAdapterOwnershipHarness'], 'readability': readability,
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
