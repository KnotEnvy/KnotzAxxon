# UI error-path ownership delivery

Opus High implemented this tranche against `1cdcc68e63696f308f2521ba9dc3b0434bb76590` on 2026-11-15. Primary verified the delivered source/test hashes and independently ran all five actual-source UI ownership tests. Together with Fable’s nine world tests, the focused run passed **14/14**. This is CPU fault injection, not browser/device evidence.

`Screens` now rolls back its listeners if construction fails after binding, preserving the construction error. Its disposal attempts every animation, listener lifetime and sector-card cleanup. `HUD` attempts its timers, pending damage frame, observer, reset and live-state cleanup even if one fails. Existing layout and normal behavior are preserved.

Four fault cases fail against the original UI files; the normal-path case passes. All five pass after the change. The worker’s combined checkout result was 291/294 before the primary reset fix, with three failing tests isolated to `game-reset-ownership.test.js`; that result is historical, not a whole-candidate pass.

Source hashes:

- `src/ui/Screens.js`: `f0bb0496a20a1a0ffaf74e563de87f8bb77edc7b4fe98674cfadcd14d240cd13`
- `src/ui/HUD.js`: `3a8f51f35f239f55bba142ebd8062e8065807261af42c45ee6e3d8dbdef32510`
- `tests/ui-ownership-faults.test.js`: `270521fbbd8eaf5235313f0c04569d9c0e698602a9eddf9615d3f262cd092032`

Original patch, before/after hashes, failure-before log and receipt are retained under `artifacts/launch/integration/ownership-20261115/`, indexed by `docs/launch/ownership-integration.sha256`. The Settings persistence seam remains a separate Opus patch, requiring the incoming SettingsStore API.
