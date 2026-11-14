import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { Batch, Fortress } from '../../../../src/world/Fortress.js';
import { Rng } from '../../../../src/core/Utils.js';
import { FlightCamera } from '../../../../src/core/FlightCamera.js';
import { prepareCoolingStack } from './streaming-adapter.mjs';
import { installCoolingStackPrototype } from './install-prototype.mjs';

globalThis.matchMedia = () => ({ matches:false });
const { CAMERA_MODES } = await import('../../../../src/core/Settings.js');
const { CameraRig } = await import('../../../../src/game/CameraRig.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'cooling-stack.template.json')));
const template = prepareCoolingStack(data);
const digest = value => createHash('sha256').update(value).digest('hex');
const fields = ['pos', 'nrm', 'uv', 'col', 'anim', 'pivot', 'spin'];
const original = Fortress.prototype._coolingStack;
const sector = { kind: 'fortress', index: 3, zStart: 0, zEnd: 100000 };
const chunkCases = [];
let lifecycleDisposals = 0;

function makeMaterials() {
  return Object.fromEntries(['hull','deck','darkMetal','grating','hazard','neonVertex','paint','spinMetal','rock'].map(key => [key,new THREE.MeshBasicMaterial({ name:key })]));
}

function ranges(batch) {
  return Object.fromEntries([...batch.buckets].map(([key,bucket]) => [key,Object.fromEntries(fields.map(field => [field,bucket[field]?.n ?? 0]))]));
}

function runChunk(seed, index, replacement) {
  const materials = makeMaterials();
  const level = { seed,features:[],sectorAt:()=>sector };
  const fortress = new Fortress(new THREE.Scene(),materials,level,{ drawDistance:300 });
  const segments = [], traces = [], originalNext = Rng.prototype.next;
  let capture;
  fortress._coolingStack = (batch,rng,centerX,centerZ,emit) => {
    const before = ranges(batch);
    (replacement ? template.coolingStack : original).call(fortress,batch,rng,centerX,centerZ,emit);
    segments.push({ before,after:ranges(batch) });
  };
  const originalMerge = Batch.prototype.merge;
  Batch.prototype.merge = function (...args) {
    if (segments.length) capture = Object.fromEntries([...this.buckets].map(([key,bucket]) => [key,Object.fromEntries(fields.filter(field=>bucket[field]).map(field=>[field,bucket[field].view()]))]));
    return originalMerge.apply(this,args);
  };
  Rng.prototype.next = function () { const value = originalNext.call(this); traces.push(value); return value; };
  let group;
  try { group = fortress._buildChunk(index); }
  finally { Rng.prototype.next = originalNext; Batch.prototype.merge = originalMerge; }
  const downstream = {};
  for (const [key,bucket] of Object.entries(capture)) {
    downstream[key] = {};
    for (const [field,array] of Object.entries(bucket)) {
      const excluded = segments.map(segment=>[segment.before[key]?.[field] ?? 0,segment.after[key]?.[field] ?? 0]).filter(([start,end])=>end>start);
      const remaining = [];
      let interval = 0;
      for (let offset=0;offset<array.length;offset++) {
        while (interval<excluded.length && offset>=excluded[interval][1]) interval++;
        if (interval<excluded.length && offset>=excluded[interval][0]) continue;
        remaining.push(array[offset]);
      }
      downstream[key][field] = digest(Buffer.from(new Float32Array(remaining).buffer));
    }
  }
  const emitters = fortress.emitters.map(emitter=>{ assert.equal(emitter.owner,group); const { owner,...rest }=emitter; return rest; });
  const surfaces = structuredClone(group.userData.deckSurfaces);
  const materialIdentities = [];
  group.traverse(object=>{
    if (!object.isMesh) return;
    assert.ok(Object.values(materials).includes(object.material));
    materialIdentities.push(object.material.name);
    let calls=0;
    object.geometry.addEventListener('dispose',()=>{ calls++; lifecycleDisposals++; });
    object.userData.assertRetired = ()=>assert.equal(calls,1);
  });
  fortress._disposeChunk(group);
  group.traverse(object=>object.userData.assertRetired?.());
  assert.equal(fortress.emitters.length,0);
  for (const material of Object.values(materials)) material.dispose();
  return { rng:traces,emitters,surfaces,downstream,stacks:segments.length,materialIdentities };
}

for (const seed of [1,7,42,123]) for (const chunkIndex of [0,1,4,9]) {
  const baseline=runChunk(seed,chunkIndex,false), replacement=runChunk(seed,chunkIndex,true);
  assert.deepEqual(replacement,baseline);
  chunkCases.push({ seed,chunkIndex,stacks:baseline.stacks,rngDraws:baseline.rng.length,
    rngTraceSHA256:digest(JSON.stringify(baseline.rng)),downstreamBufferSHA256:digest(JSON.stringify(baseline.downstream)),
    emitters:baseline.emitters.length,surfaces:baseline.surfaces.length,exactEquality:true });
}

const directCases=[];
for (const height of [7,7.0001,7.1,8.1,8.100001,9,9.0999999,9.1,9.100001,10.3,10.300001,10.9999,11]) {
  const results=[];
  for (const replacement of [false,true]) {
    const rng=new Rng(123), batch=new Batch(), emitters=[], trace=[];
    batch.captureSurfaces=true;
    const originalNext=rng.next.bind(rng);
    rng.next=()=>{ const value=originalNext(); trace.push(value); return value; };
    rng.range=(lo,hi)=>{ assert.deepEqual([lo,hi],[7,11]); rng.next(); return height; };
    (replacement ? template.coolingStack : original)(batch,rng,20.5,86,(kind,posX,posY,posZ,rate)=>emitters.push({ kind,posX,posY,posZ,rate,owner:'chunk',t:rng.next() }));
    results.push({ trace,emitters,surfaces:batch.surfaces,phase:batch.buckets.get('neon').anim.a[2],downstream:Array.from({length:32},()=>rng.next()) });
  }
  assert.deepEqual(results[0],results[1]);
  directCases.push({ height,exactRNGEmitterSurfaceDownstreamEquality:true });
}

const heightSamples=[];
const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity];
let minimumNormalLength=Infinity, maximumNormalLength=0;
for (let index=0;index<=400;index++) {
  const height=7+index/100,batch=new Batch();
  template.stamp(batch,height,.25,0,0);
  const localMin=[Infinity,Infinity,Infinity],localMax=[-Infinity,-Infinity,-Infinity];
  let triangles=0;
  for (const [key,bucket] of batch.buckets) {
    triangles+=bucket.pos.n/9;
    for (let offset=0;offset<bucket.pos.n;offset++) {
      const axis=offset%3,value=bucket.pos.a[offset];
      localMin[axis]=Math.min(localMin[axis],value); localMax[axis]=Math.max(localMax[axis],value);
      assert.ok(Number.isFinite(value));
      assert.ok(Math.abs(bucket.col.a[offset])<=1.20001);
    }
    for (let offset=0;offset<bucket.nrm.n;offset+=3) {
      const length=Math.hypot(...bucket.nrm.a.subarray(offset,offset+3));
      minimumNormalLength=Math.min(minimumNormalLength,length); maximumNormalLength=Math.max(maximumNormalLength,length);
    }
    if (key==='neon') for(let offset=0;offset<bucket.anim.n;offset+=3) assert.deepEqual(Array.from(bucket.anim.a.subarray(offset,offset+3)),[3,Math.fround(.4),.25]);
  }
  assert.equal(triangles,460); assert.equal(batch.buckets.size,3);
  assert.ok(localMin[0]>=-2.1 && localMax[0]<=2.1 && localMin[2]>=-2.1 && localMax[2]<=2.1);
  assert.ok(Math.abs(localMax[1]-(height+.24))<.000002);
  for(let axis=0;axis<3;axis++) { min[axis]=Math.min(min[axis],localMin[axis]); max[axis]=Math.max(max[axis],localMax[axis]); }
  heightSamples.push({ height,min:localMin,max:localMax });
}

