Initial builder PNG inspection — not a formal review

Stage: pending_deferred_opus_review. Formal reviews=0; formal review fix passes=0.
Requested/executed: codex / gpt-6.1-sol / reasoningEffort xhigh / AVAILABLE SPEED.
No fast-mode claim. No helpers or delegates. Opus polish remains deferred.

Actual PNGs were opened with image viewing tools: six shipped reference renders;
front, rear, top, side, three-quarter and the shared neutral interceptor view;
weave, strafe, displaced orbit, approach dive, committed peel, carrier launch and
transition, positive/negative compound extremes; unchanged-world-scale player
comparison; all three full offline gameplay views and their 4x pixel crops;
rest/action, gameplay and style contact sheets. Script success was not treated as
visual approval. The geometry and camera self-corrections below precede freezing.

Observed craft:

- Narrow forward weapon channel and long central spine read as a faster fighter.
  Swept structural blades, recessed armor panels, two inlet mouths, cooling beds,
  rear stabilizers, dark framed canopy and a single machined nozzle are visible.
  Panel boundaries follow the wing rather than adding scattered decoration.
- Restrained slate armor, dark machinery and red oxide tip/fin details preserve
  broad material separation. The red forward eye and orange-red rear engine are
  distinct enemy cues. EEVEE AgX softens bright emission toward salmon; the
  integration recipe restores the game's toneMapped=false neon material behavior.
- Player comparison uses the original shipped player at unchanged scale. Screen
  left is the interceptor; screen right is the larger player with twin engines.
  This is the size reference; independently framed style references are not.
- Rest, bank and pitch views have a coherent fitted airframe, no detached-looking
  loose wing pieces or obvious missing export faces. Underside and inlet recesses
  are intentionally dark. At a nearly knife-edge carrier launch angle, projected
  wing area becomes thin; the forward eye still presents a small cue.
- Rear-facing Modern/Chase images are dominated by the orange-red engine and thin
  wing silhouette. Nose eye naturally occludes behind the airframe from the rear.
  Small panel detail does not survive game scale; silhouette/cue separation does.
  In this reconstruction at 960x540, enemy world (0,9,32), background-difference
  threshold7, extents are Classic31x19, Modern46x12, Chase44x11 pixels. These are
  one context, not minimum readability claims across every distance or camera.
  Full PNGs retain actual framing. Individual crops are exactly 4x nearest-neighbour;
  the gameplay contact sheet centers these crops at that same pixel scale.

Corrections within initial best effort:

- Opened the nozzle throat enough for the entire 0.97..1.065 engine scale sweep.
  401 samples show no triangle intersections and ~0.0292 minimum sampled
  vertex-to-surface distance. Sensor rear seating intentionally intersects its
  fixed brow (32 triangle pairs), not a moving-part clearance failure.
- Corrected Blender orthographic sensor fit before final views: shared neutral
  frame is exactly14 wide, Classic frame is142.2222 wide /80 high at16:9.
  Modern vertical FOV58 and Chase66 independently measured from camera view_frame.
- Corrected comparison caption after seeing the actual screen ordering.
- Selected approach dive before the irreversible peel switch, so those two
  named images demonstrate different actual phases of the source motion.
- Rebuilt contact sheets from final PNGs; fixed 4x crops retain their native pixel
  size inside the gameplay contact sheet, without stretching them into a tile.

Limits, preserved mechanics and later work:

- Fixed WORLD shot spawn +(0,0,1.5) is clear along resting +Z, with ~0.15735 units
  to the nearest static surface. It diverges from the rotating nose channel by
  ~0.44948 in the recorded firing sample. Projectile radius0.9 is wider than the
  channel. Source muzzle FX and aiming originate at root, inside the fuselage.
  This is an explicit graphics mismatch; gameplay, aiming and origin are unchanged.
- Wings extend to +/-2.86 vs collision radius2.2, comparable to the old wings.
  Synthetic minimum-altitude compound bank can dip a tip to Y~-0.374. No artificial
  bank, aim, orbit velocity or altitude restriction was added to conceal it.
- Extreme-positive/negative renders combine +/-1.1 launch roll, +/-0.16 normal
  pitch and +/-0.288 yaw as synthetic stresses. They are not an observed single
  source state or universal orbit envelope. Orbit restoration has no fixed cap.
- Pose images recenter the original root rotations for inspection. Launch position
  was sampled at x58.7961, y3.1287; the real game continues controlling root motion.
- Offline camera reconstructions are honestly labelled: exact static rig equations,
  no lag/shake/boost, approximated Dusk light, EEVEE AgX instead of Three ACES1.02,
  no level shadows, real sky PMREM/fog/bloom/postfx/HUD or moving carrier/boss/waves.
- The completed render evidence used batches. The corrected full render process
  exited143 after carrier-launch; the remaining corrected orthographic views were
  completed in render-completion-batch.log. Approach-dive has its own successful
  render log. Modern/Chase retain the successful earlier perspective renders,
  whose camera settings did not need the orthographic correction.
- No live GPU draw/performance, moving wing/carrier/boss contacts, gameplay camera
  occlusion, GLTFLoader or WebGL disposal test is claimed. Original source disposal
  ownership was inspected. Integration support is supplied as an uninstalled recipe.
- Detach N/A. Keep original explosion/wreck effects and all HP/score/collision/
  targeting/lead/lifecycle behavior. Existing production loader does not yet load
  interceptor.glb. No source/public/assets-source/docs/config/commit/deploy changes.

Initial technical checks and builder inspection are complete. Deferred Opus review
and polish, integration profiling and final user acceptance have not occurred.
