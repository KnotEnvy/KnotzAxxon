# Floating Mine — frozen INITIAL candidate

Status: `pending_deferred_opus_review`. Formal reviews: **0**. Formal review fix passes: **0**. This package records an implementation initial, not final art approval. No helpers or delegated agents were used.

Original editable geometry: a faceted pressure vessel with eight beveled shield panels and six mounting faces; six hexagonal stepped sockets with tapered contacts; seated vent strips and fasteners; four red warning windows over fixed open support rails. Core, contacts and warning windows use three visible primitives. No atlas or external texture is needed. No shipped geometry is incorporated into the Mine. Shipped `player.glb` appears only in reference evidence.

The GLB has **1,940 visible triangles + 20 hidden flash-shell triangles**, **3 visible + 1 hidden material primitives**, and **145,880 bytes**. Transformed rest bounds are approximately **[-1.85,-1.85,-1.85] to [1.85,1.85,1.85]** in game coordinates. The maximum visible vertex radius is 1.850039, within the unchanged 1.9 collision radius. Independent binary accessor measurements, reopened evaluated mesh measurements and clean-scene GLB reimport agree.

`assets/mine.blend` contains editable polygon meshes, face corner colors, all materials and all resources. There are zero external image resources to pack. `assets/mine.glb` has no animations; gameplay remains the animation authority.

## Gameplay and binding

HP **1**, radius **1.9**, score **80**, contact damage inherited as **1**. Keep source targeting priority, collision, warning and lifecycle unchanged. Mine has no shot origins, weapon targeting or detach mechanic: **N/A**. `Game._killEnemy` uses the ordinary size-1 explosion; Mine is excluded from ground wreck kinds, so it leaves no burning ground pad. Generic debris remains game FX owned.

`node-material-map.json` is the exact named node/material/transform/ownership map. `source/runtime_binding_recipe.js` is a reviewable integration recipe, not an installed adapter. Integrate after the original constructor sets HP/radius/score/phase/armed, and before procedural mesh construction. Keep the original `Mine.update` unchanged. Do not independently animate the imported root.

Bind `core`, `lamp`, `flashMesh` to the corresponding Enemy fields. Lamp is a single mesh with origin at gameplay [0,0,0] and unit scale at rest. Its whole geometry scales through the source 0.94..1.06 bound. Replace `MN_Danger` with the shared `mats.neon(0xff3d55,3.2)`; proximity changes pulse speed/scale, **not brightness**. The one-time arm warning occurs for `near > .55` (distance approximately <15.3). No new charged attack or glow state is introduced.

Hide `flashMesh` before the first frame: GLB has no standard visibility channel. It carries a zero-alpha placeholder and `runtime_hidden` extra, but runtime visibility must be set explicitly. Its 1.2 scale is already authored; do not apply another 1.2. Assign an instance-owned additive white `flashMat`, initial opacity 0, render order 5. Do not call `_addFlashShell` again.

Use ImportedModels.js's existing per-instance geometry/material cloning. Leave the four original cloned materials in `root.userData.modelOwnedMaterials`, including replaced lamp/flash placeholders. Materials owns cached neon; `Enemy.dispose` owns `flashMat`. `disposeModel` frees the four cloned meshes and four cloned materials; it must not free shared neon. The delivered CPU ownership fixture exercises the exact source disposal methods and passes, but is not a real GLTFLoader integration test.

## Coordinates and dynamics

Game/glTF: **+Y up, +Z forward, +X right**, world units unchanged. Blender: **+Z up, -Y game-forward**. Construction mapping is `(x,y,z)game -> (x,-z,y)Blender`; GLB Y-up export reverses it. Independent binary inspection checks asymmetric axis markers at game [0,1,0], [0,0,1], [1,0,0]. All dynamic pivots are at gameplay origin, except those non-rendering axis markers. All visible parts and flash shell tumble together.

Preserve source root rotation `x += dt*.5`, `y += dt*.7`; phase `+=dt`; Y increment `sin(phase*1.3)*dt*1.6`. The bob is an integrated per-frame increment, not an absolute sine offset. Three.js XYZ composition is `Rx @ Ry @ Rz`; evidence uses explicit matrices because Blender's native XYZ Euler composition differs. No aim/motion range was narrowed.

61 pulse-scale BVH samples (.94 through 1.06, step .002) have zero intersecting lamp/solid triangle pairs; the minimum sampled vertex-to-surface gap is **0.051100 units**. Analytic construction separation bounds complement finite samples. 64 full-tumble samples cover t=0..126 seconds at two-second steps. Rigid tumble preserves local clearance. Static junctions deliberately seat into their supports. The normally hidden hit-flash overlay is excluded from lamp clearance.

