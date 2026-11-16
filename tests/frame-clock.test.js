// Actual Engine + Game regression for a first rAF timestamp preceding start().
// Rendering/DOM/audio are fixture boundaries; these are CPU semantics, not FPS.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRig} from './fixtures/studio-feel.mjs';

test('a stale first rAF cannot reverse flight or award a future-sector grade', () => {
  const r=makeRig({seed:170301});
  try {
    r.g.reset(170301,30); r.g._enterSector(0);
    const baseline=r.engine._last;
    r.frameMs(-3.15);
    assert.equal(r.engine.realDelta,0, 'an earlier callback has no simulation elapsed time');
    assert.equal(r.engine._last,baseline, 'retain the monotonic start baseline');
    assert.equal(r.engine.time,0);
    assert.equal(r.g.player.pos.z,0);
    r.frame();
    assert.ok(r.g.player.pos.z>0);
    assert.equal(r.g.sectorIndex,0);
    assert.deepEqual(r.g.grades,Array(8).fill(null), 'no unearned late-campaign report card');
    assert.ok(Math.abs(r.engine.realDelta-(1000/60-3.15)/1000)<1e-12,
      'the next frame advances only since the retained baseline');
  } finally {r.dispose();}
});

test('invalid frame timestamps leave state finite and a valid next frame recovers', () => {
  const r=makeRig();
  try {
    const before={last:r.engine._last,time:r.engine.time,frame:r.engine.frame,z:r.g.player.pos.z};
    for(const time of [NaN,Infinity,-Infinity])r.engine._loop(time);
    assert.deepEqual({last:r.engine._last,time:r.engine.time,frame:r.engine.frame,z:r.g.player.pos.z},before);
    assert.ok(Number.isFinite(r.engine.stats.ms));
    r.frame();
    assert.ok(r.g.player.pos.z>0);
    assert.ok(Number.isFinite(r.engine.time));
    assert.deepEqual(r.g.grades,Array(8).fill(null));
  } finally {r.dispose();}
});

test('ordinary frame steps and the long-frame safety cap keep their existing law', () => {
  const r=makeRig();
  try {
    r.frame();
    assert.ok(Math.abs(r.engine.realDelta-1/60)<1e-12);
    const before=r.engine.time;
    r.frameMs(1000);
    assert.equal(r.engine.realDelta,1/15);
    assert.ok(Math.abs(r.engine.time-before-1/15)<1e-12);
    assert.ok(r.g.player.pos.z>0);
  } finally {r.dispose();}
});
