# Rooftop flak gun — INITIAL

Status: **pending_deferred_opus_review**. Formal reviews: **0**. Formal review/fix rounds: **0**.
Implementation model: **gpt-6.1-sol**, **xhigh** reasoning, available speed; no helpers or Claude retries.
Base checkout: `ee221ad`, NitroBliss, November 14, 2026.

## Scope and delivered asset

This is the static background scenery in `Fortress._flakGun` and its far-rooftop `_skyline` callsites only. It is **not** an enemy Turret, HeavyTurret or Silo, and has no HP, collider, targeting, gameplay projectile, aiming update, emission mesh or new neon.

- `asset/fortress-rooftop-flak.blend`: editable named hierarchy; packed/self-contained, zero external images or textures.
- `asset/fortress-rooftop-flak.glb`: reference-pose authoring/inspection interchange, **704 evaluated triangles**, **21 mesh primitives**, **24 nodes**, **2 materials**, **109,384 bytes**. Do not instantiate this hierarchy per scenery prop.
- `asset/flak-gun.template.json`: deterministic canonical geometry and per-part motion/tint/bucket metadata.
- `source/generate.mjs`: deterministic geometry generator, no random geometry choices.
- `source/FlakGunRecipe.mjs`: startup-cache recipe that stamps into the **actual existing Batch**.
- `runtime-map.json`: all named parts, frame/pivot, material response and bucket assignments.
- `evidence/`: actual-source measurements, CPU proofs, independent audits, offline renders and inspection record.
- `manifest.json`, `SHA256SUMS`: frozen handoff metadata and every-file integrity, except the checksum file itself.

The compact octagonal/chamfered mount carries a split azimuth race, connected side trunnions and elevation shaft, paired receivers, recoil pistons and long stepped jackets. Both muzzle bores have genuine 0.27-deep walls and dark recessed floors. Features are deliberately broad enough to survive scenery scale; no small decorative fasteners or active-enemy telegraphs were added. The six selected shipped models and editable source files are **style references only**; their hashes are recorded, and no geometry/material assets are copied into this delivery.

## Source contract: unchanged

Source `_flakGun(batch, rng, x, z, emit, y=0)` keeps **roofY**, origin and caller-owned `emit`. It draws pitch `rng.range(1.0,1.3)`, yaw `-rng.range(.6,1.1)`, and rate `rng.range(.25,.45)`, in that order. The caller's existing `emit` consumes its fourth RNG draw for `t`, stores the original chunk owner and retains the supplied direction vector.

The exact original emitter computation is retained in the recipe: pivot at roofY+2.1, length4.2, barrel centers at localX ±0.45, direction `(0,sin(pitch),-cos(pitch))` rotated by the source yaw. The emission point is **at the center between the two barrel tips**, not at either bore. It is not moved to hide the graphics/VFX compromise.

Actual downstream `Effects.ambient` and `_flakBurst` are exercised with recording particle-pool doubles. Existing steel-white sparks, three 70/76/82-speed tracers, culling interval, rate scaling, and delayed burst at emitter+48*dir remain unchanged. No VFX bounds, particle parameters or gameplay data are modified. `evidence/effects-consumer-trace.json` records the real consumer calls, not particle renders.

Source `_skyline` remains untouched: only far-side battery towers, h>22 and bool(.6), after the prior h>40 && bool(.25) stack-emitter branch. Do not hoist short-circuit draws, narrow pitch/yaw, reparent the emitter, alter roof captures or add an update loop.

## Measured placement and cost

Actual `Level`, `Rng`, `_buildChunk`, `_skyline` and Batch, seeds **1,7,42,123**:

