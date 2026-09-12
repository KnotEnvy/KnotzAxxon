import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { traceWorld } from '../src/game/WorldCollision.js';
globalThis.localStorage={getItem:()=>null};globalThis.matchMedia=()=>({matches:false});
const { Game }=await import('../src/game/Game.js');
const { Player }=await import('../src/entities/Player.js');
const { Drone,disposeEnemyGeometry }=await import('../src/entities/Enemies.js');
const { settings }=await import('../src/core/Settings.js');
const wall={minX:-10,maxX:10,minY:0,maxY:20,minZ:9,maxZ:10,tag:'wall'};
const gate={feature:{kind:'gate',z:10},gapY:4,gapH:8,previousGapY:4};
const level=(walls=[])=>({collidersNear:()=>walls});
const pool=(y=6)=>({capacity:1,life:[1],px:[0],py:[y],pz:[0],x:[0],y:[y],z:[30],radius:[.5],dmg:[1],target:[null]});
function player() {
 const p=Object.create(Player.prototype);
 p.pos=new THREE.Vector3();p.velocity=new THREE.Vector3();p.model={rotation:new THREE.Euler(),visible:true};
 p.group={visible:true,scale:{setScalar(){}}};p.reset();p._engineFx=()=>{};p._updateShadow=()=>{};
 p.fx={muzzle(){},addTrauma(){},shieldHit(){},sparks:{burst(){}}};p.kill=()=>{p.alive=false;};
 return p;
}
const context=()=>({input:{moveX:0,moveY:0,fire:false,boost:false,justPressed:()=>false},speedMultiplier:1,fuelBurnScale:1,hasDeck:false,time:0});

test('standard pulse holds altitude and lateral direction; assist alone steers',()=>{
 const p=player(), shots=[];p.projectiles={fire:(...a)=>shots.push(a)};p.target={x:12,y:3,z:80};
 settings.values.assist=false;p._fire({});assert.equal(shots[0][4],0);assert.equal(shots[0][5],0);assert.equal(shots[0][6],1);
 settings.values.assist=true;p._fire({});assert.notEqual(shots[1][4],0);assert.notEqual(shots[1][5],0);settings.values.assist=false;
});

test('standard alignment cue requires the actual muzzle lane, altitude and unblocked path',()=>{
 const enemy={alive:true,pos:new THREE.Vector3(1.6,8.1,30),radius:2,kind:'drone'};
 const g={player:{muzzleSide:1},enemies:[enemy],level:level(),fortress:{animated:[]},_colliderScratch:[]};
 const from=new THREE.Vector3(0,9,0);settings.values.assist=false;
 assert.equal(Game.prototype.findTarget.call(g,from)?.obj,enemy);
 enemy.pos.y=2;assert.equal(Game.prototype.findTarget.call(g,from),null);
 enemy.pos.y=8.1;enemy.pos.x=10;assert.equal(Game.prototype.findTarget.call(g,from),null);
 enemy.pos.x=1.6;g.level=level([wall]);assert.equal(Game.prototype.findTarget.call(g,from),null);
});

test('closed gate blocks player shots while clear opening passes them',()=>{
 for(const y of [2,8]) {
  const p=pool(y),g={projectiles:{player:p},level:level(),fortress:{animated:[gate]},_colliderScratch:[],enemies:[],player:{pos:{x:0}},fx:{impact(){}}};
  Game.prototype._collidePlayerProjectiles.call(g,{});assert.equal(p.life[0],y===2?0:1);
 }
});

test('hostile shot hits intervening cover before the player',()=>{
 let damage=0;const enemy=pool(),missile={capacity:0};
 const g={player:{pos:new THREE.Vector3(0,6,20),radius:1.5,damage(){damage++;return 'none';}},_previousPlayer:new THREE.Vector3(0,6,20),projectiles:{enemy,missile},level:level([wall]),fortress:{animated:[]},_colliderScratch:[],fx:{impact(){}}};
 Game.prototype._collideEnemyProjectiles.call(g,{});assert.equal(damage,0);assert.equal(enemy.life[0],0);
 g.level=level();enemy.life[0]=1;Game.prototype._collideEnemyProjectiles.call(g,{});assert.equal(damage,1);
});

