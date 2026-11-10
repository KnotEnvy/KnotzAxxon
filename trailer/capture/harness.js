// Trailer harness: runs inside the real game page (dev build, window.KZ) on
// the virtual clock from clock.js. The capture scripts drive it through T.
//
//   T.setup(spec)   build a scene: seed, camera rig, CRT, sector, pilot, preroll
//   T.frame(speed)  one output frame (speed < 1 is real slow motion), rendered
//   T.renderAlt()   re-render the same instant through a second camera rig
//   T.state()       a small status object for probes and logs
//
// Hits are absorbed and logged (god mode); the game's audio calls are logged
// per frame instead of played, and replayed offline by the sound pass.
import * as THREE from 'three';
import { CAMERA_MODES, settings } from '/src/core/Settings.js';
import { CameraRig } from '/src/game/CameraRig.js';
import { rand, damp, DEG } from '/src/core/Utils.js';
import { createPilot } from '/trailer/capture/pilot.js';

const { engine, game, screens, audio } = window.KZ;
const DT = 1 / 60;
const MAX_STEP = 1 / 60;
export const DEFAULT_SEED = 0x4b5a; // fortress code "000EAS"... any fixed seed works

/* ---------------- audio: record, don't play ---------------- */
const alog = [];
let recording = false;
const AUDIO_KEEP = new Set(['constructor', 'panFor', 'at']);
const audioProto = Object.getPrototypeOf(audio);
for (const name of Object.getOwnPropertyNames(audioProto)) {
  if (AUDIO_KEEP.has(name) || name.startsWith('_') || typeof audioProto[name] !== 'function') continue;
  audio[name] = (...args) => {
    if (recording) alog.push({ f: frameNo, n: name, a: args.map(a => (typeof a === 'number' ? +a.toFixed(4) : a)) });
    return name === 'init' ? Promise.resolve() : undefined;
  };
}

/* ---------------- god mode with an audit ---------------- */
let absorbed = [];
let allowHits = 0;
let frameNo = 0;
const p = game.player;
const realDamage = p.damage.bind(p);
p.damage = (amount, ctx, opts = {}) => {
  if (allowHits > 0) { allowHits--; return realDamage(amount, ctx, opts); }
  if (opts.source === 'fuel') return 'none';
  if (p.invuln > 0 && !opts.ignoreInvuln) return 'none';
  absorbed.push({ f: frameNo, kind: opts.pierce ? 'terrain' : 'hit' });
  return 'none';
};
const realCrash = game._crash.bind(game);
game._crash = (ctx, collider, tag) => {
  if (allowHits > 0) return realCrash(ctx, collider, tag);
  absorbed.push({ f: frameNo, kind: 'crash:' + tag });
};

/* ---------------- spare rigs for comparisons and the morph ---------------- */
const rigs = {};
function rigFor(name) {
  if (!rigs[name]) {
    const saved = saveCamera();
    const r = new CameraRig(engine.camera);
    configureRig(r, name);
    // Start settled on the ship, not at the rig's default origin.
    r.snap(p);
    restoreCamera(saved);
    rigs[name] = r;
  }
  return rigs[name];
}
function configureRig(r, name) {
  const m = CAMERA_MODES[name];
  r.yaw = m.yaw * DEG; r.dist = m.dist; r.height = m.height; r.fovBase = m.fov; r.fov = m.fov;
  r.classic = name === 'classic';
  r.extraDist = game.rig.extraDist;
}
const cam = engine.camera;
function saveCamera() {
  return { pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov, near: cam.near, far: cam.far,
    classic: cam.classic, halfHeight: cam.halfHeight, persp: cam.isPerspectiveCamera };
}
function restoreCamera(s) {
  cam.position.copy(s.pos); cam.quaternion.copy(s.quat); cam.up.copy(s.up);
  cam.fov = s.fov; cam.near = s.near; cam.far = s.far;
  cam.setFlightProjection(s.classic, s.halfHeight);
  cam.updateMatrixWorld(true);
}
function rigShot(name, dt, time, writeOnly = false) {
  const r = rigFor(name);
  r.extraDist = game.rig.extraDist;
  r.update(writeOnly ? 0 : dt, time, p, { trauma: game.fx.trauma, boost: p.boosting ? 1 : 0 });
  return { pos: r.position.clone(), look: r.lookAt.clone(), classic: r.classic, half: r._halfHeight(), fov: r.fov };
}

