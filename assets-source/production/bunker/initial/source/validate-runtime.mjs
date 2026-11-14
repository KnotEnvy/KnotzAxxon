import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, output, root, measure, materialsDouble, disposeFortressTemplates, themeFor } from './source-harness.mjs';
import { createBunkerRecipe, createBunkerRecipeFromGLTF } from './BunkerRecipe.mjs';

const data = JSON.parse(fs.readFileSync(`${output}/asset/bunker-geometry.json`)), recipe = createBunkerRecipe(data);
const originalBunker = Fortress.prototype._bunker;
const assertions = [], isolated = [];
const glbMaxAbsoluteError={};
const binary=fs.readFileSync(`${output}/asset/fortress-bunker.glb`);
const gltf=await new GLTFLoader().parseAsync(binary.buffer.slice(binary.byteOffset,binary.byteOffset+binary.byteLength),'');
const glbRecipe=createBunkerRecipeFromGLTF(gltf.scene);
for (const seed of [1, 7, 42, 123, 0xffffffff]) for (const theme of [themeFor({ index:5 }), themeFor({ index:6 })]) for (const x of [0,19.5,24]) {
  const source = new Batch(), candidate = new Batch(), glbBatch = new Batch(), sourceRng = new Rng(seed), candidateRng = new Rng(seed), glbRng = new Rng(seed);
  source.captureSurfaces = candidate.captureSurfaces = glbBatch.captureSurfaces = true;
  originalBunker(source,sourceRng,x,12345.25,theme);
  recipe.stamp(candidate,candidateRng,x,12345.25,theme);
  glbRecipe.stamp(glbBatch,glbRng,x,12345.25,theme);
  assert.equal(sourceRng._s,candidateRng._s);
  assert.equal(sourceRng._s,glbRng._s);
  assert.deepEqual(source.surfaces,candidate.surfaces);
  assert.deepEqual(source.surfaces,glbBatch.surfaces);
  const glbStats=measure(glbBatch);
  assert.equal(glbStats.triangles,468);
  assert.deepEqual(glbStats.bounds,measure(candidate).bounds);
  for(const key of ['hull','dark','neon']) for(const name of ['pos','nrm','uv','col','anim']) {
    const reference=candidate.buckets.get(key)[name],actual=glbBatch.buckets.get(key)[name];
    if(!reference) continue;
    assert.equal(actual.n,reference.n);
    for(let offset=0;offset<reference.n;offset++) {
      const error=Math.abs(actual.a[offset]-reference.a[offset]);
      glbMaxAbsoluteError[name]=Math.max(glbMaxAbsoluteError[name]??0,error);
      assert(error<(name==='nrm'?2e-4:2e-5),`GLB ${key}/${name} differs at ${offset}`);
    }
  }
  assert.deepEqual(Array.from({length:32},()=>sourceRng.next()),Array.from({length:32},()=>candidateRng.next()));
  const neon = candidate.buckets.get('neon'), reference = source.buckets.get('neon');
  for(let offset=0;offset<neon.anim.n;offset+=3) assert.deepEqual(Array.from(neon.anim.a.slice(offset,offset+3)),Array.from(reference.anim.a.slice(0,3)));
  for(let offset=0;offset<neon.col.n;offset+=3) assert.deepEqual(Array.from(neon.col.a.slice(offset,offset+3)),Array.from(reference.col.a.slice(0,3)));
  const stats = measure(candidate);
  for(let axis=0;axis<3;axis++) {
    const center = [x,0,12345.25][axis];
    assert(stats.bounds[0][axis]>=center+[-3.5,0,-4][axis]-1e-5);
    assert(stats.bounds[1][axis]<=center+[3.5,4,4][axis]+1e-5);
  }
  for(const bucket of candidate.buckets.values()) for(const attribute of ['pos','nrm','uv','col','anim']) if(bucket[attribute]) assert(Array.from(bucket[attribute].view()).every(Number.isFinite));
  isolated.push({seed,theme:theme.name,x,triangles:stats.triangles,bounds:stats.bounds});
}
assertions.push('60 isolated fixtures through BOTH generated-JSON and actual GLTFLoader-parsed GLB templates: exact source surfaces and one-draw RNG state; next 32 source/JSON draws identical; exact neon hue/gain/aAnim; GLB/JSON normals agree within 2e-4 (Blender packed-normal quantization), other buffers within 2e-5 and all bounds exactly.');
const originalMerge = Batch.prototype.merge;
let active = null;
const hash = arrays => {
  const digest = crypto.createHash('sha256');
  for(const array of arrays) digest.update(Buffer.from(array.buffer,array.byteOffset,array.byteLength));
  return digest.digest('hex');
};
Batch.prototype.merge = function(...args) {
  if(active) {
    const excluded = active.spans.get(this) ?? {};
    const entry = {};
    for(const [key,bucket] of this.buckets) {
      const arrays=[];
      for(const name of ['pos','nrm','uv','col','anim','pivot','spin']) {
        if(!bucket[name]) continue;
        const values=bucket[name].view(),span=excluded[key]?.[name];
        const remaining=span?new Float32Array([...values.subarray(0,span[0]),...values.subarray(span[1])]):values;
        arrays.push(remaining);
      }
      if(arrays.some(array=>array.length)) entry[key]=hash(arrays);
    }
    active.merges.push(entry);
  }
  return originalMerge.apply(this,args);
};
function chunkRun(seed,index,candidate) {
  const level=new Level(seed),fortress=new Fortress(new THREE.Scene(),materialsDouble(),level,{});
  active={spans:new Map(),merges:[],calls:[],callerStates:[]};
  const deckProps=fortress._deckProps;
  fortress._deckProps=function(batch,rng,...args) {
    const before=rng._s;
    deckProps.call(this,batch,rng,...args);
    active.callerStates.push([before,rng._s]);
  };
  fortress._bunker=(batch,rng,x,z,theme)=>{
    const before={};
    for(const key of ['hull','dark','neon']) {
      before[key]={};
      for(const name of ['pos','nrm','uv','col','anim','pivot','spin']) before[key][name]=batch.buckets.get(key)?.[name]?.n??0;
    }
    const stateBefore=rng._s;
    (candidate?recipe.stamp:originalBunker)(batch,rng,x,z,theme);
    const spans={};
    for(const key of ['hull','dark','neon']) {
      spans[key]={};
      for(const name of Object.keys(before[key])) spans[key][name]=[before[key][name],batch.buckets.get(key)?.[name]?.n??0];
    }
    active.spans.set(batch,spans);
    active.calls.push({x,z,theme:theme.name,stateBefore,stateAfter:rng._s});
  };
  const group=fortress._buildChunk(index);
  const result={merges:active.merges,calls:active.calls,callerStates:active.callerStates,surfaces:group.userData.deckSurfaces,emitters:fortress.emitters.map(({owner,...entry})=>entry)};
  active=null;
  fortress._disposeChunk(group);
  return result;
}
const chunks=[];
for(const seed of [1,7,42,123]) {
  const level=new Level(seed);
  for(let index=0;index*CHUNK_LEN<level.totalLength;index++) {
    const sector=level.sectorAt((index+.5)*CHUNK_LEN);
    if(![5,6].includes(sector?.index)) continue;
    const source=chunkRun(seed,index,false),candidate=chunkRun(seed,index,true);
    assert.deepEqual(source,candidate,`Downstream chunk mismatch seed=${seed} index=${index}`);
    chunks.push({seed,index,bunkers:source.calls.length,nonBunkerBufferHash:crypto.createHash('sha256').update(JSON.stringify(source.merges)).digest('hex')});
  }
}
Batch.prototype.merge=originalMerge;
assertions.push(`${chunks.length} complete actual source chunks: all non-bunker position/normal/UV/color/animation/pivot/spin buffers bitwise identical after excising only bunker spans; placements, caller RNG states, emitted steam/heat data and deck surfaces identical.`);
const materials=materialsDouble(),fortress=new Fortress(new THREE.Scene(),materials,new Level(42),{}),batch=new Batch(),group=new THREE.Group();
const templateDisposals=[],materialDisposals=[],geometryDisposals=[];
const sharedTexture=new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
materials.hull.map=sharedTexture;
let textureDisposals=0;
sharedTexture.addEventListener('dispose',()=>textureDisposals++);
for(const [key,geometry] of recipe.templates) geometry.addEventListener('dispose',()=>templateDisposals.push(key));
for(const key of ['hull','darkMetal','neonVertex']) materials[key].addEventListener('dispose',()=>materialDisposals.push(key));
for(let index=0;index<8;index++) recipe.stamp(batch,new Rng(index+1),20,50+index*10,themeFor({index:5}));
batch.merge(fortress._matFor,group);
assert.equal(group.children.length,3);
for(const mesh of group.children) {
  mesh.geometry.addEventListener('dispose',()=>geometryDisposals.push(mesh.uuid));
  assert(![...recipe.templates.values()].includes(mesh.geometry));
  assert([materials.hull,materials.darkMetal,materials.neonVertex].includes(mesh.material));
}
fortress._disposeChunk(group);
assert.equal(new Set(geometryDisposals).size,3);
assert.equal(geometryDisposals.length,3);
assert.equal(templateDisposals.length,0);
assert.equal(materialDisposals.length,0);
assert.equal(textureDisposals,0);
recipe.dispose();recipe.dispose();
assert.equal(templateDisposals.length,3);
assert.equal(materialDisposals.length,0);
assert.equal(textureDisposals,0);
let glbTemplateDisposals=0,glbPreviewMaterialDisposals=0;
for(const geometry of glbRecipe.templates.values()) geometry.addEventListener('dispose',()=>glbTemplateDisposals++);
const previewMaterials=new Set();
gltf.scene.traverse(node=>{if(node.isMesh) for(const material of [].concat(node.material)) previewMaterials.add(material);});
for(const material of previewMaterials) material.addEventListener('dispose',()=>glbPreviewMaterialDisposals++);
glbRecipe.dispose();glbRecipe.dispose();
assert.equal(glbTemplateDisposals,3);
assert.equal(glbPreviewMaterialDisposals,3);
assert.equal(materialDisposals.length,0);
assertions.push('Eight props merge into three actual Batch meshes; chunk geometry receives exactly one disposal each; templates/materials survive retirement; loader shutdown disposes each template once idempotently and no shared materials/textures.');
disposeFortressTemplates();
fs.writeFileSync(`${output}/evidence/runtime-validation.json`,JSON.stringify({status:'PASS',method:'Actual source Batch/Fortress/Level and GLTFLoader with CPU-only materials/DataTexture doubles and no renderer; original production files never modified.',assertions,glbMaxAbsoluteError,isolated,chunks,lifecycle:{props:8,mergedMeshes:3,chunkDisposals:geometryDisposals.length,templateDisposalsAtShutdown:templateDisposals.length,glbTemplateDisposalsAtShutdown:glbTemplateDisposals,glbPreviewMaterialDisposalsAtShutdown:glbPreviewMaterialDisposals,sharedMaterialDisposals:materialDisposals.length,sharedTextureDisposals:textureDisposals},limitations:['No live WebGL shader compilation, GPU lighting, FPS or streaming hitch measurement.','No production integration performed; recipe requires explicit loader initialization and shutdown hook.','CPU doubles do not instantiate mapped procedural hull textures or exercise source material shader patches.']},null,2));
console.log(JSON.stringify({status:'PASS',assertions},null,2));

