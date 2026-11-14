import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { payload, repo, threeRoot, THREE, sourceModule, expose, geometryData, bounds, saveJson } from './source-loader.mjs';
import { loadKit, prototypeTransform, retireChunk } from '../source/adapter.mjs';
import { cameraAt } from './cameras.mjs';

const baseline = JSON.parse(fs.readFileSync(path.join(payload, 'measurements/baseline.json')));
const adapterUrl = pathToFileURL(path.join(payload, 'source/adapter.mjs')).href;
globalThis.__asteroidKit = await loadKit(THREE, threeRoot, fs.readFileSync(path.join(payload, 'assets/asteroid-scenery-kit.glb')));
const kit = globalThis.__asteroidKit;
const { Fortress: LegacyFortress, Batch: LegacyBatch } = await import(await sourceModule('src/world/Fortress.js', expose));
const { Fortress, Batch } = await import(await sourceModule('src/world/Fortress.js', text => expose(prototypeTransform(text, adapterUrl)), 'adapter'));
const { Level } = await import(await sourceModule('src/world/Level.js'));
const { Rng } = await import(await sourceModule('src/core/Utils.js'));
class CountingRng extends Rng { calls = 0; next() { this.calls++; return super.next(); } }
const hashGeometry = geometry => {
  const digest = crypto.createHash('sha256');
  for (const key of Object.keys(geometry.attributes).sort()) digest.update(key).update(Buffer.from(geometry.attributes[key].array.buffer));
  if (geometry.index) digest.update(Buffer.from(geometry.index.array.buffer));
  return digest.digest('hex');
};
const mergedHash = group => {
  const rows = [];
  group.traverse(object => { if (object.isMesh) rows.push({ material: object.material.name, hash: hashGeometry(object.geometry) }); });
  return rows;
};
const worldPoints = rock => {
  const geometry = kit.templates.find(template => template.name === rock.node).geometry;
  const position = geometry.attributes.position;
  const points = [];
  for (let vertex = 0; vertex < position.count; vertex++) points.push(new THREE.Vector3(position.getX(vertex) * rock.s * rock.shape.sx, position.getY(vertex) * rock.s * rock.shape.sy, position.getZ(vertex) * rock.s * rock.shape.sz));
  return points;
};
function measured(rock) {
  const points = worldPoints(rock);
  const box = new THREE.Box3().setFromPoints(points);
  const pivot = new THREE.Vector3(rock.x, rock.y, rock.z);
  const axis = new THREE.Vector3(...rock.spin.slice(0, 3));
  const spinBox = new THREE.Box3();
  let radius = 0;
  for (const point of points) {
    radius = Math.max(radius, point.length());
    const center = axis.clone().multiplyScalar(point.dot(axis));
    const perpendicular = point.clone().sub(center);
    const cross = new THREE.Vector3().crossVectors(axis, point);
    const extent = new THREE.Vector3(Math.hypot(perpendicular.x, cross.x), Math.hypot(perpendicular.y, cross.y), Math.hypot(perpendicular.z, cross.z));
    spinBox.expandByPoint(center.clone().sub(extent).add(pivot));
    spinBox.expandByPoint(center.clone().add(extent).add(pivot));
  }
  const prismDistance = Math.hypot(Math.max(Math.abs(rock.x) - 16, 0), Math.max(1.3 - rock.y, rock.y - 25, 0));
  return { radius, restBounds: { min: box.min.add(pivot).toArray(), max: box.max.add(pivot).toArray() },
    fullSpinBounds: { min: spinBox.min.toArray(), max: spinBox.max.toArray() }, prismSphereClearance: prismDistance - radius };
}

