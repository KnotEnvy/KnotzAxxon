import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, output, fortressSource, materialsDouble, stats, antennaTrace, disposeFortressTemplates } from './source-harness.mjs';

const seeds = [1, 7, 42, 123];
const operation = Fortress.prototype._antenna;
const isolated = seeds.map(seed => {
  const batch = new Batch(), rng = new Rng(seed);
  return { seed, ...antennaTrace(batch, rng, 0, 0, { name: 'citadel' }, operation), ...stats(batch) };
});
const chunks = [], placements = [];
for (const seed of seeds) {
  const level = new Level(seed), fortress = new Fortress(new THREE.Scene(), materialsDouble(), level, {});
  let current;
  fortress._antenna = (batch, rng, x, z, theme) => {
    const trace = antennaTrace(batch, rng, x, z, theme, operation);
    placements.push({ seed, chunk: current.index, ...trace });
    current.count++;
  };
  for (let index = 0; index * CHUNK_LEN < level.totalLength; index++) {
    const sector = level.sectorAt(index * CHUNK_LEN + CHUNK_LEN / 2);
    if (!sector || sector.kind !== 'fortress') continue;
    current = { seed, index, sector: sector.index, count: 0 };
    chunks.push(current);
    const group = fortress._buildChunk(index);
    fortress._disposeChunk(group);
  }
}
disposeFortressTemplates();
const range = values => [Math.min(...values), Math.max(...values)];
const eligible = chunks.filter(chunk => [5, 6].includes(chunk.sector));
const report = {
  sourceSHA256: crypto.createHash('sha256').update(fortressSource).digest('hex'),
  method: 'Unmodified actual Batch and Fortress full _buildChunk, actual Level campaigns seeds 1,7,42,123; material objects are CPU-only test doubles, no renderer.',
  isolated, chunks, placements,
  density: { fortressChunks: chunks.length, antennaEligibleChunks: eligible.length, antennaProps: placements.length, histogram: Object.fromEntries([0, 1, 2, 3].map(count => [count, eligible.filter(chunk => chunk.count === count).length])), eligibleMean: placements.length / eligible.length, perChunkTheoretical: [1, 3], loop: 'rng.int(1,3) reevaluated before EVERY iteration, including termination; do not hoist' },
  measured: { x: range(placements.map(prop => prop.x)), yTop: range(placements.map(prop => prop.height + .4)), zWithinChunk: range(placements.map(prop => prop.z - prop.chunk * CHUNK_LEN)), heights: range(placements.map(prop => prop.height)), widths: range(placements.flatMap(prop => prop.elements.map(element => element.width))), elementCount: range(placements.map(prop => prop.elements.length)), worldBounds: [[Math.min(...placements.map(prop => prop.x - Math.max(...prop.elements.map(element => element.width)) / 2)), 0, Math.min(...placements.map(prop => prop.z - .2))], [Math.max(...placements.map(prop => prop.x + Math.max(...prop.elements.map(element => element.width)) / 2)), Math.max(...placements.map(prop => prop.height + .4)), Math.max(...placements.map(prop => prop.z + .2))]] },
  theoretical: { centerX: [19.5, 24], worldX: [18.3, 25.2], centerZWithinChunk: [6, 90], worldZWithinChunk: [5.8, 90.2], height: [7, 13], fullY: [0, 13.4], localX: [-1.2, 1.2], localZ: [-.2, .2], lane: [-16, 16], flightY: [1.3, 25], minimumLaneClearance: 2.3, elementCount: [2, 7] },
};
fs.writeFileSync(`${output}/evidence/source-measurements.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ isolated: isolated.map(({ seed, triangles, height, bounds }) => ({ seed, triangles, height, bounds })), density: report.density, measured: report.measured, theoretical: report.theoretical }, null, 2));
