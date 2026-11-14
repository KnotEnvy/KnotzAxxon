// Executes the actual unmodified source methods without WebGL or Three installation.
// Geometry baseline counts are analytic for the source constructor parameters;
// this is explicitly not a Three.js loader/render proof.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const root=process.env.KX_REPO || process.cwd();
const out=process.argv[2] || path.join(root,'asset-work/mine/work/measurements');
fs.mkdirSync(out,{recursive:true});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const enemies=read('src/entities/Enemies.js');
const {Rng,clamp01,clamp,TAU}=await import(pathToFileURL(path.join(root,'src/core/Utils.js')));
const enemyText=enemies.slice(enemies.indexOf('class Enemy {'),enemies.indexOf('/* ------------------------------------------------------------------ */',enemies.indexOf('class Enemy {')));
const mineText=enemies.slice(enemies.indexOf('export class Mine'),enemies.indexOf('/* ------------------------------------------------------------------ */',enemies.indexOf('export class Mine'))).replace('export class','class');
const warnings=[];
const audio={mineArm:p=>warnings.push(p),panFor:(a,b)=>a-b};
const Enemy=new Function('clamp','rand','_aim',`${enemyText}; return Enemy;`)(clamp,{},{});
const Mine=new Function('Enemy','clamp01','audio',`${mineText}; return Mine;`)(Enemy,clamp01,audio);
function make(seed=1,y=9){return Object.assign(Object.create(Mine.prototype),{phase:new Rng(seed).next()*TAU,group:{rotation:{x:0,y:0,z:0}},pos:{x:0,y,z:0,distanceTo(p){return Math.hypot(this.x-p.x,this.y-p.y,this.z-p.z)}},lamp:{scale:{value:1,setScalar(v){this.value=v}}},hp:1,radius:1.9,score:80,flash:0,alive:true,armed:0});}
const samples=[];
for(const distance of [40,34,20,15.3,15.299,10,1.9,0]){
  const m=make(); const dt=1/60;
  // Compute player Y after the source bob, so the requested separation is exact.
  const nextY=m.pos.y+Math.sin((m.phase+dt)*1.3)*dt*1.6;
  m.update(dt,{time:.75,player:{pos:{x:0,y:nextY,z:distance}}});
  samples.push({distance,armed:m.armed,lampScale:m.lamp.scale.value,warned:!!m._warned,rotation:m.group.rotation,bobY:m.pos.y});
}
const trajectories=[];
for(const fps of [30,60,120]){
 const m=make(); const points=[];
 for(let frame=1;frame<=fps*16;frame++){
   const t=frame/fps; const distance=40*(.5+.5*Math.cos(t*Math.PI/8));
   m.update(1/fps,{time:t,player:{pos:{x:0,y:m.pos.y,z:distance}}});
   if(frame%fps===0)points.push({t,pos:[m.pos.x,m.pos.y,m.pos.z],rotation:[m.group.rotation.x,m.group.rotation.y,0],scale:m.lamp.scale.value,armed:m.armed});
 }
 trajectories.push({fps,points});
}
const once=make();const initialWarnings=warnings.length;
for(let i=1;i<=300;i++)once.update(1/60,{time:i/60,player:{pos:{x:0,y:once.pos.y,z:5}}});
if(warnings.length-initialWarnings!==1)throw Error('one-time warning regression');
const baseline={method:'Analytic topology counts and transformed envelope from exact constructor parameters, no Three installation available',visible:{core:20,contacts:6*(5+5+4*10*2),lamp:4*20*2+6*(8*(6-1)*2)},hidden:20,visiblePrimitives:3,restBounds:{min:[-1.85,-1.85,-1.85],max:[1.85,1.85,1.85]},notes:['Cone sides omit degenerate apex triangle; 5 sides + 5 base cap triangles each.','Each torus: radialSegments*tubularSegments*2. Sphere: widthSegments*(heightSegments-1)*2.','Source Object3D.lookAt maps local +Z contacts to six signed axes.']};
baseline.visible.total=baseline.visible.core+baseline.visible.contacts+baseline.visible.lamp;
if(baseline.visible.total!==1200)throw Error('baseline count');
const settings=read('src/core/Settings.js');const modes=new Function(`return (${settings.match(/export const CAMERA_MODES = (\{[\s\S]*?\n\});/)[1]});`)();
class V {constructor(x=0,y=0,z=0){this.set(x,y,z)}set(x,y,z){Object.assign(this,{x,y,z});return this}copy(v){return this.set(v.x,v.y,v.z)}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this}applyAxisAngle(up,a){const x=this.x,z=this.z;this.x=x*Math.cos(a)+z*Math.sin(a);this.z=-x*Math.sin(a)+z*Math.cos(a);return this}array(){return[this.x,this.y,this.z]}}
const rigText=read('src/game/CameraRig.js');const compute=rigText.slice(rigText.indexOf('  _compute('),rigText.indexOf('  /**',rigText.indexOf('  _compute(')));
const _off=new V(),_desired=new V(),_look=new V();
const computeFn=new Function('_off','_desired','_look','_up','clamp',`return ({${compute}})._compute;`)(_off,_desired,_look,new V(0,1,0),clamp);
const cameraSamples=[];
for(const [mode,settings] of Object.entries(modes))for(const altitude of [3,9,22]){
 const rig={...settings,yaw:settings.yaw*Math.PI/180,extraDist:0,classic:mode==='classic'};
 const player={pos:new V(0,altitude,0),velocity:new V()};computeFn.call(rig,player,0,0);
 cameraSamples.push({mode,altitude,position:_desired.array(),target:_look.array(),fov:settings.fov,aspect:16/9,orthographic:rig.classic,halfHeight:Math.max(40,60/(16/9))});
}
const {Level}=await import(pathToFileURL(path.join(root,'src/world/Level.js')));
let density={peak:0};
for(let seed=1;seed<=100;seed++)for(const loop of [0,1,3]){
 const level=new Level(seed,loop); const mines=level.features.filter(f=>f.kind==='mine').sort((a,b)=>a.z-b.z);
 let lo=0;for(let hi=0;hi<mines.length;hi++){while(mines[hi].z-mines[lo].z>355)lo++;if(hi-lo+1>density.peak)density={peak:hi-lo+1,seed,loop,zStart:mines[lo].z,zEnd:mines[hi].z};}
}
const files=['src/entities/Enemies.js','src/core/Utils.js','src/core/Settings.js','src/core/FlightCamera.js','src/game/CameraRig.js','src/render/Sky.js','src/render/ImportedModels.js','src/render/Dispose.js','src/game/Game.js','src/world/Level.js'];
const report={sourceCommit:'ee221ad3e05cd66292fe02b71b50f513696bdda2',method:'Actual Mine.update / Enemy.update and CameraRig._compute executed by Function; constructors bypassed, vector/audio stubs only. Actual Level and Rng imported. No adapter or live gameplay.',sourceHashes:Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')])),contract:{hp:1,radius:1.9,score:80,rootEulerOrder:'XYZ',angularRate:[.5,.7,0],phaseRate:1,bob:'pos.y += sin(phase*1.3)*dt*1.6; integrated increment, not absolute offset',lampScaleBound:[.94,1.06],lampPivot:[0,0,0],lampColor:'0xff3d55',neonIntensity:3.2,warning:'once when near>0.55; exact boundary d<15.3',brightness:'constant; proximity changes scale and frequency only',weapon:'N/A',detach:'N/A',lifecycle:'Game._killEnemy ordinary 1.0 explosion; mine excluded from GROUND_KINDS so no burning ground wreck'},baseline,proximitySamples:samples,trajectories,oneTimeWarningVerified:true,cameraSamples,density:{...density,window:355,seeds:'1..100',loops:[0,1,3],meaning:'layout density proxy, NOT live maximum'}};
fs.writeFileSync(path.join(out,'source-contract.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'source-excerpts.txt'),files.map(p=>`FILE ${p}\nSHA256 ${report.sourceHashes[p]}\n`).join('\n')+'\n'+mineText+'\n'+enemyText+'\n'+compute+'\n'+settings.match(/export const CAMERA_MODES = [\s\S]*?\n\};/)[0]);
console.log(JSON.stringify({baseline,density,cameraSamples:cameraSamples.length,samples:samples.length}));
