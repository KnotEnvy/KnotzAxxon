# Code Quality & Performance — focused critic, Round 2

Date: 2026-09-11. Reviewer: independent Harsh Game Critic & Senior Three.js Engine Auditor.

**Score: 8.5 / 10.0, provisional engineering gate reached.** The confirmed source/simulation blockers from Round 1 are resolved. This assessment is deliberately limited to engineering evidence; **live WebGL performance acceptance remains unverified**. It does not certify 60 FPS, GPU-memory stability, rendered quality or the overall five-category gate. Other category scores are unchanged.

## Resolution of the Round 1 findings

| Finding | Independently verified resolution |
| --- | --- |
| Retired pickup and boss materials remain registered | `Materials.track()` unregisters materials on disposal; Boss disposes its owned core shader. One warm-up plus 100 repeated pickup/boss cycles retains a stable registry and an empty actor scene. Projectiles releases its two owned halo materials. |
| LOW keeps ULTRA effect capacities | Live switching replaces particle and debris pools, frees superseded resources, and preserves viewport and time settings. ULTRA→LOW now yields exactly 900 sparks, 315 smoke particles, 120 debris slots and 2 lights. Ten repeated quality cycles retain bounded scene membership. |
| Duplicate or unwanted RAF chains | Engine owns and cancels its pending RAF, honors deliberate stop through context restoration, and skips restoration after disposal. Restart/restoration resets the frame baseline, EMA to 16.7 ms and adaptation grace to 1.2 seconds; the regression starts from stale 200 ms cadence and confirms fresh values. Sky render-target contents are rebaked on context restoration. |
| Missing coordinated lifetime ownership | Main coordinates stop, Game/Screens/Input cleanup, audio shutdown, shared geometry caches, Engine resources and procedural textures. Lifetime removes subscriptions and settles canceled waits. Player/model geometry, guides, trails, pools, instance attributes, celestial meshes, lights and post-processing receive explicit disposal. Ten Game constructions/disposals leave only the existing camera and a stable warm material registry. |
| Slow frames multiply presentation and chunk creation | Substeps now receive advancing timestamps. Game presentation, projectile uploads, effects, sky and HUD run through the registered late phase once per rendered frame during combat. Fortress shares its two-build budget across all substeps of a frame, while gate animation still updates each substep. |

Packed projectile and debris drawing is an additional useful improvement: active simulation slots retain their collision identities while rendering compacts only live instances. Sparse-slot tests verify the rendered matrix and count, and expired debris stops drawing. Shared texture and material ownership is kept separate from model geometry disposal; Sprite's shared geometry is intentionally excluded.

The implementation preserves existing campaign scope and collision coverage. It does not add sectors or trade away the recent altitude corrections.

## Independent validation

- Final exact-source `npm test`: **40 passed, 0 failed**.
- Final exact-source `npm run build`: **passed**, 46 modules transformed with Vite 7.3.6.
- Final app bundle: `index-BJFRE__x.js`, **201.11 kB / 63.95 kB gzip**. Three.js vendor bundle: **565.48 kB / 143.66 kB gzip**.
- Focused recovery/performance suite: **13 passed**, including the final stale-cadence recovery correction.
- Additional independent CPU integration smoke: **1,200 actual Game simulation substeps and 600 presentation phases**, renderer/DOM/audio stubbed. The run progressed approximately **954.8 world units**, remained playing, and ended with 7 active enemies and 8 streamed chunks. Game disposal returned the scene to its single camera. This exercises real actor/collision/streaming/presentation execution; it is not a browser playtest or a timing benchmark.

The reviewer made no implementation changes. All observations above were obtained by source inspection or host-independent execution; no screenshot, audio audition or WebGL frame capture supports this verdict.

## Why the score stops at 8.5

The revised design has credible resource ownership, bounded storage, bounded streaming work, independent simulation coverage and a clean production build. These are sufficient for the provisional engineering threshold. There are still specific limits:

- **GPU behavior remains unmeasured.** CPU disposal events and stable scene/material registries cannot prove a renderer-memory plateau. Real draw-call counts, shadow/transmission costs, shader compilation hitches, frame pacing and device thermal behavior still need capture on named hardware.
- **Anisotropy remains a startup setting.** A live preset change updates resolution, shadows, distance, post-processing, lights and particle/debris budgets; procedural texture anisotropy retains its startup value until reload. Record this clearly in the handoff or update cached texture sampling in a later focused maintenance change.
- **Partial constructor failures remain an edge case.** Main can dispose successfully assigned Engine/Game instances. If an exception occurs inside a constructor before assignment completes, the partially created object's resources are not comprehensively recovered by that outer cleanup. HMR/ordinary shutdown of a completed application has a coordinated path; injected allocation/shader initialization failure recovery is not certified.
- **Some simulation work still creates transient objects.** Context callbacks, contact descriptors and event bursts are not allocation-free, and attract-mode camera work still follows substeps. They are bounded by the live scene and were not demonstrated to cause a measured bottleneck. Profile before replacing them wholesale.

These are explicit trade-offs, not claims that the normal run is currently leaking or missing its frame budget.

## Runtime acceptance still required

Use a named desktop GPU and browser at 1080p MEDIUM. Capture idle, crowded combat and boss scenes; require sustained 60 FPS with p95 delivered frame interval below 20 ms. Include the complete composer draw-call/triangle counters and renderer geometry/texture counters. Compare after warm-up over repeated Retry, LOW↔ULTRA changes and context loss/restoration. Require a stable memory plateau and no duplicated input or RAF behavior. LOW/mobile still needs its separate 30 FPS, touch and thermal checks.

Browser control remains blocked at tool startup by the host's Windows sandbox ACL failure, according to the current execution report. This is not evidence of a game failure and does not substitute for those measurements.

**Disposition:** accept Code Quality & Performance at **8.5 provisional** and continue the user's sequential review process. Keep runtime performance acceptance open and preserve the two documented maintenance trade-offs above in the handoff.
