# KNOTZAXXON Critic Showcase: Round 1 of 2 (Baseline)

**Panel:** a veteran arcade reviewer, a senior technical artist and a game audio designer.
**Date:** 2026-09-26.
**Build judged:** `main` at `e4083b7` ("Record verified sector refinement delivery").

## Evidence basis and its limits

- **Rendered frames.** We viewed all 20 PNGs in the baseline pack: `title`, `s1-opening-classic`, `s1-opening-modern`, `s1-turret-chase`, `s1-wall-modern`, `s2-guns-classic`, `s2-guns-chase`, `s3-space-classic`, `s3-space-chase`, `s4-reactor-modern`, `s4-reactor-classic`, `s5-formation-modern`, `s6-citadel-chase`, `s7-gauntlet-classic`, `s8-boss-classic`, `s8-boss-chase`, `s8-boss-modern`, `sector-transition-modern`, `explosion-modern` and `results`. They were captured at 1280x720 in headless Edge on the HIGH preset, with a scripted pilot holding fire. We also made 2x to 5x crops of the ship, enemies, boss, platform and explosion, and measured every frame's brightness: mean Rec.709 luma sampled every 4th pixel, where "near-black" means luma below 12/255.
- **Render counts.** `report.json` gives draw calls, triangles and live enemies for each scene.
- **Source code.** We read the baseline source only through `git show main:<path>`: `Level.js`, `Fortress.js`, `Enemies.js`, `Boss.js`, `Player.js`, `Pickup.js`, `Projectiles.js`, `Effects.js`, `Particles.js`, `Sky.js`, `Materials.js`, `Textures.js`, `PostFX.js` (grep), `Audio.js`, `Game.js`, `CameraRig.js`, `FlightCamera.js`, `HUD.js` (grep), `Screens.js` (grep), `index.html`, the earlier `CRITIC_*.md` reports and `handoff.json`.
- **Limits.**
  - Screenshots are still frames. We could not judge frame pacing, input latency, how motion reads or the timing of effects.
  - **Audio was judged from the synthesis source, not by listening.**
  - There is one seed and one quality preset. The pilot is a script, not a skilled human.
  - Earlier critic rounds scored the game 8.2 to 8.5 on source alone. This round is the first to score from rendered pixels, and several of those source-only assumptions do not survive contact with the frames.
- **Scale.** A 10 means best in class for a browser arcade shooter. Scores are not inflated to track previous rounds.

## Scores

| Category | Score /10 | One-line verdict |
| --- | ---: | --- |
| Graphics | **6.0** | The perspective rigs have atmosphere. The classic homage view is 50-96% near-black, and the space sectors turn into a void or floating black boxes. |
| Asset design | **5.0** | The player ship and small enemies are competent. The boss is not a robot, fuel tanks look like turrets, and the scenery is untextured boxes. |
| Stage design | **4.5** | Eight sector names but only three geometry templates. Sky tint gives each sector its identity, with no set pieces and no authored transitions. |
| Sound FX | **5.5** | Good synthesis building blocks and an intensity-layered score. But one 4-bar loop plays for the whole campaign, there is no ducking or distance model, and many gameplay events have no sound. |
| Fun factor | **6.0** | The Zaxxon altitude-and-lane loop is intact and fair. Sparse encounters, modest payoffs and a run that simply ends after the boss hold it back. |

**Unweighted mean: 5.4.**

---

## 1. Graphics: 6.0

### What works

- **Perspective rigs have a real sense of place.** In `s2-guns-chase`, `s1-turret-chase` and `s4-reactor-modern`, the plated deck reads as heavy, used metal. It uses Sobel-derived normal and roughness maps from `Textures.deckSet` and `Textures.hullSet`. The baked nebula cubemap with the ringed planet (`Sky` `SKY_FRAG` and `_buildBodies`) gives a strong horizon. The `ember` preset in `s4-reactor-modern` and `s6-citadel-chase` is the most striking palette in the pack.
- **The altitude rig is the game's best readability feature.** The blob shadow, cyan drop-line and ground reticle (`Player._updateShadow`) are legible in every deck frame (`s1-wall-modern`, `s6-citadel-chase`, `s8-boss-chase`). Read together with the altimeter's amber gap band, altitude can be judged from a still frame.
- **The coolant gate force field** (`Materials.forceField`) in `s7-gauntlet-classic` is the best single element in the pack. It has scrolling hex cells, scan lines, hazard-striped posts and an unambiguous read in the isometric view.
- **Colour roles are coded consistently.** Player fire is cyan-white, enemy fire is orange-red, hazards are amber chevrons, and neon trims mark each gap edge (`Fortress._wall` stripes and guide lights). Bloom stays on the right side of the 1.02 threshold. Engine ribbons (`Trail`) and bolt halos give motion even in stills.

