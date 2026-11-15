// Print the level plan for a seed: sector starts and the features worth pointing a camera at.
import { loadTree, WORK } from './harness.mjs';
const t = await loadTree(WORK, { templates: false });
const seed = Number(process.argv[2] ?? 7), loop = Number(process.argv[3] ?? 0);
const level = new t.Level.Level(seed, loop);
for (const s of level.sectors) {
  const fs = level.features.filter((f) => f.z >= s.zStart && f.z < s.zEnd && ['wall', 'arch', 'gate', 'fence', 'platform', 'debrisRing', 'boss'].includes(f.kind));
  const tag = (f) => `${f.kind}${f.kind === 'wall' ? ':' + (f.debris ? 'debris' : f.perimeter ? 'perimeter' : f.type) : ''}${f.pylon ? ':pylon' : ''}@${Math.round(f.z - s.zStart)}`;
  console.log(`${s.index} ${s.name.padEnd(20)} z ${Math.round(s.zStart)}..${Math.round(s.zEnd)}  ${fs.map(tag).join(' ')}`);
}
