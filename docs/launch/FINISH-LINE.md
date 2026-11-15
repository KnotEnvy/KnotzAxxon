# Final mass-public release ledger

Primary: Sol XHigh on Nitro. Started 2026-11-15. Active worktree is the tool-bound
`release-final-public-la-b5c44ab788c3a985`; shared project roots are not edit targets.
Base source/documentation: `2a77036cbc6a64b1b1656c8df8949a5650098dab`.
Previous deployed runtime: `1b3ff18bbabdedf30295846f3594c831ef5c30a5` (PR 5).
Historical validation: 241 regressions; 28 default resources / 35 served model hashes.
These are baseline facts, not new-candidate results.

## Release gate

The user requires **each** of Luna, Terra and Haiku to independently score **>=9/10
in each of seven lenses on the same frozen final candidate**. All 21 scores must pass.
No averages, medians, subsets, edited scores or forced consensus satisfy this gate.
Keep the rubric stable, every round and its evidence/limits, and use fresh readonly
`delegate_task` tasks for every judging round/recheck. Fix actionable findings and
revalidate affected evidence before freezing again. No final publication or completion
claim before this gate and the required gameplay evidence pass. External blockers must
be stated precisely; they do not justify fabricated evidence or scores.

## Priorities, leases and dependencies

| Priority | Deliverable / owner | Exclusive writes | Dependencies / current state |
|---|---|---|---|
| P0 | Primary: bot, GPU campaign, integration, distribution | `scripts/qa/launch/`, `docs/launch/`, `artifacts/launch/bot/`, packaging scripts/config by coordination | Started; final credited bot/live counts **0 / 0**; no candidate frozen |
| P0 | Terra Medium, Nitro: live observed gameplay and hardware pilot (user replacement for Sol Low) | `scripts/qa/live-sol-low/`, `docs/launch/live-sol-low/`, `artifacts/launch/live-sol-low/` | Verify Windows Chrome/local-pipe GPU first; normal gameplay; pilots separate from final trials |
| P1 | Opus High, Nitro: title and actual-game marketing | `src/style.css`, `src/ui/Screens.js`, `index.html`, title-only hunks in `src/game/Game.js`, `public/brand/`, `assets-source/launch-marketing/`, `scripts/brand/launch/` | CPU work first; coordinate GPU slot; no gameplay or model replacement |
| P1 | Spark 1.3, SuperBeast: audio | `src/audio/` and audio content are reserved for Spark's replacement/patch delivery; owned remote output only | Read exact base; no dirty-root edits; no heavy GPU; coordinate Hydrogen |
| P1 | Sol XHigh, same former-Hydrogen SuperBeast thread: code cleanup | Core/entities/render/lifecycle/tests/docs outside leases; audit entire codebase | Existing worktree/branch; no duplicate launch; UI/attract/audio/world writes reserved |
| P1 | Fable High, Nitro: restrained ambient/environment additions and graphical judge fixes | `src/world/`, graphical assets/lighting/ambient/background rendering hunks, coordinated before edits | Explicit user owner; preserve RNG, envelopes, accepted art, draw/triangle budgets; primary integrates only |
| P2 | Primary: portable Itch HTML5 archive | Packaging tooling and `artifacts/launch/distribution/` | Relative base; nested iframe/WebGL2/fullscreen/responsive/assets QA; inspect live listing first |
| P3 | Luna / Terra / Haiku: seven-lens judges, Nitro | Readonly; isolated reports supplied as responses | Only after integration, frozen candidate and proof packet |

Workers may not spawn helpers, create PRs, publish or merge. Primary integrates
sequentially and owns commits, PR/CI, merge and distribution. Never overwrite another
thread's dirty files. Remote isolation failure is not permission for shell worktrees.

