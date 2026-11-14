# ASTEROID SCENERY KIT — initial

Status: **pending_deferred_opus_review**. Initial implementation only. Zero formal review passes and zero formal review/fix passes. No helper or Claude was used. This is an asset/prototype handoff, **not production integration or live performance proof**.

## Deliverables

- `source/asteroid-scenery-kit.blend`: editable connected triangulated surfaces, named crater/rim/fracture vertex groups, point-domain linear palette, UVs, one shared material; packed with zero external images.
- `assets/asteroid-scenery-kit.glb`: three named templates in one library, **not** a complete scene to instantiate for every rock.
- Individual GLBs: `talus-basin.glb`, `keel-double-impact.glb`, `scar-cleaved.glb`.
- `source/adapter.mjs`: concrete source-callsite adapter, startup-only template loading, actual `Batch.stamp`, explicit palette/custom-attribute reconstruction, idempotent chunk/template disposal.
- `scripts/`: deterministic authored mesh generator, captured-source instrumentation, initial implementation checks, independent binary audit, saved-blend reopen/clean reimport, offline evidence renderers.
- `measurements/`: source baseline recorded before design, pre-design camera density, evaluated topology/bounds, exact RNG/following-buffer checks, full-spin/clearance/aggregate counts and render metadata.
- `reference/src/`: untouched source snapshots needed to reproduce these measurements. Shipped player GLB is **not** redistributed; its reference path and exact hash are recorded.
- `evidence/`: inspected PNGs. All images are labeled **offline EEVEE reconstructions**. They do not claim to be game screenshots, WebGL, or measured FPS.
- `manifest.json`, `SHA256SUMS`: delivery contract and every-content-file integrity list.

## Template contract

| Library node | Runtime variant | Evaluated triangles | Primitive/material slots |
| --- | --- | ---: | ---: |
| `AS_Talus_Basin` | broad terraced basin and blunt fractured back | 432 | 1 / 1 |
| `AS_Keel_DoubleImpact` | elongated intact mass with oblique impact and smaller worn basin | 480 | 1 / 1 |
| `AS_Scar_Cleaved` | cleaved shield mass with diagonal fracture shelf | 384 | 1 / 1 |

All three are single connected closed surfaces, not loose chips, wreckage, gates or trusses. Triangle counts are actual evaluated/exported counts, not polygon marketing. Authored units are intentionally near a unit radius, **not normalized at integration or comparison time**. Blender maps `(game X, game Y, game Z)` to `(X, -Z, Y)`; glTF exports Y-up and identity node transforms. `measurements/binary-audit.json` contains transformed bounds, material/primitive counts, indexed accessor checks, welded closed-edge checks and file hashes.

The generator uses fixed analytic ring profiles, broad low-frequency erosion, impact excavations and radial plane constraints; no procedural random operator or texture dependencies. `design_seed` is stable provenance, not a game-RNG call. The supplied Blender binary is Linux **5.2.1 LTS**, build **9e2066aef7ef**, render enum `BLENDER_EEVEE`, four render/llvmpipe threads. Implementation model/settings: **gpt-6.1-sol / xhigh**, available runtime speed, no separate model call or helper.

## True source baseline

Read `measurements/baseline.json` and `pre-design-density.json`, captured from source at `ee221ad` before authoring. Actual Three.js **0.185.1** `IcosahedronGeometry` detail 1/2 is **80/180 triangles**, respectively. The source continuous position-based erosion and broad basin preserve duplicated corners; the anisotropic scale consumes three draws and erosion phase one draw after the detail branch.

The asteroid loop evaluates `rng.int(5,9)` at **every** condition check, including the failed check. It is not a once-picked fixed count. Eight seeds, 232 campaign space chunks, 1,513 asteroids: count histogram 5:41, 6:81, 7:71, 8:26, 9:13; mean 6.52155/chunk. Source mean 768.276 asteroid triangles/chunk, range 400–1,240. Radius parameter `s` actually sampled 1.00104–28.76928; this is a **parameter**, not the post-erosion world radius.

Placement remains X `±34..170`, Y `-50..70`, Z across the entire 96-unit chunk. Original `s=lerp(2.5,16,next()**2)` is multiplied by 1.8 for `abs(X)>90`, 0.4 for `abs(X)<45`. The exact `s`, original anisotropic draws, seeded locations, tint, pivot, random axis and 0.05–0.3 rad/s speed survive. Actual downstream geometry and final RNG state are checked, not merely the count.

Per successful iteration: one condition + 3 placement + radius + Z + 3 axis + 5 shape + tint + speed = **16 `next()` calls**; the final failed condition consumes one more. Existing dreadnought/carrier code before the loop and wreck/truss code afterward execute unchanged. Gate rings and wall drift use the legacy geometry with **no optional mapping** or opening changes.

## Runtime adapter and material map

Use `loadKit` **once** at startup. It bakes the three glTF world transforms into three retained shared template geometries. Do not clone the library root, clone runtime materials per rock, stamp the whole kit, or rebuild per frame. Select exactly one variant by `variantIndex` hashing the already-consumed source state, ordinal and chunk index; it calls no game RNG.