### What fails

1. **Exposure is crushed, especially in classic.** Measured values:

   | Frame | Mean luma | Near-black |
   | --- | ---: | ---: |
   | `s3-space-classic` | 2.5 | 96% |
   | `s4-reactor-classic` | 8.6 | 85% |
   | `s1-opening-classic` | 13.8 | 62% |
   | `s2-guns-classic` | 14.8 | 60% |
   | `s6-citadel-chase` | 17.9 | 65% |
   | `s1-wall-modern` | 18.9 | 60% |
   | `title` | 17.9 | 68% |

   Even the best perspective frames only reach 30-37. In classic, the deck reads as mud-purple. Barrier and trench faces are black slabs: the top 40% of `s1-wall-modern` and both canyon walls in `s6-citadel-chase`.
   Likely causes:
   - Deck metalness is 0.48 and hull metalness 0.62 (`Materials.build`), reflecting a dark environment map.
   - Under the orthographic projection, every pixel's reflection samples the same environment direction, so metal flattens to one value.
   - ACES tone mapping at exposure 1.02 and the vignette then crush what is left.
2. **Classic space is a black void.** `s3-space-classic` shows no stars, nebula, planet or debris, just ships on black. The cubemap sky gives the orthographic classic camera no usable backdrop. The blob shadow, drop-line and reticle are hidden without a deck (`show = ctx.hasDeck`). So the homage view loses both its setting and its altitude cue in two of the eight sectors.
3. **The scenery is black boxes.** Space debris rings and void props are `darkMetal` boxes (`Fortress._debrisRing`, `Fortress._voidProps`). In `s3-space-chase` and `s5-formation-modern` they read as flat black rectangles pasted over a lovely nebula. Skyline towers (`Fortress._skyline`) are untextured dark tapered boxes.
4. **The colour hierarchy is inverted.** The centre conduit is the largest saturated element in every deck frame: `Fortress._deck`, `neon`, `0x45e0ff`, 1.5 wide and running the full chunk length. It sits directly under the flight line, in the same hue as the player's bolts, halos and hull trim. In `s2-guns-chase` and `s1-turret-chase`, player bolts travel along the conduit and dissolve into it.
5. **Muzzle glare hides the hero in classic.** `Effects.muzzle` spawns a size-4.5 spark burst and a point light of intensity 26 at the nose on every shot, once every 0.115 s. In `s1-opening-classic`, `s2-guns-classic`, `s4-reactor-classic` and `s8-boss-classic`, the roughly 50 px ship is a white orb with wings.
6. **The world is static.** Apart from gates, nothing in the fortress moves. Windows, beacons and conduits are constant vertex colours in `neonVertex`. The unused `Materials.conduit` scrolling shader and the unused `circuit` and `flare` textures show animation was intended but never landed.
7. **Sky changes are hard cuts.** `Game._enterSector` calls `Sky.apply`, which re-bakes the background, environment map, fog and lights in a single frame. Moving from deep space to ember is an instant palette flip.
8. **The HUD collides with the playfield.** In modern view, the TACTICAL radar box sits bottom-centre on top of the ship's ground reticle (`s1-wall-modern`, `s4-reactor-modern`). The 8-9 px panel labels are low-contrast grey on navy.

### Improvements, highest impact first

1. **Re-light for midtones, with zero extra draws.**
   - Lower deck metalness to about 0.2 and hull to about 0.35, and raise albedo.
   - Lift the hemisphere light's ground colour.
   - In `Batch.add`, bake per-vertex ambient occlusion and edge light: darken vertices near each box's base and lighten top faces. This is a few lines of vertex colour.
   - Target: classic deck frames at mean luma 35 or more, with no more than 35% near-black.
2. **Give classic view a backdrop.**
   - Add one large world-anchored plane about 160 units below the lane. Give it a canvas-painted nebula and star texture (a new `Textures` function) scrolling at about 0.3x parallax, plus one `Points` star layer.
   - In space sectors, add a faint scrolling holographic flight grid at y=0 that also receives the blob shadow and reticle.
   - Cost: 2-3 draws. This fixes the worst frame in the pack and restores the altitude cue in space.
3. **Animate the neon for free.** Use `onBeforeCompile` on `neonVertex` to add a `uTime` uniform.
   - Conduits get a world-z pulse that flows toward the fortress.
   - Red beacon cubes (`Fortress._skyline`) blink on a per-vertex hash.
   - Windows get a slow flicker.
   - Encode the animation class in a spare vertex attribute. One material, zero extra draws.
