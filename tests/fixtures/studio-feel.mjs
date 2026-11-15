// Shared deterministic fixture for tests/studio-feel.test.js.
// Real Game, Level, Player, Boss, Projectiles, collision and Engine._loop; only
// rendering/DOM/audio boundaries are stubbed. All telemetry produced here is
// SIMULATED cadence in a Node process, not physical input latency or FPS.
import * as THREE from 'three';
import { Materials } from '../../src/render/Materials.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {} };
globalThis.matchMedia ??= () => ({ matches: false });
globalThis.window ??= new EventTarget();
globalThis.document ??= Object.assign(new EventTarget(), { hidden: false, getElementById: () => null });
globalThis.HTMLInputElement ??= class {};
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

const { Engine } = await import('../../src/core/Engine.js');
const { Game, STATE } = await import('../../src/game/Game.js');
const { FlightCamera } = await import('../../src/core/FlightCamera.js');
const { settings } = await import('../../src/core/Settings.js');
const { rand } = await import('../../src/core/Utils.js');
export { THREE, Engine, Game, STATE, settings, rand, FlightCamera };

export function materials() {
  const m = Object.create(Materials.prototype);
  m._neon = new Map(); m._disposables = []; m.clock = { value: 0 };
  for (const key of ['enemyHull', 'darkMetal', 'playerHull', 'playerAccent', 'glass', 'hull', 'deck', 'grating', 'hazard']) {
    m[key] = m.track(new THREE.MeshStandardMaterial());
  }
  m.glow = m.ring = m.blob = new THREE.Texture();
  m.forceField = () => m.track(new THREE.MeshBasicMaterial());
  return m;
}

/** Scripted Input surface consumed by Player/Game: held intent + per-frame edges. */
export class ScriptedInput {
  constructor() { this.moveX = 0; this.moveY = 0; this.fire = false; this.boost = false; this.pressed = new Set(); this.rumbles = 0; }
  justPressed(a) { return this.pressed.has(a); }
  isDown() { return false; }
  press(a) { this.pressed.add(a); }
  update() {}
  endFrame() { this.pressed.clear(); }
  reset() { this.moveX = this.moveY = 0; this.fire = this.boost = false; this.pressed.clear(); }
  rumble() { this.rumbles++; }
}

/**
 * A real Engine._loop driving a real Game. `engine.advance(hz)` presents one frame
 * of 1000/hz ms through the production time scale / hit-stop / substep logic.
 */
export function makeRig({ seed = 42, camera = 'classic', assist = false, hz = 60, spawn = false, loop = 0 } = {}) {
  settings.values.camera = camera;
  settings.values.assist = assist;
  rand.reset(seed ^ 0x9e3779b9);
  const m = materials();
  const input = new ScriptedInput();
  const engine = Object.create(Engine.prototype);
  const scene = new THREE.Scene();
  const cam = new FlightCamera(52, 16 / 9, 0.35, 1000);
  Object.assign(engine, {
    running: true, time: 0, frame: 0, realTime: 0, timeScale: 1, _targetTimeScale: 1, _hitStop: 0, _hitStopScale: 1,
    stats: { fps: 60, ms: 16.7 }, _msEma: 16.7, _renderScale: 1, _scaleCooldown: 1e9, _updateHooks: [], _lateHooks: [],
    _last: 0, scene, camera: cam, materials: m, input,
    postfx: new Proxy({ resetTransient() {} }, { get: (o, k) => o[k] ?? (() => {}) }),
    sky: { apply() {}, update() {}, presetName: null },
    underlay: { setEnvironment() {}, update() {} },
    renderer: { info: { reset() {}, render: { calls: 0, triangles: 0 }, memory: {} }, getDrawingBufferSize: v => v.set(1280, 720) },
    _onResize() {},
  });
  m.update = () => {};
  const calls = { results: [], cards: [], grades: [], floaters: [], warns: [], combat: [] };
  const screens = { hide() {}, show() {}, sectorCard: s => calls.cards.push(s.index), results: r => calls.results.push(r) };
  const g = new Game(engine, screens);
  g.hud.floater = (pos, label) => calls.floaters.push(label);
  g.hud.grade = (letter, title, detail) => calls.grades.push({ letter, title, detail });
  g.hud.warn = label => calls.warns.push(label);
  const originalCombat = g.hud.combatHit?.bind(g.hud);
  g.hud.combatHit = (pos, kind) => { calls.combat.push(kind); originalCombat?.(pos, kind); };
  if (!spawn) g._spawnFeatures = () => {};
  g.fortress.update = (z, dt, time) => { for (const a of g.fortress.animated) a.update?.(dt, time, z); };
  g.start({ seed });
  if (loop) { g.loop = loop - 1; g._nextLoop(); }
  g.player._engineFx = g.player._updateShadow = () => {};
  engine.onUpdate((dt, time, realDt) => g.update(dt, time, realDt));
  engine.onLateUpdate((dt, time) => g.lateUpdate(dt, time));
  cam.updateMatrixWorld(true);
  let now = 1000; engine._last = now;
  const rig = {
    g, engine, input, m, calls, hz,
    /** Present one frame at `hzOverride` (default rig.hz). */
    frame(hzOverride = rig.hz) { now += 1000 / hzOverride; engine._loop(now); },
    /** Present one frame whose rAF interval is exactly `ms` (jitter / hitch injection). */
    frameMs(ms) { now += ms; engine._loop(now); },
    /** Run `seconds` of presentation time; `each(frameIndex, rig)` runs before every frame. */
    run(seconds, each, hzOverride = rig.hz) {
      const frames = Math.round(seconds * hzOverride);
      for (let i = 0; i < frames; i++) { each?.(i, rig); rig.frame(hzOverride); }
      return frames;
    },
    dispose() { g.dispose(); m.dispose(); },
  };
  return rig;
}
export const HZ = [30, 60, 120, 144];

