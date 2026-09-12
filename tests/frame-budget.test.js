import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { getItem: () => null };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = () => {};
const { Engine } = await import('../src/core/Engine.js');

test('GPU-bound frame delivery downscales even with cheap CPU work', () => {
  const e = {
    running: true, _loop() {}, _last: performance.now() - 40,
    frame: 0, _hitStop: 0, timeScale: 1, _targetTimeScale: 1, time: 0,
    input: { update() {}, endFrame() {} }, _updateHooks: [], _lateHooks: [],
    materials: { update() {} }, postfx: { update() {}, render() {} },
    renderer: { info: { reset() {}, render: { calls: 8, triangles: 100 } } },
    _msEma: 40, stats: {}, _scaleCooldown: 0, _renderScale: 1,
    _onResize() { this.resized = true; },
    _adaptResolution: Engine.prototype._adaptResolution,
  };
  Engine.prototype._loop.call(e, performance.now());
  assert.ok(e.stats.ms > 25);
  assert.equal(e._renderScale, 0.9);
  assert.equal(e.resized, true);
});

test('stable 60 Hz delivery recovers resolution with a slow probe', () => {
  const e = { _scaleCooldown: 0, _msEma: 16.67, _renderScale: 0.7, stats: {}, _onResize() {} };
  Engine.prototype._adaptResolution.call(e, 1 / 60);
  assert.equal(e._renderScale, 0.75);
  assert.equal(e._scaleCooldown, 5);
  Engine.prototype._adaptResolution.call(e, 1 / 60);
  assert.equal(e._renderScale, 0.75);
});

test('failed recovery probe rolls back when its cooldown expires', () => {
  const e = { _scaleCooldown: 0, _msEma: 33.3, _renderScale: 0.75, stats: {}, _onResize() {} };
  Engine.prototype._adaptResolution.call(e, 1 / 60);
  assert.equal(e._renderScale, 0.65);
  assert.equal(e._scaleCooldown, 1.2);
});
