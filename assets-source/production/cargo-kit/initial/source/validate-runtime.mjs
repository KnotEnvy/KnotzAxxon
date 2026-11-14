import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadSource, recorder, triangleCount, summarize } from './source-harness.mjs';
import { prepareCargoKit } from './cargo-runtime.mjs';

const initial = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(initial, '../../..');
const source = await loadSource(repo, process.env.THREE_ROOT);
const { Batch, Fortress, Rng, THREE, THEMES, level } = source;
const { GLTFLoader } = await import(pathToFileURL(path.join(process.env.THREE_ROOT, 'examples/jsm/loaders/GLTFLoader.js')).href);
const bytes = fs.readFileSync(path.join(initial, 'asset/cargo-kit.glb'));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
let activeRecords = null;
const original = Fortress.prototype._crates;
const kit = prepareCargoKit({ THREE, gltf, originalCrates(batch, ...args) {
  return original.call(this, activeRecords ? recorder(batch, activeRecords) : batch, ...args);
} });
class TraceRng extends Rng {
  constructor(seed) { super(seed); this.trace = []; this.intTests = []; }
  next() { const value = super.next(); this.trace.push([this._s, value]); return value; }
  int(lo, hi) { const result = super.int(lo, hi); this.intTests.push({ draw: this.trace.length, lo, hi, result }); return result; }
}
function hash(values) {
  return crypto.createHash('sha256').update(Buffer.from(new Float32Array(values).buffer)).digest('hex');
}
function offsets(batch) {
  return Object.fromEntries([...batch.buckets].map(([name, bucket]) => [name, Object.fromEntries(['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'].filter(key => bucket[key]).map(key => [key, bucket[key].n]))]));
}
function snapshot(batch) {
  return Object.fromEntries([...batch.buckets].map(([name, bucket]) => [name, Object.fromEntries(['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'].filter(key => bucket[key]).map(key => [key, Array.from(bucket[key].a.subarray(0, bucket[key].n))]))]));
}
function removeCargo(snapshot, ranges) {
  const out = {};
  for (const [bucket, buffers] of Object.entries(snapshot)) {
    out[bucket] = {};
    for (const [name, values] of Object.entries(buffers)) {
      let start = 0;
      const selected = [];
      for (const range of ranges) {
        const begin = range.start[bucket]?.[name] ?? 0, end = range.end[bucket]?.[name] ?? 0;
        selected.push(...values.slice(start, begin));
        start = end;
      }
      selected.push(...values.slice(start));
      out[bucket][name] = hash(selected);
    }
  }
  return out;
}
function run(seed, maxH, replacement, deckIndex = null) {
  const batch = new Batch(), rng = new TraceRng(seed), records = [], ranges = [], emitters = [];
  batch.captureSurfaces = true;
  batch.frontLift = 1.16; batch.sideLift = 1.08;
  const owner = Object.create(Fortress.prototype);
  owner._crates = function (target, generator, x, z, height) {
    const start = offsets(target);
    activeRecords = records;
    if (replacement) kit.crates.call(this, target, generator, x, z, height);
    else original.call(this, recorder(target, records), generator, x, z, height);
    activeRecords = null;
    ranges.push({ start, end: offsets(target) });
  };
  if (deckIndex === null) owner._crates(batch, rng, maxH === 3.2 ? 21 : -19.5, 32, maxH);
  else Fortress.prototype._deckProps.call(owner, batch, rng, 0, { index: deckIndex }, (...args) => emitters.push([...args, rng.next()]));
  const buffers = snapshot(batch), surfaces = batch.surfaces.slice(), trace = rng.trace.slice(), intTests = rng.intTests.slice();
  const result = { seed, records, summary: summarize(records), ranges, buffers, surfaces, trace, intTests, state: rng._s, downstream: Array.from({ length: 8 }, () => rng.next()), emitters, triangles: triangleCount(batch), buckets: [...batch.buckets.keys()] };
  batch.merge(() => ({}), { add(mesh) { mesh.geometry.dispose(); } });
  return result;
}
function compare(before, after) {
  for (const key of ['records', 'surfaces', 'trace', 'intTests', 'state', 'downstream', 'emitters', 'buckets']) assert.deepEqual(after[key], before[key], key);
  assert.deepEqual(removeCargo(after.buffers, after.ranges), removeCargo(before.buffers, before.ranges), 'all non-cargo buffer bytes');
  for (const buffers of Object.values(after.buffers)) for (const values of Object.values(buffers)) assert(values.every(Number.isFinite));
  assert.equal(after.triangles - before.triangles, after.summary.crates * (156 - 12) + after.summary.drums * (180 - 40));
}
const roots = [];
for (const seed of [1, 7, 42, 123]) {
  const before = run(seed, 3.2, false), after = run(seed, 3.2, true);
  compare(before, after);
  roots.push({ seed, ...after.summary, originalTriangles: before.triangles, kitTriangles: after.triangles, leafDraws: after.trace.length, loopTests: after.intTests, downstream: after.downstream, bucket: after.buckets, surfaces: after.surfaces, records: after.records });
}
const parity = [];
const density = {};
for (const index of [0, 1, 3, 5, 6]) {
  const counts = [];
  for (let seed = 1; seed <= 48; seed++) {
    const before = run(seed, 0, false, index), after = run(seed, 0, true, index);
    compare(before, after);
    counts.push(after.summary);
  }
  parity.push({ theme: THEMES[index].name, seeds: 48, actualBuilders: true, actualBatch: true, exact: ['leaf RNG trace', 'loop-test int order', 'post-call RNG state and next 8 draws', 'all pose/tint arguments', 'surface records', 'emitter arguments and RNG', 'all non-cargo downstream pos/nrm/uv/col/anim/pivot/spin bytes'], pass: true });
  density[THEMES[index].name] = { samples: 48, averageCrates: counts.reduce((sum, entry) => sum + entry.crates, 0) / counts.length, averageDrums: counts.reduce((sum, entry) => sum + entry.drums, 0) / counts.length, maxCrates: Math.max(...counts.map(entry => entry.crates)), maxDrums: Math.max(...counts.map(entry => entry.drums)) };
}
const transformed = [];
const sourceDrumPositions = source.TPL.drum.attributes.position;
const ringMap = new Map();
for (let vertex = 0; vertex < sourceDrumPositions.count; vertex++) {
  const x = sourceDrumPositions.getX(vertex), z = sourceDrumPositions.getZ(vertex);
  if (Math.hypot(x, z) > 0.99) ringMap.set(`${Math.round(x * 1e6)},${Math.round(z * 1e6)}`, [x, z]);
}
const sourceRing = [...ringMap.values()].sort((left, right) => Math.atan2(left[0], left[1]) - Math.atan2(right[0], right[1]));
assert.equal(sourceRing.length, 10);
let maxActualSourceDrumHalfplaneError = -Infinity;
const detailedDrumPositions = kit.templates.get('CargoDrum_Fitted').attributes.position;
for (let edge = 0; edge < sourceRing.length; edge++) {
  const first = sourceRing[edge], second = sourceRing[(edge + 1) % sourceRing.length];
  const nx = first[1] - second[1], nz = second[0] - first[0], distance = Math.hypot(nx, nz);
  for (let vertex = 0; vertex < detailedDrumPositions.count; vertex++) {
    const error = (nx * (detailedDrumPositions.getX(vertex) - first[0]) + nz * (detailedDrumPositions.getZ(vertex) - first[1])) / distance;
    maxActualSourceDrumHalfplaneError = Math.max(maxActualSourceDrumHalfplaneError, error);
  }
}
assert(maxActualSourceDrumHalfplaneError < 1e-7);
for (const maxH of [1.9, 3.2]) for (const seed of [1, 7, 42, 123, 2738]) {
  const output = run(seed, maxH, true);
  for (const record of output.records) {
    const args = record.args;
    const isCrate = record.kind === 'crate';
    const template = kit.templates.get(isCrate ? 'CargoCrate_Fitted' : 'CargoDrum_Fitted');
    const [scaleX, scaleY, scaleZ, x, y, z, yaw] = isCrate ? [args[1], args[2], args[3], args[4], args[5], args[6], args[9]] : [args[7].sx, args[7].sy, args[7].sz, args[2], args[3], args[4], args[7].rotY ?? 0];
    const point = new THREE.Vector3(), lower = [Infinity, Infinity, Infinity], upper = [-Infinity, -Infinity, -Infinity];
    for (let vertex = 0; vertex < template.attributes.position.count; vertex++) {
      point.fromBufferAttribute(template.attributes.position, vertex);
      if (isCrate) assert(Math.abs(point.x) <= 0.500001 && Math.abs(point.z) <= 0.500001);
      else for (let edge = 0; edge < 10; edge++) assert(point.x * Math.sin((edge + 0.5) * Math.PI / 5) + point.z * Math.cos((edge + 0.5) * Math.PI / 5) <= Math.cos(Math.PI / 10) + 1e-6);
      const world = [point.x * scaleX * Math.cos(yaw) + point.z * scaleZ * Math.sin(yaw) + x, point.y * scaleY + y, -point.x * scaleX * Math.sin(yaw) + point.z * scaleZ * Math.cos(yaw) + z];
      world.forEach((value, axis) => { lower[axis] = Math.min(lower[axis], value); upper[axis] = Math.max(upper[axis], value); });
    }
    transformed.push({ seed, maxH, kind: record.kind, scale: [scaleX, scaleY, scaleZ], position: [x, y, z], yaw, bounds: { min: lower, max: upper } });
  }
}
const uvNormalProbe = run(42, 3.2, true);
const bucket = uvNormalProbe.buffers.hull;
let uvMaxError = 0, normalLengthMaxError = 0;
for (let start = 0; start < bucket.pos.length; start += 9) {
  const arm = [0, 1, 2].map(axis => bucket.pos[start + 3 + axis] - bucket.pos[start + axis]);
  const other = [0, 1, 2].map(axis => bucket.pos[start + 6 + axis] - bucket.pos[start + axis]);
  const absolute = [Math.abs(arm[1] * other[2] - arm[2] * other[1]), Math.abs(arm[2] * other[0] - arm[0] * other[2]), Math.abs(arm[0] * other[1] - arm[1] * other[0])];
  const plane = absolute[0] >= absolute[1] && absolute[0] >= absolute[2] ? 0 : absolute[1] >= absolute[2] ? 1 : 2;
  const crateEnd = 3 * 156 * 9;
  const uvScale = start < crateEnd ? 3 : 2;
  for (let corner = 0; corner < 3; corner++) {
    const offset = start + corner * 3, vertex = offset / 3;
    const expected = [bucket.pos[offset + (plane === 0 ? 2 : 0)] / uvScale, bucket.pos[offset + (plane === 1 ? 2 : 1)] / uvScale];
    uvMaxError = Math.max(uvMaxError, ...expected.map((value, component) => Math.abs(value - bucket.uv[vertex * 2 + component])));
    normalLengthMaxError = Math.max(normalLengthMaxError, Math.abs(Math.hypot(...bucket.nrm.slice(offset, offset + 3)) - 1));
  }
}
assert(uvMaxError < 2e-6 && normalLengthMaxError < 2e-6);
const lifetime = { chunks: 0, hullDraws: 0, chunkGeometryDisposeEvents: 0, templateDisposeEvents: 0, materialDisposeEvents: 0 };
const hullDouble = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.36, roughness: 1 });
hullDouble.addEventListener('dispose', () => lifetime.materialDisposeEvents++);
for (const template of kit.templates.values()) template.addEventListener('dispose', () => lifetime.templateDisposeEvents++);
for (let chunk = 0; chunk < 3; chunk++) {
  const batch = new Batch(), group = new THREE.Group();
  kit.crates(batch, new Rng(42), -19.5, 32 + 96 * chunk, 3.2);
  batch.merge(key => { assert.equal(key, 'hull'); return hullDouble; }, group);
  assert.equal(group.children.length, 1);
  const mesh = group.children[0];
  assert.equal(mesh.material, hullDouble);
  mesh.geometry.addEventListener('dispose', () => lifetime.chunkGeometryDisposeEvents++);
  mesh.geometry.dispose();
  group.remove(mesh);
  lifetime.chunks++; lifetime.hullDraws++;
}
assert.equal(lifetime.chunkGeometryDisposeEvents, 3);
assert.equal(lifetime.templateDisposeEvents, 0);
assert.equal(lifetime.materialDisposeEvents, 0);
const templateBytes = [...kit.templates.values()].reduce((sum, geometry) => sum + Object.values(geometry.attributes).reduce((bytes, attr) => bytes + attr.array.byteLength, 0), 0);
const worstSource = run(2738, 0, false, 1);
assert.equal(worstSource.summary.crates, 12);
assert.equal(worstSource.summary.drums, 15);
const scratchMeasurements = [];
for (const replacement of [false, true]) {
  const batch = new Batch();
  batch.buckets.set('hull', new source.Bucket('hull'));
  for (const record of worstSource.records) {
    const args = record.args;
    if (record.kind === 'crate') {
      if (replacement) batch.stamp(args[0], kit.templates.get('CargoCrate_Fitted'), args[4], args[5], args[6], args[7], args[8], { sx: args[1], sy: args[2], sz: args[3], rotY: args[9] });
      else batch.box(...args);
    } else {
      batch.stamp(args[0], replacement ? kit.templates.get('CargoDrum_Fitted') : source.TPL.drum, ...args.slice(2));
    }
  }
  const bucket = batch.buckets.get('hull');
  const usedBytes = ['pos', 'nrm', 'uv', 'col'].reduce((sum, key) => sum + bucket[key].n * 4, 0);
  const reservedBytes = ['pos', 'nrm', 'uv', 'col'].reduce((sum, key) => sum + bucket[key].a.byteLength, 0);
  scratchMeasurements.push({ version: replacement ? 'kit' : 'source', seed: 2738, cargoOnlyReplayOfActualBatteryArguments: true, crates: 12, drums: 15, triangles: triangleCount(batch), usedBytes, reservedBytes, pool: 'fresh actual source Bucket installed before replay; live shared pool may retain a larger high-water capacity from unrelated geometry' });
  batch.merge(() => ({}), { add(mesh) { mesh.geometry.dispose(); } });
}
const fullChunkParity = [];
const fullChunkMaterialDouble = new THREE.MeshStandardMaterial({ vertexColors: true });
for (const seed of [1, 7, 42, 123]) {
  const planned = new level.Level(seed);
  const collisionHash = crypto.createHash('sha256').update(JSON.stringify(planned.colliders)).digest('hex');
  for (const index of [0, 1, 3, 5, 6]) {
    const sector = planned.sectors[index], chunkIndex = Math.floor((sector.zStart + 144) / 96);
    function build(replacement) {
      const owner = new Fortress(new THREE.Scene(), new Proxy({}, { get(target, key) { return ['forceField', 'neon'].includes(key) ? () => fullChunkMaterialDouble : fullChunkMaterialDouble; } }), planned, {});
      const cargoRanges = new WeakMap(), records = [], batches = [], mergedGeometries = new Set();
      owner._crates = function (batch, rng, ...args) {
        if (!cargoRanges.has(batch)) cargoRanges.set(batch, []);
        const start = offsets(batch);
        activeRecords = records;
        if (replacement) kit.crates.call(this, batch, rng, ...args);
        else original.call(this, recorder(batch, records), rng, ...args);
        activeRecords = null;
        cargoRanges.get(batch).push({ start, end: offsets(batch) });
      };
      const merge = Batch.prototype.merge;
      Batch.prototype.merge = function (...args) {
        const buffers = snapshot(this);
        batches.push({ hashes: removeCargo(buffers, cargoRanges.get(this) ?? []), surfaces: this.surfaces.slice(), keys: [...this.buckets.keys()], triangles: triangleCount(this), bytes: [...this.buckets.values()].reduce((sum, bucket) => sum + ['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'].reduce((bytes, key) => bytes + (bucket[key]?.n ?? 0) * 4, 0), 0) });
        const existing = new Set(args[1].children);
        const result = merge.apply(this, args);
        for (const child of args[1].children) if (!existing.has(child) && child.isMesh) mergedGeometries.add(child.geometry);
        return result;
      };
      let group;
      try { group = owner._buildChunk(chunkIndex); } finally { Batch.prototype.merge = merge; }
      const emitters = owner.emitters.map(({ owner: ignored, ...entry }) => entry);
      let geometries = 0, disposeEvents = 0;
      const uniqueGeometry = new Map();
      group.traverse(object => {
        if (!object.isMesh) return;
        geometries++;
        if (!uniqueGeometry.has(object.geometry)) {
          const counter = { references: 0, events: 0 };
          uniqueGeometry.set(object.geometry, counter);
          object.geometry.addEventListener('dispose', () => { counter.events++; disposeEvents++; });
        }
        uniqueGeometry.get(object.geometry).references++;
      });
      const surfaces = group.userData.deckSurfaces;
      owner._disposeChunk(group);
      assert.equal(disposeEvents, geometries);
      for (const geometry of mergedGeometries) assert.equal(uniqueGeometry.get(geometry).events, 1);
      const inheritedRepeatedNonCargoDisposals = [...uniqueGeometry].filter(([geometry, counter]) => !mergedGeometries.has(geometry) && counter.events > 1).map(([, counter]) => counter);
      return { records, batches, emitters, surfaces, geometries, disposeEvents, inheritedRepeatedNonCargoDisposals };
    }
    const before = build(false), after = build(true);
    assert.deepEqual(after.records, before.records);
    assert.deepEqual(after.emitters, before.emitters);
    assert.deepEqual(after.surfaces, before.surfaces);
    assert.equal(after.geometries, before.geometries);
    assert.equal(after.batches.length, before.batches.length);
    for (let batch = 0; batch < before.batches.length; batch++) {
      assert.deepEqual(after.batches[batch].hashes, before.batches[batch].hashes);
      assert.deepEqual(after.batches[batch].surfaces, before.batches[batch].surfaces);
      assert.deepEqual(after.batches[batch].keys, before.batches[batch].keys);
    }
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(planned.colliders)).digest('hex'), collisionHash);
    fullChunkParity.push({ seed, theme: THEMES[index].name, chunkIndex, cargo: summarize(after.records), originalTriangles: before.batches.reduce((sum, batch) => sum + batch.triangles, 0), kitTriangles: after.batches.reduce((sum, batch) => sum + batch.triangles, 0), originalBytes: before.batches.reduce((sum, batch) => sum + batch.bytes, 0), kitBytes: after.batches.reduce((sum, batch) => sum + batch.bytes, 0), meshesBoth: after.geometries, retiredGeometryEvents: after.disposeEvents, allMergedGeometriesDisposedExactlyOnce: true, inheritedRepeatedNonCargoDisposals: after.inheritedRepeatedNonCargoDisposals, exactNonCargoBuffers: true, exactEmitterRecords: true, exactSurfaceRecords: true, colliderHash: collisionHash, pass: true });
  }
}
assert.equal(lifetime.templateDisposeEvents, 0);
assert.equal(lifetime.materialDisposeEvents, 0);
fullChunkMaterialDouble.dispose();
const residentChunkBounds = [320, 440, 560, 700].map(ahead => ({ ahead, behind: 90, conservativeChunks: Math.ceil((ahead + 90) / 96) + 1, cargoBytesAtDeclaredWorst: (Math.ceil((ahead + 90) / 96) + 1) * (12 * 156 + 15 * 180) * 132 }));
const cameras = [];
globalThis.matchMedia ??= () => ({ matches: false });
const { settings, CAMERA_MODES } = await source.loadModule('src/core/Settings.js');
const { FlightCamera } = await source.loadModule('src/core/FlightCamera.js');
const { CameraRig } = await source.loadModule('src/game/CameraRig.js');
let cameraPoses = 0;
for (const [mode, params] of Object.entries(CAMERA_MODES)) {
  settings.values.camera = mode;
  for (const aspect of [16 / 9, 9 / 16]) for (const x of [-16, 0, 16]) for (const y of [1.3, 6, 25]) {
    const camera = new FlightCamera(params.fov, aspect, 0.1, 1500), rig = new CameraRig(camera);
    const player = { pos: new THREE.Vector3(x, y, 0), velocity: new THREE.Vector3() };
    rig.snap(player);
    assert([...camera.projectionMatrix.elements, ...camera.matrixWorld.elements].every(Number.isFinite));
    const projected = [];
    for (const placement of transformed) for (const corner of [placement.bounds.min, placement.bounds.max]) {
      const point = new THREE.Vector3(...corner).project(camera);
      assert([point.x, point.y, point.z].every(Number.isFinite));
      projected.push([point.x, point.y, point.z]);
    }
    if (aspect === 16 / 9 && x === 0 && y === 6) cameras.push({ mode, aspect, player: player.pos.toArray(), eye: camera.position.toArray(), look: rig.lookAt.toArray(), fov: camera.fov, classic: camera.classic, halfHeight: camera.halfHeight, near: camera.near, far: camera.far, testedBoundsCorners: projected.length });
    cameraPoses++;
  }
}
const crateExtent = 1.1 * (Math.cos(0.3) + 1.6 * Math.sin(0.3));
const crateGap = (19.5 - 0.4 - crateExtent) - (16 + 1.5);
const drumRight = -19.5 + 2.5 + Math.sin(2 * Math.PI / 5) * 0.42;
const drumDistance = Math.hypot(-16 - drumRight, 1.3 - 1.1);
const clearance = { legalPlayerX: [-16, 16], legalPlayerY: [1.3, 25], playerSphereRadius: 1.5, controlsAndAim: 'No production edits; unchanged movement bounds, aim, collisions, rewards, targets, damage and spawn data', nearCrateWorstSourceSupportX: -19.5 + 0.4 + crateExtent, nearCrateConservativeSphereXGap: crateGap, nearDrumK1SourceCenterX: -17, nearDrumRightX: drumRight, inheritedNearDrumWitness: { playerCenter: [-16, 1.3, 31.8 + Math.cos(2 * Math.PI / 5) * 0.42], drumSurfacePoint: [drumRight, 1.1, 31.8 + Math.cos(2 * Math.PI / 5) * 0.42], distance: drumDistance, sphereSignedGap: drumDistance - 1.5 }, warning: 'Source optional near-side drums already intersect possible player-radius envelope. This kit does not enlarge them or claim complete original clearance. Decorative cargo is not a gameplay collider. Unrotated surface boxes and possible stacked overhang/intersection are inherited.' };
const renderPayload = { cameras, provenance: 'Actual source Batch world arrays / no GPU renderer / EEVEE reconstruction only', samples: {} };
for (const maxH of [1.9, 3.2]) for (const seed of [1, 7, 42, 123]) {
  const before = run(seed, maxH, false), after = run(seed, maxH, true);
  renderPayload.samples[`${maxH}-${seed}`] = { seed, maxH, records: after.records, summary: after.summary, source: before.buffers.hull, kit: after.buffers.hull };
}
fs.writeFileSync(path.join(initial, 'evidence/render-payload.json'), JSON.stringify(renderPayload));
kit.dispose(); kit.dispose();
assert.equal(lifetime.templateDisposeEvents, 2);
assert.equal(lifetime.materialDisposeEvents, 0);
hullDouble.dispose();
const report = { pass: true, runtime: process.version, three: THREE.REVISION, actualSourceBatch: true, gpuBenchmark: false, formalReview: 'pending_deferred_opus_review', formalReviewRounds: 0, formalFixRounds: 0, roots, deckParity: parity, exactDeckDensity: density, transformed, uvNormalProbe: { uvMaxError, normalLengthMaxError, AO: 'actual Batch._emit unmodified, same source tint and source front/side lifts; neutral authored multiplier 1; detailed normals intentionally change per-face response', worldProjection: true }, lifetime, ownership: 'One startup copy per template, imported GLTF geometries/materials disposed once after extraction; no per-unit roots/material clones; Batch.merge creates one chunk-owned hull mesh; templates/shared mapped hull live until application shutdown', memory: { floatsPerExpandedVertex: 11, bytesPerTriangle: 132, templateBytes, sourceWorstTriangles: 744, kitWorstTriangles: 4572, sourceWorstMergedBytes: 98208, kitWorstMergedBytes: 603504, addedWorstMergedBytes: 505296, residentChunkBounds, excludes: 'JS growable scratch buffer capacity, GL driver copies, unchanged other scenery; merged buffers retain CPU arrays as well as uploaded GPU copies; shadow pass submits hull again' }, camera: { poses: cameraPoses, projectedCornersPerPose: transformed.length * 2, finite: true, allCargoVisibleClaim: false, settingsDouble: 'headless matchMedia false, no DOM/rendering; real CameraRig and FlightCamera snap/projection', rigs: cameras }, clearance };
report.fullChunkParity = fullChunkParity;
report.actualSourceDrumContinuousContainment = { actualSourceFloat32Ring: sourceRing, maxHalfplaneError: maxActualSourceDrumHalfplaneError, source: 'actual THREE.CylinderGeometry(1,1,1,10) TPL.drum positions, not assumed circular radius', proof: 'closed convex ten-halfplane prism; all detailed vertices inside including exact shared rim vertices; affine transforms preserve containment for every original placement' };
report.memory.scratchMeasurements = scratchMeasurements;
report.memory.tenWorstCargoChunksCpuPlusGpuPlusFreshScratchAndTemplates = 10 * 603504 * 2 + scratchMeasurements[1].reservedBytes + templateBytes;
fs.writeFileSync(path.join(initial, 'evidence/runtime-validation.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, roots: roots.map(({ seed, originalTriangles, kitTriangles, leafDraws }) => ({ seed, originalTriangles, kitTriangles, leafDraws })), deckParity: parity.length * 48, templateBytes, cameraPoses, clearance, lifetime }, null, 2));
