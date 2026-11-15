# Negative first-frame elapsed: confirmed pre-freeze defect

2026-11-15, runtime fingerprint
`f35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790`.
Owner of the core implementation fix: Hydrogen High on SuperBeast. Primary owns
QA reproduction/integration. This finding is not a rendering or UI defect.

## Trigger and actual effect

`Engine.start()` sets `_last = performance.now()`. A first rAF timestamp can be
slightly earlier than that baseline. `_loop()` uses only an upper cap:
`Math.min((now - this._last) / 1000, MAX_FRAME)`. Negative elapsed time reaches
Game/Player simulation unchanged. The ship moves below z0; `Level.sectorAt()` has
no before-entrance case and falls through to the final sector. On the next update
Game enters that sector and grades its predecessor despite no earned progression.

The realtime hardware probe `pilot-grade-provenance-realtime-01`, seed170301,
loop30 seeded-start fixture, normal resources, High/Chase/keyboard,960×540/DPR1,
GTX1650Ti ANGLE/D3D11 on NitroBliss Chrome157.0.8103.52, observed:

- Initial grades were allnull.
- At frame1, the original `_gradeSector(6)` produced C while playerz was
  -0.7307999995, currentsector0. Caller stack: `_enterSector` → `update` →
  the actual main update hook. The wrapper invoked the original unchanged.
- Later only the legitimate first-sector grade was produced. Terminal grades
  `[C,null,null,null,null,null,C,null]`; recorded sectors[0,1], z2400.47.
- Genuine death:833actual renders/833frames. This is a development diagnostic,
  zero final episode credit. Source-before/after hashes matched; no page errors.

The accelerated same-seed probe `pilot-grade-provenance-01` did not produce
negative elapsed time and recorded only the legitimate grade0. It ended in a
genuine death after638renders/frames. Its initial engine-time/settings differ,
so this is a causal narrowing comparison, not a paired balance/performance test.

## Minimal actual Engine/Game CPU reproduction

Using `tests/fixtures/studio-feel.mjs` with seed170301, then
`game.reset(170301,30); game._enterSector(0); rig.frameMs(-3.15); rig.frame()`:

| Snapshot | z | current sector | raw delta | grades |
|---|---:|---:|---:|---|
| Before |0|0|unset|allnull|
| First frame |−0.65772|0|−0.00315s|allnull|
| Second frame |3.37228|7|0.0166667s|slot6=C|

This uses actual Engine, Game and Player physics with rendering/DOM/audio stubs;
it is explicitly CPU diagnostic evidence, not GPU gameplay or latency proof.
Raw JSON: `artifacts/launch/diagnostics/negative-first-frame-cpu.json`.

## Acceptance criteria before final freeze

The owned core fix must prevent negative/nonfinite elapsed time from reaching
simulation, preserve normal positive-delta upper caps/time scaling/substeps/input,
and keep the ship and simulation clock from running backward. An actual
Engine/Game regression must cover the stale first-rAF timestamp and prove no
future-sector grades or spurious sector transition. Audit finite positions before
the level entrance separately. Re-run the hardware realtime diagnostic after
integration, and retain base/candidate identities and all raw records. No fix or
post-fix pass is claimed by this document.

Provenance instrumentation lives only in `scripts/qa/launch/pilot-browser.js` and
is restored when each episode ends; it is never imported by production.
