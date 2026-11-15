// Audio lifecycle through the actual entry (src/main.js) and the actual Audio
// module. Only the browser boundary is modelled: AudioContext state follows the
// documented autoplay policies, where a context starts or resumes only inside
// an activation-triggering event (keydown other than Escape, mouse pointerdown,
// touch pointerup/touchend, click). "chromium" honours sticky activation for
// resume(); "webkit" requires a fresh (transient) gesture every time.
// Nothing here is listened to: these are state assertions, not audio QA.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import { Lifetime, runCleanups } from '../../src/core/Lifetime.js';

globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.matchMedia = () => ({ matches: false });
const window = new EventTarget();
const document = Object.assign(new EventTarget(), { hidden: false, getElementById: () => null });
globalThis.window = window;
globalThis.document = document;

const gesture = { transient: false, sticky: false };
let policy = 'chromium', contexts = [], constructorFault = null, graphFault = null;

function param() {
  return { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
}
function node() {
  const store = { connect() {}, disconnect() {}, start() {}, stop() {} };
  return new Proxy(store, {
    get(target, key) { if (!(key in target)) target[key] = param(); return target[key]; },
    set(target, key, value) { target[key] = value; return true; },
  });
}
class FakeAudioContext {
  constructor() {
    if (constructorFault) throw constructorFault;
    this.sampleRate = 8000; this.currentTime = 0; this.destination = node();
    this.state = this._allowed() ? 'running' : 'suspended';
    this.resumes = 0; this.suspends = 0; this.closed = false;
    contexts.push(this);
  }
  _allowed() { return policy === 'webkit' ? gesture.transient : gesture.sticky; }
  resume() {
    this.resumes++;
    if (this.state === 'closed') return Promise.reject(Error('closed'));
    if (!this._allowed()) return new Promise(() => {}); // stays pending, as browsers do
    this.state = 'running'; return Promise.resolve();
  }
  suspend() { this.suspends++; if (this.state !== 'closed') this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
  createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  createConvolver() { if (graphFault) throw graphFault; return node(); }
}
for (const name of ['Gain', 'DynamicsCompressor', 'WaveShaper', 'BiquadFilter', 'Oscillator', 'BufferSource', 'StereoPanner']) {
  FakeAudioContext.prototype[`create${name}`] = () => node();
}
window.AudioContext = FakeAudioContext;

function activating(type, init) {
  if (type === 'keydown') return init.code !== 'Escape';
  if (type === 'pointerdown') return init.pointerType === 'mouse';
  if (type === 'pointerup') return init.pointerType !== 'mouse';
  return type === 'touchend' || type === 'click';
}
function fire(type, init = {}) {
  const event = Object.assign(new Event(type, { bubbles: true }), init);
  const active = activating(type, init);
  if (active) gesture.sticky = true;
  gesture.transient = active;
  try { window.dispatchEvent(event); } finally { gesture.transient = false; }
}
function setHidden(hidden) { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); }
const tap = () => { fire('pointerdown', { pointerType: 'touch' }); fire('pointerup', { pointerType: 'touch' }); fire('touchend'); fire('click'); };

const { audio } = await import('../../src/audio/Audio.js');
const source = await readFile(new URL('../../src/main.js', import.meta.url), 'utf8');

async function bootEntry() {
  const errors = [];
  let cleanup = () => {};
  class Engine {
    constructor() {
      this._contextLost = false; this.input = new EventTarget(); this.input.lastDevice = 'keyboard';
      this.scene = { traverse() {} }; this.renderer = { getRenderTarget() {}, setRenderTarget() {}, compile() {} };
      this.postfx = { composer: { readBuffer: {} } };
    }
    onUpdate() {} onLateUpdate() {} start() {} stop() {} dispose() {}
  }
  class Screens extends EventTarget {
    constructor() { super(); this.current = 'title'; }
    async boot(work) { await work(); }
    handleControl() { return false; }
    dispose() {}
  }
  class Game {
    constructor() { this.state = 'idle'; }
    prewarm(compile) { compile(); }
    toTitle() {} dispose() {} pause() {} resume() {}
  }
  const noOp = () => {};
  const modules = {
    './style.css': {}, './core/Lifetime.js': { Lifetime, runCleanups }, './core/Engine.js': { Engine },
    './game/Game.js': { Game, STATE: { IDLE: 'idle', PLAYING: 'playing', PAUSED: 'paused' }, parseSeedCode: () => null, seedCode: () => '' },
    './ui/Screens.js': { Screens }, './core/Settings.js': { settings: { get: noOp, set: noOp } },
    './audio/Audio.js': { audio },
    './render/ImportedModels.js': { loadImportedModels: async () => {}, disposeImportedModels: noOp },
    './render/Textures.js': { disposeTextures: noOp }, './entities/Enemies.js': { disposeEnemyGeometry: noOp },
    './entities/Pickup.js': { disposePickupGeometry: noOp }, './world/Fortress.js': { disposeFortressTemplates: noOp },
  };
  const context = createContext({ window, URLSearchParams, location: { search: '' }, matchMedia: globalThis.matchMedia,
    document, console: { error: e => errors.push(e) } });
  const entry = new SourceTextModule(source, { context, initializeImportMeta(meta) {
    meta.env = { DEV: false }; meta.hot = { dispose: fn => { cleanup = fn; } };
  } });
  await entry.link(specifier => {
    const values = modules[specifier]; assert.ok(values, specifier);
    return new SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    }, { context });
  });
  await entry.evaluate();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(errors, []);
  return () => cleanup();
}

