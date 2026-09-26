# KNOTZAXXON Critic Showcase: Round 2 of 2

**Panel:** the same three critics as round 1: a veteran arcade reviewer, a senior technical artist and a game audio designer.
**Date:** 2026-09-26.
**Build judged:** commit `94edf82` ("Fix round 1: living fortress, robot Sentinel, sector set pieces and scored audio"), compared against the round-1 baseline `e4083b7`.

## Evidence basis and its limits

- **Rendered frames.** We viewed all 25 PNGs in the round-2 pack: the 20 round-1 scenes plus `s3-dreadnought-classic`, `s3-dreadnought-chase`, `s5-carrier-modern`, `s4-perimeter-modern` and `boss-duel-chase`.
  - Capture settings: 1280x720, headless Edge, HIGH preset, seed 42, a scripted pilot holding fire.
  - We compared each frame side by side with its baseline equivalent.
  - We made about 20 zoomed crops: parked fighters, flak guns, silo, radar, boss in three rigs, launcher duel, perimeter wall, fuel drums, dreadnought shadow, underlay horizon, explosion.
- **Motion.** We viewed all six contact sheets: `motion-turret-kill`, `motion-fuel-kill`, `motion-boss-entrance`, `motion-launcher-duel`, `motion-scramble` and `motion-runway-lights`.
- **Audio.** We read `audition-spectrum.png` (a 32 s offline render through the real mix bus), `audition.json` and `artifacts/audio-render.cjs`.
- **Render counts and brightness.** We used `report.json` (draw calls, triangles and 3D-only luma) and `baseline-report.json`. For a like-for-like comparison with round 1, we also re-measured brightness on both packs' PNGs with the round-1 method: HUD included, every 4th pixel, Rec.709 luma, near-black meaning luma below 12.
- **Source.** We read it only through `git show 94edf82:<path>` and `git diff main 94edf82`:
  - `Fortress.js`, `Level.js`, `Boss.js`, `Enemies.js`, `Pickup.js`, `Player.js`
  - `Effects.js`, `Ambience.js`, `Underlay.js`, `Materials.js`, `Sky.js`, `Textures.js`
  - `Audio.js`, `Game.js`, `HUD.js`, `Screens.js`, `index.html`, `style.css`
- **Limits.**
  - Still frames and 6-frame sequences are not a live playtest. We could not judge input latency, frame pacing, or how the style-scoring and duel windows feel under the thumbs.
  - **Audio was judged from a spectrogram, statistics and synthesis source, not by listening.** The audition places events one at a time, so it says nothing about masking at real combat density.
  - There is one seed and one quality preset, and the pilot is a script.
  - The capture harness jumps between sectors, so the `results` frame and some HUD states are harness composites. We call these out where they matter.
- **Scale.** A 10 means best in class for a browser arcade shooter. We score against the same bar as round 1 and do not reward effort, only what reaches the screen and the speakers.

## Scores

| Category | Round 1 | Round 2 | Delta | Verdict |
| --- | ---: | ---: | ---: | --- |
| Graphics | 6.0 | **7.0** | +1.0 | The fortress now lights up and moves, and classic view finally has a world under it. It is still under-exposed, walls are black silhouettes, and the space underlay leaves a hard black horizon in the perspective rigs. |
| Asset design | 5.0 | **6.5** | +1.5 | A real robot Sentinel, a proper FUEL drum, parked and scrambling fighters, shape-coded pickups and kills that pop parts off. But new decor now copies the targets' silhouettes, and the boss is a single-colour block of armour. |
| Stage design | 4.5 | **6.0** | +1.5 | There are now per-sector dressing kits, a perimeter entry wall, the dreadnought, the carrier and authored encounter phrases. The playable lane is still one template, and space sectors are backdrop, not terrain. |
| Sound FX | 5.5 | **7.0** | +1.5 | A per-sector arrangement system, ducking, a limiter, per-room reverb, a distance model, and a voice for every event that was silent. The boss riff is a wall of low end, and the lead motifs are random walks. |
| Fun factor | 6.0 | **7.0** | +1.0 | Thread, graze and low-pass scoring, grades, loop continuation, a real launcher duel and kind-specific payoffs. Space still plays the same, the clean bonus can be farmed, and decor wastes shots. |

**New unweighted mean: 6.7** (round 1: 5.4, +1.3).

This is a real fix round. Of our round-1 top 10, eight landed in full or in substance:

| R1 # | Item | Status in `94edf82` |
| ---: | --- | --- |
| 1 | Draw-call recovery | **Landed.** `Player.buildShip` bakes to 4 meshes, flash shells are hidden when idle, and mine spikes are merged. Draw calls fell 15-27% per scene (for example `s1-opening-classic` 207 to 152, `s6-citadel-chase` 337 to 284). Triangles rose 2-3x (to 21-81k), which is still trivial. |
| 2 | Replay and skill hooks | **Mostly landed.** `_scorePass` (THREAD, PERFECT THREAD, LOW PASS), `_graze`, `_gradeSector`, `_checkHullBonus` and `continueLoop` are all in. Still missing: a daily or shareable seed, and persisted per-sector best grades. |
| 3 | Audio arrangement and mix | **Landed.** `SONGS` table, 16-bar phrases with A and B sections, fills, `jingle`, `duckMusic`, `musicComp`, tanh limiter. |
| 4 | Audio event coverage | **Landed.** Roll, overheat, cooled, low fuel, pass, lock tick, mine arm, fly-by, radar down, fuel boom, servo, charge, roar, and proximity hum and whistle. |
| 5 | Re-light and animate | **Landed.** It falls short of the round-1 luma target of 35 with 35% near-black or less. |
| 6 | Robot Sentinel and duel | **Landed.** |
| 7 | Sector kits and greebles | **Partly landed.** Shoulder and far-wall kits are in. There is no citadel canyon, and walls are still dark slabs in frame. |
| 8 | Zaxxon cast | **Partly landed.** FUEL drum, parked fighters, shape-coded pickups and gate emitter coils are in. Wall guns are still off (`onWall: false`). |
| 9 | Space pass | **Visuals only.** Backdrop, grid, asteroids and landmarks are in. There is nothing to navigate. |
| 10 | Destruction and transitions | **Mostly landed.** Wrecks, chunks, fire column, deck-edge bulkheads and the perimeter wall are in. The boss arrives by sky-drop rather than a lift, and the sky crossfade is partial. |