// Ortho (classic) -> perspective morph: a dolly zoom from a near-zero field of
// view far away (which reads as orthographic) down to the target rig.
let fogBase = null;
const _d = new THREE.Vector3(), _da = new THREE.Vector3(), _db = new THREE.Vector3();
function applyMorph(a, b, u) {
  const e = u * u * (3 - 2 * u);
  const look = a.look.clone().lerp(b.look, e);
  _da.copy(a.pos).sub(a.look).normalize();
  _db.copy(b.pos).sub(b.look).normalize();
  _d.copy(_da).lerp(_db, e).normalize();
  const fovB = b.fov;
  const hb = Math.tan(fovB * DEG / 2) * b.pos.distanceTo(b.look);
  const ha = a.half;
  const H = Math.exp(Math.log(ha) + (Math.log(hb) - Math.log(ha)) * e);
  const F = Math.exp(Math.log(5) + (Math.log(fovB) - Math.log(5)) * e);
  const D = H / Math.tan(F * DEG / 2);
  // Exponential fog is by view depth: keep the fortress at the same haze as
  // the rigs themselves see it while the camera is pulled far back.
  const fog = engine.scene.fog;
  if (fog) {
    fogBase ??= fog.density;
    const ref = a.pos.distanceTo(a.look) + (b.pos.distanceTo(b.look) - a.pos.distanceTo(a.look)) * e;
    fog.density = fogBase * Math.min(1, ref / D);
  }
  cam.classic = false; cam.isPerspectiveCamera = true; cam.isOrthographicCamera = false;
  cam.fov = F;
  cam.near = Math.max(0.35, D * 0.12);
  cam.far = D + engine.camera.userData.baseFar;
  cam.position.copy(look).addScaledVector(_d, D);
  cam.up.set(0, 1, 0);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
}
cam.userData.baseFar = cam.far;

/* ---------------- CRT and HUD ---------------- */
function setCrt(on) {
  settings.set('scanlines', !!on);
}
function setHud(on, fade = 0) {
  const el = document.getElementById('hud');
  el.style.transition = fade ? `opacity ${fade}s ease` : 'none';
  el.style.opacity = on ? '' : '0';
}

/* ---------------- shader NaN guard (game bugs, patched for capture) -------
   Two of the game's shaders take pow() of a value that rounding can push a hair
   below zero: the planet's limb term (src/render/CelestialMaterials.js) and the
   engine exhaust ribbon's edge falloff (src/fx/Trail.js). pow() of a negative
   base is undefined; on ANGLE/D3D it returns NaN, and the bloom blur smears that
   one pixel into a black rectangle. Every custom shader in the scene gets a
   pow() that clamps its base at zero, which changes nothing that renders
   correctly. The game's source is left as it is. */
const POW_GUARD = '#define pow(a, b) pow(max((a), 0.0), (b))\n';
function patchPlanet() {
  engine.scene.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      if (!m?.isShaderMaterial || m.userData.__powGuard) continue;
      m.userData.__powGuard = true;
      m.vertexShader = POW_GUARD + m.vertexShader;
      m.fragmentShader = POW_GUARD + m.fragmentShader;
      m.needsUpdate = true;
    }
  });
}

/* ---------------- scene setup ---------------- */
let spec = null, pilot = null, script = [], morph = null, gameClock = 0;

function teleport(z, card) {
  const lvl = game.level;
  const target = lvl.sectorAt(z);
  // Skipped sectors are not graded on camera.
  for (let i = 0; i < target.index; i++) if (game._sectorStats[i]) game._sectorStats[i].grade = 'S';
  p.pos.z = z;
  p.trails?.forEach(t => t.reset(p.pos));
  game.featureCursor = lvl.features.findIndex(f => f.z >= z - 30);
  if (game.featureCursor < 0) game.featureCursor = lvl.features.length;
  game._hudCursor = game._passCursor = game.featureCursor;
  game.sectorIndex = target.index;
  game._enterSector(target.index);
  if (!card) {
    clearTimeout(screens._cardT);
    document.getElementById('screen-sector')?.classList.remove('is-active');
  }
}

