# Covered fighter - frozen INITIAL candidate

Status: `pending_deferred_opus_review`. Formal reviews: **0**. Formal review/fix rounds: **0**. This is not final acceptance. Receiver verification and integration remain primary.

## Scope

Passive covered / mothballed scenery only, replacing the picture emitted by `Fortress._parkedFighter` at revision `ee221ad3e05cd66292fe02b71b50f513696bdda2`. This is NOT the separately built gameplay parked fighter. Nothing is integrated into production. The caller, RNG, yaw, hardstands, guide surfaces, targets, collision, aim, camera, scoring, lights, and all other scenery remain unchanged. All writes are scoped to `asset-work/covered-fighter/`.

The original airframe design uses fitted grey/slate canvas sections over a continuous fuselage and swept wings; broad tension folds, reinforcement bands, four restrained tiedown loops, sealed exhaust, attached tail surfaces, and three fully attached landing gear assemblies. No red/orange markings, canopy glass, engines, lamps, weapons, or target affordances are introduced. Under the shared warm evidence lighting grey canvas appears slightly khaki; identity remains inactive, non-emissive scenery.

## Files and measured budget

- `asset/covered-fighter.blend`: packed, editable, asset-only Blender scene; no external images or linked libraries.
- `asset/covered-fighter.glb`: named nodes, three materials, no textures/animations/emission; reference asset, **not** a per-prop runtime scene.
- `asset/covered-fighter.recipe.json`: immutable authored flat positions/normals and per-part bucket/tint data.
- `source/CoveredFighterRecipe.mjs`: shared startup-cached runtime adapter; no production install performed.
- `source/build-covered-fighter.py`: original deterministic geometry generator, Linux Blender 5.2.1 LTS `9e2066aef7ef`; `BLENDER_EEVEE`.
- `evidence/`: source measurements, binary audit, full chunk comparisons, lifecycle tests, exact source camera matrices, render settings, PNG renders/sheets, and visual inspection notes.

Source: **260 triangles** = hull **164**, dark **72**, paint **24**. Cached source fighter templates are hull **100**, dark **72**; source adds two cover meshes totaling hull **64** at each placement.

Candidate: **1,372 triangles** = hull **644**, dark **704**, unchanged paint **24**. Airframe alone is **1,348**, within target 900-1,500, below 2,000 ceiling. The GLB contains **43 named mesh nodes / 43 primitives**, consolidated to exactly **3 existing bucket draws** after Batch merging, not 43 runtime draws. Forty-two aircraft template geometries are shared once; fixed hardstand boxes retain their existing two calls. No per-prop roots, material/geometry clones, textures, or new buckets.

## Envelope and placement contract

Aircraft-only source envelope at zero yaw: X `[-3,3]`, Y `[~0,2.25]`, Z `[-3.5,2.1500000954]`. The fixed hardstands reach X/Z `+/-3.75`; they are explicitly excluded from aircraft envelope permission.

Candidate aircraft-only bounds: X `[-2.8399999142,2.8399999142]`, Y `[0.0040000002,2.1400001049]`, Z `[-3.3399999142,2.0450000763]`. All candidate XZ vertices lie inside the convex hull of actual source aircraft XZ vertices, minimum inward distance **0.0482177062** units. Together with Y-interval containment this proves transformed support/AABB containment continuously, including the entire yaw range `[-0.25,+0.25]`; 1,001 exact-angle samples are also retained. This is an envelope proof, not a claim of per-triangle occupied-volume containment.

Preserve the source loop condition **exactly**: `for (let k = 0; k < rng.int(1, 3); k++)`. Its condition draws RNG on every test, including the terminating test; do not pre-sample the count. Preserve `clamp(farX() + 1.5, 21, 23.5)`, `z + k * 9`, and exactly one `rng.range(-0.25, 0.25)` per fighter. The two original paint boxes remain fixed, unrotated, with original dimensions, colors, Y offsets, UV scale, ordering, and surface records. No additional box calls are used for candidate aircraft.

Worst continuous-yaw candidate hull X at minimum placement remains about **17.89698**. Against the existing corridor X=16 and player radius=1.5, the finite horizontal gap is about **0.39698** units. This does not alter collision or placement. Existing source intersections with far wall/deck plating/other props can still occur; no invented no-overlap guarantee is made.

## Runtime integration proposal, not applied

1. Import `initializeCoveredFighter`, `stampCoveredFighter`, and `disposeCoveredFighterTemplates` from the adapter, with its adjacent recipe at the documented relative path.
2. Call `initializeCoveredFighter(THREE)` once during app startup, before any chunk is constructed. It allocates only cached BufferGeometry templates; repeated initialization returns the identical cache.
3. Delegate the existing `_parkedFighter(batch,x,z,rng)` body to `stampCoveredFighter(batch,x,z,rng)`. Do not change any caller, RNG, hardstand, guide-surface logic, placement, target, or collider.
4. Call `disposeCoveredFighterTemplates()` at application shutdown alongside `disposeFortressTemplates()`, after chunk retirement. Each cached template disposes once; repeated shutdown is harmless. Do not dispose shared templates on chunk retirement. Existing chunk ownership still disposes the merged buffers.

