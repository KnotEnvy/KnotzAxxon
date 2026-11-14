import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const asset = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findRepo=directory=>fs.existsSync(path.join(directory,'src/entities/Enemies.js'))?directory:path.dirname(directory)===directory?null:findRepo(path.dirname(directory));
const repo = process.env.PARKED_FIGHTER_REPO??findRepo(asset);
if(!repo)throw new Error('Set PARKED_FIGHTER_REPO to the unchanged source checkout.');
const threeFile = path.join(asset, '.runtime/three/build/three.module.js');
const THREE = await import(threeFile);
globalThis.localStorage = { getItem: () => '{}', setItem() {} };
globalThis.matchMedia = () => ({ matches: false });
Object.defineProperty(globalThis, 'navigator', { value: { hardwareConcurrency: 8, deviceMemory: 8 }, configurable: true });

function loadSource(relative) {
  return fs.readFileSync(path.join(repo, relative), 'utf8');
}
async function isolatedModule(relative, dependencies) {
  let text = loadSource(relative);
  for (const [specifier, replacement] of Object.entries(dependencies)) {
    text = text.replaceAll(`'${specifier}'`, `'${replacement}'`);
  }
  const output = path.join(asset, '.runtime', path.basename(relative));
  fs.writeFileSync(output, text);
  return import(output);
}
const threeURL = new URL(`file://${threeFile}`).href;
const utilURL = new URL(`file://${repo}/src/core/Utils.js`).href;
const geo = await isolatedModule('src/render/GeoUtils.js', { three: threeURL });
const utils = await import(utilURL);
const level = await import(`${repo}/src/world/Level.js`);
const mergeURL = new URL(`file://${asset}/.runtime/three/examples/jsm/utils/BufferGeometryUtils.js`).href;
const mergeText = fs.readFileSync(new URL(mergeURL), 'utf8').replaceAll("'three'", `'${threeURL}'`);
fs.writeFileSync(path.join(asset, '.runtime/Merge.js'), mergeText);
const merge = await import(path.join(asset, '.runtime/Merge.js'));
const enemies = loadSource('src/entities/Enemies.js');
const stripImports = text => text.replace(/^import .*;\n/gm, '');
const construction = stripImports(enemies)
  .replace(/export /g, '')
  .concat('\nreturn {ParkedFighter,disposeEnemyGeometry};');
let flybys = 0;
const audio = { flyby() { flybys++; }, panFor() { return 0; } };
const bindings = { THREE, mergeGeometries: merge.mergeGeometries, ...geo, ...utils,
  ...level, audio, SIDE: {}, buildImportedGround() { return false; }, disposeModel() {} };
