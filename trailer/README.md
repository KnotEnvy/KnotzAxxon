# KNOTZAXXON — the trailer

An 87-second gameplay trailer made entirely in code from the game itself.

**The idea:** *the angle you remember, the fortress you never saw.* It opens in the
game's own CLASSIC 45 rig with the CRT overlay switched on, the closest thing the game
has to an original-style mode. Then, in one continuous shot, the camera flies from
the isometric angle down into the chase rig as the ship clears the fortress's outer
wall in slow motion. After that, the same instant is shown through all three camera
rigs (CLASSIC 45, MODERN 20, CHASE). The game renders the same simulation three times,
so the comparison is exact frame for frame. The game's own title-screen tagline
carries the rest: *Match altitude. Read your shadow. Break the fortress.* Then the
Iron Sentinel duel, the title and one call to action.

No footage or assets from any other game are used, and the trailer does not name or
imply a link to any other game.

## How it was made

1. **Footage** (`capture/`). The real game (Vite dev build, `window.KZ`) runs in
   Chromium on a virtual clock (`capture/clock.js`). `performance.now`, `Date.now`,
   timers, `requestAnimationFrame` and every CSS animation move only when the
   harness steps a frame, and `Math.random` is seeded. `capture/harness.js` steps
   the game's own `update` and `lateUpdate` at exactly 1/60 s per frame (less for
   slow motion, which is real: the game steps less per frame). It honours the
   engine's own hit-stop and time scale. Every shot is a scripted scene in
   `capture/shots.mjs`, and the same spec always films the same frames.
   - **Autopilot** (`capture/pilot.js`): threads the next gap (optionally hugging
     an edge so the game pays THREAD bonuses), goes over or under electric
     barriers, avoids gun platforms, otherwise lines up level with the nearest
     target (the guns fire level), and steers away from predicted enemy fire with
     a rate-limited stick so banking stays smooth.
   - **God mode with an audit:** hits and crashes are absorbed and logged with
     their frame. The edit only uses frames with no absorbed hits.
   - **Camera rigs:** `alts` re-renders every frame through other rigs from the
     same simulation (`<id>_modern.mp4`, `_chase`, `_classic`). The cold open's fly-in is a
     dolly zoom from a near-zero field of view far away (which reads as the classic
     orthographic view) into the chase rig. Fog density is compensated for the
     extra distance.
   - **Supersampling:** 1920x1080 at device scale 2 (3840x2160), downscaled with
     lanczos. Boss shots keep the 2x master (`-4k.mp4`) for close-up crops.
   - **GPU, off-screen:** headless Chromium on this WSL box only gets SwiftShader
     (CPU) for WebGL. `capture/browser.mjs` starts an invisible X display
     (`Xvfb :99`) and runs a normal Chromium on it with ANGLE → OpenGL → Mesa
     D3D12, which reaches the RTX GPU. Nothing appears on the desktop. Every frame
     ends with `gl.finish()`.
   - **Frame checks:** each screenshot is reduced to a 96x54 grey grid and
     compared with the recent frames. A blank frame or a black block is drawn
     again and re-shot, and a frame that won't come good fails the shot.
     `node capture/glitch-scan.mjs` audits every filmed frame afterwards.
   - **Game bugs found on the way:** two of the game's shaders take `pow()` of a
     value that rounding can push a hair below zero. One is the planet's limb term
     (`src/render/CelestialMaterials.js`); the other is the engine exhaust ribbon's
     edge falloff (`src/fx/Trail.js`, `pow(edge, 2.2)`). On ANGLE/D3D that gives
     NaN, and the bloom blur smears the pixel into a black rectangle. Windows
     players can probably see this as occasional black flashes. For capture, the
     harness prepends `#define pow(a, b) pow(max((a), 0.0), (b))` to every custom
     shader, which changes nothing that renders correctly. The game's source is
     unchanged; the real fix is to clamp those two bases in the game.
   - **Freezes:** a frame byte-identical to the previous one means the compositor
     froze. That attempt fails, and the shot is retried in a fresh browser (each
     shot gets its own browser).
   - **Repairs:** `node capture/glitch-scan.mjs --repair` replaces an isolated
     glitched frame with the one before it (the original is kept as
     `.glitch.jpg`). `node capture/encode.mjs --only=...` then re-encodes those
     shots. In the final cut, three single frames were repaired (c18 39, c23 136,
     c28 CLASSIC 34), all filmed before the shader guard existed.
   - **One capture job at a time** (`--jobs=1`). Parallel GPU windows produced
     more presentation glitches than they saved time.