- **356** fortress chunks, **68** battery chunks, **498** battery roofs, **114** flak props.
- **0–6** flak props per battery chunk, mean **1.67647**. Histogram: 0:18, 1:17, 2:17, 3:6, 4:6, 5:3, 6:1.
- Centers X **41.20296–88.24101**, roofY **25.06279–77.74014**, Z **1593.89802–3156.40473**.
- Original isolated prop: **100 triangles**, dark60/hull40, 3.4-square source base. Seeded top at roofY0: **5.72810–6.11959**.
- Candidate: **704 triangles**, hull192/dark512, constant at every pose, below the requested750 target maximum and1000 hard ceiling. At the sampled six-prop maximum:4224 flak triangles,3624 more than source, **no additional material buckets or chunk meshes/draws**. This is not an FPS measurement.
- Reference-pose transformed bounds: min `[-1.650000,0,-1.650000]`, max `[1.717242,5.989980,1.650000]`.
- 101x101 full-range pose grid: candidate min `[-1.650000,0,-2.249866]`, max `[2.343949,6.183859,1.650000]`. Source grid envelope min `[-1.700000,0,-2.260797]`, max `[2.349354,6.189744,1.700000]`. **Zero per-sample AABB overshoot**.
- Paired muzzle-frustum center-emitter clearance **0.311732m**; full-range rotations preserve it. Source center spark remains visibly between the barrels. No attempt to fake two independently emitting barrels.
- Contact footprint **3.3 x 3.3**, roofY contact0. The **114 measured rotated roofs** retain at least **0.274237m** contact-footprint margin. Conservative lane clearance is at least **23.35m** beyond the legal X16 flight edge.

### Honest finite limits

The 10,201 poses cover both full continuous ranges without quantizing runtime aim, but are **finite samples**, not an exhaustive mesh-collision proof. Nearest-grid-point vertex displacement is conservatively bounded by0.0173m; retain that padding for unsampled envelope reasoning. Barrel jackets use eight-sided rather than the original six-sided faceting; full topology containment in the old barrel meshes is not claimed.

The contact base is smaller than the original unrotated3.4 square. All measured roofs fit, but an unmeasured theoretical minimum3.8-wide roof at extreme roof yaw.4 may produce up to0.131m plate overhang, less than the original source square. Universal roof containment for every possible seed is not claimed. The existing roof cap reaches roofY+.22 and the original center HVAC intersects the lower mount; these existing graphics overlaps are retained rather than moving roof fixtures, altering contact origin or changing surface capture.

## Runtime integration recipe, not production integration

At application startup, parse the template once, call `prepareFlakGun(template)` once and retain the returned cache. Use its `flakGun` function as the scenery method body, retaining the unchanged signature and all original `_skyline` callsites and callback ownership. No production files are changed in this handoff.

```js
import { prepareFlakGun } from './FlakGunRecipe.mjs';

const flakTemplate = prepareFlakGun(templateData);
const flakGunScenery = flakTemplate.flakGun;
```

The recipe needs no public Batch export in production: it receives the source Batch instance. The included Node loader appends exports **in memory only** so the audit harness can exercise the actual private Batch without editing production.

Each chunk-build call transforms cached canonical positions/normals continuously about the original pivot, computes source-compatible tint/AO and world UVs, then appends vertices directly through existing `Batch._bucket`, `reserve` and `_vertex`. There are **no per-part/per-prop Object3Ds, BufferGeometries, material/texture clones or new draw buckets**, and no per-frame work. Source-style emitter Vector3 allocations remain; they are not render roots. Existing Batch merges the shared hull/dark buckets once into chunk-owned geometry.

Canonical typed geometry is50,688 bytes, reusable posed scratch50,688 bytes, plus small part/tint metadata. Release the temporary parsed JSON holder after preparing the cache if not needed elsewhere. Cache scratch is sequential/non-reentrant, matching synchronous source chunk builds. There is no geometry reconstruction during frame updates.

Chunk unload calls the unchanged `Fortress._disposeChunk`: its **Batch-merged chunk geometries retire exactly once**, and owned emitters are removed. Our templates, original shared materials and original textures remain alive. At **application shutdown**, after retiring chunks, call `flakTemplate.dispose()` once (idempotent) and keep the application's existing material/texture shutdown ownership. Do not dispose shared maps/materials on chunk unload.

### Explicit material/attribute mapping

- **hull** → original **materials.hull**: existing shared map, normalMap, roughnessMap, normalScale(1.1,1.1), metallic.36, roughness1, envMapIntensity1.5, vertexColors. No replacement map or material is shipped.
- **dark** → original **materials.darkMetal**: **unmapped** original0x3a4a5e, metallic.5, roughness.46, vertexColors.
- Canonical tint is sRGB-decoded linear per part, with source-like per-part height AO and up/front/side face multipliers. Runtime UVs are recomputed per triangle from its dominant world face, world coordinates/3; flat normals undergo the same rigid pitch/yaw rotation as their geometry.
- GLB reference colors encode **COLOR_0 = source linear tint/AO /1.1** to avoid clipping source up-light values above1. Each mesh node exposes `GLB_COLOR0_decode_gain:1.1`; decode it when using interchange attributes. Preview PBR factors include that gain. GLB UV `(u,1-v)` decodes to Batch `(u,v)`. Binary audit measures reconstructed color error<=8.34e-6, UV error<=5.97e-8 and transformed normal error<=4.91e-5.
- GLB/Blender hull appearance is an explicitly labelled **offline source-map average**, not the actual canvas-generated hull normal/roughness/albedo. Real runtime response uses the unchanged shared mapped material. GLB roughness.65 is a **preview average only**, not a replacement for the runtime roughness1 plus roughnessMap.

