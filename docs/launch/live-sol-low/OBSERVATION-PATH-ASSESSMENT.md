# CPU observation-path assessment

November15 2026. No browser/server/GPU launch or lease acquisition in this tranche. Final0/60. Runtime smoke is not authorized now. No production changes.

## Findings

windows-live.cjs previously clicked ENGAGE before ready. This started an uncredited run while the observer prepared commands, potentially warming shaders or leaving per-session storage. Changed it to keep normal title/attract until explicit start. New preflight captures the unstarted title and hashes the original PNG, independent of active trial rows; explicit preflight-note records real observer facts, conservative note-acceptance timestamp and credited:false. First start performs the trusted ENGAGE gesture immediately before RNG/fixture initialization; no image wait, pause or slow motion is inserted into active play. Existing start still returns immediate active screenshot. Later trials use the same established gesture context. This change is CPU syntax/validation checked, runtime-unverified. Title attract itself remains normal engine behavior.

Commands once a new slot is explicitly authorized:
1. Launch a fresh pilot identity/seed with final-live.cjs; no launch now.
2. Send {"op":"preflight"}, open returned PNG with view_image while title stays unstarted.
3. Send {"op":"preflight-note","viewed":true,"facts":["<actually seen>"],"confidence":"high","limits":["Title only; no episode credit"]}.
4. Send start, immediately open original active screenshot, submit short factual note with nextObserve:true. Long interpretations only at terminal. Preflight cannot replace required during-run observations. Normal10s blocker remains.

## Tool capability boundaries

Available exec_command/write_stdin return textual stdout/session IDs, not image-content blocks. Printing PNG/base64/ANSI does not establish model image viewing. view_image accepts an existing local image and returns visual content; it does not capture a browser in the same call. The Windows Playwright page.screenshot API yields PNG bytes/files to its Node process, but that does not turn shell tool output into inline model image input. The current local pipe does not expose CDP; preserve that.

The authorized preview_snapshot schema explicitly offers includeImage:true and screenshot state in one tool call. If a compatible hardware browser is owned by that preview service, this removes the separate path→view_image hop and is the strongest materially different available interface candidate. It cannot be selected as a proven solution here: preview_open exposes URL/port navigation, not attaching the existing Windows Node/Chrome pipe or executable selection. Prior preview failure was missing host libraries; no fresh browser probe is performed during another owner's GPU slot. Opening the Vite URL there would create a separate browser, not transfer GTX proof from Windows Chrome. Every new actual renderer would need its own proof.

No installed CLI API has been demonstrated to return image content to this agent in the same capture operation. A future tool-host adapter wrapping the existing Windows pipe and returning MCP image content plus capture timings could remove the extra hop without CDP. This requires exposing an actual image-returning tool to the agent; writing an arbitrary local MCP script does not make it callable through this session. Not implemented or claimed available. Tool integration is a concrete dependency, not a tested solution.

## Viability decision

The existing single-frame workflow has a fast producer (25–32ms capture-completion→ready emission) but conservative viewed-note acknowledgment13–14s later. This includes uninstrumented tool-return, image presentation/model processing and command submission. Do not describe it as a measured13s image decoder delay. An eleven-second high-loop death can occur before a second observation. Title preflight removes pre-start waste and helps inspect onboarding, but cannot solve active sampling latency. Longer bot survival might permit a second active view but still cannot make14s observation spacing satisfy10s. No final60 should start on these tools/evidence.

Defensible next step is an image-returning hardware-compatible tool path, or a demonstrated per-cycle tool/model latency below10s with a materially changed interface. No identical pilot should be repeated just to hope it passes. QA-only bot proposals may choose earlier obstacle avoidance or threat-aware roll through normal inputs, measured separately for survival; they must not alter health/fuel/collisions/clock or be presented as an observation-contract fix.

## Preserved grade discrepancy

Exact evidence: artifacts/launch/live-sol-low/pilot-live-fast-single-01/pilot-live-l30-o002.png SHA256 recorded in evidence.sha256. Viewed terminal showed C at sector-grade slots1 and7; trials.jsonl result.grades=["C",null,null,null,null,null,"C",null] while result.sectors=[0,1], no boss phases/rack/earned progression. Seed170301/loop30 fixture, score8180; sourcef35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790. Thus telemetry agrees with displayed grade values; discrepancy is between grade bookkeeping and observed progression, not demonstrated renderer/UI misalignment. Cause unisolated. Prior uncredited ENGAGE lifecycle is a hypothesis only; new deferral has not been run and is not claimed a fix. No UI or production edits.

## Validation and owned changes

node --check windows-live.cjs passed; visual-notes.test.cjs passed explicit acknowledgment/age/no-mutation cases; prepare.test.cjs passed60unique seeds/10perband and pilot/final guard cases. Only new changes this tranche: windows-live.cjs preflight/deferred gesture and this assessment/hash receipt. Prior fast-single changes remain uncommitted as directed. No helpers/commits/PRs or runtime jobs.