Graphical corrections from every judging round go to **Fable High**
(`claudeAgent/claude-fable-5-2`, effort high), including 3D/spatial/assets/environment/
lighting/ambient/background art. **Opus High** owns UI/HUD/title/menu, branded interface,
typography/layout/compositing and promotional presentation. For mixed marketing/title
findings Fable fixes the rendered world and Opus fixes presentation. The cleanup owner must not
clean up either owner's visual changes concurrently. Judges remain readonly. Primary
coordinates precise candidate/evidence/acceptance criteria and integrates; primary does
not implement graphical fixes itself. At most two geometry builds and one Nitro render
job run concurrently.

## Difficulty and evidence protocol

`Level` scales sector threat by `min(base * (1 + .3*loop), 2.2)`; `difficultyAt`
multiplies it by `(1 + .35*loop)` and `Game._ctx` clamps combat difficulty to 1.
Pace continues to grow by `.16*loop`; there are no public Easy/Normal/Hard modes.

Representative full-episode bands: loops **0, 1, 2, 3, 7, 30**. The first five are
the requested base/escalating/combat-saturation coverage; loop 30 additionally covers
full generation saturation even in the opening sector. Minimum live-agent observations:
**10 per band = 60**. Bot allocation: **180 each at 0/1/2/3/7, 100 at 30 = 1000**.
Generation-cap boundaries at loops 4, 6, 7, 9, 12, 13, 30 also get separately labelled
boundary diagnostics. These finite representatives do not exhaust endless loops.

Every credited episode records source/build hashes, unique seed, starting loop,
input/profile/camera/quality/viewport, actual unmasked renderer, browser/device,
rendered frames/cadence, outcome and telemetry. Only genuine death/victory is a
completed episode; boot failures/timeouts are not credited. A loop-start fixture is
labelled as such and cannot prove earned progression. Scenario injections, immortal
legacy smoke, software WebGL and development pilots do not count toward hardware totals.
Normal health/fuel/collisions/weapons and the engine's step/time-scale law are required.
Accelerated rendered bot coverage is separate from realtime feel or hardware FPS claims.

One Nitro render job at a time. Cooperative reservation:
`/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/gpu-reservation.json`.
Use the primary's atomic lease helper; retain owner PID/platform/token and release only
your own lease. Do not delete another owner's lock or terminate another job. No public
debug listeners, firewall changes, Windows Blender installation or SuperBeast GPU load.

## Stable judging rubric

1. Code architecture, maintainability, test quality, client security.
2. Reliability, startup/recovery/lifecycle, performance/resource/load stability.
3. Gameplay feel, design, pacing, difficulty/fairness, boss/replayability.
4. Art/environment/ambience/coherence/combat readability.
5. UI/HUD/onboarding/accessibility, responsiveness and input across devices.
6. Audio/music/SFX/mix/cue priority/unlock/recovery.
7. Title/brand/marketing/capsule/social/Itch listing, distribution and launch readiness.

Each score needs reasons, evidence paths, confidence, untested limits and actionable
findings. All reviewers receive the same packet and are initially blind to one another.

## Distribution and acceptance status

- Existing Pages: https://knotenvy.github.io/KnotzAxxon/ (baseline live verification historical).
- Existing Itch: https://hacktivatenation.itch.io/knotzaxxon (actual browser inspected 19:40 UTC: external Pages link, no public iframe/upload;
  preserve previous account uploads; hidden dashboard contents not observed).
- New publication: **none**. New judging rounds: **none**. Final candidate: **not frozen**.
- Gunner/all art are explicitly accepted by the user. Historical optional 21-asset
  formal review backlog is closed by acceptance; formal review counts remain historical 0.
- Human cross-device acceptance remains user-reported. New agent/bot sessions will be
  labelled honestly. Hardware FPS, physical-device coverage and audio audition remain
  unverified until new evidence establishes them.

## Completion receipts to fill

