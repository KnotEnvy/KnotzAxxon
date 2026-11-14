import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
export { Batch, Fortress, themeFor, disposeFortressTemplates } from '../../../../src/world/Fortress.js';
export { Rng } from '../../../../src/core/Utils.js';
export { Level, CHUNK_LEN } from '../../../../src/world/Level.js';
export const repo = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const output = path.join(repo, 'asset-work/flak-gun/initial');
export const sha = data => crypto.createHash('sha256').update(data).digest('hex');
export const write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n');
export function materialsDouble() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, metalness: .5, roughness: .46, vertexColors: true });
  const hull = new THREE.MeshStandardMaterial({ metalness: .36, roughness: 1, vertexColors: true });
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true });
  return new Proxy({ darkMetal: dark, hull, neonVertex: neon, forceField: () => neon }, { get: (target, key) => target[key] ?? dark });
}
export function stats(batch) {
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], buckets = {};
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
export function serialize(batch) {
  return [...batch.buckets].map(([bucket, data]) => ({ bucket, p: Array.from(data.pos.view()), n: Array.from(data.nrm.view()), c: Array.from(data.col.view()), uv: Array.from(data.uv.view()) }));
}
export function traceCall(operation, batch, rng, x, z, emit, roofY = 0) {
  const next = rng.next, draws = [], states = [], start = rng._s;
  rng.next = function () { const value = next.call(this); draws.push(value); states.push(this._s); return value; };
  const emitters = [];
  try {
    operation(batch, rng, x, z, (...args) => { emitters.push(args.map(value => value?.isVector3 ? value.toArray() : value)); emit(...args); }, roofY);
  } finally { rng.next = next; }
  return { x, z, roofY, pitch: 1 + draws[0] * .3, yaw: -(.6 + draws[1] * .5), rate: .25 + draws[2] * .2, phase: draws[3] ?? null, stateBefore: start, stateAfter: rng._s, draws, states, emitters };
}
