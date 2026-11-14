import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
export { Batch, Fortress, disposeFortressTemplates } from '../../../../src/world/Fortress.js';
export { Rng } from '../../../../src/core/Utils.js';
export { Level, CHUNK_LEN } from '../../../../src/world/Level.js';
export const repo = new URL('../../../../', import.meta.url);
export const out = new URL('../', import.meta.url);
export const sha = value => crypto.createHash('sha256').update(value).digest('hex');
export const write = (name, data) => fs.writeFileSync(new URL(name, out), `${JSON.stringify(data, null, 2)}\n`);
export const streams = ['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'];
export function materialsDouble() {
  const hull = new THREE.MeshStandardMaterial({ metalness: .36, roughness: 1, vertexColors: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, metalness: .5, roughness: .46, vertexColors: true });
  return new Proxy({ hull, darkMetal: dark, forceField: () => dark }, { get: (target, key) => target[key] ?? dark });
}
export function stats(batch) {
  const bounds = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]], buckets = {};
  for (const [key, bucket] of batch.buckets) {
    buckets[key] = bucket.pos.n / 9;
    for (let offset = 0; offset < bucket.pos.n; offset++) {
      const axis = offset % 3, value = bucket.pos.a[offset];
      bounds[0][axis] = Math.min(bounds[0][axis], value);
      bounds[1][axis] = Math.max(bounds[1][axis], value);
    }
  }
  return { triangles: Object.values(buckets).reduce((sum, value) => sum + value, 0), buckets, bounds };
}
export function serialize(batch) {
  return [...batch.buckets].map(([key, bucket]) => ({ key, ...Object.fromEntries(streams.filter(field => bucket[field]).map(field => [field, Array.from(bucket[field].view())])) }));
}
export function groupData(group) {
  const meshes = [];
  group.updateMatrixWorld(true);
  group.traverse(object => {
    if (!object.isMesh) return;
    meshes.push({ name: object.name, matrix: object.matrixWorld.toArray(), attributes: Object.fromEntries(Object.entries(object.geometry.attributes).map(([key, value]) => [key, Array.from(value.array)])) });
  });
  return meshes;
}
