# Final live-agent trial controls — 30-play plan, not executed

Prepared against HEAD `cdbdf6a2eb78198d77492b7353396089877aa2b4` on 2026-11-15.
This tranche is CPU-only. No GPU lease acquired, browser launched or server started.
Historical pilots remain historical. Current user requirement: **0/30**, five per band, Terra Medium. The former60-row plan is retained byte-for-byte as `final-trial-plan-60-historical.json`.
No formal review or judge scores. Earlier pilot scripts, media and receipts preserved.

## Freeze and run

Primary must supply the frozen `fingerprint.cjs` sourceHash and exclusive GPU slot.
A git commit alone is insufficient: sourceHash covers sorted SHA256 entries for src,
public, index.html, package/package-lock and Vite config, as the bot protocol defines.
Since RC02, final trials require the immutable freeze and one of its exact
production packages. Vite DEV is reserved for permanently uncredited pilots.
The same production attachment/inventory verification as the bot campaign is used;
no shipped bytes are changed or debug port opened.

After that authorization, in an interactive terminal:

```sh
node scripts/qa/live-sol-low/final-live.cjs --launch --candidate ACTUAL_64_HEX_SOURCE_HASH --freeze docs/launch/candidates/RC_NAME.json --production artifacts/launch/pages/SOURCE_PREFIX --run-id final-live-UNIQUE_NAME
```

No `--launch`: CPU preparation message only, no browser/server/lease. With `--launch`,
source must match before the lease; then shared atomic lease acquired with pid,
ownerPID and token recorded. Busy fails immediately; no polling/deleting stale locks.
Coordinator owns a loopback-only static server for hash-verified package bytes;
Windows Node starts installed Chrome through local pipes. Browser inventory proof,
package manifest identity and the full harness are retained before/after execution.
No public debug port or firewall change. Source snapshots recorded for start/end and
session receipt. A mismatch refuses start or marks the resulting trial ineligible.
All raw output goes in a new `artifacts/launch/live-sol-low/<run-id>/`; overwrite refused.

Operator-paced JSON lines on stdin (Linux coordinator handles LF normally):

```json
{"op":"start","id":"live-l0-01"}
{"op":"observe","reason":"periodic / gate approaching / sector change / boss cue"}
{"op":"note","observationId":"live-l0-01-o001","viewed":true,"facts":["ONLY what was actually visible"],"interpretations":["A separate qualified interpretation, or empty array"],"confidence":"medium","limits":["What this frame cannot establish"]}
{"op":"observe","reason":"terminal"}
{"op":"end"}
{"op":"quit"}
```

The example is a format template, not evidence. Open every screenshot actually used
with view_image before submitting viewed:true. Start returns an initial screenshot;
observe returns an absolute Windows UNC path and id. It maps to the identical Linux
run directory for view_image. Write notes for initial, active-play and terminal frames.
`end` drains/captures a final frame and calls KZBot.end only after genuine completion.
Capture AND view/note the terminal state BEFORE end. Capturing does not mean viewing.
An unviewed redundant end screenshot does not invalidate an earlier viewed terminal.
Use `{"op":"abort"}` for incomplete/timeout/blocker; never relabel it as death.
Quit is refused while a trial is active; end/abort first. EOF preserves an abandoned
record and closes Chrome. Graceful quit lets coordinator close server and release its
own token; SIGINT/SIGTERM is the fallback. Never terminate another owner's processes.

Start uses trusted actual ENGAGE button to unlock audio once, then the primary's
unchanged KZBot.startRealtime(spec), observeRealtime(), end(). Same original Engine
loop, actual rAF timestamps, renderEvery1, normal hitstop/input/collision/health/fuel/
weapons. Shared RNG seeded once per episode, algorithm unchanged; original engine time
is captured in initial.engineTime. Replay with the same seed/shared seed/config;
exact realtime collision reproduction may still vary with frame timing. No synthetic
clock, pause, accelerated chunk or scenario injection is exposed by these controls.

Optional supplemental keys:
`{"op":"keys","keys":["ArrowUp","Space"]}`; empty keys releases held keys.
Allowed keys: arrows, Space, KeyL, ShiftLeft. Keyboard-profile only. The bot continues
to decide every six frames and can overwrite intent; mixed operator attribution is
recorded. This is NOT exclusive manual play. Controller/touch rows are synthetic
normal-input-path tests, not physical devices, touch hit testing or latency evidence.

## Plan and observation discipline

`final-trial-plan.json` has 30 unexecuted rows, five each at source-derived loops
0/1/2/3/7/30, seeds2600001–2600030. Final row guards accept only01–05 per band. Each band includes Classic/Modern/Chase,
Low/Medium/High/Ultra, desktop/landscape/portrait. All loop starts, including0, are
labelled seeded-loop-start; none proves earned previous-loop progression. There are
no public Easy/Normal/Hard modes. Plan generator supports an explicit different seed
base for separately documented replacements; failed/menu/boot/timeouts never count.
Coordinator scans existing initial.jsonl files under the live root to reject reuse of
an attempted final seed. Session also refuses duplicate seeds. Preserve aborted rows;
replacement seeds require explicit plan documentation, never silent retries.

Observe every2–5seconds during running play, and more closely at first shot, gates,
sector transitions, boss phase/rack cues and terminal states. No automatic scheduler
creates visual observations. Coarse10second+ running gaps are marked blocking. A
screenshot request takes time while gameplay continues; avoid long analysis/CPU work
mid-trial. Terminal-state note writing may take longer because gameplay has ended.
The bot's events/checkpoint/samples help select the next observation; those events are
not evidence that the agent saw a cue. Record exact visible facts first, interpretation
second. Distinguish missed observation from missing game cue. Reaction-window claims
need timed multiple frames, not inferred telemetry alone. Audio cannot be assessed by
screenshots. Do not infer fatigue, hardware input latency or fairness from survival.

