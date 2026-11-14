import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSource, recorder, triangleCount, summarize } from './source-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { Batch, Fortress, Rng, THEMES } = await loadSource(root, process.env.THREE_ROOT);
const original = Fortress.prototype._crates;
const evidence = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evidence');
fs.mkdirSync(evidence, { recursive: true });
class TraceRng extends Rng {
  constructor(seed) { super(seed); this.trace = []; }
  next() { const value = super.next(); this.trace.push({ state: this._s, value }); return value; }
}
const roots = [];
for (const seed of [1, 7, 42, 123]) {
  const batch = new Batch(), rng = new TraceRng(seed), records = [];
  batch.captureSurfaces = true;
  original(recorder(batch, records), rng, 21, 48, 3.2);
  roots.push({ seed, ...summarize(records), triangles: triangleCount(batch), buckets: [...batch.buckets.keys()],
    draws: rng.trace.length, trace: rng.trace.slice(), records, surfaces: batch.surfaces, downstreamNext: rng.next() });
  batch.merge(() => ({}), { add() {} });
}
const distributions = [];
for (const maxH of [1.9, 3.2]) {
  const histogram = {}, examples = {};
  let minDraws = Infinity, maxDraws = 0, highest = 0;
  for (let seed = 1; seed <= 20000; seed++) {
    const rng = new TraceRng(seed), records = [];
    original(recorder({ box() {}, stamp() {} }, records), rng, -19.5, 48, maxH);
    const summary = summarize(records), key = `${summary.crates}c${summary.drums}d`;
    histogram[key] = (histogram[key] ?? 0) + 1;
    examples[key] ??= { seed, ...summary, records };
    minDraws = Math.min(minDraws, rng.trace.length); maxDraws = Math.max(maxDraws, rng.trace.length);
    highest = Math.max(highest, summary.height);
  }
  distributions.push({ maxH, samples: 20000, histogram, minDraws, maxDraws, highest, examples });
}
const deckDensity = [];
for (const index of [0, 1, 3, 5, 6]) {
  let most = { sourceTriangles: 0 }, sumC = 0, sumD = 0;
  for (let seed = 1; seed <= 10000; seed++) {
    const records = [], owner = Object.create(Fortress.prototype);
    owner._crates = (batch, rng, x, z, height) => original(recorder({ box() {}, stamp() {} }, records), rng, x, z, height);
    for (const method of ['_parkedFighter', '_landingPad', '_fuelDepot', '_hazardPad', '_coolingStack', '_antenna', '_bunker']) owner[method] = () => {};
    Fortress.prototype._deckProps.call(owner, { box() {}, stamp() {}, lamp() {} }, new Rng(seed), 0, { index }, () => {});
    const summary = summarize(records), sourceTriangles = summary.crates * 12 + summary.drums * 40;
    sumC += summary.crates; sumD += summary.drums;
    if (sourceTriangles > most.sourceTriangles) most = { seed, ...summary, sourceTriangles };
  }
  deckDensity.push({ theme: THEMES[index].name, index, samples: 10000, averageCrates: sumC / 10000, averageDrums: sumD / 10000, most,
    caveat: 'Actual _deckProps control flow, but unrelated builders are no-op test doubles and do not advance their RNG. Full exact source deck parity is tested separately.' });
}
const report = { commit: 'ee221ad3e05cd66292fe02b71b50f513696bdda2', roots, distributions, deckDensity,
  loop: 'rng.int(1,3) executes before y cutoff on every test, including exit',
  drawsPerCrate: ['s', 'h', 'depth ratio', 'x offset', 'z offset', 'tint', 'yaw'],
  declaredWorstDeck: { crates: 12, drums: 15, sourceTriangles: 744, explanation: '3 near piles of <=2 crates + 2 battery far piles of <=3; <=3 drums at all 5 piles' } };
fs.writeFileSync(path.join(evidence, 'source-trace-density.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ roots: roots.map(({ seed, triangles, draws, crates, drums }) => ({ seed, triangles, draws, crates, drums })),
  distributions: distributions.map(({ maxH, histogram, minDraws, maxDraws, highest }) => ({ maxH, histogram, minDraws, maxDraws, highest })), deckDensity }, null, 2));
