# CARRIER — frozen INITIAL best effort

**Status: `pending_deferred_opus_review`. Not final acceptance.**
Authoring: **codex / gpt-6.1-sol / reasoningEffort xhigh / available speed**.
Native Linux Blender **5.2.1 LTS**, build **9e2066aef7ef**. Four render threads.
**0 formal reviews, 0 formal review/fix passes.** Required author self-checks,
export/tooling corrections, and evidence framing are not an Opus review.
Opus review and polish are deferred to the orchestrator on SuperBeast.

## Deliverables

- `carrier.blend`: packed, editable semantic meshes; no linked assets or image dependencies.
- `carrier.glb`: static full-landmark preview/source, six material primitives, no textures.
- `carrier-template.json` + `.bin`: non-indexed loader-owned runtime source, including effect attributes and named part ranges.
- `source/`: deterministic builder, current-source measurement, independent GLB parser, real-Batch CPU fixture, reopen/reimport and ray probes, offline evidence generator.
- `checks/`: actual measurements, not estimates or live GPU statistics.
- `evidence/`: thirteen labeled offline PNGs and source-rig/lighting metadata.
- `SHA256SUMS`: every content file other than itself. Archive/transfer receipt live outside this directory.

No production `src`, `public`, or `docs` files changed. No checkout, fetch,
reset, commit, branch, push, deployment, helper delegation, or Claude retry.
Only `asset-work/carrier/` is authored. No failed contest geometry was mined.

## Geometry and scale

Authored game axes: **X across, +Y up, +Z travel**. Author coordinates are
already at the source carrier's X/Y. Translate **only Z by
`sector.zStart + 160`**. Do not center or normalize this landmark.

- Full evaluated / GLB / clean reimport: **18,898 triangles**.
- GLB: **2,389,144 bytes**, **6 primitives / 6 materials**, zero images.
- Editable blend: **292 named mesh objects**, grouped into functional collections;
  these are authoring parts, **not** 292 runtime draws.
- Transformed rest bounds, local game: **[48, -26, 0] → [108.550003, 44.5, 987]**.
- Seed1 placement: **[48, -26, 6510] → [108.550003, 44.5, 7497]**.
- Main hull X center83, lower chine Y-26, flightdeck topY15.4, islandX94/Z420,
  beacon topY44.5. Outboard exchanger fins extend0.55 beyond source X108;
  the corridor-facing nearest X48 is unchanged. No corridor encroachment.
- Twenty-four actual chamfered apertures, centered at local Z132+32*i;
  typical mouth **24Z × 11.5Y**, recess about **15X** to backwall X73.5.
  Rays through all24 mouths reach X>=70; neighboring piers hit X58.
- Deck slots have actual lower floors Y14.94, about0.46 below deck, with
  vertical reveals. Channels are not black polygons over an intact deck.
- Two hollow, fitted stern bells terminate Z987 with blue cores aroundZ980.2.
  Centerline rays prove about6.8 units of visible recess. No particle exhaust.
- Continuous faceted bow/stern taper, deck cantilever webs, rails, inset seams,
  machinery, restrained amber headers and cyan interior depth guides.

The starting budget was justified before construction in `source/contract.json`:
24k target /36k ceiling whole, 3500 target /6000 ceiling per96, six merged
carrier buckets,4MiB GLB. Triangles were spent on openings and structure,
not a quota or a mass of disconnected boxes.

## Measured streaming cost

The original method was freshly executed with **real source Batch** at the
specified commit for seeds1/7/42/123. It is8492 triangles, max1352 perchunk,
six carrier buckets. **Fresh measurement finds12 affected indices67..78,
not the11 in the assignment summary**; both endpoint chunks are nonempty.

The new prototype partitions triangles at actual world96 boundaries, not by
repeating a full landmark. At start6510 it has **21,330 post-clip triangles
across12 unique modules**, max **3114 triangles /6 carrier buckets** in the
island chunk72. Core non-island chunks are roughly2.2–2.3k triangles.
Six additional placement phases were sampled; maximum was3142 triangles.
All eleven adjacent section boundaries match; zero zero-area triangles
remain after Float32 conversion. Full table is in `checks/runtime-fixture.json`.

Quality spans are actual requested chunk envelopes from source
`drawDistance + 90 behind`, not a claim that980 units are always visible:

| Quality | Ahead | Nominal span | Worst requested carrier chunks | Triangles | Bucket meshes |
|---|---:|---:|---:|---:|---:|
| Low |320|410|6|14,427|31|
| Medium |440|530|7|16,717|36|
| High |560|650|8|18,905|41|
| Ultra |700|790|10|20,652|51|

The source retains one chunk behind the first and two beyond the last
**only if already built**. Conservative retention-envelope maxima are
19,539 /20,652 /21,286 /21,330 triangles respectively. Forward+2 are
not eagerly built in monotonic play. Frustum, fog, camera angle, and GPU
visibility can reduce this. These are **CPU carrier-only geometry counts**,
not live draw-call/performance measurements. Existing `_voidProps` asteroids
can add their existing `rock` bucket to the overall scene; they are not
included in the six carrier-bucket claim.