2. **Score** (`audio/cue.js`): a 50-bar cue at 144 bpm (one beat = 25 frames, one
   bar = 100) played on the game's own synth voices (`src/audio/Audio.js`: kick,
   snare, toms, hats, crash, bass, arp, pad, lead) plus a few trailer instruments
   built from the same Web Audio parts. It quotes the game's hand-written hooks: the
   sector-1 hook (as an arcade chiptune over the classic cold open, then on the
   full voices) and the boss hook in E phrygian dominant. The climax lifts F–G–A and
   lands on A major under the title. Rendered offline (`audio/render-music.mjs`) with
   the game's glue compressor bypassed so the trailer keeps its dynamic arc.
3. **Sound** (`capture/sfx-pass.mjs`). While filming, every call the game makes to
   its audio engine is logged with its frame instead of played. The sound pass
   replays those calls through the game's own `Audio` on an offline clock, one
   suspend point per video frame. Game music, sector stings and jingles are left
   out because the score replaces them. Sound matches the picture by construction,
   and the pass checks that every logged call was played.
4. **Edit** (`edit/`): [Remotion](https://www.remotion.dev), in the game's type
   (system monospace) and palette (`edit/style.ts`). Every cut is in bars
   (`edit/Trailer.tsx`). Words on screen come from the game: the title screen, the
   CAMERA RIG setting names and the in-game sector cards.
5. **Master** (`render.mjs`): plain gain to −14 LUFS, then a peak limiter for
   ≤ −1 dBTP, AAC 320k.

## Structure

| Bars | Time | Section |
| --- | --- | --- |
| 0–3 | 0:00 | Cold open: CLASSIC 45 + CRT down the opening run, then the fly-in to CHASE |
| 3–4 | 0:05 | Through the outer wall in slow motion on the hit; title |
| 4–8 | 0:07 | One simulation, three rigs: half-bar match cuts, then side by side |
| 8–12 | 0:13 | Combat: fuel fire columns, radar topple, emplacements, airfield |
| 12–16 | 0:20 | Eight sectors, half a bar each, with the in-game sector cards |
| 16–24 | 0:27 | The break, in slow motion: MATCH ALTITUDE, READ YOUR SHADOW, the electric barrier, the reactor gate |
| 24–32 | 0:40 | Escalation: debris gate, gun towers, fighter wings, citadel, the Gauntlet. BREAK THE FORTRESS |
| 32–40 | 0:53 | The Iron Sentinel arrives; cannons, reactor, curtain fire, missiles |
| 40–44 | 1:07 | The duel: RACK n/6, the missile blows in the rack on bar 42, the last blast on bar 44 |
| 44–52 | 1:13 | Title, then "Play free in your browser" over the classic view |

## The 4:5 short

`out/KnotzAxxon-Short-4x5-60fps.mp4` (1080x1350, ~47 s) for TikTok, YouTube Shorts and
Reels. It is the same film retold in 27 bars (`edit/Short.tsx`):

| Short bars | Trailer bars (score) | Section |
| --- | --- | --- |
| 0–3 | 0, 2, 3 | Cold open in CLASSIC 45 + CRT, the dive to CHASE, through the wall on bar 2; title |
| 3–7 | 4–7 | One simulation, three rigs: match cuts, then the three rigs stacked |
| 7–9 | 8, 9 | Combat, half a bar each |
| 9–11 | 16, 23 | MATCH ALTITUDE. READ YOUR SHADOW. (slow motion) |
| 11–15 | 24, 25, 30, 31 | Escalation, BREAK THE FORTRESS. |
| 15–18 | 32, 36, 39 | The Iron Sentinel |
| 18–22 | 40–43 | The duel; the missile blows in the rack on bar 20 |
| 22–28 | 44–48 | Title, then "Play free in your browser" |

- **Music:** the trailer's cue with its bars re-ordered (`SHORT_MAP` in `audio/cue.js`),
  rendered as one piece, so notes and reverb carry across the new joins. Section
  levels follow each bar's source.
- **Picture:** every shot is cropped from the 2x masters (`<id>-4k.mp4`), so the
  4:5 window is downscaled, never upscaled. The shot component (`Shot` in
  `edit/components.tsx`) takes a focus point in footage coordinates and fills any
  frame or panel; the trailer renders exactly as before. In the classic shots, the
  focus follows the ship, which sits left of centre in that rig.
- **Safe areas:** words stay between y≈100 and y≈1100. On a 9:16 phone screen the
  4:5 frame sits between bars, and the app's captions and buttons cover only its
  bottom edge.

## Rebuild

Requirements: Node 22+, ffmpeg and Xvfb on PATH, Playwright's Chromium (see
`capture/browser.mjs` for the library path and GPU flags) and the fonts the game's
UI resolves to on Windows (Cascadia Mono / Consolas) installed for fontconfig.

