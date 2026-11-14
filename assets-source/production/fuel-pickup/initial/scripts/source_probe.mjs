import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { attachImportedFuel, releaseImportedFuel } from './adapter_recipe.mjs';

const work = path.resolve(import.meta.dirname, '..');
const installedThree = path.resolve(work, '../../../node_modules/three');
const threeRoot = process.env.THREE_ROOT ?? (fs.existsSync(installedThree) ? installedThree : path.resolve(work, '../../parked-fighter/.runtime/three'));
const THREE = await import(pathToFileURL(path.join(threeRoot, 'build/three.module.js')));
const { mergeGeometries } = await import(pathToFileURL(path.join(threeRoot, 'examples/jsm/utils/BufferGeometryUtils.js')));
const { GLTFLoader } = await import(pathToFileURL(path.join(threeRoot, 'examples/jsm/loaders/GLTFLoader.js')));
function saved(name) { return fs.readFileSync(path.join(work, 'source', name), 'utf8'); }
function load(name, exports, extras = {}) {
  const source = saved(name).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '').replaceAll('import.meta.env.BASE_URL', "'/'");
  return vm.runInNewContext(`${source}\n;({${exports.join(',')}})`, { THREE, mergeGeometries, Math, Map, Set, ...extras });
}
const utility = load('src__core__Utils.js', ['TAU', 'DEG', 'clamp', 'clamp01', 'damp', 'lerp', 'Rng', 'rand', 'noise1']);
function method(name, source, extras = {}) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  }', start) + 4;
  return vm.runInNewContext(`({${source.slice(start, end)}}).${name}`, { THREE, ...utility, ...extras });
}
const materialsSource = saved('src__render__Materials.js');
const mats = {
  _neon: new Map(), glow: new THREE.Texture(), track: material => material,
  enemyMetal: new THREE.MeshStandardMaterial({ color: 0x526579, metalness: .56, roughness: .38 }),
  enemyArmor: new THREE.MeshStandardMaterial({ color: 0x995c48, metalness: .48, roughness: .42 }),
};
mats.neon = method('neon', materialsSource);
mats.sprite = method('sprite', materialsSource);
const { Pickup } = load('src__entities__Pickup.js', ['Pickup'], utility);
const scene = new THREE.Scene();
const player = { pos: new THREE.Vector3(0, 6, 0), velocity: new THREE.Vector3(), radius: 1.5, alive: true, fuel: .2 };
const camera = new THREE.PerspectiveCamera();
camera.quaternion.setFromEuler(new THREE.Euler(.4, .3, -.2));
const pickup = new Pickup(scene, mats, 'fuel', 0, 6, 30);
assert.equal(pickup.kind, 'fuel'); assert.equal(pickup.def.label, 'FUEL');
assert.equal(pickup.color, 0xffd76a); assert.equal(pickup.score, 150); assert.equal(pickup.radius, 2.2);
assert.ok(pickup.phase >= 0 && pickup.phase < Math.PI * 2);
assert.equal(pickup.baseY, 6); assert.deepEqual(pickup.velocity.toArray(), [0, 0, 0]);
assert.equal(pickup.halo.material.opacity, .35); assert.equal(pickup.core.position.z, -.3); assert.equal(pickup.shape.position.z, .1);
assert.deepEqual(pickup.shape.scale.toArray(), [.82, .82, .25]);
player.refuel = method('refuel', saved('src__entities__Player.js'));
const refuelSamples = [];
for (const before of [0, .2, .8, .95, 1]) {
  player.fuel = before; player.refuel(.3);
  assert.equal(player.fuel, Math.min(1, before + .3));
  refuelSamples.push({ before, amount: .3, after: player.fuel });
}
player.fuel = .2;
const baseline = { visibleTriangles: 0, meshNodes: 3, materialPrimitives: 3, objects: {} };
const sourceMeshes = {};
function capture(root) {
  root.updateMatrixWorld(true);
  return root.children.filter(obj => obj.isMesh && obj.visible).map(obj => {
    const geometry = obj.geometry;
    const positions = geometry.getAttribute('position');
    const indices = geometry.index ? Array.from(geometry.index.array) : Array.from({ length: positions.count }, (_, index) => index);
    const triangles = indices.length / 3;
    return { name: obj.name, position: obj.position.toArray(), scale: obj.scale.toArray(),
      positions: Array.from(positions.array), indices, triangles,
      sourceColorLinear: obj.material.color.toArray(), sourceUnlit: !!obj.material.isMeshBasicMaterial };
  });
}
for (const kind of ['fuel', 'shield', 'spread', 'repair']) {
  const instance = new Pickup(scene, mats, kind, 0, 0, 0);
  for (const name of ['shell', 'core', 'shape']) instance[name].name = `source_${kind}_${name}`;
  sourceMeshes[kind] = capture(instance.group);
  instance.dispose();
}
const { Mine } = load('src__entities__Enemies.js', ['Mine'], { ...utility, CORRIDOR_HALF: 27, ALT_MIN: 2, ALT_MAX: 26 });
const mine = new Mine(mats, { x: 0, y: 0, z: 0, seed: 7 });
sourceMeshes.mine = capture(mine.group);
for (const [index, name] of ['shell', 'core', 'shape'].entries()) {
  baseline.objects[name] = { triangles: sourceMeshes.fuel[index].triangles };
  baseline.visibleTriangles += sourceMeshes.fuel[index].triangles;
}
const samples = [];
for (const phase of [0, Math.PI / 8, Math.PI / 4.4, Math.PI * 3 / 8, Math.PI * 3 / 4.4, 3, 10, 20, Math.PI * 2 / .3]) {
  pickup.phase = phase - 1 / 60; pickup.pos.set(0, 6, 30); pickup.shell.rotation.z = .3 * (phase - 1 / 60);
  pickup.update(1 / 60, { player, camera });
  assert.ok(pickup.group.quaternion.angleTo(camera.quaternion) < 1e-7);
  samples.push({ phase: pickup.phase, position: pickup.pos.toArray(), shellAngle: pickup.shell.rotation.z,
    shellScale: pickup.shell.scale.x, shapeAngle: pickup.shape.rotation.z, haloScale: pickup.halo.scale.x });
}
const magnets = [];
for (const alive of [true, false]) for (const distance of [0, 3.7, 11, 21.999, 22, 30]) {
  pickup.phase = 0; pickup.pos.set(0, 6, distance); player.alive = alive;
  pickup.update(1 / 60, { player, camera });
  magnets.push({ alive, distanceBefore: distance, after: pickup.pos.toArray(), dt: 1 / 60 });
  if (alive && distance < 22) assert.ok(Math.abs(pickup.pos.z - (distance - (distance ? (1 - distance / 22) ** 2 : 0))) < 1e-10);
  else assert.ok(Math.abs(pickup.pos.y - (6 + Math.sin(1 / 60 * 1.6) * .7)) < 1e-10);
}
player.alive = true;
pickup.dispose();
const calls = [];
const gameSource = saved('src__game__Game.js');
const game = { scene, materials: mats, player, enemies: [], pickups: [], kills: 4,
  fx: { pickup: (...args) => calls.push(['fx.pickup', ...args]) },
  hud: { floater: (...args) => calls.push(['hud.floater', ...args]) },
  award: (...args) => calls.push(['award', ...args]),
  engine: { postfx: { flash: (...args) => calls.push(['postfx.flash', ...args]) } } };
