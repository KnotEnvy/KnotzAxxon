# Parked Fighter INITIAL

New gameplay-target asset built on NitroBliss. `pending_deferred_opus_review`; zero formal review/fix rounds. This is a verified frozen INITIAL, not final art approval.

## Files

- `build/parked-fighter.blend`: packed native Blender file, 103 separately editable source parts with fitted bevel modifiers, a baked runtime mesh, named dynamic pivots, and nonexporting neutral camera/light rig. Toggle `EDITABLE_PARTS_not_exported` on and `RUNTIME_export_only` off to edit original parts without overlay. The generator regenerates the baked runtime from the source design.
- `build/parked-fighter.glb`: Y-up, unit-scale, -Z-nose asset with five visible primitives; no textures/animation.
- `manifest.json`, `RUNTIME_MAP.md`: measurements, exact runtime/material/pivot ownership and unchanged source integration contract.
- `source/`: actual procedural baseline reference geometry **for evidence only**, decorative reference parts, source hashes/excerpts and source-executed motion/camera/density samples.
- `scripts/`: original generator, Blender wrapper, binary inspector, native reopen/reimport check, source contract runner, isolated runtime binding tests, offline evidence renderer and freeze script.
- `evidence/`: individual PNGs, contact sheet, checked render settings and verification reports/logs. Offline reconstruction is explicitly **not live gameplay proof**.
- `SHA256SUMS`: every delivered file except this checksum manifest.

The source-part and baked-runtime collections are intentionally separate. There is no automatic live link: manual Blender edits can be made directly on the runtime mesh, or source parts can be deliberately rebaked before export. Running the generator recreates its scripted design; it does not load arbitrary hand edits from an existing blend.

## Reproduce without modifying the frozen directory

Copy `scripts/` and `source/` to a new scratch staging directory in the same checkout or set `PARKED_FIGHTER_REPO` to the unchanged source repository. Never run generators inside immutable `initial/`. The scripts write outputs alongside their scripts directory. Do not replace native runtime tooling, fetch git, or install packages for this asset.

Native runtime used: Blender **5.2.1 LTS**, build **9e2066aef7ef**, Linux x64; EEVEE enum `BLENDER_EEVEE`; 4 Blender threads, 4 llvmpipe threads, 16 evidence-render samples (24 in saved editable studio), AgX. `scripts/blender.sh` uses the pre-existing runtime/sysroot outside this delivery. Those binaries, sysroots, caches and scratch dependency files are **not** included.

Source execution requires Three.js **0.185.1**, verified against `package-lock.json` SHA512. It was extracted as a standalone temporary runtime (not installed into the repo). In staging, supply the same runtime under `.runtime/three`, `.runtime/node_modules/three` pointing to it, and have Node 24+ available. The source runner creates import-rebound temporary modules without changing source implementation. The browser settings and audio environment are stubbed; flyby calls are counted, not played. A prepared repo's matching Three runtime can be used instead. The final GLB itself has no such tooling dependency.

Run, in order, from staging using the copied scripts:

1. `node scripts/source_contract.mjs`
2. `bash scripts/blender.sh -b --factory-startup --python scripts/build_fighter.py`
3. `python3 scripts/inspect_glb.py`
4. `bash scripts/blender.sh -b --factory-startup --python scripts/verify_blender.py`
5. `node scripts/verify_runtime.mjs`
6. `bash scripts/blender.sh -b --factory-startup --python scripts/render_evidence.py`

Read `evidence/render_settings.json` for exact cameras and scales. Common neutral: camera `(-16,24,-30)`, target origin, vertical orthographic span 14; key `(-12,22,-12)`, fill `(14,12,8)`. Detail views explicitly use tighter spans; source/new common views and offline gameplay references are never separately normalized. Classic uses source vertical span 80 at 16:9; Modern/Chase source perspective FOVs and snap rigs. New fighter and procedural baseline use world offsets only, never per-model scale. The shipped player is unchanged at unit scale beside them.

For action illustrations, the neutral camera **and area-light rig** translate with the sampled world root position while the deck remains fixed; this keeps launch/cap geometry readable without changing source poses or scale. Offline gameplay images instead use the source-derived dusk directional-light rig. Blender empty `hide_render` does not cascade, so the evidence renderer explicitly mirrors the beacon pivot visibility to its lens; Three's runtime group `visible` already cascades and is verified separately.

## Remaining limits

- No production imported adapter exists for parked fighter yet; source/public/docs were not edited. Orchestrator owns integration and receiver hash verification.
- No live WebGL/gameplay test, browser screenshots, frame-time/GPU profiling, multiplayer or actual spawn-max claim. Density 10/355 is a deterministic proxy over seeds 1..100 and loops 0,1,3, not a live maximum.
- Offline Blender game scenes reconstruct actual source camera rigs and dusk directional light parameters. Blender world approximation is not Three HemisphereLight, procedural source shader rims, fog, bloom, tone mapping and game postprocessing. Render labels are added for evidence, not exported.
- Canopy is intentionally opaque stylized glazing, not transmissive glass. No atlas, transparent cockpit interior, gear retract, detach, skeletal animation or weapon mechanics.
- Landing-gear contact and source-motion clearances are sampled numerically, not continuous rigid-body collision certification. The root remains the source deck-based hit sphere, including source launch/cap peculiarities.
- Engine disk preserves source radius .24 and initial scale .3; it is deliberately small at idle and front-occluded, only aft-visible. Beacon preserves source radius .18 and visibility timing. Small-gameplay PNGs may resolve only silhouette and broad cues.
- Native EEVEE software initialization prints EGL_BAD_MATCH fallback warnings, but actually renders the supplied PNGs. Verification reports and viewed-image record distinguish renders from live gameplay.
- Requested/actual authorized runtime: `codex / gpt-6.1-sol / reasoningEffort=xhigh`; no helpers, no Claude retries, no exposed fast-mode toggle and no fast-mode claim. Opus formal review/polish remains deferred until SuperBeast availability.