4. **Re-hue the conduit.**
   - Break the 90-unit strip into 5-6 unit dashes with gain of 0.35 or less, tinted teal, amber or red per sector.
   - Reserve saturated cyan for player-owned signals: trim, drop-line and bolts.
5. **Fix classic muzzle glare.** In classic, scale the `Effects.muzzle` sprite size and light intensity to about 0.4x and spawn them 1.5 units ahead of the nose. Also cap muzzle flashes at one pooled light.
6. **Crossfade sector skies.**
   - Pre-bake the next preset's cubemap and environment map during the last 10 s of the previous sector.
   - Lerp fog colour and density, and sun, ambient and rim colours, over 2-3 s.
   - Swap the background while the camera is inside a transition structure (see Stage improvement 3).
7. **Texture the skyline and debris** with the existing hull material key, adding emissive window strips in the `neon` batch. The merged batches already exist, so there are zero extra draws.
8. **Move the HUD off the lane.** Move the TACTICAL box off the flight lane (top-centre under the boss bar, or stacked above FUEL/HULL). Raise HUD label sizes to at least 11 px.

---

## 2. Asset Design: 5.0

### What works

- **The player ship** (`Player.buildShip`) reads as a manufactured fighter in chase view (ship-chase crop from `s1-turret-chase`). It has a swept delta wing, twin nacelles with stacked nozzle rings, canted fins, a transmission-glass canopy, a slate hull with a fresnel rim, and red and green wingtip running lights.
- **Enemy fighters** (`Flyer`) have bevelled extruded keels, canopies, and intake and cooling machinery merged into cached geometry. Against the void, they read as crisp orange darts (interceptors crop from `s3-space-classic`), and they bank into their turns.
- **Turrets** have a dome on a turntable, an armoured collar, and a barrel sleeve with a muzzle ring. The eye charges before firing, and the heavy variant has twin barrels. In the gauntlet-turret crop it is one of the cleaner silhouettes in the game.
- **Telegraphs are built into the assets.** Silos open an iris hatch before launch, radar dishes rotate with a pulsing emitter, and mines blink faster as you close in.
- **The triangle budget is tiny (12-39k per frame).** Geometry is cached per kind (`mergeParts`), leaving plenty of headroom for silhouette detail.

### What fails

1. **The "giant robot boss" is not a robot.** `Boss._build` assembles a 16x9x11 box, a four-sided cone prow, two box buttresses, two cylinder pods with barrels, and two neon torus rings. In `s8-boss-classic` it reads as a flying brick inside hula hoops. Front-on in `s8-boss-chase`, it is a grey square with a pyramid. It has no head, torso, arms or legs, and no arm-mounted missile. The Zaxxon robot is the most recognisable asset in the original, and this is the biggest fidelity miss in the build.
2. **Fuel tanks and turrets look alike.** Both use `enemyHull` (worn brown-orange plate), both are squat round shapes, and both carry a glowing orange ring. At classic scale (about 20 px, bottom of `s1-opening-classic`) and at range in chase (turrets-far crop from `s2-guns-chase`), they are the same brown bollard. The fuel tank is the most-shot object in the game. It needs its own silhouette and a FUEL marking.
3. **Parts of the Zaxxon cast are missing or dormant.**
   - There are no parked enemy planes on the deck.
   - Wall-mounted guns never spawn: `Level._genFortress` hard-codes `onWall: false`.
   - Electric barriers exist only as the orange coolant gate, with no distinct emitter posts or arcing.
4. **The architecture is plain slabs.**
   - Barrier walls (`Fortress._wall`) are flat hull slabs with a hazard stripe: no coursing, piers, battlements, pipes or damage.
   - Arches (`Fortress._arch`) are a slab on two posts.
   - Space platforms (`Fortress._platform`) are a slab on a stick (platform crop from `s5-formation-modern`).
   - Trench walls carry only ribs and windows.
   - Since walls are the game's central obstacle, they deserve the most love and currently get the least.
5. **Space props are untextured black boxes** (see Graphics item 3).
6. **Pickups** (`Pickup`) share one form: an icosahedron core inside an octahedron shell. Only hue separates shield, spread, repair and fuel, which also fails colour-blind players.
7. **There are no destroyed states.** Every enemy vanishes into the same generic explosion. Pods simply turn invisible (`pod.group.visible = false`).
8. **Construction cost wastes budget that could buy detail.**
   - The player ship is **39 separate meshes, about 35 of them shadow casters**. Counting the shadow pass, that is roughly 70 draw submissions, a large share of the 207-call classic frame.
   - Each mine is 9 meshes (six unmerged spike meshes plus core, lamp and flash shell), even though `mergeParts` exists. A 12-mine field costs about 108 meshes.
   - Every enemy carries an **always-visible, zero-opacity additive flash shell with its own material** (`Enemy._addFlashShell`), wasting one draw per enemy per frame.

