# DRIFTING WRECKAGE SCENERY KIT — INITIAL

Frozen initial / best effort, `pending_deferred_opus_review`. **0 formal reviews and 0 formal fix passes.** Requested Sol XHigh at available speed; executed T3 Code / Codex `gpt-6.1-sol`, `xhigh`. No delegate, helper or Claude retry. No service-tier override was exposed. Source baseline `ee221ad`; no production files edited.

## What is included

- Two newly authored open hull-fragment templates: **gutter-keel, 532 triangles** and **sheared-chine, 480 triangles**. Each has one dark and one neon primitive. Continuous thick shell, jagged end rims, four fitted lap plates, attached exposed frames/longerons/conduits, four small ember faces. The cavity is empty geometry, not a black decal.
- `asset/drifting-wreckage-kit.blend`: editable named part objects in two variant collections. Canonical pivot and game-axis conversion retained. All dependencies packed; no external image dependency or new texture. The second collection is hidden by default; enable it to edit its separately named parts.
- `asset/drifting-wreckage-kit.glb`: both variant roots as a kit; **107,828 bytes**, four primitives total. Never render the whole kit for one wreck.
- `asset/runtime-templates.json`: explicit linear-color and ember-slot reconstruction sidecar, needed for game `Batch`/shader behavior. GLB alone is not a custom-shader integration.
- `manifest.json`: named node/part/material map, measured budgets/bounds, exact model/settings, ownership, validation and limitations. `SHA256SUMS` covers every file except itself.

## Scope and exact source contract

Only replace the body of the existing `Fortress._voidProps` **drifting wreck** `if (rng.bool(0.5))`; leave the test and every other branch untouched. This deliverable provides a prototype/recipe and does **not** install a runtime change. It adds no collisions, cover, movement, spin, spawning, effects or damage/detach behavior. Asteroid/station/gate/dreadnought/carrier and player/aim/flight limits are unchanged.

The source costs 120 triangles: 12 tapered hull + 60 rib boxes + 48 ember boxes. A taken branch uses **32 RNG draws including its bool test, 31 afterward**. An absent branch uses one. Consumption order is measured, not inferred from an assumed fixed asteroid count: the asteroid loop's random loop condition is reevaluated each time. All original draws are retained, including obsolete ember width/position draws. The new four ember faces are attached to the shell, so their locations deliberately differ from the old floating boxes; their four original modes/rates/phases, orange tint and gain remain source-controlled.

The original tapered hull rotates +90deg X and then by source bank, then source yaw; it extends **forward from Z=0 to 1.8s**, not symmetrically about Z. Cached geometry is in that pre-bank game frame. Wreck X/Y/Z, uniform `s=10..22`, bank and yaw are unchanged. Variant choice hashes already available RNG state/chunk index without any new game draw.

Every new vertex lies inside the original convex nominal tapered hull. Therefore all triangle interiors remain inside it under **all** allowed continuous transformations. Evaluated AABBs for 36 size/bank/yaw cases are labeled samples, not continuous extrema. The conservative continuous original-envelope X clearance is **12.05987 units beyond the unchanged |X|<=16 flight corridor**. This is a visual-envelope proof, not collision logic. Ribs/embers in the original source have smaller X support. Do not narrow gameplay ranges.

**Source material correction:** at `ee221ad`, `materials.darkMetal` has no texture maps. Retain that exact shared `MeshStandardMaterial` (0x3a4a5e, metalness .5, roughness .46, vertex colors), source AO/lifts and box-projected UV behavior. There is no source darkMetal texture to claim we preserved. No new material/texture clones per part or wreck are needed. The neon bucket binds existing `materials.neonVertex` and reconstructs `aAnim`; existing `uLightTime` remains authoritative.

## Actual Batch prototype and lifetime

`source/wreckage_runtime.mjs` prepares typed arrays once before gameplay. `emitReplacement(batch,rng,z0,templates)` is called **inside the existing taken branch**, consumes exactly the old 31 draws, and directly appends transformed vertices through actual `Batch._bucket` / `_vertex` to existing `dark`/`neon` buckets. The helper reuses one scratch triangle, does not allocate per-piece/per-wreck meshes, does not clone GLTF roots/materials and does not generate meshes per frame. Chunk construction alone does vertex stamping, followed by the original `Batch.merge`.

The chunk owns the two final merged geometries; actual source `_disposeChunk` disposes each once. Shared materials/textures/templates survive chunk retirement and are released at existing shutdown only. `releaseWreckageTemplates` drops template references then. Cache typed arrays total **112,332 bytes**; chunk vertex payload is measured separately. This is not GPU/driver memory.

