import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadSource } from './source_loader.mjs';
import { appendWreckage, emitReplacement, prepareWreckage, releaseWreckageTemplates } from './wreckage_runtime.mjs';

const [root, threeRoot, payload] = process.argv.slice(2);
const source = await loadSource(root, threeRoot);
const { THREE, Rng, Batch, Fortress } = source;
const document = JSON.parse(fs.readFileSync(path.join(payload, 'asset/runtime-templates.json')));
const templates = prepareWreckage(document);
const sourceText = source.fortressText;
const start = sourceText.indexOf('    // drifting wreck:');
const end = sourceText.indexOf('    // distant orbital', start);
const replacementText = sourceText.slice(0, start) + '    // drifting wreck: cached authored replacement\n    if (rng.bool(0.5)) emitReplacement(batch, rng, z0);\n\n' + sourceText.slice(end);
const instrument = text => text.replace('    // drifting wreck:', '    batch.traceStage = "wreck";\n    // drifting wreck:').replace('    // distant orbital', '    batch.traceStage = "downstream";\n    // distant orbital');
const placements = [];
const original = source.evaluate(instrument(sourceText));
const candidate = source.evaluate(instrument(replacementText), (batch, rng, z0) => emitReplacement(batch, rng, z0, templates, placement => placements.push({ ...placement, z0 })));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function traceBatch(klass) {
  for (const method of ['_emit', 'box']) {
    const implementation = klass.prototype[method];
    klass.prototype[method] = function (...args) {
      const key = args[0];
      const before = Object.fromEntries(['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'].map(field => [field, this.buckets.get(key)?.[field]?.n ?? 0]));
      const result = implementation.apply(this, args);
      if (this.traceStage === 'wreck') (this.wreckRanges ??= []).push({ key, before, after: Object.fromEntries(Object.keys(before).map(field => [field, this.buckets.get(key)?.[field]?.n ?? 0])) });
      if (this.traceStage !== 'wreck') {
        const bucket = this.buckets.get(key);
        const digest = crypto.createHash('sha256');
        for (const field of Object.keys(before)) if (bucket[field]) {
          const values = bucket[field].a.subarray(before[field], bucket[field].n);
          digest.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
        }
        (this.trace ??= []).push({ stage: this.traceStage ?? 'upstream', key, hash: digest.digest('hex') });
      }
      return result;
    };
  }
}
traceBatch(original.Batch);
traceBatch(candidate.Batch);

function run(version, seed, z0, sector) {
  const rng = new Rng(seed);
  const draws = [];
  const next = rng.next.bind(rng);
  rng.next = () => { const value = next(); draws.push(value); return value; };
  const batch = new version.Batch();
  batch.frontLift = batch.sideLift = 1.4;
  const fortress = Object.create(version.Fortress.prototype);
  fortress._voidProps(batch, rng, z0, sector);
  const final = rng._s;
  const tail = Array.from({ length: 32 }, () => rng.next());
  return { draws: draws.slice(0, -32), tail, final, trace: batch.trace ?? [], batch };
}

const trials = [];
for (const sectorIndex of [2, 4]) for (let seed = 1; seed <= 32; seed++) {
  const z0 = Math.floor((seed % 12) + (sectorIndex === 2 ? 34 : 66)) * 96;
  const sector = { index: sectorIndex, zStart: sectorIndex === 2 ? 3200 : 6350 };
  const before = run(original, seed * 7919, z0, sector);
  const after = run(candidate, seed * 7919, z0, sector);
  assert.deepEqual(after.draws, before.draws);
  assert.deepEqual(after.tail, before.tail);
  assert.equal(after.final, before.final);
  assert.deepEqual(after.trace, before.trace);
  trials.push({ sector: sectorIndex, seed: seed * 7919, z0, draws: before.draws.length, finalState: before.final, unchanged_geometry_operations: before.trace.length, unchanged_geometry_hash: hash(JSON.stringify(before.trace)), downstream_32_draw_hash: hash(JSON.stringify(before.tail)) });
}