Exact integrated commits/build/package hashes; baseline/candidate paired evidence;
per-band bot/live counts; raw JSONL/repros/representative media index; renderer/device;
all judge rounds; marketing editable/export index and dimensions; tests/CI; PR/deploy;
what actually reached Pages/Itch; account-only actions and remaining limitations.

## 2026-11-15 primary checkpoint

Fresh baseline241/241 passed (artifacts/launch/baseline-tests.txt). SolLow proved WindowsChrome157/GTX1650Ti local-pipe path and completed2 normal pilots; final0/60. Bot implementation, matrix and credit filters are present; two evidence-rule tests pass; bot GPU pilot pending Opus capture-slot release. Portable ZIP pilot built/read back with43files; nested iframe/browser checks pending. Hydrogen reported provider quota reset1h35 on its second run; no cleanup implementation has been accepted. Ownership correction and concrete work reminder sent to existing thread; no model substitution. FableHigh is delegated for additive ambient/environment work. Finalcandidate/judging/publication remain pending; finalcreditedbot0/1000.

Subsequent primary checkpoint: bot completed11 normal development episodes (10unique
seed/loop pairs; four victories) across the representative bands, with all eight
sectors/boss phases/rack coverage collectively. Two separate40second earned-next-loop
diagnostics followed actual Continue-button victories. These are not final credits;
two batches explicitly changed source during Fable edits. Raw records stay in
artifacts/launch/bot/. Packaged HTML5 hardware QA passed all43file hashes,28default
model loads, nested paths/iframe fullscreen and four responsive/reduced-motion fixtures.
Actual public browser inspection tooling is ready; Fable currently owns the render slot.
Primary tooling checkpoint committed as `cd7514d`; no runtime/publishing claim attaches
to that tooling-only commit. Finalbot0/1000, finallive0/60, judgingrounds0 remain unchanged.


## Integration checkpoint after completed art/audio tranches

- Opus title/HUD/source integrated `e748dc5`; Spark exact cue patch integrated
  `cadcf1b`; Fable ambient traffic integrated `c21915e`. Fable source and retained
  evidence manifest hashes checked; no production graphical edits by primary.
- Current regression checkpoint259/259 passed (audio integration tree including
  Fable). Tests are still required on the final frozen candidate.
- Nitro actual Chrome lifecycle:3 trusted-gesture context checks passed, hardware
  renderer recorded; headless visibility and Escape blocking not established.
  `artifacts/launch/audio/audio-lifecycle-2026-11-15T19-35-12-168Z/report.json`.
- Nitro32s OfflineAudioContext render: peak -5.31dBFS; zero clipped/nonfinite
  samples/errors. `artifacts/launch/audio/audio-render-2026-11-15T19-40-09-674Z/`.
  Measurement only; no listening or physical phone interruption claimed.
- Actual rendered public inspection completed at19:40UTC, Chrome157/GTX1650Ti:
  Itch has no public iframe and links to Pages; existing live title loaded with
  no page errors. Official Itch HTML5/image specs also captured. Evidence:
  `artifacts/launch/public-inspection/2026-11-15T19-40-49-304Z/`.
- Realtime bot pilot `pilot-realtime-06`: seed170101, loop30 fixture, keyboard,
  Chase/High/960x540, normal initial hull3/shield1/fuel1, genuine death in sector2
  (index1),838actual renders, no page errors, stable source fingerprint
  `233e6bab12c008325de2a1d69c93379730ebe6338facbbbaa35af7fbe416a877`.
  Actual rAF timestamps and original Engine step law, not accelerated. It was
  bot-operated, not observed by SolLow, and earns no final credit.
- Final counts remain bot0/1000 and live0/60; no candidate freeze, panel round,
  PR, push, publication or replacement of an existing live build.


## Marketing and evidence-control checkpoint

- Native actual-game marketing integrated `db04eb9`. All22 delivery hashes checked;
  13export/screenshot/legacy manifest entries verified, including PNG dimensions.
  Cover630x500, OG1200x630, GitHub1280x640 (799,009B), transparent banner1200x260,
  five native1920x1080 screenshots and editable composition/listing source retained.
  Original raw frames and initial art remain externally indexed and in Git history.
