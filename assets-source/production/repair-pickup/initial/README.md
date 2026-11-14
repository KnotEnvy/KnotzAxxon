# HULL REPAIR PICKUP — frozen INITIAL

Status: `pending_deferred_opus_review`. Zero formal reviews and zero formal
review/fix passes. This initial implementation is not final art acceptance.
No helpers, delegation, Claude retries, production edits, git updates or changes
to other workers' folders. Opus review/polish remains deferred.

## Deliverables and deliberate kit reuse

- `asset/repair-pickup.blend`: editable native Blender 5.2.1 source, named
  meshes, per-face vertex palettes and embedded generator text. Pack-all called;
  no linked libraries or external texture files.
- `asset/repair-pickup.glb`: 928 evaluated triangles, three mesh/material
  primitives, 75,676 bytes. No animations, textures, atlas, lights or halo export.
- `scripts/`: self-contained generator, adapter recipe, source-contract harness,
  independent binary GLB reader, saved-blend/clean-reimport verifier, evidence
  renderers/compositor, manifest builder and immutable freeze script.
- `source/`: verbatim actual production snapshots, not modified application code.
- `evidence/`: PNGs, actual execution logs and machine-readable measurements.

**Deliberate kit reuse:** adapted tooling and the faceted luminous frame / dark
slate foundation / ceramic badge material language from the authorized read-only
`asset-work/shield-pickup/initial`. Its frozen file hashes are declared in the
manifest. The repair geometry is independently authored; no shield crest, shield
ring emblem, spread worker, parked-fighter or other worker geometry is copied.
The repair frame is an exact-size toroidal profile, not the shield's enlarged
inner-profile treatment or six decorative lugs. The source-sized CROSS remains
the primary cue, readable without green; no lettering, spokes, danger spikes,
shield crest, deployed healing bubble, machinery, charge or mechanical detach.

`public/models/player.glb` is a shipped world-scale/style reference in evidence
only. The frozen shield GLB is imported only into the explicitly labeled kit
comparison image. Neither reference is merged into the repair asset or archive.
Scripts use only this delivered tree and the declared repository source/shipped
references. No runtime dependency on another worker's files is proposed.

## Source contracts and exact pivots

Kind `repair`; source color `0x52ffa8`; HUD label `HULL +1`; score250;
collection radius2.2. Actual `Game._applyPickup` calls `player.repair(1)`;
actual `Player.repair` caps at `hullMax`. No damage, invulnerability, shield,
duration or mechanic change is proposed. Source effects/HUD/audio/flash stay
source-driven: floater1.15s, existing sparks20, collection ring lifetime.42s,
postfx flash.18. A collected item sets `alive=false` in `_collideContact`, then
the next pickup update loop removes it; behind-distance55 culling stays intact.

Game/glTF is +Y up; local badge plane XY with +Z facing camera. Blender mapping
is `(gameX,-gameZ,gameY)` and the glTF Y-up exporter restores `(x,z,-y)`.
**No post-load rotation, normalization, rescaling or corrective transform.**

| Handle | Original source GAME pivot | Export material | Source motion |
| --- | --- | --- | --- |
| `repair_pickup_root` | `(0,0,0)` | none | Identity under original Pickup.group |
| `shell` | `(0,0,0)` | `repair_shell_green_unlit` | local Z spin `.3*dt`; uniform pulse |
| `core` | `(0,0,-.30)` | `repair_core_titanium` | Static relative to billboard |
| `shape` | `(0,0,+.10)` | `repair_shape_ceramic` | local Z wobble `sin(phase*2.2)*.08` |

All authored node rotations/scales are identity. Exact local/world matrices and
names are in `runtime-map.json` and independent binary inspection. Handles are
three independent Mesh objects, not an inseparable animated mesh.

Shell major radius1.98, tube.065, outer2.045. The hex core remains radius1.64,
depth.16. Cross contour arm reach±1.1, arm halfwidth.31, straight depth.12,
bevel.04 (outer bevel reaches±1.14; original source envelope retained).
No enlarged graphics disguise small-scale readability. Source-rest full depth
is .64, from rear core-.38 to cross front+.26. Maximum-pulse radial bound
is2.096125, exactly source shell outer2.045×1.025.

Shell/shape use KHR_materials_unlit; set **cloned** materials `toneMapped=false`,
as source neon does. Both contain exact sRGB `#52ffa8`. Deliberate authored
palette difference: ceramic face `#ddffeb`, mint/green faceted rim and dark
green-slate core, instead of uniform source neon gains1.15/1.35. No claim that
the palette response is identical to the source uniform gains. Exact-green
diagnostic PNG recolors only in-memory evidence, never the exported asset.

## Runtime adapter recipe ONLY

Production `ImportedModels.js` has no repair preload. Integration must add
repair preload/template wiring in its own authorized branch and use the actual
private `instantiate()` clone semantics: clone geometry once per template
geometry and material once per template material; keep template textures shared;
record cloned materials in `importedRoot.userData.modelOwnedMaterials`.

Run the **entire existing Pickup constructor first**: kind/def/color/score/alive,
radius, group/pos, shared halo, scene attach, random phase, baseY and velocity.
For repair only, call delivered `attachImportedRepair(pickup, importedRoot)`
with the owned clone. Remove the procedural visual children without freeing
shared caches, bind the exact named imported handles, keep all other kinds
procedural. No early return may skip normal initialization.

