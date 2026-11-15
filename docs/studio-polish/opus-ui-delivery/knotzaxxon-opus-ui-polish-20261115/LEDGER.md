# Opus UI — non-spatial UI/HUD polish ledger

Owner: NitroBliss Opus5.5 HIGH (studio-opus-ui). Scope: `src/ui/HUD.js`, `src/ui/Screens.js`,
`src/style.css`, `index.html`, plus new `tests/opus-ui-*`, `tests/fixtures/opus-ui-*`, `scripts/qa/opus-ui-*`.

## Input
- Archive `knotzaxxon-reactor-nitro-visual-input-20261115.tar.gz` (23412702 B), SHA256
  `3f61c8b7e3fe1f384ae404129530d042bf02ea5f961a7c50f0ac7181913e0780`. It matches the sidecar, has no links and no absolute or `..` paths.
- All 326 `NITRO-INPUT-SHA256.json` entries verified. There were no extra files.
- Extracted to `asset-work/studio-opus-ui/workspace/` (not a git repo). The owned-file "before" hashes are in `owned-before.sha256`.
- Baseline `npm test`: 205/205.
- node_modules: reused `studio-opus-code/tools/node_modules` read-only (three 0.185.1, vite 7.3.6,
  playwright 1.64.0, which are the exact lock versions). Root `node_modules/vite` is a dangling link (see findings).

## Done (reproduced → fixed → regression)
| # | Defect (repro) | Fix | Regression |
|---|---|---|---|
| 1 | At 1280x720 desktop the altimeter box overlaps (measured 76x11 px; 1366x768, 1280x800 and 1920x1080 measured clear on base) the bottom-right radar/weapon block and its status label is hidden under it (before `desk-hud.png`) | `HUD.fitAltimeter()` + a ResizeObserver on the HUD and corner blocks (resize only, no per-frame layout reads) centre the altimeter in the free band and shrink only the track | `opus-ui-feedback` altimeter tests; browser `hudOverlap` metric |
| 2 | Results: sector numbers on grade chips are 8 px and render *below* the chips, colliding with the next row (`desk-victory.png`) | In-flow 10 px number above each chip; per-chip `role=listitem` + aria-label instead of `title` | chips markup test; `tiny` metric |
| 3 | Results/SYSTEMS/manual actions are below the fold on 1280x720 (victory), touch landscape and short desktop. RE-ENGAGE / MAIN MENU / RETURN are invisible until you scroll | Sticky panel action bar with scroll-padding so the focused callsign is never hidden; tighter result rows at ≤820 px height | browser capture (landscape/short/desk) |
| 4 | Touch menu targets are 27 px tall (audit `items`) | `.touch-device .mi` and settings steppers ≥44 px | browser `items` metric |
| 5 | Portrait: the sector card overlaps the score/chain block. Cause: a later unconditional `#screen-sector{padding-top}` overrides the earlier narrow-screen 150 px rule | Restated late in the cascade with the safe-area inset | portrait capture |
| 6 | A warning raised with a sector card prints over the card text (measured 265x32 px at 1280x720). This happens every time in `_nextLoop()` (`LOOP n - THREAT ESCALATED` + card), and also with hull scrapes during a card | Card measures its bottom once; `:root.sector-card-on .warn` docks beneath it; released on timeout, `show`, `hide` and `dispose` | dock/release test |
| 7 | Warning hierarchy: every label is a pulsing red alarm, including good news (`CORE EXPOSED`, `ENEMY TRACKING BLINDED`, `RACK n/6`) | `warnTone()`: alerts stay red and pulsing; notices (`SENTINEL ENGAGED`, `MISSILE CHARGING`, `LOOP n`) are steady amber; gains are steady green. Text, duration, expiry and audio are unchanged | tone table covering every current label |
| 8 | The title prompt says `ENTER / CLICK TO ENGAGE` on touch and gamepad | `engageHint()`/`setInputDevice()` change only the text, and only when the device changes; the shared-fortress code is preserved | device prompt tests (no per-frame writes) |
| 9 | SYSTEMS gives no feedback that a change persisted, and is silent when storage is blocked | Polite status line: `<SETTING> <VALUE> · SAVED ON THIS DEVICE` or a session-only notice | status tests incl. blocked storage and hidden-panel changes |
| 10 | Touch FIRE/BST/ROLL buttons have no accessible names (`BST`) | aria-labels; ids unchanged for Input | — |
| 11 | Short desktop window (1280x440): altimeter and radar block overlap by 66x85 px, too little height for both | When `fitAltimeter` reports no fit and the radar shares the edge, `.hud.alt-crowded` steps the weapons block left of the altimeter column | "too short" fit test; `short` capture |
| 12 | Phones: a warning prints over the sector grade banner (140x26 px portrait) | Banner measures its bottom once; `.hud.grade-on .warn` docks below; released on expiry, dismissal and reset | grade docking test |
| 13 | First fix pass: the SYSTEMS confirmation sat under the sticky RETURN bar, and content scrolled visibly beneath the bar (Chromium pins sticky boxes at the content edge) | The status line moved into the action bar, and the bar runs through the panel's bottom padding | `after2-desk/desk-settings-changed.png` |
| 14 | Callsign field, setting rows and chip numbers were under touch/legibility minimums | 44 px touch minimum; 11 px chip numbers; keyboard help now says "Enter to finish" | audit `items` / `tiny` metrics |
| 15 | Phone title subtitle renders at 10 px (`clamp(10px,…)`) | Floor raised to 12 px; fits 390 px without horizontal scroll | `opus-ui-nav` portrait-title check |

