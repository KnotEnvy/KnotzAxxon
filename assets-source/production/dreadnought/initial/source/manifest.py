import datetime
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[2]


def load(name):
    return json.loads((ROOT/name).read_text())


def digest(filename):
    return hashlib.sha256(filename.read_bytes()).hexdigest()


binary=load('checks/glb-independent.json')
runtime=load('checks/runtime-fixture.json')
modules=load('asset/module-map.json')
source=load('checks/source-contract.json')
geometry=load('checks/geometry-clearance-seams.json')
reopen=load('checks/blender-reopen-reimport.json')
rigs=load('checks/render-rigs.json')
references=load('checks/shipped-reference-measurements.json')
sources=['src/world/Fortress.js','src/world/Level.js','src/core/Utils.js','src/core/Settings.js','src/game/CameraRig.js','src/core/FlightCamera.js','src/render/Materials.js','src/render/ImportedModels.js','src/render/Sky.js',
         'assets-source/fighter/blender/build_player.py','assets-source/fighter/manifest.json',
         'assets-source/sentinel/build/build_sentinel.py','assets-source/sentinel/manifest.json',
         'assets-source/ground/scripts/build_assets.py','assets-source/ground/contest-manifest.json',
         'assets-source/supplies/scripts/build.py','assets-source/supplies/manifest.json']