---

## 1. Graphics: 6.0 to 7.0 (+1.0)

### What improved

- **Exposure, measured the same way as round 1** (HUD included):

  | Frame | R1 luma / near-black | R2 luma / near-black |
  | --- | --- | --- |
  | `s3-space-classic` | 2.5 / 96% | **21.1 / 51%** |
  | `s1-opening-classic` | 13.8 / 62% | **26.2 / 47%** |
  | `s2-guns-classic` | 14.8 / 60% | **26.0 / 47%** |
  | `s4-reactor-classic` | 8.6 / 85% | **17.4 / 57%** |
  | `s7-gauntlet-classic` | 20.6 / 54% | **30.1 / 47%** |
  | `s6-citadel-chase` | 17.9 / 65% | **33.3 / 34%** |
  | `s2-guns-chase` | 34.2 / 32% | **44.3 / 22%** |
  | `title` | 17.9 / 68% | **24.7 / 51%** |

  Causes, in `Materials.build`, `Textures.deckSet` / `hullSet` and `Sky.apply`:
  - Hull metalness went from 0.62 to 0.36 and deck from 0.48 to 0.22.
  - Albedo ramps were raised.
  - Ambient is lifted, with the hemisphere ground colour mixed toward the ambient colour.
  - `Batch.box` and `Batch._emit` bake base-to-top ambient occlusion into the vertex colours.

  The classic deck now reads as grey-violet plate instead of mud (`s1-opening-classic`, `s2-guns-classic`, `s7-gauntlet-classic`).
- **Classic view has a world.** `Underlay.js` paints a world-anchored lower city (sodium avenues, furnace glows, beacons) 150 units below the deck, and a nebula field in space. It turns the dead half of every classic frame into depth (`s1-opening-classic` lower right, `s3-space-classic`). The flight grid (`GRID_FRAG`, a halo around the ship with bright corridor edges) restores the reticle and drop-line in open space. It costs two draws, well spent.
- **The fortress is alive at zero draw cost.** `neonVertex` gets `aAnim` (strobe, chase, breathe, flicker) through `lightGain()`, and `addSpin` rotates fans, dishes and debris in the vertex shader.
  - `motion-runway-lights` shows the runway chasers and rib-cap breathing working.
  - Tower beacons strobe out of phase.
  - `AmbientDust` gives dust at dusk, embers in ember sectors and speed streaks in space in one `LineSegments` draw.
- **Colour hierarchy is restored.** The 90-unit cyan conduit is gone, replaced by 5-unit sector-tinted dashes at gain 0.42 (`Fortress._deck`, `THEMES`): teal in S1, amber in S2, red in S7. Player bolts now read cleanly down the lane (`s1-turret-chase`, `s2-guns-chase`).
- **Classic muzzle glare is fixed.** `Player._fire` now calls `fx.muzzle(_aim, …, 0.42, false)`, 0.8 units ahead with no pooled light. The ship is a readable fighter in every classic frame (`s1-opening-classic`, `s2-guns-classic`, `s8-boss-classic`).
- **Space props are lit objects, not black boxes.** Rim-lit, flat-shaded, textured asteroids (`rockGeometry`, `Materials.rock` plus `addRim`) read as rock against the nebula (`s3-space-chase`, `s5-formation-modern`).
- **HUD.** TACTICAL moved into the bottom-right stack, clear of the lane and the reticle (`s1-wall-modern` now shows the reticle). `--fs-xs` went to at least 11 px and `--ink-dim` was lifted.
- **Sky transitions** crossfade fog and lights over 2.4 s (`Sky._applyBlend`), and a 0.16 horizon-colour wash covers the background re-bake.

### What still fails or regressed

1. **Still under-exposed against the round-1 target.** Classic deck frames sit at 26 luma with 47% near-black. The target was at least 35 and at most 35%.
   - The ember preset is worst: `s4-reactor-classic` is 57% near-black.
   - The boss arena is 23-26 luma with 45-55% near-black in all four boss frames.
2. **Barriers are black silhouettes.** The dusk and deepspace sun directions have +Z components (`SKY_PRESETS.dusk.sunDir` is `[-0.46, 0.64, 0.62]`), so the key light back-lights every approach face.
   - The masonry courses (`Fortress._wall` `courses`) are dark lines on a dark face, which reads as nothing.
   - See the top 40% of `s1-wall-modern`, the barrier slab in `s1-opening-modern`, `s1-turret-chase` and `explosion-modern`, and both pillars in `motion-runway-lights`.
   - Walls are the game's central obstacle and are still its least-lit object.