let containedVertices = 0;
for (const template of templates) for (const data of Object.values(template.buckets)) {
  for (let offset = 0; offset < data.p.length; offset += 3) {
    const [across, up, forward] = data.p.subarray(offset, offset + 3);
    assert(forward >= 0 && forward <= 1.8);
    assert(Math.abs(across) <= .3 - .125 * forward / 1.8 + 1e-7);
    assert(Math.abs(up) <= .25 - .1 * forward / 1.8 + 1e-7);
    containedVertices++;
  }
}

const testData = templates[0].buckets.dark;
const triangle = { p: testData.p.slice(0, 9), n: testData.n.slice(0, 9), c: new Float32Array(Array.from({length: 3}, () => new THREE.Color(0x6A7482).toArray()).flat()), slots: new Int8Array([-1, -1, -1]) };
const placement = { x: -65, y: 13, z: 80, size: 17, yaw: -.43, bank: .32, embers: [], variant: 0 };
const referenceBatch = new Batch();
referenceBatch.frontLift = referenceBatch.sideLift = 1.4;
const referenceGeometry = new THREE.BufferGeometry();
referenceGeometry.setAttribute('position', new THREE.BufferAttribute(triangle.p.slice(), 3));
referenceGeometry.setAttribute('normal', new THREE.BufferAttribute(triangle.n.slice(), 3));
referenceGeometry.rotateZ(placement.bank);
referenceBatch.add('dark', referenceGeometry, placement.x, placement.y, placement.z, 12, 0x6A7482, placement.yaw);
const referenceUnit = new Batch();
referenceUnit.frontLift = referenceUnit.sideLift = 1.4;
appendWreckage(referenceUnit, [{ buckets: { dark: triangle } }], { ...placement, size: 1 });
let maximumAttributeError = 0;
for (const field of ['pos', 'nrm', 'uv', 'col']) {
  const before = referenceBatch.buckets.get('dark')[field].view();
  const after = referenceUnit.buckets.get('dark')[field].view();
  for (let index = 0; index < before.length; index++) maximumAttributeError = Math.max(maximumAttributeError, Math.abs(before[index] - after[index]));
}
assert(maximumAttributeError < 1e-5);

const dark = new THREE.MeshStandardMaterial({ color: 0x3A4A5E, metalness: .5, roughness: .46, vertexColors: true });
const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
const materials = { dark, neon };
let materialDisposals = 0;
for (const material of Object.values(materials)) material.addEventListener('dispose', () => materialDisposals++);
const disposalBatch = new Batch();
const actual = placements[0];
appendWreckage(disposalBatch, templates, actual);
const chunk = new THREE.Group();
disposalBatch.merge(key => materials[key], chunk);
assert.equal(chunk.children.length, 2);
let geometryDisposals = 0;
for (const item of chunk.children) {
  item.geometry.addEventListener('dispose', () => geometryDisposals++);
  if (item.material === neon) {
    const animation = item.geometry.attributes.aAnim.array;
    const slots = templates[actual.variant].buckets.neon.slots;
    for (let vertex = 0; vertex < slots.length; vertex++) for (let channel = 0; channel < 3; channel++) assert(Math.abs(animation[vertex * 3 + channel] - actual.embers[slots[vertex]].anim[channel]) < 1e-6);
  }
}
const disposalOwner = { root: new THREE.Group(), rearObstacles: [], emitters: [], animated: [] };
disposalOwner.root.add(chunk);
Fortress.prototype._disposeChunk.call(disposalOwner, chunk);
assert.equal(geometryDisposals, 2);
assert.equal(materialDisposals, 0);
assert.equal(templates.length, 2);