### Improvements, highest impact first

1. **Rebuild the Iron Sentinel as a Zaxxon-style robot.**
   - Body: armoured tapered torso; head with a single visor that becomes the core weak point (replacing `coreGroup`); shoulder cannons reusing the existing pods and their logic; two arms, the right one carrying a homing-missile launcher. The lower body stays half-sunk in an arena lift.
   - Merge static parts per material (hull, dark, neon, core), which comes to 8 draws or fewer, the same as today.
   - Animate with group rotations: head tracking, an arm raise that telegraphs the missile, and shoulder recoil.
   - When a pod dies, snap its arm to a sparking stump instead of hiding it.
2. **Give the fuel tank its own identity.**
   - A tall cylindrical drum with white and yellow bands in vertex colour, clearly unlike the turret's squat dome.
   - A canvas-painted "FUEL" decal texture (new `Textures.fuelDecal`, no binary assets) on two faces.
   - Keep the rotating orange band.
3. **Add the missing cast members.**
   - **Parked fighters:** reuse the `Drone` geometry, static, as one `InstancedMesh` per material. That is 1-2 draws for dozens of targets, placed on painted deck pads with taxi lines.
   - **Wall guns:** turn on `onWall` so turrets sit on trench walls and barrier tops.
   - **Electric barrier posts:** emitter posts with arcing sprites, visually distinct from the coolant gates.
4. **Add an architecture greeble kit to the existing batch keys.** Everything below goes into the `hull`, `dark`, `neon` and `hazard` batches, so there are zero extra draws per chunk:
   - `_wall`: course lines (thin dark boxes every 2.5 units), buttress piers every 8 units, a crenellated top edge, recessed panel insets and pipe runs.
   - `_arch`: truss bracing and underside lights.
   - `_platform`: railings, landing lights and a hangar hatch.
5. **Replace the space debris.** Swap the boxes for 3-4 cached hull fragments: a girder, a torn plate, a half-cylinder hull section and an antenna mast. Use the hull material with emissive torn edges in the neon batch. Draw them as one `InstancedMesh` with a vertex-shader tumble.
6. **Merge for budget.**
   - `Player.buildShip` per material comes to about 6 meshes. Turn off shadow casting on greebles thinner than 0.2 units.
   - Merge mine spikes into the core.
   - Set `flashMesh.visible = flash > 0` in `Enemy.update` and on boss pods.
   - This alone frees an estimated 80-150 draw submissions in busy scenes, which pays for everything else here.
7. **Add destroyed variants.**
   - Turrets and silos leave a cached scorched base with smoke for 2-3 s.
   - The radar dish topples over 0.6 s before removal.
   - The turret dome pops off as a debris instance.
8. **Shape-code the pickups:** a hex ring for shield, a triple chevron for spread, a cross for repair and a drum for fuel. Keep the colours as a secondary cue.

---

## 3. Stage Design: 4.5

### What works

- **The wall archetypes carry the right Zaxxon DNA.** `Level._wall` offers slot (altitude), notch (lateral), window (both), pillars (weave) and stagger (two-step altitude change). Each poses a different altimeter problem, and the HUD's amber band makes the safe gap readable.
- **Moving coolant gates and arches add rhythm.** Gates on a 2.6-4.4 s cycle and low-clearance arches create timing and low-flying beats.
- **The opening run is authored well** (`Level._openingRun`). It teaches fuel, a lone turret, a forgiving slot, a radar tower and then fighters, in that order. The fuel lane before each sector end is a good breather.
- **The boss barrage rhymes with the walls.** The Sentinel's sweep curtain with exactly one gap (`Boss._sweep`) is a smart callback to the wall gaps.
- **One frame feels like a place.** The canyon in `s6-citadel-chase`, with its hazard-lit slot and distant battlements, is the pack's only frame with a genuine sense of place, and it shows what the other sectors lack.

### What fails

1. **Eight names, three templates.**
   - Every fortress sector is built by the same `_deck`, `_trenchWalls` and `_skyline` calls. The only per-sector geometry difference is the runway-dash colour (`sector.index === 3 ? ... : sector.index >= 5 ? ...`).
   - Apart from HUD text, `s1-opening-modern` and `s2-guns-chase` are the same place. `s4-reactor-modern` differs only in sky preset.
   - The sector names promise things the geometry never delivers. "REACTOR SPINE / THERMAL EXHAUST TRENCH" has no reactor and no exhaust. "GUN BATTERIES" has no batteries beyond the ordinary turrets. "INNER CITADEL" has no citadel. The `rhythm` strings only ever appear as card text.
