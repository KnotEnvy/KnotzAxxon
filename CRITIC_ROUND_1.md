# Independent critic evaluation: Round 1

Reviewed by an independent Harsh Game Critic and Senior Three.js Engine Auditor on 2026-09-08 UTC. Scores are conservative static implementation assessments, not measured visual or playtest verdicts. Browser inventory inspection timed out; no rendered frame, audio output, frame-rate trace, or complete campaign was observed by this critic. Host stalls also delayed the first shell read. These tooling failures are not asserted to be game failures.

| Category | Score / 10 | Assessment |
| --- | ---: | --- |
| Visual Fidelity & Shaders | 7.8 | Cohesive procedural interceptor details, material-batched fortress, dynamic sun shadows, HDR threshold bloom, consolidated post effects and GPU particles are substantial. Default orthographic camera and perspective-only particle sizing disagree. Final composition and shadow legibility remain unseen. |
| Authenticity & Altitude Feel | 8.0 | Fixed-height orthographic classic framing, altitude drop line, deck marker, altitude-aware targeting and hazard ladder support the right mechanics. Shots still resolve enemies before intervening terrain and terrain shots are endpoint-only; altitude accuracy needs correct occlusion. |
| Modern Game Feel & Polish | 8.1 | Recoil, trauma shake, hit stops, synthetic audio, fuel rewards, heat and chaining are wired. Particle projection and attract-mode viewport setup need correction. Timing and audio quality have not been felt or heard. |
| UI/UX Architecture | 8.3 | Schema-driven settings, inert inactive menus, reactive telemetry, moving attract flight, results, initials and restart loop form a coherent product. Callsign leaderboard display was corrected during the audit according to the parent; the initial audited source omitted names. Keyboard/gamepad, small-screen layouts and end-to-end victory remain unverified. |
| Code Quality & Performance | 7.8 | Good separation among engine, game, rendering, world, UI and effects; bounded pools and merged chunks are appropriate. Dynamic resolution responds to CPU callback time rather than delivered frame cadence. Lifetime cleanup is incomplete and no runtime draw-call or repeated-restart memory measurement exists. |

All five categories are below the 8.5 target. Implement the following targeted changes before Round 2.

## Prioritized grievances

1. **P1: Resolve the earliest projectile contact, including intervening terrain.** `Game._collidePlayerProjectiles` takes the first enemy in array order, before geometry; `_pointInSolid` only tests the endpoint. The new segment-sphere helper fixes tunnelling through enemies but does not solve occlusion, wall tunnelling, or nearest-target ordering. Use a swept segment/expanded AABB terrain query and select minimum contact fraction across enemies, terrain and supported boss hit volumes. Add a target-behind-wall and two-target ordering regression check. Enemy shots already use the correct relative player displacement; no issue is raised there.
2. **P1: Make particle scale projection-aware.** `Particles` computes point size using `uHeightScale / -mv.z`, while `setViewport` derives scale from perspective FOV. Classic mode is orthographic, so world-size particles should use framebuffer height divided by orthographic world height, independent of depth. Route the actual camera/projection to the effect system. Initialize this in attract mode too; the current attract path never invokes viewport sizing.
3. **P1: Base adaptive resolution on sustained frame delivery.** `Engine._loop` derives `_msEma` from JavaScript callback duration. WebGL submits work asynchronously; a GPU-bound game can miss vsync while that value remains short and resolution stays high. Use actual frame interval with a stable rolling metric, discount tab restoration, keep hysteresis, and report CPU duration separately. Confirm using controlled slow-frame inputs or a live GPU trace.
4. **P2: Complete lifecycle ownership.** `Engine.dispose` removes resize but leaves orientation, anonymous visibility/settings and canvas context listeners; Input and game-owned resources lack a coordinated teardown. This does not prove a normal restart leak, but weakens embeddability and hot reload. Document one application-lifetime ownership if full teardown is deferred; measure geometry, texture and program counts across repeated restarts when runtime access returns.
5. **P2: Obtain visible and interactive acceptance evidence.** Capture attract mode, combat at low/high altitude, barrier contact, damage response, results with edited initials and restart. Exercise classic/modern camera switches and narrow layouts. Report actual renderer calls and p95 frame time instead of assuming pooled systems satisfy budgets.

## Evidence and scope

- Static reads covered Engine, Game, CameraRig, Player, Screens, Settings, PostFX, particle shader, fortress batching/disposal, HUD, main wiring and collision helper/tests.
- Independently ran `node --test tests/collision.test.js`: **4 passed, 0 failed**. These cover segment-sphere contact/miss behavior only, not integrated collision order, game state transitions, shaders or performance.
- Bloom uses HDR luminance threshold 1.02; it is brightness-selective, not an explicit object-layer isolation pass. This is a reasonable economical design choice when emissive values are authored consistently; final exposure requires visual review.
- The ship is a deliberate procedural assembly with bevelled wings, layered armour, intakes and rings. It is more detailed than a single primitive placeholder, but this audit does not equate extra geometry with proven AAA visual quality.
- No numerical FPS, draw-call, memory, accessibility or full-campaign acceptance claim is made.
