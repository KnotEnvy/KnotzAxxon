import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FlightCamera } from '../src/core/FlightCamera.js';
import { inCombatView, markerVisible } from '../src/game/CombatVisibility.js';
globalThis.localStorage = {getItem:()=>null};
globalThis.matchMedia = ()=>({matches:false});
globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
globalThis.document = {getElementById:()=>null,createElement:()=>new Node()};
const {settings} = await import('../src/core/Settings.js');
const {Player} = await import('../src/entities/Player.js');
const {Game} = await import('../src/game/Game.js');
const {CameraRig} = await import('../src/game/CameraRig.js');
const {HUD} = await import('../src/ui/HUD.js');
const {audio} = await import('../src/audio/Audio.js');
class Node {
  constructor(){this.style={};this.textContent='';this.children=[];const names=new Set();this.classList={add:(...a)=>a.forEach(n=>names.add(n)),remove:(...a)=>a.forEach(n=>names.delete(n)),contains:n=>names.has(n),toggle:(n,on)=>on?names.add(n):names.delete(n)};}
  appendChild(el){this.children.push(el);el.parent=this;}
  remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
}
function pilot() {
  const p=Object.create(Player.prototype);
  Object.assign(p,{pos:new THREE.Vector3(),velocity:new THREE.Vector3(),model:{rotation:new THREE.Euler(),visible:true},group:{visible:true,scale:{setScalar(){}}},fx:{addTrauma(){},muzzle(){}},_engineFx(){},_updateShadow(){}});
  p.reset(); return p;
}
function camera(mode='classic',aspect=16/9,p=pilot()) {
  settings.values.camera=mode;
  const c=new FlightCamera(52,aspect,.35,1000);new CameraRig(c).snap(p);return c;
}
const empty={collidersNear:()=>[]};

test('left/right and directed rolls move toward the requested screen edge in every rig',()=>{
  for(const mode of ['classic','modern','chase']) for(const aspect of [16/9,9/16]) for(const direction of [-1,1]) for(const roll of [false,true]) {
    const p=pilot(), c=camera(mode,aspect,p), start=p.pos.clone().project(c).x;
    const ctx={input:{moveX:direction,moveY:0,boost:false,fire:false,justPressed:action=>roll&&action==='roll'},speedMultiplier:1,fuelBurnScale:1,time:0};
    // Isolate lateral displacement from the shared forward scrolling motion.
    for(let i=0;i<12;i++)p.update(1/60,ctx);
    const displaced=new THREE.Vector3(p.pos.x,9,0).project(c).x;
    assert.ok((displaced-start)*direction>0,mode+' direction '+direction+' roll '+roll);
  }
});

test('viewport eligibility rejects each screen edge, behind-camera and far-plane targets',()=>{
  for(const mode of ['classic','modern','chase']) for(const aspect of [16/9,9/16]) {
    const c=camera(mode,aspect);
    const point=(x,y,z=0)=>new THREE.Vector3(x,y,z).unproject(c);
    const inside=point(0,0);assert.equal(inCombatView(c,...inside.toArray()),true);
    for(const p of [point(1.1,0),point(-1.1,0),point(0,1.1),point(0,-1.1),point(0,0,1.01),point(0,0,-1.01)])assert.equal(inCombatView(c,...p.toArray()),false);
  }
});

function hitFixture(c, point) {
  let hits=0,kills=0,fx=0;
  const pool={capacity:1,life:[1],px:[point.x],py:[point.y],pz:[point.z-10],x:[point.x],y:[point.y],z:[point.z+10],radius:[.2],dmg:[1]};
  const target={alive:true,kind:'drone',pos:new THREE.Vector3(point.x,point.y-.4,point.z),radius:1,hit(){hits++;return true;}};
  const g={engine:{camera:c},projectiles:{player:pool},enemies:[target],level:empty,_colliderScratch:[],player:{pos:new THREE.Vector3(),muzzleSide:1},fx:{impact(){fx++;}},shotsHit:0,_killEnemy(){kills++;}};
  Game.prototype._collidePlayerProjectiles.call(g,{});
  return {g,pool,hits,kills,fx};
}
test('off-screen collisions consume bolts without damage, kills, score feedback or hit counts',()=>{
  for(const mode of ['classic','modern','chase']) {
    const c=camera(mode);
    const visible=new THREE.Vector3(0,0,0).unproject(c), hidden=new THREE.Vector3(1.3,0,0).unproject(c);
    const yes=hitFixture(c,visible);assert.equal(yes.hits,1);assert.equal(yes.kills,1);assert.equal(yes.g.shotsHit,1);
    const no=hitFixture(c,hidden);assert.equal(no.pool.life[0],0);assert.equal(no.hits,0);assert.equal(no.kills,0);assert.equal(no.g.shotsHit,0);assert.equal(no.fx,0);
  }
});