3. **New regression: the underlay makes a hard horizon in perspective space views.** The plane is opaque, and its rim fades to black (`UNDERLAY_FRAG` `edge`).
   - In chase and modern space frames, the lower hemisphere of the sky is replaced by a flat star-floor with a straight edge and a black band under the horizon (crop `underlay-horizon`, `s3-space-chase` at y≈350, `s3-dreadnought-chase`, `s5-*`).
   - Those frames got *darker* than baseline: `s3-space-chase` went from 37.5 to 34.1 luma (27% to 32% near-black), and `s5-formation-modern` from 31.8 to 26.1 (37% to 43%).
   - It also reads as a floor, which fights the "open space" fiction.
4. **The large landmarks are near-black masses in chase.** The dreadnought superstructure (`Fortress._dreadnought` `taperedBox` at `cx + 24`) and the carrier flank are dark slabs with a few tan window strips (`s3-dreadnought-chase` foreground left, `s5-carrier-modern`). The round-1 complaint about untextured dark boxes survives at landmark scale.
5. **Kill payoffs white out.** In `motion-turret-kill` and `motion-fuel-kill`, frames +0.02 s to +0.28 s are a white-yellow blob that covers the ship, then a modest fireball.
   - `explosion-modern` is barely different from baseline: a small hot point plus a ring.
   - The payoff reads as glare, not fire. The new `fireColumn` is hard to see in the fuel sheet.
6. **Speed streaks compete with bolts in classic.** In `s3-space-classic` and `s3-dreadnought-classic`, `AmbientDust` (deepspace opacity 0.62) draws dozens of thin white diagonal strokes. They run in exactly the direction the player's bolts travel.
7. **HUD cards sit on the look-ahead.** See the Bugs section. Two centre cards cover the lane ahead at every sector change (`s4-perimeter-modern`, `sector-transition-modern`).

### Fixes, highest impact first (all within the constraints)

1. **Front-light the barriers at zero cost.**
   - In `Fortress._wall` and `_arch`, scale vertex colour by about 1.5 on faces whose normal points down −Z (the approach face), since `_vertex` already takes `k`.
   - Stamp a low-gain (0.3-0.5, below 1.02) panel-seam grid in the `neon` batch on the approach face.
   - Optionally rotate the dusk and deepspace `sunDir` so its Z component is negative. That lights the approach faces for everything in the corridor.
2. **Fix the underlay rim.** Make the plane blend with alpha that fades at the rim (premultiplied, `transparent: true`), so the sky cubemap shows through, or fade it to the preset's `horizon` colour rather than black. Hide the underlay in chase and modern when `hasDeck` is false, because it was built for the classic rig. Zero draws added.
3. **Lift ember and arena exposure.** Raise `ember` and `void` `ambientIntensity` by about 15%, lift the arena deck tint (`Fortress._arena`, `0xaab6c4` toward `0xc4d0dc`) and add a second, dim red floor-rib emissive. Target: classic frames at 30 luma or more with 45% near-black or less, and the boss arena at 30 or more.
4. **Re-balance kill flashes.** Cap the initial explosion sprite scale and light peak when the blast is within about 20 units of the ship. Lengthen the orange body and add dark smoke so the second 0.3 s reads as fire, and make `fireColumn` taller (speed 20 to 30, life 0.8 to 1.1). Same particle budget.
5. **Give the landmarks value.** Use hull albedo of `0xb0bac8` or more on the dreadnought and carrier and add emissive hull-seam lines in the `neon` batch (zero draws), so they read as ships rather than holes.
6. **Tame the streaks in classic.** Halve `PRESETS.deepspace.opacity` when the classic rig is active and tint the streaks blue (`0x8fb0ff`) so white stays reserved for bolts.

---

## 2. Asset Design: 5.0 to 6.5 (+1.5)

### What improved

- **The Iron Sentinel is now a robot** (`Boss._build`). It has:
  - A V-chest over a hover skirt with jet nozzles.
  - A head with brow, visor slit, crest and antennae that tracks the ship (`head.rotation` in `update`).
  - A chest reactor behind four iris shutters.
  - Pauldrons, elbows, a claw fist, and a quad-tube launcher arm that levels at you while charging.
  - Shoulder cannon pods that leave sparking, smoking stumps (`stump`, `pod.spark`).

  It is baked per material through `Kit`. `s8-boss-chase` and crop `boss-chase` read unmistakably as a mech, and `s8-boss-classic` reads as a torso with shoulder guns. This was round 1's biggest fidelity miss, and it is largely fixed.
- **Fuel drums have an identity** (`FuelCell`, `Textures.fuelDrumTexture`): a tall safety-yellow drum with white bands, a black FUEL stencil and the rotating amber band. In `s6-citadel-chase` (crop `fuel-drums`) they can no longer be mistaken for turrets.
- **Parked fighters and scrambles** (`ParkedFighter`). About 35% of them spool their engines and climb away. `motion-scramble` shows three pale-orange fighters lifting off. Late shots have to match a rising altitude, which is good Zaxxon DNA.
- **Shape-coded pickups** (`Pickup.shapeFor`): a hex ring, a triple chevron, a cross and a drum. This fixes the colour-blind problem.
- **Kind-specific destruction** (`Game._killPayoff`, `Effects.chunk`, `WreckField`):
  - Turret domes pop off (`motion-turret-kill` at +0.32 s).
  - Dishes shear off and topple.
  - Silos vent.
  - Ground kills leave an instanced scorch decal, charred slabs and a burning smoke column.
