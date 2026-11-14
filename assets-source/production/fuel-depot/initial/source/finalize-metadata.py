import hashlib
import json
import platform
import socket
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[2]
read=lambda name:json.loads((ROOT/name).read_text())
write=lambda name,value:(ROOT/name).write_text(json.dumps(value,indent=2)+'\n')
digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
generation=read('evidence/generation.json')
binary=read('evidence/binary-audit.json')
runtime=read('evidence/runtime-proof.json')
reopen=read('evidence/blender-reopen-reimport.json')
measurement=read('evidence/source-measurement.json')
inspection=read('evidence/inspection.json')
assert all(digest(REPO/name)==value for name,value in measurement['sourceHashes'].items())
assert binary['passed'] and runtime['passed'] and reopen['passed']
assert inspection['actuallyViewed'] and inspection['formalReviews']==0
references=[]
for path in sorted((REPO/'public/models').glob('*.glb')):
    raw=path.read_bytes()
    size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size])
    references.append(dict(path=str(path.relative_to(REPO)),sha256=digest(path),bytes=len(raw),meshes=len(doc.get('meshes',[])),materials=[material.get('name') for material in doc.get('materials',[])],use='Player only: unchanged shipped GLB in WORLD evidence' if path.stem=='player' else 'Vocabulary/provenance only; no geometry used in depot'))
families=[]
for path in sorted((REPO/'assets-source').glob('**/manifest.json')):
    families.append(dict(path=str(path.relative_to(REPO)),sha256=digest(path),use='Vocabulary/provenance only; no geometry reused'))
write('evidence/reference-provenance.json',dict(shipped=references,sourceFamilies=families,activeFuelDistinction=dict(source='src/entities/Enemies.js:386 FuelCell and src/game/Game.js:817 reward/explosion branch',character='Active safety-yellow vertical tank and emissive moving band',depot='Passive muted twin horizontal steel vessels; no active cue, state or mechanics'),sourceHashesStillExact=all(digest(REPO/name)==value for name,value in measurement['sourceHashes'].items())))
mapping=dict(method='Fortress._fuelDepot(batch, rng, x, z)',initialOnly=True,installedInProduction=False,startup='createFuelDepotRecipe(parsed template JSON) once before Game/chunk builds',recipe='source/FuelDepotRecipe.mjs',template='asset/fuel-depot.template.json',materialMap={'hull':dict(existing='materials.hull',mapped=True,clone=False,uv='Actual Batch dominant-axis world projection, scale 3'),'dark':dict(existing='materials.darkMetal',mapped=False,color='0x3a4a5e',metalness=.5,roughness=.46,clone=False)},mergedBuckets=2,cachedTemplateGeometries=2,methodGameRngDraws=0,perPropRoots=0,newDrawBuckets=0,newTextures=0,newEmitters=0,perFrameRebuild=False,surfaceRecords='Original four saddle-box captures when captureSurfaces enabled, exact float expression order',chunkRetirement='Existing Fortress._disposeChunk once; template/material/texture resources survive',shutdown='Recipe.dispose idempotent, cached geometry only; shared materials/textures keep original shutdown owner',parts=generation['namedParts'])
write('runtime-map.json',mapping)
manifest=dict(asset='Fortress passive bulk fuel depot',revision='INITIAL',reviewStatus='pending_deferred_opus_review',formalReviews=0,formalReviewFixRounds=0,implementation=dict(host=socket.gethostname(),platform=platform.system(),provider='Codex harness in T3 Code',model='gpt-6.1-sol',reasoningEffort='xhigh',requestedSpeed='available speed',speedOverride='none requested or changed',helpers=0,claudeRetries=0,formalReviewProvider='Opus deferred; not run'),sourceCommit=measurement['sourceCommit'],scope='asset-work/fuel-depot/ exclusively; no production edits, commit/push/deploy, checkout/reset/fetch/worktree',tools=dict(blender='5.2.1 LTS',buildHash='9e2066aef7ef',engine='BLENDER_EEVEE',threads=4,renderBackend='Native Linux / software Mesa sysroot; not a live game GPU',three='0.185.1 read from existing local tooling; not bundled',python='standard library only'),assetFiles={str(path.relative_to(ROOT)):dict(bytes=path.stat().st_size,sha256=digest(path)) for path in sorted((ROOT/'asset').iterdir()) if path.is_file()},metrics=dict(evaluatedTriangles=992,hullTriangles=384,darkTriangles=608,GLBPrimitives=2,existingRuntimeBuckets=2,newDrawBuckets=0,GLBBytes=binary['bytes'],GLBByteCeiling=786432,triangleTarget=[700,1000],triangleCeiling=1400,namedAuthoringParts=20,sourceNominalBounds=[[-2.92,0,-4],[2.92,3.1,4]],transformedGLBBounds=binary['bounds'],newTextures=0,newEmitters=0),sourceContract=measurement['contract'],density=measurement['density'],runtimeProof=dict(fullAirfieldChunks=len(runtime['chunks']),seeds=[1,7,42,123],callerAndDownstreamBuffersExact=True,surfaceRecordsExact=True,gameRngDraws=0,lifecycle=runtime['lifecycle']),proofs=['evidence/source-measurement.json','evidence/runtime-proof.json','evidence/blender-reopen-reimport.json','evidence/binary-audit.json','evidence/render-settings.json','evidence/inspection.json','evidence/reference-provenance.json'],limitations=['Inherited 0.58 nominal lane-edge gap is not full 1.5-radius player clearance.','Finite source-camera/dusk-lighting probes only; isolated source deck fixture, not neighboring scenery.','Offline EEVEE does not reproduce mapped hull/normal/roughness textures or Three sky/fog/rim/postFX/HUD.','CPU material/texture doubles prove source behavior and ownership, not GPU rendering or FPS.','Shells are closed; straps omit hidden inner faces and overlapping pipe junctions are not boolean unions.','No live GPU/FPS/final acceptance or formal Opus review.'],freeze='Every content file except SHA256SUMS is covered; archive/receipt outside immutable initial',receiverVerification='pending; orchestrator owns verification')
manifest['proofs'].extend(['evidence/camera-projection-proof.json','evidence/generator-determinism.json','evidence/png-labeling.json'])
write('manifest.json',manifest)
print(json.dumps(dict(manifest='manifest.json',runtimeMap='runtime-map.json',sourceHashesStillExact=True),indent=2))