test('hull sweep cannot tunnel through a thin wall or clip a gate edge',()=>{
 const g={player:{pos:new THREE.Vector3(0,2,20),radius:1.5},_previousPlayer:new THREE.Vector3(0,2,0),level:level([wall]),fortress:{animated:[]},_colliderScratch:[],_crash(ctx,c){this.hit=c;}};
 Game.prototype._collideStatic.call(g,{});assert.equal(g.hit,wall);
 g.level=level();g.fortress.animated=[gate];g.player.pos.y=4.8;g._previousPlayer.y=4.8;g.hit=null;
 Game.prototype._collideStatic.call(g,{});assert.equal(g.hit.tag,'gate');
 g.player.pos.y=8;g._previousPlayer.y=8;g.hit=null;Game.prototype._collideStatic.call(g,{});assert.equal(g.hit,null);
});

test('moving gate sweeps into a stationary hull during the step',()=>{
 const moving={feature:{kind:'gate',z:10},gapY:8,gapH:8,previousGapY:4};
 const hit=traceWorld(level(),[moving],0,6,10,0,6,10,0,[]);
 assert.equal(hit.t,.5);assert.equal(hit.collider.tag,'gate');
});

test('invulnerability retains terrain push-out and slowdown',()=>{
 let pushed=0;const p={damage:()=> 'none',speedScale:1,velocity:new THREE.Vector3(4,0,0)};
 Game.prototype._crash.call({player:p,_pushOut(){pushed++;}}, {},wall,'wall');
 assert.equal(pushed,1);assert.equal(p.speedScale,.5);assert.equal(p.velocity.x,1);
});

test('rammed fuel does not refuel; shooting the same tank does',()=>{
 let fuel=0;const g={player:{refuel:n=>fuel+=n},level:{groundAt:()=>0},fx:{explosion(){}},hud:{floater(){}},engine:{hitStop(){},input:{rumble(){}}},kills:0,_bumpChain(){},award(){},_dropPickup(){}};
 const tank={kind:'fuel',pos:new THREE.Vector3(),radius:2.2,fuelValue:.16};
 Game.prototype._killEnemy.call(g,tank,{},false);assert.equal(fuel,0);
 Game.prototype._killEnemy.call(g,tank,{},true);assert.equal(fuel,.16);
});

test('fuel failure bypasses shields/roll protection and is timestep independent',()=>{
 for(const fps of [30,60,120]) {
  const p=player();p.fuel=0;p.shields=2;p.invuln=100;
  for(let i=0;i<fps*2;i++)p.update(1/fps,context());
  assert.ok(Math.abs(p.hull-1.2)<1e-8);assert.equal(p.shields,2);
  for(let i=0;i<fps*2;i++)p.update(1/fps,context());assert.equal(p.alive,false);
 }
});

test('space flight shares the visible altitude floor',()=>{
 const p=player();p.pos.y=1.3;const ctx=context();ctx.input.moveY=-1;
 for(let i=0;i<120;i++)p.update(1/60,ctx);assert.equal(p.pos.y,1.3);
});

test('dive fighter closes, commits to peel and can be overtaken',()=>{
 const m=new THREE.MeshBasicMaterial(), mats={enemyHull:m,darkMetal:m,neon:()=>m};
 const enemy=new Drone(mats,{x:0,y:9,z:100,seed:7,pattern:'dive'});
 const p={pos:new THREE.Vector3(0,9,0),velocity:new THREE.Vector3(),speed:48,alive:false};
 const ctx={player:p,hasDeck:true,time:0,difficulty:0};
 for(let i=0;i<60;i++){p.pos.z+=48/60;ctx.time+=1/60;enemy.update(1/60,ctx);}
 assert.ok(enemy.pos.z-p.pos.z<75);
 for(let i=0;i<300;i++){p.pos.z+=48/60;ctx.time+=1/60;enemy.update(1/60,ctx);}
 assert.equal(enemy.peeling,true);assert.ok(enemy.pos.z<p.pos.z-55);
 enemy.dispose();disposeEnemyGeometry();m.dispose();
});