## Evidence and verification

- `measurements/source-contract.json`: exact source hashes, eight proximity samples, 30/60/120 Hz source-motion trajectories, one-time warning check, nine actual camera rig samples, baseline geometry formula and deterministic Level density scan.
- `measurements/glb-independent.json`: independent standard-library GLB accessor, transformed bounds, triangles, primitives, materials, node TRS and axis markers. No reliance on accessor min/max claims.
- `measurements/blender-verification.json`: saved blend reopening, clean-scene GLB reimport, evaluated counts/bounds, pulse samples and tumble bounds.
- `measurements/ownership-verification.json`: exact source disposal exercised with CPU resource fixtures.
- `evidence/contact_sheet.png`: all 24 full renders; individual PNGs remain available.
- `evidence/small_gameplay_sheet.png`: six half-resolution 480x270 gameplay reconstructions, without per-asset normalization.
- `evidence/overview.png`: compact rest/action/proximity/shared-scale sheet.

The common neutral camera is game (-16,24,-30), target origin, orthographic horizontal span 14, key (-12,22,-12), fill (14,12,8). Both the Mine and shipped player receive individual renders at that identical camera/scale. The shared pair uses span 22 to include both, without scaling geometry.

All Classic/Modern/Chase reconstructions use actual source `CameraRig._compute` snapshots, zero boost/velocity, 16:9, altitudes 3 and 22. Classic has half-height 40; Modern vertical FOV 58; Chase vertical FOV 66. They place the shipped player at (0,altitude,0) and Mine at (-5,altitude,20). Dusk source sun/rim positions, colors and intensities are used. World units are shared. These are **offline Blender reconstructions, not live gameplay proof**. No streamed fortress geometry is represented.

Limitations: Blender emissive PBR and ambient-world lighting approximate Three's unlit neon, hemisphere light and PMREM; game sky, fog, bloom, postprocessing, HUD and live streaming are absent. The source methods run with vector/audio stubs; procedural baseline topology is analytic from actual constructor parameters because Three.js is not installed here. Actual Level and Rng modules are executed. No real GLTFLoader, cloned gameplay renderer, frame-time or live density maximum is verified. The density scan peak 24 is a **layout proxy** for a 355-unit window, seeds 1..100 and loops 0,1,3, not a live maximum. Audio warning calls are counted, not audibly captured. Proximity arming is the charge equivalent; separate weapon charge and detach evidence are N/A.

## Reproduction and freeze

Requested/actual implementation runtime: **codex / gpt-6.1-sol / reasoningEffort=xhigh**, available speed; no exposed fast-mode toggle was used or claimed. Native Linux Blender **5.2.1 LTS**, build **9e2066aef7ef** on **NitroBliss**; EEVEE enum **BLENDER_EEVEE**, four render/llvmpipe threads, 32 render samples. Runtime wrapper only was copied from `asset-work/drone/blender.sh`. It uses the prepared native Linux binary and existing sysroot; no binary, sysroot, cache or dependency installation is delivered. Software EGL emitted BAD_MATCH diagnostics before successful rendering. Blender also emitted harmless material API deprecation and read-only extension-cache diagnostics; evidence files were produced and inspected.

Never rerun generators inside frozen `initial/`. Copy the package into a fresh scratch directory under `asset-work/mine/` first and make that copy writable (`chmod -R u+w <scratch>`). From the repository root, invoke `bash <scratch>/source/blender_runtime.sh` with `-b -t 4 --factory-startup --python <scratch>/source/build_mine.py`, then `verify_blender.py` and `render_evidence.py`; use system Python for `inspect_glb.py` and `make_contact_sheet.py`, and Node for `measure_source.mjs`/`verify_ownership.mjs`. The renderer's resume behavior skips existing images, so remove stale evidence only in that scratch copy before rebuilding. `KX_REPO` may point the source harness at the source repository. Runtime paths are Nitro-specific and must be adjusted on other hosts.

Pre-freeze implementation self-corrections included generator coordinate scoping, adding fitted open lamp support rails with reduced contact/detail tessellation, and explicit Three.js Euler conversion. These are initial construction work, not formal review rounds. Opus formal review/polish and orchestrator integration remain deferred.

`SHA256SUMS` covers every delivered file except itself. `initial/` is read-only after freeze. Any later review must create a separate revision; never edit this INITIAL. Receiver-side archive verification remains the orchestrator's responsibility.
