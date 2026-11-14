/** Measure existing landmark methods with their real Batch implementation, without editing it. */
import * as THREE from 'three';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Level, CHUNK_LEN } from '../../src/world/Level.js';
import { Rng } from '../../src/core/Utils.js';
const sourcePath = resolve('src/world/Fortress.js');
const original = readFileSync(sourcePath, 'utf8');
const instrumented = original.replace(/from (['"])([^'"]+)\1/g, (_, quote, spec) => {
  const url = spec.startsWith('.') ? pathToFileURL(resolve(dirname(sourcePath), spec)).href : import.meta.resolve(spec);
  return `from ${quote}${url}${quote}`;
}) + '\nexport { Batch };';
const { Batch, Fortress, disposeFortressTemplates } = await import('data:text/javascript;base64,' + Buffer.from(instrumented).toString('base64'));
const material = new THREE.MeshBasicMaterial();
const result = {sourceSha256:createHash('sha256').update(original).digest('hex'),chunkLength:CHUNK_LEN,method:'Actual unmodified source methods with real Batch; CPU geometry only. Landmark isolated from other void props, called first as in _voidProps, using the real per-chunk RNG seed. World-space bounds include source chunk seam segmentation; shader-displaced bounds not evaluated.',samples:{}};
for (const [name,index,offset,length] of [['carrier',4,160,980],['dreadnought',2,200,820]]) {
  const records=[];
  for(const seed of [1,7,42,123]) {
    const sector=new Level(seed,0).sectors[index],start=sector.zStart+offset,end=start+length;
    const chunks=[];const box=new THREE.Box3();let triangles=0,primitives=0;
    for(let z0=Math.floor(start/CHUNK_LEN)*CHUNK_LEN;z0<end;z0+=CHUNK_LEN) {
      const batch=new Batch(),group=new THREE.Group();
      Fortress.prototype['_'+name].call({},batch,new Rng(((z0/CHUNK_LEN)*2654435761+seed)>>>0),z0,sector);
      const bucketTriangles=Object.fromEntries([...batch.buckets].map(([key,b])=>[key,b.pos.n/9]));
      batch.merge(()=>material,group);
      group.updateMatrixWorld(true);box.union(new THREE.Box3().setFromObject(group));
      const count=Object.values(bucketTriangles).reduce((a,b)=>a+b,0);triangles+=count;primitives+=group.children.length;
      chunks.push({z0,triangles:count,primitives:group.children.length,bucketTriangles});
      group.traverse(o=>o.geometry?.dispose());
    }
    records.push({seed,sectorStart:sector.zStart,landmarkStart:start,landmarkEnd:end,triangles,primitivesAcrossWholeLandmark:primitives,maxChunkTriangles:Math.max(...chunks.map(c=>c.triangles)),maxChunkPrimitives:Math.max(...chunks.map(c=>c.primitives)),bounds:{min:box.min.toArray(),max:box.max.toArray()},chunks});
  }
  result.samples[name]=records;
}
disposeFortressTemplates();material.dispose();
writeFileSync('docs/asset-production/landmark-baseline.json',JSON.stringify(result,null,2)+'\n');
for(const [name,records] of Object.entries(result.samples))console.log(JSON.stringify({name,triangles:records.map(r=>r.triangles),maxChunkTriangles:Math.max(...records.map(r=>r.maxChunkTriangles)),maxChunkPrimitives:Math.max(...records.map(r=>r.maxChunkPrimitives)),bounds:records[0].bounds}));
