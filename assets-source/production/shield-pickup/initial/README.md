# SHIELD PICKUP — frozen INITIAL

Status: **pending_deferred_opus_review**. This is an initial implementation,
not final art acceptance. Zero formal reviews and zero formal review/fix rounds.
Initial technical self-corrections (export schema/unlit parity, badge readability,
evidence parity/labels and source-test scaffolding) precede the freeze.

## What is delivered

- `asset/shield-pickup.blend`: native Linux Blender 5.2.1 LTS, build
  `9e2066aef7ef`; editable named meshes and vertex palettes, no destructive source
  imports, no linked libraries, no external textures. Pack-all called.
- `asset/shield-pickup.glb`: production-sized geometry, no halo, no animations,
  no embedded atlas/textures, no corrective root transform.
- `scripts/`: generator, actual-source contract/ownership harness, independent
  GLB decoder, Blender reopen/reimport/clearance verifier, evidence renderer,
  cue renderer, PNG compositor, adapter **recipe**, manifest/freeze tooling and
  native runtime wrapper (script only, not Blender/sysroot).
- `source/`: verbatim applicable production contract snapshots at
  `ee221ad3e05cd66292fe02b71b50f513696bdda2`, not modified production code.
- `evidence/`: measurements, execution logs, individual PNGs, grayscale/native
  pixel crops and contact sheets. `SHA256SUMS` covers all delivered files except
  itself. The archive hash is necessarily external to the archive.

All geometry is newly authored from fitted polygon/loft/annulus constructions.
Approved shipped `public/models/player.glb` is a style and WORLD-scale render
reference only; its geometry is never merged into or exported with the badge.
No failed builders or other assets' geometry/generators were read or reused.

## Runtime coordinates and handles

Game/glTF is +Y up, +Z forward; the badge's own plane is XY and its visible front
normal is +Z. Blender authoring is `(gameX,-gameZ,gameY)`, with `export_yup=True`
producing `(blenderX,blenderZ,-blenderY)` on export. Identity rotations and scales
are verified in the independent binary inspection. **Do not normalize, rotate
or rescale after the game Y-up GLB load.**

| Handle | Original GAME local pivot | Ownership and motion |
| --- | --- | --- |
| `shield_pickup_root` | `(0,0,0)` | Identity imported badge root; child of existing Pickup.group |
| `shell` | `(0,0,0)` | One mesh/material; local Z spin `+=dt*.3`, uniform pulse `.975..1.025` |
| `core` | `(0,0,-.30)` | One mesh/material; static rear hex foundation |
| `shape` | `(0,0,+.10)` | One mesh/material; local Z wobble `sin(phase*2.2)*.08` |

The **existing Pickup.group**, not a newly invented gameplay wrapper, retains
position/`pos` and copies `ctx.camera.quaternion` every update. Its imported child
stays at identity; root camera-facing math does not change. Node/material details
and counted ownership are in `runtime-map.json`.

Materials are `shield_shell_cyan_unlit`, `shield_core_titanium`, and
`shield_shape_ceramic`. Shell and shape use KHR_materials_unlit with deliberate
vertex-color facets (including exact sRGB `#45e0ff`); set their **cloned** Three
materials `toneMapped=false`, matching source neon color handling. Core is PBR
slate metal. No dynamic emission/charge material is needed. Deliberate authored
palettes replace the source's uniform neon gains; the original gains 1.15/1.35
remain documented in source snapshots/baseline renders, not misreported as
identical material responses.

## Adapter recipe — NOT integrated production code

`ImportedModels.js` currently does not preload or expose this asset. In the bound
integration worktree, add `shield-pickup` to the synchronous preload/template
path and expose a builder that uses the existing private `instantiate()` logic.
It clones geometries once per template geometry and materials once per template
material, and writes `root.userData.modelOwnedMaterials` on the returned root.

Run the full normal `Pickup` constructor, including existing halo creation,
`phase=Math.random()*TAU`, `baseY=y`, velocity Vector3, scene attach, radius,
kind/definition/color/score/alive, before replacing shield visuals. Never return
early and skip those fields. Only for `kind==='shield'`, use
`attachImportedShield(pickup, importedRoot)` from the delivered recipe: remove
the old shell/core/shape from the group **without disposing shared caches**,
attach the per-instance cloned imported root and bind the three named handles.
Keep all other kinds procedural.

`Pickup.dispose()` currently only detaches, so integration MUST explicitly call
`disposeModel(this._importedRoot)` once, null that pointer, then detach the group.
`releaseImportedShield()` illustrates that branch. Match `Enemy.dispose()`'s
imported-root ownership path; do NOT call `disposeModel(this.group,true)` or
dispose the halo material/texture, shared Materials caches, source cached
geometry, template geometries/materials, or template textures. Imported template
resources remain owned by `disposeImportedModels()` at global shutdown.
No replacement halo is exported. The existing shared color-keyed
`mats._pickupHalos` SpriteMaterial stays externally owned, opacity .35, additive,
depthWrite false, toneMapped false. Its size remains
`7*(1+sin(phase*4)*.2)`; opacity never gets pulsed or transferred to this asset.

## Untouched gameplay contract

