# itch.io listing: ready-to-apply source

Prepared from the public listing as it stood on 2026-11-15. Sources: a raw HTTP capture at 18:47 UTC
(`docs/launch/marketing-listing.json`) and primary's browser inspection at 19:40 UTC
(`artifacts/launch/public-inspection/2026-11-15T19-40-49-304Z/`). **Nothing here has been applied.** Every
step below needs the account owner in the itch dashboard. No dashboard was opened, and nothing was uploaded,
published, retagged or deleted.

## What is live now (observed, not assumed)

- URL: https://hacktivatenation.itch.io/knotzaxxon. Title: "KNOTZAXXON: Assault on the Iron Fortress". Author: Hacktivate Nation Studios.
- Classified as "A downloadable game" with **no public upload and no iframe**. Play is an external link to
  https://knotenvy.github.io/KnotzAxxon/.
- Cover and header banner are the same 1200x630 image as the Pages `og-image.png`. itch's 315x250 centre crop cuts
  the wordmark to "NOTZAXXON".
- **Zero screenshots** (data.json `screenshots: []`). The sidebar repeats the cover.
- Genre Shooter. One public tag (`shooter`). AI disclosure: "AI Assisted, Code". Status Released. Free.
- Two devlog posts (keep them): "We rebuilt 21 models without moving the hitboxes" and "What a Blender bake-off
  taught us about arcade silhouettes".

## Official constraints used (quoted in `docs/launch/marketing-listing.json`)

Cover 315:250, best at 630x500. Screenshots any size, 3 to 5 recommended. Genre plus **up to 10 tags**. Banner:
no published size; it replaces the page title. HTML5 ZIP: index.html at the root, at most 1,000 files, 500 MB
extracted, 200 MB per file, and 240-character paths.

## Upload mapping