- Source frames: frozen snapshot `cdbdf6a` / runtime fingerprint233e6bab…; every
  native capture had Ultra/DPR1/renderScale1,1920x1080 actual buffer, GTX1650Ti.
  Sector teleports/resource top-ups were marketing staging, never gameplay evidence.
  Final runtime fingerprint after metadata/brand addition is
  `e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a` (96files).
- New portable development archive on that fingerprint:46files /7,355,877B,
  SHA256 `65ed78c05863ebfb673f0de27beb74fda3bc667ac1f3bb0164bde2f1844bbea2`.
  ZIP readback/relative-base build passed. New archive hardware smoke still pending.
- SolLow's CPU60episode interactive harness and plan integrated `f92591c`; checks
  confirm10unique seeds per0/1/2/3/7/30band and wrong-source rejection before lease.
  It requires real viewed screenshots/notes and realtime/render parity, and credits
  nothing automatically. Its new controls need the delegated small hardware pilot.
- Primary candidate-freeze, full campaign audit and all21judge gate tools are present;
  integrity checks reject mixed candidates, pilots/software/resource modifications,
  duplicate judges/seeds, omitted lenses and one subthreshold score among twenty10s.
  Synthetic score fixtures are not panel results. No candidate has been frozen yet.
- Opus's full regression checkpoint261/261 passed after the new gate tests appeared;
  Pages build outside checkout included the new brand assets/metadata. New source-QA
  Windows adapters are tooling-only and still require their own hardware execution.
- Remaining release-critical work: actual Hydrogen cleanup (provider quota; reset
  reported about20:20UTC), new-control pilot, integrated finalfreeze/regressions and
  production/package checks,1000validhardwarebot/60observedlive episodes, fresh
  independentpanel rounds until all21>=9, then actualpublication/publicverification.

## 20:12 UTC integration checkpoint

Sol Low delivered two more development pilots on runtime fingerprint
`e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a`:
loop30 seed170101 ended in a genuine death (690 actual renders), and loop0 seed170001
ended in an all-eight-sector victory (18,347 actual renders). Both used normal resources
and real-time physics on GTX1650Ti/D3D11 Chrome157. The operator was the bot; Sol Low
opened screenshots and recorded visual notes. Observation gaps of about11–36seconds
prevent final-trial credit. These remain development pilots; final totals are still
**0/1000 bot and0/60 live**. The loop0 record also retains a3.1second instrumented
render stall and possible short-viewport results clipping for investigation. Neither
is concealed by percentile timings. Pilot/final guards and bounded capture bursts
were delivered; bursts do not acknowledge that an agent viewed a frame.

The complete delivery SHA256 index was verified, pilot/final negative guards pass,
and source remains unchanged. See live-sol-low/CONTROLS-PILOT-20261115.md and its raw
receipts for exact evidence and limits. No candidate is frozen and no judge round
or publication has occurred.

## Hardware diagnostic batch,20:13–20:17UTC

The current46-file portable archive passed all-file byte/hash checks,28default-model
loads, arbitrary nested path, sandboxed iframe fullscreen, desktop/portrait/landscape/
short reduced-motion layouts, and explicit WebGL2-negative startup. No page/network
errors. ZIP remains65ed78c05863ebfb673f0de27beb74fda3bc667ac1f3bb0164bde2f1844bbea2.
Context recovery passed all3manual resume routes; default and legacy model assertions
and UI navigation passed. Exact paths/settings/render counts/limits are in HARDWARE-QA.md
and DISTRIBUTION.md. All source receipts match e1623af9.261/261 unit regressions pass.
The first model attempt failed on a QA dependency URL; retained alongside its passing
rerun. No assertions were removed or weakened. These are source/package diagnostics,
not completed gameplay episodes.

