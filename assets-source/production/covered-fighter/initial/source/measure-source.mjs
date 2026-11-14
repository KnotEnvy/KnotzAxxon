import fs from 'node:fs';
import { loadSource, makeFortress, capture, bounds, write, hash, root, THREE, CHUNK_LEN, OriginalRng as Rng } from './source-harness.mjs';

const source = await loadSource();
const batch = new source.Batch();
batch.captureSurfaces = true;
const yawRng = new Rng(1);
yawRng.range = () => 0;
source.Fortress.prototype._parkedFighter.call({}, batch, 0, 0, yawRng);
const buckets = capture(batch);
const aircraft = [...buckets.hull.positions, ...buckets.dark.positions];
const templates = Object.fromEntries(['hull', 'dark'].map(key => [key, source.TPL.fighter[key].attributes.position.count / 3]));
const yawBounds = [];
for (let step = 0; step <= 1000; step++) {
  const yaw = -0.25 + step / 2000;
  const transformed = [];
  for (let index = 0; index < aircraft.length; index += 3) {
    const [x, y, z] = aircraft.slice(index, index + 3);
    transformed.push(x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw));
  }
  yawBounds.push({ yaw, ...bounds(transformed) });
}
const fullChunks = [];
for (const seed of [1, 7, 42, 123]) {
  const fortress = makeFortress(source, seed);
  const placements = [];
  const original = fortress._parkedFighter;
  fortress._parkedFighter = function(batch, x, z, rng) {
    const before = rng.trace.length;
    original.call(this, batch, x, z, rng);
    placements.push({ x, z, yaw: -0.25 + rng.trace[before] * 0.5, draws: rng.trace.length - before });
  };
  const chunks = [];
  for (let index = 0; index < 16; index++) {
    const firstPlacement = placements.length;
    const group = fortress._buildChunk(index);
    const rng = source.rngInstances.at(-1);
    chunks.push({ index, z0: index * CHUNK_LEN, placements: placements.slice(firstPlacement), randomDraws: rng.trace.length, rngHash: hash(JSON.stringify(rng.trace)), downstream: [rng.next(), rng.next(), rng.next(), rng.next()], surfaces: group.userData.deckSurfaces, meshes: group.children.length });
    fortress._disposeChunk(group);
  }
  fullChunks.push({ seed, chunks, placementCount: placements.length });
}
const inputs = ['src/world/Fortress.js', 'src/world/Level.js', 'src/render/GeoUtils.js', 'src/core/Utils.js', 'src/core/Settings.js', 'src/game/CameraRig.js', 'src/render/Materials.js', 'src/render/Sky.js'];
const inputHashes = Object.fromEntries(inputs.map(name => [name, hash(fs.readFileSync(`${root}/${name}`))]));
write('evidence/source-geometry.json', { buckets, surfaces: batch.surfaces });
write('evidence/source-measurements.json', {
  revision: 'ee221ad3e05cd66292fe02b71b50f513696bdda2', inputHashes,
  triangles: Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, bucket.triangles])),
  templates, aircraftBounds: bounds(aircraft), completeBounds: bounds([...aircraft, ...buckets.paint.positions]),
  surfacesWhenCaptureEnabled: batch.surfaces, yawRange: [-0.25, 0.25], yawSamples: yawBounds,
  placementContract: { dynamicLoopCondition: 'k < rng.int(1, 3) re-evaluated each test', x: 'clamp(farX() + 1.5, 21, 23.5)', zStep: 9, drawsPerFighter: 1, hardstandRotates: false, productionCaptureSurfaces: false },
  fullChunks,
});
console.log(JSON.stringify({ templates, triangles: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.triangles])), aircraftBounds: bounds(aircraft), placementCounts: fullChunks.map(({seed,placementCount}) => ({seed,placementCount})), yawEndpoints: [yawBounds[0], yawBounds.at(-1)] }, null, 2));
source.disposeFortressTemplates();