- **An architecture kit, merged into the chunk batches:**
  - Masonry courses, chase lamp rows around gaps, emitter pylons and perimeter battlements with gate towers on walls (`_wall`).
  - Soffit chasers under arches (`_arch`).
  - Thrusters and corner beacons on platforms (`_platform`).
  - Emitter coils and a projector lintel on gates (`_gate`).
  - Hangar mouths, fans, pipe runs and neon signage on the far wall (`_wallDressing`).
- **Budget discipline.** The ship is 4 draws, mines are 1 draw of spikes, and flash shells are invisible when idle. Draw calls are down across the board even though the world is far busier.

### What still fails or regressed

1. **New regression: decor now mimics targets.** This round introduced unshootable look-alikes for three target types:
   - **Decor parked fighters** (`Fortress._parkedFighter`) use almost exactly the `ParkedFighter` enemy's outline: the same wing shape and a 4.2 versus 4.4 body. They carry a red canopy lamp and sit on hardstands at x = 21-23.5, about 5 units outside the corridor. In classic, depth along that axis is invisible. Crop `s1-parked` shows two dark "targets" by the far wall that cannot be shot.
   - **Decor fuel depots** (`_fuelDepot`) are drums of the same height and radius as `FuelCell`, with an amber hazard band (`title`, `s1-opening-modern` far left).
   - **Decor flak guns** (`_flakGun`, S2) and **dreadnought gun housings** (`_dreadnought`, barrel boxes) look *more* like guns than the real turrets do. In `s2-guns-classic` (crop `s2-guns`), the biggest gun on screen is scenery. `s3-dreadnought-classic` shows three barrelled housings that do nothing.

   A shooter that teaches "if it looks like a gun, shoot it" and then ignores the shot erodes the fair read that was round 1's best quality.
2. **The boss is one colour of clay.** Every hull part uses `enemyHull` (brown-orange), so plates, limbs and head all share one value (crops `boss-classic`, `boss-chase`). There is no gunmetal, hazard trim or livery break. With `STANDOFF` = 92/78/64, the robot spans about 200 px at 1280, and detail such as the visor and launcher tubes disappears (`s8-boss-modern`).
3. **The radar dish is a flat half-disc from most angles.** It shows as an orange paper cut-out in crop `s4-radar`, because the `dishGeometry` bowl reads edge-on.
4. **Wall guns are still dormant** (`Level._wall` still hard-codes `onWall: false`).
5. **Dreadnought and carrier are box assemblies.** They are good as silhouettes at distance and crude up close (see Graphics item 4).

### Fixes, highest impact first

1. **Separate decor from targets, all zero-draw.** Either:
   - Make decor unmistakably inert. Parked decor fighters get tarps (a hull box over the canopy), folded wings, no red lamp, and a desaturated grey tint. Flak guns become skyline-only (on the far towers, above 20 units). Dreadnought housings become smashed stumps with torn-edge emissive. Decor drums become horizontal tank farms or pipelines rather than upright drums. Or:
   - Promote them into cheap score targets using the existing `ParkedFighter` class.

   Either way, a silhouette may never mean both "target" and "scenery".
2. **Give the Sentinel a livery.** Add a second hull key: gunmetal `darkMetal` limbs and skirt, orange armour plates only on chest, pauldrons and head, and hazard chevrons on the launcher forearm. Baked in `Kit`, so the draw count is the same.
3. **Bring the boss closer at its moments.** Drop `STANDOFF` to about 48 while the launcher charges and during the 1.5 s after each phase change, then ease back out. This costs zero GPU and doubles the robot's screen area when it matters.
4. **Fix the dish.** Give it a deeper bowl (`r * 0.6`), a back-truss box and a rim ring, so it reads from the classic angle.
5. **Turn on wall guns.** Set `onWall: true` on a few trench-wall slots in S2 and S6, using the existing `Turret`.

---

## 3. Stage Design: 4.5 to 6.0 (+1.5)

### What improved

- **Per-sector kits exist** (`THEMES`, `_deckProps`, `_wallDressing`):
  - S1 airfield: pads, hardstands and a fuel depot.
  - S2 battery: flak guns with tracer ambience and hazard pads.
  - S4 reactor: cooling stacks venting steam, heat vents and breathing amber conduit.
  - S6 and S7: antenna forest, bunkers, and red strobes in S7.

  You can now tell S1, S4 and S7 apart without the HUD (`s1-opening-classic`, `s4-reactor-classic`, `s7-gauntlet-classic`).
- **Authored transitions.**
  - `_sectorEdges` builds a lit bulkhead cliff with chase lamps and launch pylons where decks meet space.
  - `Level._genFortress` places a **perimeter slot wall with battlements and gate towers** 70 units into every sector entered from space. A fuel pair behind it rewards the entry (`s4-perimeter-modern`).
  - That is the Zaxxon "fly into the fortress" beat, delivered.
- **Space has landmarks.** S3 gets a gutted dreadnought under the lane (breaches exposing ribs, stern engine bells), and S5 gets the wing's carrier alongside, with lit bays and catapult chasers (`s3-dreadnought-*`, `s5-carrier-modern`).
- **Authored encounter phrases** (`Level._phrase`, mixed into the roll):
  - A guarded slot: wall, then a turret pair, then fuel.
  - Shoot the radar through the window.
  - A gate with drones riding its cycle.
  - A fuel lane threaded with mines.

  Airfield rows add strafing runs. These are exactly the risk-then-reward sentences we asked for.