const results = [];
let customAttributeVertices = 0;
let followingGeometryMatches = 0;
const variantCounts = Object.fromEntries(kit.templates.map(template => [template.name, 0]));
for (const reference of baseline.chunks) {
  const level = new Level(reference.seed);
  const fortress = new Fortress(new THREE.Scene(), {}, level, { drawDistance: 700 });
  const sector = level.sectorAt(reference.index * 96 + 48);
  const rng = new CountingRng((reference.index * 2654435761 + reference.seed) >>> 0);
  const batch = new Batch();
  const rocks = [];
  globalThis.__asteroidStamp = rock => rocks.push(rock);
  fortress._voidProps(batch, rng, reference.index * 96, sector);
  assert.equal(rng._s, reference.finalState);
  assert.equal(rng.calls, reference.calls);
  assert.deepEqual([rng.next(), rng.next(), rng.next()], reference.nextValues);
  assert.equal(rocks.length, reference.count);
  for (const rock of rocks) {
    const previous = reference.rocks[rock.ordinal];
    for (const key of ['x', 'y', 'z', 's', 'tint', 'spin', 'shape', 'callsAtAdd', 'stateAtAdd']) assert.deepEqual(rock[key], previous[key], key);
    assert.equal(rock.legacyDetail === 2 ? 180 : 80, previous.triangles);
    Object.assign(rock, measured(rock), { sourceRadius: previous.radius, sourceRestBoundsLocal: previous.boundsLocal });
    variantCounts[rock.node]++;
  }
  const group = new THREE.Group();
  batch.merge(key => new THREE.MeshBasicMaterial({ name: key }), group, false, false);
  const nonRock = {};
  const rockMeshes = group.children.filter(mesh => mesh.material.name === 'rock');
  assert.equal(rockMeshes.length, 1);
  const rockMesh = rockMeshes[0];
  assert.equal(rockMesh.frustumCulled, false);
  const attributes = rockMesh.geometry.attributes;
  assert.equal(attributes.position.count, rocks.reduce((sum, rock) => sum + rock.triangles * 3, 0));
  let cursor = 0;
  for (const rock of rocks) {
    const template = kit.templates.find(template => template.name === rock.node).geometry;
    const tint = new THREE.Color(rock.tint);
    for (let corner = 0; corner < rock.triangles * 3; corner++) {
      const vertex = template.index ? template.index.getX(corner) : corner;
      assert.equal(attributes.aPivot.getX(cursor), Math.fround(rock.x));
      assert.equal(attributes.aPivot.getY(cursor), Math.fround(rock.y));
      assert.equal(attributes.aPivot.getZ(cursor), Math.fround(rock.z));
      for (let component = 0; component < 4; component++) assert.equal(attributes.aSpin.array[cursor * 4 + component], Math.fround(rock.spin[component]));
      for (let component = 0; component < 3; component++) {
        const expected = Math.fround(Math.fround(tint.toArray()[component]) * template.attributes.color.array[vertex * template.attributes.color.itemSize + component]);
        assert.equal(attributes.color.array[cursor * 3 + component], expected);
      }
      cursor++;
    }
  }
  customAttributeVertices += cursor;
  for (const mesh of group.children) if (mesh.material.name !== 'rock') nonRock[mesh.material.name] = hashGeometry(mesh.geometry);
  assert.deepEqual(nonRock, reference.nonRockBuckets);
  followingGeometryMatches++;
  results.push({ seed: reference.seed, index: reference.index, count: rocks.length, triangles: rocks.reduce((sum, rock) => sum + rock.triangles, 0), rocks });
  for (const mesh of group.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
}
delete globalThis.__asteroidStamp;

const material = new THREE.MeshBasicMaterial({ name: 'shared-rock-runtime-test-double' });
const materialMap = new Map([['rock', material]]);
const materials = new Proxy({}, { get: (target, property) => {
  if (!materialMap.has(property)) materialMap.set(property, new THREE.MeshBasicMaterial({ name: property }));
  return materialMap.get(property);
} });
let fullChunkComparisons = 0;
const fullChunkRockTotals = [];
const level = new Level(42);
const legacy = new LegacyFortress(new THREE.Scene(), materials, level, { drawDistance: 700 });
const adapted = new Fortress(new THREE.Scene(), materials, level, { drawDistance: 700 });
for (const reference of baseline.chunks.filter(chunk => chunk.seed === 42)) {
  const sourceGroup = legacy._buildChunk(reference.index);
  const adapterGroup = adapted._buildChunk(reference.index);
  const sourceRows = [], adapterRows = [];
  for (const [group, rows] of [[sourceGroup, sourceRows], [adapterGroup, adapterRows]]) group.traverse(object => {
    if (!object.isMesh) return;
    if (object.material === material && object.parent === group) return;
    rows.push(hashGeometry(object.geometry));
  });
  assert.deepEqual(sourceRows, adapterRows, `following features in chunk ${reference.index}`);
  const rockTotals = group => {
    let triangles = 0, buckets = 0;
    group.traverse(object => { if (object.isMesh && object.material === material) {
      triangles += (object.geometry.index?.count || object.geometry.attributes.position.count) / 3; buckets++;
    } });
    return { triangles, buckets };
  };
  fullChunkRockTotals.push({ seed: 42, index: reference.index, source: rockTotals(sourceGroup), adapter: rockTotals(adapterGroup),
    note: 'Complete source chunk rock meshes, including unmodified ring and obstacle-owned debrisGate featureBatch buckets when present.' });
  legacy._disposeChunk(sourceGroup);
  adapted._disposeChunk(adapterGroup);
  fullChunkComparisons++;
}
assert.equal(JSON.stringify(level.colliders), JSON.stringify(new Level(42).colliders));
let gateRingComparisons = 0;
for (const feature of level.features.filter(feature => feature.kind === 'debrisRing')) {
  const groups = [];
  const states = [];
  for (const [fortress, BatchClass] of [[legacy, LegacyBatch], [adapted, Batch]]) {
    const batch = new BatchClass(), rng = new CountingRng(feature.seed || 12345), group = new THREE.Group();
    fortress._debrisRing(batch, feature, rng);
    batch.merge(key => new THREE.MeshBasicMaterial({ name: key }), group, false, false);
    groups.push(group); states.push([rng.calls, rng._s]);
  }
  assert.deepEqual(mergedHash(groups[0]), mergedHash(groups[1]));
  assert.deepEqual(states[0], states[1]);
  for (const group of groups) group.traverse(object => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });
  gateRingComparisons++;
}

