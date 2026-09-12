import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Lifetime } from '../src/core/Lifetime.js';
import { Materials } from '../src/render/Materials.js';
globalThis.localStorage={getItem:()=>null,setItem(){}};
globalThis.matchMedia=()=>({matches:false});
globalThis.document={getElementById:()=>null};
globalThis.HTMLInputElement=class{};
globalThis.window=new EventTarget();
const { Input }=await import('../src/core/Input.js');
const { Engine }=await import('../src/core/Engine.js');
const { Player }=await import('../src/entities/Player.js');
const { Game,STATE }=await import('../src/game/Game.js');
const { Screens }=await import('../src/ui/Screens.js');
const { Audio }=await import('../src/audio/Audio.js');
const { PostFX }=await import('../src/render/PostFX.js');
const { CameraRig }=await import('../src/game/CameraRig.js');
const { FlightCamera }=await import('../src/core/FlightCamera.js');
const { settings }=await import('../src/core/Settings.js');

function player(){
 const p=Object.create(Player.prototype);
 p.pos=new THREE.Vector3();p.velocity=new THREE.Vector3();p.model={visible:true,rotation:new THREE.Euler()};
 p.group={visible:true,scale:{setScalar(){}}};p.reset();p._engineFx=p._updateShadow=()=>{};
 p.fx={addTrauma(){}};return p;
}
const context=()=>({input:{moveX:0,moveY:0,fire:false,boost:false,justPressed:()=>false},speedMultiplier:1,fuelBurnScale:0,hasDeck:true,time:0});
function game(){
 const m=Object.create(Materials.prototype);m._neon=new Map();m._disposables=[];
 for(const key of ['enemyHull','darkMetal','playerHull','playerAccent','glass','hull','deck','grating','hazard'])m[key]=m.track(new THREE.MeshStandardMaterial());
 m.glow=m.ring=m.blob=new THREE.Texture();
 const engine={scene:new THREE.Scene(),camera:new FlightCamera(52,1.8,.35,1000),materials:m,frame:0,
  sky:{apply(){}},input:{...context().input,reset(){}},postfx:new Proxy({resetTransient(){}},{get:(o,k)=>o[k]??(()=>{})}),
  setTimeScale:Engine.prototype.setTimeScale};
 const g=new Game(engine,{hide(){},show(){},sectorCard(){},results(){}});
 g._spawnFeatures=()=>{};g.fortress.update=()=>{};g.state=STATE.PLAYING;
 g.player._engineFx=g.player._updateShadow=()=>{};
 return {g,engine,dispose(){g.dispose();m.dispose();}};
}

test('Escape resume is handled once across Screens and Input subscriptions',()=>{
 const root=new EventTarget();globalThis.window=root;let state='paused',resumes=0;
 const s=Object.create(Screens.prototype);
 Object.assign(s,{_lifetime:new Lifetime(),current:'pause',stack:[],_items:()=>[],_act(){state='playing';resumes++;}});
 s._bindKeys();const input=new Input(root);
 input.addEventListener('press',e=>{if(e.detail==='pause')state=state==='playing'?'paused':'playing';});
 root.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'Escape',repeat:false}));
 assert.equal(state,'playing');assert.equal(resumes,1);input.dispose();s.dispose();
});

test('barrel roll settles without an extra reverse revolution at 30/60/120 Hz',()=>{
 for(const hz of [30,60,120])for(const direction of [-1,1]){
  const p=player(),ctx=context();ctx.input.moveX=direction;ctx.input.justPressed=()=>true;
  p.update(1/hz,ctx);ctx.input.justPressed=()=>false;
  for(let i=1;i<Math.ceil(hz*.8);i++)p.update(1/hz,ctx);
  assert.ok(Math.abs(p.roll)<1.5,`${hz}Hz roll=${p.roll}`);
 }
});

test('depleted boost stays off while held and resumes after release',()=>{
 const p=player(),ctx=context();p.boost=.03;ctx.input.boost=true;let transitions=0,last=false;
 for(let i=0;i<120;i++){p.update(1/60,ctx);if(p.boosting!==last)transitions++;last=p.boosting;}
 assert.equal(transitions,2);assert.equal(p.boosting,false);assert.ok(p.boost>.3);
 ctx.input.boost=false;p.update(1/60,ctx);ctx.input.boost=true;p.update(1/60,ctx);assert.equal(p.boosting,true);
});

test('a fire tap released before the rendered frame still produces a shot',()=>{
 const p=player(),ctx=context();let shots=0;p._fire=()=>{shots++;p.fireCooldown=.115;};
 ctx.input.justPressed=a=>a==='fire';p.update(1/60,ctx);p.update(1/60,ctx);assert.equal(shots,1);
});

test('death results arrive in bounded real time despite cinematic slow motion',()=>{
 const {g,dispose}=game();g.player.alive=false;g._beginDeath();let result=null;g._finish=v=>{result=v;g.state=STATE.OVER;};
 for(let i=0;i<145;i++)g.update(.28/60,i*.28/60,1/60);
 assert.equal(result,false);assert.equal(g.state,STATE.OVER);dispose();
});