## Runtime handoff

See `source/runtime-mapping.md`. `runtime_fixture.mjs` is a runnable,
streaming-compatible source prototype, **not production integration**.
It exercises actual source `Batch.merge`, preserving custom effects,
one mesh per used bucket, unique chunk buffers, source no-shadow/spin
culling rules, and material ownership. It never instantiates per-part
runtime GLTF roots or renders the entire980-unit geometry perchunk.

At preload, decode the loader-owned template once and prepare modules once
per distinct landmarkStart/chunk-grid phase. At chunk build, replay the
original carrier RNG consumption, append only this chunk's cached arrays to
the existing Batch, then continue the original `_voidProps`. Do **not** also
emit the old carrier decorations. No per-frame geometry rebuild.

**Static GLB alone is insufficient.** Its six primitives are preview/source
geometry. CPU source binary and part metadata reconstruct `aAnim`, `aPivot`,
`aSpin`, world-space pivots and world-Z phases; shared source Materials clock
does the motion. CPU shader-patch/uniform tests are present, but no WebGL
shader compilation or production frame has been claimed.

## Gameplay boundary

This is scenery. Corridor ±16, altitude1.3..25, collision, cover, targeting,
entity lifecycles, existing launch flags/origins and camera rigs are unchanged.
**Damage / detachment / retraction / new doors / new launch mechanics: N/A.**

`Level._genSpace` marks wings launched in sector4 within the existing carrier
interval. `Enemies.Flyer` starts at X56..60,Y0..6 and the feature's unsnapped Z,
then damps toward homeX/homeY at1.4 and advances with source speed factors.
No mesh socket, door timing or bay selection exists. Therefore a launch can
visually intersect an authored pier, just as the source is not aperture-aware.
This initial preserves that relationship rather than moving an origin or
inventing launch mechanics. Player scale props in craft renders are explicitly
**not** new spawn positions or animated craft.

## Evidence and limitations

Every PNG is **OFFLINE Blender EEVEE** and carries an added56px label header;
the original camera viewport underneath is not resized/cropped. Source-rig
shots are steady zero-boost/zero-trauma Classic, Modern and Chase at local
player[0,13,300], with the shipped `public/models/player.glb` at exact scale1.
Only the high-quality source-requested cached modules are present in those
shots. The player and carrier are never separately normalized.

Camera offsets/projections are independently compared against actual current
CameraRig.snap/FlightCamera at five world points per rig (error<1e-5 viewport).
The headless source-camera check uses an in-memory empty settings store, not
the user's stored preferences. Void sun color,
intensity/direction and cyan rim are source based. A World approximates the
hemisphere, craft views add a presentation fill, and **AgX is not game ACES**.
No source PMREM, procedural texture forge, nebula, fog, bloom, HUD, collision,
combat, live shader compiler, draw profiler, mobile/portrait sweep, or playable
integration is demonstrated. In particular the offline untextured steel can
be brighter/smoother than mapped/tinted source darkMetal and spinMetal.

Radar/strobe/chase/breathe probes are CPU reconstructions of source shader
math. Local authored effect phase is shown in close probes; runtime subtracts
landmarkStart/period. No glTF animation or door/craft motion is fabricated.
Source strobe, chase and breathe gain ranges and radar's full sampled sweep
are recorded independently of the static GLB. All evidence groups were opened
with the image tool by the builder; this is required self-checking, not formal
review/acceptance.

Selected player/sentinel/turret/radar/silo/fuel GLBs were independently parsed
and rendered at common world scale1; their current source craft/manifests and
helpers were read. The gallery contains only translations. Their binaries are
not repackaged. Sentinel's source audit records240 pre-existing zero-area
triangles; the new carrier has zero. Scope reuse is limited to those visual
references, source contracts, and the authorized native Linux runtime wrapper;
carrier geometry/generator are newly authored here.

## Reproduction

Use the existing native Blender/sysroot outside this frozen directory. Runtime
tools/libraries/caches are intentionally absent from the transfer archive.
Run in a **new writable copy**, not this immutable `initial`:

1. Point `CARRIER_THREE_ROOT` to the existing Three.js0.185.1 package.
2. `node --experimental-loader ./source/resolve.mjs ./source/measure_source.mjs`
   from an equivalent project/asset directory, or adjust root location explicitly.
3. Native Linux Blender `-b -t 4 --python source/build_carrier.py`.
4. `python3 source/glb_audit.py carrier.glb --out checks/glb-independent.json`.
5. `CARRIER_FIXTURE_WORK=<asset-root>/work/modules node --experimental-loader
   ./source/resolve.mjs ./source/runtime_fixture.mjs`.
6. Native Blender `-b -t 4 --python source/verify_blender.py`, then
   `--python source/render_evidence.py`; `python3 source/label_pngs.py`.

Builder geometry is deterministic; software build/compression/file metadata
may prevent byte-identical Blender resaves. Frozen hashes identify this exact
initial, and should be checked before any receiver-side work. Receiver-side
verification and future review/polish belong to the orchestrator.