Start the game's dev server with the capture config (port 5190, file watching and
HMR off, so editing trailer files can never reload a page mid-shot). Run it from the
repo root and restart it after changing anything under `trailer/capture/`:

```bash
node node_modules/vite/bin/vite.js --config trailer/capture/vite.capture.config.mjs
```

Then, in `trailer/`:

```bash
npm install
node capture/capture.mjs           # film every shot (--only=id,id; --probe=10 for quick stills)
node capture/glitch-scan.mjs       # audit the filmed frames (should print "clean")
node capture/sfx-pass.mjs          # game sound per shot -> public/audio/sfx/
node audio/render-music.mjs        # the score -> work/audio/music.wav
cp work/audio/music.wav public/audio/music.wav
# Render inside a private network namespace: WSL's periodic connectivity checks
# otherwise make Chrome abort localhost requests (ERR_NETWORK_CHANGED) mid-render.
unshare -rn sh -c 'ip link set lo up && exec node render.mjs --concurrency=8'
unshare -rn sh -c 'ip link set lo up && exec node render.mjs --thumbnail'
node review.mjs                    # half-bar contact sheets, section stills, per-bar loudness

# the 4:5 short
node capture/encode.mjs --4k --only=c01-open,c02-rigs,c03-fuel,c04-radar,c05-flak,c10-match,c14-debris,c15-towers,c18-citadel,c20-gauntlet,c21-gauntlet2,c30-end
node audio/render-music.mjs --short && cp work/audio/music-short.wav public/audio/
unshare -rn sh -c 'ip link set lo up && exec node render.mjs --short --concurrency=8'
unshare -rn sh -c 'ip link set lo up && exec node render.mjs --short --thumbnail'   # the cover
node review.mjs --short
```

`node render.mjs --stills=5.2,40` renders review stills (in seconds), and
`--frames=0-599` renders part of the trailer. `node capture/capture.mjs --file=./shots-explore.mjs --probe=30` films every sector in all three rigs as stills (tile them with `capture/probe-sheet.sh <id>`). `node capture/survey.mjs --seed=N` flies a
whole campaign with the autopilot and saves a still every half second plus the event
log, which is how set pieces were found. `node audio/bars.mjs <file>` prints loudness
per bar.

## Change it

| To change | Edit |
| --- | --- |
| A shot (seed, sector, rig, pilot, slow motion, boss script) | `capture/shots.mjs`, then re-film that id and re-run its sound |
| Cuts, zooms, words | `edit/Trailer.tsx`, `edit/timeline.ts` |
| The music | `audio/cue.js` (bar numbers match the edit) |
| The URL on the end card | `SITE_URL` in `edit/timeline.ts` |
| The short (cuts, crops, bar order) | `edit/Short.tsx` and `SHORT_MAP` in `audio/cue.js` (the two must match) |
