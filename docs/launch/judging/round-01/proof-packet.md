# Public-launch proof packet

This is the evidence index for independent judges. It grants no release approval.
Read the exact candidate identity and each receipt before attributing evidence to a
build. A package build, screenshot or automated episode does not establish human
play, audible perception, physical-device behavior or sustained hardware FPS.

## Current checkpoint

- **RC01 frozen:** runtime commit `c0ee2949de29adfa52e6dcdae6768c73ec15474a`, source `6d28e0210d802d0932762ba85f61d4cf43f14a646099a5f99411b0ab240f1362`; exact96 runtime,116 QA/test and55 editable-source hashes in [candidate identity](candidates/rc01.json). Later documentation commits do not change that frozen identity.
- **329/329 regressions pass.** Pages and portable Itch builds pass,46 files each. Exact-source Chrome audio lifecycle and32s audio rendering pass; nothing heard. Local production/nested-iframe hardware verification passed on the GTX1650Ti; both46-file packages hash-match, Pages35 model files match, and all checked views have zero page/network errors. Exact counts/receipts: [RC01-PACKAGES.json](RC01-PACKAGES.json). Pages measured481 engine callbacks/presentation draws; the Itch views measured326 engine callbacks (counts are not FPS).
- Final audited bot0/1000 and player0/60 at this checkpoint. RC01 batch `rc01-final-0000` is running; provisional episodes do not count until its closing receipts pass audit. Independent judging round01 is being prepared against this checkpoint; it excludes the running batch. Terra medium replaces Sol Low for new player runs; [honest takeover and independent timing audit](live-sol-low/TERRA-TAKEOVER.md).
- All21 individual >=9 gate remains unchanged; see [JUDGING-PROTOCOL.md](JUDGING-PROTOCOL.md). No publication or whole-release completion is authorized by a source freeze or automated check alone.
- The accepted gunner/art/models remain approved. No historical optional art review is fabricated. Main/Pages/Itch remain the previous published release.

## Evidence by lens

| Lens | Sources and concrete evidence | Limits and unfinished work |
|---|---|---|
| 1 Code, maintenance, tests, security | Entire `src/`, `tests/`, lockfile/build config; current329-test checkpoint; source and harness hashes in freeze tooling; no production `window.KZ` API in Pages smoke | Sol XHigh completed the same SuperBeast cleanup thread: both exact tranches are integrated, all50 production paths are audited with explicit limits, and reserved world/UI/reset fixes have landed. Spark’s Audio.dispose delivery is integrated with exact source/test hashes and actual-browser lifecycle plus rendered-mix checks; see audio/DISPOSAL.md. QA instrumentation is separate from shipped code. |
| 2 Reliability, lifecycle, performance, resources | [HARDWARE-QA.md](HARDWARE-QA.md), [PERFORMANCE-INVESTIGATION.md](PERFORMANCE-INVESTIGATION.md); context-loss/manual-resume, model/default/legacy/disposal, audio lifecycle and production resource checks | Source receipts span identified development checkpoints. Actual GPU probes established evicted material programs on the old baseline and retained IDs on corrected ownership; that does not prove every observed stall eliminated or establish FPS. Headless synthetic views do not prove physical-phone or sustained-FPS behavior. |
| 3 Gameplay, fairness, pacing, boss, replay | [BOT-HARNESS.md](BOT-HARNESS.md), source-derived six-band matrix; complete genuine loop0 victory pilot in [live controls receipt](live-sol-low/CONTROLS-PILOT-20261115.md); per-seed telemetry/media retained under `artifacts/launch/` | Pilots receive no final credit. Required1000 hardware episodes and60 realtime visually observed episodes remain incomplete. Bot operation differs from visual-agent observation. The negative-first-frame grade defect has a verified core fix; see [before/after reproduction](NEGATIVE-FIRST-FRAME.md). |
| 4 Art, world, ambience, readability | User acceptance; [Fable ambient receipt](fable/AMBIENT-TRAFFIC.md); `assets-source/environment/`, `assets-source/launch-environment/`;37 hardware traffic comparison pairs,9 targeted contracts | No accepted-art contest reopened. Traffic captures cover High, two viewports, loop0; stills are not a continuous motion/human-play verdict. |
| 5 UI, HUD, access, input, responsiveness | Opus title tests and source, UI constructor/disposal fault regressions and actual-payload Settings persistence tests; [results presentation](ui/RESULTS-PRESENTATION.md);18 staged hardware results checks; source keyboard/short/portrait/reduced-motion QA; production desktop/portrait/landscape | Physical controller/touch hardware and assistive-technology use are untested. Staged results tests use actual screen code but do not claim normal-play replay. Live observation latency remains unresolved; see [assessment](live-sol-low/OBSERVATION-PATH-ASSESSMENT.md). |
| 6 Audio/music/SFX/cues/unlock/recovery | [Audio integration](audio/INTEGRATION.md), [Spark measured tranche](audio/TRANCHE.md); distinct missile-lock cue;32s current-source mix measurement with zero clipping, trusted-gesture/same-context resume | No agent heard the audio. Visibility interruption was not exercised by the headless tab. No speaker/phone-call/physical-controller-only audition claim. |
| 7 Title, brand, marketing, listing, distribution | `assets-source/launch-marketing/README.md`, `export-manifest.json`, `ITCH-LISTING.md`; five native1920×1080 GTX1650Ti screenshots; cover/OG/GitHub/banner editable sources; [DISTRIBUTION.md](DISTRIBUTION.md); local Pages production and prior portable Itch verification | Marketing frames are explicitly staged and source-identified, not gameplay wins. ScreenRGB, no printer profile/CMYK/bleed claim. Itch listing/images/upload and GitHub social preview remain unchanged account settings. A final portable archive must follow integration/freeze. |

