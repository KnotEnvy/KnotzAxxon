import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SettingsStore } from '../src/core/Settings.js';

function storeWith(saved, { coarse = false, cores = 2, memory = 2 } = {}) {
  const previous = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    matchMedia: Object.getOwnPropertyDescriptor(globalThis, 'matchMedia'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };
  const values = new Map(saved === null ? [] : [['knotzaxxon.settings.v2', JSON.stringify(saved)]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } });
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: coarse }) });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { hardwareConcurrency: cores, deviceMemory: memory } });
  try { return new SettingsStore(); }
  finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('fresh storage defaults to Modern on touch devices without changing graphics auto-detection', () => {
  const settings = storeWith(null, { coarse: true, cores: 2, memory: 2 });
  assert.equal(settings.get('camera'), 'modern');
  assert.equal(settings.cameraRig.label, 'MODERN 20');
  assert.equal(settings.get('quality'), 'low');
  assert.equal(settings.get('assist'), false);
  assert.equal(settings.get('perf'), false);
});

test('missing or invalid saved camera falls back to Modern', () => {
  assert.equal(storeWith({ quality: 'high' }).get('camera'), 'modern');
  assert.equal(storeWith({ camera: 'loop30', quality: 'high' }).get('camera'), 'modern');
});

test('valid saved camera choices remain unchanged for existing players', () => {
  for (const camera of ['classic', 'modern', 'chase']) {
    assert.equal(storeWith({ camera, quality: 'high' }).get('camera'), camera);
  }
});
