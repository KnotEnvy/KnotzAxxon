/**
 * World resource retirement under failure.
 *
 * Every case runs the shipped world source on real inputs (the 175-part
 * environment kit file, a streamed seeded level) and injects one fault: a
 * resource whose `dispose` event handler throws once, which is how a renderer
 * that fails while releasing a buffer or program surfaces. The contract is
 * the application's `runCleanups` one: ownership is given up before anything
 * is attempted, every remaining unique resource is still attempted exactly
 * once, the failure is reported, and a repeat finds nothing left to revisit.
 * Borrowed materials are never disposed by the streamer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Fortress, disposeFortressTemplates } from '../src/world/Fortress.js';
import { Level, CHUNK_LEN } from '../src/world/Level.js';
import {
  prepareEnvironmentKit, loadEnvironmentKit, disposeEnvironmentKit, environmentKitReady, environmentKitParts, ENVIRONMENT_KIT_SIGNATURE,
} from '../src/world/EnvironmentKit.js';
import { disposeAmbientTraffic } from '../src/world/AmbientTraffic.js';
import { stubMaterials } from './fixtures/chunk-digest.js';

const kitBytes = readFileSync(new URL('../public/models/environment/environment-kit.glb', import.meta.url));
const parseKit = () => new Promise((ok, fail) => new GLTFLoader().parse(kitBytes.buffer.slice(kitBytes.byteOffset, kitBytes.byteOffset + kitBytes.byteLength), '', ok, fail));

/** Count dispose attempts per resource; `faulty` throws on its first attempt only. */
function watch(resources, faulty = null) {
  const attempts = new Map();
  for (const r of resources) {
    attempts.set(r, 0);
    r.addEventListener('dispose', () => attempts.set(r, attempts.get(r) + 1));
  }
  let armed = !!faulty;
  faulty?.addEventListener('dispose', () => { if (armed) { armed = false; throw new Error('injected disposal fault'); } });
  return { attempts, counts: () => [...attempts.values()], once: () => [...attempts.values()].every(n => n === 1) };
}
const quiet = (fn) => { try { fn(); } catch { /* leave the next case a clean slate */ } };
const failures = (error) => error instanceof AggregateError ? error.errors.flatMap(failures) : [error];
const injected = (error) => failures(error).filter(e => e.message === 'injected disposal fault').length;

const inputsOf = (gltf) => {
  const geometries = new Set(), materials = new Set(), meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) { meshes.push(o); geometries.add(o.geometry); for (const m of [].concat(o.material ?? [])) materials.add(m); } });
  return { geometries: [...geometries], materials: [...materials], meshes };
};

const materials = stubMaterials(THREE);
const fortressFor = (seed = 7) => {
  const level = new Level(seed, 0), scene = new THREE.Scene();
  return { level, scene, fortress: new Fortress(scene, materials, level, { drawDistance: 560 }) };
};
const geometriesOf = (group) => { const set = new Set(); group.traverse(o => { if (o.isMesh) set.add(o.geometry); }); return [...set]; };
/** A chunk that owns an animated gate, a retired-barrier record and ambience emitters. */
function busyChunk(fortress, level) {
  for (const f of level.features) {
    if (f.kind !== 'gate') continue;
    const index = Math.floor(f.z / CHUNK_LEN), group = fortress._buildChunk(index);
    fortress.chunks.set(index, group);
    const owns = (list) => list.filter(o => o.owner === group).length;
    if (owns(fortress.animated) && owns(fortress.rearObstacles) && owns(fortress.emitters)) return { index, group, owns };
    fortress.clear();
  }
  throw new Error('no chunk with a gate, a barrier record and emitters in this level');
}

test('environment kit shutdown gives up all 175 templates before any disposer runs', async () => {
  quiet(disposeEnvironmentKit);
  assert.equal(prepareEnvironmentKit(await parseKit()), true);
  const parts = [...environmentKitParts().values()];
  assert.equal(parts.length, ENVIRONMENT_KIT_SIGNATURE[0]);
  const w = watch(parts, parts[0]);

  assert.throws(() => disposeEnvironmentKit(), (e) => injected(e) === 1, 'the failure is reported');
  assert.equal(environmentKitParts().size, 0, 'the cache no longer owns a released template');
  assert.equal(environmentKitReady(), false);
  assert.equal(w.counts().filter(n => n === 1).length, 175, 'every template attempted exactly once');

  disposeEnvironmentKit();
  assert.ok(w.once(), 'a repeat revisits nothing');
});

