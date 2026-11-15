# Authored environment kit

The fortress architecture is no longer only boxes. One file,
`public/models/environment/environment-kit.glb`, holds 175 authored parts in 30 modules (6,262 template triangles, 456 KB).
The streamer stamps them into each chunk's existing material buckets, so the game gains
structure without gaining a material, a texture, an object or a draw call.

This document describes what changed, the rules it holds itself to, what was measured,
and what has not been proved.

## What the player sees

| Sector | Authored architecture |
| --- | --- |
| 1 Outer Fortress | Hangar frontage: piers and plinth, a railed gallery, hangar bays with half-open doors and an apron flood bar, a floodlit service crest, and a **control tower** once per sector. |
| 2 Gun Batteries | Casemate wall: a sloped armour skirt between the piers, sealed ammunition bays with a shell hoist climbing the wall, armour merlons and blast deflectors on the crest, and a **fire-control director** with a turning rangefinder. |
| 4 Reactor Spine | Thermal exhaust trench: coolant mains threaded through the piers, risers, a service gallery, cowled extractor fans, an exhaust trunk whose vents chase toward the core, gate pylons and the **containment bastion**. |
| 6 Inner Citadel | Command superstructure: two gallery tiers, flying fins from every pier to the crest, an attic storey with a lit command slot per bay, finials, a portal with a portcullis, and the **command keep**. |
| 7 The Gauntlet | Shut and hostile: red alarm strips up every pier, shuttered windows showing a slit of light, a sealed blast door, a saw-tooth crest with barbed masts, and the **siren tower**. |
| every fortress sector | The near parapet becomes a service channel with kerbs, hatches, a cable tray and cross ribs. Coolant gates in sectors 4, 6 and 7 get emitter collars, an open header girder and a static far pylon. Electric-fence pylons become octagonal columns with insulator drums. |
| deck ends | Where a deck meets open space the cliff gets buttress ribs, a corbel course, an inspection catwalk, two launch rails with chase lamps, and octagonal launch pylons. |
| open space | Floating platforms get a panelled deck edge, a chamfered skirt, round thruster nacelles and a tapered strut. Distant station trusses become open lattice girders. Debris gates are built from six rock templates. |
| 8 Iron Sentinel | The arena's far buttresses become piers with a battered foot, fins and a flared crown; coil plates become rings; near blocks are chamfered; the far throat wall is framed with ribs and bands. The core chamber stays open so the Sentinel keeps its silhouette. |

## How it works

* `src/world/EnvironmentKit.js` loads the GLB once at startup (through
  `loadImportedModels`), keeps one position+normal template per part, and releases
  everything the loader created. Bucket, tint, UV scale and emissive gain travel in the
  file as node extras, so there is no side-car JSON to fetch.
* `src/world/FortressKit.js` composes the far wall, the near parapet, the gate housing
  and the five landmarks from those templates.
* `src/world/Fortress.js` still makes **every seeded draw in source order**. Where the
  kit owns a picture the source calls write into a discard sink and their parameters are
  recorded (wall height, rib tuples, ledge, windows, bay, fans, sign, tower footprints,
  far-shoulder props). The composer runs after the last source draw and draws nothing
  from the chunk RNG.
* If the kit is not loaded, every caller takes the procedural source path.
  `?environmentKit=0` keeps the procedural world for comparison, and
  `?productionModels=0` disables the kit together with the other production models.

## Contracts (each one is a test in `tests/environment-kit.test.js`)

