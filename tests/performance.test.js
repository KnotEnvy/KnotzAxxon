import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Lifetime } from '../src/core/Lifetime.js';
import { Materials } from '../src/render/Materials.js';
import { Effects } from '../src/fx/Effects.js';
import { Projectiles, SIDE } from '../src/entities/Projectiles.js';
import { Pickup, disposePickupGeometry } from '../src/entities/Pickup.js';
globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { getElementById: () => null };
globalThis.HTMLInputElement = class {};
const { Engine } = await import('../src/core/Engine.js');
const { Input } = await import('../src/core/Input.js');
const { Game } = await import('../src/game/Game.js');
const { Boss } = await import('../src/entities/Boss.js');
const { Fortress } = await import('../src/world/Fortress.js');
const { FlightCamera } = await import('../src/core/FlightCamera.js');
const { QUALITY_PRESETS: Q } = await import('../src/core/Settings.js');

function materials() {
  const m = Object.create(Materials.prototype);
  m._neon = new Map(); m._disposables = [];
  for (const key of ['enemyHull','darkMetal','playerHull','playerAccent','glass','hull','deck','grating','hazard']) {
    m[key] = m.track(new THREE.MeshStandardMaterial());
  }
  m.glow = m.ring = m.blob = new THREE.Texture();
  return m;
}
function rafHarness() {
  const queue = new Map(); let next = 0;
  globalThis.requestAnimationFrame = fn => { queue.set(++next, fn); return next; };
  globalThis.cancelAnimationFrame = id => queue.delete(id);
  const e = Object.create(Engine.prototype);
  Object.assign(e, { running:false, _raf:null, _disposed:false, _contextLost:false,
    _loop(){}, sky:{ _bake(){} }, renderer:{shadowMap:{}}, _onResize(){} });
  return { e, queue };
}

test('stop/start and lost/restored context retain exactly one RAF owner and honor stop', () => {
  const { e, queue } = rafHarness();
  e.start(); e.stop(); e.start(); assert.equal(queue.size, 1);
  e._onContextLost({preventDefault(){}}); assert.equal(queue.size,0);
  e._msEma=200;e._scaleCooldown=0;
  e._onContextRestored(); assert.equal(queue.size,1);
  assert.equal(e._msEma,16.7);assert.equal(e._scaleCooldown,1.2);
  e._onContextLost({preventDefault(){}}); e.stop(); e._onContextRestored();
  assert.equal(queue.size,0); assert.equal(e.running,false);
  e.start(); e._onContextLost({preventDefault(){}}); e._disposed=true; e._onContextRestored();
  assert.equal(queue.size,0);
});

test('slow frame advances distinct substep times but presents only once', () => {
  rafHarness(); const times=[]; let presents=0;
  const e=Object.create(Engine.prototype);
  Object.assign(e,{running:true,_last:0,frame:0,time:0,timeScale:1,_targetTimeScale:1,_hitStop:0,
    input:{update(){},endFrame(){}},_updateHooks:[(dt,t)=>times.push([dt,t])],_lateHooks:[()=>presents++],
    materials:{update(){}},postfx:{update(){},render(){}},renderer:{info:{reset(){},render:{}}},
    stats:{},_msEma:16.7,_adaptResolution(){} });
  e._loop(60); e.stop();
  assert.equal(times.length,4); assert.equal(presents,1);
  assert.deepEqual(times.map(v=>v[1]),[.015,.03,.045,.06]);
});

test('streaming budget belongs to rendered frame across four simulation substeps', () => {
  const f=new Fortress(new THREE.Scene(),{}, {},Q.ultra); let built=0,animated=0;
  f._buildChunk=()=>{ built++; return new THREE.Group(); };
  f.animated.push({update(){animated++;}});
  for(let i=0;i<4;i++) f.update(0,1/60,i/60,7);
  assert.equal(built,2); assert.equal(animated,4);
  f.update(0,1/60,4/60,8); assert.equal(built,4); f.clear();
});

test('disposed pickup and boss materials leave a bounded warm registry', () => {
  const m=materials(),scene=new THREE.Scene();
  const cycle=()=>{new Pickup(scene,m,'shield',0,8,0).dispose();new Boss(scene,m,{z:100}).dispose();};
  cycle();const warm=m._disposables.length;
  for(let i=0;i<100;i++) cycle();
  assert.equal(m._disposables.length,warm);assert.equal(scene.children.length,0);
  m.dispose();assert.equal(m._disposables.length,0);disposePickupGeometry();
});

