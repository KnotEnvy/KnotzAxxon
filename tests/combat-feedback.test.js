import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
globalThis.localStorage={getItem:()=>null};globalThis.matchMedia=()=>({matches:false});
globalThis.document={getElementById:()=>null};
globalThis.innerWidth=1280;globalThis.innerHeight=720;
const { Game } = await import('../src/game/Game.js');
const { HUD } = await import('../src/ui/HUD.js');
const { Audio, audio } = await import('../src/audio/Audio.js');

test('damage, weak-point and blocked boss impacts have distinct feedback; armour is not an accurate hit',()=>{
  const originalHit=audio.targetHit, originalImpact=audio.impact;
  try {
    for(const kind of ['armour','pod','core','launcher']) {
      const sounds=[],markers=[];
      audio.targetHit=(pan,dist,weak)=>sounds.push(weak?'weak':'damage');audio.impact=()=>sounds.push('armour');
      const pool={capacity:1,life:[1],px:[0],py:[0],pz:[0],x:[0],y:[0],z:[30],radius:[.2],dmg:[1]};
      const game={projectiles:{player:pool},level:{collidersNear:()=>[]},_colliderScratch:[],enemies:[],player:{pos:{x:0,z:0}},shotsHit:0,
        boss:{alive:true,active:true,coreOpen:0,pods:[],pos:new THREE.Vector3(0,0,20),radius:3,hitAt:()=>kind},
        hud:{combatHit:(pos,type)=>markers.push(type)}};
      Game.prototype._collidePlayerProjectiles.call(game,{});
      const feedback=kind==='armour'?'armour':kind==='pod'?'damage':'weak';
      assert.deepEqual(sounds,[feedback]);assert.deepEqual(markers,[feedback]);
      assert.equal(game.shotsHit,kind==='armour'?0:1);assert.equal(pool.life[0],0);
    }
  } finally {audio.targetHit=originalHit;audio.impact=originalImpact;}
});

test('confirmation marker expires, keeps kills ahead of incidental armour, hides offscreen and resets',()=>{
  const hud=new HUD();hud.hitEl={style:{},className:''};
  const camera=new THREE.PerspectiveCamera(60,16/9,.1,100);camera.updateMatrixWorld();
  hud.combatHit(new THREE.Vector3(0,0,-10),'kill');
  hud.combatHit(new THREE.Vector3(1,0,-10),'armour');
  assert.equal(hud.hitEl.className,'combat-confirm kill');
  hud._updateCombatHit(.016,camera);assert.equal(hud.hitEl.style.opacity,'1');
  hud._updateCombatHit(.3,camera);assert.equal(hud.hitEl.style.opacity,'0');
  hud.combatHit(new THREE.Vector3(100,0,-10));hud._updateCombatHit(.016,camera);assert.equal(hud.hitEl.style.opacity,'0');
  hud.combatHit(new THREE.Vector3(0,0,-10));hud.reset();assert.equal(hud._hitLife,0);assert.equal(hud.hitEl.style.opacity,'0');
});

test('warning priority ducks the weapon bus temporarily and restores it without lowering the SFX master',()=>{
  const a=new Audio(), events=[];a._clock=10;
  a._cuePocket=()=>events.push('music');
  a.combatBus={gain:{cancelScheduledValues:t=>events.push(['cancel',t]),setTargetAtTime:(v,t,c)=>events.push([v,t,c])}};
  a.sfxBus={gain:{setTargetAtTime:()=>assert.fail('pilot warnings must retain their SFX level')}};
  a._warningPocket();
  assert.deepEqual(events,['music',['cancel',10],[.48,10,.008],[1,10.12,.16]]);
});
