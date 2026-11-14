from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess

OUT=Path(__file__).resolve().parents[1]
REPO=OUT.parents[2]


def read(relative):
    return json.loads((OUT/relative).read_text())


def digest(filename):
    return hashlib.sha256(filename.read_bytes()).hexdigest()


source=read('evidence/source-measurements.json')
binary=read('evidence/independent-binary-audit.json')
runtime=read('evidence/runtime-validation.json')
blender=read('evidence/blender-reopen-clean-reimport.json')
generator=read('evidence/generator-determinism.json')
visual=read('evidence/visual-inspection.json')
build=read('evidence/build-settings.json')
assert binary['status']==runtime['status']==blender['status']=='PASS'
assert generator['secondRunIdentical']
assert visual['viewedByImplementationAgent'] and len(visual['viewedFiles'])>=7
assert digest(OUT/'asset/fortress-bunker.glb')==binary['sha256']
assert digest(OUT/'asset/bunker-geometry.json')==generator['sha256']
for name,expected in blender['inputSHA256'].items():
    assert digest(OUT/'asset'/name)==expected
for entry in visual['viewedFiles']:
    assert digest(OUT/entry['file'])==entry['sha256']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()=='ee221ad3e05cd66292fe02b71b50f513696bdda2'
assert not subprocess.check_output(['git','diff','--name-only'],cwd=REPO,text=True).strip()
now=datetime.now(timezone.utc).isoformat()
manifest={
    'schema':1,
    'asset':'Fortress._bunker armoured service bunker passive scenery',
    'delivery':'INITIAL / best effort',
    'status':'pending_deferred_opus_review',
    'formalReviewRounds':0,
    'formalFixRounds':0,
    'opusReviewPolish':'DEFERRED',
    'implementationAgent':{'model':'gpt-6.1-sol','reasoningEffort':'xhigh','harness':'Codex in T3 Code','speedSetting':'Inherited available speed; no explicit speed override exposed or invented.','helpers':0,'alternateProviderRetries':0},
    'host':platform.node(),
    'frozenUTC':now,
    'sourceCommit':'ee221ad3e05cd66292fe02b71b50f513696bdda2',
    'productionFilesChanged':[],
    'scope':'Only proposed passive _bunker geometry recipe; original caller/gameplay/collision/camera untouched; no production integration.',
    'sourceMeasurements':{'triangles':source['isolated']['triangles'],'buckets':source['isolated']['buckets'],'bounds':source['isolated']['bounds'],'rngDraws':1,'density':source['density'],'placementContract':source['contract'],'preconstructionBudget':source['budgetBeforeConstruction'],'measurementUTC':datetime.fromtimestamp((OUT/'evidence/source-measurements.json').stat().st_mtime,timezone.utc).isoformat()},
    'geometry':{'triangles':binary['triangles'],'glbPrimitives':binary['primitives'],'runtimeBuckets':3,'bucketTriangles':read('asset/part-runtime-map.json')['buckets'],'evaluatedBounds':blender['reopenedBlend']['transformedGameBounds'],'independentBinaryTransformedBounds':binary['transformedBounds'],'sourceEnvelopePreserved':True,'minimumWorldXAtCallerMinimum':16.05,'minimumLaneClearance':.05,'newTextures':0,'glbBytes':binary['bytes'],'triangleCeiling':900,'targetTriangleRange':[400,650],'glbByteCeiling':524288,'editableNamedParts':52,'generatedDataSHA256':generator['sha256']},
    'runtime':{'module':'source/BunkerRecipe.mjs','loadGLB':'createBunkerRecipeFromGLTF(gltf.scene), once before streaming; do not mount scene','alternateJSON':'createBunkerRecipe(data), once','stamp':'recipe.stamp(actualBatch,rng,x,z,theme)','phaseDraws':1,'aAnim':[3,.3,'exact original phase draw'],'gain':1.1,'hue':'shared theme.warm; citadel #ffb43a, gauntlet #ff6a3a','materials':{'hull':'existing mapped materials.hull','dark':'existing unmapped materials.darkMetal','neon':'existing shared materials.neonVertex'},'perPropRoots':0,'perPartRuntimeRoots':0,'materialClones':0,'perFrameRebuilds':0,'captureSurfaces':'Exact source neon/dark records and arithmetic/order when enabled','retirement':'Actual chunk-owned Batch merged geometry disposed once; loader templates and shared materials/textures survive chunks; idempotent loader-template/GLB-preview-resource shutdown; existing shared resources remain managed by their original owners.'},
    'proof':{'sourceChunksCompared':len(runtime['chunks']),'isolatedBothTemplatePaths':len(runtime['isolated']),'finiteSourceCameraProbes':read('evidence/camera-lighting-probes.json')['probeCount'],'nonBunkerBuffers':'Bitwise identical for all compared attributes after excising only bunker spans','glbVsJSONMaxAbsoluteBufferErrors':runtime['glbMaxAbsoluteError'],'lifecycle':runtime['lifecycle'],'blenderReopen':'PASS','cleanGLBReimport':'PASS','independentBinaryAudit':'PASS; not Khronos Validator','viewedEvidence':'evidence/visual-inspection.json'},
    'authoring':build,
    'limits':['Offline EEVEE/source-lighting approximations only; CPU materials/DataTexture/deck doubles explicitly labeled.','No live WebGL/GPU/FPS/hitch/occlusion verification, no final acceptance claim.','Source procedural hull textures, PMREM, hemisphere, fog, post-FX and rim shaders are not reproduced in PNGs.','Packed-normal quantization in Blender GLB changes normal components by at most the recorded ~4.9621e-5; no position/UV/color/aAnim buffer error.','Production integration, receiver verification, formal Opus polish and final adoption are deferred to the orchestrator.'],
    'assetHashes':{name:digest(OUT/'asset'/name) for name in ['fortress-bunker.glb','fortress-bunker.blend','bunker-geometry.json','part-runtime-map.json']},
    'freeze':{'policy':'Read-only initial snapshot; no writes after final SHA256SUMS. Archive and sender receipts outside initial.','checksums':'Every regular file under initial except SHA256SUMS itself; no hidden-file omission.','transferAllowlist':['asset','source','reference source snapshots','evidence','manifest.json','README.md','SHA256SUMS'],'excluded':['runtime','tools','libs','cache','temp','node_modules','external wrapper','unrelated asset work']},
}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
files=sorted(path for path in OUT.rglob('*') if path.is_file() and path!=OUT/'SHA256SUMS')
for path in OUT.rglob('*'):
    assert not path.is_symlink()
    assert not any(part in {'.runtime','node_modules','.cache','__pycache__','tools','libs','temp','work'} for part in path.relative_to(OUT).parts)
checksums=''.join(f'{digest(path)}  {path.relative_to(OUT).as_posix()}\n' for path in files)
(OUT/'SHA256SUMS').write_text(checksums)
for line in checksums.splitlines():
    expected,relative=line.split('  ',1)
    assert digest(OUT/relative)==expected
print(json.dumps({'status':'FROZEN_CONTENT_READY','filesHashed':len(files),'assetHashes':manifest['assetHashes'],'frozenUTC':now},indent=2))
