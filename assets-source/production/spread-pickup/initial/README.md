# SPREAD-SHOT PICKUP — INITIAL

Status: `pending_deferred_opus_review`. Implementation delivery only; **zero formal
reviews and zero formal review/fix passes**. Technical self-check corrections
before freezing are not a review round. No helper, Claude retry or Opus work ran.
Only `asset-work/spread-pickup/` is written. Production code is unchanged.

## Asset and deliberate kit reuse

`asset/spread-pickup.blend` is editable, pack-all saved, library/texture-free;
`asset/spread-pickup.glb` contains three meshes/material primitives, no halo,
animation, texture or atlas. `scripts/build_spread.py` constructs every vertex.
The fitted broad triple chevron is newly authored, not the old procedural mesh,
shield emblem, projectile, gun, cross, drum or mine. Three independent ascending
chevrons remain unmistakable without color. Their center offsets retain source
`y=-.8,0,.8`. Detail is concentrated in broad chamfer bands, eight rim locks and
six backplate shoulders; not micro-noise.

Deliberate reuse is **not hidden**: the delivered shield INITIAL's loft/annulus
builder conventions, shared rim/backplate kit profile and slate-metal language
inform this newly generated mesh. Its diagnostic wrapper, binary inspector,
clearance verifier, offline renderer and pure-Python PNG compositor were copied
and adapted. `kit-reuse.json` identifies original paths and SHA-256 hashes.
The shield GLB is read-only in a labeled kit-reference render, never imported
into the badge generator, merged into export or changed. Approved shipped
`public/models/player.glb` is another read-only, world-scale render reference.
No parked-fighter art or generator was read. Its existing **third-party Three.js
0.185.1 runtime dependency only** is read to execute actual source tests; this
dependency use does not delegate work or modify that build.

## Measured geometry and coordinates

Authoring conversion is Blender `(gameX,-gameZ,gameY)`, exported Y-up to glTF
`(blenderX,blenderZ,-blenderY)`. The game badge is XY; **+Z faces the camera**.
There is no normalization, corrective rotation, import scale or collider edit.
GLB roots have identity transforms. Source-scale outer shell radius is 2.045;
hex foundation radius1.64, depth .16, pivot z=-.30. Its broad peripheral
shoulders are extra editable detail, not a collider. Shell back/front extent,
shape depth and all evaluated mesh bounds are numerically recorded in manifest.

| Handle | GAME local pivot | Dynamic owner |
| --- | --- | --- |
| `spread_pickup_root` | (0,0,0) | Imported identity child of existing Pickup.group |
| `shell` | (0,0,0) | Source Z spin and uniform pulse; no halo descendant |
| `core` | (0,0,-.30) | Static foundation |
| `shape` | (0,0,+.10) | Source Z wobble, original pivot retained |

Evaluated saved blend, reopened blend, clean-scene GLB reimport and an independent
stdlib binary decoder agree on **1,208 triangles / 3 material primitives / 3 mesh
nodes**, versus the actual spread source's **540 triangles** (384 shell / 24 core /
132 shape). Export is about89KiB, comfortably below512KiB. `manifest.json` stores
exact byte sizes/hashes, bounds, axes and evaluated counts. Flat-normal/color
seams split export vertices: raw imported edge boundaries are expected;
position-welded topology is closed. Native source components are manifold.

## Runtime/ownership recipe ONLY — not production integration

First extend `ImportedModels.js` synchronous template preload with `spread-pickup`
and expose its existing private `instantiate()` clone path. Each instance must
own cloned geometries and materials; template materials/geometries/textures
remain template-owned. Call the normal `Pickup` constructor in full, preserving
kind/definition/color/score/alive/radius, group/pos/scene attach, shared halo cache,
`phase=Math.random()*TAU`, `baseY=y` and `velocity=new THREE.Vector3(0,0,0)`.
**No early constructor return.** Only then, for kind spread, call delivered
`attachImportedSpread(pickup, importedRoot, mats)`. Keep other kinds procedural.

The recipe removes the old procedural meshes without disposing their shared
cached geometry/materials, attaches an identity cloned root, and binds named
`shell/core/shape` handles. It clones the **unchanged Materials-owned**
`mats.neon(0xffb43a,1.15)` and `mats.neon(0xffb43a,1.35)` responses for shell/shape,
enables neutral vertex-color multipliers on those **owned copies**, and disposes
the two superseded imported material copies. Shared Materials caches themselves
are neither modified nor disposed. Core retains its cloned PBR palette material.
GLB nominal unlit base factor is exact linearized sRGB #ffb43a; source neon gains
are intentionally supplied at integration, not silently replaced by white or a
different strength. Neutral COLOR_0 means the exact original neon color response
survives those multipliers. GLB JSON normalization in the generator explicitly
encodes this material factor after Blender export; geometry is not patched.

**Add imported-resource cleanup specifically to `Pickup.dispose()`**. Its current
implementation is detach-only because procedural resources are shared. Future
integration must implement the equivalent of:

```js
dispose() {
  if (this._importedRoot) {
    disposeModel(this._importedRoot);
    this._importedRoot = null;
  }
  this.group.parent?.remove(this.group);
}
```

