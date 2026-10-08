# Independent critic: Authenticity & Altitude Feel, focused re-review

- Scope: **Authenticity & Altitude Feel only**; current campaign and existing three camera views retained.
- Evaluation date: 2026-09-10.
- Baseline: 7.0 / 10 in `CRITIC_AUTHENTICITY_1.md`.
- Revised score: **8.5 / 10, provisional source-and-simulation assessment.**
- Gate state: implementation threshold met for this bounded review; **live authenticity/feel acceptance remains pending**. This is not a final all-category 8.5 verdict.
- Independence: critic inspected the actual revised source, independently ran the final 30-test suite, reproduced two residual defects, and verified the resulting corrections. This critic changed no implementation files.

## Verified corrections

1. **Altitude and lane alignment matter again.** Normal primary fire has zero vertical steering and travels along its forward lane. Steering is restricted to the explicitly labeled Flight Assist option. Normal target acquisition uses the current muzzle line and checks solid cover. The old unsupported separate-bomb-button explanation has been removed.
2. **Existing fighters now engage.** Dive fighters close before committing to a one-way peel, instead of accelerating away indefinitely. The behavioral regression observes closing distance, the committed exit state, and eventual overtaking. No additional sector or enemy type was needed.
3. **Cover has one physical contract.** `WorldCollision.traceWorld` is shared by hull, player bolts, hostile bolts, missiles, and target sight lines. Player and enemy projectiles now stop at the nearest intervening static wall or current coolant-gate half. Gate faces have a previous/current sweep, including a moving gate crossing a stationary ship.
4. **Terrain remains physical during damage grace.** Invulnerability suppresses repeated damage but no longer disables push-out or slowdown. Static walls and gates use the same ship clearance. The HUD narrows its safe opening by the ship radius plus a small margin and advances past cleared walls.
5. **Fuel rewards follow shooting skill.** Ramming a tank gives no fuel reward. Shooting it restores fuel. Empty-fuel hull loss bypasses projectile shields and roll/recent-hit invulnerability; the regression verifies the same depletion at 30, 60, and 120 updates per second and eventual death.
6. **The altitude gauge matches open-space flight.** The normal floor remains within the displayed flight envelope, avoiding an invisible negative-altitude range in space.

## Defects caught and resolved during this re-review

### Reduced engagement range initially made missile silos inert

Narrowing hostile engagement range was useful for readable attacks, but retaining the original first-shot timers left too little time to launch. Independent actual `Silo.update` simulations over 100 representative seeds found only 4/100 firing on an outer-sector normal pass, 0/100 on an outer-sector boosted pass, 12/100 in reactor conditions, and 22/100 in gauntlet conditions.

The first-engagement timer correction restored 100/100 launches in all four seeded diagnostic batches. The final implementation uses a real-time first telegraph of 0.45 seconds for turrets and 0.55 seconds for silos, independent of difficulty; subsequent cooldowns retain their difficulty scaling. The final suite independently verifies attacks occur before the player passes the enemy at speeds 48, 82.56, and 103, while preserving those first-attack telegraph durations.

### Boss alignment brackets initially disagreed with the collision edge

Target acquisition expanded boss pods by the ordinary projectile padding while the boss narrow-phase used its unexpanded pod radius. An independent probe acquired the bracket at offset 5.5 from a radius-5 pod but the bolt missed.

Boss pod/core acquisition now uses the same radii as the actual boss collision path; the core cue also uses the same greater-than-0.55 opening threshold. The final regression confirms offset 5.5 produces neither cue nor hit, while offset 4.9 produces both. The source change was independently inspected.

## Evidence and limits

- **30 / 30 tests passed independently on the final source snapshot**, including 14 authenticity-focused tests. Existing projection, visibility, resolution-recovery, and nearest-hit regressions remain green.
- The user reports that the previous visibility work looks good in all three camera views. This is valid user evidence for that earlier work, not independent observation of this combat revision.
- Browser automation still failed during startup with the sandbox ACL problem reported by the parent. This critic performed no browser interaction, screenshot judgment, rendered playtest, or GPU measurement. A build reported by the parent is not counted as a live playtest.
- No remaining confirmed implementation blocker was found in this bounded re-review. That statement is limited to the inspected mechanics and simulated cases; it is not a claim that every campaign seed or boss encounter has been played.

## Remaining acceptance work and deliberate trade-offs

- Observe a normal, assist-off run in Classic 45: shoot above/below a target and then align; destroy ground fuel; pass a slot and a moving gate; evade a visible turret/silo attack; and engage a diving fighter. Repeat key cases in the two other approved views and at boosted speed. The specific question is whether the altitude decisions and incoming-shot cues are understandable under actual motion.
- Observe boss pod and exposed-core hits at edge alignment, then a restart. The new geometric regression checks edge agreement but does not judge reticle flicker, sound timing, or perceived precision.
- Validate that first-shot charge/hatch cues are noticeable at actual enemy screen size. Half-second timing is now deterministic; human readability is still an empirical question.
- The remake intentionally keeps three hull points, boost, barrel rolls, shields, weapon heat, and optional assisted aim. It is an arcade-inspired modernization, not an exact original-ROM rules recreation. Those features need no removal merely to raise this score; they must remain understandable and subordinate to altitude/lane skill.
- Simple collision volumes and the small targeting acquisition interval remain practical approximations. Live play may justify tuning their tolerances, but no additional abstraction or new sector is warranted by this review.

## Verdict

The original code-level authenticity defects have been corrected, and the two regressions uncovered during the focused re-review were resolved and tested. **8.5 / 10 is the provisional implementation/simulation score; live category acceptance is pending.** Preserve this evidence boundary in the handoff. This report does not change Visual Fidelity & Shaders, Modern Game Feel & Polish, UI/UX Architecture, or Code Quality & Performance scores.
