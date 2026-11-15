import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Lifetime } from '../src/core/Lifetime.js';

globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { hidden: false, getElementById: () => null });
globalThis.HTMLInputElement = class {};
const { Engine } = await import('../src/core/Engine.js');
const { Input } = await import('../src/core/Input.js');

function padAccess(read) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'getGamepads');
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: read });
  return () => {
    if (original) Object.defineProperty(navigator, 'getGamepads', original);
    else delete navigator.getGamepads;
  };
}

test('failed Engine construction releases assigned resources and subscriptions, preserving the startup error', () => {
  const canvas = new EventTarget(), fault = Error('scene initialization failed');
  let rendererDisposals = 0, callbacks = 0;
  class FailingEngine extends Engine {
    _initRenderer() {
      this.renderer = { dispose() { rendererDisposals++; } };
      this._lifetime.listen(canvas, 'probe', () => callbacks++);
    }
    _initScene() { throw fault; }
  }
  assert.throws(() => new FailingEngine(canvas), error => error === fault);
  canvas.dispatchEvent(new Event('probe'));
  assert.equal(rendererDisposals, 1);
  assert.equal(callbacks, 0);
});

test('Engine disposal reaches later owners after an earlier disposer throws and remains idempotent', () => {
  const disposed = [], fault = Error('postfx disposal failed');
  const engine = Object.create(Engine.prototype);
  Object.assign(engine, {
    _lifetime: new Lifetime(), _updateHooks: [], _lateHooks: [],
    postfx: { dispose() { disposed.push('postfx'); throw fault; } },
  });
  for (const key of ['input', 'underlay', 'sky', 'materials', 'renderer']) {
    engine[key] = { dispose() { disposed.push(key); } };
  }
  assert.throws(() => engine.dispose());
  engine.dispose();
  assert.deepEqual(disposed, ['input', 'postfx', 'underlay', 'sky', 'materials', 'renderer']);
});

test('one failed subscription removal cannot leave other subscriptions or waits alive', async () => {
  const scope = new Lifetime(), target = new EventTarget();
  let calls = 0;
  scope.listen({ addEventListener() {}, removeEventListener() { throw Error('remove failed'); } }, 'tick', () => {});
  scope.listen(target, 'tick', () => calls++);
  const pending = scope.delay(100);
  assert.throws(() => scope.dispose());
  target.dispatchEvent(new Event('tick'));
  // Race the pending wait against an immediate sentinel: do not hang on the regression.
  assert.equal(await Promise.race([pending, Promise.resolve('unsettled')]), false);
  assert.equal(calls, 0);
  assert.equal(scope.cleanups.size, 0);
  scope.dispose();
});

test('failed Input construction detaches the keyboard listeners already installed', () => {
  const root = new EventTarget(), fault = Error('pointer binding failed');
  let presses = 0;
  class FailingInput extends Input {
    _bindPointer() { this.addEventListener('press', () => presses++); throw fault; }
  }
  assert.throws(() => new FailingInput(root), error => error === fault);
  root.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false }));
  assert.equal(presses, 0);
});

test('denied gamepad access releases stale pad intent and keyboard controls keep working', () => {
  const root = new EventTarget(), input = new Input(root);
  const restore = padAccess(() => { throw new DOMException('Blocked by policy', 'SecurityError'); });
  try {
    input._padDown.add('fire'); input._padVecX = 1; input.hasGamepad = true;
    root.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false }));
    input.update();
    assert.equal(input.fire, false);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveY, 1);
    assert.equal(input.hasGamepad, false);
    assert.doesNotThrow(() => input.rumble());
  } finally { restore(); input.dispose(); }
});

test('optional haptics tolerate synchronous device failures and void API results', () => {
  const input = new Input(new EventTarget());
  let calls = 0;
  const restore = padAccess(() => [
    { vibrationActuator: { playEffect() { calls++; throw Error('device disconnected'); } } },
    { vibrationActuator: { playEffect() { calls++; } } },
  ]);
  try { assert.doesNotThrow(() => input.rumble()); assert.equal(calls, 2); }
  finally { restore(); input.dispose(); }
});