/** Fly a straight, unsteered pass through `z0..z1` at (x, y); returns hull damage events and final state. */
export function straightPass({ seed = 42, hz = 60, x, y, z0, z1, boost = false, assist = false, prepare } = {}) {
  const r = makeRig({ seed, hz, assist });
  const p = r.g.player;
  p.pos.set(x, y, z0); p.velocity.set(0, 0, 0);
  p.invuln = 0; r.g.sectorIndex = r.g.level.sectorAt(z0)?.index ?? 0;
  r.g.rig.snap(p);
  r.input.boost = boost;
  prepare?.(r);
  let crashes = 0; const originalCrash = r.g._crash.bind(r.g);
  r.g._crash = (...a) => { crashes++; return originalCrash(...a); };
  const limit = Math.ceil(((z1 - z0) / 38) * hz) + hz;
  for (let i = 0; i < limit && p.pos.z < z1 && p.alive; i++) r.frame();
  const result = { crashes, hull: p.hull, alive: p.alive, z: p.pos.z, x: p.pos.x, y: p.pos.y, threads: r.g.threads, score: r.g.score };
  r.dispose();
  return result;
}

/** One hostile bolt flown head-on past a stationary-lateral ship; classify the outcome. */
export function boltPass({ hz = 60, offsetX = 0, offsetY = 0, speed = 78, radius = 0.9, side = 'enemy', seed = 42 } = {}) {
  const r = makeRig({ seed, hz });
  const p = r.g.player;
  p.pos.set(0, 9, 100); p.velocity.set(0, 0, 0); p.invuln = 0; p.shields = 1; p.hull = 3;
  r.g.rig.snap(p);
  const SIDE = { ENEMY: 1 };
  r.g.projectiles.fire(SIDE.ENEMY, offsetX, 9 + offsetY, 190, 0, 0, -1, speed, { damage: 1, radius, life: 4 });
  for (let i = 0; i < hz * 3 && p.pos.z < 140; i++) r.frame();
  const out = { shields: p.shields, hull: p.hull, grazes: r.g.grazes, chainBroken: r.g.chain === 0 };
  r.dispose();
  return out;
}

const { Boss } = await import('../../src/entities/Boss.js');
export { Boss };
/** Real Boss in a real Game, player parked in the boss sector at the level's own boss z. */
export function bossRig({ hz = 60, seed = 42 } = {}) {
  const r = makeRig({ seed, hz });
  const f = r.g.level.features.find(x => x.kind === 'boss');
  const p = r.g.player;
  p.pos.set(0, 12, f.z - 210); p.velocity.set(0, 0, 0);
  r.g.sectorIndex = r.g.level.sectorAt(p.pos.z).index;
  r.g.boss = new Boss(r.g.scene, r.g.materials, f);
  r.g.rig.snap(p);
  return Object.assign(r, { boss: r.g.boss, bossFeature: f });
}
export function hitPods(r) {
  const c = r.g._ctx(1 / 60, r.engine.time);
  r.boss.group.updateMatrixWorld(true);
  for (const pod of r.boss.pods) { pod.group.getWorldPosition(pod.pos); r.boss.hitAt(pod.pos.clone(), 99, c); }
}

/** Deterministic +-fraction jitter so 'real' frame pacing can be exercised repeatably. */
export function jitterFrames(hz, fraction, seed = 5) {
  let s = seed >>> 0;
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => (1000 / hz) * (1 + (next() * 2 - 1) * fraction);
}
/** Count player bolts fired through the real projectile pool. */
export function countShots(rig) {
  const counter = { shots: 0 };
  const fire = rig.g.projectiles.fire.bind(rig.g.projectiles);
  rig.g.projectiles.fire = (side, ...rest) => { if (side === 0) counter.shots++; return fire(side, ...rest); };
  return counter;
}