| Contract | How it is held |
| --- | --- |
| Source fallback is exact | With the kit absent, all 512 chunks of four seeded runs hash to the digests recorded from the pre-kit `Fortress.js` (`tests/fixtures/fortress-source-golden.json`, source `3db6ba57…`). |
| Seeded streams never move | With the kit present, every chunk's emitter records (each carries a fresh draw), guide surfaces, painted markings and deck are byte-identical to the source; in open space so are the chunk lights and hull; debris-gate plates and burning edges, drawn after the rocks, are identical. The level plan is identical. |
| Nothing new in the flight corridor | No triangle with a corner inside the corridor box (x ±17, y 0.3–26) exists with the kit that did not exist without it, in every fortress and boss chunk. |
| Nothing new on the far shoulder | Between the corridor and x 25.7 the kit adds nothing. Two declared exceptions: the two approved cooling stacks Reactor Spine reuses beside its bastion, and launch pylons re-cut inside their own source boxes. |
| Near parapet cannot hide more | Every new near-side triangle lies inside the source box x −34…−27, y 0…3.2. |
| Replacements fit inside the solids they replace | Gate ornament inside the source coil rings and lintel; fence pylon parts inside the source column, base, coil plate and glow box; platform parts inside the deck, skirt, strut and thruster boxes with the top face on the source plane; arena parts inside the buttress, coil and block solids; truss inside the 3 × 3 girder; rocks inside the source rock's reach. Bulkhead parts are all below y −1.35. |
| Gates still work | Source force-field planes, hazard posts, gap motion, runtime state, `animated` and `rearObstacles` entries are equal; emitter and chase-lamp animation tuples are the source tuples. |
| Fans keep their tuples | Every fan pivot/spin tuple with the kit is a source tuple. The only additions are one landmark spinner per sector (radar, rangefinder, beacon carrier), turning behind the wall line. |
| Cost | Added triangles per chunk are inside the per-sector budgets and draw objects never increase. |
| One owner | Chunk retirement releases every chunk geometry and no template; shutdown disposes each template exactly once; disposal is idempotent; the source streams again afterwards. |

Because the corridor, the far shoulder and the space above the lane are unchanged and
the near-side and gate changes are subsets of source solids, no line of sight from any
rig to a target in the corridor can be newly blocked. That is an argument from the tests
above, not a sampled ray audit; the Reactor Spine prototype's ray audit was not re-run on
the integrated build.

## Measured cost

`assets-source/environment/evidence/measure.json` — actual `Level` +
`Fortress._buildChunk`, seeds 1–24 × loops 0/1, with every scenery template that loads
in Node (bunker, dreadnought and asteroid templates load only in the browser and measure
as their procedural fallback). CPU counts only.

| # | Sector | mean src → kit | added | p95 kit | max kit | High window (8 chunks) src → kit | draws src → kit | upload KB src → kit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Outer Fortress | 8,126 → 9,093 | +967 | 12,038 | 14,218 | 76,760 → 84,796 | 8.14 → 8.14 | 1,187 → 1,320 |
| 2 | Gun Batteries | 7,987 → 8,981 | +994 | 11,726 | 14,154 | 75,620 → 83,866 | 8.43 → 8.43 | 1,171 → 1,307 |
| 3 | The Void Gap | 2,984 → 2,744 | -240 | 7,056 | 8,888 | 55,788 → 56,592 | 4.41 → 4.41 | 557 → 481 |
| 4 | Reactor Spine | 6,674 → 9,157 | +2,483 | 11,718 | 14,432 | 61,948 → 82,622 | 9.48 → 9.35 | 1,012 → 1,341 |
| 5 | Interceptor Screen | 3,290 → 3,147 | -143 | 6,811 | 10,010 | 61,681 → 56,323 | 5.47 → 5.47 | 556 → 509 |
| 6 | Inner Citadel | 6,444 → 8,436 | +1,992 | 10,838 | 13,748 | 65,526 → 82,286 | 9.15 → 9.07 | 979 → 1,247 |
| 7 | The Gauntlet | 6,491 → 7,987 | +1,496 | 10,386 | 13,530 | 62,396 → 76,170 | 8.83 → 8.74 | 985 → 1,185 |
| 8 | The Iron Sentinel | 1,311 → 1,656 | +345 | 1,730 | 1,730 | 29,388 → 35,268 | 6 → 6 | 231 → 275 |

Triangles per 96 m chunk. Chunk build time in Node (same harness, same run) moved by a factor of 1.16–1.41 in fortress sectors and 0.71 / 0.79 in the two space sectors; these timings were taken on a shared, busy machine and are indicative only.

