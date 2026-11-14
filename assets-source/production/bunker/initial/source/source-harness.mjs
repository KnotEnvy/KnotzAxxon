import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';

export const root = path.resolve(process.env.REPO_ROOT ?? '.');
export const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filename = path.join(root, 'src/world/Fortress.js');
export const fortressSource = fs.readFileSync(filename, 'utf8');
const moduleSource = fortressSource.replace(/from '(\.\.?\/[^']+)'/g, (whole, relative) => `from '${pathToFileURL(path.resolve(path.dirname(filename), relative)).href}'`) + '\nexport { Batch, themeFor };';
export const { Batch, Fortress, themeFor, disposeFortressTemplates } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
export const { Rng } = await import(pathToFileURL(path.join(root, 'src/core/Utils.js')));
export const { Level, CHUNK_LEN } = await import(pathToFileURL(path.join(root, 'src/world/Level.js')));
export function materialsDouble() {
  const hull = new THREE.MeshStandardMaterial({ vertexColors: true });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, vertexColors: true });
  const neonVertex = new THREE.MeshBasicMaterial({ vertexColors: true });
  return new Proxy({ hull, darkMetal, neonVertex, forceField: () => neonVertex }, { get: (target, key) => target[key] ?? darkMetal });
}
export function measure(batch) {
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], buckets = {};
  for (const [key, bucket] of batch.buckets) {
    buckets[key] = bucket.pos.n / 9;
    for (let offset = 0; offset < bucket.pos.n; offset++) {
      const axis = offset % 3, value = bucket.pos.a[offset];
      bounds[0][axis] = Math.min(bounds[0][axis], value);
      bounds[1][axis] = Math.max(bounds[1][axis], value);
    }
  }
  return { bounds, buckets, triangles: Object.values(buckets).reduce((sum, count) => sum + count, 0) };
}
