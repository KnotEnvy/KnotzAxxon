# Environment queue — status after the authored environment kit

**Updated 2026-11-15 (Fable, Nitro).** The queue below was worked through as one kit:
see `ENVIRONMENT-KIT.md` for what was built, the contracts and the measurements. Status of
each item:

| # | Item | Status |
| --- | --- | --- |
| – | Reactor Spine follow-ups | **Done**: integrated into the streamer (prototype parity proved), near parapet authored (all fortress sectors). Hardware GPU frame time and shadow-pass cost remain unmeasured. |
| 1 | Outer Fortress / airfield | **Done**: hangar frontage, floodlit crest, control tower. +967 triangles per chunk. |
| 2 | Gun Batteries | **Done**: casemate armour, shell hoist, merlons and deflectors, fire-control director. +994. |
| 3 | Inner Citadel / Gauntlet | **Done**: tiers, fins, attic, portal, keep (+1,992); alarm ribs, shuttered slits, blast door, saw-tooth crest, siren tower (+1,496). Both take the gate housing. |
| 4 | Barriers | **Partly done by design**: coolant-gate housing (sectors 4, 6, 7), electric-fence pylons, debris gates (11.2k → 5.1k triangles, no per-rock geometry built at chunk time). **Not built, optional**: barrier-wall panelling and arch soffits — the walls are the central gameplay read and were left exactly as authored. |
| 5 | Platforms / rings / trusses | **Done**: platform body, lattice truss. Debris rings **deliberately unchanged** (templates looked crude at ring-rock size). |
| 6 | Sector-transition bulkheads | **Done**: ribs, corbel, catwalk, launch rails, launch pylons. |
| 7 | Boss arena | **Done, restrained**: piers, coil rings, near blocks, framed throat wall (+345 of a 5,000 budget). The core chamber stays open behind the Sentinel on purpose. |

Still owed by anyone accepting this for release: a human play session with the kit on,
hardware GPU captures / frame times, and the shadow-pass profile. Everything below this
line is the original measured queue, kept for its baselines.

---

## Original queue after Reactor Spine — measured (2026-11-15, SuperBeast)

