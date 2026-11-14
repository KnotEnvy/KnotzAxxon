import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { payload } from './source-loader.mjs';

const read = name => JSON.parse(fs.readFileSync(path.join(payload, 'measurements', name + '.json')));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(payload, file))).digest('hex');
const baseline = read('baseline'), build = read('build'), audit = read('binary-audit'), prototype = read('prototype');
const assetFiles = ['assets/asteroid-scenery-kit.glb', 'assets/talus-basin.glb', 'assets/keel-double-impact.glb', 'assets/scar-cleaved.glb', 'source/asteroid-scenery-kit.blend'];
const manifest = {
  name: 'ASTEROID SCENERY KIT', revision: 'initial', sourceCommit: 'ee221ad', createdUtc: new Date().toISOString(),
  status: 'pending_deferred_opus_review', formalReviewPasses: 0, formalReviewFixPasses: 0, helpers: 0, claudeRetries: 0,
  implementation: { model: 'gpt-6.1-sol', reasoningEffort: 'xhigh', speed: 'available runtime speed; no separate override',
    blender: build.blender, blenderBuild: build.buildHash, blenderExecutableSha256: 'c2fd82553c979a7f6ba85202c487aa1173c90db588a67d74d70cc7b0c2bea01c',
    platform: build.platform, engine: build.engine, renderThreads: 4,
    environment: { LP_NUM_THREADS: '4', LIBGL_ALWAYS_SOFTWARE: '1', EGL_PLATFORM: 'surfaceless', nativeExistingSysroot: true },
    three: '0.185.1', node: process.version, generation: 'Deterministic authored analytic surfaces; no AI bitmap generation, no failed contest design mining.' },
  scope: { assignedDirectory: 'asset-work/asteroids/', productionEdits: false, commits: false, pushes: false, deployment: false,
    gameplayColliders: 'unchanged', gateRingRocks: 'unchanged; no optional mapping', sourceReferenceSnapshots: true },
  assets: assetFiles.map(file => ({ file, bytes: fs.statSync(path.join(payload, file)).size, sha256: digest(file) })),
  templateMap: build.templates.map(template => ({ node: template.node, file: template.file, triangles: template.evaluatedTriangles,
    materialPrimitives: 1, runtimeBucket: 'rock', runtimeMaterial: 'shared Materials.rock', gltfMaterial: 'AS_Regolith_RuntimeRock',
    authoredBoundsGame: template.boundsGame, radiusAboutPivot: template.radiusAboutPivot,
    placementScaleRecipe: 'source s * original sampled sx/sy/sz; no normalization or hidden fit factor',
    pivotRecipe: 'repeat world center as aPivot vec3 for every stamped corner',
    spinRecipe: 'repeat original normalized axis xyz and rad/s speed as aSpin vec4 for every corner',
    vertexPaletteRecipe: 'multiply actual Batch linear tint colors by exported linear COLOR_0 per indexed corner',
    uvRecipe: 'actual Batch dominant triangle-axis world box projection at uvScale=2*s; imported UVs are preview/edit data' })),
  runtime: { loadOnce: true, templatesPerRock: 1, gameRngForVariant: 0, draws: 'one merged scenery rock bucket per chunk, including unchanged debrisRing rocks when present; pre-existing obstacle-owned debrisGate featureBatch rock meshes remain separate and unchanged',
    perRockRuntimeMaterialClones: 0, perRockRootClones: 0, perFrameRebuild: false, newAssetTextures: 0,
    existingRockMapRetained: true, assetEmission: 0, chunkRetirement: 'unique chunk geometries once; no shared resource disposal',
    shutdown: 'retained templates and imported preview resources once via kit.shutdown; Materials owns shared runtime material/textures' },
  baselineSummary: baseline.summary, prototypeSummary: prototype.summary,
  binaryAudit: { file: 'measurements/binary-audit.json', method: audit.method, allFilesPassed: true },
  reopenReimport: 'measurements/reopen-reimport.json', deterministicRebuild: 'measurements/deterministic-rebuild.json',
  inspectedEvidence: 'measurements/visual-inspection.json',
  evidenceTruth: { offlineEngine: 'BLENDER_EEVEE', liveWebGL: false, fpsBenchmark: false,
    actualSourceCameras: true, sourceGeometryAndPlacements: true, shippedPlayerUnscaled: true,
    omitted: ['existing exact canvas rock texture', 'Three.js rim shader', 'all non-asteroid scenery, enemies, UI and postprocessing'],
    materialApproximation: 'neutral .74 attenuation on linear seed tint and authored palette; actual source map/rim response documented, not claimed rendered',
    bounds: 'actual sampled placement/anisotropy; analytic full-spin axis bounds and conservative pivot sphere; no normalized comparisons' },
  knownLimits: prototype.summary.limitations.concat([
    'Classic camera has inherited conservative sphere/capsule candidates; zero newly flagged sample events versus source is not all-seed proof.',
    'Eye sphere uses .35 radius; it does not certify complete projected near-plane clearance, especially the wide orthographic Classic near plane.',
    'Camera snap samples exclude shake/boost/lag trajectories, other aspect ratios, target visibility, and actual GPU shader/depth behavior.',
    'Offline camera-parented label geometry can cast minor shadows in closeup evidence; these labels are not part of delivered mesh assets.',
    'Initial authored craft only; Opus formal review/polish intentionally deferred. No formal review or fix pass performed.'
  ]),
  transport: { authorizedCli: '/mnt/c/Program Files/Tailscale/tailscale.exe', verb: 'file cp', destination: '100.112.66.64:',
    pathConversion: 'wslpath -w', receiptLocation: 'outside initial/', receiverVerification: 'orchestrator responsibility, not asserted by sender' },
  freeze: { checksumFile: 'SHA256SUMS', coverage: 'every content file except SHA256SUMS itself', archiveAndReceipt: 'outside initial/',
    mutableAfterFreeze: false, excludes: ['runtime tools', 'libraries', 'caches', 'temporary files', 'other assets or work', 'shipped reference GLBs'] },
};
fs.writeFileSync(path.join(payload, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest.assets, null, 2));