test('victory deadline survives a long pause and completes after resume',()=>{
 const {g,dispose}=game();let result=null;g._finish=v=>{result=v;g.state=STATE.VICTORY;};g._bossGone();
 g.pause();for(let i=0;i<180;i++)g.update(0,0,1/60);assert.equal(result,null);assert.equal(g._endingCountdown,1.4);
 g.resume();for(let i=0;i<90;i++)g.update(1/60,i/60,1/60);assert.equal(result,true);dispose();
});

test('immediate transition clears old hit-stop and retry restores visible player',()=>{
 const e={timeScale:.28,_targetTimeScale:.28,_hitStop:.08};Engine.prototype.setTimeScale.call(e,1,true);
 assert.deepEqual(e,{timeScale:1,_targetTimeScale:1,_hitStop:0});
 const p=player();p.model.visible=false;p.reset();assert.equal(p.model.visible,true);
 const fx=Object.create(PostFX.prototype);fx.state={damage:1,flash:1,radial:1,desat:1};fx._target={damage:1,desat:1};
 fx.setEdgePulse=v=>{fx.edge=v;};fx.update=()=>{};fx.resetTransient();
 assert.ok(Object.values(fx.state).every(v=>v===0));assert.equal(fx.edge,0);
});

test('controller navigates results, confirms retry and retains pause-button debounce',()=>{
 const actions=[],items=['retry','title'].map(action=>({dataset:{action},classList:{contains:c=>c==='mi'}}));
 const s=Object.create(Screens.prototype);Object.assign(s,{current:'over',stack:[],selIndex:0,_items:()=>items,_refreshSelection(){},_act:a=>actions.push(a)});
 assert.equal(s.handleControl('down'),true);s.handleControl('confirm');s.handleControl('up');s.handleControl('confirm');
 assert.deepEqual(actions,['title','retry']);
 const buttons=Array.from({length:16},()=>({pressed:false,value:0}));buttons[9].pressed=true;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>[{connected:true,axes:[0,0],buttons}]}});
 const input=new Input(new EventTarget());let pauses=0;
 input.addEventListener('press',e=>{if(e.detail==='pause'){pauses++;input.reset();}});
 for(let i=0;i<20;i++)input.update();assert.equal(pauses,1);
 buttons[9].pressed=false;input.update();buttons[9].pressed=true;input.update();assert.equal(pauses,2);input.dispose();
});

test('audio scheduler discards background backlog instead of bursting past notes',()=>{
 const a=new Audio(),notes=[];Object.assign(a,{ready:true,_musicOn:true,_bpm:132,_nextNoteTime:.1,_step:0,ctx:{currentTime:120}});
 a._playStep=(step,t)=>notes.push(t);a._schedule();
 assert.ok(notes.length<=2);assert.ok(notes.every(t=>t>=120));assert.ok(a._step>1000);
});

test('zero shake also disables weapon camera recoil and snap clears residual camera state',()=>{
 const camera=new FlightCamera(52,1.8,.35,1000),rig=new CameraRig(camera),p=player();
 const previous=settings.values.shake;settings.values.shake=0;rig.snap(p);rig.kick(.9);rig.update(1/60,1,p,{trauma:1});
 assert.equal(camera.position.z,rig.position.z);rig.snap(p);assert.equal(rig._kick,0);assert.deepEqual(camera.up.toArray(),[0,1,0]);settings.values.shake=previous;
});


test('retry cancels queued DOM damage flash and clears transient HUD state',async()=>{
 const {HUD}=await import('../src/ui/HUD.js');const h=new HUD();
 const queue=new Map();globalThis.requestAnimationFrame=fn=>{queue.set(1,fn);return 1;};globalThis.cancelAnimationFrame=id=>queue.delete(id);
 h.damageFlash={style:{}};h._warnTimer=10;h.pulseDamage(.8);assert.equal(queue.size,1);
 h.reset();assert.equal(queue.size,0);assert.equal(h.damageFlash.style.opacity,'0');assert.equal(h._warnTimer,0);
});


test('mouse and touch fire taps retain an edge and mouse release preserves keyboard fire',()=>{
 const canvas=new EventTarget(),stick=new EventTarget(),fire=new EventTarget(),root=new EventTarget();stick.querySelector=()=>null;
 const original=document.getElementById;document.getElementById=id=>({viewport:canvas,'touch-stick':stick,'tb-fire':fire}[id]??null);
 const input=new Input(root);
 const pointer=type=>Object.assign(new Event(type),{button:0,pointerType:'mouse'});
 canvas.dispatchEvent(pointer('pointerdown'));root.dispatchEvent(pointer('pointerup'));assert.equal(input.justPressed('fire'),true);
 input.endFrame();root.dispatchEvent(Object.assign(new Event('keydown'),{code:'Space',repeat:false}));
 canvas.dispatchEvent(pointer('pointerdown'));root.dispatchEvent(pointer('pointerup'));assert.equal(input.isDown('fire'),true);
 input.reset();fire.dispatchEvent(new Event('touchstart',{cancelable:true}));fire.dispatchEvent(new Event('touchend',{cancelable:true}));
 assert.equal(input._touchFire,false);assert.equal(input.justPressed('fire'),true);
 input.dispose();document.getElementById=original;
});
