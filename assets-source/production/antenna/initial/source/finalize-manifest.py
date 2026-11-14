import datetime
import hashlib
import json
import os
import struct
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get('REPO_ROOT', os.getcwd()))
OUT = ROOT / 'asset-work/antenna/initial'
WORK = ROOT / 'asset-work/antenna/work'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name):
    return json.loads((OUT / 'evidence' / name).read_text())


source = load('source-measurements.json')
runtime = load('runtime-validation.json')
binary = load('independent-binary-audit.json')
blend = load('blender-reopen-clean-reimport.json')
images = []
for name, observations in [
    ('01-multiview.png', 'Front/rear/three-quarter preserve the slender continuous spine, sparse crossbars and top red beacon. Rear structural faces are notably dark under the directional studio rig.'),
    ('02-hardware-closeups.png', 'Tapered mounting shoe, anchors, terminal, restrained rear conduit/clip, clamped aerial and red faceted obstruction lamp are readable. No dense radar or greeble silhouette.'),
    ('03-world-scale-classic-modern-chase.png', 'All twelve endpoint/strobe/rig panels show the same true-scale shipped player and thin antenna. Classic hardware remains deliberately small; h13 taller than h7. Bright pale deck is a labeled proxy, not source surface calibration.'),
]:
    path = OUT / 'evidence' / name
    width, height = struct.unpack_from('>II', path.read_bytes(), 16)
    images.append({ 'file': 'evidence/' + name, 'sha256': digest(path), 'pixels': [width, height], 'openedWith': 'functions.view_image', 'actuallyViewed': True, 'observations': observations })
(OUT / 'evidence/visual-inspection.json').write_text(json.dumps({ 'formalReview': False, 'formalFixRound': False, 'images': images, 'limits': load('render-settings.json')['limitations'] }, indent=2))
geometry_hash = digest(WORK / 'geometry.json')
(OUT / 'evidence/generator-determinism.json').write_text(json.dumps({ 'method': 'build-geometry.mjs executed twice from the same recipe and source; both serialized actual-Batch geometry JSON hashes matched.', 'firstSHA256': 'abb33a7ebb1a8cb220bb7c926de8f85a25005bfb58899db96937ebff4b4653a5', 'repeatSHA256': geometry_hash, 'equal': geometry_hash == 'abb33a7ebb1a8cb220bb7c926de8f85a25005bfb58899db96937ebff4b4653a5', 'claimScope': 'Deterministic geometry and source RNG, not cross-version byte-identical Blender containers.' }, indent=2))
assert geometry_hash == 'abb33a7ebb1a8cb220bb7c926de8f85a25005bfb58899db96937ebff4b4653a5'
fortress = (ROOT / 'src/world/Fortress.js').read_text()
original = fortress[fortress.index('  _antenna(batch, rng, x, z, theme) {'):fortress.index('  _bunker(batch, rng, x, z, theme) {')].strip()
placement = [line.strip() for line in fortress.splitlines() if 'const farX =' in line or 'this._antenna(batch, rng, farX()' in line]
(OUT / 'source/source-contract.json').write_text(json.dumps({ 'sourceFile': 'src/world/Fortress.js', 'sourceSHA256': digest(ROOT / 'src/world/Fortress.js'), 'originalAntennaMethod': original, 'unchangedCallerLines': placement, 'sourceSharedMaterialMap': {'dark': 'materials.darkMetal', 'neon': 'materials.neonVertex'}, 'sourceLightClock': 'Materials.clock.value -> uLightTime -> lightGain(aAnim, uLightTime)', 'sourceLightGainGLSL': '.08 + 1.45 * smoothstep(0,.03,c) * (1-smoothstep(.12,.2,c)), c=fract(time*rate+phase)', 'productionModified': False }, indent=2))
for original_name, destination in [('build-blender.log', 'offline-render.log'), ('export-final.log', 'asset-export.log'), ('verify-blender.log', 'blender-verification.log'), ('runtime-validation.log', 'runtime-validation.log'), ('audit-glb.log', 'independent-binary-audit.log')]:
    (OUT / 'evidence' / destination).write_bytes((WORK / original_name).read_bytes())