const density = [];
for (const ahead of [320, 440, 560, 700]) {
  let maximumWrecks = 0, maximumTriangles = 0, maximumBytes = 0, maximumBuckets = 0;
  let totalWrecks = 0, samples = 0;
  for (let fieldSeed = 1; fieldSeed <= 12; fieldSeed++) {
    const field = [];
    for (let index = 0; index < 24; index++) {
      const rng = new Rng((Math.imul(index, 2654435761) + fieldSeed * 1009) >>> 0);
      const batch = new candidate.Batch();
      const captured = [];
      const localVersion = source.evaluate(replacementText, (current, random, z0) => emitReplacement(current, random, z0, templates, point => captured.push(point)));
      Object.create(localVersion.Fortress.prototype)._voidProps(batch, rng, index * 96, { index: -1 });
      const count = captured.length;
      const triangles = captured.reduce((sum, point) => sum + document.variants[point.variant].triangles, 0);
      const bytes = captured.reduce((sum, point) => {
        const data = templates[point.variant].buckets;
        return sum + data.dark.p.length / 3 * 44 + data.neon.p.length / 3 * 56;
      }, 0);
      field.push({ count, triangles, bytes });
    }
    for (let position = 192; position < 1440; position += 24) {
      const first = Math.floor((position - 90) / 96), last = Math.floor((position + ahead) / 96);
      const active = field.slice(first, last + 1);
      const count = active.reduce((sum, item) => sum + item.count, 0);
      totalWrecks += count; samples++;
      maximumWrecks = Math.max(maximumWrecks, count);
      maximumTriangles = Math.max(maximumTriangles, active.reduce((sum, item) => sum + item.triangles, 0));
      maximumBytes = Math.max(maximumBytes, active.reduce((sum, item) => sum + item.bytes, 0));
      maximumBuckets = Math.max(maximumBuckets, 2 * active.filter(item => item.count).length);
    }
  }
  density.push({ ahead, behind: 90, sampled_windows: samples, mean_wrecks: totalWrecks / samples, maximum_observed_wrecks: maximumWrecks, maximum_observed_triangles: maximumTriangles, maximum_observed_wreck_attribute_bytes: maximumBytes, maximum_observed_occupied_wreck_chunk_buckets: maximumBuckets });
}

const cameraText = fs.readFileSync(path.join(root, 'src/game/CameraRig.js'), 'utf8');
const settingsText = fs.readFileSync(path.join(root, 'src/core/Settings.js'), 'utf8');
const settings = new Function('clamp', 'localStorage', 'matchMedia', 'navigator', settingsText.replace(/^import .*$/gm, '').replaceAll('export ', '') + '\nreturn settings;')(source.clamp, { getItem: () => null, setItem: () => {} }, () => ({ matches: false }), { hardwareConcurrency: 8, deviceMemory: 8 });
const FlightCamera = new Function('THREE', fs.readFileSync(path.join(root, 'src/core/FlightCamera.js'), 'utf8').replace(/^import .*$/gm, '').replaceAll('export ', '') + '\nreturn FlightCamera;')(THREE);
const CameraRig = new Function('THREE', 'settings', 'damp', 'clamp', 'noise1', 'DEG', cameraText.replace(/^import .*$/gm, '').replaceAll('export ', '') + '\nreturn CameraRig;')(THREE, settings, source.damp, source.clamp, source.noise1, source.DEG);
const cameras = [];
for (const mode of ['classic', 'modern', 'chase']) {
  settings.values.camera = mode;
  const camera = new FlightCamera(58, 16 / 9, .1, 1800);
  const rig = new CameraRig(camera);
  rig.snap({ pos: new THREE.Vector3(0, 9, 0), velocity: new THREE.Vector3() });
  cameras.push({ mode, position: camera.position.toArray(), lookAt: rig.lookAt.toArray(), fov: camera.fov, orthographic: camera.isOrthographicCamera, halfHeight: camera.halfHeight, aspect: camera.aspect, projection: camera.projectionMatrix.toArray(), rig: settings.cameraRig });
}

