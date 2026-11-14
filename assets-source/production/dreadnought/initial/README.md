# Derelict dreadnought — frozen initial delivery

Status: **pending_deferred_opus_review**. Initial best effort only. **0 formal
reviews / 0 formal review-driven fix passes**. No final acceptance is claimed.
Built by Codex / `gpt-6.1-sol`, reasoning effort `xhigh`, available/default speed
(no separate speed override). Native Linux Blender **5.2.1 LTS**, build
`9e2066aef7ef`; EEVEE evidence, four render threads. No helper delegates.

## Files and scope

- `asset/dreadnought.blend`: editable, self-contained section meshes, vertex
  palettes, per-vertex cue/provenance attributes, named hierarchy and extras.
- `asset/dreadnought.glb`: world-scale, Y-up / +Z-travel GLB, no texture files.
- `asset/module-map.json`: every named construction part, material bucket,
  section membership, cue tuple, and source/runtime mapping.
- `source/`: deterministic geometry generator, independent GLB parser, actual
  Batch CPU prototype, source RNG audit, saved-file/reimport audit and renders.
- `checks/`: machine-readable measurements, clearance/seams and lifecycle tests.
- `evidence/`: offline overview, bow, real breach/ribs, far bridge, recessed
  engines, broken gun-ring, source Classic/Modern/Chase and altitude/cue probes.

Only this assigned asset directory is changed. No production `src`, `public`,
`docs`, gameplay, build configuration, commits, checkouts or deployments.
Source baseline: `ee221ad3e05cd66292fe02b71b50f513696bdda2`.

## Design and reference use

A single extremely long warship fits the original 820-by-64 silhouette instead
of shrinking it into a normal ship. Its low knife bow, armored keel, fitted deck
panels and overlapping flank belt connect the surviving sections. Three actual
open deck/near-flank breaches expose transverse frames, lower crossbraces,
longitudinal stringers, service mains and accumulator drums. The bottom keel and
far-side armor remain continuous. Torn plate tips are geometry, not black decals.
Seven empty, damaged gun rings have broken feed/trunnion fragments; no barrels,
aiming, projectile, damage, destruction, detach or retraction mechanism exists.
Two recessed double-wall engine bells have very dim blue remnants. Sparse amber
embers and one tiny degraded bridge strobe remain scenery, not live weapons.

The singular far-side ruined bridge replaces random per-chunk tower repetitions;
its open roof and window reveals are geometric. It stays on positive X beyond
the lane. Most windows are dark tinted geometry in the dark bucket, not lamps.
The original repeated neon armor seams are replaced by actual plate joints.
Intentional graphic changes do not change collision or aiming rules.

Read current Fortress/Level/CameraRig/Materials/ImportedModels sources and the
shipped fighter/sentinel/ground/supplies authoring conventions. Independently
decoded all six selected shipped GLBs. Reference use is **visual vocabulary and
axis/scale contract only**: low-poly fitted armor, muted metal, restrained cues.
No source reference geometry is incorporated into this landmark. The shipped
player is imported unchanged at scale 1 only into offline evidence scenes; it is
not included in the deliverable GLB/blend. No old failed contest models or
generators were used. Existing Blender wrapper/sysroot and an existing Three.js
package are tooling only, not archived dependencies.

## Measurements and budget

Actual GLB: **16,698 evaluated/exported triangles**, **3,378,628 bytes**
(3.222 MiB), three shared materials, zero textures. **28 primitives total across
the entire 10-section GLB**, not 28 runtime draws per active chunk. Current
world chunks 35–44 produce at most **3 merged landmark meshes per chunk**.
Global section 44 contains only the 5-unit engine overhang after Z4224; the
original method owned the same overhang from its preceding chunk. This adapter
explicitly schedules that final section even though the source body ends Z4220.

Raw authored topology is 13,426 triangles; exact 96-unit section clipping adds
3,272 triangles. No LOD or hidden duplicate geometry is used. Worst current
96-unit chunk is stern section 43: **2,939 triangles**; engine overflow section
44 is **608**. Bridge sections 41/42 are **2,279 / 2,102**. All current chunks
are below the 3,500 target and 5,000 ceiling. Whole asset is below 24k target /
32k ceiling and 4 MiB GLB ceiling. This deliberately stops below budget rather
than adding low-value greebles. Section and visible/resident totals are in the
fixture report, including all material primitives.

