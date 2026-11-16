// CPU-only: actual game, shipped GLBs, import recipes and Three.js resources.
// File-backed loaders replace network I/O; no renderer or GPU is created.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Materials } from '../../src/render/Materials.js';
import { FlightCamera } from '../../src/core/FlightCamera.js';

// Embedded images retain real texture objects; decoding pixels is outside this
// CPU lifetime test. Node fetch still reads the actual embedded image blobs.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });

const sourceRoot = new URL('../../src/', import.meta.url);
const publicRoot = new URL('../../public/', import.meta.url);
const cases = [];
async function check(name, work) {
  try { cases.push({ name, pass: true, ...await work() }); }
  catch (error) { cases.push({ name, pass: false, error: error.stack }); }
}
const files = async path => readFile(new URL(path.replace(/^\//, ''), publicRoot));
const parsed = [];
let rejectPlayer = false, failCleanup = false;
const loadFault = Error('player fetch failed'), cleanupFault = Error('template cleanup failed');
class FileGLTFLoader {
  async loadAsync(path) {
    if (rejectPlayer && path === '/models/player.glb') throw loadFault;
    const bytes = await files(path);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    parsed.push(gltf.scene);
    if (failCleanup && path === '/models/turret.glb') {
      gltf.scene.getObjectByProperty('isMesh', true).geometry.addEventListener('dispose', () => { throw cleanupFault; });
    }
    return gltf;
  }
}
const context = createContext({
  console, URLSearchParams, setTimeout, clearTimeout, EventTarget, CustomEvent,
  Float32Array, Float64Array, Uint8Array, Int8Array, Uint16Array, Uint32Array, DataView,
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }), document: { getElementById: () => null },
  fetch: async path => ({ ok: true, json: async () => JSON.parse(await files(path)),
    arrayBuffer: async () => { const b = await files(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } }),
});
const modules = new Map();
async function getModule(specifier, referencing) {
  const url = specifier.startsWith('.') ? new URL(specifier, referencing.identifier) : null;
  const id = url?.href ?? specifier;
  if (modules.has(id)) return modules.get(id);
  const pending = (async () => {
  let module;
  if (url?.href.startsWith(sourceRoot.href)) {
    module = new SourceTextModule(await readFile(url, 'utf8'), {
      context, identifier: id, initializeImportMeta(meta) { meta.env = { BASE_URL: '/' }; },
      async importModuleDynamically(specifier, referencing) {
        const child = await getModule(specifier, referencing);
        if (child.status === 'unlinked') await child.link(getModule);
        if (child.status === 'linked') await child.evaluate();
        return child;
      },
    });
  } else {
    const values = specifier === 'three' ? THREE : specifier.endsWith('/GLTFLoader.js') ? { GLTFLoader: FileGLTFLoader } : await import(specifier);
    module = new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: id });
  }
  return module;
  })();
  modules.set(id, pending);
  return pending;
}
const gameModule = await getModule('./game/Game.js', { identifier: new URL('entry.js', sourceRoot).href });
await gameModule.link(getModule); await gameModule.evaluate();
const { Game } = gameModule.namespace;
const imports = (await modules.get(new URL('render/ImportedModels.js', sourceRoot).href)).namespace;
const watch = resources => {
  const counts = new Map([...new Set(resources)].map(r => [r, 0]));
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  return counts;
};
function resources(owners) {
  const result = new Set();
  for (const owner of owners) owner.group.traverse(o => {
    if (o.geometry && !o.isSprite) result.add(o.geometry);
    for (const m of o.userData.modelOwnedMaterials ?? []) result.add(m);
  });
  return result;
}