Opus confirmed the two results presentation reports have code causes (sticky footer
selection scrolls heading away; screen fade overlaps new flight) and is comparing a
staged patch on hardware before applying it. Primary added bounded slow-render
submission telemetry to the test bot for the next reproduction; it records sector,
clock, programs, resources and settings without changing production or simulation.
Sol Low is implementing a faster explicitly-viewed contact-sheet workflow in its
exclusive tooling area. No final freeze or judge round exists yet.

## Results integration and observation-workflow checkpoint

Opus's exact hardware-tested results correction is integrated ind160056: heading/
summary stay visible, action selection preserves scroll position, outgoing panels
cut before flight.265tests passed;18staged hardware comparisons and5curated images
are retained with receipts/hashes. Runtime source is now
f35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790 (96files).
See ui/RESULTS-PRESENTATION.md.

The live contact-sheet workflow passes CPU validation and actual hardware controls,
but genuinely viewed cadence is still blocked: panels were viewed16–20seconds
after capture, and the intervening collision/death was missed. No criteria changed;
final live remains0/60. Its genuine743frame death is a development pilot only.
The first-frame3.1second stall and new342ms sector1event are retained in
PERFORMANCE-INVESTIGATION.md for paired diagnostics; no cause/fix is claimed.

Codecleanup resume sent to the existing HydrogenHIGH SuperBeast thread after its
reported quota reset, with current reviewbranch15f57ed and explicit whole-module
audit/implementation/lease constraints. The older stale queued coordination message
was cancelled so it cannot later replay obsolete ownership. The new full brief is
queued in that existing thread; no duplicateHydrogen/modelsubstitution launched.
Reviewbranch push used existing gh authorization through a per-command credential
helper; no credential/config change. Main/Pages/Itch remain unchanged.

## Measured audio and stall diagnostics

Currentf35524e9 audio checks passed:32second measured render peak-5.32dBFS,
zero clips/page errors; actual Chrome trusted-gesture/same-context lifecycle passed.
Receipts include hardware/device/quality/render spans. No listening/physical-phone/
hidden-tab/Escape-blocking verdict is claimed (audio/INTEGRATION.md).

Two30second realtime startup probes and one accelerated shader-identification
probe deliberately timed out; all remain incomplete diagnostics with zero episode
credit. They did not reproduce the3.1second event. New programs coincide with
290–432ms stalls nearz310; the third identifieswarm_armor. Opening variants include
FUEL_Hull/FUEL_Band. Exact details and causal limits are in PERFORMANCE-INVESTIGATION.md;
raw file hashes in artifacts/launch/startup-audio-diagnostic-sha256.txt. No renderer/
material/gameplay code was changed. Primary GPU lease is released.

## 20:50 UTC production checkpoint and live-observation limit

The fingerprinted Pages production bundle for source `f35524e9…b22790` passed
hardware smoke on GTX1650Ti/D3D11 Chrome157:46/46 package bytes/hashes matched,
28 default resources and35 served model hashes, desktop/portrait/landscape,
shared-fortress/Daily start and persistence, no page/network errors.374 actual
presentation frames were observed; adaptive drawing buffers and exact environment
are recorded in HARDWARE-QA.md. This was local production verification, not a
publication or gameplay campaign.

Sol Low's immediate single-frame pilot seed170301/loop30 ended in a genuine normal-
resource death after808frames/808renders on the same source. Screenshot-ready
emission took25–32ms, but explicit viewing-note acceptance followed13–14seconds
later; opening and terminal were viewed, intermediate active play/collision were
not. Both blockers remain. Final credit stays0/60; this pilot cannot be relabelled.
The fast-single tooling and evidence hashes were independently checked. Repeating
identical latency pilots is not a remedy; Sol Low is investigating a materially
different CPU-side observation workflow while primary advances package evidence.

