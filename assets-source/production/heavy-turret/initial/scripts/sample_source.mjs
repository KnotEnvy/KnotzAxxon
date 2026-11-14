// Execute the unchanged Enemy/Turret classes with a small CPU geometry/math harness.
// This is not a Three.js renderer. Primitive vertices follow the source constructors;
// normals/UVs are intentionally omitted. Source update/_shoot execute verbatim.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.resolve(here,'..');
const repo=process.env.KNOTZ_REPO ?? path.resolve(here,'../../../..');
const util=await import(path.join(repo,'src/core/Utils.js'));
util.rand.reset(0x48545631); // Stable predictive-spread fixture; gameplay RNG code is unchanged.
class V {
 constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} set(x,y,z){Object.assign(this,{x,y,z});return this;}
 copy(v){return this.set(v.x,v.y,v.z);} clone(){return new V(this.x,this.y,this.z);} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;}
 multiplyScalar(s){this.x*=s;this.y*=s;this.z*=s;return this;} setScalar(s){return this.set(s,s,s);} distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
 normalize(){return this.multiplyScalar(1/(Math.hypot(this.x,this.y,this.z)||1));}
 applyAxisAngle(axis,a){if(axis.y!==1)throw Error('only Y required'); const c=Math.cos(a),s=Math.sin(a),x=this.x;this.x=c*x+s*this.z;this.z=-s*x+c*this.z;return this;}
 toArray(){return [this.x,this.y,this.z];}
}
function rotate(p,a,t){const c=Math.cos(t),s=Math.sin(t),[x,y,z]=p;return a===0?[x,c*y-s*z,s*y+c*z]:a===1?[c*x+s*z,y,-s*x+c*z]:[c*x-s*y,s*x+c*y,z];}
class G {
 constructor(v=[],tri=0){this.v=v;this.tri=tri;this.index={};} translate(x,y,z){this.v=this.v.map(p=>[p[0]+x,p[1]+y,p[2]+z]);return this;}
 rotateX(t){this.v=this.v.map(p=>rotate(p,0,t));return this;} rotateY(t){this.v=this.v.map(p=>rotate(p,1,t));return this;} rotateZ(t){this.v=this.v.map(p=>rotate(p,2,t));return this;}
 scale(x,y,z){this.v=this.v.map(p=>[p[0]*x,p[1]*y,p[2]*z]);return this;} toNonIndexed(){return new G(this.v.map(p=>[...p]),this.tri);} dispose(){}
}
class Cylinder extends G{constructor(rt,rb,h,n){let v=[];for(const [r,y]of[[rt,h/2],[rb,-h/2]])for(let i=0;i<n;i++){let a=i/n*Math.PI*2;v.push([r*Math.sin(a),y,r*Math.cos(a)]);}v.push([0,h/2,0],[0,-h/2,0]);super(v,n*4);}}
class Box extends G{constructor(w,h,d){let v=[];for(let x of[-1,1])for(let y of[-1,1])for(let z of[-1,1])v.push([x*w/2,y*h/2,z*d/2]);super(v,12);}}
class Torus extends G{constructor(r,tube,n,m){let v=[];for(let j=0;j<n;j++)for(let i=0;i<m;i++){let a=i/m*Math.PI*2,b=j/n*Math.PI*2;v.push([(r+tube*Math.cos(b))*Math.cos(a),(r+tube*Math.cos(b))*Math.sin(a),tube*Math.sin(b)]);}super(v,n*m*2);}}
class Lathe extends G{constructor(points,n){let v=[];for(let i=0;i<=n;i++)for(let p of points){let a=i/n*Math.PI*2;v.push([p.x*Math.sin(a),p.y,p.x*Math.cos(a)]);}super(v,n*(points.length-1)*2);}}
class Sphere extends G{constructor(r,n,m){let v=[];for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){let a=i/n*Math.PI*2,b=j/m*Math.PI;v.push([-r*Math.cos(a)*Math.sin(b),r*Math.cos(b),r*Math.sin(a)*Math.sin(b)]);}super(v,2*n*(m-1));}}
class Group{constructor(){this.position=new V();this.rotation=new V();this.scale=new V(1,1,1);this.children=[];this.visible=true;}
 add(o){o.parent=this;this.children.push(o);} world(p){p=p.map((v,i)=>v*this.scale.toArray()[i]);p=rotate(rotate(rotate(p,2,this.rotation.z),1,this.rotation.y),0,this.rotation.x);p=p.map((v,i)=>v+this.position.toArray()[i]);return this.parent?this.parent.world(p):p;}
 getWorldPosition(v){return v.set(...this.world([0,0,0]));} updateMatrixWorld(){} }
