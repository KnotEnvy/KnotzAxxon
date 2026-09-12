import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Level,FLIGHT_SPEED,ALT_MIN,ALT_MAX} from '../src/world/Level.js';
import {findAltitudeEcho} from '../src/game/AltitudeEcho.js';
import {FlightCamera} from '../src/core/FlightCamera.js';
globalThis.localStorage={getItem:()=>null};globalThis.matchMedia=()=>({matches:false});
globalThis.document={getElementById:()=>null};
const {Game}=await import('../src/game/Game.js');
const {Screens}=await import('../src/ui/Screens.js');

test('opening pace is 25 percent slower at launch and eases to forty without exceeding old cruise',()=>{
 const level=new Level(42);assert.equal(FLIGHT_SPEED*level.paceAt(0),36);assert.equal(FLIGHT_SPEED*level.paceAt(600),40);
 let previous=0;for(let z=0;z<level.totalLength;z+=10){const pace=FLIGHT_SPEED*level.paceAt(z);assert.ok(pace>=previous);assert.ok(pace<48*(1+level.sectorAt(z).index*.035));previous=pace;}
 assert.ok(new Level(42,1).paceAt(600)>level.paceAt(600));
});

test('fuel burn per distance stays equivalent during launch and later sectors',()=>{
 const level=new Level(42);
 for(const z of [0,300,600,1700,3400,8000]){
  const index=level.sectorAt(z).index;
  const g={player:{pos:new THREE.Vector3(0,9,z)},level,sectorIndex:index,loop:0,engine:{},fortress:{},rig:{},screens:{}};
  const ctx=Game.prototype._ctx.call(g,1/60,0);
  assert.ok(Math.abs(ctx.fuelBurnScale/(FLIGHT_SPEED*ctx.speedMultiplier)-1/(48*(1+index*.035)))<1e-10);
 }
});

test('all seeds open with learnable fuel, gun and clearance beats before advanced hazards',()=>{
 for(let seed=1;seed<=50;seed++){
  const level=new Level(seed),features=level.features.filter(f=>f.z<900&&f.kind!=='deck');
  assert.deepEqual(features.map(f=>f.kind),['fuel','fuel','turret','wall','radar','drone','drone']);
  assert.deepEqual(features.slice(0,2).map(f=>f.x),[-7,-7]);
  const wall=features.find(f=>f.kind==='wall');assert.equal(wall.type,'slot');assert.ok(wall.gaps[0].h>=12);
  assert.ok(!level.features.some(f=>f.z<3200&&f.kind==='gate'),'moving gates start after the first two bases');
  assert.equal(level.sectors.length,8);assert.equal(level.features.filter(f=>f.kind==='boss').length,1);
 }
});

test('sector generation stays deterministic and each fortress closes with a fuel lane',()=>{
 const a=new Level(73),b=new Level(73);assert.deepEqual(a.features,b.features);assert.deepEqual(a.colliders,b.colliders);
 for(const sector of a.sectors.filter(s=>s.kind==='fortress')) {
  const fuel=a.features.filter(f=>f.kind==='fuel'&&f.z===sector.zEnd-110);assert.equal(fuel.length,1);assert.equal(fuel[0].x,0);
 }
 assert.ok(a.sectors[1].weights[2]>a.sectors[1].weights[5]);assert.ok(a.sectors[3].weights[1]>a.sectors[3].weights[2]);
 for(const sector of a.sectors.filter(s=>s.kind==='space'))assert.ok(sector.spaceWeights[0]>sector.spaceWeights[1]+sector.spaceWeights[2]);
});

function fixture(){
 const c=new FlightCamera(52,1,.35,300);c.position.set(0,10,-20);c.lookAt(0,10,40);c.setFlightProjection(true,30);c.updateMatrixWorld(true);
 const level={collidersNear:()=>[]};
 return {engine:{camera:c},level,fortress:{animated:[]},player:{pos:new THREE.Vector3(0,9,0),muzzleSide:1},enemies:[]};
}
const enemy=(x,y,z,r=2)=>({alive:true,kind:'turret',pos:new THREE.Vector3(x,y,z),radius:r});

test('one echo uses nearest visible firing lane and the real spherical altitude cross-section',()=>{
 const g=fixture(),out={};g.enemies=[enemy(1.6,8,70),enemy(1.6,3,35),enemy(14,9,20)];
 const echo=findAltitudeEcho(g,out);assert.equal(echo,out);assert.ok(Math.abs(echo.center-3.9)<1e-8);assert.equal(echo.min,ALT_MIN);assert.ok(Math.abs(echo.max-6.8)<1e-8);
 g.enemies[1].alive=false;assert.ok(findAltitudeEcho(g,out).center>8);
 g.enemies=[enemy(40,9,35)];assert.equal(findAltitudeEcho(g,out),null);
 g.enemies=[enemy(1.6,9,150)];assert.equal(findAltitudeEcho(g,out),null);
});

test('echo hides behind walls, does not imply shooting through cover and respects flight ceiling',()=>{
 const g=fixture();g.enemies=[enemy(1.6,8,35)];
 g.level={collidersNear:()=>[{minX:-25,maxX:25,minY:0,maxY:40,minZ:20,maxZ:22,tag:'wall'}]};assert.equal(findAltitudeEcho(g),null);
 g.level={collidersNear:()=>[]};g.enemies=[enemy(1.6,24,35)];assert.equal(findAltitudeEcho(g).max,ALT_MAX);
 g.enemies[0].kind='mine';assert.equal(findAltitudeEcho(g),null);
});

test('boss echo only follows living pods and exposed core',()=>{
 const g=fixture();g.boss={alive:true,active:true,pods:[{alive:true,pos:new THREE.Vector3(1.6,8,40),radius:5}],coreOpen:0};
 assert.ok(findAltitudeEcho(g));g.boss.pods[0].alive=false;assert.equal(findAltitudeEcho(g),null);
 g.boss.coreOpen=1;g.boss.coreGroup={getWorldPosition:v=>v.set(1.6,12,40)};assert.ok(findAltitudeEcho(g));
});

test('sector text reveal cancels superseded animations and reduced motion skips effects',()=>{
 let created=0,cancelled=0;const nodes=new Map();
 const node=()=>({textContent:'',animate(){created++;return {cancel(){cancelled++;}};},classList:{add(){},remove(){}}});
 for(const id of ['sc-name','sc-num','sc-desc','sc-rhythm'])nodes.set(id,node());
 const oldDocument=globalThis.document,oldMedia=globalThis.matchMedia;globalThis.document={getElementById:id=>nodes.get(id)};
 const screen={screens:new Map([['sector',node()]])};
 try{
  Screens.prototype.sectorCard.call(screen,{index:0,name:'OUTER FORTRESS',rhythm:'LEARN THE RUN',brief:'Read your shadow.'});assert.equal(created,2);
  Screens.prototype.sectorCard.call(screen,{index:1,name:'GUN BATTERIES',rhythm:'GROUND ASSAULT'});assert.equal(cancelled,2);assert.equal(nodes.get('sc-name').textContent,'GUN BATTERIES');
  globalThis.matchMedia=()=>({matches:true});Screens.prototype.sectorCard.call(screen,{index:2,name:'VOID'});assert.equal(created,4);assert.equal(cancelled,4);
 }finally{clearTimeout(screen._cardT);globalThis.document=oldDocument;globalThis.matchMedia=oldMedia;}
});