await check('actual imported prewarm retains one detached owner set, replaces it and rolls back failures', async () => {
  await imports.loadImportedModels();
  const mats = Object.create(Materials.prototype);
  mats._neon = new Map(); mats._disposables = [];
  for (const key of ['enemyHull', 'enemyArmor', 'enemyMetal', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard']) {
    mats[key] = mats.track(new THREE.MeshStandardMaterial());
  }
  mats.glow = mats.ring = mats.blob = new THREE.Texture();
  const scene = new THREE.Scene(), camera = new FlightCamera(52, 1.8, .35, 1000); scene.add(camera);
  const game = new Game({ scene, camera, materials: mats, input: {}, sky: { apply() {} }, frame: 0 }, {});
  const before = [...scene.children], template = imports.importedTemplate('drone');
  const templateState = [];
  template.traverse(o => { if (o.isMesh) templateState.push([o, o.castShadow, o.receiveShadow, o.material, o.material.toneMapped]); });
  let first, second;
  try {
    game.prewarm(() => {});
    first = game._prewarmEntities;
    assert.equal(first.length, 14); // nine enemy kinds + boss + four pickups
    assert.deepEqual(scene.children, before); assert.ok(first.every(o => o.group.parent === null));
    const imported = first.filter(o => o._importedRoot);
    assert.equal(imported.length, 13);
    const flyer = first.find(o => o.kind === 'drone');
    assert.ok(flyer.eye.material.isMeshBasicMaterial); assert.ok(flyer.engine.material.isMeshBasicMaterial);
    const pickup = first.find(o => o.kind === 'spread'); assert.equal(pickup.shell.material.toneMapped, false);
    const owned = watch(resources(imported)), variants = watch([flyer.eye.material, flyer.engine.material, pickup.shell.material]);
    for (const n of owned.values()) assert.equal(n, 0);
    const fault = Error('compile exact variants'); let failed;
    assert.throws(() => game.prewarm(() => {
      const staged = game.enemies.filter(o => o._importedRoot);
      failed = watch(resources(staged));
      staged[0]._importedRoot.getObjectByProperty('isMesh', true).geometry.addEventListener('dispose', () => { throw Error('rollback geometry'); });
      throw fault;
    }), e => e === fault);
    assert.equal(game._prewarmEntities, first);
    for (const n of variants.values()) assert.equal(n, 0);
    for (const n of failed.values()) assert.equal(n, 1);
    assert.deepEqual(scene.children, before);
    game.prewarm(() => {}); second = game._prewarmEntities;
    assert.equal(second.length, first.length); assert.notEqual(second, first);
    for (const n of owned.values()) assert.equal(n, 1);
    for (const n of variants.values()) assert.equal(n, 1);
    for (const [o, cast, receive, material, toneMapped] of templateState) {
      assert.equal(o.castShadow, cast); assert.equal(o.receiveShadow, receive);
      assert.equal(o.material, material); assert.equal(material.toneMapped, toneMapped);
    }
    const final = watch(resources(second.filter(o => o._importedRoot)));
    game.dispose(); game.dispose();
    for (const n of final.values()) assert.equal(n, 1);
    assert.deepEqual(scene.children, [camera]);
    return { retainedOwners: first.length, importedOwners: imported.length, importedResources: owned.size,
      rollbackResources: failed.size, replacementResources: final.size };
  } finally { game.dispose(); mats.dispose(); imports.disposeImportedModels(); }
});

await check('imported shutdown attempts every template resource once despite a thrown disposer', async () => {
  await imports.loadImportedModels();
  const roots = ['player', 'sentinel', 'turret', 'fuel'].map(imports.importedTemplate);
  const all = new Set();
  for (const root of roots) root.traverse(o => {
    if (o.geometry) all.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) all.add(m);
  });
  const counts = watch(all);
  roots[0].getObjectByProperty('isMesh', true).geometry.addEventListener('dispose', () => { throw cleanupFault; });
  assert.throws(() => imports.disposeImportedModels(), e => e.name === 'AggregateError');
  for (const n of counts.values()) assert.equal(n, 1);
  assert.equal(imports.importedTemplate('player'), undefined);
  imports.disposeImportedModels(); for (const n of counts.values()) assert.equal(n, 1);
  return { resourcesAttempted: counts.size };
});

await check('imported loader preserves original rejection when rollback itself throws', async () => {
  rejectPlayer = failCleanup = true;
  try {
    await assert.rejects(imports.loadImportedModels(), e => e === loadFault);
    assert.equal(imports.importedTemplate('turret'), undefined);
    assert.equal(imports.importedTemplate('fuel'), undefined);
  } finally { rejectPlayer = failCleanup = false; imports.disposeImportedModels(); }
});

process.stdout.write(JSON.stringify({ cases }, null, 2) + '\n');