function suspendedEngine() {
  const queued = new Map(); let id = 0;
  globalThis.requestAnimationFrame = fn => { queued.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = key => queued.delete(key);
  const engine = Object.create(Engine.prototype);
  let resets = 0;
  Object.assign(engine, { _disposed: false, _contextLost: false, _updateHooks: [],
    input: { reset() { resets++; } }, sky: { _bake() {} }, renderer: { shadowMap: {} }, _onResize() {} });
  return { engine, queued, resets: () => resets };
}

test('context loss clears held intent and notifies pause ownership before restoring one RAF', () => {
  const { engine, queued, resets } = suspendedEngine();
  const visible = []; engine.onVisibility = value => visible.push(value);
  engine.start(); engine._onContextLost({ preventDefault() {} });
  assert.equal(queued.size, 0);
  assert.equal(resets(), 1);
  assert.deepEqual(visible, [false]);
  engine._onContextRestored();
  assert.equal(queued.size, 1);
  engine.stop();
});

test('visible window blur reaches pause ownership and focus does not resume gameplay', () => {
  class HeadlessEngine extends Engine {
    _initRenderer() { this.renderer = { dispose() {} }; }
    _initScene() {}
  }
  const engine = new HeadlessEngine(new EventTarget());
  const visibility = [];
  engine.onVisibility = visible => visibility.push(visible);
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
  assert.deepEqual(visibility, [false, true]);
  engine.dispose();
  window.dispatchEvent(new Event('blur'));
  assert.deepEqual(visibility, [false, true]);
});

test('entry restores the prewarm render target and finishes shutdown despite a failing Game disposer', async () => {
  const { spawnSync } = await import('node:child_process');
  const fixture = new URL('./fixtures/startup-lifecycle.mjs', import.meta.url);
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(fixture)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const outcomes = JSON.parse(result.stdout);
  for (const outcome of outcomes) {
    assert.equal(outcome.targetRestored, true, outcome.failure);
    assert.deepEqual(outcome.calls.filter(name => !name.endsWith('-target')),
      ['stop', 'game', 'screens', 'audio', 'enemies', 'pickups', 'fortress', 'engine', 'textures', 'imports']);
    assert.equal(outcome.debugRemoved, true);
    if (outcome.failure !== 'shutdown') {
      assert.equal(outcome.loggedOriginal, true);
      assert.equal(outcome.fatalContainsOriginal, true);
    } else assert.equal(outcome.shutdownThrew, true);
  }
});

test('a held controller pause cannot resume behind a blurred window or on refocus', () => {
  class HeadlessEngine extends Engine {
    _initRenderer() { this.renderer = { dispose() {} }; }
    _initScene() {}
  }
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const restore = padAccess(() => [{ connected: true, axes: [0, 0], buttons }]);
  const engine = new HeadlessEngine(new EventTarget());
  let state = 'playing';
  engine.onVisibility = visible => { if (!visible) state = 'paused'; };
  engine.input.addEventListener('press', event => {
    if (event.detail === 'pause') state = state === 'paused' ? 'playing' : 'paused';
  });
  try {
    buttons[9].pressed = true; engine.input.update();
    state = 'playing'; // the same physical button is still held when focus leaves
    window.dispatchEvent(new Event('blur'));
    for (let i = 0; i < 3; i++) engine.input.update();
    assert.equal(state, 'paused');
    window.dispatchEvent(new Event('focus')); engine.input.update();
    assert.equal(state, 'paused');
    // A press made entirely while blurred must not activate a menu either.
    window.dispatchEvent(new Event('blur'));
    buttons[9].pressed = false; engine.input.update();
    buttons[9].pressed = true; engine.input.update();
    window.dispatchEvent(new Event('focus')); engine.input.update();
    assert.equal(state, 'paused');
    buttons[9].pressed = false; engine.input.update();
    buttons[9].pressed = true; engine.input.update();
    assert.equal(state, 'playing');
  } finally { restore(); engine.dispose(); }
});


test('controller pause pressed while blurred stays gated when no background frames run', () => {
  class HeadlessEngine extends Engine {
    _initRenderer() { this.renderer = { dispose() {} }; }
    _initScene() {}
  }
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const restore = padAccess(() => [{ connected: true, axes: [0, 0], buttons }]);
  const engine = new HeadlessEngine(new EventTarget());
  let state = 'playing';
  engine.onVisibility = visible => { if (!visible) state = 'paused'; };
  engine.input.addEventListener('press', event => {
    if (event.detail === 'pause') state = state === 'paused' ? 'playing' : 'paused';
  });
  try {
    engine.input.update();
    window.dispatchEvent(new Event('blur'));
    buttons[9].pressed = true;
    // Background rAF can be suspended: no input polls before focus returns.
    window.dispatchEvent(new Event('focus'));
    engine.input.update();
    assert.equal(state, 'paused');
    buttons[9].pressed = false; engine.input.update();
    buttons[9].pressed = true; engine.input.update();
    assert.equal(state, 'playing');
  } finally { restore(); engine.dispose(); }
});


test('touch fire and roll queued during suspension are cleared before the restored frame', () => {
  const ids = ['viewport', 'touch-stick', 'tb-fire', 'tb-boost', 'tb-roll', 'tb-pause'];
  const nodes = new Map(ids.map(id => [id, new EventTarget()]));
  nodes.get('touch-stick').querySelector = () => null;
  const oldLookup = document.getElementById;
  document.getElementById = id => nodes.get(id) ?? null;
  let input;
  try {
    input = new Input(new EventTarget());
    input.setSuspended(true);
    nodes.get('tb-fire').dispatchEvent(new Event('touchstart', { cancelable: true }));
    nodes.get('tb-roll').dispatchEvent(new Event('touchstart', { cancelable: true }));
    input.setSuspended(false); input.update();
    assert.equal(input.fire, false);
    assert.equal(input.justPressed('fire'), false);
    assert.equal(input.justPressed('roll'), false);
    nodes.get('tb-fire').dispatchEvent(new Event('touchstart', { cancelable: true }));
    nodes.get('tb-roll').dispatchEvent(new Event('touchstart', { cancelable: true }));
    input.update();
    assert.equal(input.fire, true);
    assert.equal(input.justPressed('fire'), true);
    assert.equal(input.justPressed('roll'), true);
  } finally { input?.dispose(); document.getElementById = oldLookup; }
});
