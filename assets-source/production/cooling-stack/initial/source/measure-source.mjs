import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Batch, Fortress } from '../../../../src/world/Fortress.js';
import { Rng } from '../../../../src/core/Utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bounds = batch => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const bucket of batch.buckets.values()) {
    const positions = bucket.pos.view();
    triangles += positions.length / 9;
    for (let index = 0; index < positions.length; index++) {
      const axis = index % 3;
      min[axis] = Math.min(min[axis], positions[index]); max[axis] = Math.max(max[axis], positions[index]);
    }
  }
  return { min, max, triangles, buckets: [...batch.buckets.keys()] };
};
const samples = [];
for (const seed of [1, 7, 42, 123]) {
  const rng = new Rng(seed), batch = new Batch(), emitters = [];
  let draws = 0;
  const next = rng.next.bind(rng);
  rng.next = () => { draws++; return next(); };
  const emit = (kind, x, y, z, rate) => emitters.push({ owner: 'source-chunk', kind, x, y, z, rate, dir: null, t: rng.next() });
  Fortress.prototype._coolingStack(batch, rng, 0, 0, emit);
  samples.push({ seed, ...bounds(batch), drawsIncludingEmitter: draws, phase: batch.buckets.get('neon').anim.a[2], emitters, downstream: Array.from({ length: 8 }, () => rng.next()) });
}
const extremes = [];
for (const height of [7, 11]) {
  const rng = new Rng(1), originalRange = rng.range.bind(rng), batch = new Batch();
  rng.range = (lo, hi) => lo === 7 && hi === 11 ? (rng.next(), height) : originalRange(lo, hi);
  Fortress.prototype._coolingStack(batch, rng, 0, 0, () => rng.next());
  extremes.push({ height, ...bounds(batch) });
}
const sector = { kind: 'fortress', index: 3, zStart: 0, zEnd: 100000 };
const level = { seed: 42, sectorAt: () => sector, features: [] };
const materials = Object.fromEntries(['hull', 'deck', 'darkMetal', 'grating', 'hazard', 'neonVertex', 'paint', 'spinMetal', 'rock'].map(key => [key, new THREE.MeshBasicMaterial({ name: key })]));
const fortress = new Fortress(new THREE.Scene(), materials, level, { drawDistance: 300 });
const placements = [];
const originalStacks = [];
const original = Fortress.prototype._coolingStack;
fortress._coolingStack = (batch, rng, x, z, emit) => {
  const rngCopy = new Rng(1); rngCopy._s = rng._s;
  placements.push({ x, z, height: rngCopy.range(7, 11), phase: rngCopy.next() });
  const scratch = new Batch();
  original.call(fortress, scratch, rng, x, z, emit);
  originalStacks.push([...scratch.buckets].map(([bucket, data]) => ({ bucket, p: Array.from(data.pos.view()), c: Array.from(data.col.view()) })));
};
const chunk = fortress._buildChunk(0);
const world = [];
chunk.traverse(object => {
  if (!object.isMesh) return;
  const attributes = object.geometry.attributes;
  world.push({ bucket: object.material.name, p: Array.from(attributes.position.array), c: Array.from(attributes.color.array), n: Array.from(attributes.normal.array) });
});
fs.writeFileSync(path.join(root, 'evidence/source-world.json'), JSON.stringify({ fixture: 'Actual _buildChunk, seed42 chunk0; synthetic reactor sector index3, no gameplay features. Original placements. Cooling geometry isolated in originalStacks.', placements, originalStacks, meshes: world }));
const source = fs.readFileSync(path.resolve(root, '../../../src/world/Fortress.js'));
const report = { sourceCommit: 'ee221ad3e05cd66292fe02b71b50f513696bdda2', sourceSHA256: createHash('sha256').update(source).digest('hex'), actualBatch: true, seeds: samples, sourceHeightEndpoints: extremes, placementEnvelope: { x: [20.5, 25], zWithinChunk: [10, 86] }, loop: 'rng.int(1,2) reevaluated at every condition; not cached', heightDraws: 1, phaseDraws: 1, emitterCallbackDraws: 1, placements, sourceWorldTriangles: world.reduce((sum, mesh) => sum + mesh.p.length / 9, 0) };
fs.writeFileSync(path.join(root, 'evidence/source-measurement.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