All-eight-sector/boss0/1/2/rack/earnedLoop2 coverage must be explicitly audited from
these live records. Opening deaths can satisfy completed attempts but not progression
coverage. Primary's separate bot victories remain bot evidence only. If trials do not
reach these features, report that gap; do not invent scenario credit.

## Record files / JSON format

- config.json: candidate/full source-before file hashes, lease ownerPID/token,
  Chrome/Playwright path, bot/live harness hashes, plan, localhost URL.
- hardware.json: actual unmasked renderer/vendor, WebGL2, Chrome version, UA,
  host/OS/arch, viewport/DPR, local-pipe automation, physicalDevicesTested: [].
- initial.jsonl: trial spec, seed/shared seed/loop/fixture, normal initial resources,
  engine time, exact settings/canvas/viewport, hardware, source-before snapshot.
- observations.jsonl: screenshot id/file/SHA256, request/completion UTC times,
  gapMs, actual bot frame/render counts, samples/events/checkpoint/done,
  actual canvas/settings/visibility/focus/page performance time.
- visual-notes.jsonl: explicit viewedAt/observer, referenced screenshot id,
  facts[], interpretations[], confidence low|medium|high, limits[].
- commands.jsonl: exact commands incl source before/after snapshots where applicable.
- trials.jsonl: schemaVersion1, candidate/buildKind, initial/spec/hardware,
  observations AND viewed notes, full KZBot.end result with outcome/completed,
  actual renders/frames/rAF intervals, raw/game/wall timing, sectors/boss/rack,
  resources, normal law strings, sourceAfter, pageErrors, blockingReasons.
- errors/network/command-errors/fatal/abandoned JSONL preserve failures;
  receipt.json records final source snapshot/stability/exit status.

Every trial deliberately has credited:false and eligibility:"pending primary evidence
audit". Harness readiness never grants credit. Blocking checks include source mismatch,
incomplete/timeout, altered initial resources, page error, mode/render-count mismatch,
missing viewed initial/during/terminal frames and >10second running observation gaps.
Primary must also audit substantive notes, unique seeds across the final packet,
freeze/production linkage, seven-lens evidence limits and actual coverage. No numeric
feel scores are generated. A screenshot and its subsequent telemetry are sequential;
they are not guaranteed to describe precisely the same rendered frame.

## CPU validation and remaining runtime limits

`node scripts/qa/live-sol-low/prepare.test.cjs` passes deterministic60seed/per-band/
rig/quality/viewport checks and invalid-seed checks. Every owned CJS passes node --check.
No-flag coordinator returns before any lease/server/browser access. Wrong-candidate
launch was CPU-tested and rejected before lease acquisition. No final Windows runtime
or cleanup path in these NEW files was exercised this tranche; the earlier hardware
pilot is historical evidence of the underlying Windows/local-pipe path only. Final
controls must receive a small runtime smoke in the authorized GPU slot before bulk
use. Do not credit a smoke unless it independently meets all frozen-trial requirements.

## Controls runtime pilot follow-up

See CONTROLS-PILOT-20261115.md. Explicit development launch is now:
`node scripts/qa/live-sol-low/final-live.cjs --launch --pilot --run-id pilot-live-UNIQUE`.
Pilot derives current source hash unless supplied; matching hash is still enforced.
Pilot specs170101/loop30 and170001/loop0 are separate from final60plan. Rowkind and
run-id guards prevent pilot/final mixing; all pilot rows permanently uncredited.
Bounded observe-burst captures up to3frames at1–3s intervals without pausing gameplay;
captures still require actual view/note and do not automatically satisfy live cadence.

## Contact-sheet controls (CPU-ready, awaiting bounded runtime smoke)

See CONTACT-SHEET-WORKFLOW.md for the exact30second pilot-only smoke command and fast
start-burst / view_image / note-sheet+nextBurst workflow. Up to3labelled frames fit one
image call; full originals and hashes remain. Explicit per-panel actual viewedAt/facts
are required; creation never acknowledges viewing. Existing10second gap blocker and
all60matrix remain unchanged. No new gameplay was run for this CPU preparation.

## Current player and independent timing audit

Since the explicit2026-11-15 user instruction, **Terra medium** owns new observed player runs. Earlier Sol Low evidence remains historical; the existing directory name is retained. Before credit, run `node scripts/qa/launch/audit-live.cjs <trials.jsonl> <candidate sourceHash>` and inspect original images/notes. Its record checks exclude unviewed captures from the viewing cadence and check actual-view ages; even a passing record audit never grants automatic gameplay credit. See `TERRA-TAKEOVER.md`.

## Strict record audit (RC02 onward)

`node scripts/qa/launch/audit-live.cjs TRIALS.jsonl docs/launch/candidates/RC_NAME.json`
loads the closed-run receipt and requires frozen production identity plus a stable
full harness. Runtime and offline checks share the same viewed-frame checks.
Only explicit notes with matching original image hashes count; unviewed captures
cannot fill gaps. Both actual-view times and conservative note-acceptance ages
are checked against ten seconds. This is record validation and always returns
`credited:false`; primary image/notes and seed/band review remain necessary.
The actual-view path is still unproven; these guards do not establish cadence.