test('a malformed kit part keeps its own error while every loader resource and partial template is released', async () => {
  quiet(disposeEnvironmentKit);
  const gltf = await parseKit(), input = inputsOf(gltf);
  assert.ok(input.geometries.length >= 175 && input.materials.length > 0);
  // the 61st part is malformed, so sixty templates were already cloned when it is found
  const bad = input.meshes.filter(o => o.name.includes('__'))[60];
  delete bad.userData.rs_bucket;
  const clones = [];
  for (const g of input.geometries) {
    const clone = g.clone.bind(g);
    g.clone = () => { const c = clone(); clones.push(c); return c; };
  }
  // both a loader-owned geometry and the first partial template fail to release
  const loaderOwned = watch([...input.geometries, ...input.materials], input.geometries[0]);
  let cloneFault = true;
  const first = input.geometries.find(g => g === input.meshes.filter(o => o.name.includes('__'))[0].geometry);
  const firstClone = first.clone;
  first.clone = () => { const c = firstClone(); c.addEventListener('dispose', () => { if (cloneFault) { cloneFault = false; throw new Error('injected disposal fault'); } }); return c; };

  assert.throws(() => prepareEnvironmentKit(gltf), (e) => !(e instanceof AggregateError) && e.message === `Environment kit node ${bad.name} carries no bucket`,
    'the preparation error is not masked by a cleanup failure');
  assert.equal(clones.length, 60);
  const cloneWatch = watch(clones);
  assert.ok(loaderOwned.once(), 'every loader geometry and material attempted exactly once');
  assert.equal(gltf.scene.children.length, 0, 'the loader scene is emptied');
  assert.equal(environmentKitParts().size, 0);
  assert.equal(environmentKitReady(), false);
  // the partial templates were already released: a later shutdown has nothing of theirs to visit
  disposeEnvironmentKit();
  assert.ok(cloneWatch.counts().every(n => n === 0), 'partial templates are not owned after the failure');
  assert.equal(cloneFault, false, 'the partial templates were attempted during the failure');
});

test('a loader resource that fails to release cannot stop the game loading or strand the rest', async () => {
  quiet(disposeEnvironmentKit);
  const gltf = await parseKit(), input = inputsOf(gltf);
  const w = watch([...input.geometries, ...input.materials], input.geometries[0]);
  const warn = console.warn; console.warn = () => {};
  let accepted;
  try { accepted = await loadEnvironmentKit({ loadAsync: async () => gltf }, ''); } finally { console.warn = warn; }
  assert.equal(accepted, false, 'the failure is contained: procedural architecture, no rejected load');
  assert.ok(w.once(), 'every loader geometry and material attempted exactly once');
  assert.equal(gltf.scene.children.length, 0);
  assert.equal(environmentKitParts().size, 0);
  assert.equal(environmentKitReady(), false);

  // called directly, the same fault is reported and the accepted kit stays owned and whole
  const again = await parseKit(), second = inputsOf(again);
  const w2 = watch([...second.geometries, ...second.materials], second.geometries[0]);
  assert.throws(() => prepareEnvironmentKit(again), (e) => injected(e) === 1);
  assert.ok(w2.once());
  assert.equal(again.scene.children.length, 0);
  assert.equal(environmentKitParts().size, 175);
  assert.equal(environmentKitReady(), true);
  const templates = watch([...environmentKitParts().values()]);
  disposeEnvironmentKit();
  assert.ok(templates.once());
});

test('a stale kit that fails to release cannot strand the replacement file', async () => {
  quiet(disposeEnvironmentKit);
  assert.equal(prepareEnvironmentKit(await parseKit()), true);
  const stale = [...environmentKitParts().values()], staleWatch = watch(stale, stale[0]);
  const gltf = await parseKit(), input = inputsOf(gltf);
  const w = watch([...input.geometries, ...input.materials]);

  assert.throws(() => prepareEnvironmentKit(gltf), (e) => injected(e) === 1, 'the stale kit failure is reported');
  assert.ok(staleWatch.once(), 'all 175 stale templates attempted exactly once');
  assert.ok(w.once(), 'the replacement file\'s loader resources are still released');
  assert.equal(gltf.scene.children.length, 0);
  assert.equal(environmentKitParts().size, 0);
  assert.equal(environmentKitReady(), false);
});

test('a chunk whose first geometry fails to release still leaves the scene and every owner list', () => {
  quiet(disposeFortressTemplates);
  const { level, fortress } = fortressFor();
  const { group, owns } = busyChunk(fortress, level);
  const geometries = geometriesOf(group);
  assert.ok(geometries.length >= 4);
  const w = watch(geometries, geometries[0]);
  const borrowed = watch(Object.values(materials).filter(m => m.isMaterial));
  assert.equal(group.parent, fortress.root);

  assert.throws(() => fortress._disposeChunk(group), (e) => injected(e) === 1);
  assert.ok(w.once(), 'every unique chunk geometry attempted exactly once');
  assert.equal(group.parent, null, 'the picture left the scene');
  assert.equal(owns(fortress.animated) + owns(fortress.rearObstacles) + owns(fortress.emitters), 0, 'no owner record survives');
  assert.ok(borrowed.counts().every(n => n === 0), 'shared materials are borrowed, never disposed');
  quiet(() => fortress.clear()); quiet(disposeFortressTemplates);
});

