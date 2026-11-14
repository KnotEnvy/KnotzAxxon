"""Freeze only the authored asset, sources and evidence. Never bundle runtime tools."""
import json,hashlib,shutil,os,datetime,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;WORK=HERE.parent;ROOT=WORK.parent;REPO=ROOT.parents[1]
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(n):return json.loads((WORK/'evidence/reports'/n).read_text())
def freeze():
    target=ROOT/'initial';assert not target.exists(),'Frozen initial already exists; never overwrite it.'
    audit=load('glb_independent.json');reopen=load('blend_reopen_clearance.json');reimport=load('glb_clean_reimport.json');visual=load('visual_inspection.json');ray=load('shot_visual_ray_probe.json')
    assert all(audit['checks'].values()) and reopen['all_engine_triangle_intersections_zero'] and reimport['bounds_and_counts_match_blend']
    assert visual['inspection_completed'] is True and visual['stage']=='pending_deferred_opus_review'
    assert sha(WORK/'drone.glb')==audit['sha256']
    assert (WORK/'evidence/png/contact_sheet.png').exists() and (WORK/'evidence/png/debug_actual_shot_ray.png').exists()
    target.mkdir()
    for name in ['drone.blend','drone.glb','RUNTIME_BINDINGS.md','REGENERATE.md']:
        shutil.copy2(WORK/name,target/name)
    for directory in ['scripts','evidence']:
        shutil.copytree(WORK/directory,target/directory,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.blend1','*.tmp'))
    refs=['src/entities/Enemies.js','src/render/ImportedModels.js','src/render/Dispose.js','src/game/CameraRig.js','src/core/Settings.js','src/render/Sky.js','src/render/Materials.js','src/core/Engine.js']+['public/models/'+n+'.glb'for n in ['player','sentinel','turret','radar','silo','fuel']]+['assets-source/'+p for p in ['fighter/manifest.json','sentinel/manifest.json','ground/contest-manifest.json','supplies/manifest.json']]
    bb=audit['all_bounds'];baseline={'min':[-2.9223,-.43,-1.9923],'max':[2.9223,.77,1.7135]}
    size=[bb['max'][i]-bb['min'][i]for i in range(3)];old=[baseline['max'][i]-baseline['min'][i]for i in range(3)]
    manifest={'schema_version':1,'asset':'drone','design':'DR-3 broad clipped-shoulder unmanned enemy craft','stage':'pending_deferred_opus_review','frozen_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repository_baseline':'ee221ad3e05cd66292fe02b71b50f513696bdda2','authorization':{'requested_provider':'codex','requested_model':'gpt-6.1-sol','requested_reasoningEffort':'xhigh','requested_speed':'AVAILABLE SPEED; unavailable fast-mode toggle explicitly accepted','executed_provider':'codex','executed_model':'gpt-6.1-sol','executed_reasoningEffort':'xhigh','fast_mode_claimed':False,'helpers_or_delegation':False,'formal_reviews':0,'formal_fix_passes':0,'opus_review_polish':'deferred until SuperBeast free'},'runtime':{'platform':'native Linux on NitroBliss','blender':'5.2.1 LTS','build_hash':'9e2066aef7ef','engine':'BLENDER_EEVEE','render_threads':4,'software_driver_threads_from_existing_wrapper':8,'runtime_tools_excluded':True,'wrapper_sha256':sha(ROOT/'blender.sh')},'files':{name:{'bytes':(target/name).stat().st_size,'sha256':sha(target/name)} for name in ['drone.glb','drone.blend']},'measurements':{'visible':audit['visible'],'hidden_flash':audit['hidden_flash'],'total_exported_triangles_all_scenes':audit['visible']['triangles']+audit['hidden_flash']['triangles'],'rest_bounds_including_hidden_shell':bb,'approximate_procedural_baseline_including_shell':baseline,'size_ratio_to_approximate_baseline':[size[i]/old[i] for i in range(3)],'textures':0,'packed_atlas_count':0,'engine_scale_clearance_min_vertex_proxy':reopen['minimum_engine_to_static_surface_vertex_proxy'],'clearance_samples':reopen['engine_pulse_samples'],'clearance_triangle_intersections':0},'hierarchy':audit['nodes'],'material_map':{'hull':'DR_Hull_Oxide','machinery':'DR_Machinery_Slate','trim':'DR_Trim_Titanium','canopy_and_recesses':'DR_Canopy_Obsidian','dynamic_cue':'DR_Cue_Red_ff3d55','dynamic_emission':'DR_Engine_Amber_ff9a3a','flash':'DR_Flash_White'},'gameplay':{'fast':False,'hp':3,'score':250,'radius':2.2,'root_origin':[0,0,0],'up':'+Y','nose':'+Z','detach':'N/A','mechanics_modified':False,'production_files_modified':False,'integration_performed':False,'flash_template':'scene 1; hide and reparent per RUNTIME_BINDINGS.md','shot_graphics_mismatch_report':'evidence/reports/shot_visual_ray_probe.json','shot_visual_ray_intersections':ray['ray_intersection_count'],'shot_ray_samples':ray['samples']},'verification':{'saved_and_reopened_blend':True,'packed_external_assets':True,'external_assets_present':False,'clean_scene_glb_reimport':True,'independent_binary_glb_audit':True,'counts_and_transformed_bounds_agree':True,'axis_markers_verified':True,'actual_source_motion_and_lead_methods_sampled':True,'png_pixels_inspected':True,'camera_views':'offline reconstructed; not actual gameplay captures','formal_review':False},'density_proxy':{'peak_drone':18,'meaning':'provided layout-window proxy, not live maximum','triangles_at_18':18*audit['visible']['triangles'],'base_primitives_at_18':18*audit['visible']['material_primitives'],'live_profile_required':['moving wings','carrier','boss','actual populations','shadows and flashes','frame time']},'initial_self_corrections':['Moved nozzle vanes outside the full animated thrust-face scale interval after BVH detected intersections','Matched supplied rest scale with fitted belly depth and flash envelope','Added fitted belly service hatch/heat rails after inspecting steep-bank underside','Stored hidden flash template outside default glTF scene because standard glTF has no generic visibility flag','Packed and saved editable scene with flash hidden; no formal review or deferred polish round spent'],'limitations':visual['limitations'],'reference_source_sha256':{p:sha(REPO/p)for p in refs},'freeze':'Immutable initial snapshot. SHA256SUMS hashes every delivered file except itself; archive hash and transfer receipt are adjacent outside this directory.'}
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    files=sorted(p for p in target.rglob('*')if p.is_file())
    (target/'SHA256SUMS').write_text(''.join(f'{sha(p)}  {p.relative_to(target).as_posix()}\n'for p in files))
    # Verify every frozen byte before making the snapshot read-only.
    for line in (target/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1);assert sha(target/name)==digest
    for p in target.rglob('*'):
        if p.is_file():p.chmod(0o444)
    for p in sorted([p for p in target.rglob('*')if p.is_dir()],key=lambda p:len(p.parts),reverse=True):p.chmod(0o555)
    target.chmod(0o555)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');archive=Path('/tmp')/f'knotzaxxon-drone-initial-{stamp}.tar.gz'
    with tarfile.open(archive,'w:gz')as tf:tf.add(target,arcname='drone-initial',recursive=True)
    digest=sha(archive);Path(str(archive)+'.sha256').write_text(f'{digest}  {archive.name}\n')
    with tarfile.open(archive)as tf:
        names=tf.getnames();assert all(n=='drone-initial'or n.startswith('drone-initial/')for n in names)
        assert not any(k in n for n in names for k in ['/node_modules/','/.runtime/','/sysroot/','/blender.sh'])
        for p in files:
            extracted=tf.extractfile('drone-initial/'+p.relative_to(target).as_posix());assert hashlib.sha256(extracted.read()).hexdigest()==sha(p)
    receipt={'stage':'pending_deferred_opus_review','initial_directory':str(target),'archive':str(archive),'archive_sha256':digest,'archive_bytes':archive.stat().st_size,'archive_entries':len(names),'file_hash_count_excluding_SHA256SUMS':len(files),'glb_sha256':sha(target/'drone.glb'),'blend_sha256':sha(target/'drone.blend'),'hashes_verified':True,'archive_members_verified':True,'transfer_status':'not_yet_attempted','destination':'100.112.66.64:','expected_autoreceive_directory':'SuperBeast /mnt/c/Users/Knotz2/Downloads/'}
    (ROOT/'transfer_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt,indent=2))
if __name__=='__main__':freeze()
