import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { payload, repo, THREE, sourceModule, expose, geometryData, bounds, saveJson } from './source-loader.mjs';

const { Fortress, Batch, rockGeometry } = await import(await sourceModule('src/world/Fortress.js', expose));
const { Level, CHUNK_LEN } = await import(await sourceModule('src/world/Level.js'));
const { Rng } = await import(await sourceModule('src/core/Utils.js'));
class CountingRng extends Rng {
  calls = 0;
  next() { this.calls++; return super.next(); }
}
const seeds = [1, 42, 2718, 7919, 137, 2026, 0xdecafbad, 0x12345678];
const chunks = [];
const geometryHash = geometry => {
  const digest = crypto.createHash('sha256');
  for (const key of Object.keys(geometry.attributes).sort()) digest.update(key).update(Buffer.from(geometry.attributes[key].array.buffer));
  if (geometry.index) digest.update(Buffer.from(geometry.index.array.buffer));
  return digest.digest('hex');
};
for (const seed of seeds) {
  const level = new Level(seed);
  const fortress = new Fortress(new THREE.Scene(), {}, level, { drawDistance: 700 });
  for (let index = 0; index * CHUNK_LEN < level.totalLength; index++) {
    const sector = level.sectorAt(index * CHUNK_LEN + 48);
    if (sector.kind !== 'space') continue;
    const rng = new CountingRng((index * 2654435761 + seed) >>> 0);
    const batch = new Batch();
    const rocks = [];
    const add = batch.add.bind(batch);
    const appendages = crypto.createHash('sha256');
    let asteroidEnded = false;
    batch.add = (key, geometry, x, y, z, uvScale, tint, rotY, gain, fx) => {
      if (key === 'rock' && geometry.userData.legacyShape && !asteroidEnded) {
        const position = geometry.attributes.position;
        let radius = 0;
        for (let vertex = 0; vertex < position.count; vertex++) radius = Math.max(radius, Math.hypot(position.getX(vertex), position.getY(vertex), position.getZ(vertex)));
        const item = { ordinal: rocks.length, x, y, z, s: uvScale / 2, tint, spin: fx.spin, shape: geometry.userData.legacyShape,
          triangles: position.count / 3, boundsLocal: bounds(geometry), radius, callsAtAdd: rng.calls, stateAtAdd: rng._s };
        if (seed === 42) item.geometry = geometryData(geometry);
        rocks.push(item);
      } else {
        asteroidEnded = rocks.length > 0;
        appendages.update(key).update(JSON.stringify([x, y, z, uvScale, tint, rotY, gain, fx])).update(geometryHash(geometry));
      }
      return add(key, geometry, x, y, z, uvScale, tint, rotY, gain, fx);
    };
    fortress._voidProps(batch, rng, index * CHUNK_LEN, sector);
    const group = new THREE.Group();
    batch.merge(key => new THREE.MeshBasicMaterial({ name: key }), group, false, false);
    const nonRockBuckets = {};
    for (const mesh of group.children) if (mesh.material.name !== 'rock') nonRockBuckets[mesh.material.name] = geometryHash(mesh.geometry);
    chunks.push({ seed, index, sector: sector.index, rocks, count: rocks.length, triangles: rocks.reduce((sum, rock) => sum + rock.triangles, 0),
      finalState: rng._s, calls: rng.calls, nextValues: [rng.next(), rng.next(), rng.next()], nonRockBuckets, appendagesHash: appendages.digest('hex') });
    for (const mesh of group.children) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}
const counts = chunks.map(chunk => chunk.count);
const rocks = chunks.flatMap(chunk => chunk.rocks);
const summary = {
  commit: 'ee221ad', sampleSeeds: seeds, sampleChunks: chunks.length, sampleRocks: rocks.length,
  topology: [1, 2].map(detail => { const geometry = new THREE.IcosahedronGeometry(1, detail); return { detail, triangles: geometry.attributes.position.count / 3 }; }),
  countHistogram: Object.fromEntries([...new Set(counts)].sort().map(count => [count, counts.filter(value => value === count).length])),
  meanCount: counts.reduce((sum, value) => sum + value, 0) / counts.length,
  radiusParameter: [Math.min(...rocks.map(rock => rock.s)), Math.max(...rocks.map(rock => rock.s))],
  conservativeSpinRadius: [Math.min(...rocks.map(rock => rock.radius)), Math.max(...rocks.map(rock => rock.radius))],
  trianglesPerChunk: [Math.min(...chunks.map(chunk => chunk.triangles)), Math.max(...chunks.map(chunk => chunk.triangles))],
  meanTrianglesPerChunk: chunks.reduce((sum, chunk) => sum + chunk.triangles, 0) / chunks.length,
  rngRecipe: 'Each successful iteration: 1 condition int + 3 placement + 1 radius + 1 z + 3 axis + 5 rockGeometry + 1 tint + 1 speed = 16 next(); final failed condition = 1. Landmarks before and wreck/truss after are additional, executed unmodified.',
  theoreticalCount: [5, 9], theoreticalS: [1, 28.8],
  stream: [320, 440, 560, 700].map(distance => ({ distance, behind: 90,
    requestedChunks: [Math.floor((distance + 90) / 96) + 1, Math.ceil((distance + 90) / 96) + 1],
    possibleRetainedExtra: 3, note: 'Retirement allows first-1 through last+2. Includes non-space boundary chunks; this is an all-space proxy, not frustum visibility.' })),
  gatePolicy: 'debrisRing and wall drift source rockGeometry remain unchanged; no optional gate mapping.',
};
saveJson('measurements/baseline.json', { summary, chunks });
for (const relative of ['src/game/CameraRig.js', 'src/core/Settings.js', 'src/core/FlightCamera.js']) {
  const target = path.join(payload, 'reference', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(repo, relative), target);
}
console.log(JSON.stringify(summary, null, 2));
