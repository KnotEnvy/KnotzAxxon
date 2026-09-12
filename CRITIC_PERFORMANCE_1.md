# Code Quality & Performance — focused critic, Round 1

Date: 2026-09-10. Reviewer: independent Harsh Game Critic & Senior Three.js Engine Auditor.

**Score: 7.6 / 10.0. Gate: below 8.5.** This is a source and CPU-simulation assessment of the baseline at the start of the focused performance pass. The implementation agent is correcting these issues concurrently. No live WebGL session was accessible to this reviewer; this score does not certify delivered FPS, GPU memory, visual quality, or full campaign performance. Other categories are unchanged.

## What earns credit

The architecture separates rendering, inputs, collision, campaign state, actors and effects. Projectiles use bounded typed-array pools and five instanced meshes; particle motion runs in shaders with bounded storage and dirty attribute ranges. Fortress geometry is merged by material and streamed within a bounded range. Enemy geometry is cached. The renderer keeps `info.autoReset` disabled until the complete composer frame finishes, so its draw-call counter includes post-processing. Adaptive resolution now responds to delivered frame intervals, with regression coverage for recovery and failed probes. All **30 existing tests passed independently**.

These are substantial foundations. They are not enough to dismiss proven retention and scheduling defects as hypothetical optimization.

## Required corrections, in priority order

### 1. Retired actor materials remain in the shared registry

`Materials.sprite()` tracks every fresh material in `_disposables`; `Pickup.dispose()` disposes its halo material without unregistering it. A CPU-side run of **200 actual Pickup create/dispose cycles** returned the scene to zero children but left **202 entries** in the material registry: 200 retired halo references and two reusable neon materials. Every subsequent `Materials.update()` still walks all those entries.

`Boss._build()` similarly creates a new tracked core shader each time. `Boss.dispose()` frees mesh geometry and pod flash materials but does not dispose or release `coreMat`. **20 actual Boss create/dispose cycles retained 20 core shaders**, with registry growth of 25 including five legitimate first-use cached materials. This is an unbounded application retention defect across boss retries, even though detached scene nodes no longer render.

**Acceptance:** define ownership and release semantics for actor-local materials; bound registry size after warm-up across repeated pickups and bosses; dispose each owned resource once without destroying shared materials. Verify that animation no longer visits retired shaders. These CPU observations establish reference retention, not a measured GPU-memory growth rate.

### 2. Quality changes do not apply the promised effect budgets

`Effects.applyQuality()` only resizes its point-light pool. An actual **ULTRA to LOW** change retained **7,000 sparks, 2,450 smoke particles and 800 debris instances** instead of LOW's **900, 315 and 120**. Only lights reached the expected count of two. Pool traversal, instance capacity and shader vertex work therefore retain the more expensive preset after the user asks for reduced load.

**Acceptance:** change live capacities or active budgets consistently, safely retire replacement buffers, preserve viewport/time uniforms for newly allocated particle systems, and demonstrate bounded scene/resource counts through repeated LOW/ULTRA switches. Graphics settings should update anisotropy consistently or explicitly document which settings require restart.

### 3. RAF ownership permits duplicate frame loops

`Engine.stop()` only flips `running`; it never cancels its queued frame. `Engine.start()` schedules another callback. A direct **start → stop → start** sequence before the next animation frame leaves **two active queued callbacks**. Both then see `running === true` and each perpetuates another chain. The context-restored listener also restarts unconditionally, disregarding deliberate stopped state and elapsed-time recovery.

**Acceptance:** own one pending RAF identifier, cancel it on stop/loss/dispose, make start idempotent, and resume after context restoration only when previously requested. Reset cadence/clock state before restoration resumes. Test rapid stop/start and restore while intentionally stopped.

### 4. Application teardown is incomplete

`Engine.dispose()` does not remove orientation, visibility, settings or context listeners, nor dispose Input. Input and Screens use global anonymous event handlers without cleanup. Game has no coordinated teardown for player geometry/trails, projectile instance buffers, pooled debris/rings/lights, HUD timers and audio. `Sky.dispose()` covers render targets and the sky sphere but leaves celestial bodies/materials and lights. The existing `disposeTextures()` and `disposeEnemyGeometry()` are not wired into a final application owner; Pickup's shared geometry has no cleanup API.

Ordinary Retry reuses most of these application-owned objects, so this item is **not** evidence that every retry duplicates all GPU resources. It is a real mount/unmount, failed-boot and HMR lifetime gap, already admitted by HANDOFF.md.

**Acceptance:** implement one idempotent coordinated disposal path, including listener/timer/RAF cleanup, correct shared-cache ordering and instanced-buffer disposal; wire it to the application/HMR lifetime. Test representative disposed-resource ownership and repeated initialization where host-independent tests can exercise it.

### 5. Slow frames multiply presentation and streaming work

Fortress's `budget = 2` is executed inside `Game.update()`, which Engine invokes up to four times per rendered frame. A slow frame can therefore perform **up to eight chunk builds**, while comments promise a per-frame bound. Each substep also performs presentation, projectile matrix uploads, camera/sky updates and HUD work. This pushes additional work into precisely the frames already behind budget. Engine increments `time` for the entire frame before substeps, so all substeps receive the same timestamp rather than progressively advancing simulation time.

**Acceptance:** bound expensive chunk construction per rendered frame, advance substep timestamps consistently, and move presentation/uploads/HUD to a once-per-frame phase where practical. Preserve moving-gate sweep semantics and add a slow-frame scheduling regression. A measured profile could justify remaining repeated work; none is available yet.

## Remaining measurement requirements

No sustained WebGL FPS, GPU timer, full composer draw-call capture, shader compilation hitch profile or repeated-restart GPU-memory plateau was obtained. Actual draw calls depend on camera, culling, shadows, transparent effects and active combat; mesh count is not a substitute. A passing build or a fast Node test cannot certify those values.

For the subsequent review, source/simulation evidence can establish a **provisional engineering gate** once the concrete defects above are closed. Runtime performance acceptance still requires the documented target: named desktop hardware/browser at 1080p MEDIUM, 60 FPS with p95 delivered frame interval below 20 ms, plus stable renderer geometry/texture counts after warm-up over repeated restarts and quality switches. Capture an idle, crowded combat and boss sample. LOW/mobile remains a separate 30 FPS and thermal acceptance task.

## Reproduction record

- `npm test`: **30 passed, 0 failed**, independent run on the baseline.
- Native Three.js objects under Node, with browser-only settings stubs: 200 Pickup lifetimes, 20 Boss lifetimes, Effects ULTRA→LOW switch.
- Engine prototype with a queued-RAF test double: two pending callbacks after rapid stop/start.
- Source review: Engine, Input, Game, Materials/Textures, Fortress, Effects/Particles, Projectiles, Pickup, Enemies, Boss, Sky, PostFX, Settings and prior handoff/critic results.
- No implementation changes made by the reviewer.