test('clearing a level retires every chunk and detaches traffic although one chunk fails', () => {
  quiet(disposeFortressTemplates);
  const { fortress, scene } = fortressFor();
  for (let frame = 1; frame <= 6; frame++) fortress.update(0, 1 / 60, frame / 60, frame);
  const groups = [...fortress.chunks.values()];
  assert.ok(groups.length >= 5);
  const all = groups.flatMap(geometriesOf);
  const w = watch(all, geometriesOf(groups[0])[0]);
  fortress.buildQueue.push(99);
  assert.equal(fortress.traffic.mesh.parent, scene);

  assert.throws(() => fortress.clear(), (e) => injected(e) === 1);
  assert.ok(w.once(), `all ${all.length} geometries of ${groups.length} chunks attempted exactly once`);
  assert.equal(fortress.chunks.size, 0);
  assert.equal(fortress.root.children.length, 0);
  assert.equal(fortress.buildQueue.length + fortress.animated.length + fortress.rearObstacles.length + fortress.emitters.length, 0);
  assert.equal(fortress.traffic.mesh.parent, null, 'traffic is detached');

  fortress.clear();
  assert.ok(w.once(), 'a repeat revisits nothing');
  quiet(disposeFortressTemplates);
});

test('streaming past a chunk that fails to release never keeps it or strands its neighbours', () => {
  quiet(disposeFortressTemplates);
  const { fortress } = fortressFor();
  for (let frame = 1; frame <= 6; frame++) fortress.update(0, 1 / 60, frame / 60, frame);
  const groups = [...fortress.chunks.values()];
  const all = groups.flatMap(geometriesOf);
  const w = watch(all, geometriesOf(groups[0])[0]);

  assert.throws(() => fortress.update(4000, 1 / 60, 1, 100), (e) => injected(e) === 1);
  assert.ok(![...fortress.chunks.values()].some(g => groups.includes(g)), 'no retired chunk is still owned');
  assert.ok(groups.every(g => g.parent === null));
  assert.ok(w.once(), 'every retired geometry attempted exactly once');

  fortress.update(4000, 1 / 60, 1.1, 101);
  assert.ok(w.once(), 'the next frame revisits nothing');
  quiet(() => fortress.clear()); quiet(disposeFortressTemplates);
});

test('template shutdown reaches every prop cache and the traffic program although the first fails', () => {
  quiet(disposeFortressTemplates);
  const { fortress } = fortressFor();
  for (let frame = 1; frame <= 8; frame++) fortress.update(0, 1 / 60, frame / 60, frame);
  const { geometry, material } = fortress.traffic.mesh;
  fortress.clear();
  const traffic = watch([geometry, material]);

  // every geometry released from here on is a module-level template
  const original = THREE.BufferGeometry.prototype.dispose, released = [];
  let armed = true;
  THREE.BufferGeometry.prototype.dispose = function () {
    released.push(this);
    original.call(this);
    if (armed) { armed = false; throw new Error('injected disposal fault'); }
  };
  try {
    assert.throws(() => disposeFortressTemplates(), (e) => injected(e) === 1);
    const first = released.length;
    assert.ok(first >= 4, `prop templates and the traffic geometry attempted (${first})`);
    assert.equal(new Set(released).size, first, 'each exactly once');
    assert.ok(released.includes(geometry), 'the traffic geometry is reached');
    assert.deepEqual(traffic.counts(), [1, 1], 'the traffic geometry and program are released once each');

    disposeFortressTemplates();
    assert.equal(released.length, first, 'a repeat revisits nothing: every cache was given up');
  } finally {
    THREE.BufferGeometry.prototype.dispose = original;
  }
  // the streamer rebuilds fresh templates afterwards
  fortress.update(0, 1 / 60, 2, 200);
  assert.notEqual(fortress.traffic.mesh.geometry, geometry);
  fortress.clear(); disposeFortressTemplates();
});

test('the traffic program is released although its geometry fails', () => {
  quiet(disposeFortressTemplates);
  const { fortress } = fortressFor();
  const { geometry, material } = fortress.traffic.mesh;
  const w = watch([geometry, material], geometry);

  assert.throws(() => disposeAmbientTraffic(), (e) => injected(e) === 1);
  assert.deepEqual(w.counts(), [1, 1], 'geometry and material each attempted once');
  disposeAmbientTraffic();
  assert.deepEqual(w.counts(), [1, 1], 'a repeat revisits nothing');

  fortress.update(0, 1 / 60, 1, 1);
  assert.ok(fortress.traffic.mesh.material !== material && fortress.traffic.mesh.geometry !== geometry, 'streaming rebuilds the shared pair');
  fortress.clear(); disposeFortressTemplates();
});