## Device and identity rules

The hardware path is NitroBliss Windows Chrome157.0.8103.52 over Playwright local
child-process pipes. Its unmasked renderer is NVIDIA GeForce GTX1650Ti through
ANGLE/D3D11. Each run records actual settings, viewport, DPR, buffer and frame count.
Software WebGL frames are not credited toward hardware campaign requirements.
Only one owned Nitro GPU job runs at a time under the shared token/PID lease.

Runtime identity comes from `scripts/qa/launch/fingerprint.cjs`. Final freezes also
pin all QA/tests, dependency versions, marketing composition tools and editable
launch art. Raw manifests, JSONL outcomes, original screenshots and failed attempts
remain available; curated sources/evidence stay in the repository. Never sum pilots
or incompatible source/harness records into a final count.

## Publication truth

The existing live Pages runtime is `1b3ff18bbabdedf30295846f3594c831ef5c30a5`, with
documentation closeout `2a77036cbc6a64b1b1656c8df8949a5650098dab`. The public itch
listing currently links to Pages; no new HTML5 upload is claimed. No final release
PR, merge, Pages deployment, Itch upload or account-image update has occurred in
this launch preparation. Preserve the previous Itch build when publishing.

## Combined ownership evidence, 2026-11-15

- [Full path audit and scope/limitations](cleanup/AUDIT.json), [tranche2 receipt](cleanup/TRANCHE-2.md). Audit hashes are for the worker’s historical branch, not the final combined runtime.
- [Fable world retirement](fable/WORLD-RETIREMENT.md):9 real-kit/seeded-level fault regressions, independently passed onNitro; appearance and RNG definitions unchanged.
- [Opus UI ownership](ui/OWNERSHIP-RETIREMENT.md) and [Settings status](ui/SETTINGS-PERSISTENCE.md): actual source, failure-before/pass-after, no separate storage probe.
- [Primary reset retirement and preserved construction errors](RESET-OWNERSHIP.md): caught integration regression retained; unchanged reset/startup suites38/38 pass, full318/318 pass.
- [Ownership evidence hashes](ownership-integration.sha256), [tranche1 hardware ownership hashes](cleanup-tranche-1-nitro.sha256), [Settings hashes](settings-persistence.sha256), [reset hashes](reset-ownership.sha256).
- Hardware quality-action diagnostic at `artifacts/launch/functional/prewarm-quality-2026-11-15T21-51-39-902Z/`:7 actual menu scenarios,4 prewarms,14 detached owners each, no page/network errors. Staged, zero gameplay credit; source-receipt pins the checkpoint.
- [Latest delayed-pipeline observation pilot](live-sol-low/PARALLEL-PILOT-01.md): mechanism works, cadence does not. Final live0/60; no capture is automatically a viewed observation.

## Round01 evidence cutoff

The source and harness are frozen as RC01. The running final bot batch and any later new receipts are excluded from this round. Audited final counts at this cutoff: bot0/1000, Terra Medium player0/60. Known missing actual viewing cadence, unheard audio, physical-device/account limits remain exposed. Judge the shipped behavior and available substantiation honestly; do not infer successful future work. Readonly review only; no browser/GPU process, production edits, or helpers.
