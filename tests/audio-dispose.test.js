import { test } from 'node:test';
import assert from 'node:assert/strict';

// Audio.dispose() must retire every independent resource exactly once even
// when one retirement throws: music/engine stop, listener cleanup, scheduler
// timer, mix graph, context close (owned contexts only) and field reset.
// Failures are reported together via runCleanups' AggregateError contract.
import { Audio } from '../src/audio/Audio.js';

globalThis.window ??= new EventTarget();
globalThis.document ??= Object.assign(new EventTarget(), { hidden: false });

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
    this.sampleRate = 8000; this.currentTime = 0; this.destination = node();
    this.state = 'running'; this.closeCalls = 0; this.closed = false;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closeCalls++; this.closed = true; this.state = 'closed'; return Promise.resolve(); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createConvolver() { return node(); }
}
for (const name of ['Gain', 'DynamicsCompressor', 'WaveShaper', 'BiquadFilter', 'Oscillator', 'BufferSource', 'StereoPanner']) {
  FakeAudioContext.prototype[`create${name}`] = () => node();
}
globalThis.window.AudioContext = FakeAudioContext;

async function makeAudio() {
  const a = new Audio();
  await a.init();
  assert.equal(a.ready, true);
  return a;
}

/** A listener whose removal throws, exercising the real Lifetime removal path. */
function throwingListener(a) {
  a._lifetime.listen({ addEventListener() {}, removeEventListener() { throw Error('remove-boom'); } }, 'x', () => {});
}

/** Hand-built engine nodes whose first gain update throws inside real stopEngine. */
function throwingEngine(a) {
  const out = node();
  out.gain.setTargetAtTime = () => { throw Error('engine-boom'); };
  a._engineNodes = { out, hum: node(), crackleG: node(), whistle: node(),
    windG: node(), airG: node(), reactorG: node(), droneG: node() };
}

function throwingGraph(a) {
  let calls = 0;
  a._releaseGraph = () => { calls++; throw Error('graph-boom'); };
  return () => calls;
}

test('a throwing listener removal still retires timer, context and fields', async () => {
  const a = await makeAudio();
  throwingListener(a);
  const ctx = a.ctx;
  await assert.rejects(async () => a.dispose(), AggregateError);
  assert.equal(a._lifetime.closed, true);
  assert.equal(a._schedTimer, null);
  assert.equal(ctx.closed, true, 'owned context is closed despite the listener failure');
  assert.equal(ctx.closeCalls, 1);
  assert.equal(a.ctx, null);
  assert.equal(a.ready, false);
  assert.equal(a.enabled, true);
});

test('a throwing stopEngine still removes listeners, stops the timer and closes', async () => {
  const a = await makeAudio();
  throwingEngine(a);
  const ctx = a.ctx;
  let err = null;
  try { a.dispose(); } catch (e) { err = e; }
  assert.ok(err instanceof AggregateError, `expected AggregateError, got ${err}`);
  assert.equal(a._lifetime.closed, true);
  assert.equal(a._schedTimer, null);
  assert.equal(ctx.closed, true);
  assert.equal(a.ctx, null);
});

test('a throwing mix-graph release still closes the context and resets fields', async () => {
  const a = await makeAudio();
  const graphCalls = throwingGraph(a);
  const ctx = a.ctx;
  await assert.rejects(async () => a.dispose(), AggregateError);
  assert.equal(graphCalls(), 1);
  assert.equal(ctx.closed, true, 'context close is attempted despite the graph failure');
  assert.equal(a._schedTimer, null);
  assert.equal(a.ctx, null);
  assert.equal(a.ready, false);
});

test('combined faults attempt every retirement once and aggregate every error', async () => {
  const a = await makeAudio();
  throwingListener(a);
  throwingEngine(a);
  const graphCalls = throwingGraph(a);
  const ctx = a.ctx;
  let err = null;
  try { a.dispose(); } catch (e) { err = e; }
  assert.ok(err instanceof AggregateError);
  assert.equal(err.errors.length, 3, `expected 3 errors, got ${err.errors.length}`);
  assert.match(String(err.errors[0]?.message ?? err.errors[0]), /engine-boom/);
  assert.ok(err.errors[1] instanceof AggregateError, 'lifetime failure keeps its aggregate shape');
  assert.match(String(err.errors[1].errors[0]?.message ?? ''), /remove-boom/);
  assert.match(String(err.errors[2]?.message ?? err.errors[2]), /graph-boom/);
  assert.equal(graphCalls(), 1);
  assert.equal(ctx.closeCalls, 1, 'owned context closed exactly once');
  assert.equal(a._schedTimer, null);
  assert.equal(a.ctx, null);
  // A retry with the same persistent fault re-reports but never double-closes.
  let retry = null;
  try { a.dispose(); } catch (e) { retry = e; }
  assert.ok(retry instanceof AggregateError);
  assert.equal(ctx.closeCalls, 1, 'no second close on retry');
  assert.equal(a.ctx, null);
});

test('an offline context is retired but never closed', async () => {
  const a = new Audio();
  const offline = new FakeAudioContext();
  await a.init(offline);
  assert.equal(a.ready, true);
  a.dispose();
  assert.equal(offline.closed, false);
  assert.equal(offline.closeCalls, 0);
  assert.equal(a.ctx, null);
  assert.equal(a.ready, false);
});

test('cold dispose and repeat dispose are harmless and close once', async () => {
  new Audio().dispose();
  const a = await makeAudio();
  const ctx = a.ctx;
  a.dispose();
  assert.doesNotThrow(() => a.dispose());
  assert.equal(ctx.closeCalls, 1);
  assert.equal(a.ctx, null);
  assert.equal(a._schedTimer, null);
});

test('fresh init still works after dispose', async () => {
  const a = await makeAudio();
  const first = a.ctx;
  a.dispose();
  assert.equal(first.closed, true);
  await a.init();
  assert.equal(a.ready, true);
  assert.ok(a.ctx);
  assert.notEqual(a.ctx, first);
  a.dispose();
});
