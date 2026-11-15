# Nitro hardware QA entry points

All entries below own a localhost-only Linux server, Windows Node/Chrome child and
the common GPU lease. Run only one browser job at a time. No debug listener, firewall
change, Windows Blender installation or dependency reinstall is needed. The configured
browser is installed Chrome through Playwright local child-process pipes; actual
unmasked renderer/browser/device/viewport/quality/frame evidence is recorded.

`node scripts/qa/launch/run-source-qa.cjs NAME` accepts:

| NAME | Existing check, with Windows adapter |
|---|---|
| `audio-lifecycle` | Actual trusted key/touch unlock and same-context resume; visibility only if actually observed |
| `audio-render` |32s OfflineAudioContext mix, critical cue over dense combat, clips/nonfinite/errors, WAV/spectrum |
| `context-recovery` | Actual WebGL loss and three blocked-during-loss/manual-resume routes, stale touch edges cleared |
| `models-default` | Existing complete imported bindings/cues/envelopes/parity/resource ownership and disposal checks |
| `models-legacy` | Existing legacy-model fallback checks |
| `ui-nav` | Actual keyboard navigation/hit visibility, portrait and short viewport, reduced-motion checks |

Windows adapters for context/model/UI checks were executed2026-11-15 at20:13–20:17UTC
on source e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a,
GTX1650Ti/D3D11, NitroBliss Windows Chrome157.0.8103.52. Context loss/recovery passed
all three blocked-during-loss/manual-resume routes with124 full postprocessing frames.
Default model bindings/cues/parity/disposal passed (5 full frames plus1804 direct render
passes); legacy-model fallback passed; keyboard/portrait/short-screen/reduced-motion
navigation passed. Source-before/after receipts all match. These are diagnostics,
not gameplay episodes or physical-device evidence. The initial default-model attempt
failed on an unresolved bare `three` specifier from a direct addon URL. A QA-only
module now lets Vite resolve the installed game dependency graph, preserving every
assertion; the original failed receipt is retained alongside the passing rerun.

Evidence is under artifacts/launch/functional/{context-recovery-2026-11-15T20-13-08-167Z,
models-default-2026-11-15T20-15-18-049Z,models-legacy-2026-11-15T20-16-18-753Z,
ui-nav-2026-11-15T20-17-03-495Z}/. The prior audio runs are described in audio/INTEGRATION.md.

Source diagnostics run the fingerprinted Vite development graph; production bundles
are separately verified by `verify-itch.cjs <package-dir>` and the Pages release smoke.
Source before/after receipts reject changes. The source diagnostic render probe counts
full postprocessing frames and direct Three.js render passes separately; model fixtures
may stop the game and draw staged geometry directly. These are not gameplay episodes.

Physical phones/controllers, audible perception, OS call interruption and sustained
device performance cannot be inferred from synthetic input, emulated viewports or
headless/offline measurements. Accelerated bot credit and realtime live-agent trials
have separate records and requirements. Software adapters receive no hardware credit.

On final freeze, run appropriate checks serially, record exact source/build/harness
identities, retain logs/JSON/media under artifacts/launch/, and update the proof packet
with the actual outcomes and remaining limits. Avoid rerunning already-passed checks
unless candidate changes or unresolved concerns justify it.
