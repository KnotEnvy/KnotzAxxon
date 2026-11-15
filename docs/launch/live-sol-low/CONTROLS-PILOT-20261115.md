# Actual live-controls pilot receipt — 2026-11-15

This is implementation/runtime QA, not formal review. Final credit remains **0/60**.
Two new normal realtime pilots completed; historical pilot media/receipt preserved.
No production edits, commits, helpers or publication.

Source HEAD at launch: `db04eb9eebfdee62b65352e42e49a0c69a923aa3`.
Actual fingerprint before and after: `e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a`.
Full per-file source snapshots: config.json, trial sourceBefore/sourceAfter and receipt.json
under `artifacts/launch/live-sol-low/pilot-live-controls-20261115-01/`.
Tested build was Vite development graph, not a frozen candidate or production bundle.
Exact runtime tooling hashes are in runtime-tooling-sha256.json in that directory.
Final post-pilot QA-file hashes are in controls-pilot-delivery.sha256; these differ
where post-pilot CPU guard/burst changes are documented below.

## Executed hardware and normal-law evidence

Windows Node/Chrome via Playwright local pipes on NitroBliss. Chrome157.0.8103.52,
Windows win32 x64; unmasked renderer:
`ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Ti (0x00001F95) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
Actual game context WebGL2; Google Inc. (NVIDIA), DPR1, viewport960x540 per trial.
Hardware.json retains full UA/device/browser. Initial normal hull3/shields1/fuel1/z0;
assist false, shake1. Both explicitly seeded-loop-start fixtures; no previous-loop
achievement claim. Primary bot operated; Sol LOW viewed screenshots and entered notes.
No manual supplemental keys were used. Synthetic gamepad is not physical-device proof.
Same original Engine._loop with actual rAF timestamps; every frame rendered. No pause,
synthetic time, HP/fuel gift, invulnerability, teleport or scenario/balance modification.

- Loop30, seed170101, keyboard/Chase/High: genuine death, sectors0/1;690 actual
  renders/690 frames; raw12.215s, game8.835s. Final hull0/shields0; z1846.3663.
  2 viewed screenshots/notes (opening and terminal),3 captures including end duplicate.
- Loop0, seed170001, synthetic gamepad/Modern/Medium: genuine victory, sectors0–7;
  18,347 actual renders/18,347 frames; raw323.8694s, game294.5141s. Final hull3/shields1,
  fuel0.6264655; kills144. 15 viewed screenshots/notes,16 captures including end duplicate.
  Bot telemetry records phases0/1/2,6rack hits and1detonation. Actual visual observations
  include phase1 cannon objective and destruction, NOT intermediate phases/rack events.
  Continue LOOP2 button was visible but never activated; no earned next-loop flight.

Zero page errors. Short-run actual rAF p50/p95:17.6/18.1ms for both. Loop0 maximum
rAF interval3133ms and maximum render-submission CPU3116.1ms; retain as an observed
instrumented-run stall, not concealed by percentiles. Cause not isolated. These are
headless instrumented pilot timings, not sustained FPS/physical latency certification.
Adaptive canvas sizes and precise settings are retained per observation.

## What was actually seen

Every observation used in visual-notes.jsonl was opened with view_image. Facts and
interpretations/confidence/limits are separate. No claim of continuous video or heard
audio. High confidence in visible text/status, medium in readability interpretations.
Representative screenshots within the run folder:

- pilot-live-l30-o001.png: active Chase opening, cyan ship/drop-line, fuel/hull100;
  header241 and opening banner01, consistent with loop fixture (not earned sector241).
- pilot-live-l0-o002.png: active cyan shots and orange gate perimeter.
- pilot-live-l0-o006.png: asteroid-framed gap, GAP band/red altitude marker, hullcrit33.
- pilot-live-l0-o007.png: thermal vertical gate remains visible behind score/explosion.
- pilot-live-l0-o010.png: spread shot, hull67; pickup occurred between observations.
- pilot-live-l0-o013.png: IRON SENTINEL/PHASE1 DESTROY CANNONS objective and boss model.
- pilot-live-l0-o014.png: SENTINEL DESTROYED, debris and glowing core.
- pilot-live-l0-o015.png: terminal result,144targets,4:54flight,128060total,Continue LOOP2.

At960x540 terminal screenshots show lower results/controls with top heading outside
capture. This may be focus-induced scroll; mechanism unverified. Initial loop0 frame
retained fading prior-results overlay; next frame was clear. Neither is a production
fix made here. Hull fell and later recovered during loop0; missed collisions/pickups
cannot establish fairness or exact recovery moments. Actual live visual frames cover
all8sectors, but fine cues/reaction timing/physical feel/audio/fatigue remain unproven.

## Observation-discipline finding and controls changes

The screenshot/view/note cycle was much slower than intended. Loop30 opening-to-terminal
capture gap20.910s, so no second active frame; marked missing intermediate observation.
Loop0 capture gaps10.967–36.366s (excluding redundant terminal end capture). Requesting
the next capture before writing the prior note did not meet2–5s. Both pilots correctly
show gap>10s blockers. End-summary wallMs includes postterminal note/review time and is
not gameplay wall duration. Bot rawSeconds is actual realtime loop accumulation.

Added explicit `--pilot`, `pilot-live-...` run-id, development-live-pilot rowkind and
permanent pilot-ineligibility reason before runtime. Final `--candidate` fingerprint
and final-live id guard retained. Pilot-only fixed specs do not alter final60plan.
After runtime, strengthened independent Windows row/run guards and CPU negative tests.
Also added explicit bounded command:

`{"op":"observe-burst","count":3,"intervalMs":2000,"reason":"short gate/boss encounter"}`

It takes at most3screens at wall-clock intervals1–3s, engine continues normally; stops
on terminal. It is NOT a background watcher, autopilot counter or automatic visual
acknowledgment. Every used screenshot must still be opened and noted with actual
viewedAt. Captures can preserve short encounters but cannot alone fix agent viewing
latency. These post-pilot guard/burst changes are syntax/CPU checked, NOT GPU exercised.
Final60 should not begin with a claim that cadence is solved; primary needs a more
responsive image/control path or must explicitly assess the recorded sparse-observation
limits. No gaps/scores/evidence were fabricated to pass the rule.

## Cleanup and tests

Graceful quit exited coordinator0, owned Chrome and localhost Vite closed, shared GPU
lease absent after own token-checked release. No foreign lock/process touched. No
browser remains running. Runtime config records ownerPID/token; receipt stableSource true.
Shared preview failed missing libraries; used authorized Windows fallback, no install.
All owned CJS syntax checks pass; deterministic60plan tests pass; pilot/final mode and
row guard positive/negative CPU checks pass; wrong pilot run-id was refused before lease.
