# Fortress bulk fuel depot — INITIAL

`pending_deferred_opus_review` — **0 formal reviews, 0 formal review/fix rounds**.

This is passive `Fortress._fuelDepot` airfield-shoulder scenery, not the active
`FuelCell` enemy backed by `public/models/fuel.glb`, nor the fuel pickup. Two
horizontal steel vessels have continuous fitted shells and formed closed heads,
four fitted saddles, four retaining straps, a connected longitudinal manifold,
cross-header, risers, valve flanges/levers and restrained end service plates.
There is no health, collider, target, reward, shootable state, emitter, neon,
explosion, door, animation or new mechanic. No shipped/old contest geometry is
incorporated into the depot. The shipped player appears only in evidence.

## Measurements

- Original real Batch: 272 triangles (`hull` 64, `dark` 208), two buckets.
- Authored/evaluated/reimported/binary-audited result: **992 triangles**,
  `hull` 384 + `dark` 608; two GLB primitives, two existing runtime buckets.
- Nominal local bounds: `[-2.92, 0, -4] .. [2.92, 3.1, 4]`.
  Evaluated float32 bounds: `[-2.9200000762939453, 0, -4] ..
  [2.9200000762939453, 3.0999999046325684, 4]`.
- GLB: 103,276 bytes, zero textures/images, below 768 KiB. The packed editable
  blend contains 20 named authoring parts. Those objects are **not** runtime roots.
- Original caller remains `rng.bool(.6)`, X `19.5..24`, Z `chunkZ+10..chunkZ+86`.
  Seeds 1/7/42/123 produce 32 depots in 64 eligible first-airfield chunks in this
  finite sample (observed 0.5, not a replacement for the caller probability 0.6).
- Method consumes **zero game RNG draws**. Full original `_buildChunk` comparisons
  across those 64 chunks prove exact caller placements, all prefix/downstream
  float buffers excluding the intentionally replaced depot spans, all surface
  records, emitter values/phases, and rear-obstacle end-Z data.

## Runtime handoff — not installed in production

Use `source/FuelDepotRecipe.mjs` and `asset/fuel-depot.template.json`. Parse the
document and call `createFuelDepotRecipe(document)` **once during startup**, before
chunk construction/shader prewarming. Retain that recipe for the application
lifetime. The GLB is an interchangeable inspection/authoring deliverable, not a
per-prop GLTF scene to instantiate.

Replace only the body of `_fuelDepot(batch, rng, x, z)` with
`fuelDepotRecipe.stamp(batch, rng, x, z)`. Leave its caller and argument evaluation
order untouched. Each call uses real `Batch.stamp` twice; Batch supplies world UV
projection at scale 3, existing contact shading and front/side lifts. Cached linear
vertex tints multiply only the newly appended colors. No per-prop roots, materials,
textures, lights, emitters or new draw buckets are created. `hull` binds the existing
**mapped** `materials.hull`; `dark` binds the existing **unmapped**
`materials.darkMetal`. Do not use the GLB proxy materials as production replacements.

When `batch.captureSurfaces` is enabled, the recipe appends precisely the original
four saddle-box records, preserving expression order and float values. These are
guide/reticle surface captures, **not colliders**, and intentionally retain the
original top 0.9 even though the new saddle interface is fitted to the vessel.

Retire chunks through the existing `_disposeChunk` exactly once. The real source
lifecycle test observes two chunk geometry disposal events per retirement while
the cached templates, material identities and shared texture survive. Call
`fuelDepotRecipe.dispose()` only at application shutdown, beside
`disposeFortressTemplates()`. It disposes the two cached geometries idempotently;
the application's existing material/texture owners retain responsibility for
their shared resources. No per-frame rebuild is introduced.

## Inherited limits — do not claim full clearance

At the minimum center X 19.5, original support starts at X 16.58, only **0.58**
outside the nominal lane edge X 16. The player's **1.5-radius envelope can overlap
decorative scenery** there. The new graphics fit inside the measured original
envelope; they do not solve that inherited limitation. Player center flight ranges
remain X `-16..16`, Y `1.3..25`; no flight or aim range is narrowed. Endpoint
translation probes and sampled placements are finite tests, not a proof of
full-sphere clearance, all camera/input/aim states, or every float32 translation.

## Evidence and limitations

`evidence/source-measurement.json`, `runtime-proof.json`, `binary-audit.json`, and
`blender-reopen-reimport.json` contain the source, CPU and binary proofs.
`camera-projection-proof.json` additionally checks actual Three screen projections
against Blender's independent camera projection for all three rigs. The two
shells each have zero welded boundary edges; fitted pipe intersections are not
boolean unions. Straps deliberately omit their hidden inner faces and are not
individually watertight.

The six craft PNGs cover front/opposite/top/endcaps and full-resolution endcap /
strap / saddle and manifold / valve joint closeups. Six WORLD-scale PNGs share
the same measured source depot placement, shipped player GLB at scale 1, stationary
valid player pose, actual source Classic/Modern/Chase camera `snap` transforms and
projection settings. Source and candidate use identical framing, lighting and deck.
This is an **isolated source-deck fixture**, not the complete neighboring scenery.
PNG label bands and contact sheets do not retouch the underlying render pixels.

All images are **offline EEVEE/source-lighting approximations**. Dusk key/rim colors,
directions and powers are approximated in Blender, with an ambient world instead
of Three's hemisphere/environment response. The actual source procedural mapped
hull/normal/roughness textures, rim shader, fog/sky/postFX/HUD, shadows' exact engine
response, motion and live visibility are not reproduced. CPU material doubles and
one placeholder shared Texture test ownership, not rendering fidelity. No live
WebGL/GPU/FPS, final acceptance, exhaustive lighting sweep, or formal Opus review
is claimed. Geometry and normals show finite low-poly facets in closeups by design.

## Reproduce

Use Python 3 standard library, the project's existing Three 0.185.1, and the
existing native Linux Blender **5.2.1 LTS build `9e2066aef7ef`**, four threads,
`BLENDER_EEVEE`. No installation or Windows Blender is needed. The external
sysroot/Blender wrapper is local tooling and deliberately excluded from this pack.

1. `python3 source/generate.py`
2. From the unchanged repository root, run Node with
   `--loader ./asset-work/fuel-depot/initial/source/source-loader.mjs` and execute
   `source/measure-source.mjs`, then `source/validate-runtime.mjs` at their full paths.
   `FUEL_THREE_ROOT` may point to an already available Three package; none is shipped.
3. Blender `--background --threads 4 --python source/build-blender.py` builds and
   renders; append `-- --export-only` to build/export without renders.
4. Blender `--background --threads 4 --python source/verify-blender.py` reopens the
   saved blend, then cleanly imports the GLB. `python3 source/audit-glb.py` independently
   checks binary accessors, scene-transformed bounds, triangle counts, colors,
   materials, winding, nondegeneracy and canonical geometry within recorded tolerances.
5. Run `source/label-evidence.py` **once** after rendering, inspect the PNGs, then
   finalize metadata and freeze. Do not regenerate inside the immutable delivered pack.

The deterministic claim covers recipe/template generation and source RNG behavior,
not byte-identical Blender save metadata or stochastic offline render noise.

## Freeze / delivery

`SHA256SUMS` covers every content file under `initial/` except itself. The immutable
pack includes asset, authored source, metadata and evidence only. Archive and sender
receipt remain outside `initial/`; no wrapper, binaries, packages, sysroot, cache,
temporary files, unrelated builders, production edits, commit, push or deployment
are included. Receiver verification is the orchestrator's responsibility.
