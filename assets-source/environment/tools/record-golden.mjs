/**
 * Record tests/fixtures/fortress-source-golden.json from the FROZEN pre-kit input source
 * (no scenery templates loaded, exactly as the Node test process runs): one digest per
 * sector per (seed, loop). The test then proves the working tree's kit-off path reproduces it.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadTree, FROZEN, WORK, THREE } from './harness.mjs';
const { chunkDigest, stubMaterials, GOLDEN_RUNS } = await import(resolve(WORK, 'tests/fixtures/chunk-digest.js'));
const frozen = await loadTree(FROZEN, { templates: false });
const { CHUNK_LEN } = frozen.Level;
const runs = {};
let chunks = 0;
for (const [seed, loop] of GOLDEN_RUNS) {
  const level = new frozen.Level.Level(seed, loop);
  const fortress = new frozen.Fortress(new THREE.Scene(), stubMaterials(THREE), level, { drawDistance: 560 });
  const hashes = level.sectors.map(() => createHash('sha256'));
  for (let i = 0; i * CHUNK_LEN < level.totalLength; i++) {
    const s = level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2);
    if (!s) continue;
    chunkDigest(fortress._buildChunk(i), fortress, hashes[s.index]); chunks++;
  }
  runs[`${seed}:${loop}`] = hashes.map((h) => h.digest('hex'));
  fortress.clear();
}
writeFileSync(resolve(WORK, 'tests/fixtures/fortress-source-golden.json'), JSON.stringify({
  note: 'Per-sector digests of every streamed chunk from the pre-kit procedural Fortress.js (no scenery templates loaded). Recorded by asset-work tooling from the frozen input; see docs/environment-scenes.',
  sourceFortressSha256: frozen.sha, chunks, runs }, null, 1) + '\n');
console.log('golden recorded', chunks, 'chunks from', frozen.sha.slice(0, 12));
