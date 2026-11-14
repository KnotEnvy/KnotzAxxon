# Cargo crate + drum scenery kit — INITIAL

Status: `pending_deferred_opus_review`. **0 formal review rounds; 0 formal fix rounds.**

Implementation: `gpt-6.1-sol`, reasoning `xhigh`, available/default speed. No helpers, alternative providers, formal reviewer, production edits, commits, push or deployment. Native Linux Blender **5.2.1 LTS**, build **9e2066aef7ef**, `BLENDER_EEVEE`, four render/CPU threads.

## Assignment and source

Only the decorative `Fortress._crates` method and its `_deckProps` callsites are covered. This is neither the collectible fuel cell nor a destructible/gameplay fuel target. No collider, target, reward, damage, particle, neon, obstacle or mechanic is introduced. The other active builder's fuel depot and all completed assets are untouched.

Source baseline is commit `ee221ad3e05cd66292fe02b71b50f513696bdda2`. `src/world/Fortress.js`, `Utils.js`, `Level.js`, `CameraRig.js`, `FlightCamera.js`, `Settings.js`, `Materials.js`, `Sky.js`, `Player.js` and the shipped import pipeline are read-only inputs. The six shipped GLBs and their source generators inform the low-poly, manufactured, restrained material vocabulary only; they are not modified or bundled. The shipped player GLB appears unscaled in offline world evidence.

## Deliverables

- `asset/cargo-kit.glb`: two bottom-center, Y-up template nodes, **156 crate / 180 drum evaluated triangles**, one primitive each, one neutral authoring material, **19,828 bytes combined**, zero images/textures/UV/color attributes. Under targets 96–160 / 120–180, ceilings 200 / 240, and the 512 KiB GLB limit.
- `asset/cargo-kit.blend`: editable, closed native meshes, named vertex groups and face `cargo_part_id` records; no external images/dependencies. With no bitmap dependencies, packing is vacuous and complete. No nondestructive modifiers are needed to recreate the exported topology.
- `asset/cargo-topology.json`, `asset/part-runtime-map.json`: deterministic, named topology/part/runtime/material mapping. Crate parts include beveled shell, inset side/lid panels, broad frame ribs, integral captive latch forms and a lid hinge strap. Drum parts include closed bottom, rolled foot, formed retaining hoop, upper wall, rolled rim and recessed closed lid. All forms are connected surfaces, not floating decals or extra pallets.
- `source/geometry.py`, `build-blender.py`: editable deterministic generator and export. One fitted template per kind; no silhouette variants or additional RNG are justified.
- `source/cargo-runtime.mjs`: startup-only extraction/cache and exact source-method delegation using actual Batch stamps. `source/validate-runtime.mjs` is executable prototype evidence, not a proposed mock replacement for Batch.
- `evidence/`: source leaf traces/density, complete runtime parity and transformed bounds, independent binary audit, blend reopen and clean import, actual render payload, PNGs, camera/render provenance and visual-inspection record.

## Runtime integration recipe — not installed in production

Run before constructing or streaming Fortress, after GLTFLoader has loaded this GLB:

```js
const originalCrates = Fortress.prototype._crates;
const cargoKit = prepareCargoKit({ THREE, gltf: cargoGltf, originalCrates });
Fortress.prototype._crates = cargoKit.crates;
```

`prepareCargoKit` consumes the one startup GLTF import: it flattens node transforms once, copies just position/normal arrays into two non-indexed templates, deduplicates/disposes imported geometry/material/texture resources and releases scene children. Do not reuse that consumed import. No per-unit GLTF roots, material clones, textures or buckets are created. The WeakMap adapter is per Batch, not per prop. Existing `Batch.stamp('hull', ...)` does the real stamping, inverse-scale normals, source world box-projected UVs, original UV scales 3/2, source AO and front/side lifts. Source tints are unchanged:

Crate `8f9a6a / a87a58 / 7c8ea4 / 9aa0a8`; drum `b04a3a / c8a040 / 6a7a8a`.

The existing mapped `Materials.hull` is still selected by the unchanged Batch/For­tress material callback, retaining its maps, normalScale 1.1, metalness .36, roughness 1.0 and environment response. Imported neutral authoring material is discarded, never substituted for it. Batch ignores imported `COLOR_0`/UV; this asset deliberately contains neither. The runtime explicitly validates any supplied color attribute is exactly neutral and reconstructs the authored neutral multiplier as **1**; Batch derives final colors from the exact source tint and its own AO/lifts. There is no hidden vertex-color detail to lose.

