import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareCargoKit } from '../src/render/ImportedCargo.js';
import { createAntennaTemplates, disposeAntennaTemplates } from '../src/render/ImportedAntenna.js';
import { createFuelDepotRecipe } from '../src/render/ImportedFuelDepot.js';
import { loadImportedCoveredFighter, importedCoveredFighterTemplates, disposeCoveredFighterTemplates } from '../src/render/ImportedCoveredFighter.js';
import { Turret, disposeEnemyGeometry } from '../src/entities/Enemies.js';
import { Pickup, disposePickupGeometry } from '../src/entities/Pickup.js';
import { Materials } from '../src/render/Materials.js';
import * as Tex from '../src/render/Textures.js';

const watch = resources => {
  const counts = new Map([...new Set(resources)].map(r => [r, 0]));
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  return counts;
};
const once = counts => { for (const n of counts.values()) assert.equal(n, 1); };
const fail = resource => resource.addEventListener('dispose', () => { throw Error('cleanup fault'); });

test('malformed cargo preparation retires earlier clones and loader resources while preserving original error', () => {
  const scene = new THREE.Scene(), source = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(source, material); mesh.name = 'CargoCrate_Fitted'; scene.add(mesh);
  const counts = watch([source, material, texture]), clones = [];
  const convert = source.toNonIndexed.bind(source);
  source.toNonIndexed = () => { const g = convert(); clones.push(g); counts.set(g, 0); g.addEventListener('dispose', () => counts.set(g, counts.get(g) + 1)); fail(g); return g; };
  fail(source);
  assert.throws(() => prepareCargoKit({ THREE, gltf: { scene } }), /Missing cargo template CargoDrum_Fitted/);
  assert.equal(clones.length, 1); once(counts); assert.equal(scene.children.length, 0);
});

test('cargo, antenna, fuel and covered-fighter shutdown finish all unique templates despite one disposer failure', async () => {
  const scene = new THREE.Scene();
  for (const name of ['CargoCrate_Fitted', 'CargoDrum_Fitted']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); mesh.name = name; scene.add(mesh);
  }
  const cargo = prepareCargoKit({ THREE, gltf: { scene } }), cargoCounts = watch(cargo.templates.values());
  fail(cargo.templates.values().next().value);
  assert.throws(() => cargo.dispose(), AggregateError); once(cargoCounts); cargo.dispose(); once(cargoCounts);
  assert.equal(cargo.templates.size, 0);
  const antenna = createAntennaTemplates(), antennaCounts = watch(Object.values(antenna)); fail(antenna.box);
  assert.throws(() => disposeAntennaTemplates(antenna), AggregateError); once(antennaCounts);
  const fuel = createFuelDepotRecipe({ buckets: ['hull', 'dark'].map(key => ({ key, position: [0, 0, 0], normal: [0, 1, 0], color: [1, 1, 1] })) });
  const fuelCounts = watch(fuel.templates.map(t => t.geometry)); fail(fuel.templates[0].geometry);
  assert.throws(() => fuel.dispose(), AggregateError); once(fuelCounts); fuel.dispose(); once(fuelCounts);
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ parts: ['hull', 'dark'].map(bucket => ({ bucket, positions: [0, 0, 0], normals: [0, 1, 0] })) }) });
  try {
    await loadImportedCoveredFighter('/');
    const geometries = importedCoveredFighterTemplates(), counts = watch(geometries); fail(geometries[0]);
    assert.throws(() => disposeCoveredFighterTemplates(), AggregateError); once(counts);
    assert.equal(importedCoveredFighterTemplates().length, 0); disposeCoveredFighterTemplates(); once(counts);
  } finally { globalThis.fetch = previous; }
});

test('fuel and covered-fighter preparation release partially allocated geometry when a later attribute fails', async () => {
  const original = THREE.BufferGeometry.prototype.setAttribute, counts = new Map(), fault = Error('normal attribute');
  THREE.BufferGeometry.prototype.setAttribute = function (name, attribute) {
    if (!counts.has(this)) { counts.set(this, 0); this.addEventListener('dispose', () => counts.set(this, counts.get(this) + 1)); }
    if (name === 'normal') throw fault;
    return original.call(this, name, attribute);
  };
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ parts: [{ bucket: 'hull', positions: [0, 0, 0], normals: [0, 1, 0] }] }) });
  try {
    assert.throws(() => createFuelDepotRecipe({ buckets: [{ key: 'hull', position: [0, 0, 0], normal: [0, 1, 0] }] }), e => e === fault);
    await assert.rejects(loadImportedCoveredFighter('/'), e => e === fault);
    assert.equal(counts.size, 2); once(counts);
  } finally { THREE.BufferGeometry.prototype.setAttribute = original; globalThis.fetch = previous; disposeCoveredFighterTemplates(); }
});

test('shared enemy and pickup caches clear before disposal errors and rebuild without stale resources', () => {
  const mats = Object.create(Materials.prototype); mats._neon = new Map(); mats._disposables = [];
  for (const key of ['enemyHull', 'enemyArmor', 'darkMetal']) mats[key] = mats.track(new THREE.MeshStandardMaterial());
  mats.glow = new THREE.Texture();
  const scene = new THREE.Scene(), enemy = new Turret(mats, { z: 0, seed: 1 }), pickup = new Pickup(scene, mats, 'shield', 0, 6, 30);
  const enemyGeo = new Set(), pickupGeo = new Set();
  enemy.group.traverse(o => { if (o.geometry && !o.isSprite) enemyGeo.add(o.geometry); });
  pickup.group.traverse(o => { if (o.geometry && !o.isSprite) pickupGeo.add(o.geometry); });
  enemy.dispose(); pickup.dispose();
  const enemyCounts = watch(enemyGeo), pickupCounts = watch(pickupGeo);
  fail(enemyGeo.values().next().value); fail(pickupGeo.values().next().value);
  assert.throws(disposeEnemyGeometry, AggregateError); once(enemyCounts); disposeEnemyGeometry(); once(enemyCounts);
  assert.throws(disposePickupGeometry, AggregateError); once(pickupCounts); disposePickupGeometry(); once(pickupCounts);
  const next = new Pickup(scene, mats, 'shield', 0, 6, 30); assert.equal(pickupGeo.has(next.shell.geometry), false);
  next.dispose(); disposePickupGeometry(); mats.dispose();
});

test('global texture retirement clears all cache entries after a throwing disposer and can forge fresh textures', () => {
  const previous = globalThis.document;
  const context = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const a = Tex.glowSprite(), b = Tex.ringSprite(), counts = watch([a, b]); fail(a);
    assert.throws(Tex.disposeTextures, AggregateError); once(counts); Tex.disposeTextures(); once(counts);
    assert.notEqual(Tex.glowSprite(), a); Tex.disposeTextures();
  } finally { globalThis.document = previous; }
});
