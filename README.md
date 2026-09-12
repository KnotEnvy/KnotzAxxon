> Current status and acceptance checklist: [handoff.json](handoff.json). Use `./start-user-testing.ps1` for the local production preview.

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
npm install
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
- **Visible combat.** Off-screen target hits consume the shot without damage, score or explosion feedback. Coral brackets locate nearby hostiles; amber marks fuel and green marks radar. Arrows suggest climb/dive, while the cyan alignment bracket confirms a firing lane.
- **Screen-relative steering.** Left/right input, directional rolls, radar and stereo panning agree in all three camera views.
- **Chain feedback.** The first kill starts the counter; every third kill raises the multiplier to a maximum of x8. The larger countdown turns red near expiry, with milestone and chain-loss messages.

Eight sectors, ending at the Iron Sentinel — a three-phase boss that holds station ahead
of you while the fight moves down the corridor.

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
with layers that fade in with combat intensity.

**The sky is baked once.** `render/Sky.js` renders its gradient, nebula and starfield into
a cubemap when a sector loads, then uses it as both `scene.background` and — via PMREM —
`scene.environment`. The sky costs nothing per frame, and every metal surface reflects it
for free.

**Geometry streams in merged slices.** The level is planned as pure data (`world/Level.js`),
seeded so a run is reproducible. `world/Fortress.js` slices it into chunks and merges each
chunk's dozens of boxes down to one mesh per material, with per-block variation carried in
vertex colours. A visible fortress is a few dozen draw calls rather than several hundred.
At most two chunks build per frame to bound streaming work; hardware profiling is still needed for frame pacing.

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

**Draw-call measurement.** Counts vary with camera, scene and quality. The final-polish controlled 1280x720 MEDIUM scene measured 241 calls in Classic and 275 in Modern/Chase on headless Edge with a GTX 1650 Ti. These are complete-composer scene snapshots, not sustained performance measurements. Enemy rim shading and DOM markers add no geometry draws.

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