test('quality switches resize every effect pool and dispose superseded GPU resources', () => {
  const scene=new THREE.Scene(),m=materials(),fx=new Effects(scene,m,Q.ultra);
  fx.setViewport(800,new THREE.PerspectiveCamera());fx.update(.01,23,new THREE.PerspectiveCamera());
  let disposed=0;fx.sparks.points.geometry.addEventListener('dispose',()=>disposed++);
  fx.smoke.material.addEventListener('dispose',()=>disposed++);
  fx.debris.mesh.addEventListener('dispose',()=>disposed++);
  fx.applyQuality(Q.low);
  assert.equal(disposed,3);
  assert.deepEqual([fx.sparks.capacity,fx.smoke.capacity,fx.debris.capacity,fx.lights.lights.length],[900,315,120,2]);
  assert.equal(fx.sparks._time,23);
  for(let i=0;i<10;i++){fx.applyQuality(Q.ultra);fx.applyQuality(Q.low);}
  // 31 pooled effect objects plus the wreck decal/slab and named-chunk instancers.
  assert.equal(scene.children.length,34);
  fx.dispose();fx.dispose();assert.equal(scene.children.length,0);m.dispose();
});

test('sparse projectile slots pack active instances without changing collision slots', () => {
  const m=materials(),scene=new THREE.Scene(),p=new Projectiles(scene,m,Q.low),camera=new THREE.PerspectiveCamera();
  p.player.cursor=73;p.fire(SIDE.PLAYER,9,8,7,0,0,1,100);
  p.render(camera);assert.equal(p.playerMesh.count,1);assert.equal(p.playerHalo.count,1);
  assert.equal(p.player.life[73]>0,true);
  const matrix=new THREE.Matrix4();p.playerMesh.getMatrixAt(0,matrix);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[9,8,7]);
  p.kill(p.player,73);p.render(camera);assert.equal(p.playerMesh.count,0);
  let disposed=0;for(const mesh of scene.children)mesh.addEventListener('dispose',()=>disposed++);
  p.dispose();p.dispose();assert.equal(disposed,5);assert.equal(scene.children.length,0);m.dispose();
});

test('expired sparse debris stops drawing and active fragments use packed instances', () => {
  const m=materials(),fx=new Effects(new THREE.Scene(),m,Q.low),d=fx.debris;
  d.cursor=95;d.spawn(1,20,3,0,0,0,1,.1);d.update(.01);
  assert.equal(d.mesh.count,1);d.update(.2);assert.equal(d.mesh.count,0);
  d.spawn(1,20,3,0,0,0,1,.1);d.update(.01);d.clear();assert.equal(d.mesh.count,0);
  fx.dispose();m.dispose();
});

test('input blur releases touch and held controls; disposed input no longer listens', () => {
  const root=new EventTarget(),input=new Input(root);
  const key=()=>Object.assign(new Event('keydown'),{code:'KeyW',repeat:false});
  root.dispatchEvent(key());assert.equal(input.isDown('up'),true);
  input._touchFire=true;input._touchVec.x=1;root.dispatchEvent(new Event('blur'));
  assert.equal(input.isDown('up'),false);assert.equal(input._touchFire,false);assert.equal(input._touchVec.x,0);
  input.dispose();root.dispatchEvent(key());assert.equal(input.isDown('up'),false);
});

test('component disposal cancels pending delays and detaches global subscriptions',async()=>{
  const scope=new Lifetime(),target=new EventTarget();let calls=0;
  scope.listen(target,'tick',()=>calls++);target.dispatchEvent(new Event('tick'));
  const pending=scope.delay(60000);scope.dispose();scope.dispose();
  assert.equal(await pending,false);target.dispatchEvent(new Event('tick'));assert.equal(calls,1);
});

test('repeated complete game construction and teardown returns scene to camera only',()=>{
  const m=materials(),scene=new THREE.Scene(),camera=new FlightCamera(52,1.8,.35,1000);scene.add(camera);
  const engine={scene,camera,materials:m,sky:{apply(){}},input:{},frame:0};
  let warm;
  for(let i=0;i<10;i++){
    const game=new Game(engine,{});
    game.fortress.update(0,.016,0,0);
    game.dispose();game.dispose();assert.equal(scene.children.length,1);
    warm ??= m._disposables.length;assert.equal(m._disposables.length,warm);
  }
  m.dispose();
});
