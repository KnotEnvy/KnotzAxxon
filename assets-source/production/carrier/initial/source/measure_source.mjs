import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as THREE from 'three';

const folder = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(folder, '../../../..');
const source = fs.readFileSync(path.join(root, 'src/world/Fortress.js'), 'utf8');
const rewritten = source.replace(/from '(\.\.?\/[^']+)'/g, (_, target) => `from '${pathToFileURL(path.resolve(root, 'src/world', target)).href}'`);
const { Batch, Fortress } = await import(`data:text/javascript;base64,${Buffer.from(rewritten + '\nexport { Batch };').toString('base64')}`);
const { Rng } = await import(pathToFileURL(path.join(root, 'src/core/Utils.js')));
const { Level } = await import(pathToFileURL(path.join(root, 'src/world/Level.js')));
const records = [];
for (const seed of [1, 7, 42, 123]) {
  const level = new Level(seed);
  const sector = level.sectors.find(item => item.index === 4);
  const start = sector.zStart + 160;
  const chunks = [];
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  for (let index = Math.floor(start / 96); index <= Math.floor((start + 980) / 96); index++) {
    const batch = new Batch();
    batch.frontLift = batch.sideLift = 1.4;
    const rng = new Rng((index * 2654435761 + seed) >>> 0);
    let calls = 0;
    const originalNext = rng.next.bind(rng);
    rng.next = () => { calls++; return originalNext(); };
    Fortress.prototype._carrier.call({}, batch, rng, index * 96, sector);
    const before = rng._s;
    const fixtureRng = new Rng((index * 2654435761 + seed) >>> 0);
    consumeCarrierRng(fixtureRng, index * 96, sector);
    if (fixtureRng._s !== before) throw new Error(`RNG replay diverged at ${index}`);
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const bucketNames = [...batch.buckets.keys()];
    batch.merge(() => material, group);
    let triangles = 0;
    const buckets = {};
    for (const mesh of group.children) {
      const geometry = mesh.geometry;
      const positions = geometry.attributes.position.array;
      const count = positions.length / 9;
      const key = bucketNames[group.children.indexOf(mesh)];
      buckets[key] = count;
      triangles += count;
      for (let offset = 0; offset < positions.length; offset += 3) {
        for (let axis = 0; axis < 3; axis++) {
          minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
          maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
        }
      }
      geometry.dispose();
    }
    chunks.push({ index, z0: index * 96, triangles, primitives: group.children.length, buckets, rngCalls: calls, stateAfter: before });
    material.dispose();
  }
  records.push({ seed, sectorStart: sector.zStart, start, end: start + 980, bounds: { min: minimum, max: maximum }, triangles: chunks.reduce((sum, item) => sum + item.triangles, 0), maxChunkTriangles: Math.max(...chunks.map(item => item.triangles)), chunks });
}
const paths = ['src/world/Fortress.js', 'src/world/Level.js', 'src/core/Utils.js', 'src/core/Settings.js', 'src/game/CameraRig.js', 'src/render/Materials.js', 'src/render/Sky.js', 'src/entities/Enemies.js', 'src/game/Game.js'];
const hashes = Object.fromEntries(paths.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
fs.writeFileSync(path.join(folder, '../checks/source-measurement.json'), JSON.stringify({ kind: 'actual CPU source Batch, no WebGL/GPU claim', records, rngReplayVerified: true, sourceSHA256: hashes }, null, 2));
console.log(JSON.stringify(records.map(({ seed, triangles, maxChunkTriangles, bounds }) => ({ seed, triangles, maxChunkTriangles, bounds })), null, 2));

export function consumeCarrierRng(rng, z0, sector) {
  const start = (sector.zStart ?? 0) + 160, end = start + 980;
  const lower = Math.max(z0, start), upper = Math.min(z0 + 96, end);
  for (let z = lower; z < upper; z += 16) {
    const center = z + Math.min(16, upper - z) / 2;
    if (Math.floor(center / 16) % 3 === 0) {
      for (let window = 0; window < 4; window++) { rng.range(-4, 4); rng.bool(0.7); }
    }
  }
}
