# Launch marketing and title: sources, evidence, handoff

Owner: Opus High (title, brand, marketing) on Nitro. Base `2a77036cbc6a64b1b1656c8df8949a5650098dab`.
Raw captures live outside the checkout under
`/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/opus-high-marketing/`.

## Editable sources

| File | What it is |
|---|---|
| `template.html` | One composition: a real-engine frame, a scrim, and live-text title, copy and CTA layers. Layouts: `card`, `cover`, `banner`. |
| `compositions.json` | Every export: size, layout, source frame, placement and copy toggles. Also the capture facts for each source frame and the itch screenshot selection. |
| `frames/*.png` | The two unretouched native GPU frames the compositions use (Interceptor Screen / Chase, Iron Sentinel / Classic). |
| `screenshots/0[1-5]-*.png` | The five curated native itch screenshots (1:1 copies of the capture PNGs). |
| `exports/itch-banner-1200x260.png` | Transparent (RGBA) itch banner. The other exports live in `public/brand/`. |
| `export-manifest.json` | Every export, screenshot, source frame and retained legacy file: dimensions, format, bytes, sha256, drawing buffer, scaling, renderer, staging, plus the font resolution and screen-RGB print limit. |
| `ITCH-LISTING.md` | Ready-to-apply itch copy, tags, alt text, upload mapping and the account-only checklist. |
| `../../scripts/brand/launch/with-gpu-lease.cjs` | Runs any one browser job under its own cooperative-reservation token and releases it on exit or signal. |
| `../../scripts/brand/launch/compose.cjs` | Renders the exports and writes `export-manifest.json` (dimensions, bytes, sha256, source frame, renderer, scaling). |
| `../../scripts/brand/launch/capture.cjs` + `capture-frames.cjs` | WSL launcher and Windows Node/Chrome driver for real-GPU captures over Playwright's local pipe (no debugging port). Shots record the unmasked renderer, browser, viewport, DPR, drawing buffer, render scale, settings, engine frame and state. The launcher verifies a held lease token or acquires and releases its own. |

## Title redesign: what changed