Hydrogen's active cleanup run remains coordinated on SuperBeast with all source,
media, authoritative receipts and other owners' visual/audio leases preserved.
No frozen final candidate, final bot credit or judge scores exist yet. The all21
>=9 gate and1000bot/60live requirements remain unchanged.

Sol Low's CPU-only preflight follow-up is now retained too: the title stays unstarted
until the explicit first trial command, with separate honest preflight-view notes.
That lifecycle change is runtime-unverified and supplies no gameplay credit. It does
not solve active sampling latency. The current available shell/image path has no
single-call hardware image-return adapter; preview cannot attach the proven Windows
pipe. Detailed capability limits are in live-sol-low/OBSERVATION-PATH-ASSESSMENT.md.

The265-test regression suite passed after integrating the current QA adapters.
PROOF-PACKET.md now indexes the seven lenses, exact receipts and known gaps without
inventing reviews or attributing development pilots to a future final candidate.

## Confirmed first-frame core defect — fix required before freeze

QA-only grade-provenance tracing reproduced the live pilot's unearned sector7 grade.
Engine._loop accepts negative elapsed time when the first rAF timestamp precedes
start's performance.now baseline. Backward flight belowz0 makes Level.sectorAt fall
through to the last sector and grade its predecessor. Both real GTX1650Ti realtime
tracing and an actual Engine/Game CPU reproduction establish this sequence. See
NEGATIVE-FIRST-FRAME.md and the hashed raw evidence. Hydrogen owns the nonvisual
core fix and meaningful regression; primary will integrate and rerun the hardware
reproduction before final campaigns. No post-fix pass or final episode credit exists.

## First-frame fix verified; final evidence identity tightened

Hydrogen ordinal5 failed at21:00UTC on a provider quota with a reported4h20reset.
Primary implemented the confirmed small Engine clock fix while that core writer
was idle; Spark is recovering Hydrogen's existing authored files read-only for
integration, not replacing its cleanup role. A hardware first callback20.9ms before
start now produces zero elapsed time/z0/allnull grades; later only grade0 is earned.
The exact CPU/base failure and real GPU before/after diagnostics are retained in
NEGATIVE-FIRST-FRAME.md and frame-clock-fix-evidence.sha256.268/268 regressions pass.

Final bot runs now require an immutable freeze JSON in addition to runtime hash.
They pin and recheck the entire QA/test tree, not only the browser pilot; campaign
credit rejects changed coordinators/recipes or different freeze bytes. Missing-
freeze CLI rejection occurs before GPU reservation or run creation. Startup and
per-episode non-WebSocket network failures are explicit errors; final batches stop
on a runtime/network failure and retain the failed row. No final campaign has begun.


## 21:26 UTC user-authorized cleanup takeover and rejected proposal

The user replaced quota-limited Hydrogen with **Sol XHigh** (`codex/gpt-6.1-sol`,
reasoningEffort xhigh) in the SAME SuperBeast thread, worktree and
`cleanup/public-launch-hydrogen` branch. This is an explicit owner replacement;
historical Hydrogen records remain attributed to their original model. No new
checkout/helper was created. The active lease covers nonvisual code cleanup,
Game.prewarm retention/teardown, startup, imported disposal, Input and relevant tests.
UI/presentation remains Opus, graphics remains Fable, audio remains Spark.

Primary recovered the original dirty five-file Hydrogen proposal byte-for-byte,
verified patch SHA256 `b49fde3ccd1013cc820b739972c88e942d1cdd94268a425325ffb8bcf02e8055`,
and observed 47/47 focused tests pass. The takeover owner found that temporary
cached-template attachment mutates template flags and misses the actual replaced
flyer/neon materials. The proposal is **not accepted**. After verifying all five
after-hashes, primary restored only those recovered files to committed daacde8;
the exact patch, tests and rejection receipt remain retained. Corrected retention
must own the actual staged material variants, replace one bounded detached set only
after successful compile, roll back failures and release all owners on final teardown.
Hardware program/resource/stall evidence is required before any performance claim.

