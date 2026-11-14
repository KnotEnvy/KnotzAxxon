import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, root, output, stats, materialsDouble } from './source-harness.mjs';
import { createAntennaTemplates, disposeAntennaTemplates, emitAntenna } from './AntennaRecipe.mjs';

const templates = createAntennaTemplates(), source = Fortress.prototype._antenna;
const replacement = (batch, rng, x, z, theme) => emitAntenna(batch, rng, x, z, theme, templates);
let minimumTriangles = Infinity, maximumTriangles = 0;
function compare(seed, factory = () => new Rng(seed)) {
  const before = new Batch(), after = new Batch(), originalRng = factory(), newRng = factory();
  before.captureSurfaces = after.captureSurfaces = true;
  const originalDraws = [], newDraws = [];
  for (const [rng, draws] of [[originalRng, originalDraws], [newRng, newDraws]]) {
    const next = rng.next.bind(rng);
    rng.next = () => { const value = next(); draws.push(value); return value; };
  }
  source(before, originalRng, 0, 0, { name: seed % 2 ? 'gauntlet' : 'citadel' });
  replacement(after, newRng, 0, 0, { name: seed % 2 ? 'gauntlet' : 'citadel' });
  assert.deepEqual(newDraws, originalDraws);
  assert.equal(newRng._s, originalRng._s);
  assert.deepEqual(after.surfaces, before.surfaces);
  const bounds = stats(after), originalBounds = stats(before).bounds;
  assert.deepEqual(bounds.bounds, originalBounds);
  minimumTriangles = Math.min(minimumTriangles, bounds.triangles);
  maximumTriangles = Math.max(maximumTriangles, bounds.triangles);
  assert(bounds.triangles <= 600);
  assert.equal(after.buckets.size, 2);
  for (const [key, bucket] of after.buckets) {
    for (const attribute of ['pos', 'nrm', 'uv', 'col', ...(key === 'neon' ? ['anim'] : [])]) {
      for (const value of bucket[attribute].view()) assert(Number.isFinite(value));
    }
    if (key === 'neon') for (const attribute of ['col', 'anim']) {
      const expected = before.buckets.get('neon')[attribute].view();
      const actual = bucket[attribute].view();
      for (let offset = 0; offset < actual.length; offset++) assert.equal(actual[offset], expected[offset % 3]);
    }
  }
  before.box('dark', 2, 3, 4, originalRng.next(), originalRng.next(), originalRng.next(), 3, 0xffffff);
  after.box('dark', 2, 3, 4, newRng.next(), newRng.next(), newRng.next(), 3, 0xffffff);
  for (const attribute of ['pos', 'nrm', 'uv', 'col']) {
    const length = attribute === 'uv' ? 72 : 108;
    assert.deepEqual(after.buckets.get('dark')[attribute].view().slice(-length), before.buckets.get('dark')[attribute].view().slice(-length));
  }
}
for (let seed = 1; seed <= 4096; seed++) compare(seed);
const extremes = [];
for (const height of [7, 13]) for (const width of [1.2, 2.4]) for (const spacing of [1.8, 2.6]) {
  const factory = () => ({ _s: 0, next() { this._s++; return .25; }, range(low) { this.next(); return low === 7 ? height : low === 1.2 ? width : low === 1.8 ? spacing : .8; } });
  compare(0, factory);
  const batch = new Batch();
  replacement(batch, factory(), 19.5, 6, { name: 'citadel' });
  const measured = stats(batch);
  assert(measured.bounds[0][0] >= 18.3 - 2e-6);
  assert(measured.bounds[1][1] <= height + .4 + 2e-6);
  extremes.push({ height, width, spacing, ...measured, laneClearance: measured.bounds[0][0] - 16 });
}