## Executed evidence

`evidence/runtime-proof.json` compares **all356 actual fortress chunks** baseline/prototype: full RNG sequences, all114 flak traces including caller phase, every downstream bucket field, feature-batch geometry, roof/deck captures, all emitter ownership/payloads, mesh counts and original material identity. It records6076 Batch-merged geometry disposal events and0 shared material disposal events across both test paths. These are **CPU test doubles**, not render-performance results. Independent seeded calls also test roofY0/25/77.75.

`evidence/blender-reopen-clean-reimport.json` comes from a **separate Blender invocation** that reopens the saved blend, factory-clears, clean-imports the GLB and evaluates triangles, transformed bounds, attributes and external resources. It independently checks Blender world camera projection against actual source `CameraRig.snap`/`FlightCamera` in all three modes.

`evidence/independent-binary-audit.json` uses only Python stdlib, not Blender: GLB chunks, accessor bounds, node transforms, indices, triangle areas/winding/normals, materials, zero textures/images, bounds and Batch attribute mapping.

Offline EEVEE evidence includes six hardware views, four pose extrema, six source/candidate WORLD views, six selected shipped-reference views and contact sheets. The WORLD fixture is **actual seed7 chunk24**, roof center **(47.420535,25.346279,2340.024718)**, common unmodified shipped player **(16,25,2328.024718)**, 1280x720 and the **actual source camera snapshots**. No retargeting, oversized prop/player or copied enemy mechanics. The legal edge/high-altitude player station is chosen to keep all three projected prop envelopes on screen; it is not a typical centered-flight fixture.

Projected candidate size is approximately **38x59px Classic**, **79x84px Modern**, **91x90px Chase** before occlusion. **The existing high corridor wall masks much of the mount in perspective views**; projected bounds are not a visible-pixel promise. Do not move the source gun, roof, emitter or camera to conceal this source-placement limit.

All renders are labelled **OFFLINE EEVEE/source-lighting approximations**, native Linux Blender **5.2.1 LTS**, build **9e2066aef7ef**, engine enum **BLENDER_EEVEE**,4 threads,32 samples, AgX Medium High Contrast/exposure.7, software GL. Nonfatal EGL_BAD_MATCH context warnings occur during software setup; produced images are inspected. Actual game fog, bloom, shader animation, particles, GPU behavior and FPS are not reproduced. There is **no live GPU/FPS or final acceptance claim**.

## Reproduction and freeze

Place the package at `asset-work/flak-gun/initial` in the same prepared checkout. Set `FLAK_THREE_ROOT` to an existing Three installation if the default existing asset-work tooling path is unavailable. No dependencies, Blender runtime, sysroot, wrapper, caches, temporary files or unrelated assets are included in the archive.

```sh
node --loader ./asset-work/flak-gun/initial/source/source-loader.mjs asset-work/flak-gun/initial/source/measure-source.mjs
node --loader ./asset-work/flak-gun/initial/source/source-loader.mjs asset-work/flak-gun/initial/source/generate.mjs
node --loader ./asset-work/flak-gun/initial/source/source-loader.mjs asset-work/flak-gun/initial/source/validate-runtime.mjs
```

Run `source/build-blender.py` with the specified existing native Blender and its existing sysroot wrapper outside this package, then `source/verify-blender.py` and `python3 source/audit-glb.py`. `--asset-only` rebuilds just blend/GLB; `--sheets-only` assembles already-rendered evidence. The GLB post-export step explicitly restores preview baseColorFactor because Blender's exporter does not infer the arbitrary vertex-color multiply shader. Forced named COLOR_0 export and independent decode audits prevent attribute loss.

The frozen initial folder is write-protected and every content file is in SHA256SUMS, excluding itself. Do not rerun generation or write receipts inside frozen initial; create a separately named later iteration if needed. Archive, archive checksum and sender receipt live **outside** initial. Sender status is not receiver verification: receiving, checksum verification, later formal Opus review/polish and final acceptance belong to the orchestrator.
