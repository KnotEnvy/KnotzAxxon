// UI ownership under faults: real Screens and HUD source with injected failures.
// A failed constructor must release what it bound; dispose must attempt every
// owner even when one throws, and still report the original failures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './fixtures/opus-ui-dom.mjs';

const SCREEN_IDS = ['boot', 'title', 'settings', 'over', 'sector', 'pause'];
const IDS = ['settings-list', 'settings-status', 'title-hint', 'hud', 'alt-marker', 'alt-track', 'hud-altimeter',
  'damage-flash', 'hud-score', 'touch'];
const { nodes, root } = installDom(IDS, { screens: SCREEN_IDS });

// Layout observer and frame scheduling as a browser has them, so HUD wires both.
const rafs = new Map(); let rafId = 0; const cancelledRafs = [];
globalThis.requestAnimationFrame = fn => { rafs.set(++rafId, fn); return rafId; };
globalThis.cancelAnimationFrame = id => { cancelledRafs.push(id); rafs.delete(id); };
let observerFault = null;
globalThis.ResizeObserver = class { observe() {} disconnect() { if (observerFault) throw observerFault; } };

const { Screens } = await import('../src/ui/Screens.js');
const { HUD } = await import('../src/ui/HUD.js');

/** Record listeners added and not yet removed on any EventTarget while `run` executes and after. */
function trackListeners() {
  const live = new Set(), added = [];
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) { live.add(fn); added.push(type); return add.call(this, type, fn, options); };
  EventTarget.prototype.removeEventListener = function (type, fn, options) { live.delete(fn); return remove.call(this, type, fn, options); };
  return { live, added, restore() { EventTarget.prototype.addEventListener = add; EventTarget.prototype.removeEventListener = remove; } };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('Screens: a constructor that fails after binding releases every subscription and rethrows the original error', () => {
  const fault = new Error('settings list unavailable');
  Object.defineProperty(nodes['settings-list'], 'innerHTML', { configurable: true, get: () => '', set() { throw fault; } });
  const listeners = trackListeners();
  try {
    assert.throws(() => new Screens(), error => error === fault, 'the original error, not a cleanup error');
  } finally { listeners.restore(); delete nodes['settings-list'].innerHTML; }
  assert.ok(listeners.added.includes('keydown') && listeners.added.includes('change'), 'the fault came after subscriptions were bound');
  assert.equal(listeners.live.size, 0, `left subscribed: ${listeners.live.size}`);
});

test('Screens: a fault in the first show() is rolled back the same way', () => {
  const fault = new Error('boot screen rejected an attribute');
  const boot = nodes['screen-boot'], original = boot.setAttribute;
  boot.setAttribute = () => { throw fault; };
  const listeners = trackListeners();
  try {
    assert.throws(() => new Screens(), error => error === fault);
  } finally { listeners.restore(); boot.setAttribute = original; }
  assert.equal(listeners.live.size, 0);
});

test('Screens: dispose attempts every animation, the lifetime and the card timer when the first cancel throws', async () => {
  const listeners = trackListeners();
  try {
    const screens = new Screens();
    assert.ok(listeners.live.size > 0);
    const first = new Error('cancel failed'); let secondCancelled = false, cardFired = false;
    screens._cardAnimations = [{ cancel() { throw first; } }, { cancel() { secondCancelled = true; } }];
    screens._cardT = setTimeout(() => { cardFired = true; }, 20);
    root.classList.add('sector-card-on');
    assert.throws(() => screens.dispose(), error => error instanceof AggregateError && error.errors[0] === first);
    assert.equal(secondCancelled, true, 'later animations are still cancelled');
    assert.equal(screens._lifetime.closed, true);
    assert.equal(listeners.live.size, 0, 'every subscription released');
    assert.equal(root.classList.contains('sector-card-on'), false, 'card state cleared');
    await wait(40);
    assert.equal(cardFired, false, 'card timer cleared');
  } finally { listeners.restore(); }
});

test('HUD: dispose clears the pending damage frame, bump timer, reset and live state when the layout observer throws', async () => {
  const hud = new HUD();
  assert.ok(hud._layoutObserver, 'HUD watches layout');
  hud.setLive(true);
  hud.pulseDamage(1);
  const pendingRaf = hud._damageRaf;
  assert.ok(pendingRaf != null && rafs.has(pendingRaf));
  let bumpFired = false;
  hud._bumpT = setTimeout(() => { bumpFired = true; }, 20);
  hud._warnTimer = 2;
  observerFault = new Error('disconnect failed');
  try {
    assert.throws(() => hud.dispose(), error => error instanceof AggregateError && error.errors[0] === observerFault);
  } finally { observerFault = null; }
  assert.ok(cancelledRafs.includes(pendingRaf), 'pending damage frame cancelled');
  assert.equal(hud._damageRaf, null);
  assert.equal(hud._layoutObserver, null);
  assert.equal(hud._warnTimer, 0, 'reset still ran');
  assert.equal(nodes.hud.classList.contains('is-live'), false, 'live state cleared');
  await wait(40);
  assert.equal(bumpFired, false, 'bump timer cleared');
});

test('normal paths are unchanged: construct, show and dispose without faults', () => {
  const listeners = trackListeners();
  let screens;
  try {
    screens = new Screens();
    screens.show('title');
    assert.equal(screens.current, 'title');
    screens.dispose();
  } finally { listeners.restore(); }
  assert.equal(listeners.live.size, 0);
  const hud = new HUD(); hud.setLive(true); hud.dispose();
  assert.equal(nodes.hud.classList.contains('is-live'), false);
});
