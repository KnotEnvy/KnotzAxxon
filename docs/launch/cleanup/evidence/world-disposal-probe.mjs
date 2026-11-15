import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Fortress } from '../../../../src/world/Fortress.js';
import { AmbientTraffic, disposeAmbientTraffic } from '../../../../src/world/AmbientTraffic.js';
import { prepareEnvironmentKit, environmentKitParts, disposeEnvironmentKit } from '../../../../src/world/EnvironmentKit.js';
const output = [];
const g = new THREE.Group(), root = new THREE.Group(); root.add(g);
const first = new THREE.BoxGeometry(), second = new THREE.BoxGeometry();
g.add(new THREE.Mesh(first), new THREE.Mesh(second));
let later = 0; second.addEventListener('dispose', () => later++);
first.addEventListener('dispose', () => { throw Error('first geometry'); });
const f = Object.assign(Object.create(Fortress.prototype), {root, rearObstacles:[{owner:g}],emitters:[{owner:g}],animated:[{owner:g}]});
try { f._disposeChunk(g); } catch {}
output.push({path:'src/world/Fortress.js',method:'_disposeChunk',secondGeometryDisposals:later,attached:!!g.parent,rearObstacles:f.rearObstacles.length,emitters:f.emitters.length,animated:f.animated.length});
const traffic = new AmbientTraffic(new THREE.Scene());
let material = 0; traffic.mesh.material.addEventListener('dispose', () => material++);
traffic.mesh.geometry.addEventListener('dispose', () => { throw Error('traffic geometry'); });
try { disposeAmbientTraffic(); } catch {}
output.push({path:'src/world/AmbientTraffic.js',method:'disposeAmbientTraffic',materialDisposals:material});
const b = await readFile(new URL('../../../../public/models/environment/environment-kit.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
prepareEnvironmentKit(gltf);
const geometries = [...environmentKitParts().values()], counts = new Map(geometries.map(g=>[g,0]));
for(const g of geometries)g.addEventListener('dispose',()=>counts.set(g,counts.get(g)+1));
geometries[0].addEventListener('dispose',()=>{throw Error('kit geometry');});
try {disposeEnvironmentKit();} catch {}
output.push({path:'src/world/EnvironmentKit.js',method:'disposeEnvironmentKit',attempted:[...counts.values()].reduce((a,b)=>a+b,0),owned:counts.size,mapSize:environmentKitParts().size});
console.log(JSON.stringify(output,null,2));