manifest = {
    'asset': 'FORTRESS ANTENNA scenery prop', 'stage': 'INITIAL', 'status': 'pending_deferred_opus_review', 'formal_reviews': 0, 'formal_fix_rounds': 0,
    'createdUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'host': 'NitroBliss',
    'implementation': { 'harness': 'Codex', 'model': 'gpt-6.1-sol', 'reasoning_effort': 'xhigh', 'speed': 'available harness speed; no separate numeric speed control exposed', 'helpers': 0, 'Claude_retries': 0, 'Opus_review': 'deferred' },
    'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'sourceSHA256': source['sourceSHA256'],
    'scope': {'onlyWrittenTree': 'asset-work/antenna/', 'productionEdits': False, 'newCollisions': False, 'newEmitters': False, 'newCover': False, 'mechanicsChanges': False, 'commitsPushesDeployment': False},
    'toolchain': {'Blender': '5.2.1 LTS', 'build': '9e2066aef7ef', 'platform': 'native Linux', 'renderEngine': 'BLENDER_EEVEE', 'threads': 4, 'EEVEESamples': 24, 'Three': '0.185.1'},
    'artifacts': { name: { 'file': 'asset/' + name, 'bytes': (OUT / 'asset' / name).stat().st_size, 'sha256': digest(OUT / 'asset' / name) } for name in ['fortress-antenna.blend', 'fortress-antenna.glb'] },
    'referenceVariant': {'sourceSeed': 42, 'height': next(entry['height'] for entry in source['isolated'] if entry['seed'] == 42), 'triangles': binary['triangles'], 'primitiveCount': binary['primitiveCount'], 'materialCount': binary['materialCount'], 'transformedBoundsGameAxes': binary['transformedBoundsGameAxes'], 'glbCeilingBytes': 393216, 'textures': 0, 'animationTracks': 0},
    'variableVariants': {'sourceElementCountTheoretical': [2, 7], 'trianglesFormula': '208 + 24*N', 'triangleRange': runtime['triangleRange'], 'target': [250, 400], 'ceiling': 600},
    'sourceDensity': source['density'], 'observedPlacementEnvelope': source['measured'], 'theoreticalPlacementEnvelope': source['theoretical'],
    'namedPartsMaterialMap': [{'object': entry['name'], 'namedParts': entry['vertexGroups'], 'bucket': 'dark' if 'structure' in entry['name'] else 'neon', 'runtimeMaterial': 'materials.darkMetal' if 'structure' in entry['name'] else 'materials.neonVertex'} for entry in blend['reopenedBlend']['meshes']],
    'materialPortability': binary['materialPortability'],
    'runtimeRecipe': { 'file': 'source/AntennaRecipe.mjs', 'startupCachedTemplates': 5, 'perPropRoots': 0, 'materialClones': 0, 'newRandomDraws': 0, 'perFrameRebuild': False, 'strobe': {'mode': 1, 'hueGauntlet': '0xff2a3a', 'hueOtherwise': '0xff3d55', 'gain': 1.6, 'rate': [.6, 1], 'phase': 'exact source rng.next()', 'clock': 'shared materials.clock / uLightTime / aAnim'}, 'surfaceCapture': 'original pole, element and lamp records only, if enabled', 'retirement': runtime['lifecycle'] },
    'verification': { 'seedComparisons': 4096, 'adversarialGeometryEndpoints': len(runtime['adversarialCases']), 'fullChunkComparisons': len(runtime['fullChunkComparisons']), 'actualSourceAntennas': 276, 'lightingProbes': len(runtime['lighting']), 'clearanceProbes': len(runtime['clearance']), 'blendReopen': blend['status'], 'cleanGLBReimport': blend['status'], 'independentBinary': binary['status'], 'formalReviews': 0, 'formalFixRounds': 0 },
    'viewedEvidence': images, 'limitations': runtime['limitations'] + load('render-settings.json')['limitations'] + ['Dim world rows are citadel hue, peak rows gauntlet hue; not a same-hue colorimetric comparison.', 'Pale deck test double and dark rear studio faces are observed limitations, not polished final source lighting.', 'No live GPU/FPS, production integration, formal Opus approval, final acceptance or receiver verification.'],
    'transferPolicy': {'include': ['assigned source/runtime prototype', 'blend/glb', 'evidence', 'manifest/readme/checksums'], 'exclude': ['tools', 'runtime dependencies', 'libs', 'node_modules', 'cache', 'temporary work', 'unrelated source/assets'], 'authorizedSender': 'existing Windows Tailscale CLI file cp with wslpath -w archive argument', 'destination': '100.112.66.64:', 'receiverVerification': 'orchestrator responsibility'},
}
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({ 'status': manifest['status'], 'artifacts': manifest['artifacts'], 'sourceDensity': source['density'], 'triangleRange': runtime['triangleRange'], 'viewedPNGs': len(images) }, indent=2))
