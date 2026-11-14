# Armoured service bunker — INITIAL

Status: **pending_deferred_opus_review**. This is the implementation sub-agent's frozen initial/best-effort delivery, not final acceptance. Formal Opus review/polish is deferred: **0 formal review rounds, 0 formal fix rounds**. No helpers or alternate-provider retries were used.

## Scope and shape

Only the passive `Fortress._bunker` scenery branch in citadel/gauntlet `_deckProps` is addressed. The new asset is a fitted low octagonal armored service bunker: raked shell, real recessed observation/service reveals, sealed static maintenance cover, structural seams, roof intake tray with five fixed louvers, roof anchors, and one restrained warm status strip. No barrel, active dish, turret turntable, red telegraph, target identity, HP, collision, cover, damage, shots, door animation, or new mechanic is introduced. Source gameplay and production files are not edited.

The six shipped GLBs were traversed independently for actual transformed geometry/material vocabulary. Their meshes were not copied or disguised. Only the original shipped player GLB is imported for offline world-scale evidence, at its original scale; it is not included in this delivery.

## Measured budget

- Source: **36 triangles**, 12 each in `hull`, `dark`, `neon`; local bounds `[-3.5,0,-4] .. [3.5,4,4]`; exactly one method `rng.next()`.
- Initial: **468 evaluated/exported triangles**, `hull=242`, `dark=224`, `neon=2`; exactly **3 GLB primitives / 3 existing chunk buckets**; **0 textures**. The manifest and independent binary audit give exact final bytes and float32 transformed bounds.
- Authoring bounds: `[-3.45,0,-3.95] .. [3.45,3.93,3.95]`. Ground origin is unchanged. Worst theoretical world X minimum is **16.05**, versus source **16.00** and lane edge **16**. No extent grows toward the corridor, vertically, longitudinally, or outward.
- Caller remains `rng.bool(.6)`, far-X `[19.5,24]`, within-chunk Z `[12,84]`, followed by the one existing bunker phase draw. Do not narrow placement ranges or insert more draws.
- Actual unmodified complete source campaigns, seeds `1,7,42,123`: **148 eligible chunks, 86 bunker placements**, 62 zero/86 one; observed density `0.5810810811`, theoretical `0.6`, maximum one per eligible chunk. This is a measured sample, not a guarantee of exact 60% occupancy.
- At most 432 extra triangles per occupied chunk versus the source. No additional bucket/material draw category is introduced. No GPU, FPS or hitch claim is made.

## Assets and runtime recipe

- `asset/fortress-bunker.blend`: editable 52 named authored mesh parts, all mesh/material data stored in the file; no external images or unneeded runtime scene. `pack_all` was executed; there are no images to pack.
- `asset/fortress-bunker.glb`: three ground-origin identity-transform mesh nodes, suitable for loading once as cached geometry templates. Preview PBR/color data are offline proxies, not new runtime materials.
- `asset/bunker-geometry.json`: deterministic authoring geometry and equivalent alternate template input. The generator uses no randomness and is byte-for-byte repeatable.
- `asset/part-runtime-map.json`: named part purposes and triangle offsets within each merged bucket; material/runtime mapping.
- `source/BunkerRecipe.mjs`: direct GLTFLoader and generated-JSON paths, both tested through the **actual source Batch**.

Load and prepare once before chunk streaming:

```js
import { createBunkerRecipeFromGLTF } from './BunkerRecipe.mjs';

const gltf = await loader.loadAsync(bunkerAssetURL);
const bunkerRecipe = createBunkerRecipeFromGLTF(gltf.scene);
```

Do **not** mount, clone or instantiate `gltf.scene` per prop. The loader-owned scene is only a geometry/resource holder. In a future approved production integration, replace only the body of `_bunker` with:

```js
bunkerRecipe.stamp(batch, rng, x, z, theme);
```

The existing caller stays untouched. Each stamp uses the cached three geometries and the existing Batch world-projection/AO path:

- `hull` → existing **mapped** `materials.hull`, source tint `0x8a929c`, world UV scale 4.
- `dark` → existing **unmapped** `materials.darkMetal`, source white vertex tint, UV scale 3.
- `neon` → existing shared `materials.neonVertex`, current `theme.warm`, gain **1.1**, exact `aAnim = [BREATHE=3, 0.3, originalPhaseDraw]`, UV scale 8.

If `batch.captureSurfaces` is enabled, the recipe appends precisely the source neon-box record then dark-roof-box record, including the original arithmetic/order; no new shell/recess records are added. These are preserved source projection records, not newly invented collision or cover.

Actual `Batch.merge` owns only the new merged chunk geometries. Existing `Fortress._disposeChunk` retires those once. The cached templates and original shared materials/textures are not retired with chunks. After all chunks are cleared at shutdown, call `bunkerRecipe.dispose()` once; it is idempotent, disposes loader-owned templates and GLB preview resources, and does not touch existing game material/texture owners. The JSON route owns only three templates. Never rebuild or recolor templates each frame; the existing neon shader animates `aAnim`.

