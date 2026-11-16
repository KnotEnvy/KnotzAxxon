import { test } from 'node:test';
import assert from 'node:assert/strict';

// The critical missile-lock cue layers over the generic klaxon: Game.warn
// still calls audio.alarm() for every warning (see warning-priority.test.js),
// and additionally calls audio.missileLock() for MISSILE LOCK labels.
import { Game } from './fixtures/studio-feel.mjs';
import { Audio, audio } from '../src/audio/Audio.js';

// Audio.init reads window.AudioContext even for offline contexts; browsers
// already define it.
globalThis.window ??= new EventTarget();

test('a missile lock layers its critical cue over the generic alarm', () => {
  const game = { _warnCooldown: 0, hud: { warn() {} } };
  const calls = [];
  const originalAlarm = audio.alarm;
  const originalLock = audio.missileLock;
  audio.alarm = () => { calls.push('alarm'); };
  audio.missileLock = () => { calls.push('lock'); };
  try {
    Game.prototype.warn.call(game, 'MISSILE LOCK - ROLL');
    assert.deepEqual(calls, ['alarm', 'lock']);
    Game.prototype.warn.call(game, 'BARRAGE');
    assert.deepEqual(calls, ['alarm', 'lock'], 'ordinary warnings keep their cooldown');
    Game.prototype.warn.call(game, 'MISSILE LOCK - ROLL');
    assert.deepEqual(calls, ['alarm', 'lock', 'alarm', 'lock'], 'a second lock still interrupts');
    game._warnCooldown = 0;
    Game.prototype.warn.call(game, 'COOLANT DISCHARGE');
    assert.deepEqual(calls, ['alarm', 'lock', 'alarm', 'lock', 'alarm'], 'ordinary warnings stay klaxon-only');
  } finally {
    audio.alarm = originalAlarm;
    audio.missileLock = originalLock;
  }
});

test('missileLock schedules a rising pip train, throttles, and stays inert unready', async () => {
  const record = { osc: [], noise: [] };
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {},
    linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => new Proxy({ connect() {}, disconnect() {}, start() {}, stop() {} }, {
    get(target, key) { if (!(key in target)) target[key] = param(); return target[key]; },
    set(target, key, value) { target[key] = value; return true; },
  });
  const fake = {
    sampleRate: 8000, currentTime: 0, destination: node(),
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
    createConvolver: () => node(),
    createGain: () => node(),
    createDynamicsCompressor: () => node(),
    createWaveShaper: () => node(),
    createBiquadFilter: () => node(),
    createStereoPanner: () => node(),
    createOscillator: () => {
      const o = node();
      const entry = { type: null, freq: null, t0: null, dur: null };
      const inner = o.frequency;
      o.frequency = new Proxy(inner, {
        get: (t, k) => (k === 'setValueAtTime' ? ((v, t0) => { entry.freq = v; }) : t[k]),
        set: (t, k, v) => { t[k] = v; return true; },
      });
      const origStart = o.start.bind(o);
      o.start = (t0) => { entry.t0 = t0; record.osc.push(entry); origStart(); };
      const origConnect = o.connect.bind(o);
      o.connect = (...args) => origConnect(...args);
      Object.defineProperty(o, 'type', { set(v) { entry.type = v; }, get: () => entry.type });
      o.stop = () => {};
      return o;
    },
    createBufferSource: () => {
      const s = node();
      const entry = { t0: null, dur: null };
      s.start = (t0) => { entry.t0 = t0; record.noise.push(entry); };
      s.stop = () => {};
      return s;
    },
  };

  // Unready instance: silent, no nodes, no throw.
  const cold = new Audio();
  cold.missileLock();
  cold.alarm();
  assert.deepEqual(record.osc, []);
  assert.deepEqual(record.noise, []);

  const a = new Audio();
  await a.init(fake);
  assert.equal(a.ready, true);
  record.osc.length = 0;
  record.noise.length = 0;

  a.at(10).missileLock();
  assert.equal(record.osc.length, 3, 'three pips');
  assert.ok(record.osc.every(o => o.type === 'square'));
  const freqs = record.osc.map(o => o.freq);
  assert.ok(freqs[0] < freqs[1] && freqs[1] < freqs[2], `rising contour, got ${freqs}`);
  assert.ok(Math.abs(freqs[0] - 1174.66) < 20 && Math.abs(freqs[2] - 1567.98) < 25);
  const starts = record.osc.map(o => o.t0);
  assert.ok(Math.abs(starts[1] - starts[0] - 0.105) < 1e-9);
  assert.ok(Math.abs(starts[2] - starts[1] - 0.105) < 1e-9);
  assert.equal(record.noise.length, 3, 'one click per pip front');

  // Throttled inside the 0.5 s window, live again after it.
  record.osc.length = 0;
  record.noise.length = 0;
  a.at(10.2).missileLock();
  assert.deepEqual(record.osc, [], 'repeat inside the window is swallowed');
  a.at(10.6).missileLock();
  assert.equal(record.osc.length, 3, 'fires again after the window');

  // The klaxon keeps its single-sweep shape under the new layer.
  record.osc.length = 0;
  a.at(20).alarm();
  assert.equal(record.osc.length, 1);
  assert.equal(record.osc[0].type, 'sawtooth');
  a.dispose();
});
