import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { Engine } from '../src/core/Engine.js';
import { Rng } from '../src/core/Utils.js';
import { Vector3 } from 'three';

const source=fs.readFileSync(new URL('../scripts/qa/launch/pilot-browser.js',import.meta.url),'utf8');
function fixture(hyper){
 const calls={input:0,physics:0,late:0,hud:0,draw:0,adapt:0},order=[];
 const input={_touchVec:{x:0,y:0},update(){calls.input++},endFrame(){},reset(){}};
 const player={pos:new Vector3(0,10,0),speed:40,hull:3,shields:1,fuel:1,heat:0,rollCooldown:1,
  damage(){this.hull--;return 'hull'}};
 const game={player,state:'idle',seed:1,loop:0,sectorIndex:0,runTime:0,grades:Array(8).fill(null),
  level:{features:[]},enemies:[],pickups:[],projectiles:{fire(){},enemy:{capacity:0}},
  score:0,kills:0,shotsFired:0,shotsHit:0,threads:0,grazes:0,
  hud:{update(){calls.hud++}},_gradeSector(){},_crash(){player.damage()},warn(){},
  start(){order.push('start');this.state='playing'},reset(){},_enterSector(){}};
 const adapt=function(){calls.adapt++},draw=function(){calls.draw++},hud=game.hud.update;
 const engine=Object.assign(Object.create(Engine.prototype),{
  input,running:false,time:0,frame:0,timeScale:1,_targetTimeScale:1,_hitStop:0,_hitStopScale:.22,
  _msEma:16.7,_renderScale:1,_scaleCooldown:0,_last:0,_disposed:false,_contextLost:false,stats:{},canvas:{width:720,height:405},
  materials:{update(){}},postfx:{render:draw,update(){}},
  renderer:{info:{programs:[],memory:{geometries:0,textures:0},render:{calls:0,triangles:0,points:0,lines:0},reset(){}}},
  _adaptResolution:adapt,
  _updateHooks:[(dt)=>{calls.physics++;game.runTime+=dt;player.pos.z+=40*dt;player.fuel-=dt/300;
   if(engine.frame===60)engine.hitStop(.22,.075);
   if(engine.frame===75)game._crash(null,null,'fixture');
   if(engine.frame===240)game.state='over';}],
  _lateHooks:[()=>{calls.late++;game.hud.update({score:game.score},1/60)}]
 });
 const stop=engine.stop;engine.stop=function(){order.push('stop');return stop.call(this)};
 const rand=new Rng(3),reset=rand.reset;rand.reset=function(seed){order.push('seed');return reset.call(this,seed)};
 const audio={ready:true,enabled:true,stopMusic(){},stopEngine(){}};
 const context={performance,Math:Object.create(Math),innerWidth:960,innerHeight:540,devicePixelRatio:1,
  document:{activeElement:null},navigator:{getGamepads(){return[]}},requestAnimationFrame(){return 0},cancelAnimationFrame(){},
  KZ:{engine,game,rand,audio,settings:{values:{quality:'low'}}}};
 context.window=context;
 vm.runInNewContext(source,context);
 const spec={seed:1,sharedRandomSeed:2,loop:0,profile:'analog',renderEvery:hyper?36000:12,maxSeconds:10,
  hyper,silentSimulation:true,timeOrigin:0};
 return {engine,game,player,context,calls,order,spec,original:{adapt,draw,hud},bot:context.KZBot};
}
function withRaf(fn){
 const prior={requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 globalThis.requestAnimationFrame=()=>0;globalThis.cancelAnimationFrame=()=>{};
 try{return fn()}finally{
  for(const [key,value] of Object.entries(prior))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
}
test('hyper chunks retain the actual Engine time scaling, hit stop, input and every simulation hook',()=>withRaf(()=>{
 const run=hyper=>{const f=fixture(hyper);f.bot.begin(f.spec);const batch=f.bot.chunk(36000);assert.equal(batch.done,true);
  return {...f,result:f.bot.end()}};
 const reference=run(false),hyper=run(true);
 for(const key of ['frames','rawSeconds','gameSeconds','hull','shields','fuel','z','outcome'])assert.equal(reference.result[key],hyper.result[key],key);
 assert.equal(hyper.result.frames,240);assert.equal(hyper.calls.input,240);assert.equal(hyper.calls.physics,240);assert.equal(hyper.calls.late,240);
 assert.equal(hyper.result.hull,2);assert(hyper.result.gameSeconds<hyper.result.rawSeconds,'original hit stop must slow simulation');
 assert.equal(reference.calls.hud,240);assert.equal(hyper.calls.hud,1);
 assert.equal(reference.result.renderedFrames,20);assert.equal(hyper.result.renderedFrames,2);
 assert.deepEqual(hyper.order.slice(0,3),['stop','seed','start'],'seeding and fixture start follow the rAF stop in one call');
}));
test('bulk episode restores render, HUD, resolution and audio owners after completion',()=>withRaf(()=>{
 const f=fixture(true);f.bot.begin(f.spec);assert.equal(f.context.KZ.audio.ready,false);f.bot.chunk(36000);f.bot.end();
 assert.equal(f.engine.postfx.render,f.original.draw);assert.equal(f.game.hud.update,f.original.hud);
 assert.equal(f.engine._adaptResolution,f.original.adapt);assert.equal(f.context.KZ.audio.ready,true);assert.equal(f.context.KZ.audio.enabled,true);
 assert.equal(f.engine._loop,Engine.prototype._loop);assert.equal(f.engine.running,false);
}));
test('invalid bot clocks fail early and a failed fixture restores the audio flags',()=>withRaf(()=>{
 const f=fixture(true);
 assert.throws(()=>f.bot.begin({...f.spec,renderEvery:0}),/Invalid bot cadence/);
 const fault=Error('fixture construction failure');f.game.start=()=>{throw fault};
 assert.throws(()=>f.bot.begin(f.spec),e=>e===fault);
 assert.equal(f.context.KZ.audio.ready,true);assert.equal(f.context.KZ.audio.enabled,true);
}));
test('invalid chunks cannot silently leave an active campaign spinning without progress',()=>withRaf(()=>{
 const f=fixture(true);f.bot.begin(f.spec);
 for(const size of [0,-1,1.5,36001,NaN])assert.throws(()=>f.bot.chunk(size),/Invalid bot chunk limit/);
 f.bot.chunk(36000);f.bot.end();
}));
