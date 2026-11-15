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
desktop coverage. `--matrix --count 1000` selects it. `--final --candidate HASH --freeze docs/launch/candidates/NAME.json`
requires the exact runtime fingerprint, immutable frozen identity and complete QA/test
recipe hash. The before/after receipt must prove both source and recipe stable;
changed coordinators, different freeze bytes or missing frozen identity deny credit. Final records require
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

`pilot-earned-loop-04` won normally, used the actual Continue button to enter loop1,
and then flew40seconds with normal resources. This separate earned-next-loop diagnostic
is a time-bounded observation (not a completed second campaign), rendered201frames,
and receives no episode credit. `pilot-gamepad-05` additionally won loop0 via synthetic
standard gamepad polling in Modern/Medium, exercised the same earned continuation,
then died in loop3. Fable's ambient edits changed source hashes during both batches;
their receipts explicitly mark `stableSource:false`, so neither is frozen evidence.

Realtime support is now implemented via `--realtime`: the normal Engine loop receives
actual requestAnimationFrame timestamps and renders every frame, with recorded actual
rAF intervals. It rejects accelerated chunk calls during a realtime trial. This path
passed its first hardware pilot (below); SolLow visual observations on the frozen
candidate are still required before any live credit.
`KZBot.startRealtime` / `observeRealtime` are available for the live tester's controls.
Per-seed replay can supply `--time-origin` from the logged initial engine clock; default
trials retain the normal clock. `summarize.cjs <candidate-hash>` audits all receipts
and keeps development/pilot totals strictly separate from final-candidate totals.

## Portable distribution checkpoint

`node scripts/qa/launch/package-itch.mjs` creates a separate relative-base HTML5
build and deterministic root-index ZIP with full file hashes and ZIP readback.
It never uploads/replaces the existing Itch version. The first development package
contains43 files / 5,487,065 bytes; source fingerprint and archive hash are recorded
in its generated manifest. This is a packaging pilot, pending actual nested-path,
iframe, WebGL2, responsive/fullscreen and complete browser asset-load verification.


`pilot-realtime-06` completed a genuine loop30 death (seed170101) via keyboard,
Chase/High at960x540. It rendered838/838frames using actual rAF timestamps and
normal resources, reaching sector2(index1). Stable source fingerprint
`233e6bab12c008325de2a1d69c93379730ebe6338facbbbaa35af7fbe416a877`; no page errors.
Actual rAF interval p50 17.6ms, p95 18.1ms, maximum233ms in this short headless
pilot. This is bot-operated realtime evidence, not a human/visual-agent playtest
or a sustained FPS benchmark. Final credit remains zero.

Large campaigns may be split without changing the matrix:
`--matrix --offset N --count M` takes the corresponding contiguous slice of the
same1000seed plan. Preserve the same `--seed` and candidate fingerprint in every
slice. Offsets outside the matrix fail. A row records the source commit and that
it ran the Vite development graph; the exact production bundles are verified
separately. No debug API is shipped in those production packages.

Primary grade-provenance and first-clock diagnostic wrappers now retain the original
sector-grade method and its caller/position, plus the initial realtime timestamp
and baseline. The confirmed negative-first-frame Engine fix has real GPU before/after
evidence in `NEGATIVE-FIRST-FRAME.md`. These diagnostics receive no final credits.
Non-WebSocket network/request/HTTP errors block startup or the affected episode;
final batches stop and retain the failed row. Missing freeze rejects before leasing.

`pilot-full-recipe-guards-01` validated the updated coordinator/network guards on
GTX1650Ti/D3D11 Chrome157, runtimeff570c66. Normal loop30 seed170302/analog/Low/
Classic960×540 ended in a genuine death after812simulationframes/68actual renders.
Both complete QA/test recipe hashes matched before/after
(`7d451bc002c619cd8fcd675828c88c1334ed7db5c568c328b980de903f0bc7fb`), source
matched, exit0, no page/network errors. It is a development pilot with no frozen
identity and earns zero final credit. Hash index:full-recipe-pilot.sha256.