globalThis.localStorage={getItem:()=>'{}'};
const {settings}=await import(pathToFileURL(`${root}/src/core/Settings.js`));
const {FlightCamera}=await import(pathToFileURL(`${root}/src/core/FlightCamera.js`));
const {CameraRig}=await import(pathToFileURL(`${root}/src/game/CameraRig.js`));
const {SKY_PRESETS}=await import(pathToFileURL(`${root}/src/render/Sky.js`));
const player={pos:new THREE.Vector3(8,6,0),velocity:new THREE.Vector3()},cameras=[],probes=[];
for(const mode of ['classic','modern','chase']) {
  settings.values.camera=mode;
  const camera=new FlightCamera(58,1.5,.35,settings.quality.drawDistance*2.4),rig=new CameraRig(camera);
  rig.snap(player);
  cameras.push({mode,position:camera.position.toArray(),look:rig.lookAt.toArray(),fov:camera.fov,aspect:camera.aspect,classic:camera.classic,halfHeight:camera.halfHeight,near:camera.near,far:camera.far,quality:'high',bunkerPosition:[19.5,0,28],playerPosition:player.pos.toArray()});
  for(const aspect of [1.5,16/9,9/16]) for(const playerY of [1.3,6,25]) for(const playerX of [-16,0,16]) {
    camera.aspect=aspect;player.pos.set(playerX,playerY,0);rig.snap(player);
    for(const x of [19.5,24]) for(const z of [12,48,84]) {
      const projected=[];
      for(const axisX of data.bounds.map(item=>item[0])) for(const axisY of data.bounds.map(item=>item[1])) for(const axisZ of data.bounds.map(item=>item[2])) projected.push(new THREE.Vector3(axisX+x,axisY,axisZ+z).project(camera).toArray());
      assert(projected.flat().every(Number.isFinite));
      probes.push({mode,aspect,playerX,playerY,x,z,ndcBounds:[0,1,2].map(axis=>[Math.min(...projected.map(item=>item[axis])),Math.max(...projected.map(item=>item[axis]))])});
    }
  }
  player.pos.set(8,6,0);
}
const lighting=[];
for(const index of [5,6]) {
  const theme=themeFor({index}),color=new THREE.Color(theme.warm);
  for(const gain of [.1,1]) {
    const linear=color.toArray().map(channel=>channel*1.1*gain);
    assert(linear.every(Number.isFinite));
    lighting.push({theme:theme.name,hex:`#${theme.warm.toString(16)}`,animationGain:gain,linearVertexRGB:linear});
  }
}
fs.writeFileSync(`${output}/evidence/camera-lighting-probes.json`,JSON.stringify({status:'PASS',method:'Source CameraRig.snap and FlightCamera; localStorage CPU double only; fixed unboosted/no-shake poses. Exact source SKY_PRESETS copied as numbers; finite projected bounds are not occlusion/visibility guarantees.',cameras,probeCount:probes.length,probes,lighting,sky:{citadel:SKY_PRESETS.ember,gauntlet:SKY_PRESETS.void},limitations:['Objects can naturally leave the viewport at envelope extremes; no gameplay ranges or camera behavior were changed.','Source bloom/PMREM/texture normal maps/tone mapping/fog and actual render visibility are not validated by these CPU probes.']},null,2));
console.log('CAMERA_LIGHTING_FINITE_PASS',probes.length);