function setup(s) {
  spec = s;
  window.__vt.start();
  engine.stop();
  engine.onVisibility = null;
  settings.set('camera', s.camera ?? 'classic');
  setCrt(!!s.crt);
  settings.set('shadowLine', s.guide ?? true);
  settings.set('shake', s.shake ?? 0.7);
  settings.set('assist', false);
  recording = false;
  game.start({ seed: s.seed ?? DEFAULT_SEED });
  rand.reset(s.rng ?? 7);
  window.__vt.reseed(s.rng ?? 7);
  absorbed = []; alog.length = 0; allowHits = 0; frameNo = 0; gameClock = 0; morph = null;
  for (const k of Object.keys(rigs)) delete rigs[k];

  if (s.z != null || s.sector != null) {
    const z = s.z ?? (game.level.sectors[s.sector].zStart + (s.into ?? 0));
    teleport(Math.max(0, z), !!s.card);
  }
  if (s.player) { p.pos.x = s.player.x ?? p.pos.x; p.pos.y = s.player.y ?? p.pos.y; }
  if (s.kit) Object.assign(p, s.kit);
  if (s.score != null) game.score = s.score;
  game.rig.snap(p);
  pilot = createPilot(game, s.pilot || {});
  script = [];

  // Warm the streamer so the chunk under the ship exists before frame 0.
  for (let i = 0; i < 16; i++) { engine.frame++; game.fortress.update(p.pos.z, 0, engine.time, engine.frame); }

  // Simulate (no draw) up to the moment the shot starts.
  const pre = Math.round((s.prerollSeconds || 0) * 60);
  for (let i = 0; i < pre; i++) step(1, false);
  if (s.after) (0, eval)(s.after);
  for (let i = 0; i < Math.round((s.prerollAfter || 0) * 60); i++) step(1, false);
  patchPlanet();
  frameNo = 0; absorbed = []; alog.length = 0;
  script = (s.script || []).map(x => ({ ...x, done: false }));
  recording = true;
  setHud(s.hud ?? true);
  // Menus fading out from boot must not leak into frame 0.
  for (const a of document.getAnimations()) { try { a.finish(); } catch (_) { a.cancel(); } }
  window.__vt.syncAnimations();
  // A sector card at frame 0 starts its reveal on the shot's clock.
  if (s.card) screens.sectorCard(game.level.sectors[game.sectorIndex]);
  window.__vt.syncAnimations();
  return state();
}

function runScript(input) {
  for (const x of script) {
    if (x.done || frameNo < x.f) continue;
    // `to`: repeat every frame from f to `to` (inclusive)
    if (x.to == null || frameNo >= x.to) x.done = true;
    switch (x.do) {
      case 'roll': input.roll = true; if (x.dir != null) input.moveX = x.dir; break;
      case 'pilot': pilot.set(x.opts || {}); break;
      case 'crt': setCrt(x.on); break;
      case 'hud': setHud(x.on, x.fade ?? 0); break;
      case 'camera': settings.set('camera', x.rig); game.rig.applyRig(); if (x.snap) game.rig.snap(p); break;
      case 'morph': morph = { from: x.from, to: x.to, f0: x.f, f1: x.f + x.frames }; rigFor(x.from); rigFor(x.to); break;
      case 'hit': allowHits = x.n ?? 1; break;
      case 'card': screens.sectorCard(game.level.sectors[x.sector ?? game.sectorIndex]); break;
      case 'eval': (0, eval)(x.code); break;
    }
  }
}

/** Advance one output frame worth of time. */
function step(speed = 1, draw = true) {
  const rawDt = DT * speed;
  window.__vt.advance(rawDt * 1000);
  engine.realDelta = rawDt;
  engine.frame++;
  // The engine's own time scaling: hit-stop freezes and the boss-kill slow-mo.
  if (engine._hitStop > 0) { engine._hitStop -= rawDt; engine.timeScale = engine._hitStopScale; }
  else engine.timeScale = damp(engine.timeScale, engine._targetTimeScale, 9, rawDt);
  const dt = rawDt * engine.timeScale;

  const input = engine.input;
  const cmd = { roll: false, moveX: null };
  if (game.state === 'playing' && pilot) {
    const c = pilot.input(dt);
    input.moveX = c.moveX; input.moveY = c.moveY; input.fire = c.fire; input.boost = c.boost;
    p.fuel = Math.max(p.fuel, spec?.minFuel ?? 0.55);
  }
  runScript(cmd);
  // Scripted boss shots keep the robot alive until the script says otherwise.
  if (spec?.bossMinHp && game.boss?.alive) game.boss.hp = Math.max(game.boss.hp, spec.bossMinHp);
  if (cmd.moveX != null) input.moveX = cmd.moveX;
  if (cmd.roll) input.pressed.add('roll');

  const steps = Math.max(1, Math.min(4, Math.ceil(dt / MAX_STEP - 1e-9)));
  for (let s = 0; s < steps; s++) {
    engine.time += dt / steps;
    game.update(dt / steps, engine.time, rawDt / steps);
  }
  game.lateUpdate(dt, engine.time);
  engine.materials.update(engine.time);
  engine.postfx.update(rawDt, engine.time);
  input.pressed.clear();
  input.endFrame?.();

  // Keep the spare rigs warm every frame so they are settled when used.
  if (Object.keys(rigs).length) {
    const saved = saveCamera();
    for (const name of Object.keys(rigs)) rigShot(name, dt, engine.time);
    restoreCamera(saved);
  }
  if (morph && frameNo >= morph.f0) {
    const u = Math.min(1, (frameNo - morph.f0) / Math.max(1, morph.f1 - morph.f0));
    const a = rigShot(morph.from, dt, engine.time, true), b = rigShot(morph.to, dt, engine.time, true);
    if (u < 1) applyMorph(a, b, u);
    else {
      // Hand over to the game's own rig on the target setting.
      settings.set('camera', morph.to); game.rig.applyRig();
      game.rig.position.copy(rigs[morph.to].position); game.rig.lookAt.copy(rigs[morph.to].lookAt);
      game.rig.fov = rigs[morph.to].fov;
      cam.near = 0.35; cam.far = cam.userData.baseFar;
      const fog = engine.scene.fog;
      if (fog && fogBase != null) { fog.density = fogBase; fogBase = null; }
      game.rig.update(dt, engine.time, p, { trauma: game.fx.trauma, boost: p.boosting ? 1 : 0 });
      morph = null;
    }
  }
  if (draw) {
    engine.renderer.info.reset();
    engine.postfx.render(dt);
    finishGpu();
  }
  patchPlanet();
  window.__vt.syncAnimations();
  gameClock += rawDt;
  frameNo++;
}

