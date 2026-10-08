> Playtest release: [GitHub Pages](https://knotenvy.github.io/KnotzAxxon/). Current status: [handoff.json](handoff.json). Next team: [playtest guide](docs/PLAYTEST.md) and [release guide](docs/RELEASE.md).

# KNOTZAXXON

**Assault on the Iron Fortress** — a 3D isometric rail shooter built on Three.js, in the lineage of Zaxxon.

You fly a strike fighter down the trenches of an orbital fortress. The camera sits at a
raked isometric angle, which means you cannot tell how high you are by looking at the
ship — you read it off the shadow on the deck and the altimeter on the right. Walls have
gaps. Some of those gaps are at your altitude and some are not.

Everything you see and hear is generated at runtime. There are no textures, models,
sounds or fonts in this repository — the whole thing is code.

---

## Running it

```bash
npm ci
```

```bash
npm run dev
```

Then open <http://localhost:5173>. To make a production build:

```bash
npm run build
```

The output in `dist/` is fully static — drop it on any web host. `npm run preview`
serves it locally. WebGL 2 is required.

---

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Lateral thrust | `←` `→` / `A` `D` | Left stick / D-pad |
| Altitude | `↑` `↓` / `W` `S` | Left stick / D-pad |
| Fire | `Space` / `J` / LMB | `A` / `RT` / `RB` |
| Afterburner | `Shift` / `K` | `LT` / `LB` / `X` |
| Barrel roll | `L` / RMB | `B` / `Y` |
| Pause | `Esc` / `P` | `Start` |
| Perf readout | `F` | — |

Touch controls appear automatically on coarse-pointer devices.

---

## How it plays

- **Altitude is the whole game.** The blob shadow, the drop-line and the ground reticle
  under your ship tell you where you actually are. The altimeter paints the safe band of
  the next barrier in amber; if your marker is outside that band you are about to hit
  something.
- **Terrain hurts but does not instantly kill.** A strike costs a hull point, kills your
  chain and dumps your speed. Three mistakes end the run.
- **Shields stop bullets, not walls.** They are anti-projectile only.
- **Fuel cells are targets.** Shoot them to top off the tank. Running dry starts eating
  the hull.
- **Chain kills** within three seconds to build the multiplier up to x8.
- **Radar towers** are worth a fortune, and destroying one blinds enemy fire prediction
  for twenty seconds — they stop leading their shots.
- **The roll** grants brief invulnerability and vents weapon heat.
- **Guns fire level and forward.** Match the target lane and altitude. Only Flight Assist enables aim steering.
- **Visible combat.** Off-screen target hits consume the shot without damage, score or explosion feedback. A single target-height echo sits beside the altimeter; it turns green at matching altitude. The cyan alignment bracket still confirms a firing lane. Enemy overlays have been removed.
- **Screen-relative steering.** Left/right input, directional rolls, radar and stereo panning agree in all three camera views.
- **Chain feedback.** The first kill starts the counter; every third kill raises the multiplier to a maximum of x8. The larger countdown turns red near expiry, with milestone and chain-loss messages.

The opening speed eases from 36 to 40 world units per second (previously 48), with fuel burn adjusted to preserve cost per distance. The first sector introduces fuel, a lone gun, a forgiving wall, radar and fighters in sequence. Gun batteries, fighter waves, reactor gates and the final fortress each have distinct encounter weights. The HUD route strip tracks all eight sectors; brief sector titles reveal in steps, with reduced-motion support.

Eight sectors, ending at the Iron Sentinel — a three-phase robot that drops into the
arena, tracks you with its head and holds station ahead of you while the fight moves down
the corridor. Shoot off its shoulder cannons, punish the chest reactor while it is open,
and from phase two land six hits on its charging missile launcher to blow the missile in
the rack (the Zaxxon robot duel). While the launcher charges, the robot leans in, the
lock bracket moves onto the rack, the reactor dims and the warning line counts `RACK n/6`.
Its fire curtain has an audible gap: the sweep drops out as it pans past the opening.
Beat it and you can continue into a harder loop with your score banked.

- **Style scoring.** Threading a wall gap close to its edge, diving low under an arch and
  grazing enemy fire all pay bonuses that keep your chain alive.
- **Sector grades.** Each sector is graded S/A/B/C on targets destroyed and hull hits.
  A damage-free sector earns a clean bonus only if you fought it (35% of targets or more,
  full bonus from 80%). Your best grade per sector is kept in browser storage and shown
  next to the run's grades on the results screen. 50,000 and 150,000 points earn extra hull.
- **Daily sortie.** One seeded fortress per UTC day, the same for every pilot.
- **Fortress codes.** The results screen prints a six-character code for the fortress you
  flew. Open the game with `?seed=CODE` to fly that exact fortress again, or share it.
- **Ground targets have a life.** Destroyed emplacements leave burning wrecks and scorch
  marks, turret domes pop off, radar dishes topple, fuel tanks go up in a fire column.
  Parked fighters sit on hardstands; some crews scramble and climb as you approach.

Every sector has its own look: an airfield with parked fighters and landing pads, flak
batteries firing tracers into the sky, reactor cooling stacks venting steam, a dense
citadel of antennae and bunkers, and a red-alarm gauntlet. Leaving the fortress you fly
off a lit deck edge into space; coming back you clear its battlemented perimeter wall,
and the very first wall of the campaign is that perimeter too. Electric barriers span the
lane between pylons in later fortress sectors. Space sectors have tumbling asteroid fields
and debris gates, drifts of rock and hull plating packed across the lane with one clear
band, read on the altimeter like a slot wall. Gun towers rise on pylons from the derelict
dreadnought beneath the lane, and fighter wings launch from the hangar bays of the carrier
running alongside.

The score has a hand-written hook for sectors 1, 4 and 7 and for the boss (the other
songs improvise a seeded motif). Each environment has an ambient bed: deck wind, open-space
air, reactor hum and steam, and an arena sub drone that climbs with the boss's phase.

---

## Architecture

```
src/
  core/       Engine, frame loop, input, settings, math + RNG + pooling
  render/     Procedural textures, materials, sky, post-processing, geometry helpers
  world/      Seeded level planner and the fortress geometry streamer
  entities/   Player, projectiles, enemies, pickups, boss
  fx/         GPU particle system and the effects director
  audio/      WebAudio synthesis and the adaptive score
  game/       Game state machine, collision rules, camera rig
  ui/         HUD, screens and menus
```

A few things worth calling out:

**Procedural assets.** `render/Textures.js` paints armour plating, grating and hazard
chevrons into 2D canvases, then Sobel-filters the height fields into tangent-space normal
maps so the PBR lighting has something to bite on. `audio/Audio.js` synthesises every
sound effect as a one-shot node graph and drives the music from a lookahead scheduler
with layers that fade in with combat intensity. The mix runs through a glue compressor,
a brick-wall compressor and a unity-gain soft clipper; heavy impacts duck the music and
carve its low end, and gameplay cues open a short pocket in its 1-3 kHz band.

**The sky is baked once.** `render/Sky.js` renders its gradient, nebula and starfield into
a cubemap when a sector loads, then uses it as both `scene.background` and — via PMREM —
`scene.environment`. The sky costs nothing per frame, and every metal surface reflects it
for free.

**Geometry streams in merged slices.** The level is planned as pure data (`world/Level.js`),
seeded so a run is reproducible. `world/Fortress.js` slices it into chunks and stamps each
chunk's hundreds of boxes and prop templates straight into pooled per-material vertex
arrays, with per-block variation and baked ambient occlusion carried in vertex colours.
A visible fortress is a few dozen draw calls rather than several hundred. The chunk under
the ship builds first. A second build in the same frame only happens while that frame's
measured build time is inside a 6 ms slice. Barrier approach faces and, in open space,
the faces the ship sees get a baked tint lift, so they read without extra lights.

**The fortress animates without draw calls.** Every emissive strip in a chunk shares one
material whose vertex shader reads a per-vertex animation code: strobing beacons, runway
chase lights, breathing conduits and failing tubes (`LIGHT_ANIM` in `render/Materials.js`).
Radar dishes, fans and orbiting wreckage rotate in the vertex shader about per-vertex
pivots (`Materials.addSpin`). Neither adds a draw call or any per-frame CPU work.

**The world below the lane.** The classic rig looks down at 35 degrees, so half its frame
is whatever lies below the deck edges. `render/Underlay.js` draws one world-anchored plane
far below: the fortress's lit lower city, or a nebula field in open space. In space a faint
flight grid at the altitude floor carries the ship's shadow so the depth cue never goes away.

**Shader programs are compiled before play.** `Game.prewarm` stages one chunk of every
sector, every enemy, the boss, each pickup and each instanced effect, and compiles them
against the composer's render target (rendering to a target selects different
tone-mapping variants than the canvas). The explosion light pool stays in the scene at zero
intensity: toggling light visibility changes the light count, and every new count
recompiles every lit material, which used to cost multi-second stalls on the first blasts.

