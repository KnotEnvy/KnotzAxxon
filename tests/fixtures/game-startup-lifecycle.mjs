import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import * as THREE from 'three';
import { Materials } from '../../src/render/Materials.js';
import { FlightCamera } from '../../src/core/FlightCamera.js';

globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { getElementById: () => null };
const sourceURL = new URL('../../src/game/Game.js', import.meta.url);
const source = await readFile(process.env.GAME_LIFECYCLE_SOURCE ?? sourceURL, 'utf8');
const cases = [];
function sameItems(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) assert.equal(actual[i] === expected[i], true, `owner at ${i}`);
}
async function check(name, work) {
  if (process.env.GAME_LIFECYCLE_PROGRESS) process.stderr.write(`${name}\n`);
  try { const evidence = await work(); cases.push({ name, pass: true, ...evidence }); }
  catch (error) { cases.push({ name, pass: false, error: error.stack }); }
}

function materials() {
  const m = Object.create(Materials.prototype);
  m._neon = new Map(); m._disposables = [];
  for (const key of ['enemyHull', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard']) {
    m[key] = m.track(new THREE.MeshStandardMaterial());
  }
  m.glow = m.ring = m.blob = new THREE.Texture();
  return m;
}

// Import actual dependencies and wrap only the requested constructor boundary.
async function loadGame(hooks = {}) {
  const context = createContext({ console, localStorage, Math, Date, setTimeout, clearTimeout });
  const module = new SourceTextModule(source, { context, identifier: sourceURL.href });
  await module.link(async specifier => {
    const actual = specifier === 'three' ? THREE : await import(new URL(specifier, sourceURL));
    const exports = { ...actual };
    for (const [name, value] of Object.entries(exports)) {
      if (hooks.constructorNames?.includes(name)) {
        exports[name] = new Proxy(value, {
          construct(target, args) {
            hooks.beforeConstruct?.(name, args);
            const owner = Reflect.construct(target, args);
            hooks.afterConstruct?.(name, owner);
            return owner;
          },
        });
      }
    }
    hooks.link?.(specifier, exports);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace.Game;
}

function engine() {
  const scene = new THREE.Scene(), camera = new FlightCamera(52, 1.8, .35, 1000);
  scene.add(camera);
  return { scene, camera, materials: materials(), input: {}, sky: { apply() {} }, frame: 0 };
}

function watchDispose(owner, label, log, fail = false) {
  const dispose = owner.dispose.bind(owner);
  owner.dispose = () => {
    log.push(label);
    dispose();
    if (fail) throw Error(`cleanup ${label}`);
  };
}

const constructorNames = ['HUD', 'CameraRig', 'Effects', 'AmbientDust', 'Projectiles', 'Player', 'Level', 'Fortress'];
for (const stage of [...constructorNames, 'initial sky', 'settings subscription', 'quality callback']) {
  await check(`Game constructor rollback at ${stage}`, async () => {
    const fault = Error(`startup ${stage}`), e = engine(), owners = [], calls = [];
    let partial, quality = () => {}, added = 0, removed = 0;
    const oldQuality = quality;
    const settingsModule = await import('../../src/core/Settings.js');
    const settings = settingsModule.settings;
    const add = settings.addEventListener, remove = settings.removeEventListener;
    const Game = await loadGame({ constructorNames,
      beforeConstruct(name) { if (name === stage) throw fault; },
      afterConstruct(name, owner) {
        if (owner.dispose) { owners.push(name); watchDispose(owner, name, calls, stage === 'initial sky' && name === 'Player'); }
      },
    });
    class CaptureGame extends Game {
      dispose() { partial = this; return super.dispose(); }
    }
    if (stage === 'initial sky') e.sky.apply = () => { throw fault; };
    Object.defineProperty(e, 'onQualityChange', {
      get: () => quality,
      set(value) {
        quality = value;
        if (stage === 'quality callback' && value) throw fault;
      },
    });
    settings.addEventListener = function (...args) {
      if (stage === 'settings subscription') throw fault;
      added++; return add.apply(this, args);
    };
    settings.removeEventListener = function (...args) { removed++; return remove.apply(this, args); };
    let caught, assigned;
    try { assigned = new CaptureGame(e, {}); } catch (error) { caught = error; }
    finally { settings.addEventListener = add; settings.removeEventListener = remove; }
    assert.equal(caught, fault, 'the startup error must survive cleanup failures');
    assert.equal(assigned, undefined);
    assert.ok(partial?._disposed);
    partial.dispose();
    assert.deepEqual([...calls].sort(), [...owners].sort(), 'every completed owner is attempted once');
    sameItems(e.scene.children, [e.camera]);
    assert.equal(added, removed, 'installed settings subscription must detach');
    assert.equal(quality, stage === 'quality callback' ? null : oldQuality, 'retire only the owned callback');
    e.materials.dispose();
    return { originalError: true, completedOwners: owners, cleanupCalls: calls, sceneChildrenAfter: 1 };
  });
}

const prepStages = ['chunk 2 entry', 'chunk 2 attached', 'enemy 2', 'enemy scene attachment',
  'boss construction', 'boss positioning', 'pickup 2', 'gate material', 'fence material',
  'field geometry 2', 'field mesh 2', 'field positioning', 'field scene attachment',
  'wreck', 'chunk effect', 'explosion', 'effect update', 'compile', 'compile and cleanup', 'cleanup only', 'normal'];
for (const stage of prepStages) {
  await check(`Game prewarm cleanup at ${stage}`, async () => {
    const e = engine(), fault = Error(`prepare ${stage}`), calls = [], temporary = [], geometries = new Map(), pickupGeometries = new Map();
    let active = false, bosses = 0, pickups = 0, enemyBuilds = 0, builds = 0, planes = 0, meshes = 0;
    const observeGeometry = geometry => {
      if (!geometries.has(geometry)) {
        geometries.set(geometry, 0);
        geometry.addEventListener('dispose', () => geometries.set(geometry, geometries.get(geometry) + 1));
      }
    };
    const observeChunk = group => group.traverse(o => { if (o.isMesh) observeGeometry(o.geometry); });
    const Game = await loadGame({ constructorNames: ['Boss', 'Pickup'],
      beforeConstruct(name) {
        if (!active) return;
        if (name === 'Boss' && stage === 'boss construction') throw fault;
        if (name === 'Pickup' && ++pickups === 2 && stage === 'pickup 2') throw fault;
      },
      afterConstruct(name, owner) {
        if (!active) return;
        const label = name === 'Boss' ? `boss ${++bosses}` : `pickup ${pickups}`;
        temporary.push(label); watchDispose(owner, label, calls, stage === 'compile and cleanup' && name === 'Boss');
        if (name === 'Pickup') owner.group.traverse(o => {
          if (o.geometry && !o.isSprite && !pickupGeometries.has(o.geometry)) {
            pickupGeometries.set(o.geometry, 0);
            o.geometry.addEventListener('dispose', () => pickupGeometries.set(o.geometry, pickupGeometries.get(o.geometry) + 1));
          }
        });
        if (name === 'Boss' && stage === 'boss positioning') owner.group.position.set = () => { throw fault; };
        if (name === 'Pickup' && pickups === 4 && (stage === 'gate material' || stage === 'fence material')) {
          game.fortress._gateMat?.dispose(); game.fortress._fenceMat?.dispose();
          game.fortress._gateMat = game.fortress._fenceMat = undefined;
          fields = 0;
        }
      },
      link(specifier, exports) {
        if (specifier === 'three') {
          exports.PlaneGeometry = new Proxy(THREE.PlaneGeometry, { construct(target, args) {
            if (++planes === 2 && stage === 'field geometry 2') throw fault;
            const geometry = Reflect.construct(target, args); observeGeometry(geometry); return geometry;
          } });
          exports.Mesh = new Proxy(THREE.Mesh, { construct(target, args) {
            if (++meshes === 2 && stage === 'field mesh 2') throw fault;
            const mesh = Reflect.construct(target, args);
            if (stage === 'field positioning') mesh.position.set = () => { throw fault; };
            return mesh;
          } });
        }
        if (specifier.endsWith('/Enemies.js')) {
          const create = exports.createEnemy;
          exports.createEnemy = (...args) => {
            if (active && ++enemyBuilds === 2 && stage === 'enemy 2') throw fault;
            const enemy = create(...args);
            if (active && enemy) {
              const label = `enemy ${enemyBuilds}`; temporary.push(label); watchDispose(enemy, label, calls);
            }
            return enemy;
          };
        }
      },
    });
    const game = new Game(e, {}), f = game.fortress;
    // Keep real live owners present to prove staging cleanup does not retire them.
    const liveChunk = f._buildChunk(0); f.chunks.set(0, liveChunk);
    const liveEnemy = game._spawnEnemy('turret', { x: 0, y: 0, z: 0, seed: 1 });
    const beforeScene = [...e.scene.children], beforeRoot = [...f.root.children];
    const beforeAnimated = [...f.animated], beforeEmitters = [...f.emitters], beforeObstacles = [...f.rearObstacles];
    const silhouette = game.player.model?.userData?.silhouette;
    assert.ok(silhouette, 'use the real player silhouette');
    silhouette.visible = false;
    const build = f._buildChunk.bind(f), retire = f._disposeChunk.bind(f);
    const retired = new Map();
    f._buildChunk = index => {
      if (++builds === 2 && stage === 'chunk 2 entry') throw fault;
      const group = build(index); observeChunk(group);
      if (builds === 2 && stage === 'chunk 2 attached') throw fault;
      return group;
    };
    f._disposeChunk = group => {
      retired.set(group, (retired.get(group) ?? 0) + 1);
      retire(group);
      if (stage === 'compile and cleanup' || stage === 'cleanup only') throw Error('chunk retirement failed');
    };
    const add = e.scene.add.bind(e.scene);
    e.scene.add = (...objects) => {
      add(...objects);
      if (active && stage === 'enemy scene attachment' && enemyBuilds === 1) throw fault;
      if (active && stage === 'field scene attachment' && objects[0].geometry?.type === 'PlaneGeometry') throw fault;
      return e.scene;
    };
    const forceField = e.materials.forceField.bind(e.materials);
    let fields = 0;
    e.materials.forceField = (...args) => {
      fields++;
      if (active && pickups === 4 && ((fields === 1 && stage === 'gate material') || (fields === 2 && stage === 'fence material'))) throw fault;
      return forceField(...args);
    };
    for (const [method, name] of [['wreck', 'wreck'], ['chunk', 'chunk effect'], ['explosion', 'explosion'], ['update', 'effect update']]) {
      const actual = game.fx[method].bind(game.fx);
      game.fx[method] = (...args) => { actual(...args); if (stage === name) throw fault; };
    }
    const clear = game.fx.clear.bind(game.fx);
    game.fx.clear = () => { clear(); if (stage === 'compile and cleanup' || stage === 'cleanup only') throw Error('effect clear failed'); };
    // Track cached enemy/pickup geometries and application materials/textures:
    // instance retirement must never consume these shared owners.
    const shared = new Set(['enemyHull', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard', 'glow']
      .map(key => e.materials[key]).concat([...e.materials._neon.values()], e.materials.neonVertex));
    let sharedDisposals = 0;
    for (const resource of shared) resource.addEventListener('dispose', () => sharedDisposals++);
    const enemyGeometries = new Map();
    liveEnemy.group.traverse(o => { if (o.geometry && !enemyGeometries.has(o.geometry)) {
      enemyGeometries.set(o.geometry, 0);
      o.geometry.addEventListener('dispose', () => enemyGeometries.set(o.geometry, enemyGeometries.get(o.geometry) + 1));
    } });
    let caught, compiled = 0;
    active = true;
    try { game.prewarm(() => {
      compiled++;
      assert.equal(silhouette.visible, true);
      if (stage === 'compile' || stage === 'compile and cleanup') throw fault;
    }); } catch (error) { caught = error; }
    active = false;
    if (stage === 'normal') assert.equal(caught, undefined);
    else if (stage === 'cleanup only') assert.equal(caught?.name, 'AggregateError');
    else assert.equal(caught, fault, 'preserve preparation/compile error over cleanup errors');
    assert.deepEqual([...calls].sort(), [...temporary].sort(), 'every staged entity is retired exactly once');
    assert.equal(silhouette.visible, false);
    assert.equal(game.enemies.length, 1); assert.equal(game.enemies[0], liveEnemy);
    sameItems(e.scene.children, beforeScene);
    sameItems(f.root.children, beforeRoot);
    sameItems(f.animated, beforeAnimated);
    sameItems(f.emitters, beforeEmitters);
    sameItems(f.rearObstacles, beforeObstacles);
    for (const count of geometries.values()) assert.equal(count, 1, 'every staged chunk/field geometry retires once');
    for (const count of retired.values()) assert.equal(count, 1);
    assert.equal(retired.has(liveChunk), false);
    assert.equal(sharedDisposals, 0);
    for (const count of enemyGeometries.values()) assert.equal(count, 0);
    for (const count of pickupGeometries.values()) assert.equal(count, 0);
    assert.equal(game.fx.trauma, 0); assert.equal(game.fx.pendingHitStop, 0);
    assert.equal(game.fx._timers.length, 0);
    const geometryCount = geometries.size;
    const fieldMaterials = [f._gateMat, f._fenceMat].filter(Boolean), materialDisposals = new Map();
    for (const material of fieldMaterials) {
      materialDisposals.set(material, 0);
      material.addEventListener('dispose', () => materialDisposals.set(material, materialDisposals.get(material) + 1));
    }
    f._disposeChunk = retire; game.fx.clear = clear;
    game.dispose(); game.dispose();
    sameItems(e.scene.children, [e.camera]);
    assert.equal(sharedDisposals, 0);
    for (const count of enemyGeometries.values()) assert.equal(count, 0);
    for (const count of pickupGeometries.values()) assert.equal(count, 0);
    for (const count of materialDisposals.values()) assert.equal(count, 1, 'force fields belong to Game, beyond prewarm');
    for (const count of geometries.values()) assert.equal(count, 1, 'later shutdown must not revisit staged resources');
    e.materials.dispose();
    return { stagedEntityCount: temporary.length, geometryCount, compiled, originalError: caught === fault };
  });
}

await check('Game disposal attempts every assigned owner after independent cleanup failures, once', async () => {
  const Game = await loadGame(), e = engine(), game = new Game(e, {}), calls = [];
  const enemy = game._spawnEnemy('turret', { z: 0, seed: 1 });
  game.pickups.push({ dispose() { calls.push('pickup'); throw Error('pickup'); } });
  const { Boss } = await import('../../src/entities/Boss.js');
  game.boss = new Boss(e.scene, e.materials, { z: 80 });
  for (const [name, owner] of [['enemy', enemy], ['boss', game.boss], ['player', game.player],
    ['projectiles', game.projectiles], ['fx', game.fx], ['dust', game.dust], ['hud', game.hud], ['lifetime', game._lifetime]]) {
    watchDispose(owner, name, calls, true);
  }
  const f = game.fortress;
  for (const index of [0, 1]) f.chunks.set(index, f._buildChunk(index));
  const retire = f._disposeChunk.bind(f);
  f._disposeChunk = group => { calls.push('chunk'); retire(group); throw Error('chunk'); };
  for (const key of ['_gateMat', '_fenceMat']) {
    f[key] ??= e.materials.forceField(0xffffff);
    watchDispose(f[key], key, calls, true);
  }
  const clear = f.clear.bind(f);
  f.clear = () => { calls.push('fortress clear'); clear(); throw Error('fortress clear'); };
  assert.throws(() => game.dispose(), error => error.name === 'AggregateError');
  game.dispose();
  assert.deepEqual(calls.sort(), ['enemy', 'pickup', 'boss', 'player', 'projectiles', 'fx', 'dust', 'hud', 'lifetime',
    'chunk', 'chunk', '_gateMat', '_fenceMat', 'fortress clear'].sort());
  sameItems(e.scene.children, [e.camera]);
  assert.equal(e.onQualityChange, null);
  assert.equal(game.enemies.length, 0); assert.equal(game.pickups.length, 0); assert.equal(game.boss, null);
  assert.equal(f.chunks.size, 0); assert.equal(f.animated.length, 0); assert.equal(f.emitters.length, 0);
  e.materials.dispose();
  return { cleanupCalls: calls };
});

await check('Game normal prewarm and repeated teardown retain bounded shared ownership and later callbacks', async () => {
  const Game = await loadGame(), e = engine();
  let warm, compiles = 0, laterCalls = 0;
  for (let i = 0; i < 3; i++) {
    const game = new Game(e, {});
    const silhouette = game.player.model.userData.silhouette;
    silhouette.visible = i % 2 === 0;
    game.prewarm(() => compiles++);
    game.prewarm(() => compiles++);
    assert.equal(silhouette.visible, i % 2 === 0);
    const later = () => laterCalls++;
    e.onQualityChange = later;
    game.dispose(); game.dispose();
    sameItems(e.scene.children, [e.camera]);
    assert.equal(e.onQualityChange, later);
    e.onQualityChange();
    warm ??= e.materials._disposables.length;
    assert.equal(e.materials._disposables.length, warm);
  }
  assert.equal(compiles, 6); assert.equal(laterCalls, 3);
  e.materials.dispose();
  return { compiles, laterCalls, warmRegistrySize: warm };
});

await check('Game startup normal allocation order and RNG contract', async () => {
  const Game = await loadGame(), e = engine(), originalRandom = Math.random;
  let rngCalls = 0, rng = 719, game;
  const signature = {};
  Math.random = () => { rngCalls++; rng = Math.imul(rng, 1664525) + 1013904223 | 0; return (rng >>> 0) / 2 ** 32; };
  try {
    game = new Game(e, {});
    signature.level = createHash('sha256').update(JSON.stringify(game.level.features)).digest('hex');
    signature.player = game.player.pos.toArray();
    signature.camera = [e.camera.position.toArray(), e.camera.quaternion.toArray(), e.camera.fov];
    game.prewarm(() => {
      signature.scene = e.scene.children.map(o => [o.type, o.name]);
      signature.chunks = game.fortress.root.children.map(group => {
        const geometry = [];
        group.traverse(o => { if (o.geometry && !o.isSprite) geometry.push([o.geometry.attributes.position?.count, o.geometry.index?.count]); });
        return geometry;
      });
      signature.enemies = Array.from(game.enemies, enemy => [enemy.kind, enemy.pos.toArray(), enemy.radius, enemy.hp]);
    });
    signature.rngCalls = rngCalls;
    signature.rngEnd = rng;
    game.dispose(); game.dispose();
    sameItems(e.scene.children, [e.camera]);
    return { signature, signatureSha256: createHash('sha256').update(JSON.stringify(signature)).digest('hex') };
  } finally {
    Math.random = originalRandom;
    game?.dispose(); e.materials.dispose();
  }
});

process.stdout.write(JSON.stringify({ sourceSha256: createHash('sha256').update(source).digest('hex'), cases }, null, 2) + '\n');