const fullChunks = [], originalMerge = Batch.prototype.merge;
function fullChunk(seed, index, replace) {
  const fortress = new Fortress(new THREE.Scene(), materialsDouble(), new Level(seed), {});
  const spans = new WeakMap(), traces = [], merged = [];
  fortress._antenna = (batch, rng, x, z, theme) => {
    const starts = Object.fromEntries([...batch.buckets].map(([key, bucket]) => [key, bucket.pos.n / 3]));
    const stateBefore = rng._s;
    (replace ? replacement : source)(batch, rng, x, z, theme);
    traces.push({ x, z, stateBefore, stateAfter: rng._s });
    const ranges = spans.get(batch) ?? {};
    for (const [key, bucket] of batch.buckets) {
      const start = starts[key] ?? 0, end = bucket.pos.n / 3;
      if (end > start) (ranges[key] ??= []).push([start, end]);
    }
    spans.set(batch, ranges);
  };
  Batch.prototype.merge = function (...args) {
    const digest = crypto.createHash('sha256');
    for (const [key, bucket] of [...this.buckets].sort(([first], [second]) => first.localeCompare(second))) {
      digest.update(key);
      const ranges = spans.get(this)?.[key] ?? [];
      for (const [attribute, size] of [['pos', 3], ['nrm', 3], ['uv', 2], ['col', 3], ['anim', 3], ['pivot', 3], ['spin', 4]]) {
        if (!bucket[attribute]) continue;
        digest.update(attribute);
        const values = bucket[attribute].view();
        let start = 0;
        for (const [from, to] of [...ranges, [values.length / size, values.length / size]]) {
          const kept = values.subarray(start * size, from * size);
          digest.update(Buffer.from(kept.buffer, kept.byteOffset, kept.byteLength));
          start = to;
        }
      }
    }
    merged.push({ digest: digest.digest('hex'), surfaces: this.surfaces });
    return originalMerge.apply(this, args);
  };
  let group;
  try { group = fortress._buildChunk(index); } finally { Batch.prototype.merge = originalMerge; }
  const emitters = fortress.emitters.map(({ owner, ...emitter }) => emitter);
  fortress._disposeChunk(group);
  return { traces, merged, emitters };
}
const measuredSource = JSON.parse(fs.readFileSync(`${output}/evidence/source-measurements.json`));
for (const { seed, index, count } of measuredSource.chunks) {
  const original = fullChunk(seed, index, false), candidate = fullChunk(seed, index, true);
  assert.deepEqual(candidate, original);
  fullChunks.push({ seed, index, count, equal: true, downstreamSHA256: original.merged.at(-1).digest });
}

const lifecycleBatch = new Batch(), group = new THREE.Group(), materials = materialsDouble();
replacement(lifecycleBatch, new Rng(42), 0, 0, { name: 'citadel' });
let templateDisposals = 0, materialDisposals = 0;
for (const geometry of Object.values(templates)) geometry.addEventListener('dispose', () => templateDisposals++);
for (const material of [materials.darkMetal, materials.neonVertex]) material.addEventListener('dispose', () => materialDisposals++);
lifecycleBatch.merge(key => key === 'dark' ? materials.darkMetal : materials.neonVertex, group);
const retireCounts = [];
for (const child of group.children) {
  let count = 0;
  child.geometry.addEventListener('dispose', () => count++);
  child.geometry.dispose();
  retireCounts.push(count);
}
assert.deepEqual(retireCounts, [1, 1]);
assert.equal(templateDisposals, 0);
assert.equal(materialDisposals, 0);
disposeAntennaTemplates(templates);
assert.equal(templateDisposals, 5);

const smooth = value => { const clamped = Math.max(0, Math.min(1, value)); return clamped * clamped * (3 - 2 * clamped); };
const lightGain = cycle => .08 + 1.45 * smooth(cycle / .03) * (1 - smooth((cycle - .12) / .08));
const lighting = [];
for (const rate of [.6, 1]) for (const phase of [0, .25, .999999]) for (const cycle of [0, .015, .03, .08, .12, .16, .2, .99]) {
  const time = ((cycle - phase + 1) % 1) / rate;
  const actualCycle = ((time * rate + phase) % 1 + 1) % 1;
  const gain = lightGain(actualCycle);
  assert(Number.isFinite(gain) && gain >= .08 - 1e-12 && gain <= 1.53 + 1e-12);
  lighting.push({ rate, phase, cycle, time, gain, redBeforeToneMapping: 1.6 * gain });
}
const clearance = [];
for (const height of [7, 10, 13]) for (const x of [19.5, 21.75, 24]) for (const z of [6, 90]) for (const flightY of [1.3, 7, 13.4, 25]) {
  assert(x - 1.2 > 16);
  clearance.push({ height, x, z, flightY, minimumHorizontalClearance: x - 1.2 - 16, top: height + .4, disjointFromLaneAABB: true });
}
const report = { status: 'PASS', randomSeedCases: 4096, adversarialCases: extremes, triangleRange: [minimumTriangles, maximumTriangles], fullChunkComparisons: fullChunks, lifecycle: { chunkMeshCount: group.children.length, geometryRetireCounts: retireCounts, templateDisposalsAtChunkRetirement: 0, sharedMaterialDisposals: 0, templateDisposalsAtShutdown: templateDisposals }, lighting, clearance, limitations: ['CPU actual Batch with material test doubles; no WebGL rendering, GPU timing, FPS or production integration.', 'Finite 4096-seed, 356-full-chunk and endpoint probes do not constitute exhaustive all-seed proof; algebraic bounds and exact loop recipe cover theoretical envelope.', 'Clearance is decorative AABB versus unchanged lane/flight ranges; no collision or targeting mechanics are introduced.', 'Shared shader clock reconstruction is source-equivalent aAnim data; offline lighting is not live renderer acceptance.'] };
fs.writeFileSync(`${output}/evidence/runtime-validation.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, seedCases: report.randomSeedCases, fullChunks: fullChunks.length, antennaProps: measuredSource.placements.length, triangleRange: report.triangleRange, lifecycle: report.lifecycle }));