class Mesh extends Group{constructor(g,m){super();this.geometry=g;this.material=m;}}
const THREE={Vector3:V,Vector2:V,Group,Mesh,CylinderGeometry:Cylinder,BoxGeometry:Box,TorusGeometry:Torus,LatheGeometry:Lathe,SphereGeometry:Sphere,MeshBasicMaterial:class{constructor(p){Object.assign(this,p);}}};
const enemies=fs.readFileSync(path.join(repo,'src/entities/Enemies.js'),'utf8');
const classText=enemies.slice(enemies.indexOf('const _v ='),enemies.indexOf('/* ------------------------------------------------------------------ */\n/* Missile silo')).replaceAll('export ','');
const context=vm.createContext({...util,THREE,Math,SIDE:{ENEMY:1},buildImportedGround:()=>false,disposeModel:()=>{},audio:{enemyShot(){},panFor(){return 0;}},mergeGeometries:a=>new G(a.flatMap(g=>g.v),a.reduce((n,g)=>n+g.tri,0))});
vm.runInContext(classText+'\nglobalThis.Turret=Turret;',context);
const metal={},armor={},mats={enemyMetal:metal,enemyArmor:armor,neon:c=>({color:c})};
const make=()=>new context.Turret(mats,{x:0,y:0,z:0,seed:1},true);
const base=make(),verts=[];let tris=0,meshes=0;
function visit(o){if(o.geometry&&o.visible){tris+=o.geometry.tri;meshes++;for(let p of o.geometry.v)verts.push(o.world(p));}for(let c of o.children)visit(c);}visit(base.group);
const bounds={min:[0,1,2].map(i=>Math.min(...verts.map(v=>v[i]))),max:[0,1,2].map(i=>Math.max(...verts.map(v=>v[i])))};
const samples=[],shots=[],paths=[];
let shotSink=null,activeTurret=null;
const player={pos:new V(0,11,-40),velocity:new V(),speed:40,alive:true};
const ctx={player,difficulty:.5,time:0,radarJammed:false,projectiles:{fire:(side,x,y,z,dx,dy,dz,speed,opts)=>{if(shotSink){const gun=activeTurret.barrels[shotSink.length%2],pivot=gun.world([0,0,0]),front=gun.world([0,0,1]),visualDirection=front.map((n,i)=>n-pivot[i]);const muzzle=pivot.map((n,i)=>n+visualDirection[i]*1.6);shotSink.push({time:ctx.time,origin:[x,y,z],direction:[dx,dy,dz],speed,opts,visualDirection,visualMuzzle:muzzle,originToVisualMuzzleDistance:Math.hypot(x-muzzle[0],y-muzzle[1],z-muzzle[2]),aimToVisualDegrees:Math.acos(Math.max(-1,Math.min(1,visualDirection[0]*dx+visualDirection[1]*dy+visualDirection[2]*dz)))*180/Math.PI});}}},fx:{muzzle(){} }};
function snapshot(t,label){return {label,time:ctx.time,player:player.pos.toArray(),yaw:t.turntable.rotation.y,pitchX:t.barrels[0].rotation.x,eyeScale:t.eye.scale.x,charging:t.fireTimer<.5,fireTimer:t.fireTimer,pivots:t.barrels.map(b=>b.getWorldPosition(new V()).toArray())};}
for(let x of[-32,-16,0,16,32])for(let y of[1.3,11,25])for(let z of[-74.999,-40,-5,-.001,.001,5,7.999]){let t=make();player.pos.set(x,y,z);for(let i=0;i<240;i++){ctx.time=i/60;t.update(1/60,ctx);}samples.push(snapshot(t,`settled_${x}_${y}_${z}`));}
// Elevated emplacements preserve the same root-local pivots. Use root-relative
// target heights (actual player altitude minus sampled rooftop height).
for(let x of[-30,0,30])for(let y of[-7.099,-3,1.3,16.6])for(let z of[-74.999,-5,-.001,.001,7.999]){let t=make();player.pos.set(x,y,z);for(let i=0;i<240;i++){ctx.time=i/60;t.update(1/60,ctx);}samples.push(snapshot(t,`rooftop_relative_${x}_${y}_${z}`));}
for(let mode of['low-center-pass','high-left-pass','lateral-cross','near-behind','predictive-extremes','rooftop-low-pass']){
 let t=make(),track=[],events=[];shotSink=events;activeTurret=t;
 for(let i=0;i<301;i++){ctx.time=i/60;let u=i/300;
  if(mode==='low-center-pass'){player.pos.set(0,1.3,-90+u*108);player.velocity.set(0,0,0);}
  if(mode==='high-left-pass'){player.pos.set(-16,25,-90+u*108);player.velocity.set(0,0,0);}
  if(mode==='lateral-cross'){player.pos.set(-16+32*u,1.3+23.7*Math.sin(u*Math.PI),-12+u*19);player.velocity.set(6.4,0,0);}
  if(mode==='near-behind'){player.pos.set(Math.sin(u*Math.PI*4)*2,1.3,-4+u*12);player.velocity.set(0,0,0);}
  if(mode==='predictive-extremes'){player.pos.set(Math.sin(u*Math.PI*4)*16,13+12*Math.sin(u*Math.PI*2),-74+u*81);player.velocity.set(u<.5?-27:27,u<.5?-19:19,0);}
  if(mode==='rooftop-low-pass'){player.pos.set(0,-7.099,-90+u*108);player.velocity.set(0,0,0);}
  t.update(1/60,ctx);if(i%3===0)track.push(snapshot(t,mode));
 }paths.push({mode,frames:track,shots:events});
}shotSink=null;
const timing=[];
for(let difficulty of[0,.5,1]){let t=make(),events=[];shotSink=events;activeTurret=t;ctx.difficulty=difficulty;player.pos.set(0,11,-40);player.velocity.set(0,0,0);for(let i=1;i<=360;i++){ctx.time=i/120;t.update(1/120,ctx);}timing.push({difficulty,shots:events});}shotSink=null;
const cameraText=fs.readFileSync(path.join(repo,'src/game/CameraRig.js'),'utf8').replace(/^import .*;$/mg,'').replace('export class CameraRig','class CameraRig');
const settingsText=fs.readFileSync(path.join(repo,'src/core/Settings.js'),'utf8');
const modes=vm.runInNewContext('('+settingsText.match(/export const CAMERA_MODES = (\{[\s\S]*?\n\});/)[1]+')');
const cameraSamples=[];
for(let mode of Object.keys(modes))for(let distance of[15,50,90]){
const settings={cameraRig:modes[mode],get:n=>n==='camera'?mode:1};
const c={position:new V(),up:new V(),aspect:16/9,lookAt(v){this.target=v.toArray();},setFlightProjection(classic,half){this.classic=classic;this.halfHeight=half;},updateMatrixWorld(){}};
const env=vm.createContext({...util,THREE,settings,Math});vm.runInContext(cameraText+'\nglobalThis.CameraRig=CameraRig',env);
player.pos.set(0,11,-distance);player.velocity.set(0,0,0);new env.CameraRig(c).snap(player);
cameraSamples.push({mode,distance,player:player.pos.toArray(),position:c.position.toArray(),target:c.target,classic:c.classic,halfHeight:c.halfHeight,fov:c.fov,aspect:c.aspect});}
const files=['src/entities/Enemies.js','src/core/Utils.js','src/game/CameraRig.js','src/core/Settings.js','src/core/FlightCamera.js','src/render/Sky.js','src/world/Level.js','src/entities/Player.js','src/render/ImportedModels.js','src/render/Dispose.js','src/render/Materials.js','src/render/PlayerShip.js'];
const hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,f))).digest('hex')]));
fs.mkdirSync(path.join(out,'source'),{recursive:true});for(let f of files)fs.copyFileSync(path.join(repo,f),path.join(out,'source',f.replaceAll('/','__')));
const result={method:'Unmodified Enemy/Turret constructor, update and _shoot executed in Node vm; minimal CPU primitive/math harness, not Three WebGL. Primitive triangle formulas match Three indexed constructors. Actual CameraRig.snap executed with a recording camera.',baseline:{triangles:tris,visibleMeshPrimitives:meshes,bounds},contract:{hp:base.hp,radius:base.radius,score:base.score,turntable:base.turntable.position.toArray(),barrels:base.barrels.map(b=>b.position.toArray()),eye:base.eye.position.toArray(),eyeColor:base.eye.material.color},settled:samples,trajectories:paths,timing,cameras:cameraSamples,sourceHashes:hashes};
fs.writeFileSync(path.join(out,'verification/source-samples.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({baseline:result.baseline,contract:result.contract,samples:samples.length,trajectoryFrames:paths.reduce((n,p)=>n+p.frames.length,0),cameras:cameraSamples.length,timing:timing.map(s=>({difficulty:s.difficulty,times:s.shots.filter((_,i)=>i%2===0).slice(0,3).map(s=>s.time)}))},null,2));
