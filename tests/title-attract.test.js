// Title / attract: the live title background rotates real sector vignettes
// without spawning gameplay, touching run state or changing seeded fortresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATE, makeRig } from './fixtures/studio-feel.mjs';

const { ATTRACT_SHOTS, ATTRACT_HOLD, ATTRACT_CUT } = await import('../src/game/Game.js');
const { titleDevice, audioHint, attractLabel } = await import('../src/ui/Screens.js');
const { audio } = await import('../src/audio/Audio.js');

function titleRig(camera = 'classic') {
  const r = makeRig({ seed: 77, camera });
  const log = { cuts: [], sectors: [] };
  Object.assign(r.g.screens, { attract: s => log.sectors.push(s.index), attractCut: on => log.cuts.push(!!on) });
  r.g.reset(1);
  r.g.toTitle();
  return { r, g: r.g, log };
}

test('attract: vignettes rotate through real sectors behind one blackout each', () => {
  const { r, g, log } = titleRig();
  assert.equal(g.state, STATE.IDLE);
  assert.deepEqual(log.sectors, [ATTRACT_SHOTS[0].sector]);
  const first = g.level.sectors[ATTRACT_SHOTS[1].sector];
  r.run(ATTRACT_HOLD - 0.5);
  assert.deepEqual(log.cuts, [], 'no cut before the hold ends');
  r.run(1 + ATTRACT_CUT);
  assert.deepEqual(log.cuts, [true, false], 'one blackout, then reveal');
  assert.equal(log.sectors.at(-1), first.index);
  assert.ok(g.player.pos.z >= first.zStart && g.player.pos.z < first.zEnd, 'ship flies inside the announced sector');
  for (let i = 0; i < ATTRACT_SHOTS.length; i++) r.run(ATTRACT_HOLD + ATTRACT_CUT + 0.05);
  assert.equal(new Set(log.sectors).size, new Set(ATTRACT_SHOTS.map(s => s.sector)).size, 'every vignette is visited and the list wraps');
  r.dispose();
});

test('attract: the camera keeps the ship in the open area beside the title copy, for every rig', () => {
  for (const camera of ['classic', 'modern', 'chase']) {
    const { r, g } = titleRig(camera);
    for (const aspect of [16 / 9, 390 / 844]) {
      r.engine.camera.aspect = aspect; r.engine.camera.updateProjectionMatrix();
      r.run(0.5);
      const ndc = g.player.pos.clone().project(r.engine.camera);
      const label = `${camera} ${aspect.toFixed(2)}: ship at ${ndc.x.toFixed(2)},${ndc.y.toFixed(2)}`;
      if (aspect > 1) assert.ok(ndc.x > 0.12 && ndc.x < 0.8 && Math.abs(ndc.y) < 0.6, label + ' (right of the copy)');
      else assert.ok(Math.abs(ndc.x) < 0.6 && ndc.y > 0.05 && ndc.y < 0.8, label + ' (above the copy)');
      console.log(label);
    }
    assert.ok(Math.abs(g.player.pos.x) <= 16, 'stays inside the corridor');
    assert.ok(g._attract.aim.length() <= 60);
    r.dispose();
  }
});

test('attract: no enemies, shots, score or audio cues are produced on the title', () => {
  const { r, g } = titleRig();
  const cues = [];
  const spies = ['sting', 'jingle', 'startMusic', 'setEnvironment'].map(name => {
    const original = audio[name];
    audio[name] = (...args) => { cues.push(name); return original?.apply(audio, args); };
    return () => { audio[name] = original; };
  });
  try {
    r.run(ATTRACT_HOLD * 2 + 1);
    assert.equal(g.enemies.length, 0); assert.equal(g.pickups.length, 0); assert.equal(g.boss, null);
    assert.equal(g.score, 0); assert.equal(g.kills, 0);
    assert.deepEqual(cues, []);
  } finally { spies.forEach(restore => restore()); }
  r.dispose();
});

test('attract: leaving the title clears the blackout and seeded fortresses are unchanged', () => {
  const fresh = makeRig({ seed: 4242 });
  const reference = JSON.stringify(fresh.g.level.features.slice(0, 200));
  fresh.dispose();

  const { r, g, log } = titleRig();
  r.run(ATTRACT_HOLD + 0.1); // stop mid-blackout
  assert.equal(log.cuts.at(-1), true);
  g.start({ seed: 4242 });
  assert.equal(log.cuts.at(-1), false, 'start lifts the blackout');
  assert.equal(g._attract, null);
  assert.equal(g.state, STATE.PLAYING);
  assert.equal(g.player.pos.z < 5, true, 'run starts at the fortress entrance');
  assert.equal(JSON.stringify(g.level.features.slice(0, 200)), reference, 'same seed, same fortress');
  r.dispose();
});

test('title: legend device, pad-only sound hint and live sector label', () => {
  assert.equal(titleDevice('keyboard'), 'keyboard');
  assert.equal(titleDevice('mouse'), 'keyboard');
  assert.equal(titleDevice('gamepad', true), 'gamepad');
  assert.equal(titleDevice('keyboard', true), 'touch');
  assert.equal(titleDevice('touch'), 'touch');
  assert.equal(audioHint('gamepad', 'suspended'), 'SOUND: PRESS ANY KEY, CLICK OR TAP ONCE');
  assert.equal(audioHint('gamepad', 'running'), '');
  assert.equal(audioHint('gamepad', null), '', 'audio unavailable: no promise of sound');
  assert.equal(audioHint('keyboard', 'suspended'), '');
  assert.equal(attractLabel({ index: 3, name: 'REACTOR SPINE' }), 'SECTOR 04 // REACTOR SPINE');
});
