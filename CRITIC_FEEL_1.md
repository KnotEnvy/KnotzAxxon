# Modern Game Feel & Polish - focused critic round 1

Date: 2026-09-11. Reviewer: independent Harsh Game Critic / Senior Three.js Engine Auditor.

**Score: 7.4 / 10, provisional source and CPU-simulation assessment. Gate: below 8.5.**

This review covers only Modern Game Feel & Polish. It does not rescore the preceding Authenticity or Code Quality categories. No browser render, physical controller, or audible mix was observed: the browser-control runtime remains blocked by host process startup errors. A source/simulation score is not live acceptance.

## Evidence and strengths

- Independently ran `npm test`: all 40 tests passed, including the prior altitude/collision and lifecycle/performance contracts.
- Responsive velocity approach, capped movement, camera damping, recoil, layered muzzle flashes, distinct shield/hull feedback, controller rumble hooks, enemy hit shells, shockwaves, debris and score chains are implemented. Death stops the engine sound and hides the ship/trails. These are integrated behavior, not uncalled helper functions.
- Terrain and projectile ordering preserve the earlier authenticity fixes. Standard guns retain altitude; boost/roll must not introduce aim steering.
- A two-second firing probe produced 18 shots at 30, 60 and 120 Hz and 17 at 144 Hz. This small cadence discrepancy is a follow-up tuning item, not the gate blocker.

## Required corrections

1. **Barrel roll unwinds through nearly another revolution.** Independently exercised `Player.update`: roll angle was 6.283 radians at 0.550 s, overshot to 6.474 at 0.567 s, then reversed to 5.572 at 0.583 s, 4.796 at 0.600 s and 2.265 at 0.683 s. The raw full-turn angle is damped back to bank after the roll. Wrap completion to its equivalent orientation and recover through the shortest angle, with both roll directions tested.
2. **Depleted held boost rapidly chatters.** Starting at 0.03 charge and continuously holding boost caused 87 `boosting` transitions over two seconds. The 0.02 cutoff immediately alternates drain/recharge at one-to-two-frame intervals. Since this flag drives exhaust color/intensity, audio modulation, radial blur and camera framing, the problem crosses every presentation layer. Add a depletion latch or meaningful hysteresis; prove that holding empty boost does not flicker while release/recharge restores intentional use.
3. **Controller cannot complete the menu/retry loop.** Input emits gamepad direction/confirm edges but the entry point only handles pause and title-screen confirm. Screens has keyboard and pointer handlers without an equivalent gamepad bridge. Results-screen A cannot retry; D-pad cannot choose menu/settings items. Wire the existing menu action path and avoid consuming one A press twice during a screen transition.
4. **Death presentation delays retry too long.** `_deathTimer = 2.3` decreases in simulation time while death sets time scale to 0.28. With the current damped transition this is about eight wall-clock seconds before results, rather than a short death beat. Use a real-time presentation deadline and/or deliberate skip-to-results so the intended instant restart loop is available without waiting for slow-motion simulation.
5. **Pausing can discard victory completion forever.** `_bossGone` uses a one-shot 1400 ms wall timer whose callback requires PLAYING. If paused when it fires, `_ending` remains true, the boss has been disposed and nothing retries completion. Track the pending ending in pause-aware game/presentation state and test pause/resume around its deadline.
6. **Run/menu transitions need one coherent reset boundary.** Pre-correction source had Screens handle Escape/resume and Input subsequently handle the same unguarded event, potentially re-pausing immediately. The parent correction landed during this review; a fresh probe using both real listeners now ends PLAYING correctly. Keep that regression test. Also reset residual hit-stop/slow motion, damage/boost post-processing and the paused audio filter when retrying directly from pause; a new run should respond at its intended speed immediately.

## Re-review acceptance

Exercise both roll directions, boost depletion/recharge, keyboard pause/resume, controller title/settings/results actions, fresh retry after a hit while paused, real-time death duration, and pause during victory completion. Preserve the 40 existing regression tests. After these fixes, re-evaluate this category independently rather than assuming the presence of effects earns 8.5.

Live acceptance remains necessary for actual input-to-photon latency, audio balance, physical gamepad rumble and whether the existing effect amplitudes feel clear in all three views. Those unavailable observations are not silently counted as passes.