**Particles are integrated on the GPU.** `fx/Particles.js` stores spawn state (origin,
velocity, drag, gravity, birth time) in attributes and solves the trajectory in the vertex
shader. The CPU touches a particle only when it is spawned, and only the dirty slice of the
buffer is re-uploaded.

**Post-processing is one composite pass.** Bloom and tone mapping run as their own stages,
then FXAA, chromatic aberration, radial speed blur, vignette, film grain, damage tint,
critical-hull edge pulse, white flash and the optional CRT overlay all fold into a single
fragment shader.

The composer target is deliberately **not** multisampled. `UnrealBloomPass` reads
`readBuffer.texture` and then blends back into `readBuffer`; when that buffer is
multisampled the read forces an MSAA resolve, and drivers may invalidate the multisample
attachment afterwards, so the blend lands on discarded contents and the whole frame comes
back black. It is driver-dependent, which makes it the worst kind of bug to ship.
Anti-aliasing is the FXAA in the composite pass instead — no extra pass, no resolve, and
cheaper than 4x MSAA.

**Emissive is authored around the bloom threshold.** The gate sits at 1.02 linear
luminance. Anything below it is a *lit* strip that does not bloom (deck centreline 0.5,
trench conduits 0.62); anything above it is a real glow source, and only small things are
allowed up there (window lights 1.25, gap markers 1.45, engine disc 1.55). Screen area
matters more than brightness for anything near the camera — the ship's exhaust is a
tapered ribbon rather than a pile of additive sprites for exactly that reason.

