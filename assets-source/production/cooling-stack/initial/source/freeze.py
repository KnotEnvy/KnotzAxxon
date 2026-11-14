import datetime
import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((ROOT/'evidence'/name).read_text())


def main():
    assert not (ROOT/'SHA256SUMS').exists(), 'Initial is already frozen; do not mutate it'
    generation, binary, verification = read('generation.json'),read('binary-audit.json'),read('blender-verification.json')
    proof, renders, inspection = read('streaming-proof.json'),read('render-settings.json'),read('inspection.json')
    assert all(report['status'] == 'PASS' for report in (binary,verification,proof))
    assert inspection['formalReviewRounds'] == inspection['formalFixRounds'] == 0
    for entry in inspection['directlyViewedPNGs']:
        assert sha256(ROOT/'evidence'/entry['file']) == entry['sha256']
    assert len(list((ROOT/'evidence').glob('world-*-h*-heat-*.png'))) == 24
    assert len(list((ROOT/'evidence').glob('structure-*.png'))) == 6
    material_map = {
        'CS_Hull':{'bucket':'hull','sharedMaterial':'Materials.hull','linearVertexTint':'Per-face source warm hull/service tint, source Batch AO/lift convention','UV':'world dominant-axis box projection /4','maps':'Existing hull map, normalMap, roughnessMap; retained shared ownership'},
        'CS_Dark':{'bucket':'dark','sharedMaterial':'Materials.darkMetal','linearVertexTint':'Per-face linear tint multiplied by shared material linear color 0x3a4a5e','UV':'world dominant-axis box projection /3','maps':'No new textures; original shared darkMetal response'},
        'CS_Heat':{'bucket':'neon','sharedMaterial':'Materials.neonVertex','linearVertexTint':'linear(0xff6a2a)*1.2','UV':'world dominant-axis box projection /8','animationAttribute':'aAnim=[3,0.4,originalPhase]','clock':'Existing shared Materials.clock uniform; no GLB animation'},
    }
    runtime_map = {'schema':'cooling-stack-runtime-map-v1','materialMap':material_map,
        'nodes':{'CS_CoolingStack':'One rest-height9 merged mesh, identity node transform; prepared parametric template is runtime authority',
                 'CS_HeatSurfacePivot':'Reference game (0,h+.19,0); original 2.7x.05x2.7 cue base',
                 'CS_SteamOrigin':'Reference game (0,h+.4,0); never create an emitter from this node'},
        'heightDeformation':{'restHeight':9,'range':[7,11],'rule':'gameY=restY+(sourceHeight-9)*_CS_HEIGHT','horizontal':'Constant; half-footprint2.08'},
        'editableParts':generation['parts'],'ownership':{'startup':'prepare typed templates before any chunk build','chunk':'Only merged Batch BufferGeometry; retired once by Fortress._disposeChunk','shared':'Materials/textures retained until application shutdown; template typed arrays until adapter shutdown'},
        'RNG':'height, phase, then unchanged emitter callback own draw; dynamic caller loop untouched','productionEdits':False}
    (ROOT/'runtime-map.json').write_text(json.dumps(runtime_map,indent=2)+'\n')
    source_files = ['src/world/Fortress.js','src/world/Level.js','src/core/Utils.js','src/core/Collision.js','src/render/GeoUtils.js','src/render/Materials.js','src/game/CameraRig.js','src/game/Game.js','src/core/FlightCamera.js','src/core/Settings.js','src/render/ImportedModels.js','src/entities/Player.js','public/models/player.glb']
    manifest = {'asset':'reactor-cooling-stack','revision':'initial','review_status':'pending_deferred_opus_review','formal_review_rounds':0,'formal_fix_rounds':0,
        'implementation_validation_only':True,'helpers_used':0,'claude_retries':0,'frozen_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_commit':'ee221ad3e05cd66292fe02b71b50f513696bdda2','scope':'asset-work/cooling-stack/ only; no production integration',
        'execution':{'machine':'NitroBliss','model':'gpt-6.1-sol','reasoning_effort':'xhigh','authorized_speed':'available speed','speed_tier_observability':'No separately exposed speed-tier setting; no claim of an unobserved tier','runtime':'T3 Code through Codex harness'},
        'blender':{'version':generation['blender'],'build_hash':generation['buildHash'],'platform':'native Linux x64','engine':'BLENDER_EEVEE','render_threads':4,'software_rasterizer_threads':4,'offline_samples':16,'view_transform':'AgX'},
        'asset_metrics':{'evaluated_triangles':460,'maximum_source_height_triangles':460,'material_primitives':3,'triangles_per_bucket':generation['trianglesPerBucket'],'glb_bytes':binary['bytes'],'new_textures':0,'animations':0,'transformed_rest_bounds':binary['transformedRestBoundsGameYUp'],'height_endpoints':binary['deformedEndpointBounds'],'designed_half_footprint':2.08,'minimum_lane_gap':2.42},
        'source_metrics':{'measured_seed_triangles':[entry['triangles'] for entry in read('source-measurement.json')['seeds']],'source_method_rng_draws':2,'emitter_wrapper_additional_draws':1,'caller_loop':'reevaluated rng.int(1,2), unchanged','source_placements':'X20.5..25; Zchunk+10..86, unchanged'},
        'proof':{'paired_full_chunk_cases':len(proof['chunkCases']),'paired_selected_stack_calls':sum(entry['stacks'] for entry in proof['chunkCases']),'full_rng_draws_compared_per_implementation':sum(entry['rngDraws'] for entry in proof['chunkCases']),'height_samples':401,'shader_clock_samples':1025,'downstream_buffers':'exact outside selected cooling geometry','surface_semantics':'exact original records when captured','real_gpu_test':False,'receiver_verification':'orchestrator responsibility'},
        'core_sha256':{name:sha256(ROOT/name) for name in ['cooling-stack.blend','cooling-stack.glb','cooling-stack.template.json']},
        'source_reference_sha256':{name:sha256(REPO/name) for name in source_files},'PNG_count':len(list((ROOT/'evidence').glob('*.png'))),'limitations':renders['limitations']+proof['limitations'],
        'freeze':'SHA256SUMS covers every content file except itself. Content and directories read-only after sealing. Archive and sender receipt outside initial.'}
    assert manifest['source_reference_sha256']['src/world/Fortress.js'] == read('source-measurement.json')['sourceSHA256']
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    entries = []
    allowed = {'.blend','.glb','.json','.md','.mjs','.py','.png'}
    for file in sorted(ROOT.rglob('*')):
        assert not file.is_symlink()
        if file.is_file():
            assert file.suffix in allowed, f'Unexpected transfer content: {file}'
            entries.append(f'{sha256(file)}  {file.relative_to(ROOT).as_posix()}')
    (ROOT/'SHA256SUMS').write_text('\n'.join(entries)+'\n')
    for file in ROOT.rglob('*'):
        if file.is_file():
            file.chmod(0o444)
    for directory in sorted([directory for directory in ROOT.rglob('*') if directory.is_dir()],reverse=True):
        directory.chmod(0o555)
    ROOT.chmod(0o555)
    print(json.dumps({'frozen':str(ROOT),'contentFiles':len(entries),'SHA256SUMS_sha256':sha256(ROOT/'SHA256SUMS'),'core_sha256':manifest['core_sha256']},indent=2))


if __name__ == '__main__':
    main()
