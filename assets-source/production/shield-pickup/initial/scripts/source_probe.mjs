import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { attachImportedShield, releaseImportedShield } from './adapter_recipe.mjs';

const work = path.resolve(import.meta.dirname, '..');
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(other) { return this.set(other.x, other.y, other.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(other) { return this.set(this.x + other.x, this.y + other.y, this.z + other.z); }
  sub(other) { return this.set(this.x - other.x, this.y - other.y, this.z - other.z); }
  multiplyScalar(value) { return this.set(this.x * value, this.y * value, this.z * value); }
  normalize() { return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1)); }
  distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z); }
  addScaledVector(other, value) { return this.add(other.clone().multiplyScalar(value)); }
  applyAxisAngle(axis, angle) {
    assert.deepEqual([axis.x, axis.y, axis.z], [0, 1, 0]);
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    return this.set(this.x * cosine + this.z * sine, this.y, -this.x * sine + this.z * cosine);
  }
  toArray() { return [this.x, this.y, this.z]; }
}
class Quaternion {
  constructor() { Object.assign(this, { x: 0, y: 0, z: 0, w: 1 }); }
  copy(other) { Object.assign(this, other); return this; }
  toArray() { return [this.x, this.y, this.z, this.w]; }
}
class Group {
  constructor() {
    this.position = new Vector3(); this.scale = new Vector3(1, 1, 1);
    this.scale.setScalar = value => this.scale.set(value, value, value);
    this.rotation = { x: 0, y: 0, z: 0 }; this.quaternion = new Quaternion(); this.children = []; this.userData = {};
  }
  add(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  remove(child) { this.children = this.children.filter(value => value !== child); child.parent = null; }
  removeFromParent() { this.parent?.remove(this); }
  rotateZ(value) { this.rotation.z += value; }
  traverse(visitor) { visitor(this); for (const child of this.children) child.traverse(visitor); }
  getObjectByName(name) { let found; this.traverse(item => { if (!found && item.name === name) found = item; }); return found; }
  clone(recursive = true) {
    const result = this.isMesh ? new Mesh(this.geometry, this.material) : new Group();
    result.name = this.name; result.position.copy(this.position); result.scale.copy(this.scale);
    if (recursive) result.add(...this.children.map(child => child.clone(true)));
    return result;
  }
}
class Geometry {
  constructor(...parameters) { this.parameters = parameters; }
  rotateX() { return this; }
  clone() { return new Geometry(...this.parameters); }
  dispose() { this.disposed = true; this.disposeCalls = (this.disposeCalls ?? 0) + 1; }
}
class Mesh extends Group {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.isMesh = true; }
}
class Sprite extends Group { constructor(material) { super(); this.material = material; } }
const three = { Vector3, Quaternion, Group, Mesh, Sprite, TorusGeometry: Geometry, CylinderGeometry: Geometry };
const materialCache = new Map();
const mats = {
  enemyMetal: { external: true }, glow: { external: true },
  neon: (color, intensity) => {
    const key = `${color}:${intensity}`;
    if (!materialCache.has(key)) materialCache.set(key, { color, intensity, external: true });
    return materialCache.get(key);
  },
  sprite: (texture, color, options) => ({ texture, color, ...options, external: true }),
};
function loadSource(file, exports, extras = {}) {
  const source = fs.readFileSync(path.join(work, 'source', file), 'utf8')
    .replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '').replaceAll('import.meta.env.BASE_URL', "'/'");
  const context = vm.createContext({ THREE: three, Math, Map, Set, ...extras });
  return vm.runInContext(`${source}\n;({${exports.join(',')}})`, context);
}
const utility = loadSource('src__core__Utils.js', ['TAU', 'DEG', 'clamp', 'damp', 'lerp', 'noise1']);
const { Pickup } = loadSource('src__entities__Pickup.js', ['Pickup'], utility);
const scene = new Group();
const player = { pos: new Vector3(0, 6, 0), alive: true, velocity: new Vector3() };
const camera = { quaternion: new Quaternion() };
Object.assign(camera.quaternion, { x: .1, y: -.2, z: .3, w: Math.sqrt(.86) });
const pickup = new Pickup(scene, mats, 'shield', 0, 6, 30);
assert.equal(pickup.color, 0x45e0ff); assert.equal(pickup.score, 250); assert.equal(pickup.radius, 2.2);
assert.equal(pickup.def.label, 'SHIELD'); assert.equal(pickup.core.position.z, -.3); assert.equal(pickup.shape.position.z, .1);
const samples = [];
for (const phase of [0, Math.PI / 8, Math.PI / 2.2 / 2, Math.PI * 3 / 8, Math.PI * 3 / 2.2 / 2, 3, 10, 20]) {
  pickup.phase = phase - 1 / 60; pickup.pos.set(0, 6, 30); pickup.shell.rotation.z = 0;
  pickup.update(1 / 60, { player, camera });
  assert.deepEqual(pickup.group.quaternion.toArray(), camera.quaternion.toArray());
  samples.push({ phase: pickup.phase, position: pickup.pos.toArray(), shellAngle: pickup.shell.rotation.z,
    shellScale: pickup.shell.scale.x, shapeAngle: pickup.shape.rotation.z, haloScale: pickup.halo.scale.x });
}
const magnets = [];
for (const alive of [true, false]) for (const distance of [0, 3.7, 5, 11, 21.999, 22, 30]) {
  pickup.phase = 0; pickup.pos.set(0, 6, distance); player.alive = alive;
  pickup.update(1 / 60, { player, camera });
  magnets.push({ alive, distanceBefore: distance, after: pickup.pos.toArray(), dt: 1 / 60 });
  if (alive && distance < 22) assert.ok(Math.abs(pickup.pos.z - (distance - (distance ? (1 - distance / 22) ** 2 : 0))) < 1e-10);
}
player.alive = true;
const batch = Array.from({ length: 128 }, (_, index) => new Pickup(scene, mats, 'shield', index % 16 * 5, 6, 30 + Math.floor(index / 16) * 7));
const haloMaterial = batch[0].halo.material;
for (const instance of batch) { assert.equal(instance.halo.material, haloMaterial); instance.update(1 / 60, { player, camera }); instance.dispose(); }
pickup.dispose(); assert.equal(scene.children.length, 0); assert.equal(mats._pickupHalos.size, 1);
const gameSource = fs.readFileSync(path.join(work, 'source', 'src__game__Game.js'), 'utf8');
function method(name, source = gameSource, extras = {}) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`, { Math, Pickup, ...extras });
}
const calls = [];
player.radius = 1.5; player.shields = 1; player.shieldsMax = 3;
player.addShield = method('addShield', fs.readFileSync(path.join(work, 'source', 'src__entities__Player.js'), 'utf8'));
const contractGame = {
  scene, materials: mats, player, pickups: [], enemies: [],
  fx: { pickup: (...args) => calls.push(['fx.pickup', ...args]) },
  hud: { floater: (...args) => calls.push(['hud.floater', ...args]) },
  award: (...args) => calls.push(['award', ...args]), kills: 4,
  engine: { postfx: { flash: (...args) => calls.push(['postfx.flash', ...args]) } },
};
contractGame._applyPickup = method('_applyPickup', gameSource, { audio: { pickup: (...args) => calls.push(['audio.pickup', ...args]) } });
contractGame._dropPickup = method('_dropPickup');
contractGame._collideContact = method('_collideContact');
const drop = contractGame._dropPickup(new Vector3(0, -4, 3.700001), 'shield');
assert.equal(drop.baseY, 3);
drop.pos.y = player.pos.y;
contractGame._collideContact({}); assert.equal(drop.alive, true);
drop.pos.z = 3.7;
contractGame._collideContact({}); assert.equal(drop.alive, false); assert.equal(player.shields, 2);
assert.equal(calls.find(call => call[0] === 'award')[1], 250);
assert.deepEqual(calls.find(call => call[0] === 'hud.floater').slice(2), ['SHIELD', '#45e0ff', 1.15]);
const loopStart = gameSource.indexOf('    for (let i = this.pickups.length - 1; i >= 0; i--) {');
const loopEnd = gameSource.indexOf('\n\n    if (this.boss)', loopStart);
const updatePickups = vm.runInNewContext(`(function(dt,ctx){const p=this.player;${gameSource.slice(loopStart, loopEnd)}})`, {
  DESPAWN_BEHIND: 55, swapRemove: (array, index) => { array[index] = array[array.length - 1]; array.pop(); },
});
updatePickups.call(contractGame, 0, { player, camera });
assert.equal(contractGame.pickups.length, 0); assert.equal(scene.children.length, 0);
const behind = contractGame._dropPickup(new Vector3(0, 6, -55.01), 'shield');
updatePickups.call(contractGame, 0, { player, camera });
assert.equal(contractGame.pickups.length, 0); assert.equal(behind.group.parent, null);
const effectCalls = [];
const effectsSource = fs.readFileSync(path.join(work, 'source', 'src__fx__Effects.js'), 'utf8');
const effects = {
  sparks: { burst: parameters => effectCalls.push({ type: 'sparks', parameters }) },
  rings: { spawn: (position, parameters) => effectCalls.push({ type: 'ring', position, parameters }) },
  lights: { flash: (...parameters) => effectCalls.push({ type: 'light', parameters }) },
};
method('pickup', effectsSource).call(effects, new Vector3(0, 6, 3.7), 0x45e0ff);
assert.equal(effectCalls[0].parameters.count, 20); assert.equal(effectCalls[1].parameters.life, .42);
const updateRing = method('update', effectsSource.slice(effectsSource.indexOf('class RingField {')) , { THREE: three });
const ringSamples = [];
for (const age of [.01, .1, .2, .419, .42]) {
  const item = { life: .42, maxLife: .42, from: .5, to: 12, billboard: true, opacity: .85, spin: 0,
    mesh: new Group(), mat: { opacity: 0 } };
  item.mesh.visible = true;
  updateRing.call({ items: [item] }, age, camera);
  ringSamples.push({ age, visible: item.mesh.visible, spriteWidth: item.mesh.scale.x, opacity: item.mat.opacity });
}
const owned = loadSource('src__render__ImportedModels.js', ['instantiate', 'templates']);
const { disposeModel } = loadSource('src__render__Dispose.js', ['disposeModel']);
class Material {
  constructor(name) { this.name = name; this.toneMapped = true; this.disposeCalls = 0; this.templateTexture = { externallyOwned: true }; }
  clone() { const result = new Material(this.name); result.templateTexture = this.templateTexture; return result; }
  dispose() { this.disposeCalls++; }
}
const template = new Group(); template.name = 'shield_pickup_root';
for (const name of ['shell', 'core', 'shape']) {
  const mesh = new Mesh(new Geometry(), new Material(name)); mesh.name = name; template.add(mesh);
}
template.getObjectByName('core').position.z = -.3;
template.getObjectByName('shape').position.z = .1;
owned.templates.set('shield-pickup', template);
const importedInstances = [];
for (let index = 0; index < 128; index++) {
  const instance = new Pickup(scene, mats, 'shield', index % 16 * 5, 6, 30 + Math.floor(index / 16) * 7);
  const clone = owned.instantiate('shield-pickup');
  attachImportedShield(instance, clone);
  importedInstances.push(instance);
  assert.equal(instance.halo.material, haloMaterial); assert.equal(instance.group.children.length, 2);
  assert.equal(instance._importedRoot.userData.modelOwnedMaterials.length, 3);
  assert.equal(instance.shell.material.toneMapped, false); assert.equal(instance.shape.material.toneMapped, false);
  assert.notEqual(instance.shell.geometry, template.getObjectByName('shell').geometry);
  instance.update(1 / 60, { player, camera });
}
const neighbor = importedInstances[1];
const firstGeometry = importedInstances[0].shell.geometry, firstMaterial = importedInstances[0].shell.material;
releaseImportedShield(importedInstances[0], disposeModel);
assert.equal(firstGeometry.disposeCalls, 1); assert.equal(firstMaterial.disposeCalls, 1);
assert.equal(neighbor.shell.material.disposeCalls, 0); assert.equal(neighbor.shell.geometry.disposed, undefined);
for (const instance of importedInstances.slice(1)) releaseImportedShield(instance, disposeModel);
for (const node of template.children) { assert.equal(node.geometry.disposed, undefined); assert.equal(node.material.disposeCalls, 0); }
assert.equal(template.getObjectByName('shell').material.toneMapped, true);
assert.equal(scene.children.length, 0); assert.equal(mats._pickupHalos.size, 1);
const rigs = { classic: { yaw: 45, dist: 64, height: 45.255, fov: 52 }, modern: { yaw: 20, dist: 29, height: 14, fov: 58 }, chase: { yaw: 6, dist: 24, height: 9.5, fov: 66 } };
let mode = 'classic';
const settings = { get: key => key === 'camera' ? mode : 1, get cameraRig() { return rigs[mode]; } };
const rigModule = loadSource('src__game__CameraRig.js', ['CameraRig', '_desired', '_look'], { ...utility, settings });
const { CameraRig } = rigModule;
const rigSamples = [];
for (mode of Object.keys(rigs)) {
  const rig = new CameraRig({ aspect: 16 / 9 });
  rig._compute(player, 0, 0);
  rigSamples.push({ mode, settings: rigs[mode], eye: rigModule._desired.toArray(), target: rigModule._look.toArray(), halfHeight: rig._halfHeight(), aspect: 16 / 9,
    note: 'Eye and target read directly from actual CameraRig._compute; zero velocity, zero boost, no shake/lag.' });
}
const report = {
  harness: 'Actual unmodified saved Pickup.js class and CameraRig._compute executed in node vm with minimal local THREE math/scene test doubles, NOT Three.js/WebGL. Geometry constructors are parameter-recording stubs; renderer and actual integration not tested here.',
  baseline: { visibleTriangles: 456, meshNodes: 3, materialPrimitives: 3, shell: { parameters: [1.98, .065, 6, 32], triangles: 384 }, core: { parameters: [1.64, 1.64, .16, 6], triangles: 24 }, shape: { parameters: [1.55, .26, 4, 6], triangles: 48 } },
  sourceState: { color: '0x45e0ff', label: 'SHIELD', score: 250, radius: 2.2, playerRadius: 1.5, collectionCenterDistance: 3.7,
    despawnBehind: 55, timedLifetime: null, velocityRetained: pickup.velocity.toArray(), detach: 'N/A', charging: 'N/A; pulse only' },
  samples, magnets, rigs: rigSamples,
  denseProceduralBatch: { instances: 128, updates: 128, detached: 128, sharedHaloMaterials: mats._pickupHalos.size, maxLiveClaim: false },
  actualSourceGameMethods: { executed: ['Game._dropPickup', 'Game._collideContact', 'Game._applyPickup', 'Game.update pickup-loop fragment', 'Player.addShield'],
    floorBaseY: 3, collection: 'd=3.700001 not collected; d=3.7 collected', shieldIncrement: '1 -> 2', score: 250,
    hud: ['SHIELD', '#45e0ff', 1.15], fx: 'pickup(pos,0x45e0ff)', postfx: [.18, '0x45e0ff'],
    cull: 'next pickup update detaches collected item; dZ<-55 detaches alive item',
    limitations: 'No full Game/Engine/renderer, actual particle simulation or audio playback.' },
  collectionEffectContract: { effectCalls, ringSamples, executed: ['actual Effects.pickup', 'actual RingField.update with scene/math test doubles'],
    limitation: 'Effect spawn/timing math only; no particle pixels, real lights, postfx, HUD or audio reproduced in Blender context stills.' },
  importedAdapterOwnershipHarness: { instances: 128, geometryClones: 384, materialClones: 384,
    disposedOnce: true, neighborUnaffected: true, templatesRetained: true, haloRetained: true, templateTexturesRetained: true,
    executed: ['actual ImportedModels.instantiate', 'actual Dispose.disposeModel', 'delivered attachImportedShield/releaseImportedShield recipe'],
    limitations: 'Minimal THREE graph/material/geometry test doubles, not actual GLTFLoader/Three.js/GPU memory integration. Not an integrated production adapter. Recheck real dense batches/lifetime on receiver.' },
};
fs.writeFileSync(path.join(work, 'evidence', 'source-contract.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
