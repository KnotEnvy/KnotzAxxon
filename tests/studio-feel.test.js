// Studio feel / regression matrix. Real Game, Level, Player, Boss, Projectiles, collision,
// Input and Engine code; only rendering, DOM and audio boundaries are stubbed (see fixtures/studio-feel.mjs).
// "Hz" below is SIMULATED presentation cadence in Node. It is not physical input latency, display
// timing or device FPS, and none of these cases is a balance verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THREE, Engine, Game, STATE, settings, makeRig, ScriptedInput, HZ, straightPass, boltPass, bossRig, hitPods,
  jitterFrames, countShots, Boss,
} from './fixtures/studio-feel.mjs';

const { Input } = await import('../src/core/Input.js');
const { Screens } = await import('../src/ui/Screens.js');
const { Level, ALT_MIN, ALT_MAX, CORRIDOR_HALF } = await import('../src/world/Level.js');
const { Fortress } = await import('../src/world/Fortress.js');
const { createEnemy, disposeEnemyGeometry, Turret, Silo } = await import('../src/entities/Enemies.js');
const { LAUNCHER_HITS } = await import('../src/entities/Boss.js');
const { inCombatView } = await import('../src/game/CombatVisibility.js');
const { audio } = await import('../src/audio/Audio.js');
const { SIDE } = await import('../src/entities/Projectiles.js');

