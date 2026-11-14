# Reactor cooling stack — frozen initial

Status: `pending_deferred_opus_review`. Formal review rounds: **0**. Formal fix/polish rounds: **0**. This is implementation and artifact-validation evidence, not acceptance. No helpers, delegated work, or Claude retries were used.

## Assigned scope

Only `Fortress._coolingStack`, called by reactor `_deckProps`. Production `src`, `public`, and `docs` are unchanged. The implementation is an instance-local startup adapter, not a production integration. The source commit is `ee221ad3e05cd66292fe02b71b50f513696bdda2`.

The fitted exchanger has a continuous chamfered tapered shell, four genuinely recessed inlets, four separated fin courses on each face, corner spines, fitted low service hatches/latches, an octagonal foundation, and a fitted cap with underplate supports. The original amber heat surface remains 2.7 × 2.7 × 0.05 at `Y=h+0.19`; the steam reference remains `Y=h+0.4`.

## Deliverables and measured cost

- `cooling-stack.blend`: editable, self-contained, no external images; procedural height attribute and named part ranges retained.
- `cooling-stack.glb`: one identity-transform mesh node, three material primitives; two non-rendered reference pivots; no animation, skins, textures, or external URIs.
- `cooling-stack.template.json`: prepared parametric triangle template. World Y is `restY+(h-9)*heightWeight`; all horizontal coordinates are constant.
- **460 triangles** at every sampled height and at the closed source maximum, split **124 hull / 324 dark / 12 neon**. Three existing chunk buckets, not three extra scene draw calls.
- Designed half-footprint **2.08**, smaller than the source normal 2.1. Source far-shoulder placement `X=20.5..25` is untouched. Minimum visual-to-lane gap is **2.42** from lane edge `X=16`.
- The source player's full radius1.5 retains **0.92** horizontal sphere clearance; its static trace radius1.08 retains **1.34**. An analytic constant-rig eye envelope, including source maximum horizontal shake2.94, retains at least **1.98868** horizontal eye clearance. These are geometry/envelope proofs, not live motion or occlusion acceptance.
- At rest `h=9`, transformed float32 game bounds are approximately `[-2.079999924,0,-2.079999924]..[2.079999924,9.239999771,2.079999924]`. Exact binary bounds/bytes are in `evidence/binary-audit.json`.

## Startup-only streaming prototype

Use the existing fortress and Materials instance. Before the first chunk is built:

```js
import { installCoolingStackPrototype } from './source/install-prototype.mjs';

const cooling = await installCoolingStackPrototype(fortress, {
  templateUrl: 'cooling-stack.template.json',
});
```

No GLTFLoader scene is instantiated during gameplay. The JSON template becomes retained typed arrays before gameplay. Only selected cooling-stack geometry is stamped, in source coordinates, directly into the existing Batch hull/dark/neon buffers. A fresh triangle normal and world-space box UV are computed at chunk build time, not each frame. No per-part or per-prop Object3D, geometry, material clone, or additional RNG call is created. Triangle stamping uses Batch's source shading convention, without replacing source materials, texture maps, fog, or shader clocks.

Retire chunks through the existing Fortress disposal path, exactly once per merged geometry. Neither shared Materials nor their textures belong to the adapter/chunk. On shutdown, retire/clear all fortress chunks first, then call `cooling.shutdown()`, which restores the original method and releases its typed-array references. Dispose the shared Materials library only during the application's existing final shutdown. Repeated adapter shutdown is harmless.

## Exact source semantics

The method consumes `rng.range(7,11)` and `rng.next()` for phase, in that order. It then calls the original emitter wrapper exactly once as `emit('steam',x,h+0.4,z,1)`. That wrapper consumes **its own third original draw** and retains the chunk owner, direction default, and rate. No wrapper replacement, duplicate emitter, fan rotation, flame, damage, collision, or gameplay cover is introduced.

The neon record is `[BREATHE=3,0.4,originalPhase]`, tint `0xff6a2a` in linear RGB, vertex gain `1.2`. In the existing shader, **0.4 is the cycle rate**, while the original brightness law remains `0.55+0.45*sin(fract(clock*0.4+phase)*6.2832)`. Cue gain extrema are 0.1 and 1; including vertex gain, 0.12 and 1.2. No glTF animation supplies the cue.

The source dynamic `for (...; k<rng.int(1,2); ...)` remains entirely untouched and is reevaluated on every condition. Source surface-capture records are reproduced from the original course/cap/cue formulas only if `captureSurfaces` is true. In normal `_deckProps` it is false. The replacement's visually recessed fins do not become new decorative surfaces or physical collision objects.