- One amber **ENGAGE** call to action ("FLY NOW · IN YOUR BROWSER"). **DAILY SORTIE** is an outlined secondary button showing today's UTC seed date. Manual, Systems and Records form a quiet third row.
- A feature row (8 sectors / Sentinel boss / 3 camera rigs / harder loops) and a **LIVE IN ENGINE** badge naming the sector the background is flying.
- The live attract now **rotates six real sector vignettes**: Outer Fortress, Gun Batteries, Reactor Spine, Void Gap, Inner Citadel and Gauntlet, 14 s each. A 0.32 s blackout hides each cut. Only the world streams: no enemies, shots, score, HUD card, music change or cue. Per-chunk RNG is index-seeded, and `start()` resets, so seeded fortresses are unchanged (tested).
- The camera keeps the **ship in the open playfield**: right of the copy on wide screens, above it on narrow ones, for Classic, Modern and Chase. The aim offset is solved from the measured camera response, so it holds for each rig's framing rules. Classic, which anchors to the corridor, also uses an off-centre lane and altitude that stay inside the corridor and ALT_MAX. It re-solves on resize or rig change.
- A device-matched control legend (keyboard / gamepad / touch).
- For pad-only players, a status line reads "SOUND: PRESS ANY KEY, CLICK OR TAP ONCE". Browsers do not treat controller buttons as a user activation, so this is the only honest path. It shows only while the audio context is not running, and never when audio is unavailable.
- Left/right also walk the title buttons, for the horizontal rows on a gamepad.
- Hidden screens pause every CSS animation (`animation-play-state`). The old glitch and blink loops used to run behind gameplay at opacity 0.
- Reduced motion turns off the glitch, sheen, blink and live-dot pulse. Vignette cuts become a plain hold.
- The scattered title overrides in `style.css` are consolidated into one "Title / attract" section.
- **HUD warnings** (Sol Low's faint HULL SCRAPE): a near-solid plate with tone-coloured rules, a dark glyph outline, a brighter alert red, and a step pulse floored at 60% instead of 15%. Text, tones, durations and priorities are unchanged.

## Evidence (hardware: ANGLE NVIDIA GTX 1650 Ti D3D11, Chrome 157.0.8103.52 Windows headless)

Raw captures, all external, under `/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/opus-high-marketing/`
(index: `INDEX.json` there):

- **Native screenshots and source frames**: `captures/native-cdbdf6a-20261115T194659Z/`. Source was a `git archive` of
  HEAD `cdbdf6a` (runtime source hash `233e6bab…`, all 93 files verified equal to the worktree). It covers all eight sectors in
  clean and HUD versions across the Classic, Modern and Chase rigs: 16 shots. Every shot passed a 1920x1080 drawing-buffer
  check at render scale 1.0 and DPR 1, and records engine frame numbers, the PNG sha256 and pixel statistics measured from the
  saved PNG. Adaptive resolution was held at 1.0 **only in the capture page** (instance `_adaptResolution` no-op, logged in
  `capture.jsonl` as `instrumentation`). Lease receipt: `lease.jsonl` (acquired 19:46:59Z, released 19:48:19Z, owner PID 166063).
- **Composition evidence**: `compose/final-*/` holds the 315x250 cover, 600x315 OG and 640x320 GitHub previews of the
  exports themselves, plus the lease receipt. Earlier rounds `r1` to `r4` show the fixed defects: an overflowing card, a
  placement reset, and a banner that was not transparent.
- **Before/after title**: `captures/title-20261115T185647Z/` (before) and `captures/final-r1-20261115T190627Z/final-title-*` (after).
  Covered: 1280x720 and 1920x1080, 390x844 and 844x390 touch at DPR 2, gamepad legend (lastDevice staged), reduced motion,
  Modern and Chase rigs, and five vignettes.
- **Warning contrast**: `captures/final-r1-*/base-warn-*` versus `final-warn-*`, both pulse phases (staged `hud.warn()`).

## Legacy link art (superseded, kept on purpose)

- `public/og-image.png` (1200x630) and `public/social-preview.png` (1280x640) are the pre-launch cards. They show an empty
  pre-environment deck with no ship or action. `index.html` no longer references them. They stay deployed so links that
  social sites have already cached keep resolving. Do not regenerate them for launch.
- `scripts/brand/render-link-art.cjs` generated those legacy cards and the app icons from one title frame, with the
  dynamic resolution left on. It is superseded for link art by `scripts/brand/launch/compose.cjs` (sources here, receipts
  in `export-manifest.json`). It is not deleted, because it still documents how `apple-touch-icon.png` and `icon-512.png`
  were made. Re-running it would overwrite the retained legacy cards.
- The current link art lives in `public/brand/`, and the itch-only banner in `exports/`.

## Limits (stated, not hidden)

- Every gameplay frame is **staged** (seed 7, sector teleport, hull/fuel top-up, fire held), so HUD scores are low. The frames
  show the game's real look. They are not gameplay, difficulty or progression evidence.
- Native means a 1920x1080 drawing buffer on this GPU. No 4K or high-DPI master exists, and nothing is upscaled.
  Compositions are net downscales (frame placement scale 0.59 to 0.62 of a 1920x1080 buffer).
- Type renders in DejaVu Sans Mono, because the Linux composer's private fontconfig has only DejaVu and Liberation. The
  in-game title uses the platform mono stack.
- Screen RGB only. No CMYK, bleed or print profile is claimed.
- No audible audio, physical gamepad, physical phone, or hardware frame-time claim. Engine frame numbers are capture bookkeeping.
- Listing images, tags, uploads, the theme and the GitHub social preview are account-only. Nothing was uploaded or published.