const cases = [];
async function scenario(name, run) {
  gesture.sticky = gesture.transient = false; contexts = []; document.hidden = false;
  constructorFault = graphFault = null;
  let shutdown = () => {};
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    shutdown = await bootEntry();
    await run();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(unhandled, [], 'no unhandled audio rejection');
    cases.push({ name, pass: true });
  } catch (error) {
    cases.push({ name, pass: false, error: error?.stack ?? String(error) });
  } finally {
    try { shutdown(); } catch (error) { cases.push({ name: `${name} shutdown`, pass: false, error: String(error) }); }
    process.off('unhandledRejection', onUnhandled);
  }
}
const ctx = () => contexts.at(-1);

for (const p of ['chromium', 'webkit']) {
  await scenario(`${p}: a first touch (non-activating pointerdown) still unlocks audio on the same tap's activating events`, async () => {
    policy = p;
    fire('pointerdown', { pointerType: 'touch' });
    if (ctx()) assert.equal(ctx().state, 'suspended', 'the touch pointerdown alone cannot start audio');
    fire('pointerup', { pointerType: 'touch' }); fire('touchend'); fire('click');
    assert.equal(contexts.length, 1, 'one context');
    assert.equal(ctx().state, 'running', 'menu audio runs after the first tap');
  });
  await scenario(`${p}: Escape first (not a gesture) leaves the next real key able to unlock audio`, async () => {
    policy = p;
    fire('keydown', { code: 'Escape' });
    fire('keydown', { code: 'Enter' });
    assert.equal(contexts.length, 1);
    assert.equal(ctx().state, 'running');
  });
  await scenario(`${p}: an OS interruption after unlock recovers on the next gesture`, async () => {
    policy = p;
    fire('keydown', { code: 'Enter' });
    assert.equal(ctx().state, 'running');
    ctx().state = p === 'webkit' ? 'interrupted' : 'suspended';
    fire('keydown', { code: 'KeyP' });
    assert.equal(ctx().state, 'running', 'the pause/resume key brings sound back');
    ctx().state = 'interrupted';
    tap();
    assert.equal(ctx().state, 'running', 'a tap on the resume button brings sound back');
    assert.equal(contexts.length, 1, 'recovery reuses the context');
  });
  await scenario(`${p}: hiding the page suspends running audio; showing it resumes only what was suspended`, async () => {
    policy = p;
    fire('keydown', { code: 'Enter' });
    assert.equal(ctx().state, 'running');
    setHidden(true);
    assert.equal(ctx().state, 'suspended', 'no audio from a hidden tab');
    fire('keydown', { code: 'KeyA' }); // a gesture cannot arrive while hidden; even so, stay quiet
    assert.equal(ctx().state, 'suspended', 'hidden audio stays suspended');
    setHidden(false);
    if (p === 'webkit') {
      assert.equal(ctx().state, 'suspended', 'webkit needs a fresh gesture');
      tap();
    }
    assert.equal(ctx().state, 'running', 'audio returns with the page');
  });
  await scenario(`${p}: visibility never forces a context the player has not unlocked`, async () => {
    policy = p;
    fire('keydown', { code: 'Escape' });
    const resumes = ctx()?.resumes ?? 0;
    setHidden(true); setHidden(false);
    assert.equal(ctx()?.resumes ?? 0, resumes, 'no resume attempt for audio that never ran');
    assert.notEqual(ctx()?.state, 'running');
  });
}

await scenario('a throwing AudioContext constructor disables audio without an unhandled rejection or retries', async () => {
  policy = 'chromium';
  constructorFault = Error('audio device unavailable');
  const warn = console.warn; const warned = [];
  console.warn = (...args) => warned.push(args);
  try {
    fire('keydown', { code: 'Enter' });
    await new Promise(resolve => setTimeout(resolve, 0));
    constructorFault = null;
    fire('keydown', { code: 'Enter' });
    await audio.init();
  } finally { console.warn = warn; }
  assert.equal(audio.enabled, false); assert.equal(audio.ready, false); assert.equal(audio.ctx, null);
  assert.equal(contexts.length, 0, 'no retry storm after the device failed');
  assert.equal(warned.length, 1, 'the original failure is reported once');
  assert.equal(warned[0].at(-1).message, 'audio device unavailable');
  audio.startEngine(); audio.startMusic('menu'); audio.ui?.('confirm');
});

await scenario('a failed mix-graph build closes the stranded context and leaves audio inert', async () => {
  policy = 'chromium';
  graphFault = Error('convolver unsupported');
  const warn = console.warn; const warned = [];
  console.warn = (...args) => warned.push(args);
  try {
    fire('keydown', { code: 'Enter' });
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally { console.warn = warn; }
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].closed, true, 'stranded context closed');
  assert.equal(audio.ctx, null); assert.equal(audio.ready, false); assert.equal(audio.enabled, false);
  assert.equal(audio._schedTimer ?? null, null, 'no scheduler left running');
  assert.equal(warned[0].at(-1).message, 'convolver unsupported');
});

await scenario('dispose then a fresh entry re-enables audio after an earlier device failure', async () => {
  policy = 'chromium';
  fire('keydown', { code: 'Enter' });
  assert.equal(contexts.length, 1); assert.equal(ctx().state, 'running'); assert.equal(audio.enabled, true);
});

process.stdout.write(JSON.stringify({ cases }));