2. **The space sectors are empty and interchangeable.**
   - They consist of fighter wings, gun platforms, mines and black-box debris rings in a void.
   - Nothing marks the location and nothing needs to be navigated.
   - The two space sectors differ only in their `spaceWeights`. In classic view they are black (`s3-space-classic`).
3. **There are no authored transitions.**
   - Fortress geometry stops at a 96-unit chunk boundary and the void begins. The void then stops and the next fortress deck begins.
   - The sky hard-cuts at the same moment.
   - Zaxxon's signature beats, flying over the fortress wall into the fortress and leaving it for space, have no moment.
4. **The boss arena is a flat slab.** It is an 84-wide blue deck with red lines and a few buttresses (`Fortress._arena`, `s8-boss-*`). There is no scale reference, no reveal, and no destination chamber. The boss simply switches on at 220 units.
5. **Pacing is thin and front-loaded with dead air.**
   - The first 980 units of sector 1, about 25 s at the 0.9x launch pace, hold only 6 authored objects.
   - Live enemy counts across the pack are 1, 2, 1, 1, 3, 9, 4, 5, 2, 3, 12, 7, 9 (median about 4, often 1-2).
   - The campaign is about 11.2 km, roughly 4.5-5 minutes at cruise speed.
6. **Classic composition wastes half the screen.** The lane is a diagonal band and 50% or more of each classic frame is empty abyss.

### Improvements, highest impact first

1. **Build per-sector set-dressing kits.**
   - In `Fortress._buildChunk`, dispatch on `sector.index` to a kit function that writes into the existing batch keys. This adds zero draws; triangles cost almost nothing at 12-39k per frame.
   - **S1 Outer Fortress:** a crenellated perimeter wall at sector entry, searchlight towers (one shared additive cone mesh swept in the vertex shader) and parked-fighter pads.
   - **S2 Gun Batteries:** colossal static artillery pieces in the skyline with barrels aimed skyward, ammunition depots built from clustered fuel drums, and harmless flak puffs high overhead from a cheap particle burst every 1-2 s.
   - **S4 Reactor Spine:** amber-glowing reactor domes set into the trench walls, cooling towers venting steam particles, and the conduit re-hued amber.
   - **S6 Inner Citadel:** trench walls pulled in to about ±20 to form a canyon, overhead bridges (arches with gaps) and towers crowding the lane.
   - **S7 Gauntlet:** red alarm strobes (the animated neon from Graphics improvement 3), with gates and walls chained into authored combinations.
2. **Give the space sectors landmarks and something to navigate.**
   - **S3:** the lane runs along, then through, a wrecked capital ship hull (one merged mesh, textured with the hull material).
   - **S5:** an enemy carrier whose bay launches the interceptor wings.
   - Both: instanced wreck fields with openings to weave through, the flight grid (Graphics improvement 2), and dust streaks for a sense of speed.
3. **Author three transition set pieces.**
   - **Fortress exit:** the deck ends in a cliff with visible underside structure, edge lights and a launch ring.
   - **Fortress entry:** the next fortress's outer wall rises from the void with an electric barrier across its top that you fly under. This is the Zaxxon moment.
   - **Boss reveal:** the robot rises from a hangar lift.
   - Hide the sky crossfade and sector card inside these moments.
4. **Mix authored encounter phrases into the RNG.** Examples: a slot wall followed by a turret pair behind it and a fuel reward; a gate with drones timed to its cycle; a window wall with a radar tower just behind it (shoot through the gap). These replace independent weighted rolls with short risk-and-reward sentences.
5. **Raise mid-sector density.** Aim for 3-6 live targets at all times on deck sectors using parked fighters, fuel depots and wall guns, so that x4-x8 chains are a normal skill outcome rather than an accident. Trim the sector-1 dead air to about 12 s.
6. **Give the boss arena a destination.** Add pylons that the sweep curtain visibly emanates from, destructible side generators (score, plus a wider flanking lane) and a visible core chamber at the far end.

---

## 4. Sound FX: 5.5 (judged from source, not audition)

### What works

- **The bus architecture is clean** (`Audio.init`). SFX and music buses feed a compressor, then a pause low-pass (swept on pause), then the master. A synthesised stereo convolution hall provides reverb. `panFor` gives stereo placement from world X.
- **The explosion recipe is properly layered** (`Audio.explosion`). A low-pass-swept noise body, a pitched sine sub drop and a high-pass crackle tail all scale with size, and a per-size throttle keeps them from stacking into mush.
- **Weapons have clear identities.**
  - Player laser: a sawtooth plus a detuned square through a descending band-pass, bright and short.
  - Enemy shot: deliberately duller and lower, so it reads as "theirs".
  - Shield hit: inharmonic sine partials, a genuinely distinct metallic ring.