All original method control flow is executed, rather than copied into an approximate spawn recipe. In particular `rng.int(1,3)` is reevaluated **before** `y < maxH - .8` on every loop test, even the terminating test. Each actual crate consumes `s, h, depth ratio, x offset, z offset, tint, yaw` in original JavaScript argument order. The optional `.bool(.5)` and three drum tint picks remain original. No new game RNG draw or hash-based variant is introduced. Width/height/depth ratio 1..1.6, yaw ±.3, offsets and cumulative Y are untouched. Drum `.42 / 1.1 / .42` scale and +1.6/+2.5 lateral offsets are untouched.

When source box surface capture is enabled, the adapter reproduces **the exact original unrotated box record** before stamping; these records are not changed into geometry bounds/colliders. Normal generated fortress chunks may have capture disabled at that callsite; the independent enabled test and actual chunk behavior both match source.

On shutdown, after retiring chunks, restore `Fortress.prototype._crates = originalCrates` and call `cargoKit.dispose()` once (idempotent). Existing `_disposeChunk` disposes each newly merged hull geometry once. Do not dispose templates or the shared mapped hull/material/textures on chunk retirement. Template disposal belongs only to application shutdown; the original shared hull retains the existing application material owner. There is no continuous per-frame mesh generation; only existing chunk-build stamping occurs after startup preparation. The shipped source `TPL.drum` may still be lazily initialized by its original argument expression and remains owned by the existing Fortress template shutdown function.

## Measured cost and parity

Original actual Batch root samples, maxH 3.2, seeds **1 / 7 / 42 / 123**: **144 / 24 / 156 / 24 triangles**. This kit: **852 / 312 / 1008 / 312**, with **21 / 18 / 29 / 18** leaf RNG draws and the same single hull bucket. Source crate is 12 triangles; source drum is 40. Both RNG trace and eight downstream leaf draws match exactly.

40,000 real `_crates` samples (20,000 at each maxH) confirm near piles contain 1–2 crates, far piles 1–3, and either zero or three drums. Leaf draws vary **10–21** near and **10–29** far, not a fixed count. Max actual stack height is exactly the respective 1.9 / 3.2 bound. 10,000 `_deckProps` cargo-control-flow samples per fortress theme and a declared maximum battery pile arrangement reach **12 crates + 15 drums**. Unrelated builders in that large density-only sweep are explicitly no-op test doubles; separate exact validation uses their real implementations.

**240 actual `_deckProps` pairs** cover all five fortress themes and seeds 1..48, comparing complete leaf/loop traces, all pose/tint arguments, RNG state and next eight draws, emitters, surfaces, and all non-cargo position/normal/UV/color/animation/pivot/spin bytes. **20 full actual `_buildChunk` pairs**, using real generated Levels and their real feature builders, compare non-cargo buffers, surfaces, emitter values, collider hashes, mesh counts and retirement. Lifecycle-only shared hull/force-field materials and headless matchMedia are labeled test doubles, not a live renderer. Existing gate post sharing causes repeated *non-cargo* geometry disposal in some original chunks; the parity report discloses it without unrelated changes. Every new Batch-merged geometry, including cargo hull, retires exactly once.

Two startup templates occupy **24,192 bytes** of extracted Float32 position/normal data. Unindexed merged hull uses 11 floats per vertex = **132 bytes/triangle**. Worst declared cargo is **4,572 triangles / 603,504 bytes** per chunk versus original **744 / 98,208**, a **505,296-byte increase**. It still shares the existing hull draw, with no extra bucket/draw. Existing castShadow means the hull is also submitted in the shadow pass; no FPS or frame-time result is claimed. Scratch-buffer spare capacity, JS bookkeeping, unchanged scenery, driver copies, and texture allocation are not included in that byte figure. BufferGeometry keeps CPU arrays as well as GPU uploads.

Conservative draw-distance envelopes at 320/440/560/700 ahead and 90 behind are 6/7/8/10 resident chunks: **3,621,024 / 4,224,528 / 4,828,032 / 6,035,040 bytes** of worst-cargo merged data per CPU or GPU copy. These pessimistically populate every resident chunk with the maximum battery cargo; ordinary themes average much less. Per-chunk full-source totals, bucket counts and deltas are in `runtime-validation.json`.

