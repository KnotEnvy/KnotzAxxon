import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';

export const root = path.resolve(process.env.REPO_ROOT ?? '.');
export const output = path.join(root, 'asset-work/antenna/initial');
const filename = path.join(root, 'src/world/Fortress.js');
export const fortressSource = fs.readFileSync(filename, 'utf8');
const executable = fortressSource.replace(/from '(\.\.?\/[^']+)'/g, (whole, relative) => `from '${pathToFileURL(path.resolve(path.dirname(filename), relative)).href}'`)
  + '\nexport { Batch, themeFor };\n';
export const { Batch, Fortress, themeFor, disposeFortressTemplates } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);
export const { Rng } = await import(pathToFileURL(path.join(root, 'src/core/Utils.js')));
export const { Level, CHUNK_LEN } = await import(pathToFileURL(path.join(root, 'src/world/Level.js')));
export function materialsDouble() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, metalness: .5, roughness: .46, vertexColors: true });
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  return new Proxy({ darkMetal: dark, neonVertex: neon, forceField: () => neon }, { get: (target, key) => target[key] ?? dark });
}
export function stats(batch) {
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  const buckets = {};
  for (const [key, bucket] of batch.buckets) {
    buckets[key] = bucket.pos.n / 9;
    for (let offset = 0; offset < bucket.pos.n; offset++) {
      const value = bucket.pos.a[offset], axis = offset % 3;
      bounds[0][axis] = Math.min(bounds[0][axis], value);
      bounds[1][axis] = Math.max(bounds[1][axis], value);
    }
  }
  return { bounds, buckets, triangles: Object.values(buckets).reduce((sum, count) => sum + count, 0) };
}
export function antennaTrace(batch, rng, x, z, theme, operation) {
  const boxes = [], originalBox = batch.box;
  batch.box = function (...args) { boxes.push(args); return originalBox.apply(this, args); };
  const stateBefore = rng._s;
  try { operation(batch, rng, x, z, theme); } finally { batch.box = originalBox; }
  return { x, z, theme: theme.name, height: boxes[0][2], elements: boxes.slice(1, -1).map(args => ({ width: args[1], y: args[5] })), animation: boxes.at(-1).at(-1).anim, stateBefore, stateAfter: rng._s };
}