let templateDisposals = 0, materialDisposals = 0, chunkDisposals = 0;
for (const template of kit.templates) template.geometry.addEventListener('dispose', () => templateDisposals++);
material.addEventListener('dispose', () => materialDisposals++);
const disposalParent = new THREE.Group(), disposalGroup = new THREE.Group();
disposalParent.add(disposalGroup);
const disposalGeometry = new THREE.BufferGeometry();
disposalGeometry.addEventListener('dispose', () => chunkDisposals++);
disposalGroup.add(new THREE.Mesh(disposalGeometry, material), new THREE.Mesh(disposalGeometry, material));
retireChunk(disposalGroup, disposalParent);
retireChunk(disposalGroup, disposalParent);
assert.equal(chunkDisposals, 1);
assert.equal(templateDisposals, 0);
assert.equal(materialDisposals, 0);
kit.shutdown(); kit.shutdown();
assert.equal(templateDisposals, 3);

const allRocks = results.flatMap(chunk => chunk.rocks);
const clearanceSamples = [];
for (const mode of ['classic', 'modern', 'chase']) {
  let worstEye = { clearance: Infinity }, worstSight = { clearance: Infinity }, newEyeCandidates = 0, newSightCandidates = 0, samples = 0;
  for (const chunk of results) for (const phase of [0, 48, 95]) for (const x of [-16, 0, 16]) for (const y of [1.3, 9, 25]) {
    const z = chunk.index * 96 + phase;
    const { camera } = cameraAt(mode, z, 700, x, y);
    const candidateRocks = results.filter(other => other.seed === chunk.seed && Math.abs(other.index - chunk.index) <= 2).flatMap(other => other.rocks);
    const player = new THREE.Vector3(x, y, z);
    const segment = new THREE.Line3(camera.position, player);
    for (const rock of candidateRocks) {
      const center = new THREE.Vector3(rock.x, rock.y, rock.z);
      const eyeDistance = center.distanceTo(camera.position);
      const lineDistance = center.distanceTo(segment.closestPointToPoint(center, true, new THREE.Vector3()));
      const eye = eyeDistance - rock.radius - .35;
      const sight = lineDistance - rock.radius - 3;
      if (eye < worstEye.clearance) worstEye = { clearance: eye, seed: chunk.seed, index: chunk.index, ordinal: rock.ordinal, player: [x, y, z], eye: camera.position.toArray() };
      if (sight < worstSight.clearance) worstSight = { clearance: sight, seed: chunk.seed, index: chunk.index, ordinal: rock.ordinal, player: [x, y, z] };
      if (eye <= 0 && eyeDistance - rock.sourceRadius - .35 > 0) newEyeCandidates++;
      if (sight <= 0 && lineDistance - rock.sourceRadius - 3 > 0) newSightCandidates++;
      samples++;
    }
  }
  clearanceSamples.push({ mode, sampledRockCameraPairs: samples, worstEyeSphereClearance: worstEye, worstThreeUnitSightCapsuleClearance: worstSight, newEyeSphereCandidatesVersusSource: newEyeCandidates, newSightCapsuleCandidatesVersusSource: newSightCandidates });
}
const aggregate = [320, 440, 560, 700].map(distance => {
  const rows = results.map(chunk => {
    const z = chunk.index * 96 + 48, first = Math.floor((z - 90) / 96), last = Math.floor((z + distance) / 96);
    const active = results.filter(other => other.seed === chunk.seed && other.index >= first && other.index <= last);
    return { rocks: active.reduce((sum, item) => sum + item.count, 0), triangles: active.reduce((sum, item) => sum + item.triangles, 0), buckets: active.length };
  });
  const stats = key => ({ min: Math.min(...rows.map(row => row[key])), max: Math.max(...rows.map(row => row[key])), mean: rows.reduce((sum, row) => sum + row[key], 0) / rows.length });
  const requestedMax = Math.ceil((distance + 90) / 96) + 1;
  return { distance, samples: rows.length, residentRocks: stats('rocks'), residentTriangles: stats('triangles'), rockBuckets: stats('buckets'),
    theoreticalAllSpaceRequested: { chunks: requestedMax, rocks: requestedMax * 9, triangles: requestedMax * 9 * 480 },
    theoreticalRetained: { chunks: requestedMax + 3, rocks: (requestedMax + 3) * 9, triangles: (requestedMax + 3) * 9 * 480,
      uploadBytesUpperBound: (requestedMax + 3) * 9 * 480 * 3 * 18 * 4 } };
});
const completeRockWindowProxy = [320, 440, 560, 700].map(distance => {
  const rows = fullChunkRockTotals.map(chunk => {
    const z = chunk.index * 96 + 48, first = Math.floor((z - 90) / 96), last = Math.floor((z + distance) / 96);
    const window = fullChunkRockTotals.filter(other => other.index >= first && other.index <= last);
    return { index: chunk.index, sourceTriangles: window.reduce((sum, row) => sum + row.source.triangles, 0),
      kitTriangles: window.reduce((sum, row) => sum + row.adapter.triangles, 0),
      sourceRockMeshes: window.reduce((sum, row) => sum + row.source.buckets, 0),
      kitRockMeshes: window.reduce((sum, row) => sum + row.adapter.buckets, 0) };
  });
  return { distance, seed: 42, sampleWindows: rows.length, maximumSourceTriangles: Math.max(...rows.map(row => row.sourceTriangles)),
    maximumKitTriangles: Math.max(...rows.map(row => row.kitTriangles)), maximumSourceRockMeshes: Math.max(...rows.map(row => row.sourceRockMeshes)),
    maximumKitRockMeshes: Math.max(...rows.map(row => row.kitRockMeshes)),
    note: 'Space-chunk windows only, includes unchanged barrier/ring rocks in those chunks. Not a whole-game or all-retained benchmark.', rows };
});
const summary = {
  status: 'pending_deferred_opus_review', formalReviewPasses: 0, formalFixPasses: 0,
  actualBatch: true, runtimeWebGL: false, followingGeometryMatches, fullChunkComparisons, gateRingComparisons,
  fullChunkRockTotalsIncludingUnchangedRings: fullChunkRockTotals,
  customAttributeVertices, rngCallsAndFollowingValuesExact: true, allPlacementsRadiusTintAxisSpeedExact: true,
  nonRockFollowingMergedBuffersByteExact: true, sourceGateAndWallRockCallsitesUnmodified: true,
  variantCounts, chunkTriangleRange: [Math.min(...results.map(row => row.triangles)), Math.max(...results.map(row => row.triangles))],
  meanChunkTriangles: results.reduce((sum, row) => sum + row.triangles, 0) / results.length,
  actualFullSpinRadius: [Math.min(...allRocks.map(rock => rock.radius)), Math.max(...allRocks.map(rock => rock.radius))],
  minimumGameplayPrismSphereClearance: Math.min(...allRocks.map(rock => rock.prismSphereClearance)),
  conservativeGameplayPrismSphereCandidates: allRocks.filter(rock => rock.prismSphereClearance <= 0).length,
  clearanceSamples, aggregate, completeRockWindowProxy,
  disposal: { chunkUniqueGeometryEvents: chunkDisposals, templateEventsBeforeShutdown: 0, templateEventsAfterTwoShutdownCalls: templateDisposals, sharedRuntimeMaterialEvents: materialDisposals },
  limitations: ['CPU actual-source prototype; MeshBasicMaterial test double avoids DOM canvas Materials construction, not a live shader or GPU timing test.',
    'Sphere and 3-unit sight capsule candidates overestimate mesh overlap. Negative clearance is not proof of actual occlusion; no claim of all-seed camera safety.',
    'Full-spin per-axis bounds are analytic for triangles under Rodrigues rotation; placement values are not normalized or rescaled to improve comparisons.',
    'Gate ring and wall rocks remain legacy source topology. Boundary non-space chunks and transient retained chunks differ from all-space proxy.',
    'Aggregate counts are asteroid-only, not whole-game triangles, memory, draw calls, or FPS.']
};
saveJson('measurements/prototype.json', { summary, chunks: results });
const evidenceChunks = results.filter(chunk => chunk.seed === 42);
saveJson('measurements/world-scene.json', {
  seed: 42, chunks: evidenceChunks, templates: kit.templates.map(template => ({ name: template.name, ...geometryData(template.geometry), color: Array.from(template.geometry.attributes.color.array), colorItemSize: template.geometry.attributes.color.itemSize })),
  playerGlb: 'public/models/player.glb', playerSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, 'public/models/player.glb'))).digest('hex'),
  cameras: ['classic', 'modern', 'chase'].map(mode => cameraAt(mode, 3648, 700).data),
});
console.log(JSON.stringify(summary, null, 2));