- **Boss entrance.** The Sentinel drops from 58 units up, brakes on its hover jets and slams a ground ring (`motion-boss-entrance`, `Boss.update` entrance block). The arena gains dish-topped buttresses and a narrowing throat (`_arena`).
- **Density rose modestly.** Live enemies across the comparable frames are 1, 2, 1, 1, 4, 8, 4, 5, 4, 10, 12, 11, 10 (median 4, previously about 3-4). The late sectors are now busy (S4 classic 10, S6 11, S7 10).

### What still fails

1. **The playable lane is still one template.** `_deck` and `_trenchWalls` build the same slab, channel and trench for every fortress sector; the kits sit on the shoulders and far wall.
   - The INNER CITADEL still has no canyon: the trench walls were never pulled in, and `s6-citadel-chase` is an open deck.
   - No sector changes the *shape* of the space you fly through.
2. **Space sectors are backdrop, not terrain.** `Level._genSpace` is unchanged (wings, platforms, minefields, debris rings).
   - The dreadnought lies 15 units under the altitude floor, and the carrier is 58 or more units off the lane.
   - Neither poses a navigation problem, and the carrier launches nothing.
   - Asteroids that *look* like lane hazards (`s3-dreadnought-classic` next to the ship, `s5-carrier-modern` crop `carrier-asteroid`) are harmless decor. That trains players to ignore rocks.
3. **The game's own opening has no Zaxxon moment.** The perimeter wall only appears after space (S4 and S6). S1 still opens with 980 units of calm, holding only 6 objects (`_openingRun` unchanged). That is about 25 s at the 0.9x launch pace before the first real encounter.
4. **The arena is still a flat slab.** Pylons and dishes line it, but the curtain barrage does not visibly come from them. There are no destructible generators and no core chamber, and at a 64-92 unit standoff the fight has no sense of scale.
5. **Transitions are covered by the HUD.** At the perimeter wall, the grade card and the sector card both sit over the gate you have to thread (`s4-perimeter-modern`, crop `perimeter`).

### Fixes, highest impact first

1. **Open S1 with the perimeter wall.** Put `perimeter: true` on the `_openingRun` slot at `start + 460`, move it to about `start + 160`, and trim the lead-in from 980 to about 450 units. This delivers the signature beat in the first 12 s at zero cost.
2. **Make space navigable** (colliders plus existing batches):
   - Wreck and asteroid "gates": 2-3 large rocks or hull plates spanning the corridor with a coded-altitude opening, using `rock` batch geometry and `_collider`.
   - Dreadnought spine turrets as real `Turret` targets on a raised gantry that crosses the lane as an arch.
   - Carrier bays that visibly launch the `wing` rolls: spawn `x` at the bay and curve into the corridor.
3. **Give each fortress sector one lane-shape rule.**
   - S6: trench walls at ±20 with overhead bridge arches (`_arch` with gaps).
   - S4: reactor domes set into the trench walls, with coolant gates as the default barrier.
   - S2: flak guns on raised skyline batteries whose tracers never enter the corridor.
4. **Stage the boss.** Make the sweep curtain emanate from the buttress pylons: spawn the bolts at pylon `x`, and flash the pylon's neon a beat before. Give the far end a lit core-chamber wall, which is one chunk of `_arena` geometry.
5. **Choreograph the cards** (see Bugs, item 1).

---

## 4. Sound FX: 5.5 to 7.0 (+1.5) (judged from spectrogram and source, not audition)

### What improved

- **A real arrangement system** (`Audio.SONGS`, `_playStep`).
  - Each sector gets its own song: tempo 126-152, scale (aeolian, dorian, phrygian, harmonic, phrygian dominant), progressions for the A and B sections, a drum kit (four, march, half, breaks, toms, riff) and a bass pattern (pulse, eighths, gallop, riff).
  - Songs play in 16-bar phrases, with a B section at bar 8, snare and tom fills on bars 7 and 15, crashes on phrase starts, and a seeded lead motif.
  - Song changes land on the bar line (`_pendingSong`).
  - There are jingles for clear, grade, loop, victory and defeat.
  - The spectrogram clearly shows the A to B change at 15.3 s and the boss riff at 20.1 s.
- **The mix bus was rebuilt** (`Audio.init`):
  - Music has its own compressor and a duck gain (`duckMusic` on explosions of size 1.5 or more, hull hits, shield hits and the roar).
  - A tanh soft clipper follows the glue compressor.
  - The per-room convolution reverb (fortress 1.3 s bright, space 3.6 s dark, arena 2.4 s) is swapped under a send dip (`setEnvironment`).
  - The music reverb send is lowered to 0.1.
  - Audition peak is −3.0 dBFS, with per-second RMS between −25 and −15 dB. There is headroom and nothing clips.
- **A distance model** (`_voice`): gain of 1/(1 + d/40) and a low-pass from 12 kHz to 2.5 kHz over 120 units. The far and near turret shots in the audition are visibly different in the spectrogram.
- **Every silent event now has a voice.**
  - A panned roll rip, and a steam and servo overheat followed by a "cooled" ping.
  - A two-stage low-fuel pip, and a wall-pass whoosh that brightens with tightness.
  - A **lock tick when you level with a target**, which puts the core Zaxxon mechanic into the ears.
  - Mine arming pips, and a fighter fly-by.
  - An FM radar power-down; the descending sweep at 12.8 s is textbook.
  - A brown-noise fuel "whoomp" with bubbles.
  - Servo whine, a rising charge (the diagonal chirps at 23-25.6 s cut through even the boss riff), the roar, and proximity loops for force-field hum and missile whistle.
