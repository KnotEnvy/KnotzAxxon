import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
let ancestor = import.meta.dirname;
while (!fs.existsSync(`${ancestor}/src/world/Fortress.js`) && path.dirname(ancestor) !== ancestor) ancestor = path.dirname(ancestor);
export const root = process.env.COVERED_REPO_ROOT ?? ancestor;
const { Level, CHUNK_LEN } = await import(pathToFileURL(`${root}/src/world/Level.js`));
const { Rng: OriginalRng } = await import(pathToFileURL(`${root}/src/core/Utils.js`));
export const home = path.resolve(import.meta.dirname, '..');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const write = (name, value) => {
  fs.mkdirSync(path.dirname(`${home}/${name}`), { recursive: true });
  fs.writeFileSync(`${home}/${name}`, JSON.stringify(value, null, 2) + '\n');
};

export async function loadSource() {
  let text = fs.readFileSync(`${root}/src/world/Fortress.js`, 'utf8');
  text = text.replace(/from '(\.\.?\/[^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve(root, 'src/world', relative)).href}'`);
  text = text.replace('import { Rng, clamp', 'import { Rng as SourceRng, clamp');
  text += `\nconst rngInstances = [];\nclass Rng extends SourceRng { constructor(seed) { super(seed); this.trace=[]; rngInstances.push(this); } next() { const value=super.next(); this.trace.push(value); return value; } }\nexport { Batch, TPL, parkedFighterParts, rngInstances };\n`;
  return import(`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`);
}

export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index++) {
    const axis = index % 3;
    min[axis] = Math.min(min[axis], positions[index]);
    max[axis] = Math.max(max[axis], positions[index]);
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

export function capture(batch) {
  return Object.fromEntries([...batch.buckets].map(([key, bucket]) => [key, {
    triangles: bucket.pos.n / 9,
    positions: Array.from(bucket.pos.a.subarray(0, bucket.pos.n)),
    normals: Array.from(bucket.nrm.a.subarray(0, bucket.nrm.n)),
    colors: Array.from(bucket.col.a.subarray(0, bucket.col.n)),
    bounds: bounds(bucket.pos.a.subarray(0, bucket.pos.n)),
  }]));
}

export function materials() {
  const shared = new THREE.MeshStandardMaterial({ vertexColors: true });
  return new Proxy({}, { get: () => shared });
}

export function summarizeChunk(group) {
  const meshes = [];
  group.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, attr]) => [name, hash(Buffer.from(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength))]));
    meshes.push({ vertices: geometry.attributes.position.count, attributes });
  });
  return { meshes, surfaces: group.userData.deckSurfaces };
}

export function makeFortress(module, seed, loop = 0) {
  return new module.Fortress(new THREE.Scene(), materials(), new Level(seed, loop), { drawDistance: 440 });
}

export { THREE, Level, CHUNK_LEN, OriginalRng };
