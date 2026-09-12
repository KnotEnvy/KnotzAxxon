# Focused critic review 1: playfield and enemy visibility

**Score: 8.0 / 10, provisional static assessment. Gate: pending; 8.5 is not established.**

Scope: playfield framing, decorative occlusion, enemy visibility and altitude legibility only. This is not a rescore of the other four original categories. Review performed September 9, 2026 from source and targeted Node tests. No rendered playtest, moving encounter observation or GPU capture was possible; the parent reported browser initialization blocked by sandbox ACL failure. User playtesting feedback is valuable but does not substitute for an independent observed run.

## Improvements supported by code

- Classic camera translates its eye and focus 28 world units ahead together, preserving the isometric direction, and anchors laterally to the corridor. Steering no longer pulls a lane out of view.
- Orthographic framing preserves width at narrow aspect ratios. The current projection test passes for both lane limits, both altitude limits and a 65-unit forward target at landscape, square and portrait aspects.
- Near-side trench structures use a 3.2-unit cutaway and skyline structures a 6-unit cap. The far-side silhouette remains full height. This directly addresses the obvious decorative occluders.
- Passed walls, arches and gates are owned by separate groups and hidden after clearance; approaching barriers remain opaque. Gate animation ownership and chunk cleanup remain explicit.
- Three targeted visibility tests pass on the reviewed snapshot. This is mathematical/source evidence, not pixel-level readability evidence.

## Grievances

1. **P2, confirmed altitude-cue depth defect:** `Player._updateShadow` puts the blob at y=0.06 and the ground ring at y=0.08, while both materials keep depth testing enabled. `Fortress._deck` places a central grate up to y=0.23, the center conduit up to y=0.32, random deck plates up to y=0.7 and pipe decoration up to y=1.5. These opaque surfaces can cover the primary altitude footprint; renderOrder does not overcome opaque depth. Raise/project guides to the decorative receiver surface, or implement a deliberate deck-guide rendering strategy that still respects real gameplay barriers. Verify center-channel and plated-deck traversal at low/high altitude.
2. **Validation defect:** the initial near-wall test shoots rays from camera.position to each target. Classic orthographic view rays are parallel, so this is not the actual classic line of sight. Replace with parallel reverse-view rays or a correctly unprojected NDC ray before using it as occlusion evidence. Parent notified during review.
3. **Live acceptance pending:** geometric containment alone cannot establish enemy contrast, on-screen size, reveal time at boost, abrupt passed-wall disappearance or HUD overlap. At minimum observe a dense fortress stretch at low and high altitude, lane extremes, boost, gate passage and low preset. Inspect modern/chase separately because corridor anchoring is classic-only; narrow-screen autodetection currently selects chase.

## Next focused gate

Resolve the footprint depth defect and correct the sightline regression. Then independently inspect live classic combat at 16:9 and a narrow viewport, including approach and passage of a barrier, with enemies and altitude cues simultaneously visible. Record browser, viewport, quality and evidence. A passing build or mathematical framing test alone must not be promoted to a live visual 8.5 acceptance.

No implementation changes were made by this critic. Other categories deliberately remain at their previous review state.