- **Voice management.**
  - Per-source throttles (`eshot:${kind}`).
  - ±3-6% pitch variance (`_vary`).
  - The laser pans with the muzzle side.
  - Pink and brown noise, plus waveshaper drive on explosions of size 1.5 or more.

### What still fails

1. **The boss riff is a wall of low end.** From 20 s the spectrogram is saturated from about 40 to 250 Hz with almost no gaps.
   - `BASS.riff` fires on 15 of 16 steps.
   - It uses a sawtooth plus sub through a Q-6 resonant low-pass, over kicks on every beat and step 6.
   - The launcher blast at 25.6 s barely rises above it below 120 Hz, and the grade and victory jingles at 27-29 s are hard to find at all.
   - This is where the biggest impacts in the game happen.
2. **The "limiter" is a saturator.** `softClipCurve` is tanh(1.4x)/tanh(1.4), which adds about +4 dB of small-signal gain and odd harmonics to the whole mix, music included. Under dense combat it will smear rather than limit.
3. **The cue band is crowded.** Arpeggio squares band-passed at 2.2x the note frequency, plus square leads, sit continuously at 1-3 kHz. That is the register of the lock tick (1568/2093 Hz), bonus pings, chain ticks, low-fuel pips (880/1046) and mine pips (1240). The spectrogram's mid band is busy under every cue, and the most important new cue, the lock tick, is the quietest (peak 0.07).
4. **The melodies are random walks.** `motif()` is a seeded random walk over scale degrees, so eight songs share one compositional idea: a 4-bar progression with an unshaped lead. That gives them variety but no identity, and no hook a player will hum. (This is a judgement from the source. Listening may soften it.)
5. **There are no environmental beds.** Space has only the engine drone and half-time drums; the ambience slot (`_ambience`) is unused. The engine drone is unchanged from round 1.
6. **Throttling is still global per kind.** 45 ms per `eshot` kind means three turrets on the same frame still collapse to one blip. That is acceptable, but the boss curtain has no dedicated sweep sound.

### Fixes, highest impact first

1. **Carve the boss riff.**
   - Thin `BASS.riff` to about 10 of 16 steps.
   - Drop the filter Q to 3.
   - High-pass the bass voice at 45 Hz.
   - Add a *low-band* duck: a low-shelf −6 dB on `musicBus` driven with `duckMusic` for size-2 or larger events.
   - Stop the riff one bar before the victory jingle.
2. **Use a true limiter plus gentle colour.** Insert a `DynamicsCompressor` (threshold −3, ratio 20, attack 0.001, knee 0) before the shaper, and re-normalise the shaper to unity small-signal gain: use tanh(x·k)/k with k around 1.1, rather than dividing by tanh(k).
3. **Reserve a cue register.** Move the arpeggio band-pass to 1.4x (below 1 kHz for most notes), or dip `musicBus` 3 dB above 1.2 kHz for 120 ms on each cue using a `peaking` filter. Raise `lockTick` to 0.12 with a short 3 kHz transient.
4. **Compose four hooks.** Hand-write 2-bar motifs for S1, S4, S7 and the boss (16 numbers each, in `SONGS`), and keep RNG motifs for the rest. A theme that returns at the loop continue is a huge identity win at zero cost.
5. **Add environment beds.** Space: looping pink noise through a slowly swept band-pass plus a quiet fifth pad. Reactor: a low 50 Hz hum with steam hiss. Arena: a sub drone that rises by phase. Swap them in `setEnvironment`.
6. **Give the boss curtain its own sound.** A left-to-right filtered-noise sweep that pans across the gap position (`_sweep` knows `gapX`), so the gap is audible.

---

## 5. Fun Factor: 6.0 to 7.0 (+1.0)

### What improved

- **The central skill now pays.**
  - `_scorePass` awards THREAD (250) or PERFECT THREAD (600) from gap clearance and LOW PASS (300) under arches. A scrape in the last 0.6 s forfeits the award.
  - `_graze` gives 50 per near-miss and keeps the chain alive.
  - Floaters and `audio.bonus` confirm both (GRAZE is visible in `s4-reactor-classic` and `s7-gauntlet-classic`).
- **Replay structure.**
  - Sector grades S, A, B or C from target share and hull hits, with a clean-sector bonus.
  - Extra hull at 50k, 150k, 300k and 500k.
  - **CONTINUE: LOOP N** after victory, with banked time bonus and style stats (`continueLoop`, `_nextLoop`), so the dormant endless mode is finally reachable.
  - The results screen shows grades and threads / grazes.
- **The Zaxxon duel is in.** From phase 2, the launcher arm charges for 2.6 s. Six hits blow the missile in its rack: 3,000 points, a 2.2 s stagger and 14 HP. The countdown floaters "5", "4" are visible in `boss-duel-chase`, and attack pressure eases while it charges. Otherwise a heavy homing missile launches with a "ROLL" warning.
- **Kills pay differently.** Turret domes pop and dishes topple. Fuel gets a fire column, two secondary pops and a whoomp. Radar gets a 75 ms hit-stop and a power-down. Every ground kill leaves a burning wreck. Scrambling fighters turn a static target into an altitude-matching shot.
- **Authored phrases** turn random rolls into small puzzles, for example shooting the radar through the window before you reach it.

### What still fails

