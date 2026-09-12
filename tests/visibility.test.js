import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Fortress } from '../src/world/Fortress.js';
import { FlightCamera } from '../src/core/FlightCamera.js';
import { Rng } from '../src/core/Utils.js';
globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
const { CameraRig } = await import('../src/game/CameraRig.js');
const { settings } = await import('../src/core/Settings.js');
settings.values.camera = 'classic';

test('classic camera contains both lanes, altitude limits and forward targets at common aspect ratios', () => {
  for (const aspect of [16/9, 1, 9/16]) {
    const camera = new FlightCamera(52, aspect, .35, 1200);
    const rig = new CameraRig(camera);
    const p = {pos: new THREE.Vector3(16, 25, 100), velocity:new THREE.Vector3()};
    rig.snap(p); camera.updateMatrixWorld(true);
    for (const x of [-16, 16]) for (const y of [1.3,25]) for (const z of [100,165]) {
      const screen = new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(screen.x)<.95 && Math.abs(screen.y)<.9, `cropped: ${aspect} ${x},${y},${z}: ${screen.toArray()}`);
    }
    const before = camera.position.clone(); p.pos.x=-16; rig.snap(p);
    assert.ok(before.distanceTo(camera.position)<1e-8, 'lateral controls must not move the corridor frame');
    assert.equal(camera.isOrthographicCamera,true);
  }
});

test('near-side trench decoration clears low-altitude view rays while far wall retains height', () => {
  const boxes=[];
  const batch={box(key,w,h,d,x,y,z) {boxes.push({x,y,z,w,h,d});}};
  Fortress.prototype._trenchWalls.call({},batch,new Rng(42),0,{});
  assert.ok(boxes.filter(b=>b.x<0).every(b=>b.y+b.h<=3.21));
  assert.ok(boxes.some(b=>b.x>0 && b.h>=20));
  const camera = new FlightCamera(52,16/9,.35,1200), rig=new CameraRig(camera);
  rig.snap({pos:new THREE.Vector3(0,1.3,0),velocity:new THREE.Vector3()});
  camera.updateMatrixWorld(true);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  let legacyOcclusions = 0;
  for(const x of [-16,0,16]) {
    const target=new THREE.Vector3(x,2,40);
    // Orthographic sightlines are parallel, not rays converging on the eye.
    const origin=target.clone().addScaledVector(direction,-200);
    const ray=new THREE.Ray(origin, direction);
    const oldWall=new THREE.Box3(new THREE.Vector3(-34,0,0),new THREE.Vector3(-27,34,96));
    if(ray.intersectBox(oldWall,new THREE.Vector3())) legacyOcclusions++;
    for(const b of boxes.filter(b=>b.x<0)) {
      const box=new THREE.Box3(new THREE.Vector3(b.x-b.w/2,b.y,b.z-b.d/2),new THREE.Vector3(b.x+b.w/2,b.y+b.h,b.z+b.d/2));
      const contact=ray.intersectBox(box,new THREE.Vector3());
      assert.ok(!contact || contact.distanceTo(origin)>target.distanceTo(origin),'decorative wall blocks target');
    }
  }
  assert.ok(legacyOcclusions > 0, 'fixture must reproduce the tall foreground wall defect');
});

test('passed wall and gate visuals retire without changing collider plan and dispose with chunk', () => {
  const material=new THREE.MeshBasicMaterial();
  const mats={hull:material,deck:material,darkMetal:material,grating:material,hazard:material,neonVertex:material,forceField:()=>material};
  const features=[{kind:'wall',z:30,type:'slot',thickness:4,gaps:[{y:4,h:8}]},{kind:'gate',z:65,gapY:5,gapH:9,cycle:4,phase:0}];
  const level={seed:1,features,sectorAt:()=>({kind:'fortress'})};
  const world=new Fortress(new THREE.Scene(),mats,level,{drawDistance:96});
  world.update(0,0,0);
  assert.equal(world.rearObstacles.length,2);
  assert.ok(world.rearObstacles.every(o=>o.group.visible));
  assert.equal(world.animated.length,1);
  const gateRuntime=features[1].runtime;
  world.update(45,1/60,1);
  assert.equal(world.rearObstacles[0].group.visible,false);
  assert.equal(world.rearObstacles[1].group.visible,true);
  assert.equal(features[1].runtime,gateRuntime);
  world.update(80,1/60,2);
  assert.ok(world.rearObstacles.every(o=>!o.group.visible));
  world.clear();
  assert.equal(world.animated.length,0); assert.equal(world.rearObstacles.length,0); assert.equal(world.root.children.length,0);
  material.dispose();
});

test('altitude guide surface stays above conduit and floor plates, with ceiling filtering',()=>{
  const world=Object.create(Fortress.prototype);
  world.chunks=new Map([[0,{userData:{deckSurfaces:[
    {minX:-.75,maxX:.75,minZ:0,maxZ:96,top:.32},
    {minX:5,maxX:12,minZ:20,maxZ:35,top:.7},
    {minX:5,maxX:12,minZ:20,maxZ:35,top:12}
  ]}}]]);
  assert.equal(world.surfaceAt(0,30,1.3),.32);
  assert.equal(world.surfaceAt(6,30,1.3),.7);
  assert.equal(world.surfaceAt(6,30,20),12);
  assert.equal(world.surfaceAt(-16,30,1.3),0);
});

test('player altitude marker samples the current ship position and stays depth-tested',async()=>{
  const { Player }=await import('../src/entities/Player.js');
  const make=()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial());
  const p=Object.create(Player.prototype);
  p.pos=new THREE.Vector3(6,8,30);p.alive=true;p.shadow=make();p.reticle=make();p.dropLine=make();
  let sampled;
  p._updateShadow({hasDeck:true,camera:{quaternion:new THREE.Quaternion()},guideSurfaceAt:(x,z,y)=>{sampled=[x,z,y];return .7;}},1/60);
  assert.deepEqual(sampled,[6,30,8]);
  assert.ok(Math.abs(p.reticle.position.y-.78)<1e-8);
  assert.equal(p.reticle.material.depthTest,true);
  for(const m of [p.shadow,p.reticle,p.dropLine]){m.geometry.dispose();m.material.dispose();}
});

test('boss arena stripe contributes guide height but buttresses do not',()=>{
  const m=new THREE.MeshBasicMaterial();
  const mats={hull:m,deck:m,darkMetal:m,grating:m,hazard:m,neonVertex:m};
  const world=new Fortress(new THREE.Scene(),mats,{seed:1,features:[],sectorAt:()=>({kind:'boss',zStart:0})},{drawDistance:96});
  world.update(0,0,0);
  assert.equal(world.surfaceAt(0,48,1.3),.16);
  assert.ok(world.chunks.get(0).userData.deckSurfaces.every(s=>s.top<=.16));
  world.clear();m.dispose();
});