Replaying the actual maximum-density seed 2738 battery cargo arguments into a **fresh actual source Bucket** measures scratch reserved capacity **131,072 bytes original / 917,504 bytes kit**, including FloatBuf power-of-two spare capacity. The live shared pool may retain more capacity due to unrelated scenery. Ten maximum cargo chunks' retained CPU arrays + corresponding GPU arrays + that fresh scratch + both startup templates total **13,011,776 bytes**, excluding all unchanged game content/driver overhead. This is an allocation accounting bound, not a measured driver memory or performance claim.

## Envelopes, clearance and limits

Crate canonical bounds are `X/Z [-.5,.5], Y [0,1]`. Drum bounds are `X ≈ ±.95105654, Z ±1, Y [0,1]`. Every drum vertex satisfies the **ten original source-cylinder halfplanes**, not merely a radius-one circle. Every triangle lies within the convex source solid, so continuous whole-surface containment survives **every** original positive nonuniform scale, translation and yaw; this is stronger than a finite rotation sampling. The independent binary audit measures convex containment, positive volume, one connected component, Euler 2, zero nonmanifold/orientation errors and positive triangle areas for both exported meshes. Runtime evidence lists transformed per-instance bounds for both legal maxH placements, five representative seeds and every drum.

Player legal center limits remain X ±16, Y 1.3..25, radius 1.5. Near pile centers are negative 19.5..24.5; far positive 19.5..24. Conservative source near-crate lateral support at max width/depth ratio/yaw/offset leaves only **~0.0290 units** to the player sphere's lateral reach. **Optional near drums already violate possible player-sphere clearance in source**: the k=1 drum at parent X=-19.5 has center X=-17 and rightmost X≈-16.600556. A legal player center at X=-16,Y=1.3 and the corresponding Z is only **0.632983** from the original/new shared rim witness, giving **-0.867017** signed clearance to radius 1.5. Cargo is decorative, not a gameplay collider. We preserve that inherited condition; we do **not** claim complete original player-sphere clearance. Existing random stack overhang/intersections, unrotated captured boxes, and flight-camera edge cropping remain inherited limitations. No legal movement/aim envelope is narrowed.

The real source CameraRig/FlightCamera performs **54** finite probes across Classic/Modern/Chase, landscape/portrait, X=-16/0/16 and Y=1.3/6/25. All transformed cargo bounds project finitely; this is not a claim every prop is visible, unoccluded or legible at every legal player pose. No gameplay/aim behavior is changed.

## Visual evidence and reproduction

The PNG evidence includes front/rear/top/underside, crate/drum hardware closeups, original-versus-kit source seeds 1/7/42/123 at both stack limits, and source-versus-kit **common WORLD-scale** Classic/Modern/Chase with the unscaled shipped player. Camera eye/look/projection and scene construction are recorded. World fixture repetition at Z18/42/68, deck slab and lane markings are explicit layout test doubles, not a fake live generated chunk.

**All images are offline EEVEE/source-dusk-lighting approximations, forced software Mesa.** They use actual Batch positions, transformed normals and linear source tint/AO values but do not reproduce the runtime hull maps, normal maps, roughness maps, WebGL tone mapping, post effects, sky/environment bake or collision simulation. They are not live GPU evidence, a performance/FPS capture, formal Opus review, or final visual acceptance.

To regenerate, use a writable copy of `initial/` inside this repo. Supply the existing native Linux Blender binary/sysroot environment externally; no tool/runtime/library/cache is included. Four threads are sufficient. Run generator and validation sources in this order:

```sh
BLENDER -b -t 4 --factory-startup --python initial/source/build-blender.py
THREE_ROOT=/path/to/existing/three node --experimental-vm-modules initial/source/measure-source.mjs
THREE_ROOT=/path/to/existing/three node --experimental-vm-modules initial/source/validate-runtime.mjs
python3 initial/source/audit-glb.py
BLENDER -b -t 4 --factory-startup --python initial/source/verify-blender.py
BLENDER -b -t 4 --factory-startup --python initial/source/render-evidence.py
```

`initial/` is frozen read-only after evidence inspection. `SHA256SUMS` covers every content file except itself. Archive, sender log and transfer receipt are outside `initial/`; only this assigned initial tree is archived. Transfer is sender-side only through the authorized Windows Tailscale CLI to `100.112.66.64:`. Receiver-side checksum/extraction verification belongs to the orchestrator.
