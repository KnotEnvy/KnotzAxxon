# Public-launch proof packet

This is the evidence index for independent judges. It grants no release approval.
Read the exact candidate identity and each receipt before attributing evidence to a
build. A package build, screenshot or automated episode does not establish human
play, audible perception, physical-device behavior or sustained hardware FPS.

## Current checkpoint

- Worktree: tool-bound `release/final-public-launch`; main is still the prior live
  release. Runtime source fingerprint:
  `f35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790` (96 files).
- **No final candidate frozen. No judge round run. Final bot0/1000, live0/60.**
- The seven lenses and all21 individual >=9 release gate are unchanged; see
  [JUDGING-PROTOCOL.md](JUDGING-PROTOCOL.md). Judges must score independently and
  name unsupported conclusions and remaining findings honestly.
- Latest complete regression checkpoint:265/265 passed on2026-11-15 after results
  fixes. The current Pages bundle built and passed hardware production smoke.
- Existing accepted art/gunner/models remain approved by the user. Historical
  optional formal asset-review counts remain historical; they are not new reviews.

## Evidence by lens

| Lens | Sources and concrete evidence | Limits and unfinished work |
|---|---|---|
| 1 Code, maintenance, tests, security | Entire `src/`, `tests/`, lockfile/build config; current265-test checkpoint; source and harness hashes in freeze tooling; no production `window.KZ` API in Pages smoke | Hydrogen's whole-module audit/implementation is still pending integration. QA instrumentation is separate from shipped code. |
| 2 Reliability, lifecycle, performance, resources | [HARDWARE-QA.md](HARDWARE-QA.md), [PERFORMANCE-INVESTIGATION.md](PERFORMANCE-INVESTIGATION.md); context-loss/manual-resume, model/default/legacy/disposal, audio lifecycle and production resource checks | Source receipts span identified development checkpoints. Startup submissions still include shader-associated stalls; causes/fixes are not established. Headless synthetic views do not prove physical-phone or sustained-FPS behavior. |
| 3 Gameplay, fairness, pacing, boss, replay | [BOT-HARNESS.md](BOT-HARNESS.md), source-derived six-band matrix; complete genuine loop0 victory pilot in [live controls receipt](live-sol-low/CONTROLS-PILOT-20261115.md); per-seed telemetry/media retained under `artifacts/launch/` | Pilots receive no final credit. Required1000 hardware episodes and60 realtime visually observed episodes remain incomplete. Bot operation differs from visual-agent observation. A grade/progression discrepancy is under investigation. |
| 4 Art, world, ambience, readability | User acceptance; [Fable ambient receipt](fable/AMBIENT-TRAFFIC.md); `assets-source/environment/`, `assets-source/launch-environment/`;37 hardware traffic comparison pairs,9 targeted contracts | No accepted-art contest reopened. Traffic captures cover High, two viewports, loop0; stills are not a continuous motion/human-play verdict. |
| 5 UI, HUD, access, input, responsiveness | Opus title tests and source; [results presentation](ui/RESULTS-PRESENTATION.md);18 staged hardware results checks; source keyboard/short/portrait/reduced-motion QA; production desktop/portrait/landscape | Physical controller/touch hardware and assistive-technology use are untested. Staged results tests use actual screen code but do not claim normal-play replay. Live observation latency remains unresolved; see [assessment](live-sol-low/OBSERVATION-PATH-ASSESSMENT.md). |
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