test('off-screen enemies cannot be acquired and a stale assisted lock fires straight',()=>{
  const p=pilot(),c=camera('classic');
  const target={alive:true,pos:new THREE.Vector3(1.6,8.1,160),radius:2};
  assert.equal(inCombatView(c,1.6,8.9,160),false);
  const g={engine:{camera:c},player:p,enemies:[target],level:empty,_colliderScratch:[]};
  for(const assist of [false,true]){settings.values.assist=assist;assert.equal(Game.prototype.findTarget.call(g,p.pos),null);}
  p.target={x:1.6,y:8.9,z:160};const shots=[];p.projectiles={fire:(...args)=>shots.push(args)};p._fire({camera:c});
  assert.equal(shots[0][4],0);assert.equal(shots[0][5],0);assert.equal(shots[0][6],1);settings.values.assist=false;
});

test('marker sightlines respect solid cover, gate openings and cleared obstacle retirement',()=>{
  const c=new FlightCamera(52,1,.35,200);c.position.set(0,6,-20);c.lookAt(0,6,30);c.setFlightProjection(true,20);c.updateMatrixWorld(true);
  const wall={minX:-10,maxX:10,minY:0,maxY:20,minZ:8,maxZ:9};
  const level={collidersNear:()=>[wall]};
  assert.equal(markerVisible(c,empty,[],0,0,6,30),true);
  assert.equal(markerVisible(c,level,[],0,0,6,30),false);
  assert.equal(markerVisible(c,level,[],20,0,6,30),true);
  const gate={feature:{kind:'gate',z:8},gapY:4,gapH:8};
  assert.equal(markerVisible(c,empty,[gate],0,0,6,30),true);
  gate.gapY=9;assert.equal(markerVisible(c,empty,[gate],0,0,6,30),false);
  assert.equal(gate.collisionBoxes,undefined,'presentation must not mutate collision caches');
});

test('stereo panning and radar both place world negative X on screen-right',()=>{
  assert.ok(audio.panFor(-12,0)>0);assert.ok(audio.panFor(12,0)<0);
  const h=new HUD(),arcs=[];h.radarCanvas={width:100,height:100};h.radarCtx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},arc:(...v)=>arcs.push(v)};
  h._drawRadar({player:{pos:{x:0,z:0}},contacts:[{x:-12,z:50},{x:12,z:50}],wallsAhead:[]});
  assert.ok(arcs[0][0]>50);assert.ok(arcs[1][0]<50);
});

test('altitude echo reports level and clears on retry without an enemy overlay',()=>{
  const h=new HUD();h.altEcho=new Node();h.altEchoOn.el=h.altEcho;h.altEchoLevel.el=h.altEcho;h.altEchoStatus.el=new Node();
  const s={altitudeEcho:{min:5,max:10},altitude:8,hasDeck:true};
  h._updateAltitudeEcho(s);assert.ok(h.altEcho.classList.contains('on'));assert.ok(h.altEcho.classList.contains('level'));assert.equal(h.altEchoStatus.el.textContent,'LEVEL');
  s.altitude=12;h._updateAltitudeEcho(s);assert.equal(h.altEcho.classList.contains('level'),false);assert.equal(h.altEchoStatus.el.textContent,'CONTACT');
  s.altitudeEcho=null;h._updateAltitudeEcho(s);assert.equal(h.altEcho.classList.contains('on'),false);
  h.reset();assert.equal(h.altEchoStatus.el.textContent,'ALT');assert.equal(h._threatMarkers,undefined);
});

test('chains announce early kills and milestones, retain x8 cap, warn on timeout and clear on retry',()=>{
  const h=new HUD();h.chainWrap=new Node();h.chainEventEl=new Node();h.chainMult.el=new Node();h.chainDetail.el=new Node();
  const g=Object.assign(Object.create(Game.prototype),{hud:h,chain:0,chainMult:1,chainTimer:0});
  g._bumpChain();h._updateChain({chain:g.chain,chainMult:g.chainMult,chainTime:1},0);
  assert.match(h.chainDetail.el.textContent,/1 KILLS/);assert.equal(h.chainEventEl.textContent,'CHAIN +1');
  g._bumpChain();g._bumpChain();assert.equal(g.chainMult,2);assert.equal(h.chainEventEl.textContent,'MULTIPLIER UP');
  for(let i=0;i<30;i++)g._bumpChain();assert.equal(g.chainMult,8);assert.equal(h.chainEventEl.textContent,'MAX CHAIN');
  h._updateChain({chain:g.chain,chainMult:8,chainTime:.2},.1);assert.ok(h.chainWrap.classList.contains('urgent'));
  g._breakChain();assert.equal(g.chain,0);assert.equal(g.chainMult,1);assert.equal(g.chainTimer,0);assert.equal(h.chainEventEl.textContent,'CHAIN LOST');
  h._updateChain({chain:0,chainMult:1,chainTime:0},1.3);assert.equal(h.chainEventEl.classList.contains('on'),false);
  h.reset();assert.equal(h._comboTimer,0);assert.equal(h.chainWrap.classList.contains('urgent'),false);
});