## Verification
- `npm test`: 216/216 (205 input + 11 new `opus-ui-*`). All new tests fail on base UI files (checked on a scratch copy).
- `npm run build:pages`: OK.
- Browser: `scripts/qa/opus-ui-audit.cjs` before/after via `studio-browser-tools/bin/kz-pw`, under the shared lock (owner `opus-ui`).
  - Before: `proof/final/before-desk` (1280x720, 1366x768, 1280x800, 1920x1080) and `before-touch` (390x844 touch, 844x390 touch, 1280x440).
    After: `after2-desk`, `after2-touch`. (`after-desk`/`after-touch` are intermediate runs kept for the record, and the first exposed the hidden settings status.)
  - After metrics: 0 page errors; 0 HUD instrument overlaps on every desktop size incl. 1280x440 (base: 76x11 at 720p, 66x85 at 440p);
    0 touch targets under 44 px on touch views (base: 4 on title, 3-4 on menus); 0 text under 11 px apart from the phone title subtitle, which was fixed after the
    captures and verified by `opus-ui-nav`. The remaining card-vs-corner "overlaps" are the card's transparent gradient edges (identical on base in landscape) and text is clear.
- `scripts/qa/opus-ui-nav.cjs` (exit 0): real-key results walk (CONTINUE → callsign → Enter → CONTINUE → RE-ENGAGE → MAIN MENU) is fully
  visible and unobstructed at 1280x440 and at 1280x720 with reduced motion; title → ↓↓↓ Enter opens SYSTEMS, RETURN is visible without scrolling,
  the change is confirmed, and Escape restores focus to SYSTEMS; with reduced motion, result rows are opaque and the alert holds steady with no infinite pulse; the phone prompt
  reads `TAP ENGAGE TO LAUNCH`.
- Devlog: `devlog/01..05-*.png`, labelled before/after composites of the frames above. The full proof is archived and hashed before curation.

## Cross-path findings for root (not edited)
- **Game.js `warn()` (≈line 1103)**: the shared 1.2 s `_warnCooldown` drops *every* label raised within 1.2 s of the
  previous one. That includes the action prompt `MISSILE LOCK - ROLL` (Boss.js ≈620) when `BARRAGE`, `MISSILES INBOUND`, `CORE EXPOSED` or a
  hull scrape fired just before, and the alarm audio is dropped with it. Recipe: let critical prompts bypass the gate, e.g.
  `const critical = /^MISSILE LOCK|^HULL BREACH/.test(label); if (this._warnCooldown > 0 && !critical) return;`
  and add a rate test: warn('BARRAGE') then warn('MISSILE LOCK - ROLL') 0.3 s later → the HUD shows the lock prompt.
  Status: a deterministic code-path finding, not reproduced in a live run.
- **Root `node_modules/vite`** → `/tmp/nitrobliss-studio-code-tools/...` is dangling after the reboot, and so is
  `asset-work/studio-completion-fable/workspace/node_modules` (it links to root). Recipe: relink to a vite 7.3.6 install
  (e.g. `studio-opus-code/tools/node_modules/vite`) or run `npm ci` at root.
- **Settings.js `save()`** swallows storage failure. The UI probes storage writability itself. Optional recipe: return a
  boolean / expose `settings.persistent`, which Screens could prefer.

## Limits / honesty
- All browser frames are headless Chromium with SwiftShader (software). They are layout and legibility evidence only, with no FPS claims.
- Human play acceptance is user-reported; this pass does not re-claim it.
- Controls, cadence, RNG, cameras, colliders and balance are untouched. All changes are text, presentation and layout. Game.js, main.js and core are not edited.
- From 10:59 to 11:13 my capture runner polled the lock every 30 s while fable-spatial held it. Once I noticed, I stopped it and made the runner single-attempt.
  It never touched or removed another owner's lock.
- Tooling: before root's wrapper message I had installed a user-local chromium-headless-shell and extracted
  jammy .debs under `studio-opus-ui/tools/` (no root, nothing system-wide). The first desk baseline run overlapped
  opus-code's lock for about 1 minute because my acquire step was not gated; every later run is gated. The final before/after set uses the official
  `studio-browser-tools/bin/kz-pw` wrapper.