`releaseImportedSpread()` demonstrates that idempotent path, but is a recipe, not
a claim the source now uses it. Never `disposeModel(this.group,true)`, never
dispose the shared halo material, Materials-owned neon or core material, source
cached geometries, template geometry/materials/textures or halo glow texture.
`disposeImportedModels()` retains global template teardown ownership.
Shared `mats._pickupHalos` stays color-keyed and externally owned, additive,
depthWrite=false, toneMapped=false, opacity .35. Export adds no halo or glow
texture. Existing halo stays a sibling under Pickup.group, so mesh-local
spin/pulse/wobble cannot scale/rotate it or change root orientation/position.

## Untouched actual source rules

- Kind `spread`; color `0xffb43a`; label `SPREAD`; score250; radius2.2.
- `Game._applyPickup` calls **Player.grantSpread(14)**; max(existingTimer,14),
  timer decays max(0,timer-dt). No new weapon behavior or projectile effect.
- Actual collection threshold is radius2.2 + player radius1.5 = **3.7**.
  `Game._collideContact` marks alive=false, applies20 pickup sparks, .5→12 ring
  over.42s, light flash, HUD1.15s, source score without chain scaling, source
  audio and .18 amber postfx flash. Still frames do not reproduce that pipeline.
- `phase+=dt`, root quaternion copies camera, shell.rotation.z+=dt*.3,
  shape.rotation.z=sin(phase*2.2)*.08, shell uniform1+sin(phase*4)*.025,
  halo scalar7*(1+sin(phase*4)*.2), opacity.35. No narrowed motion.
- If distance<22 and player.alive, toward-player strength(1-d/22)^2*60 timesdt.
  Otherwise y=baseY+sin(phase*1.6)*.7; velocity retained though not integrated.
- Source unseeded Math.random initialization remains; phases are controlled
  **only for diagnostics**. No TTL. Drop altitude floor3; source update culls
  z<player.z-55 or !alive; collection detaches on the next pickup update.
- Charge and special detach modes: **N/A**. No bubble, magnet beam, firing cue,
  targeting mechanic, new particles, collision effect or animation is added.

## Verification, evidence and limits

Actual saved Pickup, Materials.neon/sprite, Game methods, Player.grantSpread,
timer statement, CameraRig/Settings/FlightCamera, enemy mine constructor,
ImportedModels.instantiate and Dispose.disposeModel execute with **actual
Three.js0.185.1, BufferGeometryUtils and actual GLTFLoader**, not geometry/math
stubs. VM only replaces module imports; effect/HUD/audio dispatch endpoints are
recording sinks. 128 actual imported instances verify384 owned geometries,
384 retained materials,256 superseded copies disposed once, no neighbor damage,
and retention of source Materials caches, template resources and halo texture.
This is not a WebGL/GPU-memory test or a production integration.

1,080 independent mesh BVH combinations cover shell angles0..355 step5°, three
pulse scales and five wobbles. Another241 poses use values actually recorded
from source update over1,200 frames/20s. No triangle-overlap pairs. A conservative
separating-cylinder lower bound covers **all angles and full pulse/wobble ranges**,
not merely sampled phases. Finite nearest vertex-to-triangle measurements are
not an exact global triangle-interior surface-distance solver. Exact measured
numbers and float/topology limits are in `evidence/blender-verification.json`.
Maximum actual visual sphere stays below the unchanged2.2 collider radius.

PNG evidence includes multiview, source-coupled and independent endpoint motion,
exact-amber nominal and source-gain front views, Rec709 grayscale, actual-source
shield/repair/fuel/mine silhouette cues, camera-facing Classic/Modern/Chase near
and far comparisons, native-resolution crops, magnet/drift/collection lifecycle
contexts, shared-world-scale source/shipped-player/kit comparisons and36 imports.
`evidence/viewed-pngs.json` records images actually opened, not just generated.

**Visual limitations:** Blender Eevee offline reconstruction, not live browser
gameplay or pixel-identical Three output. Actual source rig settings/quaternions,
projection and geometry are used; the deck, hemisphere, vertex normals, source
rim shader, halo blend and postprocessing are approximations. Halo proxy matches
source size/opacity breathing but not additive Three/postfx pixels. Collection
stills show pre-contact threshold and next-update removal, not a recreated
particle/HUD/audio system. Tiny far-camera views cannot guarantee separation of
all three stripes; native pixel sizes are reported without enlarging the asset.
No formal art acceptance, live gameplay QA or GPU performance claim is made.

## Rebuild from a writable copy

Dependencies: Blender5.2.1LTS, Python3 stdlib, Node>=22.12, Three.js0.185.1.
No downloads or installers are included. Existing Linux native runtime/sysroot
wrapper is delivered; override BLENDER_BIN/BLENDER_SYSROOT_LIB as needed.
Set THREE_ROOT to an installed Three package directory on another machine.
Reference renders additionally need the shipped repository assets and read-only
delivered shield INITIAL, whose hashes are listed in the manifest.

```sh
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/build_spread.py
node scripts/source_probe.mjs
python3 scripts/inspect_glb.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/verify_blender.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_evidence.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_cues.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_extra.py
python3 scripts/compose_evidence.py
python3 scripts/finalize_manifest.py
```

Frozen INITIAL must never be edited. `SHA256SUMS` covers delivered files except
itself; archive hash and Taildrop receipt are outside INITIAL. Future authorized
Opus review/polish belongs in a separate revision, never this frozen delivery.