Truthful transformed game rest bounds:
`[-26.057600,-41.000000,3400.000000]` to
`[38.057598,12.835903,4229.000000]`.
Body start 3400, body end 4220, main deck around -15, main bottom -41, center X6.
The small mast/strobe accounts for maximum Y; all high geometry is outside the
lane. A conservative triangle-AABB test finds zero intersections with the full
X[-16,16], Y[1.3,25], infinite-Z gameplay prism. That is geometric evidence,
not a claim to have run the game collision/targeting system.

Actual source Batch measurements for seeds 1,7,42,123 are respectively
9,384 / 9,528 / 9,588 / 9,264 triangles; maximum source chunk 1,176, three
landmark buckets. Source high-Y varies: 14.441749 / 12.136456 / 15.118981 /
13.025876. These are four true seeds, not a claimed exhaustive RNG envelope.
The authored bridge is deterministic; game seeds still advance identically.

## Concrete streaming adapter contract (not production integration)

`source/runtime_fixture.mjs` exports `loadTemplate` and `appendDreadnought` and
uses the **actual current Batch._vertex and Batch.merge** implementation, not
an invented merge substitute. It makes chunk-owned geometry only at build time,
never per frame. No GLTF scene subtree is attached to runtime chunks.

1. Load the GLB once. Keep its geometries/materials/textures loader-owned until
   shutdown. Traverse nodes and apply the complete world transform, including
   `DN_SECTION_0035__Z3360` etc. Parent transforms are real, not accessor bounds.
2. Map `DN_hull -> materials.hull`, `DN_dark -> materials.darkMetal`,
   `DN_neon -> materials.neonVertex` via Fortress's existing `_matFor`.
   **Do not use ImportedModels.instantiate's root/material cloning path.**
3. Retain position, normal, box-projected UV and `COLOR_0`. The `_ANIM` VEC3
   export is a transport attribute, **not automatic custom-shader support**.
   Copy it per emitted vertex to Batch's `aAnim=(mode,rate,phase)` neon stream.
   `_PART` indexes named construction records; `_FACE` records original source
   triangles for exact clipping seam audits. These two attributes are authoring
   provenance and need not be uploaded into final runtime chunk meshes.
4. At chunk build, select only modules whose transformed Z range intersects
   `[z0,z0+96]`. Current pre-cut sections avoid whole-ship work; a runtime spatial
   module index can replace this fixture's small 28-record metadata scan. The
   fixture does **not** traverse or emit the other 820 units for every chunk.
   Current campaign offset is `sector.zStart-3200`. Non-aligned offsets are
   supported by interpolating attributes at the two clipping planes. Aligned
   offsets already have exact cut boundaries. No whole-landmark per-chunk draw.
5. Append to the same batch as original `_voidProps`; merge once after all
   decorations. No per-part draws, extra VFX draws or duplicate original hull,
   bridge, turret stumps or engines. Leave ordinary `_voidProps` asteroids,
   wreckage and station trusses untouched. Their existing `rock`/spin bucket is
   outside this asset's three-bucket budget and must not be removed.
6. Only chunk-created merged geometry is disposed at retirement. Never dispose
   template geometry or shared materials/textures then. Fixture confirms 28
   unique chunk geometries disposed, zero template/material disposals before
   shutdown; shutdown disposes 28 templates and three fixture shared materials.
   Those three fixture materials are stand-ins for CPU-only testing, not a
   second proposed material library.

The fixture streams 10 correct sections, tests shifted sector starts 3217/3288,
and reconstructs neon cues in the final merged geometry. It has no spin geometry:
`aPivot/aSpin` are **N/A for this static landmark**. Existing unrelated rocks
continue to receive original pivot/spin attributes and source `uSpinTime` clock.
Keep `Materials.clock` identity shared: `materials.neonVertex` injects
`uLightTime` and `lightGain(aAnim,time)`; do not create per-landmark clocks.
Flicker=4 at 0.7/0.8/0.9 Hz; strobe=1 at 0.5 Hz; engine breathe=3 at 0.2 Hz,
opposite 0/0.5 phase. CPU probe samples all authored cues over 20 seconds at
60 Hz using the source formula. It does not prove WebGL shader compilation.

## Exact RNG preservation