game._applyPickup = method('_applyPickup', gameSource, { audio: { pickup: (...args) => calls.push(['audio.pickup', ...args]) } });
game._dropPickup = method('_dropPickup', gameSource, { Pickup });
game._collideContact = method('_collideContact', gameSource);
const drop = game._dropPickup(new THREE.Vector3(0, -4, 3.700001), 'fuel');
assert.equal(drop.baseY, 3); drop.pos.y = player.pos.y;
game._collideContact({}); assert.equal(drop.alive, true);
drop.pos.z = 3.7; game._collideContact({}); assert.equal(drop.alive, false); assert.equal(player.fuel, .5);
assert.equal(calls.find(call => call[0] === 'award')[1], 150);
assert.deepEqual(Array.from(calls.find(call => call[0] === 'hud.floater').slice(2)), ['FUEL', '#ffd76a', 1.15]);
player.fuel = .95; game._applyPickup(drop, {}); assert.equal(player.fuel, 1);
const { FuelCell } = load('src__entities__Enemies.js', ['FuelCell'], { ...utility, buildImportedGround: () => true });
const tank = new FuelCell(mats, { x: 0, y: 0, z: 0, seed: 7 });
assert.equal(tank.hp, 1); assert.equal(tank.contactDamage, 1); assert.equal(tank.fuelValue, .16); assert.equal(tank.score, 100);
tank.kind = 'fuel';
const tankAudio = { fuelBoom() {}, panFor() { return 0; }, pickup() {} };
const tankGame = { player, kills: 0, chainMult: 1, level: { groundAt() { return 0; }, sectorAt() { return null; } },
  fx: { explosion() {} }, hud: { floater() {}, pulseDamage() {} }, engine: { hitStop() {}, input: { rumble() {} } },
  _killPayoff() {}, _bumpChain() {}, award() {}, _dropPickup() {}, _noteDamage() {}, _breakChain() {}, pickups: [] };
