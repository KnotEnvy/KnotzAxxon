/** CPU measurement of the unchanged source covered-fighter method and real Batch. */
import * as THREE from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Rng} from '../../src/core/Utils.js';
const filename=resolve('src/world/Fortress.js'),source=readFileSync(filename,'utf8');
const code=source.replace(/from (['"])([^'"]+)\1/g,(_,q,s)=>`from ${q}${s.startsWith('.')?pathToFileURL(resolve(dirname(filename),s)).href:import.meta.resolve(s)}${q}`)+'\nexport {Batch};';
const {Batch,Fortress}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const material=new THREE.MeshBasicMaterial(),samples=[];
for(const seed of [1,7,42,123]){
 const batch=new Batch(),rng=new Rng(seed),emissions=[],group=new THREE.Group();
 Fortress.prototype._parkedFighter.call({},batch,0,0,rng);
 const buckets=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,b.pos.n/9]));
 batch.merge(()=>material,group);const box=new THREE.Box3().setFromObject(group);
 samples.push({seed,buckets,triangles:Object.values(buckets).reduce((a,b)=>a+b,0),bounds:{min:box.min.toArray(),max:box.max.toArray()},emissions,rngState:rng._s});
 group.traverse(o=>o.geometry?.dispose());
}
material.dispose();writeFileSync('docs/asset-production/covered-fighter-baseline.json',JSON.stringify({method:'Actual _parkedFighter and Batch; four CPU samples, not GPU profiling',sourceDraws:1,sourceBuckets:3,samples},null,2)+'\n');console.log(JSON.stringify(samples));
