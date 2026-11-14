import fs from 'node:fs';
import * as THREE from 'three';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, repo, sha, write, stats, serialize, disposeFortressTemplates } from './harness.mjs';

const seeds = [1, 7, 42, 123], original = Fortress.prototype._fuelDepot;
const isolated = seeds.map(seed => {
  const batch = new Batch(), rng = new Rng(seed), stateBefore = rng._s;
  batch.captureSurfaces = true;
  original(batch, rng, 0, 0);
  return { seed, stateBefore, stateAfter: rng._s, ...stats(batch), surfaces: batch.surfaces };
});
const chunks = [], placements = [];
for (const seed of seeds) {
  const level = new Level(seed), fortress = Object.create(Fortress.prototype);
  fortress._fuelDepot = (batch, rng, worldX, worldZ) => {
    const measure = new Batch(), before = rng._s;
    measure.captureSurfaces = true;
    original(measure, rng, worldX, worldZ);
    placements.push({ seed, chunk: current.index, x: worldX, z: worldZ, stateBefore: before, stateAfter: rng._s, ...stats(measure) });
    current.count++;
    original(batch, rng, worldX, worldZ);
  };
  let current;
  for (let index = 0; index * CHUNK_LEN < level.totalLength; index++) {
    const sector = level.sectorAt(index * CHUNK_LEN + CHUNK_LEN / 2);
    if (sector?.index !== 0) continue;
    current = { seed, index, count: 0 };
    const batch = new Batch(), rng = new Rng((index * 2654435761 + seed) >>> 0);
    fortress._deck(batch, rng, index * CHUNK_LEN, sector);
    fortress._trenchWalls(batch, rng, index * CHUNK_LEN, sector);
    const emit = () => { rng.next(); };
    fortress._wallDressing(batch, rng, index * CHUNK_LEN, sector, emit);
    fortress._deckProps(batch, rng, index * CHUNK_LEN, sector, emit);
    chunks.push({ ...current, stateAfterDeckProps: rng._s });
  }
}
const range = values => [Math.min(...values), Math.max(...values)];
const paths = ['src/world/Fortress.js', 'src/world/Level.js', 'src/core/Utils.js', 'src/core/Settings.js', 'src/game/CameraRig.js', 'src/core/FlightCamera.js', 'src/render/Materials.js', 'src/render/Textures.js', 'src/render/Sky.js', 'src/render/ImportedModels.js', 'src/entities/Player.js'];
const report = {
  method: 'Unmodified real Batch, Fortress methods, Level and Rng. Execute original deck/trench/wallDressing prefix then original deckProps on each airfield chunk. Emit CPU stub preserves the original phase rng.next draw. No rendering or GPU performance measured.',
  sourceCommit: 'ee221ad3e05cd66292fe02b71b50f513696bdda2',
  sourceHashes: Object.fromEntries(paths.map(name => [name, sha(fs.readFileSync(new URL(name, repo)))])),
  isolated, chunks, placements,
  density: { eligibleAirfieldChunks: chunks.length, observedDepots: placements.length, mean: placements.length / chunks.length, callerProbability: .6, maximumPerChunk: 1 },
  observedPlacements: { x: range(placements.map(value => value.x)), z: range(placements.map(value => value.z)) },
  contract: { caller: 'rng.bool(.6), farX = rng.range(19.5,24), z = chunkZ + rng.range(10,86)', methodGameRngDraws: 0, surfaces: 'four original saddle boxes; axis-aligned guide surfaces only, not collision', inheritedEnvelope: [[-2.9200001,0,-4],[2.9200001,3.0999999,4]], minSourceXSupport: 16.58, nominalLaneGap: .58, playerRadius: 1.5, fullSphereClearance: false, flightX: [-16,16], flightY: [1.3,25], warning: 'Player 1.5-radius envelope can overlap passive decorative scenery at near placement. Do not change or narrow flight/aim ranges.' }
};
write('evidence/source-measurement.json', report);
const source = new Batch(); original(source, new Rng(1), 0, 0);
write('evidence/source-local-buffers.json', serialize(source));
fs.writeFileSync(new URL('evidence/source-method.txt', new URL('../', import.meta.url)), original.toString() + '\n');
disposeFortressTemplates();
console.log(JSON.stringify({ isolated, density: report.density, observedPlacements: report.observedPlacements }, null, 2));