test('HUD paints hull-safe opening and advances past a cleared wall',()=>{
 let snapshot;
 const sector={zStart:0,zEnd:300,index:0,sub:'test'};
 const features=[{kind:'wall',type:'slot',z:20,thickness:4,gaps:[{x:0,w:54,y:4,h:8}]},{kind:'gate',z:60,runtime:{gapY:8,gapH:8}}];
 const g={player:{pos:new THREE.Vector3(0,8,0),radius:1.5,alive:true},level:{sectorAt:()=>sector,features},_wallsAhead:[],_contacts:[],_hudCursor:0,enemies:[],pickups:[],engine:{camera:{},stats:{}},hud:{update:s=>snapshot=s},score:0,chainTimer:0,sectorIndex:0,loop:0};
 Game.prototype._updateHud.call(g,1/60,{});
 assert.ok(Math.abs(snapshot.hazard.y0-5.13)<1e-8);assert.ok(Math.abs(snapshot.hazard.y1-10.87)<1e-8);
 const hit=traceWorld(level(),[gate],0,snapshot.hazard.y0,0,0,snapshot.hazard.y0,20,1.08,[]);
 assert.equal(hit.t,Infinity);
 g.player.pos.z=25;Game.prototype._updateHud.call(g,1/60,{});assert.equal(snapshot.hazard.z,60);
});

test('turrets and silos telegraph and fire within visible normal and boosted passes',async()=>{
 const { Turret,Silo }=await import('../src/entities/Enemies.js');
 const m=new THREE.MeshBasicMaterial(),mats={enemyHull:m,darkMetal:m,neon:()=>m};
 for(const Kind of [Turret,Silo]) for(const [speed,difficulty] of [[48,.3],[82.56,.3],[103,1]]) {
  let shots=0,firstFire=null;
  const e=new Kind(mats,{x:5,y:0,z:100,seed:11});
  const p={pos:new THREE.Vector3(0,9,0),velocity:new THREE.Vector3(),speed,alive:true};
  const fired=()=>{shots++;firstFire??=p.pos.z;};
  const ctx={player:p,difficulty,time:0,radarJammed:false,projectiles:{fire:fired,launchMissile:fired},fx:{muzzle(){}},warn(){}};
  for(let i=0;i<240 && p.pos.z<112;i++){ctx.time+=1/120;p.pos.z+=speed/120;e.update(1/120,ctx);}
  assert.ok(shots>=1,`${Kind.name} must fire at ${speed}`);
  assert.ok(firstFire>15 && firstFire<100,'first attack must happen within its readable approach');
  const envelope=Kind===Silo?85:75, telegraph=Kind===Silo?.55:.45;
  assert.ok((firstFire-(100-envelope))/speed>=telegraph-1/120,'difficulty must preserve first-shot telegraph duration');
  e.dispose();
 }
 disposeEnemyGeometry();m.dispose();
});

test('boss alignment cue uses the same pod edge as the hit test',()=>{
 settings.values.assist=false;
 const pod={alive:true,pos:new THREE.Vector3(7.1,8.9,30),radius:5};
 const boss={alive:true,active:true,pods:[pod],podsAlive:1,coreOpen:0,pos:new THREE.Vector3(100,8.9,30),radius:9,hitAt:()=> 'pod'};
 const p=pool(8.9);p.px[0]=p.x[0]=1.6;p.z[0]=60;
 const g={boss,enemies:[],player:{muzzleSide:1,pos:new THREE.Vector3(0,9,0)},level:level(),fortress:{animated:[]},_colliderScratch:[],projectiles:{player:p},shotsHit:0};
 assert.equal(Game.prototype.findTarget.call(g,g.player.pos),null);
 Game.prototype._collidePlayerProjectiles.call(g,{});assert.equal(p.life[0],1);
 pod.pos.x=6.5;assert.equal(Game.prototype.findTarget.call(g,g.player.pos)?.obj,boss);
 Game.prototype._collidePlayerProjectiles.call(g,{});assert.equal(p.life[0],0);
});
