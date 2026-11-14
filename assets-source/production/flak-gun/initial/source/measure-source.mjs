import fs from 'node:fs';
import * as THREE from 'three';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, repo, write, sha, stats, materialsDouble, traceCall, disposeFortressTemplates } from './source-harness.mjs';

const operation = Fortress.prototype._flakGun, seeds = [1, 7, 42, 123];
const isolated = seeds.map(seed => {
  const batch = new Batch(), rng = new Rng(seed);
  return { seed, ...traceCall(operation, batch, rng, 0, 0, () => {}, 0), ...stats(batch) };
});
const chunks = [], placements = [], roofs = [];
for (const seed of seeds) {
  const fortress = new Fortress(new THREE.Scene(), materialsDouble(), new Level(seed), {});
  let current, lastRoof;
  const skyline = fortress._skyline;
  fortress._skyline = function (batch, rng, ...args) {
    const box = batch.box;
    batch.box = function (...values) {
      if (values[0] === 'hull' && values[8] === 0x748394 && values[2] === .3) {
        lastRoof = { seed, chunk: current.index, x: values[4], z: values[6], roofY: values[5] + .08, width: values[1], depth: values[3], yaw: values[9] };
        roofs.push(lastRoof);
      }
      return box.apply(this, values);
    };
    try { return skyline.call(this, batch, rng, ...args); } finally { batch.box = box; }
  };
  fortress._flakGun = (batch, rng, x, z, emit, roofY) => {
    const measurement = new Batch();
    const trace = traceCall(operation, measurement, rng, x, z, emit, roofY);
    placements.push({ seed, chunk: current.index, roof: lastRoof, ...trace, ...stats(measurement) });
    current.count++;
    for (const [key, data] of measurement.buckets) {
      const target = batch._bucket(key);
      target.reserve(data.pos.n / 3);
      for (const field of ['pos', 'nrm', 'col', 'uv']) { target[field].a.set(data[field].view(), target[field].n); target[field].n += data[field].n; }
    }
  };
  for (let index = 0; index * CHUNK_LEN < fortress.level.totalLength; index++) {
    const sector = fortress.level.sectorAt(index * CHUNK_LEN + CHUNK_LEN / 2);
    if (sector?.kind !== 'fortress') continue;
    current = { seed, index, sector: sector.index, count: 0 };
    chunks.push(current);
    const group = fortress._buildChunk(index);
    fortress._disposeChunk(group);
  }
}
const range = values => [Math.min(...values), Math.max(...values)];
const eligible = chunks.filter(chunk => chunk.sector === 1);
const files = ['src/world/Fortress.js', 'src/fx/Effects.js', 'src/core/Utils.js', 'src/world/Level.js', 'src/game/CameraRig.js', 'src/core/FlightCamera.js', 'src/core/Settings.js', 'src/render/Materials.js', 'src/render/Textures.js', 'src/render/Sky.js'];
const report = {
  method: 'Actual unmodified Batch, Fortress._buildChunk, Level and Rng loaded in Node. CPU-only material doubles. Recording original flak into an independent real Batch and copying verbatim buffers back; callback remains original chunk emit.',
  sourceHashes: Object.fromEntries(files.map(filename => [filename, sha(fs.readFileSync(`${repo}/${filename}`))])), isolated, chunks, placements, roofs,
  density: { fortressChunks: chunks.length, batteryChunks: eligible.length, batteryRoofs: roofs.filter(roof => eligible.some(chunk => chunk.seed === roof.seed && chunk.index === roof.chunk)).length, flakProps: placements.length, meanPerBatteryChunk: placements.length / eligible.length, perBatteryChunk: range(eligible.map(chunk => chunk.count)), histogram: Object.fromEntries([0,1,2,3,4,5,6,7,8,9,10,11].map(count => [count, eligible.filter(chunk => chunk.count === count).length])) },
  measured: Object.fromEntries(['x','z','roofY','pitch','yaw','rate'].map(key => [key, range(placements.map(prop => prop[key]))])),
  sourceContract: { draws: 'pitch,yaw,rate in method; caller emit consumes fourth phase draw', pitch: [1,1.3], yaw: [-1.1,-.6], pivotY: 2.1, barrelLength: 4.2, offsets: [-.45,.45], baseFootprint: [3.4,3.4], buckets: {dark:60,hull:40}, triangles:100, skyline: 'Only battery theme, side>0, h>22, bool(.6), additionally suppressed by prior h>40 && bool(.25) stack branch; keep all short-circuit RNG draws', effects: 'Center-between-tips steel-white ambient sparks and 70/76/82 speed tracers; delayed burst at emitter+48*dir. z cull [-20,+210]. No collider/HP/targeting; do not alter VFX bounds.' }
};
write('evidence/source-measurement.json', report);
disposeFortressTemplates();
console.log(JSON.stringify({ isolated, density: report.density, measured: report.measured }, null, 2));