Baseline: `baseline-queue.json`, produced by `measure-queue.mjs` (actual `Level` +
`Fortress._buildChunk` + `Batch`, seeds 1–24 × loops 0/1, all eight sectors, Fortress.js
`3db6ba57…`). CPU counts only. Scenery templates loaded through their own loaders:
cooling stack, cargo kit, covered fighter, fuel depot, flak gun, antenna, wreckage,
carrier. **Bunker, dreadnought and asteroid templates could not be loaded in Node**
(they live in `ImportedModels.js` behind Vite's `import.meta.env`), so `_bunker`,
`_dreadnought` and the asteroid share of `_voidProps` below are the procedural
fallback. None of the queue items is one of those three props.

At most two geometry builds at once. Order is the assignment's durable order.

## Per-sector baseline (triangles per 96 m chunk)

| # | Sector | Kind | mean | p95 | max | draws mean | High window (8 chunks) max |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | Outer Fortress | fortress | 8,126 | 11,056 | 13,348 | 8.1 | 80,168 |
| 1 | Gun Batteries | fortress | 7,987 | 10,788 | 13,172 | 8.4 | 75,620 |
| 2 | The Void Gap | space | 2,984 | 12,868 | 15,444 | 4.4 | 49,868 |
| 3 | Reactor Spine | fortress | 6,674 | 8,756 | 11,380 | 9.5 | 62,644 |
| 4 | Interceptor Screen | space | 3,290 | 12,596 | 17,206 | 5.5 | 55,631 |
| 5 | Inner Citadel | fortress | 6,444 | 8,476 | 11,000 | 9.1 | 65,526 |
| 6 | The Gauntlet | fortress | 6,491 | 8,532 | 10,168 | 8.8 | 62,396 |
| 7 | The Iron Sentinel | boss | 1,311 | 1,328 | 1,328 | 6.0 | 10,504 |

With the Reactor Spine kit installed, sector 3 measures mean 8,985 / p95 11,486 /
max 15,190 and a High-window maximum of 85,166 (`reactor-spine/initial/evidence/kit-cost.json`).
That is now the heaviest fortress window, so **later fortress sectors should not exceed
it**; Outer Fortress and Gun Batteries already sit at 76–80k before any kit.

## Architecture layers the queue will touch (triangles per chunk)

| Layer (source method) | Outer Fortress | Gun Batteries | Citadel | Gauntlet |
| --- | ---: | ---: | ---: | ---: |
| `_trenchWalls` (both sides) | 553 | 547 | 550 | 552 |
| `_wallDressing` (far wall) | 836 | 846 | 846 | 841 |
| `_deck` | 1,014 | 1,014 | 1,013 | 1,011 |
| `_skyline` | 1,879 | 3,163 (incl. flak 1,192) | 1,986 | 1,964 |
| `_deckProps` total | 3,756 | 2,295 | 1,801 | 1,972 |
| …of which approved props | covered fighters 1,904, fuel depot 589, crates 913 | crates 2,058 | antenna 589, crates 954 | antenna 580, crates 975 |

The far-wall layers are identical in every fortress sector (≈1,390 triangles per chunk
for trench walls + dressing). That is exactly what the Reactor Spine kit replaced, and
the same adapter shape (mirrored RNG, recorded parameters, composer after
`_sectorEdges`) transfers directly.

## Barrier and structure features (triangles per instance)

| Feature | Triangles | Buckets | Planned per sector (mean / max) |
| --- | ---: | --- | --- |
| Perimeter wall | 936–948 | hull, hazard, neon, dark | 1 / 1 in sectors 0, 3, 5 |
| Slot / stagger wall | 716–723 | hull, hazard, neon, dark | 0.3–0.9 / 3 |
| Window wall | 571–592 | hull, hazard, neon, dark | 0.5–0.6 / 2 |
| Notch wall | 609–615 | hull, hazard, neon, dark | 0.3–0.4 / 2 |
| Pillar wall | 702–777 (max 852) | hull, hazard, neon | 0.2–0.3 / 3 |
| Arch | 612 | hull, hazard, neon, dark | 0.1–0.6 / 3 |
| Electric fence | 1,003–1,013 (max 1,056) | dark, hull, neon + 1 force-field plane | 0.1–0.7 / 4 |
| Coolant gate (source) | 672 | dark, hull, neon + 2 planes + 2 posts | 1.5–2.4 / 5 in sectors 3, 5, 6 |
| **Debris gate** | **11,027–11,277 (max 13,200)** | rock, hull, neon | 0.9–1.3 / 3 in space |
| Debris ring | 1,413–1,418 (max 2,060) | rock, spin | 0.8–1.3 / 4 |
| Floating platform | 244 (pylon 292) | deck, dark, neon, paint | 1.4–4 / 8 |
| Sector-edge bulkhead | 384 per edge chunk | hull, hazard, neon | 2 edge chunks at each fortress/space boundary |
| Boss arena | 1,311 per chunk | deck, hull, dark, neon, paint, spin | 10 chunks |

## Queue

### 1. Outer Fortress / airfield architecture
Heaviest sector today (8,126 mean, 13,348 max) because of approved covered fighters and
the fuel depot. Budget: far-wall kit ≤ +2,000 triangles per chunk mean (less than
Reactor Spine), no added draws, High window ≤ 85k. Design direction: hangar frontage —
the far wall as a row of real hangar bays behind the hardstands, a control tower as the
single landmark, approach-light gantries outside the envelope. Reuse `RS_WallFrame`
piers/plinth/coping and `RS_ServiceBay` as the bay module; new parts only for the tower
and hangar doors. The opening sector must stay calm: no new emissive above the bloom
gate, nothing over the lane. Opening run and first perimeter wall are authored beats —
untouched.

### 2. Gun Batteries
`_skyline` is already 3,163 per chunk here (rooftop flak). Budget: ≤ +2,000 mean.
Direction: casemate wall — sloped armour bays, ammunition hoists, blast deflectors; the
flak emitters and their tracer directions are ambience contracts and stay where the RNG
puts them.

### 3. Inner Citadel / Gauntlet identity
Both at ≈6,450 mean, same headroom as Reactor Spine. Budget ≤ +2,500 mean each.
Citadel: command superstructure — tiered galleries, buttressed keep as the landmark.
Gauntlet: stripped, hostile — red alarm ribs, closed shutters, the same kit with fewer
openings (identity through restraint and the source strobes). Gates in both sectors can
take `RS_GateHousing` as is.

### 4. Barrier walls / gate frames / fences / arches / debris gates
The gameplay reads. Rules that held for the gate ornament apply to every one of them:
new geometry inside the source solids, hazard bands / guide lamps / gap markers and
their animation tuples unchanged, colliders untouched. Budget per barrier ≤ 1.5× its
source count (≈900–1,100 triangles), except:

* **Debris gates are the one place the queue should *reduce* cost.** ≈11k triangles each,
  from roughly 70–80 per-rock `IcosahedronGeometry` meshes (80 or 320 triangles) built at
  chunk time. A small set of startup rock templates at about 40–60 triangles — these
  rocks are 2.8–3.8 m and pass at speed — with the same seeded scales and tints would
  bring a gate to roughly 3–5k and remove the per-chunk geometry construction. The
  approved asteroid templates (384–480 triangles) are too heavy to reuse here. RNG draw
  order must be preserved with a discard sink, as the dreadnought integration does. This
  estimate is arithmetic from the source loop, not a measured prototype.
* Electric fence: the beam plane and arcs are the hazard; only pylons/insulators are
  candidates.

### 5. Floating platforms / debris rings / station trusses
Platforms are 244 triangles and carry a turret, a collider and a guide surface
(`batch.surfaces.push` at `y + 2.57`): the top face, footprint and surface record are
fixed; underside structure, thrusters and pylons are free. Budget ≤ 700 per platform
(up to 8 per sector). Debris rings must keep every piece outside the playfield box at
all rotation angles (source comment) and keep pivot/spin tuples. Station trusses are
distant (x 140–220): silhouette only, ≤ 600 per chunk.

### 6. Sector transition bulkheads
`_sectorEdges` is 384 triangles on two chunks per boundary and is seen in every rig as
the deck ends. Budget ≤ 2,500 per edge chunk (it is one chunk). Direction: a real
bulkhead lip — launch rails, lit cliff structure below the deck, the two existing launch
pylons as authored towers. The Reactor Spine kit's seam house already terminates the
crest trunk at these chunks; a bulkhead module should receive it.

### 7. Boss arena architecture
1,311 triangles per chunk, 6 draws, 10,504 in the whole High window — by far the
emptiest space in the game and the largest headroom. Budget ≤ +5,000 per chunk.
Constraints: the arena is 84 wide and the camera pulls back (`setFraming`), so near-side
structures stay low (the source keeps them at 3.2); the Sentinel holds station ahead of
the player and must never be occluded; the approach throat (`local < 240`) narrows by
design.

## Not for Blender conversion

Player and enemy bolts and halos, painted runway markings, the sky cubemap, nebula,
planet/rings and the underlay are shader/effect systems. They read correctly today and
gain nothing from mesh authoring; they stay procedural.

## Follow-ups owed on Reactor Spine itself

1. **Near parapet.** The near (−x) trench wall is still the source geometry. It is the
   closest structure to the Classic camera. Anything carved *inside* the source box
   (x −34..−27, y 0..3.2) cannot change occlusion, so a recessed top channel, hatch
   covers and inner-face panels are safe to add.
2. **Live GPU proof.** Blocked this session by the RELIC reservation (see the slice
   README). Classic/Modern/Chase WebGL captures with the real materials, bloom and fog
   are still owed before any art acceptance.
3. Shadow-pass cost of the added lit triangles is counted but not profiled.
