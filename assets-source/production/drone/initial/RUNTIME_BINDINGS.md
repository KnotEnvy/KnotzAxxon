# DR-3 initial integration contract

Stage: `pending_deferred_opus_review`. This is an asset handoff; production loading and deployment have not been changed.

The visible default glTF scene is `drone_runtime_visible`, with identity `drone_root` at the unchanged gameplay origin. It contains `body`, `eye`, and `engine` as direct children. Marker empties document +Z nose, +Y up and weapon references. Blender authors every point through `(game.x, -game.z, game.y)`; glTF export Y-up converts back to game coordinates. Do not add another rotation or normalize the asset scale.

| Runtime property | Node / material | Binding |
| --- | --- | --- |
| `enemy._importedRoot` | cloned default scene containing `drone_root` | Add under existing `enemy.group`. That group continues to own position and bank/pitch/yaw. |
| `enemy.body` | `body` | Four static material batches: oxide hull, slate machinery, titanium trim and obsidian sensor/duct recesses. |
| `enemy.eye` | `eye`, `DR_Cue_Red_ff3d55` | Preserve red `0xff3d55`; runtime neon or equivalent cue material, `toneMapped:false`. Pivot game `(0,.4,1.258)`. |
| `enemy.engine` | `engine`, `DR_Engine_Amber_ff9a3a` | Preserve amber `0xff9a3a`, distinct from interceptor `0xff5a3a`. Exhaust-local pivot `(0,-.035,-1.95)`. Uniform local scale `.97..1.03` normal, `1.015..1.065` launch. |
| `enemy.flashMesh` | `flash_shell` in **non-default scene 1** | Reparent this template under cloned `drone_root` at its authored transform; set `visible=false` before showing the instance. glTF does not have a standard generic hidden-node property. Keeping it in scene 1 prevents an unintended white seventh draw in the default scene. |
| `enemy.flashMat` | replace `DR_Flash_White` | Match `_addFlashShell`: white MeshBasicMaterial, additive blending, transparent, initial opacity 0, depthWrite false, toneMapped false, renderOrder 5. `Enemy.update` toggles visibility and opacity. |

The shell geometry is already authored at scale 1.04 and is 220 triangles / one extra primitive when active. Avoid applying a second envelope scale. In Blender it is `hide_render=true` and is not included in rest images. The flash PNG deliberately shows an opaque geometry demonstration, not the final runtime additive blend.

Clone instance geometry and materials before binding, following `instantiate()` in `src/render/ImportedModels.js`. Record every owned material, including cue and engine replacements, in `root.userData.modelOwnedMaterials`. The existing `Enemy.dispose()` calls `disposeModel(enemy._importedRoot)` and separately disposes `flashMat`; `disposeModel` owns cloned instance geometry/materials but leaves template textures alive until shutdown. This asset has no textures. Give the imported flash geometry that same instance ownership. Avoid leaking replaced clones or double-owning a shared template. The scene-1 template should never be added separately to the gameplay scene.

Maintain drone `fast=false`, HP 3, score 250, collision radius 2.2, targeting and lead at root, camera, muzzle FX at root, lifecycle, explosions and wreck behavior. Detach **N/A**: there is no detachable Flyer mechanic. Interceptor remains HP 2 / score 320 / radius 2.2 and is outside this asset's scope.

Normal root targets remain bank `-vx*.035`, pitch `-vy*.02`, yaw `vx*.012`, damping 6/6/5. Launch roll uses damping 5 and clamp +/-1.1; launch position damps to formation with 1.4. Drone trails at .62 player speed, interceptor at .82, except dive .35 and committed peel .1. Orbit has a restoring term proportional to displacement and therefore no universal fixed velocity cap. The exact source method is exercised in `sample_runtime.mjs`; this is not a new movement implementation.

Shots still spawn at world `(pos.x,pos.y,pos.z+1.5)`, regardless of root rotation. The open weapon mouth is near `(0,-.045,1.49)` at rest. It rotates with the graphics, so it cannot coincide with that fixed world offset throughout the source motion. Measured examples: mouth-to-spawn distance .0461 at rest/launch-only roll, .1623 for the sampled ordinary orbit bank, .3132 for strafe, .4454 in committed peel, and .8125 in displaced-orbit stress. Some ordinary poses place the spawn near the machined lip; the sampled orbit bank is only .000188 from its visible surface. Muzzle FX remains at root rather than the authored mouth. These are existing graphics/shot-origin mismatches; do not narrow motion, aiming or collision to hide them.

The 18-drone density number supplied for seeds 1–100 / loops 0,1,3 / 355-unit spawn window is a layout proxy, not the actual live maximum. This asset would contribute 47,520 visible triangles and 108 base material primitives at 18 instances, before shadows, flash, carrier, boss and other enemies. Integration must profile actual moving populations and frame time. No live performance or final camera acceptance is claimed here.

The additional `shot_visual_ray_probe.json` uses firing events from the exact source update and lead methods, with mean spread. In ordinary ahead-of-player contexts, the aim direction points generally back toward the player (-Z) while the shot spawns at +1.5Z. The visual ray can therefore cross the authored airframe. `debug_actual_shot_ray.png` labels this diagnostic with a cyan path, yellow spawn and purple root-FX point. It is evidence of the graphics mismatch, not a production effect or a gameplay self-collision claim.
