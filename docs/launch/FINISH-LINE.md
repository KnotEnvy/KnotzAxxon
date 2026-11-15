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
| P0 | Sol Low, Nitro: live observed gameplay and hardware pilot | `scripts/qa/live-sol-low/`, `docs/launch/live-sol-low/`, `artifacts/launch/live-sol-low/` | Verify Windows Chrome/local-pipe GPU first; normal gameplay; pilots separate from final trials |
| P1 | Opus High, Nitro: title and actual-game marketing | `src/style.css`, `src/ui/Screens.js`, `index.html`, title-only hunks in `src/game/Game.js`, `public/brand/`, `assets-source/launch-marketing/`, `scripts/brand/launch/` | CPU work first; coordinate GPU slot; no gameplay or model replacement |
| P1 | Spark 1.3, SuperBeast: audio | `src/audio/` and audio content are reserved for Spark's replacement/patch delivery; owned remote output only | Read exact base; no dirty-root edits; no heavy GPU; coordinate Hydrogen |
| P1 | Hydrogen High, existing SuperBeast thread: code cleanup | Core/entities/render/lifecycle/tests/docs outside leases; audit entire codebase | Existing worktree/branch; no duplicate launch; UI/attract/audio/world writes reserved |
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
findings Fable fixes the rendered world and Opus fixes presentation. Hydrogen must not
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
- Existing Itch: https://hacktivatenation.itch.io/knotzaxxon (current inspection pending;
  no assertion that it matches Pages; preserve the previous upload).
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
