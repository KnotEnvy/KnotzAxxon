# studio-opus-code LEDGER (NitroBliss Opus 5.5 HIGH, non-spatial code worker), 2026-11-15

## Input
- Archive: `C:\Users\jwsny\Downloads\knotzaxxon-reactor-nitro-visual-input-20261115.tar.gz`, 23412702 bytes,
  SHA256 `3f61c8b7e3fe1f384ae404129530d042bf02ea5f961a7c50f0ac7181913e0780`. This matches the sidecar.
- All 326 `NITRO-INPUT-SHA256.json` entries were verified: 0 missing, 0 mismatched, 0 extra (`evidence/input-manifest-verify.json`).
- Before extracting, I listed the archive and checked it: no absolute paths, no `..`, no links. It was extracted into
  `workspace/` (my fixture, not the git repo).
- Toolchain: root `node_modules` had a dead vite symlink (into /tmp, cleared by the reboot). The matching
  `D:\...\KnotzAxxon\node_modules` holds win32 binaries only. I ran `npm ci --ignore-scripts` from the input lockfile into
  `tools/`, which gave the exact lock versions: vite 7.3.6, playwright 1.64.0, three 0.185.1, esbuild linux-x64, and rollup linux-x64-gnu.
  No browsers were downloaded.
- Baseline: `npm test` gave 205/205 (`evidence/baseline-tests.log`). Before-hashes are in `evidence/owned-before-sha256.txt`.

## Done (verified)
Defects were reproduced against the unmodified base first. 10 of the 13 new cases failed (`evidence/repro-audio-before.log`).
After the fix all 13 pass (`evidence/repro-audio-after.log`).

1. **Audio unlock was one-shot** (`src/main.js`). `pointerdown` and `keydown` were registered with `{once:true}`. A touch
   `pointerdown` and an Escape `keydown` are not activation-triggering events. So on phones and tablets (and for Escape-first
   desktop users), the first event created a suspended context and then removed the only unlock listener. The title music stayed
   silent until START. Fix: unlock listeners on `keydown`, `pointerdown`, `pointerup`, `touchend` and `click` (capture, passive)
   that live for the whole entry. `init()` returns at once while audio is running.
2. **No recovery after an OS interruption** (`Audio.init`). `init()` resumed only when the state was `'suspended'`, and nothing
   called it after the first gesture. WebKit's `'interrupted'` state (phone call, app switch), or a system suspend in the middle
   of a run, meant silence for the rest of the run, even after a tap on pause/resume. Fix: `_resume()` handles any state that is
   not running and not closed. It is reached by the persistent unlock on the next gesture.
3. **Audio kept playing in a hidden tab.** The game auto-pauses on hide, but the muffled music and engine beds kept running.
   Fix: `Audio` now owns a `visibilitychange` listener (it lives with Audio's Lifetime, and dispose detaches it). Hiding suspends
   a running context. Showing the page resumes only a context that this listener suspended, so a context the player never unlocked
   is never forced. Offline renders (`scripts/qa/audio-render.cjs`) are unaffected.
4. **A failed init stranded state** (`Audio.init`). A throwing constructor gave an unhandled rejection on every START. A throwing
   graph build (after the context existed) left `ctx` set and `ready` false, so audio was permanently dead and the context was never
   closed. Fix: the build is wrapped in a try. On failure it releases any partial graph, disposes the Lifetime, closes the context,
   reports the original error once through `console.warn`, and sets `enabled=false`, so the device is not retried on every gesture.
   `dispose()` resets this for a fresh entry. `dispose()` also no longer calls `close()` on an offline context (OfflineAudioContext has no `close`).

- Regression: `tests/opus-code-audio-lifecycle.test.js` plus `tests/fixtures/opus-code-audio-lifecycle.mjs`, 13 cases. They run the
  real `src/main.js` (VM-linked like `context-resume.mjs`) and the real `Audio` module. The AudioContext is modelled with Chromium
  (sticky) and WebKit (transient) activation policies.
- Full suite: **218/218** (205 existing + 13 new, `evidence/tests-after.log`). `npm run build:pages` passes (`evidence/build-pages.log`).
- The patch applies cleanly to the input base (hash-checked), and `patch --dry-run` applies cleanly on the dirty Nitro root.

## Audited, no defect found (no change made)
- Engine context loss/restore, blur/focus/visibility, adaptive resolution, and dispose ordering are covered by existing SolHigh tests.
- Input pad-edge suppression, touch reset, and keyboard ignoring focused controls: Screens.hide blurs the focus, which I checked.
- Settings normalization and blocked storage; Scores dedupe by run date.
- Game state machine: start/pause/resume/death/finish/continueLoop music and engine-drone transitions, and `_nextLoop` restarting music through `_enterSector`.
- Unchanged and byte-identical to the input: Engine.js, Input.js, Lifetime.js, Settings.js, Game.js.

## Limits (honest)
- **No browser verification.** The T3 shared preview cannot start on this host because system libraries are missing (libnss3, libgbm, etc.).
  Installing them needs sudo, which I did not attempt. I also tried a fallback with headless Windows Edge. It was stopped because it
  needed a debug port reachable beyond localhost, which was correctly denied. My Edge processes and profile are cleaned up. The shared lock
  `asset-work/studio-resource/gpu-browser.lock` was taken and released. My vite preview server (port 5397) was stopped.
  Nothing else was touched (Fable's Blender, and another worker's vite on 5291, were left alone).
- **Audio automation vs human listening.** All evidence is AudioContext state and lifecycle assertions. No audio was rendered or listened to.
  A human should confirm on a phone: tap the title, music starts; switch apps mid-run, come back, tap resume, sound returns; switch tabs, silence.
- Gamepad-only players still cannot unlock audio: browsers do not treat gamepad input as user activation. This is a platform limit.
- No visual changes, so there are no PNGs to inspect. No FPS claims.

## Remaining / handoff
- Root: apply `delivery/opus-code.patch` (or copy `delivery/files/`). Rerun `npm test` (expect 218) and `npm run build:pages`.
  Then do one real-device listening pass (above).
- Root's working-tree `src/main.js` is older than the input base (it lacks the context-resume gating). Integrate on top of the input base.
