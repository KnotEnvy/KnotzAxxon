import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text())


def digest(relative):
    path = ROOT / relative
    return {'path': relative, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    build = read('checks/build.json')
    binary = read('checks/glb-independent.json')[0]
    runtime = read('checks/runtime-fixture.json')
    blender = read('checks/blender-reopen-reimport.json')
    camera = read('checks/camera-projection.json')
    assert build['triangles'] == binary['triangles'] == blender['savedBlendReopened']['triangles'] == blender['cleanSceneGlbReimport']['triangles'] == 18898
    assert binary['zeroAreaTriangles'] == runtime['zeroAreaAfterFloat32Partition'] == 0
    assert binary['materialPrimitives'] == runtime['maxChunkPrimitives'] == 6
    assert binary['bytes'] < 4 * 1024 * 1024
    assert runtime['maxChunkTriangles'] <= 3500
    assert blender['assertionsPassed'] and camera['assertionsPassed'] and runtime['rngSourceMatch']
    renders = read('evidence/renders.json')
    next(record for record in renders['images'] if record['image'] == 'selected-reference-scale.png')['note'] = 'Selected shipped references at shared world scale1: Sentinel worldX27, player worldX-16, turret/radar/silo/fuel worldZ17. Gallery translations only; source files not modified/repackaged.'
    (ROOT / 'evidence/renders.json').write_text(json.dumps(renders, indent=2))
    images = []
    for image in sorted((ROOT / 'evidence').glob('*.png')):
        payload = image.read_bytes()
        width, height = struct.unpack_from('>II', payload, 16)
        assert b'carrier-offline-header-v1' in payload
        images.append({'image': image.name, 'size': [width, height], 'offlineHeaderPixels': 56, 'headerAddedWithoutViewportRescale': True, 'imageToolInspected': True, 'inspectionScope': 'Required author self-check only, not a formal review; some underlying viewports inspected before adding the unchanged-size annotation header.'})
    assert len(images) == 13
    (ROOT / 'checks/evidence-inspection.json').write_text(json.dumps({'formalReviews': 0, 'formalFixPasses': 0, 'method': 'actual PNGs opened with view_image, not inferred from source', 'observations': ['Overview port/starboard show single island and bow/stern taper, no repeated island.', 'Close hangar image visibly shows actual depth, inner frames, floor guidance and scale1 player.', 'Flightdeck image shows seams, lower catapult slots, rails, single bridge and scale1 reference fighter.', 'Stern image shows both hollow bells and recessed cores; bow close shows fitted taper.', 'Classic is deliberately partial carrier visibility; Modern/Chase keep the unchanged corridor framing.', 'Three radar views show distinct angular states; source shader/uniform/gain probes are CPU, not GPU proof.', 'Selected-reference gallery shares world scale1 and translations, not per-object normalization.'], 'images': images}, indent=2))
    manifest = {
        'asset': 'CARRIER landmark', 'snapshot': 'initial', 'status': 'pending_deferred_opus_review', 'finalAcceptance': False,
        'model': 'codex / gpt-6.1-sol', 'settings': {'reasoningEffort': 'xhigh', 'speed': 'available speed'},
        'formalReviews': 0, 'formalFixPasses': 0, 'sourceCommit': 'ee221ad3e05cd66292fe02b71b50f513696bdda2',
        'authoringEnvironment': {'machine': 'NitroBliss', 'os': 'native Linux Blender, not Windows Blender', 'blender': build['blender'], 'buildHash': build['buildHash'], 'engine': 'BLENDER_EEVEE', 'renderThreads': 4},
        'files': {name: digest(name) for name in ['carrier.blend', 'carrier.glb', 'carrier-template.json', 'carrier-template.bin']},
        'geometry': {'evaluatedTriangles': build['triangles'], 'glbTriangles': binary['triangles'], 'cleanReimportTriangles': blender['cleanSceneGlbReimport']['triangles'], 'editableMeshObjects': build['objects'], 'editableMaterialPrimitives': blender['savedBlendReopened']['materialPrimitivesBeforeBatch'], 'glbPrimitives': binary['materialPrimitives'], 'materialBuckets': build['buckets'], 'textures': 0, 'transformedRestGameBounds': binary['boundsTransformedGame'], 'worldSeed1Bounds': {'min': [48, -26, 6510], 'max': [108.55000305175781, 44.5, 7497]}, 'zeroAreaTriangles': 0},
        'placement': {'translation': '[0,0,sector.zStart+160]', 'axes': 'X across, +Y up, +Z travel', 'scale': [1, 1, 1], 'normalization': 'NONE'},
        'sourceMeasured': {'seeds': [1, 7, 42, 123], 'triangles': 8492, 'maxChunkTriangles': 1352, 'affectedChunksSeed1': 12, 'discrepancy': 'assignment summary said11; actual source has12 nonempty chunks67..78 inclusive'},
        'runtime': {'prototype': 'source/runtime_fixture.mjs', 'mapping': 'source/runtime-mapping.md', 'method': 'prepare local source triangles once into96-unit world modules, replay exact original RNG, append only matching module into real source Batch and shared material buckets', 'partitionedTrianglesSeed1': runtime['partitionedTriangles'], 'chunkCountSeed1': len(runtime['chunks']), 'maxChunkTrianglesSeed1': runtime['maxChunkTriangles'], 'maxChunkPrimitives': runtime['maxChunkPrimitives'], 'maximumAdditionalSampledAlignmentTriangles': max(record['maxChunkTriangles'] for record in runtime['alternatePlacements']), 'rngReplayCases': runtime['rngReplayCases'], 'rngPreserved': True, 'sectionSeamsMatched': len(runtime['seams']), 'qualityVisibleSpans': runtime['qualitySpans'], 'shaderAttributes': ['aAnim', 'aPivot', 'aSpin'], 'sharedClockCPUProbe': runtime['shaderProbe'], 'lifetime': runtime['lifecycle']},
        'gameplay': {'sceneryOnly': True, 'collisionChanges': False, 'aimRestrictions': False, 'launchOriginChanges': False, 'launchVisualCaveat': 'Original origins X56..60,Y0..6 at unsnapped featureZ can intersect scenery piers. No new bay targeting/doors/mechanics.', 'damage': 'N/A', 'detach': 'N/A', 'retraction': 'N/A'},
        'evidence': {'pngs': len(images), 'offline': True, 'cameraProjectionSourceVerified': True, 'playerSameWorldScale': True, 'limitations': ['AgX instead of game ACES', 'No game texture forge/PMREM/fog/nebula/bloom/HUD', 'Hemisphere approximate, extra fill only in craft presentations', 'Shader patch/clock and motion gains CPU only, not GPU compilation', 'No live game integration/profiler or final acceptance', 'No camera transition/portrait sweep', 'Opus review/polish deferred']},
        'scope': {'writes': 'asset-work/carrier/ only', 'productionEdits': False, 'sourceGeometryReuse': 'none; selected shipped assets read/rendered as references only', 'toolReuse': 'authorized native Linux blender.sh sysroot wrapper only', 'helpersDelegated': 0},
        'freeze': {'directory': 'initial/', 'checksums': 'SHA256SUMS covers every content file except itself', 'archiveAndReceipt': 'outside frozen initial; no runtime/tools/libs/cache/temp/credentials/unrelated assets in archive', 'receiverVerification': 'orchestrator responsibility'},
    }
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({'status': manifest['status'], 'triangles': build['triangles'], 'maxChunk': runtime['maxChunkTriangles'], 'glbBytes': binary['bytes'], 'images': len(images)}, indent=2))


if __name__ == '__main__':
    main()