- **The engine drone is live.** A noise rumble plus two detuned saws, with throttle and boost driving pitch and filter every frame (`setEngine`).
- **The music scheduler is well built.** It uses a lookahead scheduler with stale-note skipping after tab suspension. The score is intensity-layered: hats above 0.25, arpeggio above 0.35, extra kicks above 0.7 and lead stabs above 0.8. Kill chains raise the intensity, and there are separate menu and boss moods. The pickup arpeggio climbs with kills, and the chain tick climbs with the multiplier.

### What fails

1. **One loop for the whole campaign.**
   - `_playStep` is a single 4-bar pattern (progression `[0, 5, 3, -2]`) at a fixed 132 BPM in A minor for every fortress and space sector.
   - The boss mood changes only the chord roots and the bass waveform.
   - There are no sections, fills, key changes, breakdowns or per-sector themes.
   - There is no victory or game-over music: `stopMusic()` just cuts to silence.
2. **There is no ducking.** Music and SFX share one compressor (threshold −14, ratio 8). Explosions pump the entire mix instead of carving out space, and there is no limiter.
3. **There is no distance model.** A turret 75 units ahead fires at the same loudness and brightness as one beside you; only X panning varies. Missiles get a launch whoosh but no in-flight or approach sound.
4. **Many gameplay events have no sound, or borrow a menu sound.**
   - Barrel roll plays `ui('confirm')`, a menu blip.
   - Overheat plays `ui('back')`.
   - `heavyShot` is never called.
   - `Mine` sets `_warned` and nothing happens, so there is no arming beep.
   - Low fuel is HUD-only (`fuelLow` class), with no warning tone.
   - A fuel-tank kill plays only the pickup arpeggio, with no ignition.
   - Radar destruction and the phase-2 core opening both reuse the generic `sting`, which is also the sector-entry sound.
   - These have no sound at all: flying through a wall gap or arch, near misses, the force-field hum, enemy fly-bys, a cue for matching a target's altitude, and any boss servo, charge or lock sounds.
5. **Voices get starved.**
   - `enemyShot` uses one global throttle key (`'eshot'`, 50 ms). A 14-26 bullet boss spiral, or three turrets firing together, collapses into a single blip.
   - The laser fires 8.7 times per second at a fixed pitch with `pan = 0`, even though the muzzles alternate sides (`Player._fire`). That invites listener fatigue.
6. **One room for every space.** A single 2.4 s hall serves fortress, space and arena alike, and music sends to it at the same level as SFX, which muddies the low end in combat.
7. **Only white noise is used.** There is no pink or brown noise and no waveshaper drive, so big impacts lack weight.

### Improvements, highest impact first

1. **Build a music arrangement system.**
   - A per-sector song table: `{bpm, root, progression, bass pattern, arpeggio pattern, drum kit}`.
   - 16-bar phrases with A and B sections and a fill on each phrase end.
   - Space sectors in half-time with open pads. Ember sectors in Phrygian with toms. The Gauntlet 4 BPM faster.
   - A boss ostinato riff.
   - A drum fill plus key change under each sector sting, and short victory, defeat and sector-clear jingles.
2. **Fix the mix bus.**
   - Give music its own compressor.
   - Add a duck `GainNode` on `musicBus` that drops 6-9 dB on explosions, hull hits and boss events (about 30 ms attack, 300 ms release).
   - Put a `tanh` waveshaper soft limiter on the master.
3. **Add a distance model.** Scale gain by `1/(1 + dz/40)` and low-pass from 12 kHz down to 2.5 kHz over 120 units. Give homing missiles a looping filtered-noise voice whose pitch rises as they close in, and cut it on kill.
4. **Fill the event gaps with dedicated voices.**
   - A panned noise whoosh for the roll that sweeps in the direction of `rollDir`.
   - A steam hiss and falling tone for overheat, and a click when the weapon has cooled.
   - A low-fuel beeper that escalates at 25% and again at 10%.
   - A wall or arch pass whoosh pitched by clearance, where a tight pass sounds brighter.
   - A force-field hum loop scaled by proximity, crackling when close.
   - Mine arming beeps (wire up `_warned`).
   - A Doppler fly-by as fighters pass.
   - Radar power-down: a descending FM sweep and a burst of static.
   - A fuel-tank "whoomp" on ignition.
   - For the boss: pod charge whine, shutter servo clanks, a core-exposed hum and a missile lock tone.