`source/prove_runtime.mjs` evaluates the actual source class bodies with real Three.js 0.185.1 (CPU), not a fake Batch. Across 64 full void-prop trials in sectors 2/4 it proves equal entire RNG sequences/state, next 32 draws, and exact binary geometry attributes for all operations outside this branch, including landmarks/rocks/station. It also checks transformed normals/UV/AO against source `Batch`, `aAnim` per vertex and actual chunk disposal events. Camera math uses actual `CameraRig.snap` / `FlightCamera`, with explicitly listed browser storage/media/navigator stand-ins. No renderer/WebGL context is created.

## Reproduce without installing anything

Use the already available native Linux Blender **5.2.1 LTS, build 9e2066aef7ef** and existing sysroot environment. The external local wrapper `asset-work/wreckage/blender.sh` is tooling only and intentionally not distributed. Do not use Windows Blender or install/reinstall dependencies. Set `PAYLOAD` to a **new writable output copy**, `REPO` to the baseline checkout and `THREE_ROOT` to an existing Three.js 0.185.1 package directory; preserve this frozen initial directory.

```sh
node "$PAYLOAD/source/measure_source.mjs" "$REPO" "$THREE_ROOT" "$PAYLOAD/checks/source-measurements.json"
"$BLENDER" -b -t 4 --factory-startup --python "$PAYLOAD/source/build_wreckage.py" -- "$PAYLOAD"
node "$PAYLOAD/source/prove_runtime.mjs" "$REPO" "$THREE_ROOT" "$PAYLOAD"
"$BLENDER" -b -t 4 --factory-startup --python "$PAYLOAD/source/verify_blender.py" -- "$PAYLOAD"
python3 "$PAYLOAD/source/glb_audit.py" "$PAYLOAD/checks/glb-binary-audit.json" "$PAYLOAD/asset/drifting-wreckage-kit.glb"
python3 "$PAYLOAD/source/independent_template_audit.py" "$PAYLOAD"
"$BLENDER" -b -t 4 --factory-startup --python "$PAYLOAD/source/render_evidence.py" -- "$PAYLOAD" "$REPO"
```

Generator geometry/selection is deterministic. Blender save container metadata is not asserted byte-identical across machines. No formal review/fix pass is hidden in implementation debugging or validation.

## Evidence and limitations

`evidence/` contains actual offline EEVEE renders: six shipped references (normalized inspection sheet), four common kit views, two structural closeups, frame/conduit isolation, Classic/Modern/Chase common **WORLD-scale** images with the unscaled shipped player, and same-scene Classic source baseline. Frame isolation is evidence-only visibility, never a detach/damage runtime feature. `checks/viewed-evidence.json` records which PNGs were actually opened and inspected.

WORLD images use source-exact camera poses/projections and deepspace key/rim numeric parameters, actual Batch positions/colors/AO and source t=0 flicker values. The examples are **framing-selected original-seed placements**, not average gameplay composition; no placement/scale/rotation is edited to fit. Initial cropped examples were replaced during evidence preparation, without changing the asset geometry. Blender hemisphere/environment is an **approximation**, not source sky/PMREM/FogExp2/bloom/tone mapping. No live WebGL/GPU shader acceptance, performance or final visual acceptance is claimed. Existing native wrapper requests software graphics; render logs retain EGL/cache warnings rather than hiding them. Source darkMetal is very low-key in WORLD views; final readability acceptance remains deferred.

Aggregate wreck-only proxy: 624 windows per draw distance across 12 seeds, 24 chunks each, 90 behind. Observed maxima at 320/440/560/700 ahead are 6/6/7/9 wrecks, 3,088/3,140/3,672/4,632 triangles and 409,344/416,208/486,720/614,016 attribute bytes. These are **finite observed proxy results, not live maxima**; landmarks, unrelated scene geometry, driver allocations and CPU buffer capacity are excluded. Existing two buckets may already exist, so occupied wreck-bucket count is not incremental draw calls.

Frozen payload contains only assigned asset/source/reference snapshots/evidence/checksums; no runtime binaries, wrappers, libraries, dependencies, caches or unrelated asset work. Archive and sender-only receipt live outside `initial/`. Transfer uses only the authorized Windows Tailscale CLI `file cp` to `100.112.66.64`, with the archive path converted through `wslpath -w`. Receiver verification belongs to the orchestrator. Opus review/polish remains **DEFERRED**.