SHIELD / cyan `0x45e0ff` / score 250 / pickup radius 2.2. Player radius 1.5 gives
actual center-distance collection threshold **3.7**, not 2.2 alone. Shield gain
is capped by Player.addShield. Game effects remain source-driven: 20 pickup
sparks, `.5->12` sprite-width ring over .42 seconds, light flash, HUD SHIELD at
1.15 seconds, score award without chain scaling, audio and .18 cyan postfx flash.
No new health, targeting, projectiles, shot origins, collision mechanics, charge,
detach, deployed shield bubble or magnet beam is added.

`phase+=dt`; shell spin `.3rad/s`; wobble `sin(phase*2.2)*.08`; shell pulse
`1+sin(phase*4)*.025`. Source Math.random initialization remains unchanged;
controlled phases are only diagnostic render/test inputs. At distance<22 and
player.alive, strength `(1-d/22)^2*60` moves toward player times dt. Otherwise,
Y is `baseY+sin(phase*1.6)*.7`. Velocity Vector3 is retained though source update
does not integrate it. No timed TTL or seeded hard maximum exists. Culling is
`pk.pos.z < player.pos.z-55 || !pk.alive`, with the source update/collection order
unchanged. Heavy-turret shield/spread and rare generic shield drop probabilities,
drop altitude floor 3 and all other source rules remain unchanged.

## Verification and evidence interpretation

Evaluated blend, saved-blend reopen, clean-scene GLB reimport and independent
binary decoding agree: **1,238 triangles / 3 visible material primitives /
3 mesh nodes**, versus source baseline 456 triangles / 3 nodes. GLB is well below
512KiB with zero textures. Numeric bounds and hashes in manifest are authoritative.
The editable blend has closed manifold components; GLB intentionally splits
vertices at flat normals and vertex palette seams. Raw imported boundary-edge
counts are therefore nonzero; position-welded topology checks are closed.

1,080 independent shell-angle/pulse/wobble combinations and 241 source-coupled
poses over 0..20 seconds report no BVH triangle-overlap pairs. Conservative
all-angle radial separation is >.1236 world units; the sampled bidirectional
vertex-to-triangle minimum is >.1478. These are different quantities: finite
vertex sampling is NOT an exact global surface-distance solver. The separate
radial separating-cylinder bound covers the entire motion range; camera-facing
root rotations preserve that separation. No motion or aim has been restricted.

Actual saved source classes/methods execute in Node with clearly disclosed
minimal THREE math/graph/material test doubles, because this checkout has no
installed Three.js. This verifies source numerical motion, camera _compute,
collection boundaries/effect dispatch, culling and recipe ownership for 128
instances (384 geometries and 384 materials total), not real GLTFLoader/WebGL/GPU
memory behavior. A separate Blender density PNG has 36 independent real GLB
imports at world scale 1. Neither batch size claims a hard live maximum. Real
integrated dense batches, shader color response, lifecycle/GPU disposal, full
camera shake/boost/lag/aspects, collision and runtime collection VFX must still
be tested by the orchestrator.

`png/contact-sheet.png` covers rest, geometry multiview, source spin/pulse/wobble,
combined independent extremes and common-scale style comparison. The comparison
is **shipped player LEFT / procedural baseline MIDDLE / NEW shield RIGHT**.
Required neutral camera is game(-16,24,-30), target origin, vertical orthographic
span14; key(-12,22,-12), fill(14,12,8). All share world scale 1, not separately
normalized. Other multiview closeups use span5.7 and are clearly diagnostics.

`png/offline-gameplay-sheet.png` uses actual Classic/Modern/Chase rig eye,
target, zero-boost projection and source dusk key/rim direction/intensity, with
the shipped player at world scale 1. **NEW is LEFT, baseline RIGHT.** The two
badges use identical source phases and equivalent source-size/.35 halo proxies.
This is **OFFLINE reconstruction, NOT live gameplay proof**: schematic deck,
world approximation of hemisphere, alpha-dithered halo proxy instead of Three's
additive sprite/postfx, no exact game fog/IBL, shake, bloom or full fortress.
Collection stills show source-distance/lifecycle contexts but do not pretend to
render the actual HUD/audio/sparks/ring/flash. Their spawn/timing contracts are
separately exercised and recorded. Charge and detach are **N/A**.

Native pixel crops in `png/small-gameplay-readability.png` retain each full-rig
frame's pixels unchanged. Grayscale converts sRGB to linear Rec709 luminance
then back to sRGB, with no contrast boost. Source kind-cue PNG compares shield,
triple chevrons, repair cross and fuel drum; other-kind bevel offsets are only
reference approximations and those kinds are not delivered as redesigned assets.
No tiny text is needed on the badge; the SHIELD label remains source HUD text.

## Reproduction and freeze policy

Do not execute scripts against immutable `initial/`: first copy the complete tree
to a writable sibling with the same depth inside this checkout, or adjust the
reference REPO path for another location. Native wrapper requires the already
authorized Linux Blender/sysroot path, or call that Blender directly. No software
installation is needed or supplied. Commands from the copied working tree:

```
node scripts/source_probe.mjs
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/build_shield.py
python3 scripts/inspect_glb.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/verify_blender.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_evidence.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_cues.py
python3 scripts/compose_evidence.py
```

Requested/used: authorized Codex / gpt-6.1-sol / reasoningEffort=xhigh, available
speed. User accepted no exposed fast-mode toggle; no fast-mode claim is made.
No helpers, delegation, Claude retry or formal review. Opus formal review/polish
is pending until SuperBeast availability. Frozen initial must never be edited;
future review changes belong in a separate explicitly authorized revision.
