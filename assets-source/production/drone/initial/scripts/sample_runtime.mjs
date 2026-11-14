// Runs the ACTUAL Flyer.update method body from current source with a minimal
// numeric vector/FX harness. No runtime behavior is reimplemented or edited.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), repo=path.resolve(here,'../../../..');
const src=fs.readFileSync(path.join(repo,'src/entities/Enemies.js'),'utf8');
const start=src.indexOf('  update(dt, ctx) {',src.indexOf('class Flyer extends Enemy'));
const end=src.indexOf('\n}\n\nexport class Drone',start);
const method=src.slice(start,end);
const aimStart=src.indexOf('  _aimAt(ctx, bulletSpeed) {');
const aimMethod=src.slice(aimStart,src.indexOf('\n  dispose() {',aimStart));
class V {
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}
 set(x,y,z){Object.assign(this,{x,y,z});return this;}
 copy(v){return this.set(v.x,v.y,v.z);}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
 addScaledVector(v,t){this.x+=v.x*t;this.y+=v.y*t;this.z+=v.z*t;return this;}
 distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
 normalize(){const d=Math.hypot(this.x,this.y,this.z)||1;this.x/=d;this.y/=d;this.z/=d;return this;}
 toArray(){return [this.x,this.y,this.z];}
}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t,damp=(a,b,k,t)=>lerp(a,b,1-Math.exp(-k*t)),clamp01=x=>clamp(x,0,1);
const vars={_v:new V(),_v2:new V(),_aim:new V(),rand:{gauss:()=>0},clamp,clamp01,lerp,damp,CORRIDOR_HALF:16,ALT_MIN:1.3,ALT_MAX:25,SIDE:{ENEMY:1},audio:{flyby(){},panFor(){return 0},enemyShot(){}}};
const Flyer = new Function(...Object.keys(vars),`class Base {update(){}}; return class SourceFlyer extends Base {${method}\n${aimMethod}}`)(...Object.values(vars));
const cases=[
 {name:'weave',pattern:'weave',x:0,y:10,z:60},
 {name:'strafe',pattern:'strafe',x:-16,y:8,z:70},
 {name:'orbit',pattern:'orbit',x:8,y:13,z:75,homeX:8,homeY:13},
 {name:'orbit_restore_stress',pattern:'orbit',x:19,y:25,z:75,homeX:-16,homeY:5},
 {name:'dive_and_committed_peel',pattern:'dive',x:-10,y:18,z:52},
 {name:'carrier_launch_transition',pattern:'orbit',x:58,y:3,z:60,homeX:-8,homeY:12,launch:true},
];
let all=[],summaries=[],shots=[];
for(const c of cases){
 const e=new Flyer();e.fast=false;e.pos=new V(c.x,c.y,c.z);e.velocity=new V();e.group={rotation:{x:0,y:0,z:0}};e.phase=0;e.pattern=c.pattern;e.homeX=c.homeX??c.x;e.homeY=c.homeY??c.y;e.launching=!!c.launch;e.peeling=false;e.peelDir=1;e.engine={scale:{v:1,setScalar(v){this.v=v}}};e.rng={range:(a,b)=>(a+b)/2};e.fireTimer=0;
 let rows=[];const ctx={time:0,difficulty:.6,radarJammed:false,player:{pos:new V(0,10,0),speed:40,alive:true,velocity:new V()},fx:{muzzle(){}},projectiles:{fire(...args){shots.push({case:c.name,args,root:e.pos.toArray(),euler:[e.group.rotation.x,e.group.rotation.y,e.group.rotation.z]})}}};
 for(let i=0;i<=900;i++){
  ctx.time=i/60;ctx.player.pos.z=40*ctx.time;
  const wasLaunch=e.launching;e.update(1/60,ctx);
  const row={case:c.name,t:ctx.time,pos:e.pos.toArray(),velocity:e.velocity.toArray(),euler_xyz:[e.group.rotation.x,e.group.rotation.y,e.group.rotation.z],engine_scale:e.engine.scale.v,launching:e.launching,was_launch:wasLaunch,peeling:e.peeling};rows.push(row);all.push(row);
 }
 const range=fn=>[Math.min(...rows.map(fn)),Math.max(...rows.map(fn))];
 summaries.push({case:c.name,initial:c,samples:rows.length,bank:range(r=>r.euler_xyz[2]),pitch:range(r=>r.euler_xyz[0]),yaw:range(r=>r.euler_xyz[1]),vx:range(r=>r.velocity[0]),vy:range(r=>r.velocity[1]),engine_scale:range(r=>r.engine_scale),transition_t:rows.find(r=>r.was_launch&&!r.launching)?.t??null});
}
const chosen={};
for(const c of cases){const rows=all.filter(r=>r.case===c.name);chosen[c.name+'_bank']=rows.reduce((a,b)=>Math.abs(a.euler_xyz[2])>Math.abs(b.euler_xyz[2])?a:b);chosen[c.name+'_pitch']=rows.reduce((a,b)=>Math.abs(a.euler_xyz[0])>Math.abs(b.euler_xyz[0])?a:b);if(c.launch){chosen.launch_initial=rows[8];chosen.launch_transition=rows.find(r=>r.was_launch&&!r.launching);}}
const report={methodology:'Exact source Flyer.update and Enemy._aimAt method bodies evaluated in numeric harness at 60Hz for 15s per case; Base housekeeping and audio/FX stubbed. Lead preserved; gaussian spread set to its deterministic zero mean and fire-timer RNG to midpoint. Explicit scenario positions/phase are fixtures. No browser or lifecycle integration. Orbit restore stress is a displaced-state probe, not a velocity cap or representative frequency.',source:'src/entities/Enemies.js',source_sha256:crypto.createHash('sha256').update(src).digest('hex'),method_sha256:crypto.createHash('sha256').update(method).digest('hex'),fast:false,hp:3,score:250,radius:2.2,dt:1/60,summaries,chosen,shots,source_method:method,source_aim_method:aimMethod,limitations:['No live frame time or actual population profiling','Does not simulate carrier geometry, boss, moving wings, HUD, bloom, shake, or camera lag','Extreme restoring-force transient depends on displacement; sampled ranges are not global mathematical limits','Carrier launch velocity property is stale by source behavior; record positions as authoritative during launch']};
fs.writeFileSync(path.join(here,'../evidence/reports/runtime_samples.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(here,'../evidence/reports/runtime_frames.json'),JSON.stringify(all)+'\n');
console.log(JSON.stringify(summaries,null,2));