GLB node `CF_17_Unchanged_Fixed_Hardstand_24tri` maps to `paint`; all other nodes carry `bucket` and `tint_hex` extras. `CF_HULL`, `CF_DARK`, `CF_PAINT` are authoring material labels only. Runtime uses the already existing bucket materials and Batch box-projected UVs, baked AO, front/side lift, shadow flags, and FloatBuf lifecycle. GLB vertex colors already include the dark bucket's base factor for standalone correctness; recipe tints deliberately do not, since the existing runtime material supplies it.

## Validation and limitations

`evidence/runtime-validation.json` compares **128 actual full chunk builds**: seeds 1/7/42/123, campaign loops 0/2, chunks 0-15. It compares every RNG value and 16 downstream draws, exact placement/yaw order, unchanged merged buffers after removing only the intended hull/dark replacement spans, exact paint bytes, exact original surface records, 640 guide probes per chunk, feature/collider hashes, emitter records, draw meshes, and actual chunk retirement. Observed source fighter counts include 0/1/2/3. Stress cases 1/2/3/8 props retain 3 merged draws and the same shared cache. Idempotent application shutdown disposes all 42 templates exactly once.

The saved blend is reopened, then the GLB is imported into a factory-clean Blender scene. An independent standard-library binary reader verifies accessor byte ranges, transforms, finite positions/normals, winding agreement, zero degenerate triangles, budgets, materials, no textures/animations/emission, and recipe/GLB triangle equivalence plus bounded normal/color export quantization.

All evidence renders are **offline reconstructions**, not live GPU acceptance. Full world pairs reconstruct actual source Batch buffers for seed42 chunk0 and use actual source `CameraRig.snap` / `FlightCamera` matrices, the shipped player at scale 1, identical lighting and world units. Both near-shoulder and center-lane stationary player states are retained; the near-shoulder state has existing scenery/player occlusion, so the center-lane state provides additional silhouette evidence without moving any prop. Blender projection diagonals are checked against the Three.js camera. Approximate shared lighting, no production procedural material textures, sky shader, fog, bloom/postprocessing, HUD, dynamic enemies, motion, or live performance acceptance. Native world-scale pairs are unresampled; explicitly labeled 4x crops are supporting inspection only. Frustum projections do not prove occlusion clearance. Two stationary source camera states per rig are not exhaustive camera acceptance.

Selected shipped player/sentinel/turret/radar/silo/fuel GLBs and their editable sources are the only craft references. No competitor designs or geometry are reused. Candidate aircraft geometry and generator are original. **Declared reuse:** the 24-triangle source hardstand is intentionally retained verbatim; actual source Batch reconstruction and shipped player/reference assets appear in evidence only, not candidate geometry. Reference GLBs and their source hashes are recorded, not redistributed as separate assets.

## Reproduce without installation

Run from the repository root. The supplied wrapper uses only the existing archived native Linux Blender runtime and redirects all Blender/XDG/Python caches under this covered-fighter workspace. It does not use the drone workspace cache, Windows Blender, or install anything. Node resolution reads the existing local Three.js package; override `COVERED_THREE_ROOT` to another already-installed Three.js 0.185.1 directory if needed. No root setup changes.

```sh
node --experimental-loader ./asset-work/covered-fighter/source/three-loader.mjs asset-work/covered-fighter/source/measure-source.mjs
bash asset-work/covered-fighter/source/blender.sh --background --factory-startup --python asset-work/covered-fighter/source/build-covered-fighter.py
python3 asset-work/covered-fighter/source/audit-glb.py
node --experimental-loader ./asset-work/covered-fighter/source/three-loader.mjs asset-work/covered-fighter/source/validate-runtime.mjs
node --experimental-loader ./asset-work/covered-fighter/source/three-loader.mjs asset-work/covered-fighter/source/camera-evidence.mjs
COVERED_CAMERA_STATE=centerlane node --experimental-loader ./asset-work/covered-fighter/source/three-loader.mjs asset-work/covered-fighter/source/camera-evidence.mjs
bash asset-work/covered-fighter/source/blender.sh --background --factory-startup --python asset-work/covered-fighter/source/verify-blender.py
bash asset-work/covered-fighter/source/blender.sh --background --factory-startup --python asset-work/covered-fighter/source/render-evidence.py
```

Copy frozen sources/assets/evidence to a new writable workspace before regeneration; do not alter the read-only INITIAL. The Three loader's default existing dependency path is environment-specific. Sheet composition uses already-available archived Pillow and a Windows Arial font, read-only. No runtime binaries, dependency trees, caches, backup blends, or temporary files are delivered.

`SHA256SUMS` covers every delivered regular file except itself, the standard non-self-referential convention. Its own digest is recorded in the external package receipt. The archive and its external checksum are verified before and after the explicitly authorized Windows Tailscale CLI transfer. A successful sender CLI exit is not receiver verification, integration, review, or final acceptance.