function frame(speed = 1) {
  step(speed, true);
  // A shot must never leave play behind our back (pause, game over).
  if (!['playing', 'dying', 'victory'].includes(game.state)) throw new Error(`game state ${game.state} at frame ${frameNo}`);
  return frameNo;
}

/** Simulate n frames, drawing only the last one. */
function run(n, speed = 1) { for (let i = 0; i < n; i++) step(speed, i === n - 1); return state(); }

/** Re-render this instant through another rig (and CRT setting); restore after. */
let pendingRestore = null;
function renderAlt(name, crt = false) {
  restoreAlt();
  pendingRestore = renderAltInner(name, crt);
  return true;
}
function restoreAlt() { if (pendingRestore) { pendingRestore(); pendingRestore = null; } }
/** Draw the current instant again (glitch retakes). */
function redraw() { engine.postfx.render(0); finishGpu(); return true; }
/** Block until the GPU has finished the frame, so the screenshot never reads a half-drawn canvas. */
function finishGpu() { engine.renderer.getContext().finish(); }
function renderAltInner(name, crt = false) {
  const saved = saveCamera();
  const crtWas = settings.get('scanlines');
  const r = rigShot(name, 0, engine.time, true);
  const sil = p.model?.userData?.silhouette;
  const silWas = sil?.visible;
  if (sil) sil.visible = r.classic;
  rigs[name].update(0, engine.time, p, { trauma: game.fx.trauma, boost: p.boosting ? 1 : 0 });
  if (!r.classic) { cam.fov = rigs[name].fov; cam.updateProjectionMatrix(); }
  if (crt !== crtWas) setCrt(crt);
  game.fx.setViewport(engine.renderer.getDrawingBufferSize(new THREE.Vector2()).y, cam);
  game.projectiles.render(cam);
  engine.postfx.render(0);
  finishGpu();
  return () => {
    restoreCamera(saved);
    if (sil) sil.visible = silWas;
    if (crt !== crtWas) setCrt(crtWas);
    game.projectiles.render(cam);
  };
}

function state() {
  const b = game.boss;
  return {
    frame: frameNo, t: +gameClock.toFixed(3), z: +p.pos.z.toFixed(1), x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2),
    sector: game.sectorIndex, state: game.state, score: game.score, chain: game.chainMult, kills: game.kills,
    enemies: game.enemies.length, pilot: pilot?.mode, absorbed: absorbed.length,
    boss: b ? { active: !!b.active, alive: !!b.alive, phase: b.phase, hp: +(b.hp / (b.maxHp || 1)).toFixed(3) } : null,
  };
}

export const T = {
  setup, frame, step, run, renderAlt, restoreAlt, redraw, state, setHud, setCrt,
  get absorbed() { return absorbed; }, get audioLog() { return alog; },
  get game() { return game; }, get pilot() { return pilot; }, get engine() { return engine; },
  allowHit(n = 1) { allowHits = n; },
  ctx() { return game._ctx(DT, engine.time); },
  get boss() { return game.boss; },
  /** Destroy both shoulder cannons the way shots would (phase 0 -> 1). */
  killPods() { const b = game.boss, c = game._ctx(DT, engine.time); for (const pod of b.pods) if (pod.alive) b.hitAt(pod.pos.clone(), 999, c); },
  ready: true,
};