tankGame._killEnemy = method('_killEnemy', gameSource, { audio: tankAudio, GROUND_KINDS: new Set(), rand: { next: () => .9 } });
const tankRewards = [];
for (const reward of [true, false]) {
  player.fuel = .2; tank.alive = true; tankGame._killEnemy(tank, {}, reward);
  assert.equal(player.fuel, reward ? .36 : .2);
  tankRewards.push({ reward, before: .2, after: player.fuel });
}
let contactDamage = null;
player.damage = amount => { contactDamage = amount; return 'hull'; };
tank.alive = true; tank.hit = () => true; tank.pos.copy(player.pos); tank.pos.y -= tank.radius * .4;
tankGame.enemies = [tank]; tankGame._collideContact = method('_collideContact', gameSource);
player.fuel = .2; tankGame._collideContact({}); assert.equal(player.fuel, .2); assert.equal(contactDamage, 1);
player.fuel = .5;
const loopStart = gameSource.indexOf('    for (let i = this.pickups.length - 1; i >= 0; i--) {');
const loopEnd = gameSource.indexOf('\n\n    if (this.boss)', loopStart);
const updatePickups = vm.runInNewContext(`(function(dt,ctx){const p=this.player;${gameSource.slice(loopStart, loopEnd)}})`, {
  DESPAWN_BEHIND: 55, swapRemove: (array, index) => { array[index] = array[array.length - 1]; array.pop(); },
});
updatePickups.call(game, 0, { player, camera }); assert.equal(game.pickups.length, 0);
const behind = game._dropPickup(new THREE.Vector3(0, 6, -55.01), 'fuel');
updatePickups.call(game, 0, { player, camera }); assert.equal(behind.group.parent, null);
const effects = [];
method('pickup', saved('src__fx__Effects.js')).call({
  sparks: { burst: options => effects.push({ type: 'sparks', options }) },
  rings: { spawn: (position, options) => effects.push({ type: 'ring', position, options }) },
  lights: { flash: (...options) => effects.push({ type: 'light', options }) },
}, new THREE.Vector3(0, 6, 3.7), 0xffd76a);
assert.equal(effects[0].options.count, 20); assert.equal(effects[1].options.life, .42);
const { instantiate, templates } = load('src__render__ImportedModels.js', ['instantiate', 'templates']);
const { disposeModel } = load('src__render__Dispose.js', ['disposeModel']);
const glb = fs.readFileSync(path.join(work, 'asset/fuel-pickup.glb'));
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
templates.set('fuel-pickup', gltf.scene);
const observed = new Map();
function watch(resource) {
  if (!observed.has(resource)) { observed.set(resource, 0); resource.addEventListener('dispose', () => observed.set(resource, observed.get(resource) + 1)); }
}
gltf.scene.traverse(obj => { if (obj.isMesh) { watch(obj.geometry); watch(obj.material); } });
const sourceShell = mats.neon(0xffd76a, 1.15), sourceShape = mats.neon(0xffd76a, 1.35);
watch(sourceShell); watch(sourceShape);
watch(mats.glow);
for (const halo of mats._pickupHalos.values()) watch(halo);
const instances = [];
const timeline = [];
const replacedImportedMaterials = [];
for (let index = 0; index < 128; index++) {
  const instance = new Pickup(scene, mats, 'fuel', index % 16 * 5, 6, 30 + Math.floor(index / 16) * 7);
  const imported = instantiate('fuel-pickup');
  for (const name of ['shell', 'shape']) {
    const material = imported.getObjectByName(name).material;
    watch(material); replacedImportedMaterials.push(material);
  }
  attachImportedFuel(instance, imported, mats);
  instances.push(instance);
  assert.equal(instance.group.children.length, 2); assert.equal(imported.userData.modelOwnedMaterials.length, 3);
  assert.deepEqual(instance.shell.material.color.toArray(), sourceShell.color.toArray());
  assert.deepEqual(instance.shape.material.color.toArray(), sourceShape.color.toArray());
  assert.equal(instance.shell.material.vertexColors, true);
  assert.deepEqual(instance.shape.scale.toArray(), [1, 1, 1]);
  assert.equal(instance.halo.material, mats._pickupHalos.get(0xffd76a));
  for (const name of ['shell', 'core', 'shape']) { watch(instance[name].geometry); watch(instance[name].material); }
}
const moving = instances[0]; moving.phase = 0;
for (let frame = 0; frame <= 1440; frame++) {
  const dt = frame ? 1 / 60 : 0;
  moving.pos.set(0, 6, 30); moving.update(dt, { player, camera });
  assert.deepEqual(moving.shape.scale.toArray(), [1, 1, 1]);
  if (frame % 5 === 0) timeline.push({ seconds: frame / 60, phase: moving.phase, shellAngle: moving.shell.rotation.z,
    shellScale: moving.shell.scale.x, shapeAngle: moving.shape.rotation.z, haloScale: moving.halo.scale.x });
}
const firstGeometry = moving.shell.geometry;
releaseImportedFuel(moving, disposeModel); releaseImportedFuel(moving, disposeModel);
assert.equal(observed.get(firstGeometry), 1); assert.equal(observed.get(instances[1].shell.geometry), 0);
for (const instance of instances.slice(1)) releaseImportedFuel(instance, disposeModel);
for (const instance of instances) for (const name of ['shell', 'core', 'shape']) {
  assert.equal(observed.get(instance[name].geometry), 1); assert.equal(observed.get(instance[name].material), 1);
}
assert.equal(observed.get(sourceShell), 0); assert.equal(observed.get(sourceShape), 0);
assert.equal(observed.get(mats.glow), 0);
for (const halo of mats._pickupHalos.values()) assert.equal(observed.get(halo), 0);
for (const material of replacedImportedMaterials) assert.equal(observed.get(material), 1);
gltf.scene.traverse(obj => { if (obj.isMesh) { assert.equal(observed.get(obj.geometry), 0); assert.equal(observed.get(obj.material), 0); } });
assert.equal(scene.children.length, 0);
const rigsDefinition = saved('src__core__Settings.js').match(/const CAMERA_MODES = (\{[\s\S]*?\n\});/);
assert.ok(rigsDefinition);
const rigSettings = vm.runInNewContext(`(${rigsDefinition[1]})`);
let mode = 'classic';
const settings = { get: key => key === 'camera' ? mode : 1, get cameraRig() { return rigSettings[mode]; } };
const rigModule = load('src__game__CameraRig.js', ['CameraRig', '_desired', '_look'], { ...utility, settings });
const { FlightCamera } = load('src__core__FlightCamera.js', ['FlightCamera']);
const rigs = [];
for (mode of Object.keys(rigSettings)) {
  const flight = new FlightCamera(58, 16 / 9, .35, 1000);
  const rig = new rigModule.CameraRig(flight); rig.snap(player);
  const projectedBadges = [];
  for (const forward of [12, 50]) {
    const visual = gltf.scene.clone(true);
    visual.position.set(5, 6, forward); visual.quaternion.copy(flight.quaternion);
    visual.getObjectByName('shell').scale.setScalar(1 + Math.sin(.3926990817 * 4) * .025);
    visual.getObjectByName('shape').rotation.z = Math.sin(.3926990817 * 2.2) * .08;
    visual.updateMatrixWorld(true);
    const pixels = [];
    visual.traverse(obj => {
      if (!obj.isMesh) return;
      const positions = obj.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(obj.matrixWorld).project(flight);
        pixels.push([(point.x + 1) * 480, (1 - point.y) * 270]);
      }
    });
    projectedBadges.push({ worldPosition: [5, 6, forward], resolution: [960, 540],
      pixelBounds: [Math.min(...pixels.map(point => point[0])), Math.min(...pixels.map(point => point[1])),
                    Math.max(...pixels.map(point => point[0])), Math.max(...pixels.map(point => point[1]))] });
  }
  rigs.push({ mode, settings: rigSettings[mode], eye: rigModule._desired.toArray(), target: rigModule._look.toArray(),
    halfHeight: rig._halfHeight(), aspect: 16 / 9, quaternion: flight.quaternion.toArray(), projectionMatrix: flight.projectionMatrix.toArray(),
    projectedBadges, projectionMethod: 'Actual imported GLB vertices, source shell pulse/shape wobble and group billboard; actual FlightCamera/CameraRig.snap; Vector3.project; no halo in geometric bounds.' });
}
const report = { harness: 'Actual saved source classes/methods with actual Three.js 0.185.1, BufferGeometryUtils and GLTFLoader; VM replaces imports only. No browser, WebGL, audio, full Game or Engine.',
  baseline, sourceState: { color: '0xffd76a', label: 'FUEL', score: 150, radius: 2.2, playerRadius: 1.5,
    collectionCenterDistance: 3.7, fuelGranted: .3, fuelCap: 'clamp01(existing+.3)', staticShapeScale: { source: [.82,.82,.25], delivered: [1,1,1], bakedIntoVertices: true },
    despawnBehind: 55, timedLifetime: null, baseY: 6, velocity: [0, 0, 0], phaseInitialization: 'Actual Math.random()*TAU, unseeded. Controlled phase ONLY diagnostics.',
    shellNeon: sourceShell.color.toArray(), shapeNeon: sourceShape.color.toArray(), haloOpacity: .35, charge: 'N/A', detach: 'N/A except normal collected/cull dispose' },
  samples, timeline, magnets, rigs, refuelSamples, collectionCalls: calls, collectionEffects: effects,
  separateDestructibleTank: { actualFuelCellConstructor: true, importedVisualStubOnly: true, hp: tank.hp, contactDamage, fuelValue: tank.fuelValue,
    score: tank.score, actualKillEnemyRewardSamples: tankRewards, actualContactNoFuelReward: true,
    limitation: 'Imported tank visuals bypassed by explicit constructor import stub; tests execute actual Game reward/contact methods with FX/audio/input stubs. No live projectile simulation.' },
  collectionChecks: { aboveThresholdNotCollected: true, thresholdCollected: true, sourceFuelCapVerified: true, dropAltitudeFloor: 3, nextUpdateDetached: true, behind55Detached: true },
  ownership: { instances: 128, actualGlbParsed: true, geometryClones: 384, retainedMaterialClones: 384, shellShapeSourceGains: [1.15, 1.35],
    replacedImportedMaterialsDisposedOnce: 256, totalMaterialAllocations: 640,
    disposedExactlyOnce: true, neighborUnaffected: true, templateResourcesRetained: true, materialsOwnedNeonCacheRetained: true, haloCacheRetained: true,
    templateTexturePolicy: 'No asset textures. disposeModel does not dispose textures; existing halo glow remains externally owned.',
    limitation: 'Recipe tests only: production Pickup.dispose remains detach-only and MUST explicitly gain releaseImportedFuel behavior on integration.' },
};
fs.writeFileSync(path.join(work, 'evidence/source-meshes.json'), JSON.stringify(sourceMeshes));
fs.writeFileSync(path.join(work, 'evidence/source-contract.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baseline, sourceState: report.sourceState, collectionChecks: report.collectionChecks, ownership: report.ownership, rigs }, null, 2));
