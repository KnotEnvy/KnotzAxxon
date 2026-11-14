"""Finalize metadata, copy only deliverables, hash all files, make INITIAL read-only.
Run once, only after inspecting rendered evidence. Never modifies an existing INITIAL.
"""
import json,hashlib,shutil,os,sys,datetime,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
MINE=ROOT.parent
REPO=Path(os.environ.get('KX_REPO',Path(__file__).resolve().parents[4]))
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
read=lambda p:json.loads((ROOT/p).read_text())
def main():
    assert '--evidence-viewed' in sys.argv,'Inspect images before freeze; this flag records completion of implementation inspection only.'
    initial=MINE/'initial';stage=MINE/'staging-initial';assert not initial.exists() and not stage.exists()
    glb=read('measurements/glb-independent.json');verify=read('measurements/blender-verification.json');source=read('measurements/source-contract.json');ownership=read('measurements/ownership-verification.json');renders=read('evidence/render-index.json')
    assert len(renders)==24 and len({x['file'] for x in renders})==24
    for r in renders:
        p=ROOT/'evidence'/r['file'];assert p.exists() and p.stat().st_size>1000
        assert p.read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
    assert glb['visibleTriangles']==1940 and glb['hiddenTriangles']==20 and glb['visibleMaterialPrimitives']==3 and glb['bytes']==145880
    assert verify['countsAndTransformedBoundsMatch'] and ownership['passed'] and source['oneTimeWarningVerified']
    assert all(x['intersectingTrianglePairs']==0 for x in verify['lampClearanceSamples'])
    assert len(list((ROOT/'evidence').glob('*.png')))==33
    assert source['sourceCommit']=='ee221ad3e05cd66292fe02b71b50f513696bdda2'
    assert all(sha(REPO/p)==h for p,h in source['sourceHashes'].items()),'Production source changed since measurement'
    binding={
      'mine':{'bind':'authored root under instantiate scene, then Enemy.group','pivotGame':[0,0,0],'owner':'Enemy._importedRoot / disposeModel','motion':'all nodes inherit Enemy.group tumble and bob'},
      'core':{'bind':'Enemy.core','material':'MN_Armor','visible':True,'triangles':420,'owner':'instance-cloned geometry/material','motion':'rigid root only'},
      'contacts':{'bind':'rigid geometry, no independent animation','material':'MN_ContactMetal','visible':True,'triangles':1280,'owner':'instance-cloned geometry/material','motion':'rigid root only'},
      'lamp':{'bind':'Enemy.lamp','material':'MN_Danger -> mats.neon(0xff3d55,3.2)','visible':True,'triangles':240,'pivotGame':[0,0,0],'scaleRange':[.94,1.06],'owner':'cloned geometry via disposeModel; replaced cloned material retained in modelOwnedMaterials; cached neon owned by Materials','motion':'uniform scale, rigid root tumble'},
      'flashMesh':{'bind':'Enemy.flashMesh; assign Enemy.flashMat','material':'MN_FlashPlaceholder -> instance additive white MeshBasicMaterial','visible':False,'triangles':20,'pivotGame':[0,0,0],'authoredScale':1.2,'owner':'cloned geometry and placeholder via disposeModel; flashMat via Enemy.dispose only','motion':'rigid root; visibility flash>0, opacity flash*.75','caution':'GLB visibility must be set false before first frame. Do not call _addFlashShell or multiply scale again.'},
      'axis-game-up-Y':{'bind':'nonrendering axis proof only','gamePosition':[0,1,0]},
      'axis-game-forward-Z':{'bind':'nonrendering axis proof only','gamePosition':[0,0,1]},
      'axis-game-right-X':{'bind':'nonrendering axis proof only','gamePosition':[1,0,0]}}
    node_map={'axes':{'game':'+Y up, +Z forward, +X right','blender':'+Z up, -Y forward','constructionMap':'(x,y,z) game -> (x,-z,y) Blender','rotation':'Three XYZ = Rx @ Ry @ Rz; evidence explicitly converts matrices'},'hierarchy':[{**n,'runtime':binding[n['name']]} for n in glb['nodes']],'materials':glb['materials'],'integrationRecipe':'source/runtime_binding_recipe.js','adapterIntegrated':False,'ownershipFixture':'measurements/ownership-verification.json','noTextureOwnership':'zero textures / atlases','detach':'N/A','weaponShotOrigins':'N/A'}
    (ROOT/'node-material-map.json').write_text(json.dumps(node_map,indent=2)+'\n')
    assetfiles={f'assets/{n}':{'bytes':(ROOT/'assets'/n).stat().st_size,'sha256':sha(ROOT/'assets'/n)} for n in ['mine.blend','mine.glb']}
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    manifest={'asset':'floating-mine','release':'INITIAL','status':'pending_deferred_opus_review','frozenAtUTC':now,'finalArtAcceptance':False,'formalReviewCount':0,'formalReviewFixPassCount':0,'helpersOrDelegation':False,'requestedModelOptions':{'provider':'codex','model':'gpt-6.1-sol','reasoningEffort':'xhigh','speed':'available speed; no exposed fast-mode toggle used or claimed'},'actualAgentRuntime':{'provider':'codex','model':'gpt-6.1-sol','reasoningEffort':'xhigh'},'environment':{'host':'NitroBliss','OS':'native Linux','blenderVersion':'5.2.1 LTS','blenderBuild':'9e2066aef7ef','engine':'BLENDER_EEVEE','renderThreads':4,'LP_NUM_THREADS':4,'renderSamples':32,'colorManagement':'AgX / Medium High Contrast / exposure 0','runtimeBinary':'/home/knotzuni/code/KnotzAxxon-archive/2026-11-14/contest-entry/.cache/blender-5.2.1-linux-x64/blender','runtimeSource':'Only runtime wrapper copied from asset-work/drone/blender.sh; no geometry/generator copied','diagnostics':['Software EGL BAD_MATCH warnings preceded successful EEVEE PNGs','Read-only extension cache and material API deprecation warnings; verification completed','One render process ended SIGTERM; missing frames resumed in bounded batches']},'sourceCommit':source['sourceCommit'],'files':assetfiles,'geometry':{k:v for k,v in glb.items() if k not in ['nodes','materials']},'sourceContract':source['contract'],'densityProxy':source['density'],'lampClearance':{'samples':61,'scaleRange':[.94,1.06],'triangleIntersections':0,'minimumSampledVertexSurfaceGap':min(x['minimumSampledVertexToSurfaceDistance'] for x in verify['lampClearanceSamples']),'analyticBounds':verify['analyticLampSeparation'],'limits':'finite geometry samples; not live gameplay proof'},'radialBounds':{'maxVisibleVertexRadius':verify['maxVisibleVertexRadius'],'collisionRadius':1.9,'fullTumbleSamples':len(verify['tumbleSamples'])},'resources':{'externalTextures':0,'atlases':0,'editableEmbeddedBlend':True,'glbAnimationTracks':0,'visibleMaterials':3,'hiddenMaterials':1},'verification':{'savedBlendReopened':True,'cleanSceneGlbReimported':True,'independentBinaryCountsBoundsTransformsAxes':True,'actualSourceUpdateMethodsExecuted':True,'actualCameraRigComputeExecuted':True,'actualLevelDensityScanExecuted':True,'ownershipCpuFixturePassed':True,'realGLTFLoaderGameplayIntegration':False,'formalReview':False},'evidence':{'individualFullRenders':24,'halfResolutionGameplayPNGs':6,'contactSheets':3,'totalPNGs':33,'commonNeutral':{'cameraGame':[-16,24,-30],'target':[0,0,0],'orthoSpanHorizontal':14,'key':[-12,22,-12],'fill':[14,12,8]},'gameplay':'offline Classic/Modern/Chase source rig reconstruction with shipped player at shared WORLD scale, altitude3/22, no per-asset normalization','viewed':'All full renders via contact sheet, small gameplay sheet, overview and representative original PNGs; implementation inspection only'},'referenceOnly':{'path':'public/models/player.glb','sha256':sha(REPO/'public/models/player.glb'),'incorporatedInMineGeometry':False},'preFreezeConstructionCorrections':['Corrected coordinate permutation scoping','Fitted open warning-window support rails for full-tumble readability; reduced contact and vent tessellation','Used explicit Three XYZ rotation matrices for action evidence'],'pending':['deferred Opus formal review/polish on SuperBeast','orchestrator adapter integration and live gameplay/GLTFLoader checks','receiver-side archive verification'],'limitations':['INITIAL only: no formal review or final art approval','Offline Blender evidence is not live gameplay proof','Blender emissive PBR/ambient world approximates source unlit neon/hemisphere/PMREM; no sky/fog/postprocessing/HUD/streaming reconstruction','Source update and camera methods use vector/audio stubs, not installed Three; baseline topology analytically measured from source parameters','Layout density24 is a proxy for355-unit windows, seeds1..100, loops0,1,3; not live maximum or measured performance','Audio warning callback verified, no audio capture','Separate charge/weapon aiming/shot origins/detach are N/A; ordinary explosion and no burning ground wreck retained','Flash shell requires explicit runtime hide and per-instance flash material before first frame'],'scope':'Only assigned asset-work/mine output; no production integration, git mutations, commit, push, publish, checkout, worktree or helper'}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    stage.mkdir()
    for folder,patterns in [('assets',['mine.blend','mine.glb']),('source',['*.py','*.js','*.mjs','*.sh']),('measurements',['*.json','*.txt']),('evidence',['*.png','*.json'])]:
        (stage/folder).mkdir()
        for pattern in patterns:
            for p in sorted((ROOT/folder).glob(pattern)):shutil.copy2(p,stage/folder/p.name)
    for name in ['README.md','manifest.json','node-material-map.json']:shutil.copy2(ROOT/name,stage/name)
    (stage/'evidence/logs').mkdir()
    for n in ['build.log','verify.log','render.log']:shutil.copy2(MINE/'logs'/n,stage/'evidence/logs'/n)
    files=sorted(p for p in stage.rglob('*') if p.is_file())
    (stage/'SHA256SUMS').write_text(''.join(sha(p)+'  '+p.relative_to(stage).as_posix()+'\n' for p in files))
    for p in stage.rglob('*'):
        if p.is_file():p.chmod(0o444)
    for p in sorted((p for p in stage.rglob('*') if p.is_dir()),reverse=True):p.chmod(0o555)
    stage.chmod(0o555);stage.rename(initial)
    print(json.dumps({'initial':str(initial),'fileCount':len(files)+1,'assets':assetfiles,'status':manifest['status']},indent=2))
if __name__=='__main__':main()
