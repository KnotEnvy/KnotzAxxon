# Parallel image/capture pipeline — CPU capability result

2026-11-15. No browser/server/GPU launched; final0/60. Existing pilot image used, not a new episode. Supersedes prior claim that only a new tool adapter could remove the serial hop: multi_tool_use.parallel successfully delivered functions.view_image visual content alongside independent functions.exec_command CPU output.

Actually viewed image: artifacts/launch/live-sol-low/pilot-live-fast-single-01/pilot-live-l30-o001.png; centered ship, fuel100/hull100, sector241. Parallel timestamp2026-11-15T21:27:26.831391Z monotonic24818885133167; first CPU command after actual inspection2026-11-15T21:27:33.130824Z monotonic24825184371855. Difference6.299432688s. These are executed timestamp operations, not host tool invocation/completion timestamps or exact view completion. Actual tool timeline API was not exposed. No inference that concurrent timestamp proves image had already been viewed. Capability succeeds; gameplay timing remains unverified.

## Bounded controls

New pipeline-observe command admits capture only while fewer than2 captured screenshots remain explicitly unacknowledged. note with pipeline:true rejects duplicate/unknown acknowledgments; viewed:true/facts/confidence/limits validation remains mandatory. note pipeline:true nextObserve:true acknowledges the already viewed frame before admitting next capture. No automatic capture loop, acknowledgment or changes to normal engine/input/resources. Existing10s gap blocker unchanged. No final eligibility or60matrix changes.

## Exact next pilot command, ONLY after explicit GPU slot authorization

```
node scripts/qa/live-sol-low/final-live.cjs --launch --pilot --pilot-seed-base 170401 --pilot-max-seconds 30 --run-id pilot-live-parallel-01
```

Run loop30 only; no loop0/60 campaign. Preflight optional before start, no gameplay credit. Send start id pilot-live-l30 and retain returned session ID S and original screenshot path P1.

1. In ONE multi_tool_use.parallel call, issue functions.view_image(path=P1) AND functions.write_stdin(session_id=S, chars='{"op":"pipeline-observe"}\n', yield_time_ms=1000). Operations are independent: capture new file P2 while viewing immutable P1. Read actual returned image; capture is not viewing. No note yet for an image not inspected.
2. After actually inspecting P1, in next parallel call issue functions.view_image(path=P2) AND write_stdin with a brief truthful note for P1, pipeline:true,nextObserve:true. Example command: {"op":"note","observationId":"pilot-live-l30-o001","viewed":true,"facts":["<actually seen P1 fact>"],"confidence":"high","limits":["Still only"],"pipeline":true,"nextObserve":true}. This returns P3 while P2 is viewed. Do not put P2 facts in that command: P2 has not yet been returned/viewed at command construction.
3. Repeat view PN concurrently with note for previously inspected PN-1 plus nextObserve:true. This creates max2 outstanding files. Preserve original file/hash and all notes. No CPU/docs work during active run. Short facts only; interpretations at terminal.
4. When terminal capture appears, inspect it in the next parallel call alongside note for previous inspected frame WITHOUT nextObserve. Then explicitly note the terminal after actually viewing; end/quit normally. If two files both show terminal, note only those actually opened. End's duplicate capture remains unviewed unless separately opened.

If a write_stdin call returns before screenshot-ready, do not guess or view an incomplete file: read managed process output normally; record the added delay. Do not launch a second writer concurrently to same session. Each parallel batch has exactly one session writer and one immutable file reader. Never call end concurrently with a capture. Stop after this one bounded pilot; no repeated identical attempts. The primary must authorize the GPU slot first.

## Timing interpretation and limits

Pipelining overlaps capture/control with image viewing. It cannot guarantee model/tool overhead below10s. In steady state a screenshot can be one batch old when viewed and another when its conservative note is accepted; capture-to-note age may still exceed10s even if captures are closer. Keep conservative note-acceptance viewedAt and all capture gaps; do not backdate using the concurrent CPU clock (which may execute before image viewing). readyEmittedAt and captureCompletedAt are producer times only. Future runtime report must distinguish producer delay, acknowledgment upper bound and unknown exact view/tool completion times. No continuous-video or audio/input-feel claim from stills.

## Grade finding status

Historical fast-single terminal grade slot7 C agrees with its result.grades despite sectors0/1. Evidence is retained in FAST-SINGLE-SMOKE-01.md and original PNG. Primary reports negative-first-frame fix9b36398 hardware verified and this grade defect corrected; this CPU tranche has not independently rerun it. No new fix claim or UI edit here.

## Validation

node --check windows-live.cjs; pipeline.test.cjs; visual-notes.test.cjs; prepare.test.cjs all passed. Pipeline tests cover max2 outstanding, unknown/duplicate note rejection and no automatic mutation. No runtime validation yet. Owned files: pipeline.cjs, pipeline.test.cjs, windows-live.cjs, this guide and CPU receipt/hash index. No helpers/commits/PRs.
