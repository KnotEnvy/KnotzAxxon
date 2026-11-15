# Hardware campaign harness — development checkpoint

Tooling lives under `scripts/qa/launch/`; it is not imported by production.
The Windows hardware path was first proved by Sol Low's pilot (see its handoff).
The bot has completed hardware development pilots but has not yet earned any
final-candidate episodes.

Run a bounded pilot when the cooperative GPU lease is free:

```sh
node scripts/qa/launch/run-bot.cjs --count 3 --loops 0 --seed 170001
```

The coordinator owns a localhost Vite server and Windows Node/Chrome child using
Playwright pipes. It acquires the common GPU lease, refuses to overwrite an old
run, records comprehensive source hashes before/after, and closes its children.
Do independent CPU work whenever another owner holds the GPU.

The browser bot calls the original `Engine._loop` with a synthetic 60Hz clock,
preserving hit stop, time scaling, subdivisions, normal `Input.update`, actors,
collision, weapons, resource consumption and presentation updates. It controls
only scheduling and rendered-frame cadence (default one actual GPU render per
12 simulation frames). `gl.finish()` ensures submitted work completes before an
episode is recorded. This is accelerated coverage, not realtime feel or FPS proof.

The pilot reads level/actor data, predicts gate timing, steers through gaps,
shoots real fuel cells, avoids contacts and uses the normal defensive roll.
It never teleports during a run or grants extra health/fuel/damage/aim authority.
Observational damage/collision/warning wrappers call the original methods and
return their result unchanged. Their events are retained, not used to suppress
damage. Existing shared PRNG is seeded once at each episode boundary and recorded.

Profiles are keyboard events, synthetic standard gamepad polling, and synthetic
touch intent through the normal input-folding path. These do not establish physical
gamepad/touch hit testing or latency; separate production UI and live trials do.
Initial `reset(seed, loop)` fixtures start at z=0 with normal hull/shield/fuel and
are explicitly not evidence of having earned earlier-loop progression.

The matrix generator allocates 180 episodes each at loops0/1/2/3/7, 100 at loop30,
all cameras/presets/profiles in each band, with unique seeds and portrait/landscape/
desktop coverage. `--matrix --count 1000` selects it. `--final --candidate HASH`
additionally requires the exact current source fingerprint. Final records require
an unchanged before/after receipt; `credit.cjs` rejects incompatible/pilot/failed/
software/timeout/duplicate/resource-modified evidence. Two dedicated evidence-rule
checks pass. Big batches must wait for a successful small pilot and final freeze.

Per-run outputs under `artifacts/launch/bot/`: config/source/hardware and receipt,
per-seed episodes, event/sample/chunk JSONL, errors/failures, checkpoint screenshots.
Keep raw records and failed-seed repros. No sustained hardware FPS or physical-device
pass is claimed by this accelerated harness.

## Pilot results (not final credits)

`pilot-first-hardware` proved the actual GTX1650Ti renderer but timed out trying
to click the canvas through the title overlay. It contains **no gameplay episode**.
The harness now starts through the actual title button.

`pilot-controls-02` completed two normal-resource episodes on source
`888025ed6deea30ad64a9792336e6158d6931e8a5ed802b9108a7b0ada995b3b`:
seed170001 won through all eight sectors/all three boss phases, with12rack hits and
two observed rack detonations; seed170002 died in Reactor Spine. The win rendered
1609actual frames over19301synthetic60Hz frames. The death rendered802/9621.
No health/fuel/collision/weapon law was changed. Both before/after source hashes match.

`pilot-bands-03` completed six more normal episodes at loops0/1/2/3/7/30 on the
same source: one loop0 victory and five genuine deaths. All eight sectors were
covered collectively. High-loop30 reached sector1(index1), not the whole campaign.
These runs establish a functioning pilot and diverse stress outcomes, not human
fairness or final evidence. Final credited counts remain0/1000. Earned-continuation
diagnostics are logged separately, never added to those totals.

An unused production `Game.shotsFired` counter stays0; the harness now observes real
`Projectiles.fire(SIDE.PLAYER)` calls separately and labels the raw game counter.
This is a telemetry correction in test tooling, not gameplay or cadence tuning.

## Portable distribution checkpoint

`node scripts/qa/launch/package-itch.mjs` creates a separate relative-base HTML5
build and deterministic root-index ZIP with full file hashes and ZIP readback.
It never uploads/replaces the existing Itch version. The first development package
contains43 files / 5,487,065 bytes; source fingerprint and archive hash are recorded
in its generated manifest. This is a packaging pilot, pending actual nested-path,
iframe, WebGL2, responsive/fullscreen and complete browser asset-load verification.
