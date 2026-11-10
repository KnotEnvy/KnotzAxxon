// Optional: parse the GLBs with the game's three.js GLTFLoader (image decoding stubbed).
// Needs the repo's node_modules (npm ci at the repo root). Usage:
//   node contest-entry/build/loader_check.mjs contest-entry/player.glb contest-entry/sentinel.glb
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
globalThis.self = globalThis;
globalThis.createImageBitmap = async (blob) => ({ width: 32, height: 32, close() {} });
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const out = {};
for (const path of process.argv.slice(2)) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
  const names = []; let meshes = 0, tris = 0;
  gltf.scene.traverse(o => { if (o.name) names.push(o.name); if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const get = n => { const o = gltf.scene.getObjectByName(n); return o ? o.position.toArray().map(v => +v.toFixed(4)) : null; };
  const probe = ['engine-core-L','engine-core-R','muzzle-L','muzzle-R','head','reactor','forearm-R','missile-mouth','pod-R','pod-L','shutter-0','pod-R-barrel-1','thruster-L'];
  out[path] = { meshes, tris, size: box.getSize(new THREE.Vector3()).toArray().map(v => +v.toFixed(3)),
    clips: gltf.animations.map(a => `${a.name}:${a.duration.toFixed(3)}s/${a.tracks.length}tr`),
    positions: Object.fromEntries(probe.map(n => [n, get(n)]).filter(([, v]) => v)), nodeCount: names.length };
}
console.log(JSON.stringify(out, null, 1));
