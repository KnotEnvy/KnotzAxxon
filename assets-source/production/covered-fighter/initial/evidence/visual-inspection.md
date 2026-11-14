# Implementation-stage image inspection - not formal review

Status remains `pending_deferred_opus_review`. Formal reviews and formal review/fix rounds remain **0**. No Opus/helper/delegate was invoked. This is not final acceptance.

Actual local PNG viewing was performed with the image-view tool, not inferred from filenames or render logs. Exact viewed files and their SHA256 digests are recorded in `visual-inspection.json`. The six-view sheet, both structural closeups, complete source/candidate yaw endpoints/zero, all Classic/Modern/Chase full-chunk source/candidate pairs, clean imported GLB, explicit 4x diagnostic crop, and selected shipped reference board were inspected.

## Observations

- Front/rear/top/profile views show a coherent swept-wing craft, continuous fuselage, fitted raised cockpit cover, attached tailplanes/fin, sealed exhaust, and three attached landing-gear assemblies. Canvas sections, cinch bands and reinforcement seams are restrained rather than covered in decorative noise. Four short tiedown loops are subtle; fabric/fold interpretation remains a deferred visual-review question, particularly at native game scale.
- The model has no orange/red paint, lamps, engine glow, visible weapon, target marker or transparent cockpit. Under the common warm key the neutral/grey-green canvas reads slightly khaki. This is honestly a warm-light appearance, not a claim of color-managed live renderer equivalence.
- The clean-import GLB image agrees in shape/identity with reconstructed runtime views. Runtime views use actual Batch-generated AO/tints; standalone GLB colors do not reproduce production procedural textures or the exact Batch AO.
- The source/candidate yaw sheet covers -0.25, 0, +0.25 radians with fixed original hardstands. Candidate silhouette remains tighter. Continuous containment is mathematical evidence, not a conclusion from just these three pictures.
- Native full world pairs retain actual source geometry, the source camera rigs, shipped player at scale 1, and common lighting/world units. The craft is intentionally small background scenery. Near-shoulder player position and original fuel/wall geometry can partially occlude it. Center-lane pairs move only the sampled player/camera state, never the scenery. Existing fuel/wall occlusion is still present; no camera-wide visibility or no-overlap claim is made.
- The 4x Modern center-lane crop shows the unchanged foreground tanks and a clearer fitted candidate outline behind them. This is explicitly nearest-neighbor enlarged diagnostic evidence, not native-scale acceptance. Small cloth details cannot be certified readable from these native screenshots.
- Selected player/sentinel/turret/radar/silo/fuel reference board shows the shipped palette/craft family. That board is explicitly normalized for comparison, not a common-world-scale diagram. None of its mesh data is in the candidate.
- Blue background at the lower edge of some low orthographic study frames is evidence-scene ground/camera clipping, not a mesh hole. Other views and independent normals/topology audits cover the craft structure.

## Limitations retained

No live game/GPU/performance acceptance, no dynamic enemy/HUD/postprocessing/fog/sky-shader testing, no exhaustive camera/placement overlap proof, and no claim that the legacy wall/deck/fuel intersections are repaired. No gameplay/camera/aim/placement constraint has been narrowed. Final receiver verification/integration and the explicitly deferred Opus review remain primary.