manifest={
    'schema':1,'asset':'derelict-dreadnought','assignment':'sector2 scenery landmark only',
    'status':'initial_unchanged','review_status':'pending_deferred_opus_review',
    'formal_reviews':0,'formal_review_fix_passes':0,'final_acceptance':False,
    'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'baseline_commit':'ee221ad3e05cd66292fe02b71b50f513696bdda2',
    'builder':{'provider':'Codex','model':'gpt-6.1-sol','reasoningEffort':'xhigh','speed':'available/default; no separate speed override',
               'delegated_helpers':0,'blender_platform':'native Linux','blender':modules['blender'],'build_hash':modules['blender_build_hash'],
               'engine':'BLENDER_EEVEE','render_threads':4,'eevee_samples':32},
    'scope':{'production_integration':False,'production_files_modified':False,'ordinary_void_props_included':False,
             'geometry_reuse':'Original generated geometry only; reference vocabulary/axis/scale read from selected shipped assets. Shipped player appears only in offline evidence.',
             'damage':'N/A','detach':'N/A','retraction':'N/A','launch_mechanics':'N/A','colliders':'none added','targeting':'unchanged','cover':'none added'},
    'files':{name:{'path':'asset/'+name,'bytes':(ROOT/'asset'/name).stat().st_size,'sha256':digest(ROOT/'asset'/name)} for name in ['dreadnought.glb','dreadnought.blend','module-map.json']},
    'geometry':{'triangles_authored':modules['triangles_before_section_clipping'],'triangles_evaluated':reopen['saved_blend_reopened']['triangles'],
                'triangles_exported':binary['triangles'],'exported_vertices':binary['vertices'],
                'glb_material_primitives_full_landmark':binary['material_primitives'],'max_chunk_merged_landmark_primitives':max(chunk['primitives'] for chunk in runtime['chunks']),
                'material_count':len(binary['materials']),'texture_count':binary['textures'],'bounds_world_rest':binary['bounds'],
                'size_world':[binary['bounds']['max'][axis]-binary['bounds']['min'][axis] for axis in range(3)],
                'body_length':820,'engine_overhang':9,'start':3400,'body_end':4220,'end_including_engines':4229,
                'all_named_construction_parts':len(modules['parts']),'unique_section_bucket_nodes':len(modules['sections']),
                'hierarchy':'DN_DERELICT_DREADNOUGHT__game_Y_up_Z_travel / DN_SECTION_0035__Z3360 ... DN_SECTION_0044__Z4224 / DN_####__hull|dark|neon',
                'complete_part_hierarchy_material_map':'asset/module-map.json'},
    'budget':{**source['budget'],'justification':source['rationale'],'all_pass':True,
              'max_chunk_triangles':max(chunk['triangles'] for chunk in runtime['chunks']),
              'max_chunk_index':max(runtime['chunks'],key=lambda chunk:chunk['triangles'])['index'],
              'ordinary_chunk_max_triangles_excluding_bridge_stern':max(chunk['triangles'] for chunk in runtime['chunks'] if chunk['index'] not in [41,42,43,44]),
              'special_bridge_chunks':{str(chunk['index']):chunk['triangles'] for chunk in runtime['chunks'] if chunk['index'] in [41,42]},
              'special_stern_chunks':{str(chunk['index']):chunk['triangles'] for chunk in runtime['chunks'] if chunk['index'] in [43,44]}},
    'chunks':runtime['chunks'],'visible_resident_samples':runtime['quality'],
    'coordinate_contract':{'game':'X lateral, +Y up, +Z travel','blender':'(x,-gameZ,gameY)','unit_scale':1,'object_normalization':False,
                           'lane_x':[-16,16],'lane_y':[1.3,25],'clearance_conflicts':len(geometry['triangle_aabb_clearance_conflicts'])},
    'rng':{'burner':'source/source_contract.mjs#burnOriginalDreadnought','strategy':'Reproduce original branch-conditioned draws at original call site; authored mesh/cues use no game RNG.',
           'source_draw_state_comparisons':source['rng']['directComparisons'],'downstream_complete_void_buffer_hash_comparisons':source['rng']['downstreamComparisons'],
           'passed':source['rng']['passed'],'full_report':'checks/source-contract.json'},
    'animation':{'transport':'GLB _ANIM VEC3 -> Batch neon aAnim; raw GLTF is not shader preservation',
                 'materials':{'DN_hull':'Materials.hull','DN_dark':'Materials.darkMetal','DN_neon':'Materials.neonVertex'},
                 'clock':'Existing Materials.clock identity feeds uLightTime; never cloned per landmark',
                 'spin':'N/A static wreck; no authored aPivot/aSpin. Original unrelated rock attributes/clock unchanged.',
                 'cue_modes':[1,3,4],'cpu_sample_seconds':20,'cpu_sample_hz':60,'gpu_shader_compilation_tested':False,
                 'exported_cue_tuples':binary['cue_tuples'],'runtime_samples':'checks/runtime-fixture.json'},
    'streaming':{'prototype':'source/runtime_fixture.mjs#appendDreadnought','uses_actual_Batch':True,
                 'section_selection':'Only transformed section Z intersections with active96-unit chunk; global sections35..44, including engine overflow.',
                 'material_cloning':False,'per_part_draws':False,'per_frame_rebuild':False,'whole_landmark_in_every_chunk':False,
                 'ordinary_props':'Unchanged original _voidProps after exact RNG burn; no duplicate landmark source decorations.',
                 'ownership':runtime['ownership'],'offset_checks':runtime['shifted']},
    'validation':{'independent_glb_parse':True,'saved_blend_reopened':True,'factory_clean_glb_reimport':True,
                  'section_boundary_matches':geometry['section_seams']['matching_source_triangle_boundary_sets'],
                  'section_boundary_mismatches':len(geometry['section_seams']['mismatches']),'degenerate_triangles':geometry['degenerate_triangles'],
                  'scope':'Initial technical self-checks, not formal reviews/fix passes or acceptance.',
                  'live_game_integration_tested':False,'gpu_draw_calls_measured':False,'frame_timing_measured':False},
    'evidence':{'render_count':len(rigs['renders']),'files':[record['file'] for record in rigs['renders']],
                'same_scale_player':'Original shipped player.glb at root scale1 in every scene; tight detail frames can crop it. All source game rigs retain visible player.',
                'source_camera_modes':['Classic','Modern','Chase'],'altitudes_sampled':[1.3,9,25],
                'motion_cue_times':[0,1.25],'type':'Offline EEVEE images with appended limitation labels; no geometry/framing/exposure post-edit.',
                'render_limitations':rigs['renders'][0]['limitations'],'inspection_record':'checks/visual-inspection.json'},
    'references':references,'source_read_sha256':{name:digest(REPO/name) for name in sources},
    'freeze':{'tree':'initial/','checksum_file':'SHA256SUMS','coverage':'Every content file except SHA256SUMS itself, including assets, scripts, evidence, reports, README and this manifest.',
              'archive':'Outside frozen initial; initial-only archive includes no runtime, sysroot, libraries, Blender, tools, caches, temp files, credentials or unrelated asset work.',
              'transfer':'Authorized Windows Tailscale CLI file cp to100.112.66.64 only; archive path converted by wslpath -w; sender receipt outside frozen tree.',
              'receiver_verification':'Orchestrator responsibility, not claimed by sender.'},
    'limitations':['No production adapter is installed. The provided CPU prototype must be adapted at the existing source call site.',
                   'Reference source envelope measured across four requested seeds, not every seed.',
                   'Static glTF viewers do not reproduce original custom shader clocks; restore _ANIM as shown.',
                   'Offline images omit source textures, sky, fog, bloom, active targets, asteroids, HUD and real rendering performance.',
                   'This is intentionally sparse fitted geometry, not a texture-damage/photoreal surface treatment.',
                   'Open ruin topology is intentional; not watertight, not collision/cover geometry.',
                   'Initial only; Opus review and polish explicitly deferred.']
}
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('MANIFEST',manifest['geometry']['triangles_exported'],manifest['files']['dreadnought.glb']['sha256'])
