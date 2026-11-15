/**
 * Export actual streamed chunk geometry (working fixture, kit off and kit on) for a
 * world-scale Blender composition. CPU only.
 *   node export-composition.mjs <outDir> <seed> <firstChunk> <lastChunk> <poseZ,poseZ,...>
 * Writes composition-data.json + composition-data.bin (float32 LE).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTree, parseGlb, WORK, KIT_GLB } from './harness.mjs';

const [outDir] = process.argv.slice(2, 3);
const seed = +(process.argv[3] ?? 7), first = +(process.argv[4] ?? 54), last = +(process.argv[5] ?? 58);
const GATE_TIME = 1.7;
mkdirSync(outDir, { recursive: true });
const work = await loadTree(WORK);
const { CHUNK_LEN } = work.Level;
const kitMod = await import(work.url('src/world/EnvironmentKit.js'));
const { rigCamera } = await import('./cameras.mjs');

let offset = 0;
const blobs = [];
function attr(a) {
  const arr = a.array instanceof Float32Array ? a.array : new Float32Array(a.array);
  const rec = { offset, count: arr.length, itemSize: a.itemSize };
  blobs.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)); offset += arr.byteLength;
  return rec;
}
const variants = {};
let features, sectors;
for (const v of ['source', 'kit']) {
  if (v === 'kit') kitMod.prepareEnvironmentKit(await parseGlb(KIT_GLB));
  const { level, fortress } = work.make(seed, 0);
  const out = [];
  for (let i = first; i <= last; i++) {
    const g = fortress._buildChunk(i); fortress.chunks.set(i, g);
    for (const a of fortress.animated) a.update?.(0, GATE_TIME, 0);
    const meshes = [];
    g.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
      const kind = o.material.name;
      meshes.push({
        bucket: kind, feature: o.parent !== g, position: o.position.toArray(), scale: o.scale.toArray(),
        attributes: Object.fromEntries(Object.entries(geo.attributes).map(([k, a]) => [k, attr(a)])),
        fieldColor: kind === 'forceField' ? o.material.userData.color : undefined,
      });
    });
    out.push({ index: i, z0: i * CHUNK_LEN, sector: level.sectorAt(i * CHUNK_LEN + CHUNK_LEN / 2)?.index, meshes });
  }
  variants[v] = out;
  if (v === 'source') {
    features = level.features.filter((f) => f.z >= first * CHUNK_LEN - 40 && f.z < (last + 1) * CHUNK_LEN + 40).map(({ runtime, ...f }) => ({ ...f, gapYAtPose: runtime?.gapY }));
    sectors = level.sectors.map((s) => ({ index: s.index, name: s.name, kind: s.kind, sky: s.sky, zStart: s.zStart, zEnd: s.zEnd }));
  }
  fortress.clear();
}
kitMod.disposeEnvironmentKit();
const poses = (process.argv[6] ?? '').split(',').filter(Boolean).map(Number).map((z) => ({
  player: [0, 9, z],
  cameras: Object.fromEntries(['classic', 'modern', 'chase'].map((r) => [r, rigCamera(r, [0, 9, z], 16 / 9)])),
}));
writeFileSync(resolve(outDir, 'composition-data.bin'), Buffer.concat(blobs));
writeFileSync(resolve(outDir, 'composition-data.json'), JSON.stringify({
  schema: 'knotzaxxon-environment-composition-v1', seed, loop: 0, chunks: [first, last], gateTime: GATE_TIME, fortressSha: work.sha,
  note: 'Actual Fortress._buildChunk output (kit off vs kit on) in game coordinates; gate planes/posts posed by the source update(time). Player/threat models are placed by the Blender builder from shipped GLBs at scale 1.',
  variants, features, sectors, poses,
}) + '\n');
console.log('bytes', offset, 'features', features.length, 'chunks', first, last);