5. **Add an altitude-match tick.** When `AltitudeEcho` reports a matched target in your lane, play a soft two-note tick (throttled). This puts the core Zaxxon mechanic into the ears.
6. **Manage voices per source.**
   - Separate throttle keys for turret, heavy turret, fighter and boss.
   - Randomise pitch by ±4% on every repeating SFX.
   - Make the laser pan follow `muzzleSide`.
   - Give the boss curtain barrage one dedicated sweep sound.
7. **Use one reverb per environment.** Cache three impulses from `_impulse`: fortress (0.9 s, bright), space (3.5 s, dark) and boss hall. Swap them on sector entry and lower the music's reverb send.
8. **Add weight to the noise.** Use pink or brown noise buffers for rumble and explosions, and add mild waveshaper drive on explosions of size 1.5 or more.

---

## 5. Fun Factor: 6.0

### What works

- **The core loop is authentic and fair.**
  - Guns fire level, so lane and altitude alignment is the skill, and reading the shadow matters.
  - Fuel must be shot, and ramming it hurts.
  - **Killing a radar tower blinds enemy lead prediction for 22 s** (`Game._killEnemy`, `radarJamTimer`). That is excellent Zaxxon-spirited risk and reward.
- **The systems stack well.**
  - An x8 chain multiplier on a 3 s timer.
  - Weapon heat versus a roll that vents heat and grants invulnerability.
  - A boost that costs fuel.
  - Shields that absorb projectiles but not terrain.
  - Spread, shield and repair drops from heavy turrets and silos.
- **The boss uses different vulnerability rules per phase.** Phase 1: armoured, pods only. Phase 2: the core cycles open and shut. Phase 3: the core stays exposed while escorts arrive. The one-gap barrage asks you to read the curtain like a wall.
- **Telegraphs are fair.** The turret eye charges, the silo hatch opens, mines blink faster, and first-shot timers are deterministic.
- **Impact feedback is present.** Hit-stop, trauma shake, rumble, and floaters such as `+1,000`, `+FUEL` and `POD DESTROYED`.

### What fails

1. **The run just ends at the boss.**
   - After `Boss._die`, `Boss._updateDeath` calls `Game._bossGone`, which starts the ending countdown and then calls `_finish(true)`.
   - `Game._nextLoop`, which implements the "endless score attack" that `Level` documents, is reachable only if the player overshoots the level with no boss present. In normal play it is dead code.
   - After about 5 minutes there is nothing left to chase but a score table.
2. **Encounters are sparse and repetitive.** The median is about 4 live enemies. The roster is 8 kinds, and fighters use one of 3 patterns (weave, dive, strafe). Many frames hold a single turret (`s1-opening-classic`, `s1-turret-chase`).
3. **Payoffs are modest.**
   - A fighter death is 18 fireball particles, 22 sparks, 8 smoke puffs and a 0.3 s ring that half-buries itself in the deck (`explosion-modern`).
   - There are no chain reactions, no persistent scars, and fuel kills make no boom.
   - The radar jam, the best reward in the game, is communicated mostly by a text line and a green ring.
4. **The central skill earns no score.** Nothing rewards threading a gap tightly, flying low under an arch, or grazing enemy fire. Walls are simply pass or fail, with a hull penalty on failure.
5. **The boss lacks spectacle.** Pods disappear rather than break. The arena never reacts. The "robot" is a box (see Asset Design).
6. **Replay hooks are thin.**
   - The seed is random each run: no daily seed and no shareable seed code.
   - There are no sector grades, medals or per-sector statistics on the results screen (`results`).
   - There are no extra-hull score thresholds and no unlocks.
7. **Space sectors play as "shoot orange things in the dark."** There is no navigation or terrain problem to solve.

### Improvements, highest impact first

1. **Continue past the Sentinel.** After the victory tally, offer "LOOP 2: THREAT ESCALATED" with banked score and hull, wiring up the existing `_nextLoop`. Also offer "END RUN" for a clean submit. Zero GPU cost.
2. **Score the altitude skill.** All of these feed the chain, and all use data `Game._updateHud` already computes:
   - A **THREAD** bonus scaled by how little clearance you had in a gap (from the `hazard` band).
   - An **UNDER-ARCH** bonus for low flying.
   - A **GRAZE** meter for enemy bolts that pass within about 2 units.
   - A **CLEAN SECTOR** bonus for no wall scrapes.
3. **Grade each sector.** Award S, A, B or C from percent destroyed, damage taken and fuel efficiency, shown for 2 s over gameplay with a stinger. List per-sector grades on the results screen and persist the best grade per sector.
4. **Raise density and author phrases** (Stage improvements 4 and 5). Ground-clutter targets make x4-x8 chains a routine skill outcome.
5. **Add the Zaxxon missile duel.** In boss phase 3, the robot's arm launcher charges a homing missile. Hit it 6 times inside the charge window and it detonates in the robot's hand, dealing big damage and a stagger. Otherwise it launches, and you must roll to dodge.
6. **Make each kind of kill pay off differently.**
   - Fuel tanks: a fireball column plus secondary pops in adjacent tanks.
   - Radar: the dish topples, a green EMP ring spreads, and the power-down sound plays.
   - Turrets: the dome pops off.
   - Persistent instanced scorch decals on the deck.
   - About 40 ms of extra hit-stop on radar and heavy-turret kills.