## Material, tint, UV and node map

`runtime-map.json` is the explicit authoring/runtime contract. `CS_Hull -> Materials.hull`, `CS_Dark -> Materials.darkMetal`, and `CS_Heat -> Materials.neonVertex`. Linear vertex colors are decoded/prepared **once**, never interpreted again as sRGB. Source-style baked vertical/contact/front/side shading is applied to the structural buckets. Source world box projection uses divisors **4 / 3 / 8** for hull / dark / neon; authored rest UVs are interchange evidence, not the runtime UV authority.

The raw GLB materials are only portable offline proxies. Blender's dark multiply-node export does not preserve a base factor, so the deterministic generator explicitly serializes the correct linear dark `baseColorFactor` after exporting; it does not change geometry or vertex colors. Runtime still uses the original shared mapped Materials. GLB vertex colors have a measured maximum linear error below 0.0001 relative to the full-precision template; exact error is in the independent audit.

`CS_CoolingStack` is the single mesh. `CS_HeatSurfacePivot` and `CS_SteamOrigin` are named non-rendered reference nodes, not extra emitters or runtime animated roots. `_CS_HEIGHT` is exported as a scalar vertex attribute. Named construction parts and triangle ranges remain editable in the generator, template, and blend mesh custom properties.

## Evidence and limits

- `source-measurement.json`: actual current Batch measurement for seeds 1, 7, 42, 123: **72–84 source triangles**, three buckets, three draws including the emitter. Source theoretical h=11 courses reach half-width about 2.10818; this prototype still stays within the stricter 2.1 normal footprint.
- `streaming-proof.json`: 16 paired actual `_buildChunk` cases, 24 selected stack calls, full RNG traces, emitters/owners, original surface records, and every downstream non-selected buffer compared exactly. Shared CPU material identity and once-only geometry retirement are tested.
- `height-sweep.json`: 401 actual Batch samples across closed heights 7..11; analytic affine-coordinate endpoint reasoning supplements finite samples. Upper endpoint h=11 is a stress envelope, not a generated Mulberry32 range result.
- `blender-verification.json`: saved blend reopened, then GLB imported into a factory-clean Blender scene; triangles, materials, nodes, bounds and image independence checked.
- `binary-audit.json`: independent standard-library GLB JSON/BIN/accessor/index/node audit, separate from Blender's import/export implementation.
- Five full structure views and 24 original/prototype world PNGs cover actual source Classic/Modern/Chase snap rigs, source height endpoints 7/11 and heat extrema. Comparison sheets have SOURCE left, PROTOTYPE right; rows are h7 min/max, h11 min/max. Whole-frame contact-sheet downsampling never normalizes or moves objects.

All PNGs are **offline native Linux EEVEE**, explicitly captioned. The world fixture invokes the actual source chunk builder with seed42/chunk0 and a synthetic reactor-sector descriptor, omitting gameplay feature records. Original source placements and the other source cooling stack remain unchanged. The shipped player GLB is imported at original scale1 and source reset altitude9; its bytes are not duplicated in this package. The camera is the actual source `CameraRig.snap` projection, checked against Blender's projection numerically.

The CPU material instances and endpoint render RNG objects are honestly labeled stand-ins. The render material proxies omit Three procedural maps, fog, postprocessing, steam particles and bloom. The tests are finite, do not exercise a browser, portrait screens, every campaign feature, camera shake/boost/motion or gameplay acceptance, and provide **no live WebGL or FPS claim**. Opus formal review/polish stays deferred.

## Reproduction and freeze

Do not run generators in this frozen directory. Work from a writable copy under the assigned asset workspace. Source harness imports require the original checkout at the recorded commit and existing Three.js 0.185.1. `source/source-loader.mjs` reads an existing installed dependency (default: the carrier runtime's Three package); `COOLING_THREE_ROOT` can point to any already-present copy. No dependency installation or third-party runtime is included.

Use the authorized native Linux Blender 5.2.1 LTS build `9e2066aef7ef`, EEVEE, four render threads and four software rasterizer threads. The local runtime wrapper is intentionally outside the transfer. Run `generate.py`, the Node source measurement/proof/render-input scripts with `source-loader.mjs`, `audit-glb.py`, `verify-blender.py`, and `render.py`. `contact-sheets.py` uses only Python's standard library. `--prototype-only` refreshes prototype renders without rerendering unchanged source comparisons.

`SHA256SUMS` covers every content file except itself. The manifest records Sol XHigh, exact model settings, build provenance, source hashes and deferred status. The archive, its checksum and sender receipt live outside the immutable initial directory. Transfer success is sender-side only; receiver verification belongs to the orchestrator.
