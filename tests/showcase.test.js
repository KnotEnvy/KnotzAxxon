import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Materials } from '../src/render/Materials.js';
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { getElementById: () => null };
globalThis.HTMLInputElement = class {};
globalThis.window = new EventTarget();
const { Engine } = await import('../src/core/Engine.js');
const { Game, STATE, dailySeed, dailyLabel } = await import('../src/game/Game.js');
const { Boss, LAUNCHER_HITS } = await import('../src/entities/Boss.js');
const { createEnemy, disposeEnemyGeometry } = await import('../src/entities/Enemies.js');
const { Effects } = await import('../src/fx/Effects.js');
const { Fortress } = await import('../src/world/Fortress.js');
const { Level, SECTOR_KINDS, CHUNK_LEN } = await import('../src/world/Level.js');
const { FlightCamera } = await import('../src/core/FlightCamera.js');
const { QUALITY_PRESETS: Q } = await import('../src/core/Settings.js');

function materials() {
  const m = Object.create(Materials.prototype);
  m._neon = new Map(); m._disposables = []; m.clock = { value: 0 };
  for (const key of ['enemyHull', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard']) {
    m[key] = m.track(new THREE.MeshStandardMaterial());
  }
  m.glow = m.ring = m.blob = new THREE.Texture();
  return m;
}
const input = { moveX: 0, moveY: 0, fire: false, boost: false, justPressed: () => false, reset() {}, rumble() {} };
function game() {
  const m = materials();
  const engine = {
    scene: new THREE.Scene(), camera: new FlightCamera(52, 1.8, .35, 1000), materials: m, frame: 0,
    sky: { apply() {} }, input, postfx: new Proxy({ resetTransient() {} }, { get: (o, k) => o[k] ?? (() => {}) }),
    setTimeScale: Engine.prototype.setTimeScale, hitStop() {},
  };
  const floaters = [], grades = [];
  const g = new Game(engine, { hide() {}, show() {}, sectorCard() {}, results() {} });
  g.hud.floater = (pos, label) => floaters.push(label);
  g.hud.grade = (letter, title, detail) => grades.push({ letter, title, detail });
  g._spawnFeatures = () => {}; g.fortress.update = () => {}; g.state = STATE.PLAYING;
  return { g, m, floaters, grades, dispose() { g.dispose(); m.dispose(); } };
}
const ctx = (extra = {}) => ({
  fx: { impact() {}, explosion() {}, muzzle() {}, rings: { spawn() {} }, sparks: { burst() {} }, smoke: { burst() {} }, addTrauma() {} },
  postfx: { flash() {} }, warn() {}, awardScore() {}, cameraKick() {}, onBossEngage() {}, onBossPhase() {},
  projectiles: { fire() {}, launchMissile() {} }, player: { pos: new THREE.Vector3(0, 12, 0), alive: true }, time: 0, ...extra,
});

test('daily sortie seed is stable for a UTC day and changes across days', () => {
  const a = new Date('2026-09-26T01:00:00Z'), b = new Date('2026-09-26T23:59:00Z'), c = new Date('2026-09-27T00:01:00Z');
  assert.equal(dailySeed(a), dailySeed(b));
  assert.notEqual(dailySeed(a), dailySeed(c));
  assert.equal(dailyLabel(a), '2026-09-26');
  assert.ok(Number.isInteger(dailySeed(a)) && dailySeed(a) >= 0 && dailySeed(a) < 1e9);
});

test('sector grades reward destroyed targets and clean flying, once per sector', () => {
  const { g, grades, dispose } = game();
  g._sectorStats[0] = { targets: 10, kills: 9, damage: 0, grade: null };
  g._sectorStats[1] = { targets: 10, kills: 6, damage: 1, grade: null };
  g._sectorStats[2] = { targets: 10, kills: 1, damage: 3, grade: null };
  const before = g.score;
  g._gradeSector(0); g._gradeSector(0); g._gradeSector(1); g._gradeSector(2);
  assert.deepEqual(grades.map(x => x.letter), ['S', 'A', 'C']);
  assert.equal(g.score - before, 2000, 'only the damage-free sector earns the clean bonus');
  assert.match(g.gradeLine, /^S A C/);
  dispose();
});

test('threading a gap near its edge pays and feeds the chain; a scrape forfeits it', () => {
  const { g, floaters, dispose } = game();
  const wall = { kind: 'wall', type: 'slot', z: 50, thickness: 4, gaps: [{ x: 0, w: 54, y: 4, h: 10 }] };
  g.player.pos.set(0, 4 + g.player.radius * 0.72 + 0.4, 50);
  g.runTime = 10; g._crashTime = -10;
  g._scorePass(wall);
  assert.equal(g.threads, 1); assert.equal(g.chain, 1); assert.ok(floaters.some(f => /THREAD/.test(f)));
  const wide = { ...wall, z: 80 };
  g.player.pos.y = 9; g._scorePass(wide);
  assert.equal(g.threads, 1, 'a centred pass is not a thread');
  g._crashTime = g.runTime - 0.2; g.player.pos.y = 4 + g.player.radius * 0.72 + 0.4;
  g._scorePass({ ...wall, z: 110 });
  assert.equal(g.threads, 1, 'no style award straight after a scrape');
  dispose();
});

test('grazes score, extend a live chain and keep floaters throttled', () => {
  const { g, floaters, dispose } = game();
  g.chain = 2; g.chainTimer = 0.2; g.runTime = 5;
  g._graze(g.player.pos); g._graze(g.player.pos);
  assert.equal(g.grazes, 2);
  assert.ok(g.chainTimer >= 1.5);
  assert.equal(floaters.filter(f => f === 'GRAZE').length, 1);
  assert.equal(g.score, 100);
  dispose();
});

test('score thresholds repair hull first, then add shields, once each', () => {
  const { g, dispose } = game();
  g.player.hull = 2; g.player.shields = 0;
  g.score = 50000; g._checkHullBonus(); g._checkHullBonus();
  assert.equal(g.player.hull, 3); assert.equal(g.player.shields, 0);
  g.score = 150000; g._checkHullBonus();
  assert.equal(g.player.shields, 1);
  dispose();
});

test('launcher duel: six hits during the charge detonate the missile in the rack', () => {
  const m = materials(), scene = new THREE.Scene(), b = new Boss(scene, m, { z: 100 });
  b.active = true; b.entrance = 1; b.phase = 1;
  b.group.updateMatrixWorld(true);
  b.launcher.charging = true; b.launcher.timer = 2;
  b.launcher.mouth.getWorldPosition(b.launcher.pos);
  const hp = b.hp, c = ctx();
  for (let i = 0; i < LAUNCHER_HITS - 1; i++) assert.equal(b.hitAt(b.launcher.pos.clone(), 1, c), 'launcher');
  assert.equal(b.launcher.charging, true);
  b.hitAt(b.launcher.pos.clone(), 1, c);
  assert.equal(b.launcher.charging, false);
  assert.equal(b.hp, hp - 14);
  assert.ok(b.stagger > 0);
  // an idle launcher is not a target
  assert.notEqual(b.hitAt(b.launcher.pos.clone(), 1, c), 'launcher');
  b.dispose(); m.dispose();
});

test('destroyed cannon pods leave a visible stump and crack the armour phase', () => {
  const m = materials(), b = new Boss(new THREE.Scene(), m, { z: 100 }), c = ctx();
  b.group.updateMatrixWorld(true);
  for (const pod of b.pods) { pod.group.getWorldPosition(pod.pos); b.hitAt(pod.pos.clone(), 99, c); }
  assert.equal(b.podsAlive, 0);
  assert.ok(b.pods.every(p => p.stump.visible && !p.body.visible));
  b.dispose(); m.dispose();
});

test('scrambling parked fighters spool up and climb as the intruder closes', () => {
  const m = materials(), mats = { ...m, neon: () => new THREE.MeshBasicMaterial(), enemyHull: m.enemyHull, darkMetal: m.darkMetal };
  const e = createEnemy('parked', mats, { x: 0, y: 0, z: 200, seed: 1 });
  e.scramble = true;
  const player = { pos: new THREE.Vector3(0, 3, 100), speed: 40 };
  for (let i = 0; i < 30; i++) e.update(1 / 60, { player, time: i / 60 });
  assert.equal(e.pos.y, 0, 'still parked while far away');
  player.pos.z = 160;
  for (let i = 0; i < 90; i++) e.update(1 / 60, { player, time: i / 60 });
  assert.ok(e.pos.y > 2, 'climbing once scrambled');
  e.dispose(); disposeEnemyGeometry(); m.dispose();
});

test('explosion lights stay in the scene so the light count never changes shader keys', () => {
  const m = materials(), scene = new THREE.Scene(), fx = new Effects(scene, m, Q.high);
  const visibleLights = () => { let n = 0; scene.traverse(o => { if (o.isPointLight && o.visible) n++; }); return n; };
  const count = visibleLights();
  assert.equal(count, Q.high.lights);
  fx.explosion(new THREE.Vector3(), 1);
  assert.equal(visibleLights(), count);
  for (let i = 0; i < 120; i++) fx.update(1 / 60, i / 60, new THREE.PerspectiveCamera());
  assert.equal(visibleLights(), count);
  assert.ok(fx.lights.lights.every(l => l.light.intensity === 0));
  fx.dispose(); m.dispose();
});

test('every streamed chunk bucket carries complete, finite vertex streams', () => {
  const m = materials();
  const level = new Level(42);
  const world = new Fortress(new THREE.Scene(), m, level, { drawDistance: 96 });
  const kinds = new Set();
  for (const s of level.sectors) {
    const group = world._buildChunk(Math.floor((s.zStart + 300) / CHUNK_LEN));
    group.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry, n = g.attributes.position.count;
      kinds.add(s.kind);
      assert.ok(n > 0 && n % 3 === 0);
      for (const name of ['normal', 'uv', 'color']) assert.equal(g.attributes[name].count, n, name);
      if (g.attributes.aAnim) assert.equal(g.attributes.aAnim.count, n);
      if (g.attributes.aPivot) assert.equal(g.attributes.aSpin.count, n);
      assert.ok(g.attributes.position.array.every(Number.isFinite));
      assert.ok(Number.isFinite(g.boundingSphere.radius));
    });
    world._disposeChunk(group);
  }
  assert.deepEqual([...kinds].sort(), [SECTOR_KINDS.BOSS, SECTOR_KINDS.FORTRESS, SECTOR_KINDS.SPACE].sort());
  world.clear(); m.dispose();
});

test('fortress re-entry from space opens with a perimeter wall and a fuel reward', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const level = new Level(seed);
    for (const s of level.sectors) {
      const prev = level.sectors[s.index - 1];
      const perimeter = level.features.find(f => f.perimeter && f.z >= s.zStart && f.z < s.zEnd);
      if (s.kind === SECTOR_KINDS.FORTRESS && prev?.kind === SECTOR_KINDS.SPACE) {
        assert.ok(perimeter, `sector ${s.index} seed ${seed}`);
        assert.equal(perimeter.type, 'slot'); assert.ok(perimeter.gaps[0].h >= 12);
        assert.equal(level.features.filter(f => f.kind === 'fuel' && f.z === s.zStart + 125).length, 2);
      } else {
        assert.equal(perimeter, undefined);
      }
    }
    assert.ok(level.features.filter(f => f.kind === 'parked').every(f => level.sectorAt(f.z).kind === SECTOR_KINDS.FORTRESS));
  }
});
