import datetime
import gzip
import hashlib
import json
import os
import struct
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
REPO = ROOT.parents[2]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name):
    return json.loads((ROOT / 'evidence' / name).read_text())


source = load('source-measurement.json')
runtime = load('runtime-proof.json')
binary = load('independent-binary-audit.json')
blender = load('blender-reopen-clean-reimport.json')
render = load('render-settings.json')
assert len(runtime['cases']) == 356 and runtime['sourcePropCount'] == runtime['candidatePropCount'] == 114
assert binary['triangles'] == blender['blend']['evaluatedTriangles'] == blender['cleanGLBReimport']['evaluatedTriangles'] == 704
assert binary['bytes'] == 109384 and binary['primitives'] == 21 and binary['nodes'] == 24
assert render['engine'] == 'BLENDER_EEVEE' and render['buildHash'] == '9e2066aef7ef'
for filename, expected in source['sourceHashes'].items():
    assert digest(REPO / filename) == expected, filename
for filename, expected in blender['sha256'].items():
    assert digest(ROOT / 'asset' / filename) == expected, filename
assert digest(ROOT / 'asset/fortress-rooftop-flak.glb') == binary['sha256']
viewed = [
    'hardware-front.png', 'hardware-bore-close.png', 'hardware-mount-close.png',
    'world-classic-source.png', 'world-classic-candidate.png', 'world-modern-candidate.png', 'world-chase-candidate.png',
    'inspection-hardware-sheet.png', 'inspection-pose-extrema-sheet.png', 'inspection-world-sheet.png', 'inspection-shipped-references-sheet.png'
]
coverage = {
    'inspection-hardware-sheet.png': ['hardware-front.png', 'hardware-rear.png', 'hardware-side.png', 'hardware-top.png', 'hardware-bore-close.png', 'hardware-mount-close.png'],
    'inspection-pose-extrema-sheet.png': [f'pose-extreme-{index}.png' for index in range(1, 5)],
    'inspection-world-sheet.png': [f'world-{mode}-{variant}.png' for mode in ('classic', 'modern', 'chase') for variant in ('source', 'candidate')],
    'inspection-shipped-references-sheet.png': [f'reference-{name}.png' for name in ('player', 'sentinel', 'turret', 'radar', 'silo', 'fuel')]
}
for name in set(viewed + [item for items in coverage.values() for item in items]):
    payload = (ROOT / 'evidence' / name).read_bytes()
    assert payload[:8] == b'\x89PNG\r\n\x1a\n' and b'IEND' in payload[-12:]
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
inspection = {
    'performedBy': 'Implementation agent gpt-6.1-sol xhigh; direct functions.view_image calls, not a formal reviewer',
    'recordedAtUTC': now,
    'actualViewedPNGs': [{'path': 'evidence/' + name, 'sha256': digest(ROOT / 'evidence' / name), 'dimensions': list(struct.unpack_from('>II', (ROOT / 'evidence' / name).read_bytes(), 16))} for name in viewed],
    'contactSheetCoverage': coverage,
    'observations': [
        'Six hardware angles and two full-resolution closeups show coherent connected base/azimuth/yokes/receivers and real dark recessed bores; no new neon or enemy telegraph.',
        'All four full-source pitch/yaw extrema remain visually connected. No aim range narrowing, discontinuity or alternate elevation origin.',
        'Classic full-resolution source/candidate comparison retains the original actual roof, existing red warning beacon, wall and shipped player at unchanged common world scale; the gun is a small scenery silhouette.',
        'Modern and Chase are dominated by existing high wall occlusion: barrel tips remain visible but much of mount is masked. Do not treat projected bounds as visible pixel coverage; no camera/roof/emitter displacement used to conceal it.',
        'Selected shipped references exhibit metal edge/facet language; no reference meshes or enemy accent/emission palette copied.',
        'No particle render, live GPU/FPS or final acceptance conclusion. Offline source-lighting proxies and source-material map averages are explicitly labelled.'
    ],
    'status': 'pending_deferred_opus_review', 'formalReviews': 0, 'formalReviewFixRounds': 0
}
(ROOT / 'evidence/inspection.json').write_text(json.dumps(inspection, indent=2) + '\n')
asset_hashes = {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted((ROOT / 'asset').iterdir())}
manifest = {
    'asset': 'FORTRESS_ROOFTOP_FLAK', 'iteration': 'initial', 'frozenAtUTC': now, 'status': 'pending_deferred_opus_review',
    'formalReviews': 0, 'formalReviewFixRounds': 0, 'helpers': 0, 'claudeRetries': 0,
    'implementation': {'model': 'gpt-6.1-sol', 'reasoningEffort': 'xhigh', 'speed': 'available; no requested unavailable speed/model fallback', 'host': 'NitroBliss', 'baseCommit': 'ee221ad', 'productionEdits': False, 'commitsPushesDeploys': False},
    'scope': ['Fortress._flakGun static scenery', 'unchanged _skyline far battery roof callsites', 'original ambient flak emitter and actual consumers'],
    'excluded': ['enemy Turret/HeavyTurret/Silo mechanics', 'HP/colliders/targeting/gameplay projectiles', 'dynamic aiming or per-frame rebuild', 'new materials/textures/buckets/draws', 'production src/public/docs changes'],
    'geometry': {'triangles': 704, 'target': [500, 750], 'ceiling': 1000, 'authoringGLBPrimitives': 21, 'authoringGLBNodes': 24, 'runtimeBuckets': {'hull': 192, 'dark': 512}, 'authoringMaterials': 2, 'newRuntimeMaterials': 0, 'newRuntimeDraws': 0, 'textures': 0, 'images': 0, 'GLBBytes': binary['bytes'], 'GLBCeilingBytes': 524288, 'referencePose': {'pitch': 1.15, 'yaw': -.85, 'roofY': 0}, 'referenceBounds': binary['bounds'], 'sampledFullPoseBounds': runtime['sweep']['envelope']['candidate'], 'roofContactFootprint': [3.3, 3.3]},
    'poseAndEffects': {'pitch': [1, 1.3], 'yaw': [-1.1, -.6], 'pivotYAboveRoof': 2.1, 'barrelLength': 4.2, 'barrelLocalXOffsets': [-.45, .45], 'RNGDraws': 'original pitch, yaw, rate; caller-owned emit draws fourth time phase', 'emitter': 'exact original center-between-tips world point, direction/rate and original roofY argument; owner remains original chunk', 'rate': [.25, .45], 'VFXChanges': False},
    'placement': source['density'],
    'validation': {'sourceSeeds': [1, 7, 42, 123], 'actualFortressChunks': 356, 'actualFlakPlacements': 114, 'poseSamples': 10201, 'sourceMatchedProof': runtime['proof'], 'minimumSampledEmitterTriangleClearance': runtime['sweep']['minimumEmitterTriangleClearanceAt101PitchSamples'], 'minimumSampledRoofMargin': runtime['roofClearance']['minimumContactFootprintMargin'], 'maximumSampledAABBOvershoot': runtime['sweep']['maximumPerPoseAABBOvershoot'], 'continuousNearestSamplePadding': .0173, 'binaryAudit': 'evidence/independent-binary-audit.json', 'separateBlenderReopenCleanReimport': 'evidence/blender-reopen-clean-reimport.json', 'cameraProjectionChecks': blender['independentWorldCameraProjectionChecks'], 'CPUOnlyNoGPUOrFPSClaim': True},
    'runtime': {'recipe': 'source/FlakGunRecipe.mjs', 'template': 'asset/flak-gun.template.json', 'mapping': 'runtime-map.json', 'cachedTypedGeometryBytes': 50688, 'reusableScratchBytes': 50688, 'plus': 'small part/tint metadata; parsed startup JSON may be released', 'build': 'single static posed stamp per chunk-build call into existing Batch hull/dark buckets, no per-part/prop roots/geometries/material clones', 'ownership': 'chunk Batch-merged geometry disposes once; chunk emitters retire with owner; templates/materials/textures survive until explicit application shutdown', 'integrationPerformed': False},
    'render': render,
    'inspection': 'evidence/inspection.json',
    'sourceHashes': source['sourceHashes'], 'assetSHA256': asset_hashes,
    'limitations': runtime['limitations'] + [runtime['sweep']['finiteLimits'], runtime['roofClearance']['finiteLimit'], 'Existing high wall masks much of mount in perspective WORLD cameras, even at selected legal high-altitude/edge player station.', 'GLB preview hull is source-map average only; runtime retains actual shared hull maps/normalScale and unmapped darkMetal. COLOR_0 gain1.1 and glTF V flip are explicit and independently audited.', 'Offline software EEVEE emitted nonfatal EGL_BAD_MATCH context warnings; no live game renderer, particle/postprocessing, GPU/FPS, or final acceptance claim.'],
    'freeze': {'everyContentSHA256': 'SHA256SUMS except itself', 'writeProtected': True, 'archiveOutsideInitial': True, 'transferContentsOnly': ['asset', 'source', 'evidence', 'README.md', 'runtime-map.json', 'manifest.json', 'SHA256SUMS'], 'excludedFromArchive': ['Blender executable', 'wrapper/tools', 'runtime', 'libraries', 'cache', 'temp', 'work', 'unrelated assets'], 'receiverVerification': 'orchestrator responsibility; sender exit is not receiver verification'}
}
(ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
paths = sorted(path for path in ROOT.rglob('*') if path.is_file() and path.name != 'SHA256SUMS')
assert not any(path.is_symlink() for path in ROOT.rglob('*'))
allowed = {'.blend', '.glb', '.json', '.md', '.mjs', '.py', '.png'}
assert all(path.suffix in allowed for path in paths)
(ROOT / 'SHA256SUMS').write_text(''.join(f'{digest(path)}  {path.relative_to(ROOT).as_posix()}\n' for path in paths))
for path in ROOT.rglob('*'):
    path.chmod(0o555 if path.is_dir() else 0o444)
ROOT.chmod(0o555)
archive = PARENT / 'flak-gun-initial-2026-11-14.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0, compresslevel=6) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as output:
            for path in [ROOT, *sorted(ROOT.rglob('*'))]:
                info = output.gettarinfo(str(path), arcname='initial' + ('/' + path.relative_to(ROOT).as_posix() if path != ROOT else ''))
                info.uid = info.gid = 0
                info.uname = info.gname = ''
                info.mtime = 0
                if path.is_file():
                    with path.open('rb') as content:
                        output.addfile(info, content)
                else:
                    output.addfile(info)
archive_hash = digest(archive)
(PARENT / (archive.name + '.sha256')).write_text(f'{archive_hash}  {archive.name}\n')
receipt = {'frozenAtUTC': now, 'archive': str(archive), 'archiveBytes': archive.stat().st_size, 'archiveSHA256': archive_hash, 'contentFilesIncludingSHA256SUMS': len(paths) + 1, 'SHA256SUMS_SHA256': digest(ROOT / 'SHA256SUMS'), 'assetSHA256': asset_hashes, 'initialWriteProtected': True, 'status': 'pending_deferred_opus_review', 'formalReviews': 0, 'formalReviewFixRounds': 0, 'transport': 'pending authorized Windows Tailscale file cp', 'receiverVerification': 'not performed; orchestrator responsibility'}
(PARENT / 'freeze-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
