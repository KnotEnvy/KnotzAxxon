import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from './fixtures/studio-feel.mjs';
import { audio } from '../src/audio/Audio.js';

test('a missile lock interrupts a recent notice while ordinary warning spam stays throttled', () => {
  const labels = [];
  const game = { _warnCooldown: 0, hud: { warn: label => labels.push(label) } };
  const original = audio.alarm;
  let alarms = 0;
  audio.alarm = () => { alarms++; };
  try {
    Game.prototype.warn.call(game, 'BARRAGE');
    game._warnCooldown -= 0.3;
    Game.prototype.warn.call(game, 'MISSILE LOCK - ROLL');
    assert.deepEqual(labels, ['BARRAGE', 'MISSILE LOCK - ROLL']);
    assert.equal(alarms, 2, 'the action prompt includes its alarm');
    Game.prototype.warn.call(game, 'COOLANT DISCHARGE');
    assert.equal(labels.length, 2, 'ordinary warnings retain their cooldown');
    assert.equal(alarms, 2);
    game._warnCooldown = 0;
    Game.prototype.warn.call(game, 'COOLANT DISCHARGE');
    assert.equal(labels.at(-1), 'COOLANT DISCHARGE');
    assert.equal(alarms, 3);
  } finally { audio.alarm = original; }
});
