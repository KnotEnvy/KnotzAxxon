import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { attachImportedSpread, releaseImportedSpread } from './adapter_recipe.mjs';

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
const player = { pos: new THREE.Vector3(0, 6, 0), velocity: new THREE.Vector3(), radius: 1.5, alive: true, spreadTimer: 0 };
const camera = new THREE.PerspectiveCamera();
camera.quaternion.setFromEuler(new THREE.Euler(.4, .3, -.2));
const pickup = new Pickup(scene, mats, 'spread', 0, 6, 30);
assert.equal(pickup.kind, 'spread'); assert.equal(pickup.def.label, 'SPREAD');
assert.equal(pickup.color, 0xffb43a); assert.equal(pickup.score, 250); assert.equal(pickup.radius, 2.2);
assert.ok(pickup.phase >= 0 && pickup.phase < Math.PI * 2);
assert.equal(pickup.baseY, 6); assert.deepEqual(pickup.velocity.toArray(), [0, 0, 0]);
assert.equal(pickup.halo.material.opacity, .35); assert.equal(pickup.core.position.z, -.3); assert.equal(pickup.shape.position.z, .1);
const timerStatement = saved('src__entities__Player.js').match(/this\.spreadTimer = Math\.max\(0, this\.spreadTimer - dt\);/)[0];
const tickTimer = vm.runInNewContext(`(function(dt){${timerStatement}})`);
const timerSamples = [];
for (const [before, dt] of [[14, 1 / 60], [.01, 1 / 60], [0, .1]]) {
  const state = { spreadTimer: before }; tickTimer.call(state, dt);
  assert.equal(state.spreadTimer, Math.max(0, before - dt));
  timerSamples.push({ before, dt, after: state.spreadTimer });
}
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
for (const kind of ['spread', 'shield', 'repair', 'fuel']) {
  const instance = new Pickup(scene, mats, kind, 0, 0, 0);
  for (const name of ['shell', 'core', 'shape']) instance[name].name = `source_${kind}_${name}`;
  sourceMeshes[kind] = capture(instance.group);
  instance.dispose();
}
const { Mine } = load('src__entities__Enemies.js', ['Mine'], { ...utility, CORRIDOR_HALF: 27, ALT_MIN: 2, ALT_MAX: 26 });
const mine = new Mine(mats, { x: 0, y: 0, z: 0, seed: 7 });
sourceMeshes.mine = capture(mine.group);
for (const [index, name] of ['shell', 'core', 'shape'].entries()) {
  baseline.objects[name] = { triangles: sourceMeshes.spread[index].triangles };
  baseline.visibleTriangles += sourceMeshes.spread[index].triangles;
}
const samples = [];
for (const phase of [0, Math.PI / 8, Math.PI / 4.4, Math.PI * 3 / 8, Math.PI * 3 / 4.4, 3, 10, 20]) {
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
player.grantSpread = method('grantSpread', saved('src__entities__Player.js'));
const game = { scene, materials: mats, player, enemies: [], pickups: [], kills: 4,
  fx: { pickup: (...args) => calls.push(['fx.pickup', ...args]) },
  hud: { floater: (...args) => calls.push(['hud.floater', ...args]) },
  award: (...args) => calls.push(['award', ...args]),
  engine: { postfx: { flash: (...args) => calls.push(['postfx.flash', ...args]) } } };
game._applyPickup = method('_applyPickup', gameSource, { audio: { pickup: (...args) => calls.push(['audio.pickup', ...args]) } });
game._dropPickup = method('_dropPickup', gameSource, { Pickup });
game._collideContact = method('_collideContact', gameSource);
const drop = game._dropPickup(new THREE.Vector3(0, -4, 3.700001), 'spread');
assert.equal(drop.baseY, 3); drop.pos.y = player.pos.y;
game._collideContact({}); assert.equal(drop.alive, true);
drop.pos.z = 3.7; game._collideContact({}); assert.equal(drop.alive, false); assert.equal(player.spreadTimer, 14);
player.spreadTimer = 20; player.grantSpread(14); assert.equal(player.spreadTimer, 20);
assert.equal(calls.find(call => call[0] === 'award')[1], 250);
assert.deepEqual(Array.from(calls.find(call => call[0] === 'hud.floater').slice(2)), ['SPREAD', '#ffb43a', 1.15]);
const loopStart = gameSource.indexOf('    for (let i = this.pickups.length - 1; i >= 0; i--) {');
const loopEnd = gameSource.indexOf('\n\n    if (this.boss)', loopStart);
const updatePickups = vm.runInNewContext(`(function(dt,ctx){const p=this.player;${gameSource.slice(loopStart, loopEnd)}})`, {
  DESPAWN_BEHIND: 55, swapRemove: (array, index) => { array[index] = array[array.length - 1]; array.pop(); },
});
updatePickups.call(game, 0, { player, camera }); assert.equal(game.pickups.length, 0);
const behind = game._dropPickup(new THREE.Vector3(0, 6, -55.01), 'spread');
updatePickups.call(game, 0, { player, camera }); assert.equal(behind.group.parent, null);
const effects = [];
method('pickup', saved('src__fx__Effects.js')).call({
  sparks: { burst: options => effects.push({ type: 'sparks', options }) },
  rings: { spawn: (position, options) => effects.push({ type: 'ring', position, options }) },
  lights: { flash: (...options) => effects.push({ type: 'light', options }) },
}, new THREE.Vector3(0, 6, 3.7), 0xffb43a);
assert.equal(effects[0].options.count, 20); assert.equal(effects[1].options.life, .42);
const { instantiate, templates } = load('src__render__ImportedModels.js', ['instantiate', 'templates']);
const { disposeModel } = load('src__render__Dispose.js', ['disposeModel']);
const glb = fs.readFileSync(path.join(work, 'asset/spread-pickup.glb'));
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
templates.set('spread-pickup', gltf.scene);
const observed = new Map();
function watch(resource) {
  if (!observed.has(resource)) { observed.set(resource, 0); resource.addEventListener('dispose', () => observed.set(resource, observed.get(resource) + 1)); }
}
gltf.scene.traverse(obj => { if (obj.isMesh) { watch(obj.geometry); watch(obj.material); } });
const sourceShell = mats.neon(0xffb43a, 1.15), sourceShape = mats.neon(0xffb43a, 1.35);
watch(sourceShell); watch(sourceShape);
watch(mats.glow);
for (const halo of mats._pickupHalos.values()) watch(halo);
const instances = [];
const timeline = [];
const replacedImportedMaterials = [];
for (let index = 0; index < 128; index++) {
  const instance = new Pickup(scene, mats, 'spread', index % 16 * 5, 6, 30 + Math.floor(index / 16) * 7);
  const imported = instantiate('spread-pickup');
  for (const name of ['shell', 'shape']) {
    const material = imported.getObjectByName(name).material;
    watch(material); replacedImportedMaterials.push(material);
  }
  attachImportedSpread(instance, imported, mats);
  instances.push(instance);
  assert.equal(instance.group.children.length, 2); assert.equal(imported.userData.modelOwnedMaterials.length, 3);
  assert.deepEqual(instance.shell.material.color.toArray(), sourceShell.color.toArray());
  assert.deepEqual(instance.shape.material.color.toArray(), sourceShape.color.toArray());
  assert.equal(instance.shell.material.vertexColors, true);
  assert.equal(instance.halo.material, mats._pickupHalos.get(0xffb43a));
  for (const name of ['shell', 'core', 'shape']) { watch(instance[name].geometry); watch(instance[name].material); }
}
const moving = instances[0]; moving.phase = 0;
for (let frame = 0; frame <= 1200; frame++) {
  const dt = frame ? 1 / 60 : 0;
  moving.pos.set(0, 6, 30); moving.update(dt, { player, camera });
  if (frame % 5 === 0) timeline.push({ seconds: frame / 60, phase: moving.phase, shellAngle: moving.shell.rotation.z,
    shellScale: moving.shell.scale.x, shapeAngle: moving.shape.rotation.z, haloScale: moving.halo.scale.x });
}
const firstGeometry = moving.shell.geometry;
releaseImportedSpread(moving, disposeModel); releaseImportedSpread(moving, disposeModel);
assert.equal(observed.get(firstGeometry), 1); assert.equal(observed.get(instances[1].shell.geometry), 0);
for (const instance of instances.slice(1)) releaseImportedSpread(instance, disposeModel);
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
  rigs.push({ mode, settings: rigSettings[mode], eye: rigModule._desired.toArray(), target: rigModule._look.toArray(),
    halfHeight: rig._halfHeight(), aspect: 16 / 9, quaternion: flight.quaternion.toArray(), projectionMatrix: flight.projectionMatrix.toArray() });
}
const report = { harness: 'Actual saved source classes/methods with actual Three.js 0.185.1, BufferGeometryUtils and GLTFLoader; VM replaces imports only. No browser, WebGL, audio, full Game or Engine.',
  baseline, sourceState: { color: '0xffb43a', label: 'SPREAD', score: 250, radius: 2.2, playerRadius: 1.5,
    collectionCenterDistance: 3.7, timerGranted: 14, timerStacking: 'max(existing,14)', timerDecay: 'max(0,timer-dt) unchanged source',
    despawnBehind: 55, timedLifetime: null, baseY: 6, velocity: [0, 0, 0], phaseInitialization: 'Actual Math.random()*TAU, unseeded. Controlled phase ONLY diagnostics.',
    shellNeon: sourceShell.color.toArray(), shapeNeon: sourceShape.color.toArray(), haloOpacity: .35, charge: 'N/A', detach: 'N/A except normal collected/cull dispose' },
  samples, timeline, magnets, rigs, timerSamples, collectionCalls: calls, collectionEffects: effects,
  collectionChecks: { aboveThresholdNotCollected: true, thresholdCollected: true, timerLongerNotShortened: true, dropAltitudeFloor: 3, nextUpdateDetached: true, behind55Detached: true },
  ownership: { instances: 128, actualGlbParsed: true, geometryClones: 384, retainedMaterialClones: 384, shellShapeSourceGains: [1.15, 1.35],
    replacedImportedMaterialsDisposedOnce: 256, totalMaterialAllocations: 640,
    disposedExactlyOnce: true, neighborUnaffected: true, templateResourcesRetained: true, materialsOwnedNeonCacheRetained: true, haloCacheRetained: true,
    templateTexturePolicy: 'No asset textures. disposeModel does not dispose textures; existing halo glow remains externally owned.',
    limitation: 'Recipe tests only: production Pickup.dispose remains detach-only and MUST explicitly gain releaseImportedSpread behavior on integration.' },
};
fs.writeFileSync(path.join(work, 'evidence/source-meshes.json'), JSON.stringify(sourceMeshes));
fs.writeFileSync(path.join(work, 'evidence/source-contract.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ baseline, sourceState: report.sourceState, collectionChecks: report.collectionChecks, ownership: report.ownership, rigs }, null, 2));
