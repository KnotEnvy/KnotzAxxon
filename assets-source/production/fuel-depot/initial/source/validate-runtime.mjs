import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createFuelDepotRecipe } from './FuelDepotRecipe.mjs';
import { Batch, Fortress, Rng, Level, CHUNK_LEN, sha, write, stats, serialize, streams, materialsDouble, disposeFortressTemplates } from './harness.mjs';

globalThis.localStorage = { getItem: () => '{"quality":"high"}' };
const { settings } = await import('../../../../src/core/Settings.js');
const { FlightCamera } = await import('../../../../src/core/FlightCamera.js');
const { CameraRig } = await import('../../../../src/game/CameraRig.js');
const document = JSON.parse(fs.readFileSync(new URL('../asset/fuel-depot.template.json', import.meta.url)));
const recipe = createFuelDepotRecipe(document), original = Fortress.prototype._fuelDepot;
const results = [], placements = [];
const envelopeProbes = [];
for (const worldX of [19.5,24]) for (const worldZ of [10,86,1450,1526]) {
  const source = new Batch(), candidate = new Batch();
  original(source,new Rng(1),worldX,worldZ); recipe.stamp(candidate,new Rng(1),worldX,worldZ);
  const sourceBounds=stats(source).bounds, candidateBounds=stats(candidate).bounds;
  for (let axis=0;axis<3;axis++) {
    assert.ok(candidateBounds[0][axis]>=sourceBounds[0][axis]-1e-6);
    assert.ok(candidateBounds[1][axis]<=sourceBounds[1][axis]+1e-6);
  }
  envelopeProbes.push({x:worldX,z:worldZ,sourceBounds,candidateBounds,containedWithTolerance:1e-6});
}
const snapshot = batch => Object.fromEntries([...batch.buckets].map(([key, bucket]) => [key, Object.fromEntries(streams.filter(field => bucket[field]).map(field => [field,bucket[field].n]))]));
const digestWithout = (batch, before, after) => Object.fromEntries([...batch.buckets].map(([key,bucket]) => [key, Object.fromEntries(streams.filter(field => bucket[field]).map(field => {
  const begin = before?.[key]?.[field] ?? 0, end = after?.[key]?.[field] ?? 0;
  const values = new Float32Array(begin + bucket[field].n - end);
  values.set(bucket[field].a.subarray(0,begin));
  values.set(bucket[field].a.subarray(end,bucket[field].n),begin);
  return [field,sha(Buffer.from(values.buffer))];
}))]));
const normalizedEmitters = values => values.map(({ owner, dir, ...value }) => ({ ...value, dir: dir?.toArray() ?? null }));
let world;
for (const seed of [1,7,42,123]) {
  const rng = new Rng(seed), batch = new Batch(), state = rng._s;
  batch.captureSurfaces = true;
  recipe.stamp(batch,rng,0,0);
  assert.equal(rng._s,state);
  const source = new Batch(); source.captureSurfaces = true; original(source,new Rng(seed),0,0);
  assert.deepEqual(batch.surfaces,source.surfaces);
  assert.equal(stats(batch).triangles,992);
  results.push({ seed, isolated: stats(batch), methodRngDraws: 0, surfacesExact: true });
}
for (const seed of [1,7,42,123]) {
  const level = new Level(seed);
  for (let index=0;index*CHUNK_LEN<level.totalLength;index++) {
    const sector = level.sectorAt(index*CHUNK_LEN+CHUNK_LEN/2);
    if (sector?.index!==0) continue;
    const pair = [];
    for (const candidate of [false,true]) {
      const fortress = new Fortress(new THREE.Scene(),materialsDouble(),level,{});
      const captures = [], calls = [];
      let interval;
      fortress._fuelDepot = (batch,rng,worldX,worldZ) => {
        const before = snapshot(batch), stateBefore = rng._s;
        (candidate?recipe.stamp:original)(batch,rng,worldX,worldZ);
        const after = snapshot(batch);
        interval = { batch,before,after };
        calls.push({x:worldX,z:worldZ,stateBefore,stateAfter:rng._s});
        if (candidate && !world) {
          const isolated = new Batch(); recipe.stamp(isolated,new Rng(seed),worldX,worldZ);
          const source = new Batch(); original(source,new Rng(seed),worldX,worldZ);
          world = {seed,chunk:index,placement:{x:worldX,z:worldZ},candidate:serialize(isolated),source:serialize(source),player:{position:[0,8,worldZ-25],scale:1,radius:1.5},stubs:'CPU material doubles; no DOM/canvas texture generation, no WebGL renderer',cameras:{}};
        }
      };
      const merge = Batch.prototype.merge;
      Batch.prototype.merge = function (...args) {
        const range = interval?.batch===this ? interval : null;
        captures.push({ streamsExcludingDepot:digestWithout(this,range?.before,range?.after),surfaces:structuredClone(this.surfaces) });
        return merge.apply(this,args);
      };
      let group;
      try { group = fortress._buildChunk(index); } finally { Batch.prototype.merge = merge; }
      pair.push({captures,calls,emitters:normalizedEmitters(fortress.emitters),obstacles:fortress.rearObstacles.map(value=>value.endZ)});
      fortress._disposeChunk(group);
      fortress.root.removeFromParent();
    }
    assert.deepEqual(pair[0],pair[1]);
    placements.push({seed,index,calls:pair[1].calls,exactPrefixDownstreamBuffers:true,exactSurfaces:true,exactEmittersAndPhase:true});
  }
}
const sourceBatch = new Batch();
const sourceFortress = Object.create(Fortress.prototype);
const fixtureRng = new Rng((world.chunk*2654435761+world.seed)>>>0);
const fixtureSector = new Level(world.seed).sectorAt(world.chunk*96+48);
sourceFortress._deck(sourceBatch,fixtureRng,world.chunk*96,fixtureSector);
world.deck = serialize(sourceBatch);
const player = {pos:new THREE.Vector3(...world.player.position),velocity:new THREE.Vector3()};
for (const name of ['classic','modern','chase']) {
  settings.values.camera = name;
  const camera = new FlightCamera(58,16/9,.1,2000), rig = new CameraRig(camera);
  rig.snap(player);
  const projections = [];
  for (const localX of [-2.92,2.92]) for(const localY of [0,3.1]) for(const localZ of [-4,4]) projections.push(new THREE.Vector3(world.placement.x+localX,localY,world.placement.z+localZ).project(camera).toArray());
  world.cameras[name] = {eye:camera.position.toArray(),target:rig.lookAt.toArray(),fov:camera.fov,classic:rig.classic,halfHeight:rig._halfHeight(),aspect:camera.aspect,cornerNDC:projections,source:'Actual source CameraRig.snap and FlightCamera; still player, zero boost, zero extra distance, no shake'};
}
const lifecycle = {chunkGeometryDisposals:[],templateDisposals:[0,0],materialDisposals:0,textureDisposals:0};
recipe.templates.forEach((template,index)=>template.geometry.addEventListener('dispose',()=>lifecycle.templateDisposals[index]++));
const mats = materialsDouble(), texture = new THREE.Texture(); mats.hull.map=texture;
mats.hull.addEventListener('dispose',()=>lifecycle.materialDisposals++);
mats.darkMetal.addEventListener('dispose',()=>lifecycle.materialDisposals++);
texture.addEventListener('dispose',()=>lifecycle.textureDisposals++);
const scene = new THREE.Scene(), fortress = new Fortress(scene,mats,new Level(1),{});
for (let repeat=0;repeat<3;repeat++) {
  const batch = new Batch(), group = new THREE.Group(); fortress.root.add(group);
  recipe.stamp(batch,new Rng(1),19.5,10);
  batch.merge(fortress._matFor,group);
  assert.equal(group.children.length,2);
  assert.equal(group.children[0].material,mats.hull);
  assert.equal(group.children[1].material,mats.darkMetal);
  assert.equal(group.children[1].material.map,null);
  const counts=[0,0];
  group.children.forEach((mesh,index)=>mesh.geometry.addEventListener('dispose',()=>counts[index]++));
  fortress._disposeChunk(group);
  lifecycle.chunkGeometryDisposals.push(counts);
  assert.deepEqual(counts,[1,1]);
}
assert.deepEqual(lifecycle.templateDisposals,[0,0]);
assert.equal(lifecycle.materialDisposals,0);
assert.equal(lifecycle.textureDisposals,0);
recipe.dispose(); recipe.dispose();
assert.deepEqual(lifecycle.templateDisposals,[1,1]);
write('evidence/runtime-proof.json',{method:'Actual source Batch/Level/Rng/Fortress._buildChunk, real BufferGeometry and actual disposal events. CPU materials are doubles; source hull map ownership tested with placeholder Texture, not procedural canvas texture fidelity. Full airfield chunks, not just isolated _deckProps. No renderer/GPU/FPS.',results,chunks:placements,envelopeProbes,lifecycle,passed:true,formalReviews:0,formalReviewFixRounds:0});
write('evidence/world-fixture.json',world);
disposeFortressTemplates();
console.log(JSON.stringify({passed:true,fullAirfieldChunks:placements.length,depotCalls:placements.reduce((sum,value)=>sum+value.calls.length,0),lifecycle,cameras:world.cameras,fixture:world.placement},null,2));