const displayPlacements = [];
const projectionCameras = cameras.map(data => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.fromArray(data.position);
  camera.lookAt(new THREE.Vector3().fromArray(data.lookAt));
  camera.projectionMatrix.fromArray(data.projection);
  camera.updateMatrixWorld(true);
  return camera;
});
function fitsSourceViews(point) {
  const cosBank = Math.cos(point.bank), sinBank = Math.sin(point.bank);
  const cosYaw = Math.cos(point.yaw), sinYaw = Math.sin(point.yaw);
  for (const data of Object.values(templates[point.variant].buckets)) for (let offset = 0; offset < data.p.length; offset += 3) {
    const across = point.size * (data.p[offset] * cosBank - data.p[offset + 1] * sinBank);
    const up = point.size * (data.p[offset] * sinBank + data.p[offset + 1] * cosBank);
    const forward = point.size * data.p[offset + 2];
    const position = new THREE.Vector3(across * cosYaw + forward * sinYaw + point.x, up + point.y, -across * sinYaw + forward * cosYaw + point.z);
    for (const camera of projectionCameras) {
      const clip = position.clone().project(camera);
      if (Math.abs(clip.x) > .91 || Math.abs(clip.y) > .79 || clip.z < -1 || clip.z > 1) return false;
    }
  }
  return true;
}
for (let seed = 1; seed < 16000 && displayPlacements.length < 2; seed++) {
  const rng = new Rng(seed);
  const captured = [];
  const local = source.evaluate(replacementText, (batch, random, z0) => emitReplacement(batch, random, z0, templates, point => captured.push(point)));
  Object.create(local.Fortress.prototype)._voidProps(new local.Batch(), rng, displayPlacements.length * 96, { index: -1 });
  const point = captured[0];
  if (point && !displayPlacements.some(other => other.variant === point.variant) && fitsSourceViews(point)) displayPlacements.push({ ...point, source_rng_seed: seed, chunk_z0: displayPlacements.length * 96 });
}
assert.equal(displayPlacements.length, 2);
const sceneBatch = new Batch();
sceneBatch.frontLift = sceneBatch.sideLift = 1.4;
for (const point of displayPlacements) appendWreckage(sceneBatch, templates, point);
const scene = { label: 'OFFLINE EEVEE — actual source camera math and Batch geometry; no WebGL acceptance', cameras, player: { pos: [0, 9, 0], scale: 1 }, placements: displayPlacements, buckets: Object.fromEntries([...sceneBatch.buckets].map(([key, bucket]) => [key, { p: Array.from(bucket.pos.view()), n: Array.from(bucket.nrm.view()), c: Array.from(bucket.col.view()), anim: bucket.anim ? Array.from(bucket.anim.view()) : null }])) };
scene.source_baseline_buckets = { dark: { p: [], n: [], c: [], anim: null }, neon: { p: [], n: [], c: [], anim: [] } };
for (const point of displayPlacements) {
  const baseline = run(original, point.source_rng_seed, point.chunk_z0, { index: -1 }).batch;
  for (const range of baseline.wreckRanges ?? []) {
    const bucket = baseline.buckets.get(range.key);
    const output = scene.source_baseline_buckets[range.key];
    for (const [field, attribute] of [['p', 'pos'], ['n', 'nrm'], ['c', 'col'], ['anim', 'anim']]) if (bucket[attribute]) output[field].push(...bucket[attribute].a.subarray(range.before[attribute], range.after[attribute]));
  }
}
fs.writeFileSync(path.join(payload, 'checks/world-scene.json'), JSON.stringify(scene) + '\n');
const transformedBounds = [];
for (let variant = 0; variant < templates.length; variant++) for (const size of [10, 22]) for (const bank of [-.6, 0, .6]) for (const yaw of [-.8, 0, .8]) {
  const measured = new Batch();
  appendWreckage(measured, templates, { x: 0, y: 0, z: 0, size, bank, yaw, variant, embers: Array.from({ length: 4 }, () => ({ anim: [4, 1, 0] })) });
  const all = [...measured.buckets.values()].flatMap(bucket => Array.from(bucket.pos.view()));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < all.length; offset += 3) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], all[offset + axis]); max[axis] = Math.max(max[axis], all[offset + axis]); }
  transformedBounds.push({ variant: templates[variant].name, size, bank, yaw, min, max });
}
fs.writeFileSync(path.join(payload, 'checks/transformed-bounds.json'), JSON.stringify({ axes: 'game X/Y/Z, pivot-relative; add ORIGINAL placement to obtain world AABB', sampled_evaluated_bounds_not_continuous_extrema: transformedBounds, continuous_proof: 'All cached vertices inside convex source hull, hence transformed full-envelope containment for every allowed continuous bank/yaw/size. See source-measurements.json for clearance; no narrowed gameplay ranges.' }, null, 2) + '\n');
const templateBytes = templates.reduce((sum, template) => sum + Object.values(template.buckets).reduce((subtotal, data) => subtotal + Object.values(data).reduce((count, array) => count + array.byteLength, 0), 0), 0);
const results = {
  status: 'PASS — CPU Three.js actual source Batch; not a WebGL/GPU test', three_version: THREE.REVISION,
  changed_source_region_only: { prefix_sha256: hash(sourceText.slice(0, start)), suffix_sha256: hash(sourceText.slice(end)), production_files_modified: false },
  exact_rng_and_unchanged_geometry_trials: trials, selected_variants: [placements.filter(point => point.variant === 0).length, placements.filter(point => point.variant === 1).length],
  envelope: { contained_template_vertices: containedVertices, proof: 'Each vertex lies in convex nominal source tapered hull; triangle interiors and all uniform-size/bank/yaw/translations therefore remain in its transformed volume. Original rib/ember envelope is not expanded. Continuous source clearance is in source-measurements.json.' },
  source_batch_transform_uv_ao_fixture_maximum_attribute_error: maximumAttributeError,
  merged_wreck_primitives: chunk.children.length, chunk_geometry_disposal_events: geometryDisposals, shared_material_disposal_events: materialDisposals,
  cached_template_typed_array_bytes: templateBytes,
  retained_typed_array_packing: 'Float32 p/n/c (36 bytes/vertex) + Int8 slot (1 byte/vertex). Chunk merged dark is 44 bytes/vertex, neon 56 bytes/vertex. No index, driver allocations, geometry objects, shared buffers, allocator capacity, unrelated source geometry or textures included.',
  density_proxy: density, density_limit: 'Finite synthetic void-only seeds/windows, landmarks excluded. Not an asserted live maximum, measured GPU memory or measured draw-call performance. Existing dark/neon buckets may already exist; never creates per-part draws.',
  neon_aAnim: 'All 24 emitted neon vertices independently checked against original four FLICKER mode/rate/phase draws; gain 1.4. Legacy width/offset draws consumed, not used: ember faces are fitted to torn shell instead of floating boxes.',
  camera_test_doubles: ['localStorage empty stand-in', 'matchMedia non-coarse stand-in', 'navigator hardwareConcurrency/deviceMemory stand-in; no renderer or WebGL context'],
  source_lighting: 'deepspace for sector 2 and void for sector 4; render scripts label analytic environment/hemisphere/fog approximations',
  formal_reviews: 0, formal_fix_passes: 0, pending_deferred_opus_review: true,
};
releaseWreckageTemplates(templates);
assert.equal(templates.length, 0);
results.shutdown_cache_release = true;
fs.writeFileSync(path.join(payload, 'checks/runtime-proof.json'), JSON.stringify(results, null, 2) + '\n');
fs.writeFileSync(path.join(payload, 'source/Fortress-wreck-branch.recipe.txt'), 'Inside the EXISTING rng.bool(0.5) branch, replace only its body with:\n  emitReplacement(batch, rng, z0, preparedWreckageTemplates);\nKeep the if test itself. Import the helper once; prepare Float32 templates before Game construction.\nNo other source change, spawn logic, RNG call, shader clock, material clone or per-wreck root.\nThis is a CPU-proven integration recipe, not installed production code.\n');
console.log(JSON.stringify({ trials: trials.length, variants: results.selected_variants, templateBytes, maximumAttributeError, scene: displayPlacements.map(point => ({ variant: point.variant, seed: point.source_rng_seed, x: point.x, y: point.y, z: point.z })) }));
