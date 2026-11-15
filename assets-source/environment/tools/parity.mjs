/**
 * Parity proof for the environment-kit integration.
 *  A  frozen input source (pure procedural)
 *  B  working fixture, kit NOT loaded         -> must equal A byte for byte, every sector
 *  C  frozen Reactor Spine prototype adapter  -> reference for the Reactor port (optional, --prototype)
 *  D  working fixture, kit loaded             -> every layer the kit does not own equals A
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTree, chunkDigest, chunkIndices, parseGlb, FROZEN, WORK, KIT_GLB, THREE } from './harness.mjs';

const OUT = process.argv[2];
const SEEDS = (process.env.SEEDS ?? '1,2,3,7,42,1234567').split(',').map(Number);
const LOOPS = [0, 1];
const frozen = await loadTree(FROZEN);
const work = await loadTree(WORK);
const { CHUNK_LEN } = work.Level;
const kitMod = await import(work.url('src/world/EnvironmentKit.js'));

const result = { frozenFortressSha: frozen.sha, workFortressSha: work.sha, seeds: SEEDS, loops: LOOPS, templates: work.loaded, kitOff: { chunks: 0, mismatches: [] }, kitOn: {} };

// ---- B vs A: kit off ----
const refs = new Map();
for (const loop of LOOPS) for (const seed of SEEDS) {
  const a = frozen.make(seed, loop), b = work.make(seed, loop);
  for (const i of chunkIndices(a.level, CHUNK_LEN)) {
    const da = chunkDigest(a.fortress._buildChunk(i), a.fortress), db = chunkDigest(b.fortress._buildChunk(i), b.fortress);
    refs.set(`${seed}:${loop}:${i}`, da);
    result.kitOff.chunks++;
    if (da.hash !== db.hash) result.kitOff.mismatches.push({ seed, loop, i });
  }
  a.fortress.clear(); b.fortress.clear();
}
console.log(`kit off: ${result.kitOff.chunks} chunks, ${result.kitOff.mismatches.length} mismatches vs frozen source`);

// ---- C: prototype adapter on the frozen tree (Reactor Spine reference) ----
let proto = null;
if (process.argv.includes('--prototype')) {
  const dir = resolve(FROZEN, 'asset-work/environment-scenes-fable/reactor-spine/initial');
  const adapter = await import(pathToFileURL(resolve(dir, 'source/reactor-adapter.mjs')).href);
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { readFileSync } = await import('node:fs');
  const recipe = JSON.parse(readFileSync(resolve(dir, 'kit-recipe.json'), 'utf8'));
  const fetchBytes = async (rel) => { const b = readFileSync(resolve(dir, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const kit = await adapter.loadReactorKit({ GLTFLoader, fetchBytes, recipe });
  const cooling = await import(frozen.url('src/render/ImportedCoolingStack.js'));
  const L = frozen.Level;
  proto = new Map();
  for (const loop of LOOPS) for (const seed of SEEDS) {
    const c = frozen.make(seed, loop);
    adapter.installReactorSpine(c.fortress, kit, { Rng: frozen.Utils.Rng, CHUNK_LEN: L.CHUNK_LEN, DECK_HALF: L.DECK_HALF, CORRIDOR_HALF: L.CORRIDOR_HALF, ALT_MAX: L.ALT_MAX, appendCoolingStack: cooling.appendImportedCoolingStack });
    for (const i of chunkIndices(c.level, CHUNK_LEN, (s) => s.index === 3)) proto.set(`${seed}:${loop}:${i}`, chunkDigest(c.fortress._buildChunk(i), c.fortress));
    c.fortress.clear();
  }
}

// ---- D: kit on ----
kitMod.prepareEnvironmentKit(await parseGlb(KIT_GLB));
const bySector = {};
const protoCmp = { chunks: 0, identical: 0, different: [] };
for (const loop of LOOPS) for (const seed of SEEDS) {
  const d = work.make(seed, loop);
  for (const i of chunkIndices(d.level, CHUNK_LEN)) {
    const sector = d.level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2);
    const key = `${seed}:${loop}:${i}`;
    const group = d.fortress._buildChunk(i);
    const dd = chunkDigest(group, d.fortress), ref = refs.get(key);
    const s = (bySector[sector.index] ??= { name: sector.name, chunks: 0, identicalToSource: 0, sourceTriangles: 0, kitTriangles: 0, sourceDraws: 0, kitDraws: 0, maxKit: 0, maxSource: 0, sourceBytes: 0, kitBytes: 0 });
    s.chunks++; if (dd.hash === ref.hash) s.identicalToSource++;
    s.sourceTriangles += ref.triangles; s.kitTriangles += dd.triangles; s.sourceDraws += ref.draws; s.kitDraws += dd.draws;
    s.maxKit = Math.max(s.maxKit, dd.triangles); s.maxSource = Math.max(s.maxSource, ref.triangles);
    s.sourceBytes += ref.bytes; s.kitBytes += dd.bytes;
    if (proto?.has(key)) { protoCmp.chunks++; if (proto.get(key).hash === dd.hash) protoCmp.identical++; else protoCmp.different.push({ seed, loop, i, proto: proto.get(key).triangles, port: dd.triangles }); }
  }
  d.fortress.clear();
}
for (const s of Object.values(bySector)) {
  s.meanSource = +(s.sourceTriangles / s.chunks).toFixed(0); s.meanKit = +(s.kitTriangles / s.chunks).toFixed(0);
  s.meanDrawsSource = +(s.sourceDraws / s.chunks).toFixed(2); s.meanDrawsKit = +(s.kitDraws / s.chunks).toFixed(2);
  s.meanAddedKB = +((s.kitBytes - s.sourceBytes) / s.chunks / 1024).toFixed(0);
}
result.kitOn.bySector = bySector;
if (proto) result.kitOn.prototype = protoCmp;
console.table(Object.fromEntries(Object.entries(bySector).map(([k, s]) => [k, { name: s.name, chunks: s.chunks, same: s.identicalToSource, meanSrc: s.meanSource, meanKit: s.meanKit, maxSrc: s.maxSource, maxKit: s.maxKit, drawsSrc: s.meanDrawsSource, drawsKit: s.meanDrawsKit, addKB: s.meanAddedKB }])));
if (proto) console.log(`prototype parity (Reactor): ${protoCmp.identical}/${protoCmp.chunks} chunks byte-identical`, protoCmp.different.slice(0, 5));
kitMod.disposeEnvironmentKit();
if (OUT && !OUT.startsWith('--')) writeFileSync(OUT, JSON.stringify(result, null, 1) + '\n');
process.exit(result.kitOff.mismatches.length ? 1 : 0);
