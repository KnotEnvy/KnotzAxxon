# Launch marketing and title: sources, evidence, handoff

Owner: Opus High (title, brand, marketing) on Nitro. Base `2a77036cbc6a64b1b1656c8df8949a5650098dab`.
Raw captures live outside the checkout under
`/home/knotzuni/code/KnotzAxxon/asset-work/public-launch/opus-high-marketing/`.

## Editable sources

| File | What it is |
|---|---|
| `template.html` | One composition: a real-engine frame, a scrim, and live-text title, copy and CTA layers. Layouts: `card`, `cover`, `banner`. |
| `compositions.json` | Every export: size, layout, source frame, placement and copy toggles. Also the capture facts for each source frame and the itch screenshot selection. |
| `frames/*.png` | The two unretouched GPU frames the compositions use. |
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

## Evidence (all hardware: ANGLE NVIDIA GTX 1650 Ti D3D11, Chrome 157.0.8103.52 Windows headless)

- Before/after title: `captures/title-20261115T185647Z/` (before) and `captures/final-r1-20261115T190627Z/final-title-*` (after). Covered: 1280x720 and 1920x1080 desktop, 390x844 and 844x390 touch at DPR 2, gamepad legend (lastDevice staged), reduced motion, Modern and Chase rigs, and five vignettes.
- Layout measures: no horizontal scroll at 390 or 844. Every touch target is at least 44 px. Short landscape has no overflow. Portrait hint is "TAP ENGAGE TO LAUNCH".
- Warning contrast: `base-warn-hull-scrape-*` versus `final-warn-hull-scrape-*`, both pulse phases. These are a staged `hud.warn()` call over Reactor Spine walls.
- Marketing sources: `hero-*-1920x1080-{clean,hud}.png` are staged real-engine frames at seed 7 with sector teleport, hull top-up and fire held. They are not gameplay evidence.

## Limits (stated, not hidden)

- **Dynamic resolution was active.** The hero frames are 1920x1080 CSS pixels, but the 3D drew at 1536x864 to 1824x1026 (render scale 0.8 to 0.95). The compositions are net downscales of those buffers. The 1920x1080 itch screenshots are **browser-upscaled** and must not be called native until recaptured with the render scale pinned to 1.0.
- Exports are not yet rendered: `compose.cjs` needs one short browser slot (static HTML, no WebGL). `index.html` meta still points at the old `og-image.png` until the new files exist.
- No audible audio, physical gamepad, physical phone, or hardware frame-time claim is made by any of this. Frame counts in the logs are capture bookkeeping, not FPS.
- The composition font is the Linux fallback mono (DejaVu Sans Mono) unless the slot runs on Windows Chrome, where the game itself uses Cascadia Mono or Consolas.
- Itch listing images, tags, uploads and the GitHub social preview are account-only actions. Nothing was uploaded or published.
