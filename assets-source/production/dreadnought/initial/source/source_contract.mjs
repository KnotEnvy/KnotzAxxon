import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../../../..');
export const threeRoot = process.env.THREE_ROOT ?? path.join(repo, 'asset-work/parked-fighter/.runtime/three');
const runtime = path.resolve(here, '../../.runtime');
fs.mkdirSync(runtime, { recursive: true });
const fortressPath = path.join(repo, 'src/world/Fortress.js');
const original = fs.readFileSync(fortressPath, 'utf8');
function resolveImports(text, base) {
  return text.replace(/from\s+(['"])([^'"]+)\1/g, (match, quote, specifier) => {
    const resolved = specifier === 'three' ? path.join(threeRoot, 'build/three.module.js')
      : specifier.startsWith('three/addons/') ? path.join(threeRoot, 'examples/jsm', specifier.slice(13))
        : path.resolve(path.dirname(base), specifier);
    if (resolved.endsWith('/src/render/GeoUtils.js')) {
      const target = path.join(runtime, 'GeoUtils.mjs');
      fs.writeFileSync(target, resolveImports(fs.readFileSync(resolved, 'utf8'), resolved));
      return `from '${pathToFileURL(target).href}'`;
    }
    if (resolved.endsWith('/src/render/Materials.js')) {
      return `from '${pathToFileURL(path.join(runtime, 'LightModes.mjs')).href}'`;
    }
    return `from '${pathToFileURL(resolved).href}'`;
  });
}
fs.writeFileSync(path.join(runtime, 'LightModes.mjs'), 'export const LIGHT_ANIM={STEADY:0,STROBE:1,CHASE:2,BREATHE:3,FLICKER:4};\n');
const instrumented = path.join(runtime, 'Fortress.mjs');
fs.writeFileSync(instrumented, resolveImports(original, fortressPath) + '\nexport { Batch };\n');
export const { Batch, Fortress } = await import(pathToFileURL(instrumented));
export const THREE = await import(pathToFileURL(path.join(threeRoot, 'build/three.module.js')));
export const { Rng } = await import(pathToFileURL(path.join(repo, 'src/core/Utils.js')));

export function burnOriginalDreadnought(rng, z0, sector) {
  const start = (sector.zStart ?? 0) + 200;
  const end = start + 820;
  const begin = Math.max(z0, start), finish = Math.min(z0 + 96, end);
  if (finish <= begin) return;
  for (let station = begin; station < finish; station += 12) {
    const length = Math.min(12, finish - station);
    const local = station + length / 2 - start;
    const breach = Math.floor(local / 110) % 3 === 1 && local % 110 > 30 && local % 110 < 78;
    if (breach) rng.next();
    for (const side of [-1, 1]) {
      if (!rng.bool(0.5)) continue;
      const lit = rng.bool(0.3);
      rng.range(0, 12);
      if (lit) rng.next();
    }
  }
  if (rng.bool(0.8)) {
    const station = begin + 10 + rng.range(0, Math.max(1, finish - begin - 20));
    if (station < finish) {
      rng.range(16, 30);
      for (let window = 0; window < 4; window++) rng.bool(0.6);
      rng.next();
    }
  }
  for (let turret = 0; turret < 2; turret++) {
    rng.range(4, Math.max(5, finish - begin - 4));
    rng.range(-20, 12);
    for (let fragment = 0; fragment < 4; fragment++) {
      rng.range(0.6, 1.4); rng.range(0.8, 2.2); rng.range(0.6, 1.6);
      rng.range(-2, 2); rng.range(-2.4, 2.4); rng.next();
    }
    rng.next();
  }
}

export function digestBatch(batch) {
  const digest = crypto.createHash('sha256');
  for (const [key, bucket] of batch.buckets) {
    digest.update(key);
    for (const attribute of ['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin']) {
      if (bucket[attribute]) digest.update(Buffer.from(bucket[attribute].view().buffer));
    }
  }
  return digest.digest('hex');
}

export function measureBatch(batch) {
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const buckets = {};
  for (const [key, bucket] of batch.buckets) {
    buckets[key] = bucket.pos.n / 9;
    triangles += buckets[key];
    for (let vertex = 0; vertex < bucket.pos.n; vertex++) {
      const axis = vertex % 3;
      minimum[axis] = Math.min(minimum[axis], bucket.pos.a[vertex]);
      maximum[axis] = Math.max(maximum[axis], bucket.pos.a[vertex]);
    }
  }
  return { triangles, buckets, bounds: { min: minimum, max: maximum } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = { source: fortressPath, sourceSHA256: crypto.createHash('sha256').update(original).digest('hex'),
    sectorStart: 3200, start: 3400, end: 4220, chunkLength: 96, seeds: [],
    budget: { wholeTarget: 24000, wholeCeiling: 32000, ordinaryChunkTarget: 3500, chunkCeiling: 5000, mergedBuckets: 3, glbBytes: 4194304 },
    rationale: 'Approximately 2.5x source budget reserved for genuinely open armor, frames, section clipping, unique bridge and recessed engines; no debris/asteroid replacement.' };
  for (const seed of [1, 7, 42, 123]) {
    const chunks = [];
    for (let index = 35; index <= 43; index++) {
      const batch = new Batch();
      const rng = new Rng((index * 2654435761 + seed) >>> 0);
      let draws = 0;
      const next = rng.next.bind(rng);
      rng.next = () => { draws++; return next(); };
      Fortress.prototype._dreadnought(batch, rng, index * 96, { zStart: 3200 });
      chunks.push({ index, draws, finalRNG: rng._s, ...measureBatch(batch) });
    }
    report.seeds.push({ seed, triangles: chunks.reduce((total, chunk) => total + chunk.triangles, 0), chunks });
  }
  let comparisons = 0;
  for (let seed = 1; seed <= 128; seed++) {
    for (let index = 34; index <= 44; index++) {
      const rngA = new Rng((index * 2654435761 + seed) >>> 0);
      const rngB = new Rng((index * 2654435761 + seed) >>> 0);
      const sourceBatch = new Batch();
      Fortress.prototype._dreadnought(sourceBatch, rngA, index * 96, { zStart: 3200 });
      burnOriginalDreadnought(rngB, index * 96, { zStart: 3200 });
      if (rngA._s !== rngB._s) throw Error(`RNG mismatch ${seed}/${index}`);
      comparisons++;
    }
  }
  const downstream = [];
  for (const seed of [1, 7, 42, 123]) for (let index = 35; index <= 43; index++) {
    const reference = new Batch(), candidate = new Batch();
    const rngA = new Rng((index * 2654435761 + seed) >>> 0), rngB = new Rng((index * 2654435761 + seed) >>> 0);
    const sector = { index: 2, zStart: 3200 };
    Fortress.prototype._voidProps.call({ _dreadnought: (batch, rng, z0, definition) => Fortress.prototype._dreadnought(new Batch(), rng, z0, definition) }, reference, rngA, index * 96, sector);
    Fortress.prototype._voidProps.call({ _dreadnought: (batch, rng, z0, definition) => burnOriginalDreadnought(rng, z0, definition) }, candidate, rngB, index * 96, sector);
    if (digestBatch(reference) !== digestBatch(candidate) || rngA._s !== rngB._s) throw Error('Downstream geometry mismatch');
    downstream.push({ seed, index, geometrySHA256: digestBatch(candidate), finalRNG: rngB._s });
  }
  report.rng = { directComparisons: comparisons, downstreamComparisons: downstream.length, passed: true, downstream };
  fs.writeFileSync(path.resolve(here, '../checks/source-contract.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ seeds: report.seeds.map(({ seed, triangles, chunks }) => ({ seed, triangles, maxChunk: Math.max(...chunks.map(chunk => chunk.triangles)), min: chunks.reduce((value, chunk) => value.map((entry, axis) => Math.min(entry, chunk.bounds.min[axis])), [Infinity, Infinity, Infinity]), max: chunks.reduce((value, chunk) => value.map((entry, axis) => Math.max(entry, chunk.bounds.max[axis])), [-Infinity, -Infinity, -Infinity]) })), rng: { comparisons, downstream: downstream.length } }, null, 2));
}