Original `Pickup.dispose()` only detaches shared resources. Integration MUST
explicitly release imported resources: call delivered
`releaseImportedRepair(pickup, disposeModel)` (or its equivalent), disposing
only `_importedRoot` once, nulling it, then detaching the existing group.
Never dispose `Pickup.group` recursively, shared `mats._pickupHalos`, Materials
textures/materials, procedural geometry caches, template geometry/materials or
template textures. Templates remain globally owned by `disposeImportedModels`.
This asset has zero textures and no replacement halo.

The original update remains byte-for-byte production source:

```
phase += dt
group.quaternion.copy(ctx.camera.quaternion) when camera quaternion exists
shell.rotation.z += dt*.3
shape.rotation.z = sin(phase*2.2)*.08
shell.scale = 1 + sin(phase*4)*.025
halo.scale = 7*(1 + sin(phase*4)*.2); shared halo opacity .35
if d<22 && player.alive: pos += normalize(player.pos-pos)*(1-d/22)^2*60*dt
else: pos.y = baseY + sin(phase*1.6)*.7
```

Original `Math.random()*TAU` initialization, baseY, zero Vector3 velocity,
alive/lifecycle, origin/collection radius and position pointer all remain.
Controlled phases are used only for deterministic evidence, never art-fit clamps.

## Validation and evidence limits

Saved blend reopen, clean-scene GLB reimport and independent binary decoding
agree on 928 triangles / 3 primitives / 3 mesh nodes and original pivots/bounds.
Editable meshes are closed/manifold. Exported normal/color seams split vertices;
position-welded reimport topology is closed. No hidden extra exported meshes.

1,080 independent combinations cover full shell angle0..355 in5-degree steps,
scale.975/1/1.025 and wobble-.08/-.04/0/.04/.08, plus241 source-coupled poses
over0..20s. Zero shell/core or shell/shape BVH overlap pairs. Conservative radial
separation is **>.2231 world units across the continuous full motion range**.
Sampled shell↔shape and shell→core vertex/triangle distance is >.3393;
core→shell is not sampled. Finite BVH/distance
sampling is not an exact global triangle-interior minimum-distance solver; the
separate radial-cylinder bound covers the unsampled full range with float
tolerances. Root camera rotations preserve all separations. No motion is clamped.

Node executes actual saved Pickup, CameraRig, Game, Player, Effects,
ImportedModels and Dispose source with disclosed minimal THREE math/graph
test doubles (geometry parameter stubs), NOT real Three.js/GLTFLoader/WebGL.
It checks repair/hull cap, collection boundary, exact motion/halo/bob/magnet,
128 instances, shared halo retention and 384 cloned geometries/materials disposed
once without affecting neighbors/templates. This is not GPU-memory integration
proof or a hard live-instance maximum. The separate 36-real-import Blender image
is a density diagnostic only. Receiver runtime integration remains required.

`evidence/png/contact-sheet.png`: actual GLB rest/multiview/action/combined
pulse-wobble, exact-green diagnostic and grayscale. `identity-sheet.png` compares
cross against source shield/spread/fuel, frozen shield emblem, and source mine
silhouette in color/grayscale. Other-kind source bevels/materials are approximate
offline references; no other-kind deliverable is authored.

`world-scale-comparison.png`: shipped player LEFT / source repair baseline
MIDDLE / new repair RIGHT, common world scale1. Required common neutral camera
game(-16,24,-30), target0, orthographic vertical span14; key(-12,22,-12),
fill(14,12,8). Close diagnostic views use span5.7 and do not claim game scale.
Baseline is a Blender source-dimension reconstruction (500tri), including
analytic mitered bevel, not an actual Three.js geometry capture.

`offline-gameplay-sheet.png`: actual-source Classic/Modern/Chase zero-boost rig
eye/target/projection reconstructions, shipped player and equal-phase baseline,
new LEFT / baseline RIGHT. **OFFLINE RECONSTRUCTION, NOT LIVE GAMEPLAY PROOF.**
World/hemisphere, schematic deck and alpha-dithered halo are approximations;
no exact source fog/IBL/bloom, shake/lag/boost, HUD/audio or particle pixels.
`small-gameplay-readability.png` preserves native gameplay crop pixels without
resizing; grayscale is linear Rec709 luminance converted back to sRGB without
contrast boost. Fine bevels naturally disappear at small far-perspective sizes.
Drift/magnet/collection context sheets do not invent a beam/bubble/VFX. Actual
source VFX dispatch/timing is checked numerically; stills do not simulate it.
Mechanical charge/detach is N/A; normal lifecycle removal stays unchanged.

## Reproduction and immutable freeze

Never run generators against immutable `initial/`. First copy it to a writable
sibling at the same depth, or adjust repository reference paths. Native Blender
wrapper uses the already-existing authorized Linux Blender/sysroot, not bundled
software. Run `node scripts/source_probe.mjs`, generator via native wrapper,
`python3 scripts/inspect_glb.py`, verifier via wrapper, evidence/cues/additional
renderers via wrapper, refresh halo-bearing collection/drift stills with
`scripts/render_contexts.py` via wrapper, then `python3 scripts/compose_evidence.py`.
`scripts/verify_embedded.py` verifies the saved blend's embedded generator text
matches the delivered generator without resaving the blend.

`SHA256SUMS` hashes every delivered file except itself; INITIAL is write-protected.
Taildrop archive contains only this asset's sources/assets/evidence/documentation,
never dependencies, runtimes, other worker folders or production patch files.
Archive hash/transfer receipt stay outside INITIAL. Any future formal review
changes require a separate explicitly authorized revision, never edits to INITIAL.
