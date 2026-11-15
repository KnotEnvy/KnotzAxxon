# Studio feel — Opus Medium (fast) test pass ledger

Run: 2026-11-15, 03:29–~03:45 EST. Shared SuperBeast worktree. No git stage, commit or push. No installs. No Blender. No RELIC.
All new output is in `asset-work/studio-feel-opus-medium/`. I did not touch `asset-work/environment-scenes-fable`.

## Takeover / concurrency
- My START (`start/`, `start-hashes.txt`, captured 03:29:5x) differs from the cancelled Opus XHigh START (03:19) **only in `src/core/Engine.js`**.
  That run edited Engine at 03:27:05, after its START and before it was cancelled (`prior-opus-engine-edit.patch`).
- Engine mtime stayed at 03:27:05 for my whole run, so no writes continued. No conflict.
- Input.js, studio-feel.test.js and fixtures/studio-feel.mjs were identical to the Opus START (Sonnet's last write was 03:15).

## Owned-source review (Sonnet edits + cancelled-Opus edit)
Every item was verified independently with the real Engine/Input code (Node CPU harness) and, where marked, in a real page.

| Change | Origin | Verdict | Evidence |
|---|---|---|---|
| `Input._suspended` / `setSuspended()`: gates pad edges, `update()`, `_padDown` while hidden or lost; `_suppressPadEdges` learns held buttons on the first active poll | Sonnet | **RETAINED** | repro-context-pause 5/5; tests: loss / hidden / orderings / manual release-repress |
| `_pollGamepad` exposes no `_padDown` while inactive (blurred D-pad menu repeat) | Sonnet | **RETAINED**. Complements root's `_suppressPadEdges` blur fix | repro-blur-dpad-repeat: 0 cycles |
| `dispatchVisibility` → `setSuspended(!visible)` | Sonnet | **RETAINED** | hidden-document tests |
| `_onContextRestored`: unsuspends input only when `!document.hidden` | Sonnet | **RETAINED** | new test 3. A mutant that drops the guard fails |
| Restore split: renderer state (`shadowMap`, `_onResize`) first. If that throws, **no loop starts**, the resume stays pending and the error rethrows. If the Sky bake fails, the loop resumes and the original error still propagates | cancelled Opus (corrects Sonnet's single try/finally, which always started the loop) | **RETAINED**. This meets "not unconditional, not hiding errors". Sky `_bake` restores renderer state on failure and keeps the previous env bound. That env's contents are lost, so a degraded backdrop is possible, but no frozen page | existing bake-failure test + new test 1 |
| `_onContextLost`: `resume = running \|\| _resumeAfterRestore` | cancelled Opus | **RETAINED**. Also fixes a **root bug**: two `webglcontextlost` events before one restore left root START frozen (`running:false, raf:0`). End state: `running:true, raf:1` | new test 2; root-vs-end probe |
| Rejected / corrected | — | none. No owned source edits were needed in this pass | — |

## New tests (tests/studio-feel.test.js, +3, appended after the lifecycle block)
1. A restore whose renderer resize fails starts no loop and surfaces the error. A later healthy restore resumes exactly one rAF, and a redundant `start()` adds none. `stop()` cancels a pending resume.
2. `start()` and repeated losses during a loss give exactly one loop at restore. Dispose during a loss stays inert: no rAF, no throw, no press.
3. A restore while the document is hidden keeps pad edges gated, and the first visible poll learns held START. Release + press is required.

Mutation check (scratch copies; the working tree was untouched): the Sonnet-START Engine fails tests 1, 2 and 3. Dropping `_resumeAfterRestore=false` in `stop()` fails test 1. An unconditional unsuspend on restore fails test 3.

## Results (exact)
- START: `npm test` **199/199 pass** (`logs/start-npm-test.log`). Sonnet repros: context-pause 5/5 ok, restore-throws loop restarted, blur-dpad 0.
- END: `npm test` **202/202 pass** (`logs/end-npm-test.log`). `vite build` ok, written to the scratchpad and not `dist/` (`logs/end-build.log`).
- The earlier "164" baseline was before Sonnet's suite. 199 = 164 + 35 Sonnet cases, all passing. I did not inflate or rewrite Sonnet coverage.

## Real-page check (Playwright fallback; T3 `preview_status` returned `available:false`)
One headless Chromium with SwiftShader software GL at 800x450, Vite dev server on port 4189. Both closed afterwards (`curl` → 000). GPU at 0% and the editor_slots dir empty at check time.
`WEBGL_lose_context` while PLAYING with focus kept: state=paused, loop stopped, input suspended. On restore: paused, loop running, frames advancing. Escape → playing. No page errors. Log: `logs/ui-context-loss.log`.
PNGs in `ui/` (viewed): 01-playing, 02-context-lost (pause menu), 03-restored-paused, 04-manual-resume. SwiftShader output only; this says nothing about FPS or visual quality.

## Ledger
| Area | Status |
|---|---|
| Pad pause/confirm/fire during loss, hidden or blurred; held-button learning; manual release + repress; stop / dispose; exactly one rAF | **PASS** (Sonnet tests + 3 new) |
| Bake failure / renderer-restore failure | **PASS** (new test 1) |
| Double context-loss event froze the page (root START) | **FIXED** by retained cancelled-Opus edit, now covered |
| Keyboard **Escape / P during a context loss with the window focused** resumes the game. When the context comes back, gameplay is live with no post-restore press. Confirmed in a real page (`Escape during loss` → `playing`) and CPU probe B | **FINDING for root. Not fixed here**: it needs `main.js` and `Screens.js`, which I don't own. Gating only Input is not enough because the Screens keydown `cancel` also resumes. Precise fix: in `main.js`, the `case 'resume'` and the press-handler `pause` branch skip `game.resume()` while `engine._contextLost`. Optionally, Input keydown/pointer/tb-pause skip edges while `_suspended`. This is a policy decision (a deliberate keypress vs. the "always needs one post-interrupt press" rule), so it is a proposal, not an auto-fix. Repro: `probes/probe-lifecycle-gaps.mjs` B, `probes/ui-context-loss.mjs` last step |
| A touch fire/roll tap during a loss can surface as one stale `justPressed` on the first restored frame (`setSuspended(false)` does not clear `pressed` / `_touchRollQueued`) | **LOW / unconfirmed impact**: gameplay is PAUSED by then. Possible hygiene: clear `pressed` and `_touchRollQueued` on the suspended→active transition. Not applied |
| Cameras ×3, assist off, normal/boost, altitude/shot/occlusion, first-shot cues, walls/gates/barriers/projectiles, boss pods/core/rack, combo/damage/armour, heat, roll, results/retry/Loop 2, 30/60/120/144 Hz | **ALREADY COVERED** by Sonnet's 27 matrix cases (all pass). Not duplicated |
| Touch-menu / settings UI flows in a real browser | **NOT RE-RUN** (bounded scope). User-reported cross-device play is accepted as reported |
| Environment scenes (Fable) not integrated | **RERUN after Fable**: the wall/gate/barrier collider matrix, the cover/occlusion targeting test, the classic-view engagement envelope, the first-shot cue test, and the real-page check |
| Subjective tuning | none proposed. No HP, fuel, scoring, RNG, cadence, camera, collider or control changes |

## Manifest
- `start/` + `start-hashes.txt`, and `end/` + `end-hashes.txt`. Only `tests/studio-feel.test.js` changed (3af5e8cd… → 49939a3e…).
- `start-relative.patch`: my only change, applied on top of my START.
- Full-replacement fallback: copy `end/tests/studio-feel.test.js` over the working tree. The `end/src/core/*` files equal START byte for byte (no-op).
- `prior-opus-engine-edit.patch` (Opus START → END Engine) and `sonnet-start-to-end-owned-src.patch` (Sonnet START → END Input+Engine) are for root review.

## Regenerate
```
npm test
node asset-work/studio-feel-opus-medium/probes/probe-lifecycle-gaps.mjs
npx vite --port 4189 --strictPort --host 127.0.0.1 &   # then:
node asset-work/studio-feel-opus-medium/probes/ui-context-loss.mjs ; kill the dev server
```
Limits: simulated cadence and SwiftShader frames are not physical input latency, device FPS, or a judgement of fun.