Only the specific `_voidProps` asteroid `batch.add(...)` callsite is replaced. The actual `for (...; i < rng.int(5,9); ...)` remains byte-for-byte source. `appendAsteroid` consumes the original five shape draws in order, then original tint and speed. The detail/erosion phase remain consumed even though the authored shape replaces that legacy mesh. This preserves **all following branch consumption, geometry and state**. `prototypeTransform` fails closed if that exact callsite changes and deliberately leaves every gate/wall callsite alone.

Material name **`AS_Regolith_RuntimeRock` -> existing shared `Materials.rock` / `rock` bucket**. glTF PBR material is a portable preview, not the runtime material. The actual material is white-base, metalness .08, roughness .9, flat shaded, env intensity 1.6, existing generated `rockTexture` map and `addRim(0x829bb5,.28,2.8)` plus `addSpin` shader. The asset has **zero textures and zero emission**. The game map is still retained and used; zero asset textures does not mean zero game textures.

`Batch._emit` ignores imported UV and COLOR_0. The prototype therefore explicitly:

1. Stamps one selected template through actual `Batch.stamp` with `sx=s*legacySx`, `sy=s*legacySy`, `sz=s*legacySz` (no fit/normalization factor). Source inverse-scale normal treatment is retained.
2. Uses existing triangle-dominant-axis projected world UVs at `uvScale=2*s`, just like source. Authored UVs remain only portable preview/edit data. No new texture or UV animation is introduced.
3. Multiplies the just-written **linear** seed tint by the selected template's per-index-corner **linear COLOR_0 RGB**. Alpha is opaque. Runtime base response is approximately `white * seedTint * authoredPalette * existingRockTexture`, then normal lighting/environment/rim and display conversion. The palette's basin floor/rim/fracture values are intentionally subtle; existing map can darken them further. They are not emissive and do not replace the source tint.
4. Repeats world center `[x,y,z]` into **aPivot vec3**, and normalized source axis plus rad/s into **aSpin vec4**, for **every emitted vertex**. A glTF node transform or COLOR_0 is **not** a substitute. Source shader rotates world position about aPivot and rotates normals with the shared clock.
5. Keeps **one merged scenery rock mesh/bucket per chunk**, shared existing rock material, source `frustumCulled=false`, no cast shadow. Legacy ring rocks can append into this same main bucket. No additional rock draw is introduced by the kit.

Important measured source exception: `_buildChunk` also creates **obstacle-owned featureBatch buckets** for `_debrisGate` wall drifts. Those are not `_voidProps` scenery and remain unchanged. Three seed42 chunks have **two total rock meshes** before and after the adapter; a claim that every complete production chunk has exactly one total rock mesh would be false. The kit itself uses only the one main scenery bucket. Merging the pre-existing obstacle meshes would change their rear-obstacle visibility/lifetime ownership and is not attempted. The complete-chunk report exposes this distinction rather than hiding it.

Chunk ownership: call source `_disposeChunk` once as its streamer does, or the demonstrated idempotent `retireChunk` for a detached prototype. The latter deduplicates owned geometry and never disposes templates/materials/textures. Templates and imported preview resources are retained until idempotent `kit.shutdown()`. The real `Materials` owner retains/disposes the shared runtime material and its existing textures at game shutdown. The adapter does **not** take ownership of those.

## Measurement and safety boundaries

`measurements/prototype.json` records 232 exact RNG/following-nonrock-buffer comparisons, 29 complete source chunk comparisons, two unchanged ring comparisons, and 1,965,744 emitted custom-attribute/palette vertices checked. The CPU harness uses actual source `Batch`, `Level`, `CameraRig`, `FlightCamera` and actual `GLTFLoader`; `MeshBasicMaterial` is an explicitly labeled no-DOM **test double**, not production material/shader validation.

Kit asteroid range is 2,016–4,032 triangles/chunk, mean 2,824.345 (about 3.68x the source mean). The complete-kit 1,296 total is **not** the per-rock count. At drawDistance 700 + 90 behind, the requested all-space maximum is 10 chunks / 90 rocks / 43,200 triangles; source retirement permits up to **three extra retained chunks**, so the conservative retained proxy is 13 buckets / 117 rocks / **56,160 asteroid triangles** / **12,130,560 bytes** in non-indexed 18-float stamped attributes. This excludes gate rocks, all other game geometry, CPU scratch capacity, driver overhead and template memory. Actual campaign-boundary samples are smaller; all tiers are in the report. Since source spin buckets disable frustum culling, few visible rocks do not imply few submitted triangles. No FPS claim is made.

The same report separately measures all rock meshes in 29 complete seed42 space chunks, **including** unchanged barrier/ring rocks: one observed complete chunk reaches **14,440 kit+legacy rock triangles**, versus **11,880 source** in that matched chunk, and three chunks retain two pre-existing rock meshes. At distance 700 the largest measured space-chunk window including those barriers submits **58,216 kit+legacy rock triangles versus 38,600 source**, with **12 rock meshes in either case**. These are measured requested-window maxima, not an all-seed retained maximum. `completeRockWindowProxy` exposes all tiers; it is not substituted for the asteroid-only budget or presented as a whole-game benchmark.

