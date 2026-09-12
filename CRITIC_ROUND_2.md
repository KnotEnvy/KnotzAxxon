# Independent critic evaluation: Round 2 (final)

Reviewed by the independent Harsh Game Critic and Senior Three.js Engine Auditor on 2026-09-08 UTC. This is the final requested critic round. Ratings remain static implementation assessments: this critic did not obtain rendered frames, audio playback, a completed campaign, GPU timing, or repeated-restart memory measurements. The earlier browser inventory timed out; the parent continues separate runtime inspection. No unobserved performance or visual claim is treated as verified.

| Category | Round 1 | Round 2 | Final assessment |
| --- | ---: | ---: | --- |
| Visual Fidelity & Shaders | 7.8 | **8.2** | Orthographic GPU particle scaling is now coherent with the default camera. Detailed procedural assets, lighting and post effects form a credible visual pipeline; composition, shadow clarity, motion readability and exposure still lack critic-visible evidence. |
| Authenticity & Altitude Feel | 8.0 | **8.5** | Stable orthographic projection, depth-independent scale and altitude-constrained targeting now pair with earliest-hit swept wall/enemy collision. Classic flight structure meets the implementation threshold. Actual hand-control feel and boss completion remain unplayed. |
| Modern Game Feel & Polish | 8.1 | **8.3** | Particle scale is corrected and initialized in every game state. Recoil, fuel rewards, hit stops, shake and sound hooks are comprehensive; subjective timing, audio mix, controller response and cinematic transitions remain unobserved. |
| UI/UX Architecture | 8.3 | **8.5** | Callsigns now appear in records and editable input is isolated from gameplay keys. Attract flight, HUD, settings and restart/results have coherent ownership. This passes the static architecture threshold, not a narrow-screen or accessibility acceptance test. |
| Code Quality & Performance | 7.8 | **8.2** | Seven independent tests and production build pass. Camera ownership and collision order are meaningfully improved. Dynamic-resolution recovery has a 60 Hz threshold problem, full teardown is deferred, and runtime performance/memory remains unmeasured. |

The 8.5 target is **not met in all five categories**. Per the user-specified two-round limit, proceed to cleanup and handoff with the following tradeoffs recorded rather than claiming an all-category pass.

## Verified corrections

- Player projectile collision selects the lowest segment contact fraction across expanded terrain boxes, enemy spheres and boss volumes, including the open core. Targets cannot win merely because they appear first in the enemy array or because their test preceded wall checks.
- GPU particles select orthographic constant pixel/world scale or perspective depth scale using the actual camera; viewport routing now runs for attract, paused and result states as well as active play.
- `FlightCamera` owns its projection update, retaining orthographic scale through resize and switching back to perspective explicitly.
- Adaptive resolution incorporates real frame cadence and records CPU duration separately. Visibility changes reset the timing baseline and impose a short adjustment cooldown.
- Saved callsigns are rendered with a restricted character set. Input handlers ignore the callsign field.

## Remaining tradeoffs and acceptance work

1. **Resolution recovery cannot normally occur at 60 Hz.** At audit time, `_adaptResolution` still requires `_msEma < (1000 / 60) * 0.72`, approximately 12 ms, to raise resolution. Now that the EMA includes frame cadence, a healthy 60 Hz display delivers approximately 16.67 ms. Once reduced, resolution normally stays reduced until a quality change. Use sustained on-budget cadence plus a slow resolution probe and rollback, or explicitly describe the controller as downward-only. This is a correctness/perceived-quality issue, not a measured frame-rate failure.
2. **Full teardown is an application-lifetime limitation.** Reset disposes transient world entities and chunks, but Engine disposal does not remove all event listeners and coordinate every resource owner. A single page lifetime is acceptable for this handoff if stated clearly; embedding/unmounting requires follow-up. No normal restart leak is asserted without measurement.
3. **Collision boundaries still use deliberate approximations.** Boss and enemy spheres approximate detailed meshes, and the player/static test remains a bounded-step overlap. Boss tests do not yet cover pod/core/armour phase transitions. Add phase-specific integrated acceptance before changing the hit-volume model further.
4. **Presentation scores require presentation evidence.** Review low/high altitude against solid walls and moving slots, full destruction effects, boss victory and death, initial-name entry, restart, narrow HUD layouts and camera changes. A functioning shader source and passing build do not establish AAA visual quality or enjoyable timing.
5. **Record real budgets on named hardware.** Suggested handoff targets, not measurements: 60 fps desktop with p95 frame time at or below 20 ms, stable renderer geometry/texture counts after ten restarts, and a documented draw-call baseline for the busiest encounter. GPU captures should include bloom and dynamic shadows.

## Independent validation

- `node --test tests/*.test.js`: **7 passed, 0 failed**. Coverage includes segment contact/miss behavior, thin-wall occlusion, nearest-target order, orthographic depth-independent scale, resize and perspective restoration.
- `npm run build`: **passed**, 43 modules transformed. Build output: application JavaScript approximately 192.14 kB (60.81 kB gzip); Three.js chunk approximately 565.48 kB (143.66 kB gzip). These are bundle sizes, not runtime memory measurements.
- Read the changed collision, camera, Engine cadence logic, particle sizing, effect viewport routing, callsign display/input handling, and boss hit-volume implementation.
- No implementation files were edited by this critic.

## Lead verification addendum after host recovery

This addendum preserves the independent scores and audit snapshot above. The resolution-recovery issue was corrected: on-budget 60 Hz cadence now triggers a gradual upward probe with a five-second cooldown; sustained overload rolls back. Final lead validation: `npm test` 10/10 passed and `npm run build` passed. The final tests include downscaling, 60 Hz recovery and rollback. No new independent critic round or live-performance pass is claimed.