7. **Add replay hooks.** A daily seed and a shareable seed code on the results screen, plus extra hull at 50,000 and 150,000 points.
8. **Give space something to solve.** Wreck fields with openings, and interceptor formations that cross the lane at coded altitudes, so the fights are about altitude reading rather than point-and-hold.

---

## Top 10 highest-impact changes

Ordered by expected score gain per unit of GPU cost. Gains are panel estimates against this baseline, assuming the change ships cleanly.

| # | Change | Expected gain | GPU cost |
| ---: | --- | --- | --- |
| 1 | **Draw-call recovery.** Merge `Player.buildShip` per material (39 meshes down to about 6). Merge mine spikes. Set `flashMesh.visible = flash > 0` for enemies and boss pods. Turn off shadows on sub-0.2-unit greebles. | Enables items 5-10; +0.1 Graphics | **Negative.** Frees an estimated 80-150 submissions in busy scenes. |
| 2 | **Replay and skill hooks.** Continue into Loop 2 through the dormant `_nextLoop`. Add THREAD, UNDER-ARCH, GRAZE and CLEAN SECTOR scoring. Add sector grades, a daily or shareable seed, and extra-hull thresholds. | Fun +1.0 | Zero |
| 3 | **Audio arrangement and mix.** Per-sector song table with 16-bar phrases, fills, stingers, and victory and defeat jingles. A music duck bus and master limiter. Distance gain and low-pass. | Sound +1.0 | Zero |
| 4 | **Audio event coverage.** Roll, overheat and cooled, low-fuel beeper, wall and arch whoosh, near miss, gate hum, mine arming, fighter fly-by, radar power-down, fuel "whoomp", the altitude-match tick, and boss servo, charge and lock. Per-source throttles and pitch variance. | Sound +0.7, Fun +0.3 | Zero |
| 5 | **Re-light and animate the fortress.** Lower metalness. Bake vertex ambient occlusion and edge light in `Batch.add`. Add a `uTime` patch to `neonVertex` for flowing conduits, blinking beacons and window flicker. Dash and re-hue the centre conduit. Reduce classic muzzle glare. | Graphics +0.7 | About zero. No new draws; trivial shader math. |
| 6 | **Robot Sentinel rebuild with the missile duel.** Torso, visor core, arm-mounted pods, and a missile arm with the 6-hit charge window. Arm stumps on pod death. | Assets +0.8, Fun +0.4, Stage +0.2 | About zero if merged per material (8 draws or fewer, same as today). |
| 7 | **Sector identity kits plus an architecture greeble kit,** merged into existing chunk batches: perimeter wall and searchlights, artillery skyline, reactor domes and steam, citadel canyon and bridges, gauntlet strobes, and wall, arch and platform detail. | Stage +1.0, Graphics +0.3, Assets +0.4 | Very low. Zero extra draws, about 10-20k extra triangles, plus a small steam and flak particle share. |
| 8 | **The Zaxxon cast.** A FUEL drum with a procedural decal. Parked fighters as one `InstancedMesh`. Wall guns via `onWall`. Electric barrier posts. Shape-coded pickups. | Assets +0.6, Fun +0.3 | Low, +2-4 draws. |
| 9 | **The space pass.** Classic backdrop (nebula plane and `Points` stars). A holographic flight grid that receives the shadow. Textured, instanced, tumbling wreckage. One landmark per space sector (derelict hull, carrier). | Graphics +0.4, Stage +0.5, Assets +0.3 | Low, +3-5 draws. One large low-cost plane of overdraw. |
| 10 | **Destruction and transitions.** Per-type deaths, instanced scorch decals and wreck bases, and smoke columns. Authored fortress-exit, fortress-entry and boss-lift set pieces, with the sky crossfade hidden inside them. | Fun +0.3, Stage +0.5, Graphics +0.2 | Low, +2-3 draws. Particles stay within the existing `particleBudget`. |

**Plausible ceiling for round 2 if all ten land:** Graphics about 7.3, Asset design about 7.0, Stage design about 6.8, Sound FX about 7.5, Fun factor about 7.4. Reaching 8 or more in any category will also need motion evidence: a captured clip or a frame sequence, plus an audio render for audition, because round 2 cannot score animation timing or sound quality from stills and source alone.