Bounds are measured after the **actual placement parameter and anisotropic scale**, not equalized against source. Sphere radius is about the shader pivot and covers all rotations; the per-rock full-spin AABB is analytic for its actual axis (parallel term plus sinusoidal extrema per coordinate), not a single rest AABB. `prototype.json` has both. Minimum sampled gameplay-prism sphere margin is **10.1731 units**, zero sampled candidates and no collider additions.

Camera samples include all eight seeds, three chunk phases, X=-16/0/16, Y=1.3/9/25 and three source rigs. Each mode has **187,299 rock/camera pairs**. Modern and Chase minimum eye sphere margins (including .35 near radius) are **4.36888 / 12.74652** units. Classic has inherited conservative candidates: worst eye margin **-1.77780** and 3-unit sight-capsule margin **-8.25410**. **Zero new sphere/capsule candidate events versus the matched source** were observed, but this does not prove all-seed, all-motion safety. Negative conservative bounds do not establish actual triangle occlusion. No boost, shake, camera lag trajectory, alternate aspect ratios, gameplay target visibility, or live GPU depth test is certified. No openings were narrowed to make this result.

The .35 eye sphere is **not** the complete projected near plane, particularly the wide orthographic Classic near plane. Camera-parented offline labels can cast minor visible shadows in closeups; those labels are not part of any exported asset. Both limitations are retained for deferred formal review, not silently represented as production proof.

## Offline evidence

- `kit-three-quarter.png`, each template's `-crater.png` and `-back.png`: common-scale overview plus impact detail and opposite silhouette.
- `actual-radius-spin-{000,090,180,270}.png`: one real seed42 placement/radius, source versus selected template at equal original anisotropy. Separate comparison translations only; common unchanged camera; full-spin bounds in JSON are conservative, four pictures alone are not proof.
- `world-{classic,modern,chase}-{source,kit}.png` and `-t12-5.png`: actual source cameras, source seeded placements, shipped player at 1:1, rest and shared-clock 12.5 s Rodrigues rotation. Player/world coordinates are only translated by -playerZ for numerical convenience. No art-directed enlargement or recentering of individual rocks.
- `world-classic-{source,kit}-density.png`: additional Classic evidence at seed42 Z=6384, selected from 116 **source-only** rest-pose samples by number of rocks with vertices inside the true source frustum, not by resizing, shifting or changing the camera. Seven source rocks have vertices inside at this selected pose. The fixed Z=3648 Classic frame genuinely has no visible asteroid surface; it is retained, not misrepresented as a density proof. The selected frame is not an unbiased density average; see `classic-density-sample.json`.

All renders use offline EEVEE, neutral .74 map attenuation rather than recreating the exact source canvas texture, no Three.js rim/spin shader, and simple guide-grid/lighting reconstruction. They omit wrecks, trusses, landmarks, gates, enemies, postprocessing and UI. Studio framing/neutral-tint setup was corrected during initial generation before freeze. These are honest art/scale evidence, **not** fake live WebGL or game/performance evidence.

## Reproduction (in a writable copy, never frozen initial)

Requires native Linux Blender 5.2.1 LTS build 9e2066aef7ef and already available Three.js 0.185.1. No installation is included. `THREE_ROOT=/absolute/path/to/three` overrides the measurement dependency; `ASTEROID_REPO` points to the source checkout/player reference. `source-loader.mjs` defaults to the existing local reference runtime only for convenience; **no runtime library, executable, cache or symlink is shipped**.

Run `node scripts/baseline.mjs`, then `node scripts/density.mjs` before design; `blender -b -t 4 --python-exit-code 1 --python scripts/build.py`; `python3 scripts/audit_glb.py`; `node scripts/check_prototype.mjs`; `node scripts/classic_sample.mjs`; `blender -b -t 4 --python-exit-code 1 --python scripts/reopen_reimport.py`; `blender -b -t 4 --python-exit-code 1 --python scripts/render.py -- all`; `ASTEROID_SPIN_TIME=12.5 blender -b -t 4 --python-exit-code 1 --python scripts/render.py -- world`; `blender -b -t 4 --python-exit-code 1 --python scripts/render.py -- classic-density`; and `blender -b -t 4 --python-exit-code 1 --python scripts/contact_sheets.py`. The `backs` render mode can regenerate just the opposite views; final `all` includes the corrected opposite camera. `reproduce_geometry.py -- /absolute/writable/regeneration` checks a separate rebuild: all four GLBs were byte-identical. Native sysroot environment setup is site-local tooling and excluded. Geometry generation is deterministic; `.blend` file bytes/timestamps and render pixels are not promised cross-driver deterministic.

Freeze happens after initial implementation checks and actual PNG inspection. `SHA256SUMS` covers every content file except itself. Archive, archive checksum and sender receipt stay **outside** `initial/`. The initial folder is then left unchanged. Authorized transport is only existing Windows `tailscale.exe file cp` to `100.112.66.64:` with `wslpath -w`. Sender CLI success is **not receiver verification**; that belongs to the orchestrator.