**Adaptive resolution.** The engine tracks a frame-time EMA and scales the backbuffer
between 55% and 100%, rate-limited so the image never pumps. Quality presets are
auto-detected on first run from core count, device memory and pointer type.

**Draw-call measurement.** Counts vary with camera, scene and quality. On the HIGH preset at
1280x720 (headless Edge, GTX 1650 Ti) the 24 showcase scenes measure roughly 126–283 calls,
below the pre-session build's 207–337 despite the added scenery: the player ship is baked into
four meshes by material, idle hit-flash shells no longer draw, and every landmark, lamp and
seam rides in a chunk's existing batches. These are complete-composer scene snapshots, not
sustained performance measurements. The campaign smoke also tracks the renderer's program
count, which stays flat from the first frame to loop 2.

**Tooling.** Development capture scripts in `scripts/qa/` drive the development build through headless
Edge with the locked Playwright dependency (set `KZ_PLAYWRIGHT_PATH` to a `playwright-core` install and
`KZ_TEST_URL` to the dev server):
`showcase-capture.cjs` renders a fixed list of seeded scenes with render counts and luma;
`motion-capture.cjs` tiles six-frame sequences into contact sheets;
`audio-render.cjs` renders the score and effects offline through the real mix bus to a WAV
plus a labelled spectrogram; `campaign-smoke.cjs` flies the whole campaign with an
invulnerable autopilot into loop 2 and reports grades, errors and frame timing.

Release QA runs with `npm run build:pages` followed by `npm run test:release`. Install its browser once with `npx playwright install chromium`. Generated screenshots and reports go to ignored `artifacts/`; historical evidence and reviews live under `docs/`.

Press **F** in game for the live readout: frame time, draw calls, triangles, resolution
scale and entity count.

---

## Settings

Reachable from the title screen under **SYSTEMS**, persisted to `localStorage`:
graphics preset, camera rig (`CLASSIC 45` for the true isometric diagonal, `MODERN 20`,
or `CHASE`), volumes, screen shake scale, CRT overlay, altitude guide, inverted climb
axis, flight assist, and a performance readout.

---

## Notes

The previous Phaser 3 prototype is preserved untouched in [`legacy/`](legacy/); nothing in
the current build references it.
