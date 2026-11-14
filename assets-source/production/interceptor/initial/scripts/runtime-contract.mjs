// Actual Flyer.update and Enemy hit/aim/update in a dependency-free harness.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import * as Utils from '../../../../src/core/Utils.js';
const OUT=path.dirname(path.dirname(fileURLToPath(import.meta.url))),REPO=path.resolve(OUT,'../../..');
const source=fs.readFileSync(path.join(REPO,'src/entities/Enemies.js'),'utf8');
class V {constructor(x=0,y=0,z=0){this.set(x,y,z)}set(x,y,z){this.x=x;this.y=y;this.z=z;return this}copy(v){return this.set(v.x,v.y,v.z)}sub(v){return this.set(this.x-v.x,this.y-v.y,this.z-v.z)}addScaledVector(v,s){return this.set(this.x+v.x*s,this.y+v.y*s,this.z+v.z*s)}distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z)}normalize(){const l=Math.hypot(this.x,this.y,this.z)||1;return this.set(this.x/l,this.y/l,this.z/l)}toArray(){return [this.x,this.y,this.z]}}
const bindings={THREE:{Vector3:V},...Utils,SIDE:{ENEMY:1},CORRIDOR_HALF:16,ALT_MIN:1.3,ALT_MAX:25,audio:{flyby(){},enemyShot(){},panFor(){return 0}}};
const code=source.replace(/^import .*$/gm,'').replace(/^export /gm,'');
const {Flyer}=new Function(...Object.keys(bindings),code+';return {Flyer};')(...Object.values(bindings));
function build(feature){
 const rng=new Utils.Rng(feature.seed??1),e=Object.create(Flyer.prototype);e.fast=true;e.rng=rng;e.hp=2;e.radius=2.2;e.score=320;e.pattern=feature.pattern??'weave';e.phase=rng.next()*Utils.TAU;e.fireTimer=rng.range(.8,2.6);e.velocity=new V();e.homeX=feature.x;e.homeY=feature.y;e.peeling=false;e.peelDir=rng.bool()?1:-1;e.launching=!!feature.launch;e.pos=new V(feature.x,feature.y,feature.z);e.alive=true;e.flash=0;e.group={rotation:{x:0,y:0,z:0}};
 if(e.launching)e.pos.set(58+rng.range(-2,2),2+rng.range(-2,4),e.pos.z);
 e.engine={scale:{x:1,setScalar(v){this.x=v}}};e.flashMesh={visible:false};e.flashMat={opacity:0};return e;
}
function state(e,t){return {time:t,position:e.pos.toArray(),rotation_xyz:[e.group.rotation.x,e.group.rotation.y,e.group.rotation.z],velocity:e.velocity.toArray(),engine_scale:e.engine.scale.x,launching:e.launching,peeling:e.peeling}}
const contexts={};let shots=[],muzzle=[];const player={pos:new V(0,9,0),velocity:new V(),speed:40,alive:false};
const ctx={player,time:0,difficulty:.65,radarJammed:true,projectiles:{fire(...a){shots.push(a)}},fx:{muzzle(p,d,...a){muzzle.push([p.toArray(),d.toArray(),...a])}}};
for(const [name,pattern,opt,duration] of [['weave','weave',{},8],['strafe','strafe',{x:12},8],['orbit-displaced','orbit',{x:-12,y:4,displace:true},8],['dive','dive',{x:12,y:18},8],['peel','dive',{z:10},4],['carrier-launch','weave',{launch:true},8]]){
 player.pos.set(0,9,0);const feature={x:0,y:9,z:55,seed:7,pattern,...opt},e=build(feature);if(opt.displace)e.pos.set(19,25,55);
 const first=state(e,0),ranges={vx:[Infinity,-Infinity],vy:[Infinity,-Infinity],bank:[Infinity,-Infinity],pitch:[Infinity,-Infinity],yaw:[Infinity,-Infinity],engine:[Infinity,-Infinity]},history=[first];let selected=first,transition=null;
 const dt=1/120;
 for(let i=1;i<=duration/dt;i++){
  ctx.time=i*dt;player.pos.z=40*ctx.time;const was=e.launching;e.update(dt,ctx);const s=state(e,ctx.time);history.push(s);
  const values={vx:e.velocity.x,vy:e.velocity.y,bank:e.group.rotation.z,pitch:e.group.rotation.x,yaw:e.group.rotation.y,engine:e.engine.scale.x};
  for(const [k,v] of Object.entries(values)){ranges[k][0]=Math.min(ranges[k][0],v);ranges[k][1]=Math.max(ranges[k][1],v)}
  if((name!=='dive'||!s.peeling)&&Math.abs(s.rotation_xyz[2])>Math.abs(selected.rotation_xyz[2]))selected=s;
  if(was&&!e.launching)transition=s;
 }
 contexts[name]={feature,dt,duration,samples:history.length,ranges,selected_pose:selected,first,last:history.at(-1)};
 if(transition)contexts['carrier-transition']={selected_pose:transition,note:'Exact frame launching flips false; source early return retains launch bank/pulse this frame. Normal damp rates resume next frame.'};
 assert(ranges.engine[0]>=.9699&&ranges.engine[1]<=1.0651);
 if(opt.launch)assert(Math.max(...ranges.bank.map(Math.abs))<=1.10001);
 if(!opt.launch&&pattern!=='dive')assert(Math.abs(e.velocity.z-32.8)<1e-7);
}
assert(contexts['carrier-transition']);assert(contexts['orbit-displaced'].ranges.vx[0]<-40);
player.pos.set(0,9,0);player.alive=true;const fired=build({x:3,y:9,z:40,seed:3,pattern:'strafe'});fired.group.rotation={x:.16,y:.28,z:1.1};fired.fireTimer=-1;ctx.time=0;fired.update(1/120,ctx);assert.equal(shots.length,1);
const spawn=shots[0].slice(1,4),expected=[fired.pos.x,fired.pos.y,fired.pos.z+1.5],shotRotation=[fired.group.rotation.x,fired.group.rotation.y,fired.group.rotation.z];assert.deepEqual(spawn,expected);assert.deepEqual(muzzle[0][0],fired.pos.toArray());
assert.equal(fired.hit(1,ctx),false);player.alive=false;fired.update(1/120,ctx);assert(fired.flashMesh.visible);for(let i=0;i<30;i++)fired.update(1/120,ctx);assert(!fired.flashMesh.visible);assert.equal(fired.hit(1,ctx),true);
assert(source.includes('this.hp = fast ? 2 : 3;')&&source.includes('this.score = fast ? 320 : 250;')&&source.includes('this.radius = 2.2;'));
const report={method:'Evaluate exact Enemy/Flyer source class definitions; execute original Flyer.update and Enemy.update/hit/_aimAt. Initialize state matching constructor using original Rng/Utils. Minimal Vector3 operations supplied by harness; graphics/audio stubbed. No node_modules in workspace. Not a live game or GLTFLoader test.',source_sha256:crypto.createHash('sha256').update(source).digest('hex'),source_commit:'ee221ad3e05cd66292fe02b71b50f513696bdda2',initial:{hp:2,score:320,radius:2.2,drone_hp:3,drone_score:250},contexts,shot:{spawn,expected,muzzle:muzzle[0][0],sample_rotation_xyz:shotRotation,aim_origin:'root; original source lead unchanged',limitation:'Fixed world +Z shot offset does not follow rotating authored channel. Muzzle FX remain at root. Graphics mismatch measured in Blender verification.'},lifecycle:{hit_flash_on_off:true,hp_death:true,dispose:'Original Enemy.dispose/Dispose.js inspected; GPU disposal not exercised. Adapter must register per-instance material ownership and _importedRoot. Template textures live until shutdown.',detach:'N/A; keep existing explosions/wreck effects'},limitations:['Finite scenario sampling is not a universal bound.','Orbit restoring force has NO fixed velocity cap; displaced orbit is a stress sample only.','Carrier launch starts near x58; pose images recenter solely for inspection.','No live GPU, wing/carrier/boss collision or camera profiling.','No gameplay source edits.']};
fs.writeFileSync(path.join(OUT,'evidence/runtime-contract.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:'PASS',contexts:Object.keys(contexts),orbit:contexts['orbit-displaced'].ranges,launch:contexts['carrier-launch'].first,shot:report.shot},null,2));