const near = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} vs ${expected} (+-${tolerance})`);
const spread = values => Math.max(...values) - Math.min(...values);

/* ------------------------------------------------------------------ */
/* Pad / visibility lifecycle (real Engine + real Input)               */
/* ------------------------------------------------------------------ */

function padRig() {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const original = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: [0, 0], buttons }] });
  const queued = new Map(); let id = 0;
  globalThis.requestAnimationFrame = fn => { queued.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => queued.delete(key);
  class HeadlessEngine extends Engine {
    _initRenderer() { this.renderer = { dispose() {}, shadowMap: {} }; }
    _initScene() { this.sky = { _bake() {}, dispose() {} }; }
    _onResize() {}
  }
  const engine = new HeadlessEngine(new EventTarget());
  const log = { state: 'playing', presses: [] };
  // Same three-line ownership as main.js: hidden/blurred/lost -> pause; 'pause' press toggles.
  engine.onVisibility = visible => { if (!visible && log.state === 'playing') log.state = 'paused'; };
  engine.input.addEventListener('press', event => {
    log.presses.push(event.detail);
    if (event.detail === 'pause') log.state = log.state === 'playing' ? 'paused' : 'playing';
  });
  const poll = () => { engine.input.update(); engine.input.endFrame(); };
  const hide = () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); };
  const show = () => { document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); };
  const lose = () => engine._onContextLost({ preventDefault() {} });
  const restore = () => engine._onContextRestored();
  const dispose = () => {
    engine.dispose(); document.hidden = false;
    if (original) Object.defineProperty(navigator, 'getGamepads', original); else delete navigator.getGamepads;
  };
  return { engine, buttons, log, poll, hide, show, lose, restore, queued, dispose, START: 9, A: 0 };
}

test('context loss: pad pause/confirm/fire changed while no frame ran is learned as held, never replayed', () => {
  const r = padRig();
  try {
    r.engine.start(); r.poll();
    r.lose();                                   // pauses the game, clears intent; window never blurs
    assert.equal(r.log.state, 'paused');
    r.buttons[r.START].pressed = true; r.buttons[r.A].pressed = true;   // pressed while the canvas is frozen
    r.restore(); r.poll(); r.poll();
    assert.equal(r.log.state, 'paused', 'first restored poll must not resume');
    assert.deepEqual(r.log.presses, [], 'no menu confirm / fire / pause edge may arrive from the lost interval');
    r.buttons[r.START].pressed = false; r.buttons[r.A].pressed = false; r.poll();
    r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'playing', 'release + new press resumes manually');
    r.engine.stop();
  } finally { r.dispose(); }
});

test('context loss: held across the loss stays held, and a release+re-press inside the loss is not an edge', () => {
  const r = padRig();
  try {
    r.buttons[r.START].pressed = true; r.poll();          // press consumed just before loss
    r.log.state = 'playing';
    r.engine.start(); r.lose();
    r.buttons[r.START].pressed = false; r.buttons[r.START].pressed = true; // no poll saw the release
    r.restore(); r.poll();
    assert.equal(r.log.state, 'paused');
    r.engine.stop();
  } finally { r.dispose(); }
});

test('hidden document without window blur (suppressed rAF) gates pad edges the same way', () => {
  const r = padRig();
  try {
    r.poll(); r.hide();
    r.buttons[r.START].pressed = true;                    // pressed while rAF is suppressed
    r.show(); r.poll();
    assert.equal(r.log.state, 'paused');
    assert.deepEqual(r.log.presses, []);
    r.buttons[r.START].pressed = false; r.poll(); r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'playing');
  } finally { r.dispose(); }
});

test('hidden document that still delivers frames (one in-flight rAF) cannot act until visible again', () => {
  const r = padRig();
  try {
    r.poll(); r.hide();
    r.poll();                                             // the already-scheduled frame still runs hidden
    r.buttons[r.START].pressed = true; r.poll(); r.poll();
    assert.equal(r.log.state, 'paused', 'hidden-but-polling must stay gated');
    r.show(); r.poll();
    assert.equal(r.log.state, 'paused', 'still held on return, learned not replayed');
    r.buttons[r.START].pressed = false; r.poll(); r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'playing');
  } finally { r.dispose(); }
});

test('every blur / hidden / context-loss ordering ends paused and needs one manual press', () => {
  const orders = [
    ['blur', 'lose', 'focus', 'restore'], ['blur', 'focus', 'lose', 'restore'], ['lose', 'blur', 'restore', 'focus'],
    ['lose', 'restore', 'blur', 'focus'], ['hide', 'lose', 'show', 'restore'], ['lose', 'hide', 'restore', 'show'],
  ];
  for (const order of orders) {
    const r = padRig();
    try {
      r.engine.start(); r.poll();
      const step = name => {
        if (name === 'blur') window.dispatchEvent(new Event('blur'));
        else if (name === 'focus') window.dispatchEvent(new Event('focus'));
        else r[name]();
      };
      // The pad button goes down after the first interruption and is still held at the end.
      step(order[0]); r.buttons[r.START].pressed = true;
      for (const name of order.slice(1)) step(name);
      r.poll(); r.poll();
      assert.equal(r.log.state, 'paused', order.join('>'));
      r.buttons[r.START].pressed = false; r.poll(); r.buttons[r.START].pressed = true; r.poll();
      assert.equal(r.log.state, 'playing', order.join('>') + ' manual resume');
      r.engine.stop();
    } finally { r.dispose(); }
  }
});

test('a deliberately stopped engine stays stopped through loss/restore and replays nothing when restarted', () => {
  const r = padRig();
  try {
    r.engine.start(); r.engine.stop();
    r.lose();
    r.buttons[r.START].pressed = true;
    r.restore();
    assert.equal(r.queued.size, 0, 'restore must not start a stopped engine');
    r.engine.start(); assert.equal(r.queued.size, 1);
    r.poll();
    assert.equal(r.log.state, 'paused');
    assert.deepEqual(r.log.presses, []);
    r.engine.stop();
  } finally { r.dispose(); }
});

test('a failing environment re-bake after context restore still restarts exactly one frame loop and surfaces the error', () => {
  const r = padRig();
  try {
    r.engine.sky._bake = () => { throw new Error('cube render failed after restore'); };
    r.engine.start(); r.lose();
    assert.throws(() => r.restore(), /cube render failed/);
    assert.equal(r.engine.running, true); assert.equal(r.queued.size, 1); assert.equal(r.engine._resumeAfterRestore, false);
    // A stopped engine is still never restarted by a restore.
    r.engine.stop(); r.lose();
    assert.throws(() => r.restore(), /cube render failed/);
    assert.equal(r.queued.size, 0);
    r.engine.stop();
  } finally { r.dispose(); }
});

test('keyboard intent is released across loss/hidden, and held pad direction does not repeat menu actions while blurred', () => {
  const r = padRig();
  try {
    window.dispatchEvent(Object.assign(new Event('keydown'), { code: 'ArrowLeft', repeat: false }));
    r.poll(); assert.equal(r.engine.input.moveX, -1);
    r.lose(); r.poll();
    assert.equal(r.engine.input.moveX, 0, 'a keyup swallowed by the lost context must not leave a stuck throttle');
    r.restore(); window.dispatchEvent(new Event('focus'));
    r.poll(); assert.equal(r.engine.input.moveX, 0);

    const screens = Object.create(Screens.prototype), cycled = [];
    Object.assign(screens, { current: 'settings', stack: ['pause'], selIndex: 0, _padRepeatAction: null, _padRepeatTimer: 0,
      _items: () => [{ classList: { contains: c => c === 'setting' }, dataset: { id: 'quality' }, matches: () => false }],
      _refreshSettings() {}, _refreshSelection() {} });
    Object.defineProperty(screens, 'isOpen', { get: () => true });
    const settingsModule = settings, cycle = settingsModule.cycle;
    settingsModule.cycle = (id, direction) => cycled.push(`${id}:${direction}`);
    try {
      const frame = () => { r.engine.input.update(); screens.updateGamepad(r.engine.input, 1 / 60); r.engine.input.endFrame(); };
      r.buttons[15].pressed = true; frame();
      window.dispatchEvent(new Event('blur'));
      for (let i = 0; i < 90; i++) frame();
      assert.deepEqual(cycled, [], 'a stale held D-pad must not cycle a setting 1.5 s while blurred');
      window.dispatchEvent(new Event('focus'));
      for (let i = 0; i < 90; i++) frame();
      assert.ok(cycled.length >= 3, 'repeat resumes once focus is back and the direction is still held');
    } finally { settingsModule.cycle = cycle; }
  } finally { r.dispose(); }
});

test('restore whose renderer resize fails starts no loop, surfaces the error, and a later restore resumes exactly one loop', () => {
  const r = padRig();
  try {
    const resize = r.engine._onResize;
    r.engine._onResize = () => { throw new Error('resize failed after restore'); };
    r.engine.start(); r.poll(); r.lose();
    assert.throws(() => r.restore(), /resize failed/);
    assert.equal(r.engine.running, false, 'no frame loop may run on a renderer that could not be set up');
    assert.equal(r.queued.size, 0);
    // A second loss/restore on a healthy renderer honours the pending resume once.
    r.engine._onResize = resize;
    r.lose(); r.restore();
    assert.equal(r.engine.running, true); assert.equal(r.queued.size, 1);
    r.engine.start(); assert.equal(r.queued.size, 1, 'a redundant start never adds a second rAF');
    assert.equal(r.log.state, 'paused', 'restore never resumes gameplay by itself');
    // A deliberate stop after a failed restore cancels the pending resume.
    r.engine._onResize = () => { throw new Error('resize failed after restore'); };
    r.lose(); assert.throws(() => r.restore(), /resize failed/);
    r.engine.stop(); r.engine._onResize = resize;
    r.lose(); r.restore();
    assert.equal(r.queued.size, 0, 'stop() during a pending resume must win over a later restore');
  } finally { r.dispose(); }
});

test('start() and repeated losses while the context is lost defer to one loop at restore; disposal during loss stays inert', () => {
  const r = padRig();
  try {
    r.lose(); r.engine.start();
    assert.equal(r.queued.size, 0, 'no rAF while the context is lost');
    r.lose(); r.lose(); r.restore();
    assert.equal(r.queued.size, 1); assert.equal(r.engine.running, true);
    r.engine.start(); assert.equal(r.queued.size, 1);
    r.engine.start(); r.lose(); r.engine.dispose();
    assert.doesNotThrow(() => r.restore());
    assert.equal(r.queued.size, 0, 'a disposed engine never restarts on restore');
    r.buttons[r.START].pressed = true; r.engine.input.update();
    assert.deepEqual(r.log.presses, [], 'disposed input dispatches nothing');
  } finally { r.dispose(); }
});

test('restore while the document is hidden keeps pad edges gated until visible, then still needs release + press', () => {
  const r = padRig();
  try {
    r.engine.start(); r.poll(); r.lose(); r.hide();
    r.restore();
    assert.equal(r.queued.size, 1, 'the loop resumes (the browser throttles it while hidden)');
    r.poll();                                         // a hidden-but-delivered frame
    r.buttons[r.START].pressed = true; r.poll(); r.poll();
    assert.equal(r.log.state, 'paused', 'restored while hidden: no pad edge may act');
    r.show(); r.poll();
    assert.equal(r.log.state, 'paused', 'held START learned on the first visible poll');
    assert.deepEqual(r.log.presses, []);
    r.buttons[r.START].pressed = false; r.poll(); r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'playing');
    r.engine.stop();
  } finally { r.dispose(); }
});

/* ------------------------------------------------------------------ */
/* Timing matrix through the production Engine._loop                   */
/* ------------------------------------------------------------------ */

test('pace, fuel and boost cost per simulated second are timestep independent at 30/60/120/144 Hz', () => {
  for (const [boost, assist] of [[false, false], [true, false], [false, true]]) {
    const rows = HZ.map(hz => {
      const r = makeRig({ hz, assist }); r.input.boost = boost;
      r.run(6);
      const row = { z: r.g.player.pos.z, fuel: r.g.player.fuel, time: r.engine.time, boosting: r.g.player.boost };
      r.dispose(); return row;
    });
    const label = `boost=${boost} assist=${assist}`;
    near(spread(rows.map(row => row.time)), 0, 1e-6, label + ' sim time');
    assert.ok(spread(rows.map(row => row.z)) / rows[0].z < 0.005, `${label} distance ${rows.map(row => row.z)}`);
    assert.ok(spread(rows.map(row => row.fuel)) < 0.0015, `${label} fuel ${rows.map(row => row.fuel)}`);
  }
  const burn = assist => { const r = makeRig({ assist }); r.run(8); const used = 1 - r.g.player.fuel; r.dispose(); return used; };
  near(burn(true) / burn(false), 0.7, 0.01, 'assist fuel multiplier');
});

test('weapon cadence stays in one band across refresh rates and frame jitter; a tap is exactly one shot on its own frame', () => {
  const nominal = 3 / 0.115;
  const rows = [];
  for (const hz of HZ) for (const jitter of [0, 0.05]) {
    const r = makeRig({ hz }); const shots = countShots(r); r.input.fire = true;
    const next = jitterFrames(hz, jitter, hz);
    for (let i = 0; i < Math.round(hz * 3); i++) r.frameMs(jitter ? next() : 1000 / hz);
    rows.push({ hz, jitter, shots: shots.shots, overheated: r.g.player.overheated }); r.dispose();
  }
  for (const row of rows) {
    assert.ok(row.shots >= 23 && row.shots <= 27, `${row.hz}Hz jitter ${row.jitter}: ${row.shots} shots (nominal ${nominal.toFixed(1)})`);
    assert.equal(row.overheated, false);
  }
  for (const hz of HZ) {
    const r = makeRig({ hz }); const shots = countShots(r);
    r.input.press('fire'); r.frame();
    assert.equal(shots.shots, 1, `${hz}Hz: press edge fires on the same presentation frame`);
    for (let i = 0; i < hz; i++) r.frame();
    assert.equal(shots.shots, 1, `${hz}Hz: released tap never auto-repeats across substeps`);
    r.dispose();
  }
});

test('overheat and cooling lock-out last about the same real time at every refresh rate; rolling vents heat', () => {
  const rows = HZ.map(hz => {
    const r = makeRig({ hz }); const shots = countShots(r); r.input.fire = true;
    const p = r.g.player; let frames = 0;
    while (!p.overheated && frames++ < hz * 10) r.frame();
    const overheatAt = frames / hz, count = shots.shots;
    for (let i = 0; i < hz; i++) r.frame();                       // held fire while locked out
    assert.equal(shots.shots, count, `${hz}Hz: no shots while overheated`);
    r.input.fire = false; let cool = 0;
    while (p.overheated && cool++ < hz * 10) r.frame();
    r.dispose(); return { hz, overheatAt, cool: (cool + hz) / hz };
  });
  assert.ok(rows.every(row => row.overheatAt > 3.8 && row.overheatAt < 4.8), JSON.stringify(rows));
  assert.ok(rows.every(row => row.cool > 1.6 && row.cool < 2.9), JSON.stringify(rows));
  const r = makeRig(); r.g.player.heat = 0.6; r.input.press('roll'); r.frame();
  assert.ok(r.g.player.heat <= 0.6 - 0.3, 'rolling vents at least 0.3 heat in the same frame');
  r.dispose();
});

test('barrel roll: one edge starts one roll (even across 2-3 substeps), ends in ~0.55 s, grants ~0.42 s invulnerability, 0.9 s cooldown', () => {
  for (const hz of HZ) for (const dir of [-1, 1]) {
    const r = makeRig({ hz }); const p = r.g.player; let starts = 0, previousTimer = 0;
    r.input.moveX = dir; r.input.press('roll');
    const t0 = r.engine.time;
    let endedAt = null, invulnEnd = null, secondEarly = false;
    for (let i = 0; i < hz * 1.3; i++) {
      r.frame();
      const t = r.engine.time - t0;
      if (p.rollTimer > previousTimer + 1e-9) starts++;
      previousTimer = p.rollTimer;
      if (endedAt === null && p.rollTimer <= 0) endedAt = t;
      if (invulnEnd === null && p.invuln <= 0) invulnEnd = t;
      if (Math.abs(t - 0.8) < 0.5 / hz) { r.input.press('roll'); }        // inside cooldown: ignored
      if (t > 0.8 && t < 0.88 && p.rollTimer > 0) secondEarly = true;
      if (t >= 0.97 && t < 0.97 + 1.5 / hz) r.input.press('roll');         // after cooldown: accepted
    }
    assert.equal(secondEarly, false, `${hz}Hz dir ${dir}: roll must stay locked out at 0.8 s`);
    assert.ok(starts >= 1 && starts <= 2, `${hz}Hz starts=${starts}`);
    near(endedAt, 0.55, 2.2 / hz + 0.01, `${hz}Hz roll length`);
    near(invulnEnd, 0.42, 2.2 / hz + 0.01, `${hz}Hz invulnerability`);
    r.dispose();
  }
  const r = makeRig(); const p = r.g.player; r.input.press('roll'); r.frame();
  const ctx = r.g._ctx(1 / 60, 0);
  assert.equal(p.damage(1, ctx), 'none', 'rolling ship ignores hostile damage');
  r.dispose();
});

test('boost: drains in ~2.4 s, stays exhausted while held, recovers after release; lateral response is ~0.15 s', () => {
  const rows = HZ.map(hz => {
    const r = makeRig({ hz }); const p = r.g.player; r.input.boost = true; let frames = 0;
    while (!p._boostExhausted && frames++ < hz * 6) r.frame();
    const exhaust = frames / hz, speedScale = p.speedScale;
    for (let i = 0; i < hz; i++) r.frame();
    const stillOff = p.boosting === false;
    r.input.boost = false; for (let i = 0; i < hz * 2; i++) r.frame();
    const recovered = p.boost;
    r.dispose();
    const l = makeRig({ hz }); l.input.moveX = -1; let reach = 0;
    while (l.g.player.velocity.x < 0.9 * 27 && reach++ < hz) l.frame();
    const lateral = reach / hz; l.input.moveX = 0; let stop = 0;
    while (Math.abs(l.g.player.velocity.x) > 0.1 && stop++ < hz) l.frame();
    l.dispose();
    return { hz, exhaust, speedScale, stillOff, recovered, lateral, stop: stop / hz };
  });
  for (const row of rows) {
    near(row.exhaust, 2.35, 0.2, `${row.hz}Hz exhaust`);
    assert.ok(row.speedScale > 1.4 && row.stillOff && row.recovered > 0.4, JSON.stringify(row));
    near(row.lateral, 0.15, 0.06, `${row.hz}Hz lateral`);
    assert.ok(row.stop < 0.25, `${row.hz}Hz stop ${row.stop}`);
  }
});

test('hit-stop and slow-motion are real-time effects: duration is one band at every rate, and pause freezes the clocks exactly', () => {
  for (const hz of HZ) {
    const r = makeRig({ hz }); const frozen = [];
    r.engine.hitStop(0.2, 0.055);
    for (let i = 0; i < hz * 0.5; i++) { r.frame(); frozen.push(r.engine.timeScale < 0.21 ? 1 : 0); }
    const realSeconds = frozen.reduce((a, b) => a + b, 0) / hz;
    // 0.055 s requested; the frame that crosses the deadline is also held, so one frame of quantization is allowed.
    assert.ok(realSeconds >= 0.05 && realSeconds <= 0.055 + 1.2 / hz, `${hz}Hz hit-stop ${realSeconds}s`);
    near(r.engine.timeScale, 1, 0.02, `${hz}Hz timeScale recovers`);
    r.dispose();
  }
  for (const hz of HZ) {
    const r = makeRig({ hz }); r.input.fire = true; r.input.boost = true; r.run(1);
    const before = { z: r.g.player.pos.z, t: r.engine.time, fuel: r.g.player.fuel, heat: r.g.player.heat, chain: r.g.chainTimer };
    r.g._bumpChain(); const chain = r.g.chainTimer;
    r.g.pause(); assert.equal(r.g.state, STATE.PAUSED);
    r.run(5);
    near(r.g.player.pos.z, before.z, 1e-6, `${hz}Hz paused z`);
    near(r.engine.time, before.t, 1e-9, `${hz}Hz paused clock`);
    near(r.g.player.fuel, before.fuel, 1e-9); near(r.g.player.heat, before.heat, 1e-9);
    near(r.g.chainTimer, chain, 1e-9, `${hz}Hz chain timer frozen`);
    r.g.resume(); assert.equal(r.engine.timeScale, 1); r.run(1);
    assert.ok(r.g.player.pos.z > before.z + 30, `${hz}Hz resumes flight`);
    r.dispose();
  }
});

test('chain expires 3 s of game time after the last kill at every rate; grazes extend a low timer; damage ends the chain', () => {
  for (const hz of HZ) {
    const r = makeRig({ hz }); const g = r.g;
    g._bumpChain(); g._bumpChain(); g._bumpChain();
    assert.equal(g.chainMult, 2);
    const t0 = r.engine.time; let broke = null;
    for (let i = 0; i < hz * 4 && broke === null; i++) { r.frame(); if (g.chain === 0) broke = r.engine.time - t0; }
    near(broke, 3.0, 2.2 / hz + 0.02, `${hz}Hz chain expiry`);
    assert.equal(g.chainMult, 1);
    g._bumpChain(); r.run(2.5, undefined, hz);
    assert.ok(g.chainTimer < 0.7);
    g._graze(g.player.pos); assert.ok(g.chainTimer >= 1.5, 'a graze buys the chain more time');
    g._noteDamage(); g._breakChain(); assert.equal(g.chain, 0);
    r.dispose();
  }
});

test('camera rig never changes flight physics: Classic, Modern and Chase give the same kinematics for one script', () => {
  const rows = ['classic', 'modern', 'chase'].map(camera => {
    const r = makeRig({ camera }); const p = r.g.player;
    r.run(8, i => {
      r.input.moveX = Math.sin(i / 40); r.input.moveY = Math.cos(i / 55) * 0.8; r.input.fire = i % 120 < 70;
      r.input.boost = i % 200 > 150;
      if (i === 90 || i === 310) r.input.press('roll');
    });
    const row = { x: p.pos.x, y: p.pos.y, z: p.pos.z, fuel: p.fuel, heat: p.heat, roll: p.roll, boost: p.boost };
    r.dispose(); return row;
  });
  for (const key of Object.keys(rows[0])) near(spread(rows.map(row => row[key])), 0, 1e-9, key);
});

/* ------------------------------------------------------------------ */
/* Wall, gate, fence, arch and moving-envelope collisions              */
/* ------------------------------------------------------------------ */

/** Candidate (x,y) lanes with unambiguous truth against the level's own collider boxes. */
function wallLanes(level, feature) {
  const radius = 1.5 * 0.72, margin = 0.15, boxes = [];
  level.collidersNear(feature.z - 0.01, feature.z + 0.01, boxes);
  const solid = boxes.filter(c => c.minZ <= feature.z && c.maxZ >= feature.z);
  const inside = (x, y, grow) => solid.some(c => x >= c.minX - radius - grow && x <= c.maxX + radius + grow
    && y >= c.minY - radius - grow && y <= c.maxY + radius + grow);
  const lanes = [];
  for (let x = -14; x <= 14; x += 4.7) for (let y = ALT_MIN + 0.4; y <= ALT_MAX - 0.4; y += 3.4) {
    const hard = inside(x, y, -margin), soft = inside(x, y, margin);
    if (hard === soft) lanes.push({ x, y, crash: hard });          // every other lane is within the margin: skip
  }
  // Add edge-hugging lanes on both sides of each opening so the threshold itself is covered.
  for (const c of solid) for (const y of [c.maxY + radius, c.minY - radius]) for (const d of [-0.2, 0.2]) {
    const lane = { x: (c.minX + c.maxX) / 2 > 0 ? -2 : 2, y: y + (y > c.maxY ? d : -d) };
    if (lane.y < ALT_MIN || lane.y > ALT_MAX) continue;
    const hard = inside(lane.x, lane.y, -margin), soft = inside(lane.x, lane.y, margin);
    if (hard === soft) lanes.push({ ...lane, crash: hard });
  }
  return lanes;
}

test('static walls, windows, notches, pillars, arches and fences crash exactly where the colliders say, at every rate and at boost speed', () => {
  const seen = new Set(); let lanesTested = 0, crashLanes = 0, passLanes = 0;
  for (const seed of [42, 7, 1234]) {
    const level = new Level(seed);
    const picks = new Map();
    for (const f of level.features) {
      if (!['wall', 'arch', 'fence'].includes(f.kind) || f.perimeter) continue;
      const key = f.kind + ':' + (f.type ?? '');
      if ((picks.get(key)?.length ?? 0) < 1 && !seen.has(seed + key)) { picks.set(key, [...(picks.get(key) ?? []), f]); seen.add(seed + key); }
    }
    for (const [key, features] of picks) for (const f of features) {
      const lanes = wallLanes(level, f);
      assert.ok(lanes.length >= 6, `${seed} ${key}: expected unambiguous lanes, got ${lanes.length}`);
      // Sample both outcomes plus the edge lanes to bound the runtime.
      const chosen = [...lanes.filter(l => l.crash).slice(0, 3), ...lanes.filter(l => !l.crash).slice(0, 3), ...lanes.slice(-4)];
      for (const lane of chosen) for (const hz of HZ) {
        const boost = hz === 144;
        const out = straightPass({ seed, hz, x: lane.x, y: lane.y, z0: f.z - 60, z1: f.z + 25, boost });
        assert.equal(out.crashes > 0, lane.crash, `${seed} ${key}@${f.z.toFixed(0)} lane(${lane.x.toFixed(1)},${lane.y.toFixed(1)}) ${hz}Hz boost=${boost}`);
        lanesTested++; if (lane.crash) crashLanes++; else passLanes++;
      }
    }
  }
  assert.ok(lanesTested >= 150 && crashLanes > 40 && passLanes > 40, `${lanesTested}/${crashLanes}/${passLanes}`);
});

test('moving coolant gates: crash/pass outcome per altitude is identical at 30/60/120/144 Hz, and both outcomes occur', () => {
  let compared = 0;
  for (const seed of [42, 1234]) {
    const level = new Level(seed);
    const gates = level.features.filter(f => f.kind === 'gate' && f.cycle > 0).slice(0, 2);
    assert.ok(gates.length >= 1, `seed ${seed} needs a moving gate`);
    for (const gate of gates) {
      const sweeps = [];
      for (let y = ALT_MIN + 0.5; y <= ALT_MAX - 0.5; y += 2.3) {
        const outcomes = HZ.map(hz => straightPass({
          seed, hz, x: 0, y, z0: gate.z - 70, z1: gate.z + 20,
          prepare: r => r.g.fortress._gate(new THREE.Group(), r.g.level.features.find(x => x.id === gate.id)),
        }).crashes > 0);
        assert.equal(new Set(outcomes).size, 1, `seed ${seed} gate ${gate.id} y=${y.toFixed(1)} ${outcomes}`);
        sweeps.push(outcomes[0]); compared++;
      }
      assert.ok(sweeps.includes(true) && sweeps.includes(false), `gate ${gate.id} should have a passable opening and solid parts`);
    }
  }
  assert.ok(compared >= 16);
});

/* ------------------------------------------------------------------ */
/* Projectile collision: hostile near/far/graze, player range/altitude  */
/* ------------------------------------------------------------------ */

test('hostile bolt: direct hit, graze band and clean miss resolve identically at every rate (lateral and vertical)', () => {
  const ring = 1.5 + 0.9, grazeEdge = ring + 1.7;
  for (const axis of ['offsetX', 'offsetY']) {
    for (const hz of HZ) {
      for (const offset of [0, 1, ring - 0.2]) {
        const o = boltPass({ hz, [axis]: offset });
        assert.equal(o.shields, 0, `${axis}=${offset} ${hz}Hz absorbs on shield`); assert.equal(o.hull, 3);
      }
      for (const offset of [ring + 0.2, 3.2, grazeEdge - 0.2]) {
        const o = boltPass({ hz, [axis]: offset });
        assert.equal(o.shields, 1, `${axis}=${offset} ${hz}Hz no damage`); assert.equal(o.hull, 3);
        assert.equal(o.grazes, 1, `${axis}=${offset} ${hz}Hz graze`);
      }
      for (const offset of [grazeEdge + 0.2, 7]) {
        const o = boltPass({ hz, [axis]: offset });
        assert.deepEqual([o.shields, o.hull, o.grazes], [1, 3, 0], `${axis}=${offset} ${hz}Hz clean miss`);
      }
    }
  }
  // A faster, thicker bolt: still no tunnelling at the lowest rate.
  for (const hz of HZ) assert.equal(boltPass({ hz, offsetX: 1.4, speed: 160, radius: 0.5 }).shields, 0);
});

function shotRig({ hz, camera = 'modern', assist = false, kind = 'mine', dz = 80, dy = 0, dx = 0, seed = 42 }) {
  const r = makeRig({ hz, camera, assist, seed });
  const p = r.g.player; p.pos.set(0, 12, 400); p.velocity.set(0, 0, 0); r.g.sectorIndex = 0;
  r.g.rig.snap(p); r.engine.camera.updateMatrixWorld(true);
  const target = createEnemy(kind, r.g.materials, { x: dx, y: 12 + dy, z: 400 + dz, seed: 3 });
  r.g.enemies.push(target); r.g.scene.add(target.group);
  return { ...r, p, target };
}

test('player bolts: in-range kills and out-of-range / altitude-separated shots miss at the same edge for every rate', () => {
  const { radius } = (() => { const e = shotRig({ hz: 60 }); const v = e.target.radius; e.dispose(); return { radius: v }; })();
  const reach = 2.4 + 190 * 1.6;                                    // muzzle offset + speed * life
  const cases = [
    { name: 'near', dz: 40, dy: 0, kill: true }, { name: 'far in-range', dz: 150, dy: 0, kill: true },
    { name: 'just inside life', dz: reach - 8, dy: 0, kill: true }, { name: 'beyond life', dz: reach + 14, dy: 0, kill: false },
    // Target centre sits 0.4 radius above its origin; bolts start 0.1 below the ship. Threshold dy = 0.6r + 0.8.
    { name: 'altitude inside', dz: 100, dy: 0.6 * radius + 0.8 - 0.35, kill: true },
    { name: 'altitude outside', dz: 100, dy: 0.6 * radius + 0.8 + 0.35, kill: false },
    { name: 'lateral inside', dz: 100, dx: radius + 0.9 - 0.35, kill: true },
    { name: 'lateral outside', dz: 100, dx: radius + 0.9 + 0.35, kill: false },
  ];
  for (const c of cases) for (const hz of HZ) {
    const r = shotRig({ hz, ...c, dx: c.dx ?? 0, dy: c.dy });
    // muzzle alternates left/right, so test centre-line altitude only: fire exactly one bolt from the centre-line pod.
    r.p.muzzleSide = 0;
    r.input.press('fire'); r.frame();
    for (let i = 0; i < hz * 2.2; i++) r.frame();
    assert.equal(r.g.kills >= 1, c.kill, `${c.name} ${hz}Hz kills=${r.g.kills}`);
    assert.equal(r.g.shotsHit >= 1, c.kill, `${c.name} ${hz}Hz hit count`);
    r.dispose();
  }
  disposeEnemyGeometry();
});

test('standard fire holds altitude in every rig; Flight Assist steers only toward targets inside the picture', () => {
  for (const camera of ['classic', 'modern', 'chase']) {
    for (const assist of [false, true]) {
      const r = shotRig({ hz: 60, camera, assist, dz: 70, dy: 4 });
      r.p.muzzleSide = 0; r.g.player.target = { x: r.target.pos.x, y: r.target.pos.y + 1, z: r.target.pos.z, obj: r.target };
      const pool = r.g.projectiles.player;
      r.input.press('fire'); r.frame();
      let slot = -1; for (let i = 0; i < pool.capacity; i++) if (pool.life[i] > 0) slot = i;
      assert.ok(slot >= 0, `${camera} bolt exists`);
      if (assist) assert.ok(pool.vy[slot] > 0.1, `${camera} assist should climb toward a visible target above the lane (vy=${pool.vy[slot]})`);
      else near(pool.vy[slot], 0, 1e-6, `${camera} standard stays level`);
      r.dispose();
    }
  }
  disposeEnemyGeometry();
});

test('cover blocks targeting and shots in every rig, with Flight Assist off and on; a clear lane does not', () => {
  const level = new Level(42);
  const wall = level.features.find(f => f.kind === 'wall' && f.type === 'slot' && !f.perimeter && !f.debris);
  const gap = wall.gaps[0];
  for (const camera of ['classic', 'modern', 'chase']) for (const assist of [false, true]) for (const hz of [30, 144]) {
    const make = (targetY, playerY) => {
      const r = makeRig({ hz, camera, assist, seed: 42 }); const p = r.g.player;
      p.pos.set(0, playerY, wall.z - 48); p.velocity.set(0, 0, 0); p.muzzleSide = 0; r.g.sectorIndex = r.g.level.sectorAt(p.pos.z).index;
      r.g.rig.snap(p); r.engine.camera.updateMatrixWorld(true);
      const t = createEnemy('mine', r.g.materials, { x: 0, y: targetY, z: wall.z + wall.thickness / 2 + 8, seed: 5 });
      r.g.enemies.push(t); r.g.scene.add(t.group);
      return { r, t, p };
    };
    const hidden = make(1.2, 1.2);                                  // behind the lower solid block
    assert.equal(hidden.r.g.findTarget(hidden.p.pos), null, `${camera} assist=${assist} covered target must not be acquirable`);
    hidden.r.input.press('fire'); hidden.r.frame();
    for (let i = 0; i < hz * 1.5; i++) hidden.r.frame();
    assert.equal(hidden.r.g.kills, 0, `${camera} assist=${assist} ${hz}Hz no kill through cover`);
    assert.equal(hidden.r.g.score, 0, 'and no score');
    hidden.r.dispose();

    const mid = gap.y + gap.h / 2;
    const open = make(mid, mid);
    assert.ok(open.r.g.findTarget(open.p.pos), `${camera} assist=${assist} clear lane stays targetable`);
    open.r.input.press('fire'); open.r.frame();
    for (let i = 0; i < hz * 1.5; i++) open.r.frame();
    assert.equal(open.r.g.kills, 1, `${camera} assist=${assist} ${hz}Hz clear lane kills`);
    open.r.dispose();
  }
  disposeEnemyGeometry();
});

test('classic view always shows every ground threat inside its engagement envelope, at every aspect and lane extreme', () => {
  const envelope = Math.max(75, 85) + 2;                           // Turret 75, Silo 85 (+ muzzle margin)
  for (const aspect of [16 / 9, 1, 9 / 16, 21 / 9]) {
    const r = makeRig({ camera: 'classic' }); const p = r.g.player;
    r.engine.camera.aspect = aspect; r.engine.camera.updateProjectionMatrix();
    for (const [x, y] of [[0, 9], [16, 25], [-16, 1.3], [16, 1.3], [-16, 25]]) {
      p.pos.set(x, y, 500); r.g.rig.snap(p); r.engine.camera.updateMatrixWorld(true);
      for (const lane of [-16, -8, 0, 8, 16]) for (let dz = 6; dz <= envelope; dz += 4) {
        assert.ok(inCombatView(r.engine.camera, lane, 2, 500 + dz), `aspect ${aspect.toFixed(2)} ship(${x},${y}) lane ${lane} +${dz}`);
      }
    }
    r.dispose();
  }
});

/* ------------------------------------------------------------------ */
/* First-shot cues                                                     */
/* ------------------------------------------------------------------ */

test('turret and silo first-shot cue (eye charge / hatch opening) survives every rate, pace and difficulty', () => {
  const m = new THREE.MeshBasicMaterial(), mats = { enemyHull: m, darkMetal: m, neon: () => m };
  for (const Kind of [Turret, Silo]) for (const hz of HZ) for (const [speed, difficulty] of [[40, 0.2], [48, 0.3], [82.56, 0.3], [103, 1]]) {
    const step = 1 / 60, frames = Math.ceil(hz * 3);
    let shots = 0, firstFireZ = null, cueTime = null, engagedAt = null, t = 0;
    const e = new Kind(mats, { x: 5, y: 0, z: 100, seed: 11 });
    const p = { pos: new THREE.Vector3(0, 9, 0), velocity: new THREE.Vector3(), speed, alive: true };
    const fired = () => { shots++; firstFireZ ??= p.pos.z; };
    const ctx = { player: p, difficulty, time: 0, radarJammed: false, projectiles: { fire: fired, launchMissile: fired }, fx: { muzzle() {} }, warn() {} };
    for (let i = 0; i < frames && shots === 0; i++) {
      // Production splits a long frame into <=1/60 substeps.
      const steps = Math.max(1, Math.ceil(1 / hz / step - 1e-9)), dt = 1 / hz / steps;
      for (let s = 0; s < steps; s++) { t += dt; ctx.time = t; p.pos.z += speed * dt; e.update(dt, ctx); }
      if (engagedAt === null && e.hasEngaged) engagedAt = t;
      const cue = Kind === Silo ? e.doors > 0.5 : e.fireTimer < 0.5;
      if (cueTime === null && e.hasEngaged && cue) cueTime = t;
    }
    assert.ok(shots >= 1, `${Kind.name} ${hz}Hz speed ${speed} must fire`);
    const telegraph = Kind === Silo ? 0.55 : 0.45;
    assert.ok((t - engagedAt) >= telegraph - 1 / 60 - 1e-6, `${Kind.name} ${hz}Hz first-shot telegraph ${(t - engagedAt).toFixed(3)}s`);
    assert.ok(cueTime !== null && cueTime <= t, `${Kind.name} visible cue precedes the shot`);
    assert.ok(firstFireZ > 15 && firstFireZ < 100, 'fires inside the readable approach');
    e.dispose();
  }
  disposeEnemyGeometry(); m.dispose();
});

/* ------------------------------------------------------------------ */
/* Boss                                                                */
/* ------------------------------------------------------------------ */

test('Sentinel phase and launcher schedule is the same at every rate (engage, pods->phase 2, core window, charge/launch cadence)', () => {
  const rows = HZ.map(hz => {
    const r = bossRig({ hz }), b = r.boss; r.g.player.invuln = 1e9;
    const ev = { charges: [], launches: 0 }; let phase = 0, charging = false;
    r.run(20, () => {
      if (b.active && ev.active === undefined) ev.active = r.engine.time;
      if (b.entrance >= 1 && ev.landed === undefined) { ev.landed = r.engine.time; hitPods(r); }
      if (b.phase !== phase) { phase = b.phase; ev['phase' + phase] = r.engine.time; }
      if (b.coreOpen > 0.55 && ev.coreOpen === undefined) ev.coreOpen = r.engine.time;
      if (b.launcher.charging && !charging) ev.charges.push(r.engine.time);
      if (!b.launcher.charging && charging && b.launcher.cooldown > 5) ev.launches++;
      charging = b.launcher.charging;
    });
    r.dispose(); return { hz, ...ev };
  });
  for (const key of ['landed', 'phase1', 'coreOpen']) assert.ok(spread(rows.map(row => row[key])) < 0.1, `${key} ${rows.map(row => row[key])}`);
  assert.ok(rows.every(row => row.charges.length >= 2), 'two charge windows inside 20 s');
  for (let i = 0; i < 2; i++) assert.ok(spread(rows.map(row => row.charges[i])) < 0.12, `charge ${i} ${rows.map(row => row.charges[i])}`);
  assert.ok(rows.every(row => row.launches >= 1), 'an unanswered charge launches the missile');
  near(rows[1].charges[0] - rows[1].phase1, 3.0, 0.1, 'first charge three seconds after the armour breaks');
});

test('launcher duel: six hits inside the 2.6 s charge detonate it at every rate, six hits that straddle the window launch the missile instead', () => {
  for (const hz of HZ) {
    for (const spacing of [0.28, 0.5]) {
      const r = bossRig({ hz }), b = r.boss; r.g.player.invuln = 1e9;
      const heavy = []; const launch = r.g.projectiles.launchMissile.bind(r.g.projectiles);
      r.g.projectiles.launchMissile = (...a) => { if (a[8]?.radius === 1.9) heavy.push(r.engine.time); return launch(...a); };
      r.run(12, () => { if (b.entrance >= 1 && b.phase === 0) hitPods(r); });
      let guard = 0; while (!b.launcher.charging && guard++ < hz * 12) r.frame();
      assert.ok(b.launcher.charging, `${hz}Hz charge window opened`);
      const heavyBefore = heavy.length;
      const startedAt = r.engine.time; let hits = 0, detonatedAt = null, nextHit = startedAt + 0.15;
      const hpBefore = b.hp;
      for (let i = 0; i < hz * 3.4 && b.launcher.charging; i++) {
        r.frame();
        if (r.engine.time >= nextHit && hits < LAUNCHER_HITS) {
          const c = r.g._ctx(1 / hz, r.engine.time);
          assert.equal(b.hitAt(b.launcher.pos.clone(), 1, c), 'launcher'); hits++; nextHit += spacing;
        }
      }
      detonatedAt = b.launcher.charging ? null : r.engine.time - startedAt;
      const missiles = heavy.length - heavyBefore;
      if (spacing === 0.28) {
        assert.equal(hits, LAUNCHER_HITS); assert.equal(b.hp, hpBefore - 14, `${hz}Hz rack detonation damage`);
        assert.ok(detonatedAt < 2.0 && b.stagger > 1.9 && missiles === 0, `${hz}Hz detonated in the rack at ${detonatedAt}`);
      } else {
        assert.ok(hits < LAUNCHER_HITS, `${hz}Hz 0.5 s spacing cannot finish inside 2.6 s (hits ${hits})`);
        assert.ok(missiles >= 1 && b.hp === hpBefore, `${hz}Hz incomplete duel launches the homing missile`);
      }
      r.dispose();
    }
  }
});

test('pause inside a launcher charge keeps the rack count and remaining charge time; resume continues the same window', () => {
  for (const hz of HZ) {
    const r = bossRig({ hz }), b = r.boss; r.g.player.invuln = 1e9;
    r.run(12, () => { if (b.entrance >= 1 && b.phase === 0) hitPods(r); });
    let guard = 0; while (!b.launcher.charging && guard++ < hz * 12) r.frame();
    for (let i = 0; i < hz * 0.5; i++) r.frame();
    const c = r.g._ctx(1 / hz, r.engine.time);
    b.hitAt(b.launcher.pos.clone(), 1, c); b.hitAt(b.launcher.pos.clone(), 1, c);
    const timer = b.launcher.timer, hits = b.launcher.hits;
    r.g.pause(); r.run(8);
    near(b.launcher.timer, timer, 1e-9, `${hz}Hz charge timer frozen`); assert.equal(b.launcher.hits, hits); assert.equal(b.launcher.charging, true);
    r.g.resume(); r.run(0.2);
    assert.ok(b.launcher.timer < timer && b.launcher.charging && b.launcher.hits === 2, `${hz}Hz window resumes`);
    r.dispose();
  }
});

test('boss feedback: armour, pod, weak point and rack hits report distinct kinds; only armour is excluded from accuracy', () => {
  const r = bossRig({ hz: 60 }), b = r.boss, g = r.g; g.player.invuln = 1e9;
  r.run(4);
  b.update = () => {};                                              // freeze the Sentinel for deterministic aiming
  b.group.updateMatrixWorld(true);
  const p = g.player; p.muzzleSide = 0;
  const shoot = (worldPos) => {
    p.pos.set(worldPos.x, worldPos.y + 0.1, worldPos.z - 55); p.velocity.set(0, 0, 0);
    g.rig.snap(p); r.engine.camera.updateMatrixWorld(true);
    const before = r.calls.combat.length, hitsBefore = g.shotsHit;
    g.projectiles.fire(SIDE.PLAYER, worldPos.x, worldPos.y, worldPos.z - 6, 0, 0, 1, 190, { damage: 1, radius: 0.9, life: 1.6, length: 1.15 });
    for (let i = 0; i < 12; i++) r.frame();
    return { kinds: r.calls.combat.slice(before), shotHit: g.shotsHit - hitsBefore };
  };
  const body = shoot(b.pos.clone().add(new THREE.Vector3(0, -2, 0)));
  assert.deepEqual(body.kinds, ['armour']); assert.equal(body.shotHit, 0, 'armour bounce is not accuracy');
  const pod = b.pods[0]; pod.group.getWorldPosition(pod.pos);
  const podShot = shoot(pod.pos.clone());
  assert.deepEqual(podShot.kinds, ['damage']); assert.equal(podShot.shotHit, 1);
  b.coreOpen = 1; const core = new THREE.Vector3(); b.coreGroup.getWorldPosition(core);
  const coreShot = shoot(core);
  assert.deepEqual(coreShot.kinds, ['weak']); assert.equal(coreShot.shotHit, 1);
  r.dispose();
});

test('victory path: boss death -> results once -> Continue banks score into Loop 2 with escalated pace/difficulty and fresh ship state', () => {
  const r = makeRig({ seed: 42 }), g = r.g;
  g.score = 123456; g.kills = 40; g.grazes = 7; g.threads = 3; g.runTime = 321; g._hullBonus = 2;
  g.sectorIndex = 7; g.player.hull = 1; g.player.fuel = 0.2;
  const boss = new Boss(g.scene, g.materials, { z: g.player.pos.z + 120, seed: 1 }); g.boss = boss;
  boss.active = true; boss.entrance = 1;
  const c = g._ctx(1 / 60, 0); boss._die(c);
  assert.ok(g.bossDefeated && boss.alive === false);
  const slow = r.engine._targetTimeScale; near(slow, 0.32, 1e-9, 'boss death slow motion');
  let frames = 0; while (g.state !== STATE.VICTORY && frames++ < 60 * 20) r.frame();
  assert.equal(g.state, STATE.VICTORY, 'ending resolves in bounded time');
  // Telemetry: real seconds from the killing blow to the results card at 60 Hz (see ledger).
  assert.ok(frames / 60 > 5 && frames / 60 < 16, `kill-to-results ${(frames / 60).toFixed(2)} real s`);
  assert.equal(r.calls.results.length, 1, 'one results screen');
  const res = r.calls.results[0];
  assert.equal(res.canContinue, true); assert.match(res.title, /NEUTRALISED/);
  const total = res.rows.find(row => row.total).value;
  assert.ok(Number(total.replace(/,/g, '')) > 123456);
  const bonus = g._victoryBonus, atVictory = g.score;
  assert.ok(atVictory >= 123456 + 15000, 'Sentinel award is in the combat score');
  assert.equal(Number(total.replace(/,/g, '')), atVictory + bonus, 'results total = combat score + time bonus');
  g.continueLoop();
  assert.equal(g.loop, 1); assert.equal(g.state, STATE.PLAYING);
  assert.equal(g.score, atVictory + bonus, 'time bonus is banked exactly once');
  g.continueLoop(); assert.equal(g.score, atVictory + bonus, 'a second continue call outside VICTORY is inert');
  assert.equal(g.kills, 40); assert.equal(g.grazes, 7); assert.equal(g.threads, 3); assert.equal(g._hullBonus, 2); near(g.runTime, 321, 20, 'run time banked');
  assert.equal(g.player.hull, g.player.hullMax); assert.equal(g.player.fuel, 1); assert.equal(g.sectorIndex, 0);
  assert.equal(g._ending, false); assert.equal(g.boss, null);
  near(g.level.paceAt(0), 0.9 * (1 + 0.16), 1e-9, 'loop-2 launch pace');
  assert.ok(g.level.difficultyAt(500) > new Level(1, 0).difficultyAt(500) * 1.3, 'threat escalated');
  // Style awards scale with the loop.
  const before = g.score; g._graze(g.player.pos); assert.equal(g.score - before, 100);
  r.dispose();
});

test('Loop 2 and 3 plans stay learnable: deterministic per seed, opening perimeter slot, fuel lane and grades; pace/threat only rise', () => {
  const signature = level => JSON.stringify([level.totalLength, level.features.length, level.features.slice(0, 40).map(f => [f.kind, Math.round(f.z)])]);
  let lastPace = 0;
  for (let loop = 0; loop <= 3; loop++) {
    const pace = new Level(1, loop).paceAt(2000);
    assert.ok(pace > lastPace, `pace rises with loop ${loop}`); lastPace = pace;
  }
  for (let seed = 1; seed <= 12; seed++) for (const loop of [1, 2]) {
    const a = new Level(seed, loop), b = new Level(seed, loop);
    assert.equal(signature(a), signature(b), `seed ${seed} loop ${loop} reproducible`);
    const perimeter = a.features.find(f => f.perimeter && f.z < 600);
    assert.ok(perimeter && perimeter.type === 'slot' && perimeter.gaps[0].h >= 12, `seed ${seed} loop ${loop} opening`);
    const opening = a.features.filter(f => f.kind === 'fuel' && f.z < 900);
    assert.ok(opening.length >= 2, `seed ${seed} loop ${loop} opening fuel (${opening.length})`);
    assert.equal(a.sectors.length, 8);
    assert.ok(a.difficultyAt(a.sectors[3].zStart + 10) > new Level(seed, 0).difficultyAt(a.sectors[3].zStart + 10));
  }
});

/* ------------------------------------------------------------------ */
/* Game state machine under pause / focus / death                      */
/* ------------------------------------------------------------------ */

test('visibility pause belongs to PLAYING only; title, dying and results ignore it, ending countdown survives it', () => {
  const r = makeRig(); const g = r.g;
  r.engine.onVisibility = visible => { if (!visible && g.state === STATE.PLAYING) g.pause(); };
  g.state = STATE.IDLE; r.engine.dispatchVisibility(false); assert.equal(g.state, STATE.IDLE);
  g.state = STATE.DYING; r.engine.dispatchVisibility(false); assert.equal(g.state, STATE.DYING);
  g.state = STATE.OVER; r.engine.dispatchVisibility(false); assert.equal(g.state, STATE.OVER);
  g.state = STATE.VICTORY; r.engine.dispatchVisibility(false); assert.equal(g.state, STATE.VICTORY);
  g.state = STATE.PLAYING; g._ending = true; g._endingCountdown = 1.4;
  r.engine.dispatchVisibility(false); assert.equal(g.state, STATE.PAUSED);
  r.run(3); near(g._endingCountdown, 1.4, 1e-9, 'victory deadline frozen while paused');
  r.engine.dispatchVisibility(true); assert.equal(g.state, STATE.PAUSED, 'focus never resumes by itself');
  g.resume(); assert.equal(g.state, STATE.PLAYING); assert.equal(r.engine.timeScale, 1);
  r.dispose();
});

test('death: results arrive in bounded real time at every rate, slow motion does not stack, retry restores a full ship', () => {
  for (const hz of HZ) {
    const r = makeRig({ hz }); const g = r.g;
    g.player.hull = 0.2; g.player.shields = 0; g.player.invuln = 0;
    g.player.damage(1, g._ctx(1 / hz, 0));
    assert.equal(g.player.alive, false);
    let frames = 0; while (g.state !== STATE.OVER && frames++ < hz * 8) r.frame();
    assert.equal(g.state, STATE.OVER, `${hz}Hz reached results`);
    assert.ok(frames / hz < 4.2 && frames / hz > 2.0, `${hz}Hz results after ${(frames / hz).toFixed(2)} real s`);
    assert.equal(r.calls.results.length, 1);
    assert.equal(r.calls.results[0].canContinue, false);
    near(r.engine._targetTimeScale, 1, 1e-9);
    g.start(); r.frame();
    assert.equal(g.state, STATE.PLAYING); assert.equal(g.player.hull, 3); assert.equal(g.player.alive, true); assert.equal(g.score, 0); assert.equal(g.chain, 0);
    r.dispose();
  }
});

test('fire (A) held through pause does not confirm the focused menu item; release plus a new press does', () => {
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const original = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [{ connected: true, axes: [0, 0], buttons }] });
  const input = new Input(new EventTarget());
  try {
    const actions = [], screens = Object.create(Screens.prototype);
    let open = false;
    Object.assign(screens, { current: 'pause', stack: [], selIndex: 0, _refreshSelection() {}, _act: a => actions.push(a),
      _items: () => [{ dataset: { action: 'resume' }, classList: { contains: c => c === 'mi' }, matches: () => false }] });
    Object.defineProperty(screens, 'isOpen', { get: () => open });
    input.addEventListener('press', e => { if (input.lastDevice === 'gamepad') screens.handleControl(e.detail); });
    buttons[0].pressed = true; input.update(); input.endFrame();                    // fire held in flight
    open = true; input.reset();                                                     // Game.pause() opens the menu and clears intent only
    for (let i = 0; i < 20; i++) { input.update(); input.endFrame(); }
    assert.deepEqual(actions, [], 'held fire must not activate RESUME');
    buttons[0].pressed = false; input.update(); input.endFrame();
    buttons[0].pressed = true; input.update(); input.endFrame();
    assert.deepEqual(actions, ['resume']);
  } finally {
    input.dispose();
    if (original) Object.defineProperty(navigator, 'getGamepads', original); else delete navigator.getGamepads;
  }
});

/* ------------------------------------------------------------------ */
/* Feedback / audio event timing (event stream only; nothing was listened to)         */
/* ------------------------------------------------------------------ */

test('feedback audit: hull damage, rumble, flash and chain break land on the same simulation step; armour and weak hits use different cues', () => {
  const names = ['hurt', 'shield', 'impact', 'targetHit', 'explosion', 'fuelBoom', 'pass', 'bonus', 'lockTick', 'lowFuel', 'overheat', 'cooled'];
  const original = {}, events = [];
  const clock = { t: 0 };
  for (const name of names) { original[name] = audio[name]; audio[name] = (...a) => { events.push({ name, t: clock.t, a }); }; }
  try {
    const r = makeRig(); const g = r.g, p = g.player;
    g._bumpChain(); g._bumpChain();
    p.pos.set(0, 9, 100); p.shields = 0; p.invuln = 0; g.rig.snap(p);
    g.projectiles.fire(SIDE.ENEMY, 0, 9, 135, 0, 0, -1, 80, { damage: 1, radius: 0.9, life: 4 });
    let rumbleAt = null, hullAt = null;
    const startRumble = r.input.rumbles;
    for (let i = 0; i < 40; i++) {
      clock.t = r.engine.time;
      const hullBefore = p.hull; r.frame();
      if (p.hull < hullBefore && hullAt === null) hullAt = i;
      if (r.input.rumbles > startRumble && rumbleAt === null) rumbleAt = i;
    }
    assert.equal(hullAt, rumbleAt, 'rumble fires on the frame the hull is hit');
    assert.equal(events.filter(e => e.name === 'hurt').length, 1, 'exactly one hurt cue per hit');
    assert.equal(g.chain, 0, 'chain broke with the hit'); assert.ok(r.calls.warns.length >= 0);
    assert.ok(!events.some(e => e.name === 'shield'), 'no shield cue when the hull is hit');
    r.dispose();
  } finally { for (const name of names) audio[name] = original[name]; }

  // Boss armour uses the dry 'impact' cue; weak points use the rising 'targetHit' chirp.
  const spy = []; const impact = audio.impact, targetHit = audio.targetHit;
  audio.impact = (...a) => spy.push('impact'); audio.targetHit = (...a) => spy.push('targetHit:' + (a[2] ? 'weak' : 'plain'));
  try {
    const r = bossRig({ hz: 60 }), b = r.boss; r.g.player.invuln = 1e9; r.run(4); b.update = () => {}; b.group.updateMatrixWorld(true);
    const p = r.g.player; p.muzzleSide = 0;
    const shoot = pos => {
      p.pos.set(pos.x, pos.y + 0.1, pos.z - 55); r.g.rig.snap(p); r.engine.camera.updateMatrixWorld(true);
      r.g.projectiles.fire(SIDE.PLAYER, pos.x, pos.y, pos.z - 6, 0, 0, 1, 190, { damage: 1, radius: 0.9, life: 1.6, length: 1.15 });
      for (let i = 0; i < 12; i++) r.frame();
    };
    shoot(b.pos.clone().add(new THREE.Vector3(0, -2, 0)));
    b.coreOpen = 1; const core = new THREE.Vector3(); b.coreGroup.getWorldPosition(core); shoot(core);
    assert.deepEqual(spy, ['impact', 'targetHit:weak']);
    r.dispose();
  } finally { audio.impact = impact; audio.targetHit = targetHit; }
});

test('threading, graze and low-pass awards are rate independent for the same flight line', () => {
  const level = new Level(42);
  const slot = level.features.find(f => f.kind === 'wall' && f.type === 'slot' && !f.perimeter && !f.debris);
  const g0 = slot.gaps[0], r = 1.5 * 0.72;
  const outcomes = HZ.map(hz => {
    const y = g0.y + r + 0.35;                                       // tight: leaves 0.35 of clearance below
    return straightPass({ hz, x: 0, y, z0: slot.z - 60, z1: slot.z + 30 });
  });
  assert.ok(outcomes.every(o => o.crashes === 0), JSON.stringify(outcomes));
  assert.equal(new Set(outcomes.map(o => o.threads)).size, 1);
  assert.equal(new Set(outcomes.map(o => o.score)).size, 1, 'same style payout at every rate');
  assert.ok(outcomes[0].threads >= 1 && outcomes[0].score > 0);
});

// Renderer setup must succeed before input resumes, including retryable failures.
test('renderer restore failure keeps pad input suspended until a successful retry', () => {
  const r = padRig(), fault = Error('renderer setup failed');
  const resize = r.engine._onResize;
  try {
    r.engine.start(); r.poll(); r.lose();
    r.engine._onResize = () => { throw fault; };
    assert.throws(() => r.restore(), error => error === fault);
    assert.equal(r.engine.input._suspended, true);
    r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'paused');
    assert.equal(r.queued.size, 0);
    r.engine._onResize = resize; r.restore(); r.poll();
    assert.equal(r.engine.input._suspended, false);
    assert.equal(r.log.state, 'paused');
    assert.equal(r.queued.size, 1);
    r.buttons[r.START].pressed = false; r.poll();
    r.buttons[r.START].pressed = true; r.poll();
    assert.equal(r.log.state, 'playing');
  } finally { r.dispose(); }
});
