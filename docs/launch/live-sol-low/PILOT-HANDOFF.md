# Sol LOW Nitro pilot handoff — 2026-11-15

Scope: hardware-path and visual-control development pilots only. Final frozen-candidate
live trials: **0/60**. No judge scores supplied. Historical 241 regressions were not rerun.
No production edits, commits, staging, dependency installation or external publication.

Base HEAD was `2a77036cbc6a64b1b1656c8df8949a5650098dab`; initial tracked diff empty.
`artifacts/launch/live-sol-low/source-snapshot.json` records source/required-document
SHA256s and the acquired lease. Marketing edits occurred during testing; replacement
snapshot records current source hashes. These are changing-development-build pilots,
not one frozen release build. No production build hash is claimed.

Hardware path validated: Windows Node v24.14.0 at `C:\nvm4w\nodejs\node.exe`, installed
Chrome 157.0.8103.52 at `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
Playwright from existing studio-opus-code tools via WSL UNC. Chrome launches through
Playwright's child-process pipe, no exposed debugging port. Windows 10 UA, NitroBliss.
Actual unmasked renderer: `ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Ti (0x00001F95)
Direct3D11 vs_5_0 ps_5_0, D3D11)`; vendor `Google Inc. (NVIDIA)`. Viewport 1280x800,
DPR1; High quality/Classic camera/assist false, adaptive render canvas (recorded per
observation, including 960x600 through 1280x800). Every probe samples 120 rAF callbacks;
these are not a sustained gameplay FPS benchmark. Pilot 94601 predates engine-frame
telemetry; its rendered-frame count/settings were not independently captured.

The shared preview status was unavailable. preview_open failed with missing
libnspr4/libnss3/etc. No sudo/install attempted. Existing Windows path worked.

## Operation and evidence

Start an owned localhost-only Vite server:
`node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort`.
Then run `node scripts/qa/live-sol-low/launch.cjs` in an interactive terminal.
Launcher acquires the shared primary GPU lease before rendering, records ownerPID/token,
and releases only its own token after browser exit. Busy fails immediately. Pilot
implementation rejects software renderer names. Windows terminal input uses Enter
(CR), not a bare LF. Commands are JSON lines:

- `{"op":"start","seed":94604}` starts a normal loop0 run through development API.
- `{"op":"keys","keys":["Space","ArrowUp"]}` replaces held physical keyboard inputs.
- `{"op":"observe"}` captures screenshot then read-only telemetry.
- `{"op":"quit"}` closes the owned browser; stop owned Vite separately.

No player damage overrides, fuel refills, collision/AI changes, teleports, step/time-scale
changes or autonomous bot used. Operator was Sol LOW visual agent through screenshots
and keyboard commands. This is intermittent realtime visual observation, not continuous
video nor human physical input. Screenshot filename carries capture-start milliseconds;
JSONL has command and observation-completion UTC times. Screenshot and telemetry are
sequential, not guaranteed to describe the exact same rendered frame. Pilot observations
were actually opened through view_image; no JSON-only relabelling.

`events.jsonl` is the raw record. 94601 completed in genuine death, sector2, results
flight time 0:46, hull0 at z1802.58. 94602 reached sector2 z2440.85 alive but Vite
reloaded index.html at 18:50:30; **interrupted, not completed**. Attempt 94603 failed
before start because blocking @vite/client also blocked app loading; **not an episode**.
Harness now leaves the Vite client module intact and redirects only its HMR websocket
to closed localhost port1, preventing shared-edit reloads. It waits for window.KZ.

## Observed feedback and limits

Cyan shots, white/cyan ship and shadow/drop-line remain distinguishable on blue deck.
Held Space produced visible projectiles and heat/OVERHEAT feedback. First-shot latency
was not measured; screenshot intervals cannot resolve it. Gate yellow gap band and red
out-of-range altitude marker are visible (94601 shot-1794768499347.png). Opening cue
LEARN THE RUN is visible (94604 shot-1794768722855.png). This short phrase alone does
not teach the vertical gate operation; flight-manual comprehension is untested.

94601 hull3->2 occurred between z949 and1295 after holding altitude high; hull2->1
followed low flight, then final death near a narrow gate. Coarse observations cannot
attribute each collision or prove unfairness. No balance adjustment recommended from
these pilots. 94604 shield loss and GRAZE are visible at shot-1794768752274.png.
Fine red warning text such as HULL SCRAPE is low-contrast against dark wall in
shot-1794768591753.png; candidate accessibility/readability follow-up, not a proven
combat failure. Current marketing title was briefly observed mid-edit and is not a
final-layout finding.

Coverage is sectors1/2/3 only; all-eight-sector, boss, rack and earned Loop2
progression **unverified**. No high-loop fixtures run. Audio audition, gamepad/touch,
physical latency, camera comparison, fatigue, sustained GPU cadence and reaction-window
measurements remain unverified. Final60 must wait for primary freeze and use that exact
candidate; stronger frame/cue event logging and shorter observation intervals are needed.

## Owned files and verification

Only added `scripts/qa/live-sol-low/{launch,pilot}.cjs`, this handoff and
`artifacts/launch/live-sol-low/*`. Full replacement files are present in the shared
checkout; primary integrates sequentially. Both scripts pass `node --check`.
Atomic busy refusal was exercised while our own lease existed; no second browser
launched and the lock was preserved. Windows hardware probe and interactive normal
start/keyboard/screenshot/quit paths were exercised. Launcher full acquisition path
still needs a clean-slot run; the manual pilot used the same lease helper in a persistent
owner process. No unit/regression/build claim beyond these checks.

## Completed replacement and cleanup receipt

94604 completed in genuine death at z4036.63, sector3, normal loop0 start. Last
telemetry hull0/shields0/fuel0, 18:53:49Z; results flight time recorded in final PNG.
No fixture reset or assistance. First/last observed engine frames232/6158; 5926 frame
increments across106.0654s of page performance time. This is an instrumented headless
observation interval with screenshots/adaptive canvas, not a sustained FPS or latency
benchmark. Longest screenshot gap was approximately53s while writing the handoff;
therefore this pilot is sparse realtime observation, not continuous steering.
Two completed pilots total (94601,94604), one HMR interruption (94602), one boot
failure (94603). Neither completed pilot counts toward final60. Opening pilot94601
was exact tracked base; replacement94604 included concurrently edited marketing
HTML/CSS. No cross-candidate score or frozen-candidate claim.

Owned browser received quit and owned Vite received Ctrl-C. Lease owner process
102625 received SIGTERM to invoke its token-checking release handler. No foreign
process or lease was touched. Final scripts are syntax-checked; final artifact hash
index is `artifacts/launch/live-sol-low/manifest.sha256`.

Windows process audit after quit found no Chrome process using a Playwright temporary
profile. Interactive Node terminals retained stdin after browser close; Ctrl-C closed
only the four owned pilot terminals. Final harness explicitly exits after awaited
browser.close so the launcher can release promptly. This final exit adjustment was
syntax-checked, not followed by another GPU run. Replacement results flight time1:39,
8 targets destroyed. Long observation gap and changing files limit any stronger claim.
