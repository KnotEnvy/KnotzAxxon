import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadSource, makeFortress, capture, bounds, hash, write, home, THREE, OriginalRng as Rng } from './source-harness.mjs';
import { initializeCoveredFighter, stampCoveredFighter, disposeCoveredFighterTemplates } from './CoveredFighterRecipe.mjs';

const source = await loadSource();
const recipe = JSON.parse(fs.readFileSync(`${home}/asset/covered-fighter.recipe.json`));
const reference = JSON.parse(fs.readFileSync(`${home}/evidence/source-geometry.json`));
const cached = initializeCoveredFighter(THREE);
assert.equal(cached, initializeCoveredFighter(THREE));
assert.equal(cached.length, 42);
const originalPositions = [...reference.buckets.hull.positions, ...reference.buckets.dark.positions];
const candidatePositions = recipe.parts.filter(part => part.bucket !== 'paint').flatMap(part => part.positions);
function convexHull(points) {
  const sorted = [...new Map(points.map(point => [JSON.stringify(point),point])).values()].sort((first,second) => first[0]-second[0] || first[1]-second[1]);
  const cross = (first,second,third) => (second[0]-first[0])*(third[1]-first[1])-(second[1]-first[1])*(third[0]-first[0]);
  const lower = [], upper = [];
  for (const point of sorted) { while (lower.length > 1 && cross(lower.at(-2),lower.at(-1),point)<=0) lower.pop(); lower.push(point); }
  for (const point of sorted.toReversed()) { while (upper.length > 1 && cross(upper.at(-2),upper.at(-1),point)<=0) upper.pop(); upper.push(point); }
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
const plan = convexHull(Array.from({length:originalPositions.length/3},(_,index) => [originalPositions[index*3],originalPositions[index*3+2]]));
let minPlanDistance = Infinity;
for (let edge = 0; edge < plan.length; edge++) {
  const first = plan[edge], second = plan[(edge+1)%plan.length];
  for (let index = 0; index < candidatePositions.length; index+=3) {
    const distance = ((second[0]-first[0])*(candidatePositions[index+2]-first[1])-(second[1]-first[1])*(candidatePositions[index]-first[0]))/Math.hypot(second[0]-first[0],second[1]-first[1]);
    minPlanDistance = Math.min(minPlanDistance,distance);
  }
}
assert.ok(minPlanDistance >= -1e-6, `Convex source plan envelope violated: ${minPlanDistance}`);
const candidateBounds = bounds(candidatePositions), originalBounds = bounds(originalPositions);
assert.ok(candidateBounds.min[1] >= originalBounds.min[1]-1e-6 && candidateBounds.max[1] <= originalBounds.max[1]+1e-6);
const yawEvidence = [];
for (let step=0;step<=1000;step++) {
  const yaw = -.25+step/2000;
  const rotate = positions => positions.map((value,index) => index%3===1 ? value : index%3===0 ? value*Math.cos(yaw)+positions[index+2]*Math.sin(yaw) : -positions[index-2]*Math.sin(yaw)+value*Math.cos(yaw));
  const old = bounds(rotate(originalPositions)), next = bounds(rotate(candidatePositions));
  const margins = next.min.map((value,axis) => value-old.min[axis]).concat(next.max.map((value,axis) => old.max[axis]-value));
  assert.ok(Math.min(...margins)>=-1e-6);
  yawEvidence.push({yaw,source:old,candidate:next,minMargin:Math.min(...margins)});
}
const transformCases=[];
for (const yaw of [-.25,0,.25]) for (const x of [21,23.5]) {
  const old = new source.Batch(), next = new source.Batch();
  old.captureSurfaces=next.captureSurfaces=true;
  const rng = {range:(lo,hi) => {assert.equal(lo,-.25);assert.equal(hi,.25);return yaw;}};
  source.Fortress.prototype._parkedFighter.call({},old,x,50,rng);
  stampCoveredFighter(next,x,50,rng);
  assert.deepEqual(old.surfaces,next.surfaces);
  const before=capture(old), after=capture(next);
  assert.deepEqual(before.paint,after.paint);
  if (x===21) {
    write(`evidence/placement-source-yaw${yaw}.json`,before);
    write(`evidence/placement-candidate-yaw${yaw}.json`,after);
  }
  transformCases.push({x,yaw,surfacesEqual:true,paintByteEquivalent:true,drawBuckets:[...next.buckets.keys()]});
}

const originalMerge=source.Batch.prototype.merge;
let activeMerges=[];
let renderMerges=null;
source.Batch.prototype.merge=function(...args) {
  const entries=[];
  for (const [key,bucket] of this.buckets) {
    const excluded=this.coveredExcluded?.get(key) ?? [];
    const attributes={};
    for (const name of ['pos','nrm','uv','col','anim','pivot','spin']) {
      const buffer=bucket[name];
      if (!buffer) continue;
      const stride=name==='uv'?2:name==='spin'?4:3;
      const values=[];
      let excludedIndex=0;
      for (let vertex=0;vertex<buffer.n/stride;vertex++) {
        while (excludedIndex<excluded.length && vertex>=excluded[excludedIndex][1]) excludedIndex++;
        if (excludedIndex<excluded.length && vertex>=excluded[excludedIndex][0] && vertex<excluded[excludedIndex][1]) continue;
        for (let axis=0;axis<stride;axis++) values.push(buffer.a[vertex*stride+axis]);
      }
      attributes[name]=hash(Buffer.from(new Float32Array(values).buffer));
    }
    entries.push({key,attributes});
  }
  activeMerges.push(entries);
  if (renderMerges) renderMerges.push(capture(this));
  return originalMerge.apply(this,args);
};
function runChunk(mode,seed,index,loop=0,render=false) {
  const fortress=makeFortress(source,seed,loop);
  const original=fortress._parkedFighter;
  const placements=[];
  fortress._parkedFighter=function(batch,x,z,rng) {
    batch.coveredExcluded ??= new Map();
    const before=Object.fromEntries([...batch.buckets].map(([key,bucket])=>[key,bucket.pos.n/3]));
    const draws=rng.trace.length;
    if (mode==='source') original.call(this,batch,x,z,rng); else stampCoveredFighter(batch,x,z,rng);
    placements.push({x,z,yaw:-.25+rng.trace[draws]*.5,draws:rng.trace.length-draws});
    for (const key of ['hull','dark']) {
      if (!batch.coveredExcluded.has(key)) batch.coveredExcluded.set(key,[]);
      batch.coveredExcluded.get(key).push([before[key]??0,batch.buckets.get(key).pos.n/3]);
    }
  };
  activeMerges=[];
  renderMerges=render?[]:null;
  const levelBefore=hash(JSON.stringify({features:fortress.level.features,colliders:fortress.level.colliders}));
  const group=fortress._buildChunk(index);
  fortress.chunks.set(index,group);
  const rng=source.rngInstances.at(-1);
  const rngTraceHash=hash(JSON.stringify(rng.trace));
  const rngDraws=rng.trace.length;
  const downstream=Array.from({length:16},()=>rng.next());
  const guideProbes=[];
  for (const x of [-16,0,16,21,23.5]) for (let dz=0;dz<96;dz+=3) for (const altitude of [1.3,3,9,25]) guideProbes.push(fortress.surfaceAt(x,index*96+dz,altitude));
  const buffers=activeMerges;
  if (render) write(`evidence/world-${mode}-seed${seed}-chunk${index}.json`,{seed,index,placements,merges:renderMerges});
  const groupCount=group.children.length;
  const surfaces=group.userData.deckSurfaces;
  const emitterRecords=fortress.emitters.map(({owner,...record})=>record);
  const levelAfter=hash(JSON.stringify({features:fortress.level.features,colliders:fortress.level.colliders}));
  assert.equal(levelBefore,levelAfter);
  let retiredBuffers=0, ownedBuffers=0;
  group.traverse(object=>{if(object.isMesh){ownedBuffers++;object.geometry.addEventListener('dispose',()=>retiredBuffers++);}});
  fortress.clear();
  assert.equal(retiredBuffers,ownedBuffers);
  return {placements,rngDraws,rngTraceHash,downstream,buffers,surfaces,guideProbes,levelBefore,levelAfter,groupCount,emitterRecords,emittersAfterClear:fortress.emitters.length,rootChildren:fortress.root.children.length};
}
const comparisons=[];
for (const seed of [1,7,42,123]) for (const loop of [0,2]) for (let index=0;index<16;index++) {
  const render=seed===42 && index===0 && loop===0;
  const old=runChunk('source',seed,index,loop,render),next=runChunk('candidate',seed,index,loop,render);
  assert.deepEqual(next,old,`Full chunk contract mismatch seed ${seed} loop ${loop} index ${index}`);
  comparisons.push({seed,loop,index,placements:old.placements,rngDraws:old.rngDraws,rngTraceHash:old.rngTraceHash,downstream:old.downstream,untouchedBuffersHash:hash(JSON.stringify(old.buffers)),surfacesHash:hash(JSON.stringify(old.surfaces)),guideProbesHash:hash(JSON.stringify(old.guideProbes)),emitterRecordsHash:hash(JSON.stringify(old.emitterRecords)),drawMeshes:old.groupCount,exactMatch:true});
}
source.Batch.prototype.merge=originalMerge;
const draws=[];
for (const density of [1,2,3,8]) {
  const batch=new source.Batch();
  const rng=new Rng(42);
  for (let index=0;index<density;index++) stampCoveredFighter(batch,21,30+index*9,rng);
  const group=new THREE.Group();
  batch.merge(()=>new THREE.MeshStandardMaterial(),group);
  assert.equal(group.children.length,3);
  assert.equal(initializeCoveredFighter(THREE),cached);
  draws.push({density,mergedMeshes:3,cachedTemplates:cached.length,triangles:group.children.reduce((sum,mesh)=>sum+mesh.geometry.attributes.position.count/3,0)});
  group.traverse(object=>{if(object.isMesh){object.geometry.dispose();object.material.dispose();}});
}
const disposals=cached.map(()=>0);
cached.forEach((part,index)=>part.geometry.addEventListener('dispose',()=>disposals[index]++));
disposeCoveredFighterTemplates();
disposeCoveredFighterTemplates();
assert.ok(disposals.every(count=>count===1));
assert.throws(()=>stampCoveredFighter(new source.Batch(),21,30,new Rng(1)));
let minimumX=Infinity,minimumXYaw=null;
for (let index=0;index<candidatePositions.length;index+=3) {
  const x=candidatePositions[index],z=candidatePositions[index+2];
  const angles=[-.25,.25];
  for (let turn=-2;turn<=2;turn++) {
    const angle=Math.atan2(z,x)+turn*Math.PI;
    if (angle>=-.25 && angle<=.25) angles.push(angle);
  }
  for (const yaw of angles) {
    const projected=x*Math.cos(yaw)+z*Math.sin(yaw);
    if (projected<minimumX) {minimumX=projected;minimumXYaw=yaw;}
  }
}
write('evidence/runtime-validation.json',{status:'pass',threeRevision:THREE.REVISION,fullChunkComparisons:comparisons,comparisonCount:comparisons.length,guideProbesPerChunk:640,sourcePlanHull:plan,minPlanDistance,continuousYawProof:'All candidate XZ vertices lie in convex hull of source aircraft-only XZ points. Rotation preserves containment, therefore every horizontal support plane/AABB is contained for every yaw, not only sampled yaw. Candidate Y interval is also contained. This is an envelope test, not per-triangle volume containment.',aircraftBounds:candidateBounds,sourceAircraftBounds:originalBounds,yawEvidence,transformCases,densityCases:draws,ownership:{cachedGeometries:cached.length,templateDisposals:disposals,perPropRoots:0,perPropGeometryClones:0,perPropMaterialClones:0,chunkRetirement:'Actual Fortress.clear/_disposeChunk merged-buffer disposal exercised per comparison'},clearance:{method:'Analytic extrema of every candidate XZ vertex support over entire yaw interval; endpoints plus all stationary angles',minimumXYaw,corridorMaxX:16,playerRadius:1.5,minimumPropX:21+minimumX,minimumCenterlineClearanceToFlightBoundary:21+minimumX-16,minimumHullClearanceUsingPlayerRadius:21+minimumX-16-1.5,wallInnerX:23.5,note:'Bounds never exceed source. Far-wall/deck-plate intersections already possible in source are not claimed eliminated; no gameplay constraints narrowed.'}});
source.disposeFortressTemplates();
console.log(JSON.stringify({fullChunkComparisons:comparisons.length,planContainmentMargin:minPlanDistance,aircraftBounds:candidateBounds,densityCases:draws,shutdownDisposals:disposals.length},null,2));
