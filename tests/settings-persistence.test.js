// SYSTEMS persistence status follows the actual settings write, never a probe.
// Real Screens and the real settings store; only browser storage is faked, so
// each case below reproduces a storage that treats keys or sizes differently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './fixtures/opus-ui-dom.mjs';

const SCREEN_IDS = ['boot', 'title', 'settings', 'over', 'sector', 'pause'];
const { nodes } = installDom(['settings-list', 'settings-status', 'title-hint'], { screens: SCREEN_IDS });
const { Screens, storageWritable } = await import('../src/ui/Screens.js');
const { settings } = await import('../src/core/Settings.js');

const KEY = 'knotzaxxon.settings.v2';
const SAVED = 'CHANGES SAVE ON THIS DEVICE', SESSION = 'BROWSER STORAGE UNAVAILABLE: CHANGES LAST THIS SESSION';

/** Storage that runs `accept(key, existing)` before each write; it records every write attempt. */
function storage(accept, seed = {}) {
  const data = new Map(Object.entries(seed)), writes = [];
  return { data, writes,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) { writes.push(k); if (!accept(k, data.has(k))) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); data.set(k, String(v)); },
    removeItem: k => { data.delete(k); } };
}
function withStorage(fake, run) {
  const previous = globalThis.localStorage; globalThis.localStorage = fake;
  try { run(); } finally { globalThis.localStorage = previous; }
}
const status = () => nodes['settings-status'];
const flip = () => settings.set('camera', settings.get('camera') === 'chase' ? 'modern' : 'chase');

test('a small probe would pass but the settings payload is rejected: SYSTEMS says session only, and keeps the value', () => {
  const fake = storage(key => key !== KEY);
  withStorage(fake, () => {
    const screens = new Screens();
    screens.show('settings');
    assert.equal(status().textContent, SESSION);
    assert.equal(status().classList.contains('session'), true);
    const want = settings.get('camera') === 'chase' ? 'modern' : 'chase';
    flip();
    assert.equal(settings.get('camera'), want, 'a failed write keeps the change for this session');
    assert.match(status().textContent, /^CAMERA RIG (CHASE|MODERN 20) · THIS SESSION ONLY: BROWSER STORAGE UNAVAILABLE$/);
    assert.equal(storageWritable(), false);
    assert.equal(fake.writes.every(k => k === KEY), true, 'only the real settings key is ever written: no probe');
    screens.dispose();
  });
});

test('storage is full for new keys but the existing settings overwrite fits: SYSTEMS says saved, and it was', () => {
  const fake = storage((key, existing) => key === KEY && existing, { [KEY]: JSON.stringify(settings.values) });
  withStorage(fake, () => {
    const screens = new Screens();
    screens.show('settings');
    assert.equal(status().textContent, SAVED);
    assert.equal(status().classList.contains('session'), false);
    flip();
    assert.match(status().textContent, /^CAMERA RIG (CHASE|MODERN 20) · SAVED ON THIS DEVICE$/);
    assert.equal(JSON.parse(fake.data.get(KEY)).camera, settings.get('camera'), 'the reported save is the stored payload');
    assert.equal(storageWritable(), true);
    screens.dispose();
  });
});

test('the status follows each actual write as storage fails and recovers', () => {
  let open = false;
  const fake = storage(() => open);
  withStorage(fake, () => {
    const screens = new Screens();
    screens.show('settings');
    assert.equal(status().textContent, SESSION);
    open = true; flip();
    assert.match(status().textContent, /· SAVED ON THIS DEVICE$/);
    open = false; flip();
    assert.match(status().textContent, /· THIS SESSION ONLY: BROWSER STORAGE UNAVAILABLE$/);
    screens.dispose();
  });
});

test('opening SYSTEMS saves the actual settings once; an unknown state claims nothing', () => {
  const fake = storage(() => true);
  withStorage(fake, () => {
    const screens = new Screens();
    const before = fake.writes.length;
    screens.show('settings');
    assert.deepEqual(fake.writes.slice(before), [KEY], 'one real save on open, no probe');
    settings.persistent = null;
    screens._settingsStatus();
    assert.equal(status().textContent, 'CHANGES APPLY NOW');
    assert.equal(status().classList.contains('session'), false);
    screens._settingsStatus('camera');
    assert.match(status().textContent, /^CAMERA RIG (CHASE|MODERN 20)$/);
    screens.dispose();
  });
});
