import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile

ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO=next(parent for parent in [ROOT,*ROOT.parents] if (parent/'src/entities/Enemies.js').exists())
INITIAL=ROOT/'initial'

def sha256(file):
    return hashlib.sha256(pathlib.Path(file).read_bytes()).hexdigest()

def load(file):
    return json.loads((ROOT/file).read_text())

def main():
    assert not INITIAL.exists(),'INITIAL already exists and must never be edited or replaced'
    binary=load('evidence/glb_binary_report.json')
    native=load('evidence/blender_verification.json')
    runtime=load('evidence/runtime_verification.json')
    contract=load('source/source_contract.json')
    render=load('evidence/render_settings.json')
    viewed=load('evidence/viewed_images.json')
    completed=load('evidence/completed_renders.json')
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()==contract['sourceCommit']
    for file,expected in contract['sourceHashes'].items():
        assert sha256(REPO/file)==expected,file
    assert sha256(ROOT/'build/parked-fighter.glb')==binary['sha256']
    assert binary['triangles']<=5000 and binary['visibleMaterialPrimitives']==5 and binary['bytes']<=1048576
    assert native['savedBlendReopened'] and native['cleanSceneGLBReimported']
    assert len(native['sourceMotionSamplesMatchedIndependentGLB'])==12
    assert runtime['actualEnemyDisposeSourceExecuted'] and runtime['sourceMotionSamplesVerified']==12
    assert runtime['disposed']['sharedNeonMaterials']==0
    rendered=[entry['file'] for entry in render['renders']]
    assert len(rendered)>=25
    assert viewed['contactSheetActuallyViewed']
    assert set(viewed['individualsActuallyViewed']).issubset(set(rendered))
    for file,expected in viewed['viewedSHA256'].items():
        assert sha256(ROOT/'evidence'/file)==expected
    for file in rendered+['contact-sheet.png']:
        assert (ROOT/'evidence'/file).read_bytes()[:8]==b'\x89PNG\r\n\x1a\n'
    assert completed['assetSHA256']==binary['sha256']==render['boundGLBSHA256']
    assert render['boundBlendSHA256']==sha256(ROOT/'build/parked-fighter.blend')
    for file in rendered:
        assert completed['files'][file]==sha256(ROOT/'evidence'/file)
    utc=datetime.datetime.now(datetime.timezone.utc)
    timestamp=utc.strftime('%Y%m%dT%H%M%SZ')
    manifest={
        'asset':'parked-fighter','role':'grounded gameplay airfield enemy target','stage':'INITIAL','immutable':True,
        'review_status':'pending_deferred_opus_review','formal_reviews':0,'formal_fix_or_polish_passes':0,'final_art_acceptance':False,
        'frozenAtUTC':utc.isoformat(),'host':'NitroBliss','sourceCommit':contract['sourceCommit'],
        'requestedRuntime':{'provider':'codex','model':'gpt-6.1-sol','reasoningEffort':'xhigh','speed':'available speed; user accepted no exposed fast-mode toggle'},
        'actualRuntime':{'provider':'codex','model':'gpt-6.1-sol','reasoningEffort':'xhigh','helpersOrDelegates':0,'claudeRetries':0,'fastModeClaim':False},
        'nativeRuntime':{'blenderVersion':native['reopened']['version'],'build':native['reopened']['build'],'platform':'native Linux x64','renderEngine':'BLENDER_EEVEE','renderThreads':4,'llvmpipeThreads':4,'evidenceSamples':16,'savedStudioSamples':24,'viewTransform':'AgX','softwareRasterization':True},
        'deliverables':{
            'blend':{'path':'build/parked-fighter.blend','sha256':sha256(ROOT/'build/parked-fighter.blend'),'bytes':(ROOT/'build/parked-fighter.blend').stat().st_size,'packed':True,'externalDependencies':0,'editableParts':103},
            'glb':{'path':'build/parked-fighter.glb','sha256':binary['sha256'],'bytes':binary['bytes']},
            'runtimeMap':'RUNTIME_MAP.md','generator':'scripts/build_fighter.py','binaryReport':'evidence/glb_binary_report.json','sourceContract':'source/source_contract.json','nativeVerification':'evidence/blender_verification.json','runtimeVerification':'evidence/runtime_verification.json','contactSheet':'evidence/contact-sheet.png','individualPNGs':['evidence/'+file for file in rendered],
        },
        'measurements':{
            'evaluatedTrianglesVisible':binary['triangles'],'zeroAreaTriangles':binary['zeroAreaTriangles'],'visibleMaterialPrimitives':binary['visibleMaterialPrimitives'],'materialCount':binary['materialCount'],'textureCount':binary['textures'],
            'triangleTarget':5000,'triangleCeiling':7000,'primitiveCeilingIncludingCues':5,'glbByteCeiling':1048576,
            'transformedRestBoundsGame':binary['bounds'],'restCondition':'Identity external yaw/pitch, engine scale .3, beacon visible; all authored node transforms applied, no hidden shell',
            'sourceBaseline':contract['baseline'],'hiddenFlash':runtime['flash'],
            'seededYawBounds':{state['label']:state['bounds'] for state in binary['sourceMotionTransformedBounds'] if state['label'].startswith('seeded_yaw_')},
            'sourceMotionBounds':'evidence/glb_binary_report.json sourceMotionTransformedBounds; 12 named source update samples, 2 seeded yaw extrema, 420 natural approach frames',
            'minimumNaturalApproachGroundClearance':binary['minimumSampledGroundClearance'],
            'densityProxy':contract['density'],'tenTargetProxy':{'visibleTriangles':10*binary['triangles'],'visiblePrimitives':10*binary['visibleMaterialPrimitives'],'notLiveMaximum':True},
            'engineMaxRadius':.24*1.045,'nozzleInnerRadius':.277,'engineFullPulseRadialClearance':.277-.24*1.045,
        },
        'axes':contract['axis'],'rootPivotGame':[0,0,0],'collisionSphere':{'radius':2.4,'origin':[0,0,0],'unchanged':True},
        'integration':{'installed':False,'enemyKind':'parked','recommendedImportedKey':'parked-fighter','file':'parked-fighter.glb','existingGroundAdapterSupportsThisKind':False},
        'dynamicPivots':{'engine':{'position':[0,1,2.3],'initialUniformScale':.3,'scaleMinMaxScrambleFullSpool':[.995,1.045],'facing':'+Z aft'},'beacon':{'position':[0,2.4,1.6],'visible':'sin(time*5+pos.z)>.2'}},
        'namedNodes':binary['nodes'],'materialPrimitives':binary['primitives'],'materialOwnership':'RUNTIME_MAP.md; per-enemy cloned static materials and geometries, shared mats.neon cues, flash geometry parented under importedRoot for existing Enemy.dispose',
        'gameplayPreserved':{'hp':1,'radius':2.4,'score':150,'scrambleProbability':.35,'rngCallsInConstructor':2,'rngOrder':['bool(.35)','range(-.2,.2)'],'pitchAxis':'+X Euler XYZ source convention','rootYawRange':[-.2,.2],'launchWindowExclusive':[-20,60],'liftRate':.55,'maxVerticalSpeed':9,'forwardSpeedFactor':.75,'rootAltitudeCap':23,'pitchTarget':-.35,'pitchDamping':4,'weapons':None,'detach':'N/A','gearRetraction':'N/A'},
        'evidence':{'mode':'offline reconstruction, NOT live gameplay proof','commonNeutral':render['neutral'],'sourceCameraRigs':contract['rigs'],'settings':'evidence/render_settings.json','viewed':'evidence/viewed_images.json','shippedReference':{'path':'public/models/player.glb','sha256':sha256(REPO/'public/models/player.glb'),'scale':[1,1,1],'copiedIntoDeliveredAsset':False},'noPerAssetNormalization':True},
        'constructionSelfChecks':['Actual procedural source geometry and dynamic update executed before design','Orthographic projection calibrated through Blender projection matrix, exact vertical span asserted','Canopy longitudinal crown fitted to curved glazing profile before freeze','Zero-area tessellation triangles removed from baked export while preserving surviving positions, corner colors and normals; final binary has zero degenerate triangles','All delivered PNGs rebound to final GLB SHA and final saved blend in bounded render batches','Hit-shell ownership verified with actual current Enemy.dispose source','Reopened native saved blend and clean-scene GLB reimport matched independent binary geometry bounds and triangle counts'],
        'limitations':[
            'No production parked-fighter adapter installed. Orchestrator integrates in its bound SuperBeast worktree; source/public/docs unchanged.',
            'No live gameplay/WebGL proof, GPU frame-time measurement or final art acceptance. Formal Opus review/polish remains deferred.',
            'Offline renders reconstruct source snap cameras and dusk sun/rim parameters; HemisphereLight, shader rims, fog, bloom and game postprocessing are not reproduced exactly.',
            'Density proxy 10/355 units over seeds 1..100 and loops 0,1,3 is not a live maximum.',
            'Canopy intentionally opaque stylized glazing. No textures/atlas, interior transparency, gear retract, detach or weapon mechanics.',
            'Engine idle disk preserves source small radius/scale, front-occluded and only aft-readable. Small classic views may show only silhouette and broad cues.',
            'Ground clearance is sampled over the actual 420-frame source approach plus named states, not continuous rigid-body certification.',
            'Root cap is Y=23, not top-of-visual cap: upper surfaces may exceed Y=25 as with the source.',
            'Source scramble translates +Z while nose remains -Z and source negative pitch is retained; no new turn-to-flight-direction correction is introduced.',
            'Native software EEVEE emits EGL_BAD_MATCH fallback initialization warnings but successfully renders the supplied PNGs.',
            'Blender studio is editable and packed with no external assets; source parts and baked export are separate collections and require deliberate rebuild after edits.',
            'Receiver-side archive/hash verification and eventual acceptance are handled by orchestrator, not claimed here.',
        ],
        'transfer':{'mechanism':'Tailscale Taildrop','target':'100.112.66.64:','receiverAutoReceive':'/mnt/c/Users/Knotz2/Downloads','statusAtFreeze':'pending archive creation and sender attempt; final response/outer receipt records sender outcome','receiverVerified':False},
        'sourceFilesSHA256':contract['sourceHashes'],
    }
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    INITIAL.mkdir()
    files=[ROOT/'README.md',ROOT/'RUNTIME_MAP.md',ROOT/'manifest.json']
    files.extend(sorted((ROOT/'scripts').glob('*.py')))
    files.extend(sorted((ROOT/'scripts').glob('*.mjs')))
    files.append(ROOT/'scripts/blender.sh')
    files.extend(sorted((ROOT/'source').glob('*')))
    files.extend(ROOT/'build'/name for name in ['parked-fighter.blend','parked-fighter.glb','build_metadata.json'])
    evidence_files=rendered+['contact-sheet.png','render_settings.json','completed_renders.json','viewed_images.json','build.log','source_measurement.log','binary-measurement.log','blender-verification.log','runtime-verification.log','render.log','glb_binary_report.json','blender_verification.json','runtime_verification.json']
    files.extend(ROOT/'evidence'/name for name in evidence_files)
    for file in files:
        relative=file.relative_to(ROOT)
        destination=INITIAL/relative
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(file,destination)
    checksum_lines=[]
    for file in sorted(INITIAL.rglob('*')):
        if file.is_file():
            checksum_lines.append(sha256(file)+'  '+str(file.relative_to(INITIAL)))
    (INITIAL/'SHA256SUMS').write_text('\n'.join(checksum_lines)+'\n')
    subprocess.run(['sha256sum','--check','SHA256SUMS'],cwd=INITIAL,check=True,stdout=subprocess.DEVNULL)
    for file in INITIAL.rglob('*'):
        if file.is_file():
            file.chmod(0o444)
    for directory in sorted([entry for entry in INITIAL.rglob('*') if entry.is_dir()],key=lambda item:len(item.parts),reverse=True):
        directory.chmod(0o555)
    INITIAL.chmod(0o555)
    archive=pathlib.Path('/tmp')/('parked-fighter-initial-'+timestamp+'.tar.gz')
    assert not archive.exists()
    with tarfile.open(archive,'w:gz') as package:
        package.add(INITIAL,arcname='asset-work/parked-fighter/initial',recursive=True)
    receipt={'archive':str(archive),'archiveSHA256':sha256(archive),'archiveBytes':archive.stat().st_size,'initial':str(INITIAL),'deliveredFiles':len(checksum_lines)+1,'checksumsPassed':True,'glbSHA256':binary['sha256'],'blendSHA256':manifest['deliverables']['blend']['sha256'],'status':'frozen, sender Taildrop pending','receiverVerified':False}
    (ROOT/'freeze_receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))

if __name__=='__main__':
    main()
