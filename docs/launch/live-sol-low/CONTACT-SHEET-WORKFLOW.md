# CPU-ready contact-sheet workflow — no new gameplay trials

Prepared from integrated HEAD67125f611de95155878a22dab1ed577116af4fa3.
No browser, Vite server, GPU job, lease acquisition, candidate polling or waiting
process was started in this tranche. Final credited trials remain **0/60**; all prior
pilot receipts, gap/stall evidence and media remain intact.

## What changed

`start` can request `burst:true` to capture the initial frame plus two opening frames
in one bounded operation. `observe-burst` now returns one labelled vertical contact
sheet for up to3original screenshots instead of requiring3separate image-view calls.
The normal engine continues running at actual rAF timestamps and renders every frame;
no simulation pause/acceleration, resource/physics/input law or final60matrix changed.
Burst target is capture starts at0/2/4seconds; actual starts/completion/gaps are recorded.
If screenshot work overruns a target it is not concealed or backdated. Stops early on
terminal state. At most3captures, interval1000–3000ms; no background capture loop.

Composition runs in existing Windows Python `C:\Python311\python.exe`, Pillow10.3.0,
through an asynchronous local subprocess. Linux Python lacks Pillow; nothing installed.
It uses original PNGs read-only, verifies SHA256 before composition and refuses output
overwrite. Each panel has observation id, capture-start/completion UTC timestamps,
pre-capture telemetry frame, state, original dimensions and actual display scale.
960x540screens stack at native size; larger screens are reduced to fit960x600per panel.
Full originals/hashes are always preserved for closer inspection. The sheet says
CAPTURED MOMENTS ONLY / NOT CONTINUOUS ACTION / VIEWING NOT ACKNOWLEDGED.

`contact-sheets.jsonl` preserves sheet hash, source hashes, panel rectangles/dimensions,
composition duration, actual capture gaps and completion time. Ready output contains
a Linux absolute sheet path for one direct view_image call. Sheet creation never
marks any observation viewed.

`note-sheet` requires explicit viewed:true, an actual viewedAt timestamp and separate
visible facts for each selected panel. A shared explicit confidence/limits field is
permitted to reduce typing; interpretations default empty. Panels can override these
fields or supply a distinct viewedAt. Unselected panels remain unacknowledged. All
notes validate before any are appended. Each note retains source/sheet hashes, panel
number, explicit viewedAt, noteAcceptedAt and captureToViewedMs. Capture age is not
silently treated as live viewing. Long capture gaps STILL trigger the unchanged
>10second blocker; contact sheets do not waive it or grant credit. Fine reaction/feel
claims still require actual evidence, not three captured moments.

`nextBurst:true` on note-sheet records that sheet's explicit notes then captures the
next bounded sheet in the SAME control call, reducing round trips. It does not invent
facts or acknowledge the next sheet. This reduces transport/view overhead; it has
not yet demonstrated acceptable actual runtime cadence.

## Exact next bounded runtime smoke — ONLY after next GPU-slot handoff

```sh
node scripts/qa/live-sol-low/final-live.cjs --launch --pilot --pilot-seed-base 170201 --pilot-max-seconds 30 --run-id pilot-live-sheet-smoke-01
```

This command is provided, NOT executed here. Fresh pilot seeds170201/170202 are outside
final2600001+plan and do not reuse the preceding170101/170001pilot. Current source hash
is derived and enforced as before. Mode remains development-live-pilot/permanently
uncredited. Only run loop30 row; do not start loop0 or repeat the full5minute campaign.
The pilot-only30second cap preserves a timeout as incomplete, never as a genuine death.
Final plan maxSeconds and all60rows remain unchanged.

On ready, send:

```json
{"op":"start","id":"pilot-live-l30","burst":true,"count":3,"intervalMs":2000}
```

Open the returned `.../pilot-live-l30-sheet001.png` once with view_image. Inspect each
panel separately. Immediately record the actual UTC view time (for example get the
local UTC clock immediately after inspection); never substitute the capture time.
Then submit compact notes and the next capture in one command:

```json
{"op":"note-sheet","sheetId":"pilot-live-l30-sheet001","viewed":true,"viewedAt":"ACTUAL_ISO_UTC_AFTER_VIEW","confidence":"medium","limits":["Three captured moments; no continuous action/audio/input-latency claim"],"frames":[{"panel":1,"facts":["ACTUAL visible fact for P1"]},{"panel":2,"facts":["ACTUAL visible fact for P2"]},{"panel":3,"facts":["ACTUAL visible fact for P3"]}],"nextBurst":true}
```

The example is a template, not evidence. If early death produced only1–2panels, supply
only those actually inspected. If one panel is unreadable, omit it or state the actual
readability limit; no automatic all-panel acknowledgment. Open the next returned sheet
once and explicitly note its actual panels. If done, omit nextBurst and send end then
quit. If still active at the bounded timeout, preserve timeout and close without
claiming a completed episode. An explicit abort also preserves incomplete evidence.

```json
{"op":"end"}
{"op":"quit"}
```

Acceptance for the smoke: one sheet actually viewed with per-panel notes; originals
and hashes retained; actual capture/view timing reviewed; terminal/incomplete result
and normal resources/render law recorded; owned browser/server exit and own-token lease
release verified. If gaps/view latency remain too large, retain blockers and report it;
do not begin final60 merely because contact-sheet CPU tests pass.

## CPU evidence and limits

`contact-sheet-test.py` composed3tiny synthetic24x16RGB panels using installed Windows
Pillow. Tests verify exact panel pixels/rectangles, retained original hashes, no viewing
acknowledgment, and refusal of overwrite/tampered originals. The synthetic sheet was
opened once with view_image: labels/time/frame/state and separate red/green/blue panels
were visible. It is CPU test imagery, not game evidence.

`visual-notes.test.cjs` verifies explicit timestamps/age, compact per-panel facts,
subset acknowledgments, distinct per-panel timestamps, no input mutation, rejection of
missing acknowledgment/invalid times/duplicate or unknown panels/empty facts, and exact
retention of20second stale capture age. Existing60matrix and mode guards pass unchanged.
All owned CJS syntax checks pass. Invalid pilot bound is rejected before lease/server/
browser access; no-launch path remains CPU-only. Hash index `contact-sheet-cpu.sha256`
includes exact delivered tools/docs and synthetic test evidence. New Windows browser
integration, composition overhead alongside gameplay and actual faster observation
cadence remain runtime-unverified pending the explicit next slot.