The clock-fix source ff570c66 checkpoint was packaged for both bases. Its local Pages
hardware smoke passed: 46/46 file hashes, 28 default resources/35 served model hashes,
372 actual presentation frames at desktop/portrait/landscape, no page/network errors.
The portable ZIP is 7,356,344 bytes, SHA256
`950a71dcd816c6b13a6ab6cb36b4d91977d11a674d6af2268359e84c5989b762`;
this particular ZIP has not yet had nested iframe verification. All are development
checkpoints, not final freeze, gameplay credit, deployment or Itch upload. Final
bot/live credit remains **0/1000 and 0/60**, and no judging round has occurred.

## 21:57 UTC combined ownership integration

Corrected SuperBeast cleanup tranche1 (`effe596`) is integrated as `1cdcc68`; tranche2 (`efabcec`) as `059a395`. The latter records the50-production-path audit and constructor/cache/Settings API repairs. These audit source hashes describe the historical worker branch, not the final combined candidate. Native hardware proof for tranche1 retains the same targeted program IDs across successful/failed replacements and releases final owners; this proves ownership, not FPS or elimination of every compilation stall.

Fable’s9 world-retirement regressions and exact delivered file hashes were independently verified and integrated as `9afce92`. Opus’s5 UI construction/disposal regressions are integrated as `abb2af9`; its real-payload Settings seam lands after the actual API as `3db429f`, with25 focused UI/settings tests passing. Primary owns the reset retirement fix (`d173f68`, corrected startup-error preservation in `c7c6934`). An initial integration run caught2 startup contract failures; the unchanged tests pass after preserving the original preparation error. Full combined suite: **318/318**, Pages build passes. No golden or gameplay law changed. Spark’s audio disposal patch is still pending remote delivery.

Actual Windows Chrome157/GTX1650Ti quality-action diagnostic passed7 scenarios with4 actual prewarm calls,14 detached owners each time: same quality reuses, changed-quality Engage/Daily/Re-engage/keyboard launch warms before starting, paused Resume does not rewarm. This staged diagnostic earns zero gameplay credit. Default/legacy/context/UI combined-source hardware checks are running sequentially under owned leases.

Sol Low’s latest delayed-pipeline pilot was honestly excluded:511 actual renders, normal loop30 death,24.357s capture gap and41.745/26.131s conservative note ages. Original images/notes/hash receipts are retained. Pipeline controls and3 CPU tooling test files pass, but no demonstrated10s actual-view cadence exists. Do not repeat identical pilots or relabel captured frames as viewed. **Final bot0/1000; final live0/60; no candidate frozen, judge round or publication.**

## Explicit user player replacement, 2026-11-15

User: “Let’s use Terra medium as our player.” Sol Low’s completed task is retired from further player runs; its historical pilots remain attributed to Sol Low with **0/60 final credit**. New player task uses verified `codex/gpt-6.1-terra`, `reasoningEffort=medium`, onNitro in the shared bound worktree. Same60-episode/10-per-band requirement and honest observation contracts remain. Existing `live-sol-low/` tooling paths are retained to avoid churn; new records must name Terra Medium. The player role is distinct from the fresh readonly Terra High judge required in the independent final panel.

Terra has one bounded30s hardware control/cadence pilot slot after CPU inspection, with no second pilot/final campaign until source freeze/handoff. Primary holds production source stable during that slot. Last integrated source `f89400b5992e6a12eb6b08dab8ba485dc01269c3b90c9813accebe525b69ca97` passed actual GTX default and legacy models, context recovery and responsive keyboard/reduced-motion UI. All four receipts show stable source/exit0/no page errors; exact hardware metadata remains in the raw reports. Final bot0/1000 and live0/60; no judge round or publication.