| itch field | File (repo path) | Size | Notes |
|---|---|---|---|
| Cover image | `public/brand/itch-cover-630x500.png` | 630x500 PNG | 315:250. The wordmark and the ship stay whole at the 315x250 thumbnail (preview: `asset-work/public-launch/opus-high-marketing/compose/final-*/itch-cover-preview-315x250.png`) |
| Screenshots (in order) | `assets-source/launch-marketing/screenshots/0[1-5]-*.png` | 1920x1080 PNG each, 2.2–2.8 MB | Native: drawing buffer 1920x1080 with the render scale pinned in the capture page only |
| Banner (Edit theme → Banner) | `assets-source/launch-marketing/exports/itch-banner-1200x260.png` | 1200x260 transparent PNG | Optional. The size is a design choice; check the page column in the theme editor |
| Theme colours (optional) | bg `#04070c`, text `#d8f0ff`, link/button `#ffb43a` | — | Match the in-game palette; the current page uses `#0b101a` / `#62d5ed` |
| HTML5 upload (optional, primary's P2) | `artifacts/launch/distribution/<candidate-hash-16>/` ZIP | per its receipt | Only if the owner chooses to embed. See the checklist below |

Keep the current cover and banner originals as rollback (raw copies, hashed, are in the listing audit raw dir).

## Short description / tagline (itch "Short description")

> A 3D isometric rail shooter. Match altitude, read your shadow, break the Iron Fortress. Free in your browser.

## Page body (replace the description; Markdown-friendly)

```
ASSAULT ON THE IRON FORTRESS

One interceptor. Eight hostile sectors. One Iron Sentinel.
Match altitude. Read your shadow. Break the fortress.

KNOTZAXXON is an arcade rail shooter in 3D isometric space. Your guns fire level, so you hunt
targets by lane and by height. Your shadow on the deck tells you where you really are. Thread
wall gaps, chain kills for up to x8, refuel by shooting fuel cells, and take down the Iron Sentinel.

▶ PLAY NOW — free, in your browser (WebGL 2), no download: https://knotenvy.github.io/KnotzAxxon/

INTO THE FORTRESS
• 8 sectors: fortress decks, gun batteries, open-space crossings, a reactor trench, the inner
  citadel, the Gauntlet, and the Iron Sentinel boss.
• 3 camera rigs: Classic 45° isometric, Modern 20° and Chase.
• Daily Sortie: one seeded fortress per UTC day, the same for every pilot. Share a fortress code to
  replay any run.
• Beat the Sentinel to continue into harder loops.
• Sector grades, style bonuses (thread gaps, dive under arches, graze fire) and local records.
• Keyboard, gamepad and touch controls. Adjustable quality, camera, shake and Flight Assist.

CONTROLS
Keyboard: WASD / arrows fly · Space or J fire · Shift or K boost · L or right-click roll · Esc or P pause
Gamepad: stick or D-pad fly · A / RT fire · X / LT boost · B roll · Start pause
Touch: on-screen stick, FIRE, BST and ROLL

Sound starts after your first key press, click or tap; browsers do not start audio from a controller alone.

Made by Hacktivate Nation Studios. Follow development on X.
```

Each line above is checked against the shipped game: controls from the in-game Flight Manual, the x8 chain and the
three camera rigs from `src/core/Settings.js` and `index.html`, the UTC daily seed from `Game.dailySeed`, and the
audio note from browser activation rules. Before applying, re-check any line if the frozen candidate changes.

## Tags (genre: Shooter; up to 10 tags)

`shooter`, `arcade`, `isometric`, `rail-shooter`, `3d`, `retro`, `sci-fi`, `boss-battle`, `browser`, `controller`

These describe the observed game: a 3D isometric arcade rail shooter with a boss, gamepad support and browser play.
Leave the AI disclosure exactly as the owner set it.

## Screenshot alt text / captions (upload in this order)

1. `01-iron-sentinel-1920x1080.png`: **Iron Sentinel boss fight** (Sector 08, Classic camera). The interceptor fires a pulse stream at the Sentinel's twin cannons. The boss bar reads "PHASE 1 · DESTROY CANNONS".
2. `02-interceptor-screen-1920x1080.png`: **Interceptor Screen** (Sector 05, Chase camera). Open space between asteroids, a ringed planet and a violet nebula, with a fortress platform ahead.
3. `03-reactor-spine-1920x1080.png`: **Reactor Spine** (Sector 04, Modern camera). The red thermal trench, a glowing coolant gate ahead and a turret on the deck.
4. `04-gun-batteries-1920x1080.png`: **Gun Batteries** (Sector 02, Modern camera). A fortress corridor lined with fuel cells, under a ringed planet in a violet sky.
5. `05-inner-citadel-1920x1080.png`: **Inner Citadel** (Sector 06, Classic 45° isometric). Dense command superstructure, pulse fire up the lane and a COOLANT DISCHARGE warning.

All five are real in-engine frames: drawing buffer 1920x1080 at render scale 1.0, DPR 1, Ultra, GTX 1650 Ti.
They are staged captures (seed 7, sector teleport, hull top-up, fire held), so the HUD scores are low. They show the
game's look, not a recorded run. Full receipts are in `export-manifest.json` → `screenshots`.

## Open Graph / social (repo-side, already wired in `index.html`)

- `og:image` / `twitter:image`: `https://knotenvy.github.io/KnotzAxxon/brand/og-1200x630.png` (1200x630).
- GitHub social preview upload (account-only): `public/brand/social-preview-1280x640.png` (under 1 MB, enforced by `compose.cjs`).
- The legacy `og-image.png` and `social-preview.png` stay in `public/` so cached links keep resolving.

## Account-only publication checklist (owner, in this order)

1. Confirm that the frozen release candidate has passed the release gate. Do not update the listing for an unfrozen build.
2. Edit game → Cover image: upload `itch-cover-630x500.png`. Check the thumbnail preview shows the full wordmark.
3. Screenshots: upload the five curated files in order. Add the captions above where itch offers alt or description.
4. Short description and body: paste from above. Keep the external Play link unless step 7 is chosen.
5. Genre Shooter. Replace tags with the list above (10 maximum). Leave the AI disclosure as set.
6. Optional theme: banner and colours from the mapping table. Save, then view the public page logged out.
7. Optional HTML5 embed (primary's P2): upload the candidate ZIP, set "This file will be played in the browser",
   choose the viewport or click-to-launch fullscreen, enable Mobile Friendly only after mobile QA, and keep the
   Pages link as a fallback. Verify in a logged-out browser.
8. GitHub repo → Settings → Social preview: upload `social-preview-1280x640.png`.
9. Re-run a public inspection (primary's `scripts/qa/launch/inspect-public.cjs`) and record the post-change hashes.
