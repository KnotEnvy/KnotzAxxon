import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, output, fortressSource, measure, materialsDouble, disposeFortressTemplates } from './source-harness.mjs';

const isolated = new Batch(), sourceRng = new Rng(42);
isolated.captureSurfaces = true;
const before = sourceRng._s;
Fortress.prototype._bunker(isolated, sourceRng, 0, 0, { warm: 0xffb43a });
const placements = [], chunks = [];
for (const seed of [1, 7, 42, 123]) {
  const level = new Level(seed), fortress = new Fortress(new THREE.Scene(), materialsDouble(), level, {});
  let current;
  fortress._bunker = (batch, rng, x, z, theme) => {
    const stateBefore = rng._s;
    Fortress.prototype._bunker(batch, rng, x, z, theme);
    placements.push({ seed, chunk: current.index, x, z, localZ: z - current.index * CHUNK_LEN, theme: theme.name, warm: theme.warm, stateBefore, stateAfter: rng._s });
    current.count++;
  };
  for (let index = 0; index * CHUNK_LEN < level.totalLength; index++) {
    const sector = level.sectorAt(index * CHUNK_LEN + CHUNK_LEN / 2);
    if (!sector || ![5, 6].includes(sector.index)) continue;
    current = { seed, index, sector: sector.index, count: 0 };
    chunks.push(current);
    fortress._disposeChunk(fortress._buildChunk(index));
  }
  fortress.clear();
}
disposeFortressTemplates();
const range = values => [Math.min(...values), Math.max(...values)];
const report = {
  method: 'Actual unchanged Batch, Fortress._bunker and complete _buildChunk on Level campaigns seeds 1,7,42,123; CPU-only material doubles; no renderer.',
  sourceSHA256: crypto.createHash('sha256').update(fortressSource).digest('hex'),
  isolated: { ...measure(isolated), stateBefore: before, stateAfter: sourceRng._s, methodDraws: 1, surfaces: isolated.surfaces },
  density: { eligibleChunks: chunks.length, bunkerCount: placements.length, histogram: { zero: chunks.filter(item => !item.count).length, one: chunks.filter(item => item.count).length }, observedMean: placements.length / chunks.length, theoreticalProbability: .6, maximumPerChunk: 1 },
  measured: { x: range(placements.map(item => item.x)), localZ: range(placements.map(item => item.localZ)) },
  contract: { localBounds: [[-3.5, 0, -4], [3.5, 4, 4]], centerX: [19.5, 24], centerZInChunk: [12, 84], worldX: [16, 27.5], worldZInChunk: [8, 88], laneX: [-16, 16], minimumLaneClearance: 0, groundOrigin: [0, 0, 0], caller: 'rng.bool(.6), farX(), rng.range(12, CHUNK_LEN-12), then exactly one method rng.next()', surfaceContract: 'Only source neon box then dark roof box are recorded if captureSurfaces is enabled; tapered hull was never recorded.' },
  budgetBeforeConstruction: { targetTriangles: [400, 650], ceilingTriangles: 900, maxMergedBuckets: 3, maxGLBBytes: 524288, newTextures: 0, targetBounds: [[-3.45, 0, -3.95], [3.45, 3.96, 3.95]] },
  chunks, placements,
};
fs.writeFileSync(`${output}/evidence/source-measurements.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ isolated: report.isolated, density: report.density, measured: report.measured, budget: report.budgetBeforeConstruction }, null, 2));