## Proof and viewing

The implementation agent actually opened all four finished contact-sheet PNGs and individual common-world Classic/Modern/Chase frames. See `evidence/visual-inspection.json` for the exact viewed files and honest observations. Sixteen full-resolution panel PNGs are also included.

- `01-multiview.png`: front/rear quarter, corridor profile and roof.
- `02-structure.png`: actual inset service/observation surfaces and fitted roof plant.
- `03-warm-cue.png`: citadel `#ffb43a`, gauntlet `#ff6a3a`, BREATHE maxima **1.0** and minima **0.1**, source gain 1.1 and rate .3.
- `04-world-scale.png`: fixed common WORLD 1:1 placement, unscaled shipped player `x8,y6,z0`, bunker `x19.5,y0,z28`, exact source Classic/Modern/Chase snap-camera formulas at 3:2. Citadel uses ember numbers; gauntlet uses void numbers.

Proof includes Blender reopen/evaluated triangle counts, factory-clean GLB reimport, independent stdlib binary GLB traversal (not accessor bounds alone), finite/unit-aligned normals, and zero degenerate triangles. CPU tests cover 60 isolated fixtures through JSON **and actual GLTFLoader GLB** paths; exact surfaces/RNG/aAnim/hue/gain; 148 complete source chunks with all **non-bunker buffer bytes** identical after removing only bunker spans; caller RNG/placement/emitter/deck-surface equality; eight props merged into three meshes; exact disposal events; 486 finite actual source-camera envelope probes.

The only measured GLB/JSON buffer discrepancy is Blender packed-normal quantization, maximum absolute component error about `4.9621e-5`; positions, UVs, colors and animation buffers are identical. This does not mean the new bunker buffers equal the old 36-triangle bunker — only unrelated/downstream buffers are bit-identical.

## Explicit limitations

All images are **offline native Linux EEVEE / source-lighting approximations**, rendered through software Mesa, not live gameplay or GPU/FPS evidence. Captions are composited in pixel space after rendering, so they cannot cast shadows onto the prop. Studio closeups use neutral area lights for readability. World panels approximate source directional colors/directions/intensities but use a uniform world instead of the real hemisphere/PMREM sky; the deck/channel/lane/seams are labeled CPU/evidence geometry doubles. Average hull-map RGB proxies stand in for procedural map/normal/roughness textures. AgX +0.6 is not Three ACES exposure1.02. Source fog, post-FX/bloom, shader rims, live occlusion and streaming performance are not reproduced. Warm cue response is approximate offline emission, not an exact shader image match. The dark warm-lit source-world bunker is intentionally subordinate to the player and not a target cue.

CPU material and 1×1 DataTexture doubles test data flow and ownership only; they do not exercise the source texture forge or real shader compilation. Camera probes use the actual source high-quality clipping planes `.35/1344` and check finite projection, not all-envelope visibility or player/camera blocking. Offline cameras match source rig pose, FOV and orthographic extent but use clipping `.1/1000`; no full projection-matrix identity is claimed. Production integration, live WebGL visual QA, receiver-side archive verification and final acceptance belong to the orchestrator. Formal Opus review/polish remains deferred.

## Reproduction

Use native **Blender 5.2.1 LTS build `9e2066aef7ef`**, engine enum `BLENDER_EEVEE`, four Blender/software-render threads, 24 samples, AgX Medium High Contrast, exposure +0.6. No installation or Windows Blender is involved. The external local wrapper is tooling and deliberately excluded from the archive.

Run from the repository root with Node 24 and existing Three 0.185.1 (or resolve installed `three` normally):

```sh
node asset-work/bunker/initial/source/build-geometry.mjs
node asset-work/bunker/initial/source/measure-source.mjs
node asset-work/bunker/initial/source/validate-runtime.mjs
blender -b -t 4 --python asset-work/bunker/initial/source/build-blender.py
blender -b -t 4 --python asset-work/bunker/initial/source/verify-blender.py
python3 asset-work/bunker/initial/source/audit-glb.py
python3 asset-work/bunker/initial/source/make-sheets.py
```

If `three` is not installed in the repository, use `THREE_ROOT=/absolute/path/to/existing/three node --loader ./asset-work/bunker/initial/source/three-loader.mjs ...`. Do not install or transfer dependencies. The validator requires the generated GLB, so on a fresh rebuild export it first using `BUNKER_EXPORT_ONLY=1`; the already-delivered GLB makes the listed sequence valid. Saved `reference/src` copies preserve the exact inspected production sources; source harnesses intentionally import the actual repository for comparison.

`SHA256SUMS` covers **every regular file inside initial except itself**. Archive and sender receipts live outside the read-only initial snapshot. Transfer allowlist is asset/source/reference-source/evidence/metadata/checksums only; no wrapper, Blender/runtime/library/cache/node_modules/temp or unrelated asset work is included.