1. **Space plays exactly as before** (see Stage, item 2). Two of eight sectors are still "shoot orange things"; they are just prettier now.
2. **The clean bonus can be farmed.** `_gradeSector` adds `2000 × (1 + loop)` whenever `damage === 0`, even at 0% targets. `s4-perimeter-modern` and `sector-transition-modern` literally show "TARGETS 0% // NO DAMAGE // CLEAN +2,000". A pacifist route through all eight sectors earns 16,000 per loop. The bonus should reward skill, not avoidance.
3. **Decor wastes shots** (see Asset Design, item 1). Unshootable fighters, drums and guns, plus S2 flak tracers in the enemy-fire orange palette (`Effects.ambient` `flak`, `0xfff0b0` to `0xff7020`) that can cross the corridor, blur the question "what is a threat?".
4. **The duel is far away.** The launcher (`radius` 3.4) must take six hits at 64-78 units while the chest reactor glows brighter beside it. The core is the most salient thing on screen but is not the priority target (crop `boss-duel`). That is a legibility risk we could not test by hand.
5. **Thin replay hooks remain.** The seed is still random per run, with no daily or shareable seed. Grades are not persisted per sector. The results grade line is a dash string (`- - - - - - C -`).
6. **Sector 1 still starts slowly** (980 units, 6 objects).

### Fixes, highest impact first

1. **Fix scoring integrity.** Pay the clean bonus only at 35% targets or more, scaled by the ratio. Show "CLEAN" separately from the grade. Recolour ambient flak to grey-white puffs above ALT_MAX, and clamp the tracer yaw so tracers never cross |x| < 18.
2. **Frame the duel.** Put a lock bracket (the existing `hud-lock`) on the launcher while it charges. Dim the chest core to 50% during the charge. Pull the boss to a standoff of about 48 (Asset Design fix 3). Add a large central hit counter in the warn line ("RACK 4/6").
3. **Make space a navigation problem** (Stage fix 2).
4. **Add a daily seed and a share code.** Seed from YYYYMMDD with a "DAILY" menu item, print a 6-character seed code on the results screen, and persist the best grade per sector next to `Scores`.
5. **Open with the perimeter wall and trim S1's calm** (Stage fix 1).

---

## Bugs, artefacts and regressions

| # | Severity | Issue | Evidence | Fix |
| ---: | --- | --- | --- | --- |
| 1 | **High** | **Grade card and sector card collide over the look-ahead.** `Game._enterSector` fires `_gradeSector(index-1)`, which sets `hud.grade` at `top: 15%` for 2.8 s, *and* `screens.sectorCard` (padding-top `24vh`, 3 s) in the same frame. The pair covers y≈108-345 at 720p, which is exactly where the next wall appears; at the perimeter wall they sit over the gate. | `s4-perimeter-modern`, `sector-transition-modern`, crop `perimeter` | Queue them: show the grade during the final fuel lane (about 110 units before `zEnd`), then the sector card. Or merge them into one compact top strip at y ≤ 90 px or a lower-third. |
| 2 | **High** | **Two altitude cues disagree over the dreadnought.** The reticle and blob sit on the flight grid at y=0, but the directional shadow map throws a second, sharp ship shadow onto the dreadnought deck at y=−15, well away from the reticle. This breaks the core depth read in the one sector designed around it. | `s3-dreadnought-classic` (crop `s3d-shadow`), `s3-space-classic` (crop `s3-shadow`) | `receiveShadow = false` for the space-sector chunk batch (`_voidProps` / `_dreadnought`), or disable `castShadow` on the ship while `flightGrid` is active. |
| 3 | **Medium-High** | **Decor copies target silhouettes:** decor parked fighters, fuel-depot drums, flak guns, and dreadnought barrel housings. | crops `s1-parked`, `s2-guns`, `s3-dreadnought-classic` | Asset Design fix 1. |
| 4 | **Medium** | **Underlay plane horizon in perspective space views.** It is an opaque plane with a black-faded rim, which leaves a hard horizon line and a black band, and lowers frame luma against baseline. | `s3-space-chase` (crop `underlay-horizon`), `s3-dreadnought-chase`, `s5-formation-modern`, `s5-carrier-modern` | Graphics fix 2. |
| 5 | **Medium** | **The ship vanishes behind near-side pillars in classic.** Approaching barriers are rightly opaque, but when threading a `pillars` gap the ship, drop-line and reticle are hidden for about 0.2-0.3 s. | `motion-runway-lights` +0.48 s and +0.60 s (crop `runway-bottom`) | A player-silhouette pass: the merged hull drawn again with `depthFunc: GreaterDepth`, flat cyan at 35% opacity, classic rig only. That is 1 draw, and barriers stay opaque. |
| 6 | **Medium** | **Clean bonus at 0% targets** (a scoring exploit). | `s4-perimeter-modern`: "TARGETS 0% // NO DAMAGE // CLEAN +2,000" | Fun fix 1. |
| 7 | **Medium** | **Ambient flak shares the enemy-fire palette** and its tracers may cross the corridor (yaw ±0.5 rad from x ≈ 20). | `Effects.ambient` `flak`, `Fortress._flakGun` | Grey-white puffs, clamp yaw away from the lane. |
| 8 | **Low-Medium** | **Near-camera asteroids fill the chase corners.** Rocks up to 16 units at \|x\| ≥ 30 cross the camera path and cover the score panel. | `s3-space-chase` top-left, `s3-dreadnought-chase` | Scale rock size with \|x\| (small near, large far) or keep them at \|x\| ≥ 45 when larger than 6. |
| 9 | **Low** | **Sky background still hard-swaps.** The re-bake is masked by a 0.16 flash, not a crossfade. | `Game._enterSector`, `Sky.apply` | Acceptable now. Ideally, time the swap to when the camera is inside the deck-edge bulkhead or the perimeter gate. |
| 10 | **Low** | **Launcher counter floaters are tiny** white digits near the arm. | `boss-duel-chase` | Put the count in the warn line or on the lock bracket. |
| 11 | **Low (harness?)** | **Results screen: "SECTOR REACHED 06" with only sector 7 graded** (`- - - - - - C -`) and THREADS / GRAZES 0 / 0 despite GRAZE floaters earlier. Most likely the capture harness jumping sectors and resetting. There is also a faded boss bar visible in `sector-transition-modern`, probably the capture order. | `results`, `sector-transition-modern` | Verify with a straight playthrough. Render grades as 8 coloured chips labelled 1-8. |
| 12 | **Low** | **Amber overload.** Fuel band, hazard stripes, gate lamps, wall lamp rows, the S2 conduit, turret eyes and flak all sit at `0xffb43a` to `0xff7a3a`. In `s2-guns-classic` the amber lane dashes sit in the same hue family as enemy muzzle flashes. | `s2-guns-classic` | Make the S2 conduit desaturated steel, and reserve amber for fuel and hazards. |