const cueSamples=[];
for(let index=0;index<=1024;index++) {
  const clock=index/64,phase=(clock*.4+.5488082428928465)%1;
  cueSamples.push(.55+.45*Math.sin(phase*6.2832));
}
const sourceWorld=JSON.parse(fs.readFileSync(path.join(root,'evidence/source-world.json')));
const selected=sourceWorld.placements[0];
const player={ pos:new THREE.Vector3(0,9,selected.z-44),velocity:new THREE.Vector3() };
const cameraSamples=[];
const cameraEnvelope=[];
for(const mode of Object.keys(CAMERA_MODES)) {
  const camera=new FlightCamera(58,16/9,.1,1200);
  const rig=new CameraRig(camera), config=CAMERA_MODES[mode];
  rig.yaw=config.yaw*Math.PI/180; rig.dist=config.dist; rig.height=config.height; rig.fovBase=config.fov; rig.classic=mode==='classic';
  rig.snap(player);
  let minimumDistance=Infinity, ndcMin=[Infinity,Infinity],ndcMax=[-Infinity,-Infinity];
  for(const height of [7,11]) for(let offset=0;offset<data.positions.length;offset+=3) {
    const point=new THREE.Vector3(data.positions[offset]+selected.x,data.positions[offset+1]+(height-9)*data.heightWeights[offset/3],data.positions[offset+2]+selected.z);
    minimumDistance=Math.min(minimumDistance,point.distanceTo(camera.position));
    const projected=point.clone().project(camera);
    for(let axis=0;axis<2;axis++) { const value=axis===0?projected.x:projected.y; ndcMin[axis]=Math.min(ndcMin[axis],value); ndcMax[axis]=Math.max(ndcMax[axis],value); }
  }
  assert.ok(minimumDistance>40);
  cameraSamples.push({ mode,eye:camera.position.toArray(),lookAt:rig.lookAt.toArray(),fov:camera.fov,
    orthographic:rig.classic,halfHeight:rig.classic?camera.halfHeight:null,ndcMin,ndcMax,minimumEyeToVertexDistance:minimumDistance });
  const maximumBaseCameraX=(rig.classic?0:16)-config.dist*Math.sin(config.yaw*Math.PI/180);
  const maximumSourceShakeX=1.4*1.4*1.5;
  const horizontalGap=20.5-2.08-maximumBaseCameraX-maximumSourceShakeX;
  assert.ok(horizontalGap>0);
  cameraEnvelope.push({mode,maximumBaseCameraX,maximumSourceShakeX,minimumHorizontalEyeGapToAnyStack:horizontalGap});
}
const playerSource=fs.readFileSync(path.resolve(root,'../../../src/entities/Player.js'),'utf8');
const sourcePlayerRadius=Number(playerSource.match(/get radius\(\)\s*\{\s*return\s+([\d.]+)/)[1]);
assert.equal(sourcePlayerRadius,1.5);
assert.ok(20.5-2.08-16-sourcePlayerRadius>0);
template.stamp(new Batch(),9,.5,20.5,10);
template.shutdown();
assert.throws(()=>template.stamp(new Batch(),9,.5,0,0),/released/);
const integrationMaterials=makeMaterials();
const integrationFortress=new Fortress(new THREE.Scene(),integrationMaterials,{ seed:42,features:[],sectorAt:()=>sector },{drawDistance:300});
const installation=await installCoolingStackPrototype(integrationFortress,{templateUrl:'fixture-template',fetchImpl:async()=>({ok:true,json:async()=>data})});
assert.notEqual(integrationFortress._coolingStack,original);
const integrationChunk=integrationFortress._buildChunk(0);
integrationFortress.chunks.set(0,integrationChunk);
await assert.rejects(()=>installCoolingStackPrototype(integrationFortress,{templateUrl:'fixture-template'}),/before first chunk/);
integrationFortress.clear();
installation.shutdown();
installation.shutdown();
assert.equal(integrationFortress._coolingStack,original);
assert.ok(!Object.hasOwn(integrationFortress,'_coolingStack'));
for(const material of Object.values(integrationMaterials)) material.dispose();
const report={ status:'PASS',actualBatch:true,actualBuildChunk:true,fixture:'Synthetic reactor sector index3; no physical feature records; real _deck/_wallDressing/_deckProps/_skyline/_sectorEdges and actual source dynamic loops.',
  chunkCases,directSurfaceCaptureCases:directCases,heightSweep:{samples:heightSamples.length,range:[7,11],step:.01,min,max,minimumNormalLength,maximumNormalLength,trianglesAtEverySample:460,materialBucketsAtEverySample:3},
  analyticEnvelope:'Each vertex y is affine in h. Therefore coordinate extrema on closed h=[7,11] occur at endpoints; horizontal positions do not depend on h.',
  laneClearance:{laneX:[-16,16],altitude:[1.3,25],centerX:[20.5,25],halfFootprint:2.08,minimumGap:20.5-2.08-16,sourcePlayerRadius,minimumFullPlayerSphereGap:20.5-2.08-16-sourcePlayerRadius,sourceStaticTraceRadius:sourcePlayerRadius*.72,minimumStaticTraceSphereGap:20.5-2.08-16-sourcePlayerRadius*.72,physicalCollisionChanges:0},
  cue:{mode:3,rate:.4,gain:1.2,color:'0xff6a2a',shader:'0.55 + 0.45 * sin(fract(time * 0.4 + originalPhase) * 6.2832)',samples:cueSamples.length,sampledGain:[Math.min(...cueSamples),Math.max(...cueSamples)],analyticGain:[.1,1],analyticGainIncludingVertexGain:[.12,1.2],steam:'Exactly one source callback, y=h+.4, rate1, original owner and callback RNG draw'},
  cameraFixture:{player:player.pos.toArray(),selectedSourcePlacement:selected,aspect:16/9,sourceSnapCameras:cameraSamples},
  analyticCameraEyeClearance:{sourceConstantRigs:cameraEnvelope,reason:'Source X offset is -dist*sin(yaw), independent of altitude/Z; Classic is lane-anchored. noise1 is bounded [-1,1] and trauma<=1.4, so shakeX<=2.94. Snapped constant rigs with lane-bounded player X remain separated. This is an eye envelope, not a near-frustum or occlusion acceptance proof.',minimumAcrossRigs:Math.min(...cameraEnvelope.map(entry=>entry.minimumHorizontalEyeGapToAnyStack))},
  lifecycle:{geometryDisposalsObserved:lifecycleDisposals,eachChunkGeometryDisposedExactlyOnce:true,sharedMaterialIdentityPreserved:true,templateUsableAfterChunkRetirement:true,shutdownRejectsFurtherStamps:true,asyncStartupInstallerBuildClearShutdownRestoration:true,lateInstallRejected:true},
  limitations:['CPU material objects are identity-test stand-ins, not a live Materials/WebGL instance. Shader/material mapping is source-verified, not rendered in WebGL.', 'Finite chunk seeds and source-camera snapshots, not every campaign chunk, portrait screen, boost, shake, bank or feature collision.', 'h=11 is a closed-envelope stress endpoint; mulberry32 does not generate the upper range endpoint. No live FPS or acceptance claim.'] };
fs.writeFileSync(path.join(root,'evidence/streaming-proof.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'evidence/height-sweep.json'),JSON.stringify(heightSamples)+'\n');
console.log(JSON.stringify(report,null,2));
