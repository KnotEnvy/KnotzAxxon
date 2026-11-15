/**
 * Measured cost of the environment kit against the procedural source (working fixture):
 * per sector chunk triangles / draws / bytes, High-window (8 chunk) maxima, per-part stamp
 * totals, per-feature costs and Node build-time ratio. CPU counts only; not GPU timing.
 *   node measure.mjs <out.json>
 */
import { writeFileSync } from 'node:fs';
import { loadTree, chunkDigest, chunkIndices, parseGlb, WORK, KIT_GLB } from './harness.mjs';

const OUT = process.argv[2];
const SEEDS = Array.from({ length: Number(process.env.NSEEDS ?? 12) }, (_, i) => i + 1), LOOPS = [0, 1];
const work = await loadTree(WORK);
const { CHUNK_LEN } = work.Level;
const kitMod = await import(work.url('src/world/EnvironmentKit.js'));
const WINDOW = 8;

const parts = {};          // sector -> part -> {stamps, triangles}
let currentSector = null;
const stamp0 = work.Batch.prototype.stamp;
work.Batch.prototype.stamp = function (key, tpl, ...rest) {
  const k = tpl.userData?.kit;
  if (k && currentSector != null) { const r = ((parts[currentSector] ??= {})[k.name] ??= { stamps: 0, triangles: 0 }); r.stamps++; r.triangles += k.triangles; }
  return stamp0.call(this, key, tpl, ...rest);
};

function run(label) {
  const sectors = {}, features = {};
  for (const loop of LOOPS) for (const seed of SEEDS) {
    const { level, fortress } = work.make(seed, loop);
    const per = [];
    for (const i of chunkIndices(level, CHUNK_LEN)) {
      const sector = level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2);
      currentSector = sector.index;
      const t0 = performance.now();
      const group = fortress._buildChunk(i);
      const ms = performance.now() - t0;
      const d = chunkDigest(group, null);
      per.push({ i, sector: sector.index, t: d.triangles });
      const s = (sectors[sector.index] ??= { name: sector.name, chunks: 0, triangles: 0, draws: 0, bytes: 0, max: 0, ms: 0, tris: [], windowMax: 0 });
      s.chunks++; s.triangles += d.triangles; s.draws += d.draws; s.bytes += d.bytes; s.max = Math.max(s.max, d.triangles); s.ms += ms; s.tris.push(d.triangles);
      // feature costs: obstacle groups are children that are Groups
      for (const f of level.features) {
        if (f.z < i * CHUNK_LEN || f.z >= (i + 1) * CHUNK_LEN) continue;
        if (!['wall', 'arch', 'gate', 'fence'].includes(f.kind)) continue;
      }
      let gi = 0;
      const feats = level.features.filter((f) => f.z >= i * CHUNK_LEN && f.z < (i + 1) * CHUNK_LEN && ['wall', 'arch', 'gate', 'fence'].includes(f.kind));
      for (const c of group.children) {
        if (c.isMesh) continue;
        const f = feats[gi++]; if (!f) break;
        let t = 0; c.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
        const key = f.kind === 'wall' ? `wall:${f.debris ? 'debrisGate' : f.perimeter ? 'perimeter' : f.type}` : f.kind;
        const r = (features[key] ??= { n: 0, triangles: 0, max: 0 }); r.n++; r.triangles += t; r.max = Math.max(r.max, t);
      }
    }
    // High build window: any 8 consecutive chunks; attribute to the sector holding most of the window
    for (let a = 0; a + WINDOW <= per.length; a++) {
      const w = per.slice(a, a + WINDOW), sum = w.reduce((x, c) => x + c.t, 0);
      const counts = {}; for (const c of w) counts[c.sector] = (counts[c.sector] ?? 0) + 1;
      const major = +Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0];
      sectors[major].windowMax = Math.max(sectors[major].windowMax, sum);
    }
    fortress.clear();
  }
  for (const s of Object.values(sectors)) {
    s.tris.sort((a, b) => a - b);
    s.mean = Math.round(s.triangles / s.chunks); s.p95 = s.tris[Math.floor(s.tris.length * 0.95)]; s.meanDraws = +(s.draws / s.chunks).toFixed(2);
    s.meanKB = Math.round(s.bytes / s.chunks / 1024); s.meanMs = +(s.ms / s.chunks).toFixed(2); delete s.tris;
  }
  for (const f of Object.values(features)) f.mean = Math.round(f.triangles / f.n);
  return { label, sectors, features };
}

run('warmup');
const source = run('source');
kitMod.prepareEnvironmentKit(await parseGlb(KIT_GLB));
for (const k of Object.keys(parts)) delete parts[k];
run('warmup');
for (const k of Object.keys(parts)) delete parts[k];
const kit = run('kit');
kitMod.disposeEnvironmentKit();

const rows = {};
for (const [i, s] of Object.entries(source.sectors)) {
  const k = kit.sectors[i];
  rows[i] = { name: s.name, meanSrc: s.mean, meanKit: k.mean, p95Src: s.p95, p95Kit: k.p95, maxSrc: s.max, maxKit: k.max, winSrc: s.windowMax, winKit: k.windowMax, drawsSrc: s.meanDraws, drawsKit: k.meanDraws, kbSrc: s.meanKB, kbKit: k.meanKB, msSrc: s.meanMs, msKit: k.meanMs };
}
console.table(rows);
const frows = {};
for (const [key, f] of Object.entries(source.features)) frows[key] = { n: f.n, meanSrc: f.mean, maxSrc: f.max, meanKit: kit.features[key]?.mean, maxKit: kit.features[key]?.max };
console.table(frows);
const partTotals = {};
for (const [sec, ps] of Object.entries(parts)) {
  const chunks = kit.sectors[sec].chunks;
  partTotals[sec] = Object.fromEntries(Object.entries(ps).sort((a, b) => b[1].triangles - a[1].triangles).map(([n, r]) => [n, { stampsPerChunk: +(r.stamps / chunks).toFixed(2), trianglesPerChunk: +(r.triangles / chunks).toFixed(1) }]));
}
if (process.env.PARTS) for (const sec of process.env.PARTS.split(',')) console.table(Object.fromEntries(Object.entries(partTotals[sec]).slice(0, 16)));
if (OUT) writeFileSync(OUT, JSON.stringify({ seeds: SEEDS, loops: LOOPS, window: WINDOW, fortressSha: work.sha, sectors: rows, features: frows, partsPerChunk: partTotals }, null, 1) + '\n');