Budgets were the queue's: at most +2,000 triangles per chunk in the two heaviest sectors,
+2,500 in Citadel and Gauntlet, +3,500 in Reactor Spine, +5,000 in the boss arena, no
added draws, and no fortress High window above the 85k Reactor Spine ceiling. Outer
Fortress and Gun Batteries were first measured at 88k and 92k; pier caps, fan stators,
window bezels, rail posts and the battery gallery were trimmed to bring them under.

| Feature | instances | triangles src (mean / max) | triangles kit (mean / max) |
| --- | ---: | ---: | ---: |
| Debris gate | 102 | 11,127 / 13,200 | 5,061 / 5,590 |
| Coolant gate | 268 | 700 / 700 | 2,362 / 2,362 |
| Electric fence | 74 | 1,014 / 1,058 | 1,558 / 1,602 |
| Perimeter wall | 144 | 944 / 948 | 944 / 948 |
| Slot wall | 130 | 721 / 732 | 721 / 732 |
| Stagger wall | 45 | 720 / 732 | 720 / 732 |
| Window wall | 104 | 582 / 600 | 582 / 600 |
| Notch wall | 91 | 612 / 624 | 612 / 624 |
| Pillar wall | 53 | 732 / 852 | 732 / 852 |
| Arch | 68 | 612 / 612 | 612 / 612 |

Barrier walls and arches are unchanged. A coolant gate's extra triangles are its emitter collars and open header girder (inside the source solids); a gate chunk also gains the static far pylon.

## Art decisions worth knowing

* **Debris gates** use templates; **debris rings** keep the eroded source rocks. Ring
  rocks are few, large and slow, and the faceted templates looked crude at that size.
* **Windows** keep their seeded size, warm flag and flicker tuple but sit in rows; a
  window that finds no free position is dropped. Cool panes are pale steel, not player
  cyan.
* **Things that yield** (pictures only): piers under bays, gate pylons, landmarks and
  far-shoulder props; fan pictures behind a gate pylon; bays and signs slide along the
  wall. Emitters never move.
* **Landmarks never crowd a gate.** If no clean position exists in the landmark chunk
  the landmark is omitted for that run.
* **Calm opening.** Outer Fortress adds only dim, steady light (flood bars, cab glazing,
  all below gain 0.65). The one bright addition is the control tower's small mast beacon,
  which matches the source's own obstruction strobes.
* **Barrier walls and arches are unchanged.** They are the game's central read and are
  already authored around hazard bands, guide lamps and gap markers.

## Evidence and limits

* Parity: `evidence/parity.json` (1,536 chunks kit-off vs the frozen source: 0
  mismatches). The Reactor Spine port was additionally proved byte-identical to the
  frozen prototype adapter on 228 chunks before the near parapet was added
  (`evidence/parity-reactor-port.json`).
* Kit file: `evidence/glb-audit.json` (stdlib binary parse of all 30 module GLBs),
  `evidence/reopen-kit.json` (saved blend reopened, each GLB reimported clean, counts and
  bounds equal).
* Editable sources: `assets-source/environment/` — generator, `environment-kit.blend`
  (one collection per module), module GLBs, world-scale composition scenes per sector with
  the shipped player and threats at scale 1 and the three source rig cameras.
* Visual review used the native Blender viewport through the Blender MCP bridge on actual
  streamed chunk geometry, and frames of the running game.
* **Game frames are software WebGL** (SwiftShader, headless Chromium). They show the real
  materials, normal maps, fog, bloom and shadows, but they are not hardware captures and
  say nothing about frame rate. GPU frame time and the shadow-pass cost of the added lit
  triangles are unmeasured.
* Human playtesting of the kit has not happened. The user authorized publication of the validated facelift; `?environmentKit=0` remains available for comparison. This is not a claim of a human play session on the new architecture.

## Regenerate

```bash
cd asset-work/environment-kit
./blender.sh --background --factory-startup -noaudio --python source/generate.py -- "$PWD"
cp runtime/environment-kit.glb ../../public/models/environment/
```

Blender 5.2.1 LTS, CPU only; about two seconds. Two runs give byte-identical files.