const classes = new Function(...Object.keys(bindings), construction)(...Object.values(bindings));
const color = hex => new THREE.Color(hex);
const mats = {
  enemyArmor: new THREE.MeshStandardMaterial({ color: 0x995c48, metalness: .48, roughness: .42 }),
  enemyMetal: new THREE.MeshStandardMaterial({ color: 0x526579, metalness: .56, roughness: .38 }),
  neon(hex, intensity) { return new THREE.MeshBasicMaterial({ color: color(hex).multiplyScalar(intensity), toneMapped: false }); },
};
const make = seed => new classes.ParkedFighter(mats, { seed, x: 0, y: 0, z: 0 });
function bounds(group, includeHidden = false) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  group.traverse(node => {
    if (!node.isMesh || (!includeHidden && !node.visible)) return;
    const points = node.geometry.attributes.position;
    for (let index = 0; index < points.count; index++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(points, index).applyMatrix4(node.matrixWorld));
  });
  return { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() };
}
const model = make(1);
assert.equal(model.hp,1);
assert.equal(model.radius,2.4);
assert.equal(model.score,150);
assert.equal(model.lift,0);
assert.ok(model.velocity.isVector3);
assert.equal(model.flashMesh.scale.x,1.12);
model.group.rotation.y = 0;
const geometry = [];
let triangles = 0;
model.group.updateMatrixWorld(true);
model.group.traverse(node => {
  if (!node.isMesh || !node.visible) return;
  const positions = node.geometry.attributes.position;
  const indices = node.geometry.index ? [...node.geometry.index.array] : Array.from({length: positions.count}, (_, index) => index);
  triangles += indices.length / 3;
  geometry.push({ name: ['source_fuselage','source_gear_canopy','source_engine','source_beacon'][geometry.length],
    vertices: Array.from({length: positions.count}, (_,index) => new THREE.Vector3().fromBufferAttribute(positions,index).applyMatrix4(node.matrixWorld).toArray()),
    triangles: indices, material: geometry.length < 2 ? geometry.length : geometry.length,
  });
});
fs.writeFileSync(path.join(asset, 'source/procedural_reference.json'), JSON.stringify({ geometry, bounds: bounds(model.group) }));
const fortress=loadSource('src/world/Fortress.js');
const decorativeFunction=fortress.slice(fortress.indexOf('function parkedFighterParts()'),fortress.indexOf('/** Shared prop templates'));
const decorative=new Function('THREE','facetedHull',decorativeFunction+'\nreturn parkedFighterParts();')(THREE,geo.facetedHull);
const decorativeGroup=new THREE.Group();
for(const [kind,geometries] of Object.entries(decorative)) for(const geometry of geometries) decorativeGroup.add(new THREE.Mesh(geometry,kind==='hull'?mats.enemyArmor:mats.enemyMetal));
const decorativeGeometry=[];
decorativeGroup.traverse(node=>{
  if(!node.isMesh)return;
  const positions=node.geometry.attributes.position;
  decorativeGeometry.push({name:'decorative_'+decorativeGeometry.length,vertices:Array.from({length:positions.count},(_,index)=>new THREE.Vector3().fromBufferAttribute(positions,index).toArray()),triangles:node.geometry.index?[...node.geometry.index.array]:Array.from({length:positions.count},(_,index)=>index),material:node.material===mats.enemyArmor?0:1});
});
fs.writeFileSync(path.join(asset,'source/decorative_reference.json'),JSON.stringify({geometry:decorativeGeometry,bounds:bounds(decorativeGroup),note:'parkedFighterParts only. _parkedFighter overlays and hardstand paint are described in contract, not copied into new geometry. stamp uvScale=3 is NOT object scale.'}));
const seeds = Array.from({length: 100}, (_, index) => {
  const fighter = make(index + 1);
  const rng = new utils.Rng(index + 1);
  const scramble = rng.bool(.35), yaw = rng.range(-.2,.2);
  assert.equal(fighter.scramble, scramble);
  assert.equal(fighter.group.rotation.y, yaw);
  assert.equal(fighter.rng._s, rng._s);
  return {seed:index+1, scramble, yaw, rngState:fighter.rng._s, bounds:bounds(fighter.group)};
});
const staticSeed = seeds.find(entry=>!entry.scramble).seed;
const launchSeed = seeds.find(entry=>entry.scramble).seed;
function sample(label, fighter, dt, time, dz, speed=40) {
  const player = { pos:new THREE.Vector3(0, 6, fighter.pos.z - dz), speed };
  const before = { pos:fighter.pos.toArray(), lift:fighter.lift, pitch:fighter.group.rotation.x };
  fighter.update(dt,{ player,time });
  return { label, seed:fighter.feature.seed, scramble:fighter.scramble, dt, time, dzBefore:dz, speed, before,
    pos:fighter.pos.toArray(), lift:fighter.lift, velocity:fighter.velocity.toArray(), pitch:fighter.group.rotation.x,
    yaw:fighter.group.rotation.y, engineScale:fighter.engine.scale.x, beaconVisible:fighter.beacon.visible,
    bounds:bounds(fighter.group), rngState:fighter.rng._s };
}
const samples = [];
samples.push(sample('static_nonscramble_beacon_off', make(staticSeed), 1/60, 0, 50));
samples.push(sample('static_nonscramble_beacon_on', make(staticSeed), 1/60, Math.PI/10, 50));
samples.push(sample('approaching_spool_zero',make(launchSeed),1/60,0,100));
samples.push(sample('approaching_spool_half',make(launchSeed),1/60,0,75));
samples.push(sample('minimum_engine_pulse',make(launchSeed),0,Math.PI/6,55));
samples.push(sample('maximum_engine_pulse',make(launchSeed),0,Math.PI/18,55));
samples.push(sample('window_upper_exclusive',make(launchSeed),1/60,0,60));
const flight = make(launchSeed);
samples.push(sample('lift_first_frame', flight, 1/60, .2, 59));
for(let index=0;index<54;index++) sample('step',flight,1/60,.2+index/60,50);
samples.push(sample('lift_transition', flight,1/60,1.2,45));
for(let index=0;index<60;index++) sample('step',flight,1/60,1.2+index/60,30);
samples.push(sample('full_launch',flight,1/60,2.3,25));
for(let index=0;index<180;index++) sample('step',flight,1/60,2.3+index/60,0);
samples.push(sample('altitude_cap',flight,1/60,5.4,-10));
samples.push(sample('passing_outside_window',flight,1/60,5.5,-20));
assert.equal(samples.at(-2).pos[1],23);
assert.deepEqual(samples.at(-1).pos,samples.at(-1).before.pos);
assert.equal(samples.find(entry=>entry.label==='static_nonscramble_beacon_on').engineScale,.3);
assert.equal(samples.find(entry=>entry.label==='minimum_engine_pulse').engineScale,.995);
assert.equal(samples.find(entry=>entry.label==='maximum_engine_pulse').engineScale,1.045);
const stream = [];
const moving = make(launchSeed);
let playerZ = -100;
for (let index=0;index<420;index++) {
  const time=index/60, dz=moving.pos.z-playerZ;
  const state=sample('natural_player_approach',moving,1/60,time,dz);
  stream.push({...state, playerZ});
  playerZ += 40/60;
}
const density = [];
for(const loop of [0,1,3]) {
  let best = { count:0 };
  for(let seed=1;seed<=100;seed++) {
    const targets = new level.Level(seed,loop).features.filter(feature=>feature.kind==='parked');
    for (let left=0,right=0;left<targets.length;left++) {
      right=Math.max(right,left);
      while(right<targets.length && targets[right].z-targets[left].z<=355) right++;
      if(right-left>best.count) best={count:right-left,seed,loop,zStart:targets[left].z,zEnd:targets[right-1].z};
    }
  }
  density.push(best);
}
const settings = await isolatedModule('src/core/Settings.js', {'./Utils.js':utilURL});
const camera = await isolatedModule('src/core/FlightCamera.js', {three:threeURL});
const rigModule = await isolatedModule('src/game/CameraRig.js', {three:threeURL,'../core/Utils.js':utilURL,'../core/Settings.js':new URL(`file://${asset}/.runtime/Settings.js`).href});
const rigs = [];
for(const mode of ['classic','modern','chase']) {
  settings.settings.values.camera=mode;
  const flightCamera = new camera.FlightCamera(58,16/9,.1,500);
  const rig = new rigModule.CameraRig(flightCamera);
  rig.snap({pos:new THREE.Vector3(0,6,-28),velocity:new THREE.Vector3(),speed:40});
  rigs.push({mode,...settings.CAMERA_MODES[mode],eye:rig.position.toArray(),target:rig.lookAt.toArray(),classic:rig.classic,halfHeight:rig._halfHeight(),aspect:16/9,playerPos:[0,6,-28]});
}
const sourceFiles = ['src/entities/Enemies.js','src/world/Fortress.js','src/render/GeoUtils.js','src/render/ImportedModels.js','src/render/Dispose.js','src/game/CameraRig.js','src/core/FlightCamera.js','src/core/Settings.js','src/render/Sky.js','src/world/Level.js','src/core/Utils.js'];
const sourceHashes = Object.fromEntries(sourceFiles.map(file=>[file,crypto.createHash('sha256').update(loadSource(file)).digest('hex')]));
const excerpts=[
  ['src/entities/Enemies.js ParkedFighter',enemies.slice(enemies.indexOf('export class ParkedFighter'),enemies.indexOf('/* ------------------------------------------------------------------ */',enemies.indexOf('export class ParkedFighter')))],
  ['src/world/Fortress.js parkedFighterParts',decorativeFunction],
  ['src/world/Fortress.js _parkedFighter',fortress.slice(fortress.indexOf('  _parkedFighter('),fortress.indexOf('  _landingPad(',fortress.indexOf('  _parkedFighter(')))],
  ['src/game/CameraRig.js',loadSource('src/game/CameraRig.js')],
  ['src/core/FlightCamera.js',loadSource('src/core/FlightCamera.js')],
  ['src/core/Settings.js CAMERA_MODES',loadSource('src/core/Settings.js').match(/export const CAMERA_MODES = \{[\s\S]*?\n\};/)[0]],
  ['src/render/Sky.js dusk/source lights',loadSource('src/render/Sky.js').split('\n').filter(line=>/sunColor: 0xffbc86|keyDir:|ambient: 0x5a6f95|sunLight\.position|rimLight\.position|focus\.|d\.y \* 140/.test(line)).join('\n')],
];
fs.writeFileSync(path.join(asset,'source/source_excerpts.txt'),excerpts.map(([name,text])=>'===== '+name+' =====\n'+text).join('\n\n'));
const contract = { sourceCommit:'ee221ad3e05cd66292fe02b71b50f513696bdda2',sourceHashes,
  method:'Actual unmodified ParkedFighter source evaluated with repository Three.js version, only import bindings and browser/audio stubs supplied; source update executed. Audio call counted, not played.',
  baseline:{triangles,visiblePrimitives:geometry.length,unyawedBounds:bounds(model.group),hiddenFlashTriangles:model.flashMesh.geometry.attributes.position.count/3},
  seeds, yawExtremes:{min:seeds.reduce((current,candidate)=>current.yaw<candidate.yaw?current:candidate),max:seeds.reduce((current,candidate)=>current.yaw>candidate.yaw?current:candidate)},
  staticSeed,launchSeed,samples,naturalApproach:stream,flybyEvents:flybys,density:{window:355,seeds:[1,100],loops:[0,1,3],results:density,notLiveMaximum:true},
  rigs, axis:{up:'+Y',gameTravel:'+Z',aircraftNose:'-Z',engineAft:'+Z'},
  physics:{hp:1,radius:2.4,score:150,origin:[0,0,0],scrambleProbability:.35,ALT_MAX:25},
};
fs.writeFileSync(path.join(asset,'source/source_contract.json'),JSON.stringify(contract,null,2));
console.log(JSON.stringify({baseline:contract.baseline,launchSeed,staticSeed,density:contract.density,rigs,yawExtremes:contract.yawExtremes},null,2));
