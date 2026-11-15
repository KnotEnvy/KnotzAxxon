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

## Production Pages package — 20:50 UTC checkpoint

`package-pages.mjs` builds outside `dist/` with `/KnotzAxxon/` as the base;
`verify-pages.cjs` serves that immutable output under its project prefix, compares
all package bytes, then runs the existing production UI smoke in Windows Chrome
through local pipes. The smoke asserts that the development API is absent. This
adapts the existing assertions; no gameplay diagnostic hook is shipped.

At runtime source `f35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790`
(HEAD `62d85e2d1650383accc325dfad7b955d32e75f11`), all **46 package files**
matched HTTP bytes and hashes. All **28 default model/template resources** loaded;
all **35 served model/template hashes** matched the package. Desktop 1280×720,
touch-emulated portrait 390×844 and landscape 844×390 passed title-to-flight,
layout, HUD bounds and applicable pause/resume controls. Shared fortress, Daily
Sortie and settings persistence passed. No page errors or failed requests occurred.

Actual renderer: GTX1650Ti via NVIDIA ANGLE/D3D11, NitroBliss Windows
Chrome157.0.8103.52, DPR1, Low/Classic. Drawing buffers were respectively 912×513,
292×633 and 633×292 because adaptive resolution remained active. Observational
WebGL instrumentation counted **236 / 66 / 72** completed default-framebuffer
presentation draws (**374 total**); each matched the observed engine callback
count. Total successful WebGL draw calls were 14,844 / 3,915 / 4,556. This validates
the production render path and reported device; it is not an FPS measurement,
gameplay episode, physical touch-device test or public-deployment check.

Evidence: `artifacts/launch/pages/f35524e9b88d6938/manifest.json` and
`browser-qa/{report.json,package-receipt.json,desktop.png,
touch-portrait.png,touch-landscape.png}`. Hash index:
`docs/launch/pages-production-checkpoint.sha256`. The verifier exited0, closed its
owned Chrome/server and released its own GPU lease. Nothing was deployed.


## Clock-fix Pages package — 21:16:59 UTC checkpoint

The source ff570c6627faed397553b73c28a06da45fe8f9cd975aec8f612b3a272a991da7
(96 runtime files; committed clock correction9b36398) has a new immutable Pages
package under artifacts/launch/pages/ff570c6627faed39/. All46 package files matched
HTTP bytes/hashes. All28 default resources and35 served model/template hashes matched.
Desktop1280×720, touch-emulated portrait390×844 and landscape844×390 passed
layout/start/pause where applicable; shared fortress, Daily and settings persistence
passed too. No debug API, page errors or failed requests. Renderer/device/browser
remain NVIDIA GTX1650Ti/D3D11, NitroBliss Windows Chrome157.0.8103.52, Low/Classic/DPR1.
Buffers were960×540,292×633,633×292 with adaptive resolution active. Actual presentation
draws were236/67/69, total372; draw calls14,989/4,063/4,373. These counts are production
render-path diagnostics, not gameplay credit, sustained FPS or physical-device claims.
Verifier exit0 and all-file receipt are retained in browser-qa/; the shared GPU lease
was released. Hash index: cleanup-takeover-evidence.sha256. Nothing was deployed.
