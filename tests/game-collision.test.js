import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null}; globalThis.matchMedia=()=>({matches:false});
const { Game } = await import('../src/game/Game.js');
function fixture(walls, positions) {
 const hit=[];
 const pool={capacity:1,life:[1],px:[0],py:[0],pz:[0],x:[0],y:[0],z:[30],radius:[.2],dmg:[1]};
 const g={projectiles:{player:pool},level:{collidersNear:()=>walls},_colliderScratch:[],enemies:positions.map(z=>({alive:true,pos:{x:0,y:-.4,z},radius:1,hit:()=>{hit.push(z);return false;}})),player:{pos:{x:0}},fx:{impact:()=>{}},shotsHit:0};
 Game.prototype._collidePlayerProjectiles.call(g,{}); return {hit,pool};
}
test('intervening thin wall blocks target even when endpoint is past wall',()=>{
 const r=fixture([{minX:-2,maxX:2,minY:-2,maxY:2,minZ:8,maxZ:8.1}],[20]); assert.deepEqual(r.hit,[]); assert.equal(r.pool.life[0],0);
});
test('nearest target wins independent of enemy array order',()=>assert.deepEqual(fixture([],[25,10]).hit,[10]));