We confirmed three suspected artefacts were not bugs:
- The missing "x1 BUILD YOUR CHAIN" row is `.chain` fading out by design when the chain is 0.
- The two-letter "GU…" and "RI…" titles are the `sectorCard` clip-path reveal caught mid-animation.
- The white orb on the ship in `s7-gauntlet-classic` is a nearby explosion, not muzzle glare.

---

## Top 8 fixes for the last fix round

Ordered by expected score gain per unit of GPU cost. Zero-cost items come first, ranked by gain, then low-cost items by gain per draw. Gains are panel estimates against these round-2 scores.

| # | Change | Expected gain | GPU cost |
| ---: | --- | --- | --- |
| 1 | **Transition choreography and the Zaxxon opener.** Queue the grade and sector cards so they never overlap, and keep them out of the look-ahead (top strip or lower-third). Put the perimeter wall with battlements at the start of S1, and trim the S1 lead-in from 980 to about 450 units. | Stage +0.3, Fun +0.2, Graphics +0.1 | Zero |
| 2 | **Boss presence and duel legibility.** Two-tone livery (gunmetal limbs, orange plates, hazard trim) via a second `Kit` key. Standoff about 48 during the launcher charge and phase changes. A lock bracket on the charging launcher, the chest core dimmed during the charge, and "RACK n/6" in the warn line. | Assets +0.3, Fun +0.2, Stage +0.1 | Zero (same draw count) |
| 3 | **Decor versus target separation.** Inert-looking decor fighters (tarps, no lamp, grey), skyline-only flak with grey puffs and clamped tracers, smashed dreadnought housings and horizontal tank farms. Or promote the look-alikes into real score targets. | Fun +0.2, Assets +0.2, Stage +0.1 | Zero |
| 4 | **Audio mix and identity pass.** Carve the boss riff (fewer steps, Q 3, 45 Hz high-pass, low-shelf duck). A true limiter before a unity-gain shaper. A reserved 1-3 kHz cue band and a louder lock tick. Four hand-written hooks (S1, S4, S7, boss). Environment beds, and a curtain sweep panned to the gap. | Sound +0.5 | Zero (CPU-side synthesis only) |
| 5 | **Value pass on walls and space.** Brighten approach faces through vertex colour on −Z normals, add low-gain panel seams in the `neon` batch, and pick sun directions that front-light the corridor. Fix the underlay rim (alpha fade or horizon colour; hide it in perspective when space). Lift ember and arena ambient. Re-balance the white kill flash toward a longer fire body. | Graphics +0.4 | Zero (no draws; a trivial blend-state change on one existing plane) |
| 6 | **Scoring integrity and replay hooks.** Clean bonus only at 35% targets or more. A daily seed and a 6-character share code on results. Best grade persisted per sector, and grade chips on the results screen. | Fun +0.3 | Zero |
| 7 | **Make space a place you fly through.** Collidable wreck and asteroid gates with coded-altitude openings from existing `rock` and `hull` batch geometry plus `_collider`. Dreadnought spine turrets on a gantry arch as real `Turret`s. Interceptor wings launched visibly from the carrier bays. | Stage +0.4, Fun +0.3 | Very low: +0-2 draws (reuses chunk batches and existing enemy classes; a few colliders) |
| 8 | **Altitude-cue integrity.** Turn off shadow receipt on space-sector geometry (or the ship's shadow cast while `flightGrid` is on) so the reticle is the only ground cue. Add a classic-only occluded-ship silhouette pass (`depthFunc: GreaterDepth`, flat cyan at 35%) so pillar threading never hides the ship. | Fun +0.2, Graphics +0.1 | Very low: +1 draw (the shadow fix is zero) |

**Plausible final scores if all eight land cleanly:** Graphics about 7.5, Asset design about 7.1, Stage design about 6.9, Sound FX about 7.5, Fun factor about 7.6. That is a mean of about 7.3. To reach 8 or more in any category, the next evidence pack would need a real capture or a human-played clip, plus a dense-combat audio render rather than isolated events. Until then the panel cannot credit feel, timing or mix behaviour under load.