Call `burnOriginalDreadnought(rng,z0,sector)` **at the exact original call site**,
before any subsequent `_voidProps` RNG use. The authored geometry/cues consume
zero game RNG draws. The burner reproduces the original 12-unit loop, breach
phase draw, short-circuit window/lit draws, conditional tower position/height/
four window draws/beacon phase, and both stump loops with all 6 fragment draws
per fragment plus ember phase. End engine geometry consumes no RNG.

Its early return depends on original 820-unit body intersection, **not** the
new overflow module. The overflow chunk burns zero source draws and still emits
its clipped static engine geometry. Do not use a fixed skip count: source branch
outcomes change draw count. The actual source and burner final states match for
**1,408 seed/chunk cases** (seeds1..128, chunks34..44). For the four reference
seeds and nine original body chunks, the complete subsequent `_voidProps`
position/normal/UV/color/anim/pivot/spin buffers hash identically in **36 cases**.
Reports include draw counts, states and downstream hashes. No RNG claim relies
on merely reseeding the replacement visual generator.

## Visible/resident span

Source `quality.drawDistance` is 320/440/560/700 and `behind=90`; the inclusive
visible chunk range is floor((playerZ-90)/96)..floor((playerZ+ahead)/96).
Retention allows first-1..last+2. The fixture samples integer player Z3100..4400,
including every chunk-boundary regime, and reports conservative retained
capacity, not an assertion that all allowed sections are always resident.

| ahead | visible triangles / primitives | retained capacity triangles / primitives |
| ---: | ---: | ---: |
| 320 | 12,082 / 18 | 16,132 / 26 |
| 440 | 14,051 / 21 | 16,698 / 28 |
| 560 | 15,524 / 24 | 16,698 / 28 |
| 700 | 16,698 / 28 | 16,698 / 28 |

These are landmark-only sums, not the total game renderer cost. At ultra, a
real 790-unit nominal span plus inclusive chunks can legitimately see the whole
820-unit ship, but it is still emitted **once across sections**, not once each.

## Validation, evidence and limits

Saved .blend is reopened and every mesh evaluated; GLB is imported into a clean
factory scene and compared. Independent stdlib binary GLB parser computes full
hierarchy transforms, indices, materials, bounds, cue tuples and reference-model
measurements. 1,637 original-triangle section-boundary sets agree within 1e-4;
zero degenerate triangles. Open damage is deliberately not a watertight mesh.
Gun-ring crenellation height changes at a slice plane are source topology, not
clipping gaps; `_FACE` provenance keeps that distinction explicit.

PNG evidence is **offline EEVEE**, labeled accordingly. Source camera snap
formulas are used at zero boost/velocity/shake/recoil/extraDist, aspect1.6;
Classic is orthographic (halfheight40, Y9 anchor, lead28), Modern/Chase use exact
source vertical FOV. Same shipped player world scale is preserved in every view;
there is no per-object normalization. Altitudes1.3/9/25 and engine cue times0/
1.25s are sampled. Tight structural detail frames may crop the player; game rigs
show it at actual gameplay scale. Lighting approximates source deepspace key/rim and hemisphere
using Blender suns/world fill. **No live Three.js renderer, source procedural
textures, source sky/fog/bloom, HUD, target AI, collision/aiming/lifecycle gameplay,
performance timing or GPU draw-call capture is claimed.** Technical self-
corrections during initial assembly corrected an exporter option and audit
provenance/default-image assumptions; these are not formal review/polish passes.

Rebuild with native Blender `--background --factory-startup --threads 4 --python
source/build.py`; run the Python/Node fixtures from their saved paths. Node
requires Three.js0.185.1 (set `THREE_ROOT` to its package directory). The source
probe expects the baseline production source paths; it stages import-instrumented
copies only under sibling `.runtime`, outside this frozen tree. `render.py`
requires original shipped `public/models/player.glb`. `annotate_evidence.py`
requires Pillow and Ubuntu font; runtime libraries/tools are intentionally not
in this transfer. Geometry generation is seeded and deterministic; byte-identical
Blender save files across systems/builds are not promised.

This `initial/` tree is immutable after `SHA256SUMS` is written. The archive,
sender receipt and any future review/polish live outside it. Sender success does
not imply receiver verification; receiver verification belongs to the orchestrator.
