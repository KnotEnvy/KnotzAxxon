# Focused critic: Visual Fidelity & Shaders - Round 2

Date: 2026-09-11. Independent Harsh Game Critic / Senior Three.js Engine Auditor.

**Score: 8.5 / 10, provisional source-engineering assessment. Round 1: 7.9.**

The focused source-engineering gate is met. I found no remaining blocker in the four requested corrections. This is not a live visual approval or a claim of AAA image quality. Browser attachment remains unavailable, so I did not render frames, compile shaders on a GPU, listen to audio or play the game. No substitute browser automation route was used. The other four categories retain their separate critics' results; I have not silently rescored them.

## Resolution of Round 1 blockers

1. **Corona:** `Sky._buildBodies` now uses the shared procedural radial-alpha `glowSprite()` map, enables depth testing and keeps depth writes off. The real generated texture has an opaque center, transparent perimeter and decreasing intermediate alpha. Sky teardown disposes its sprite material without destroying the shared texture; global texture teardown owns that final release. The square-overlay cause is removed. Actual foreground occlusion remains a pixel-level check; the CPU test verifies its depth configuration.
2. **Projection and normal handling:** `forceField` and `energyCore` consistently use view-space positions and inverse-transpose `normalMatrix` normals. They interpolate an unnormalized view vector, normalize in the fragment, and choose the constant positive-Z view ray for orthographic rendering. The absolute-dot response for double-sided energy surfaces remains intact. The standard-material rim patch also handles orthographic projection. I verified that the installed Three.js shader prefix declares `normalMatrix` and `isOrthographic`. The CPU regression demonstrates perpendicular transformed normals under nonuniform scale and asserts the shader contract; it does not compile GLSL.
3. **Anchored rim light:** the rim target is attached to the scene, translates with player focus, updates its world matrix and is removed on disposal. Actual `Sky.update` calls preserve both light directions at Z=0, 100, 3000 and 100000. Sector progress no longer swings the rim toward the world origin.
4. **Manufactured enemy forms:** drone/interceptor octahedra are replaced with beveled extruded keels, distinct nose/shoulder proportions, canopies and merged intake/cooling/exhaust machinery. Turrets gain armor collars and panels, with sleeves/muzzle rings merged into existing barrel geometry. Silos gain braces and hatch surrounds; fuel cells gain straps/plumbing. Shared caches own these geometries. Secondary dressing adds no separate shadow casters; barrel details remain in the existing barrel shadow draw. Collision radii and firing telegraph objects remain unchanged.

The additional forward-ordered `smoothstep` corrections in stars and conduits remove undefined reversed-edge behavior. Camera framing and sector content were left intact, respecting the three views already accepted by the user.

## Independently measured CPU geometry budgets

These figures count every mesh and triangle in one constructed enemy, including its transparent flash shell. They are scene-structure counts, not measured WebGL draw calls: shadow and other render passes can multiply submitted work.

| Kind | Meshes | Shadow-casting meshes | Triangles |
| --- | ---: | ---: | ---: |
| Turret | 6 | 3 | 816 |
| Heavy turret | 7 | 4 | 936 |
| Silo | 6 | 3 | 496 |
| Fuel cell | 5 | 2 | 968 |
| Drone | 8 | 3 | 634 |
| Interceptor | 8 | 3 | 634 |

All constructed position values were finite. Corresponding geometries were identical by reference across two instances of each kind. Cache teardown and reconstruction pass the regression check. These budgets are credible for recurring enemies and do not substitute polygon count for authored form.

## Validation

- Independently ran `npm test`: **67 passed, 0 failed**, including five new visual regressions and the existing visibility, authenticity, performance, feel and UX checks.
- Inspected `tests/visual.test.js`: actual geometry/material construction, generated texture alpha, light translation, shared-resource lifetime and rebuild checks provide useful CPU evidence. Shader-source assertions and mathematical fixtures are explicitly not rendered-image tests.
- Implementation agent reports the final production build passed: 46 modules; application `index-pKKaIOye.js` 210.38 kB (66.80 kB gzip), CSS 22.10 kB (5.86 kB gzip), Three.js chunk 565.48 kB (143.66 kB gzip). This build result is supplied by the implementation agent; I independently reran the tests, not the build.

## Residual trade-offs and required live checks

- Bloom remains luminance-threshold selection, rather than an explicit object-layer selection pass. Check bright metal and energy surfaces for clipping and loss of target identity.
- Procedural assets remain deliberately stylized and compact. The new secondary forms are a meaningful improvement, but readable silhouettes and material breakup at actual gameplay scale require moving frames.
- Inspect corona/planet transparency ordering, energy-surface Fresnel, specular aliasing, normal-map readability and shadow stability in all three accepted views. Include low altitude, a moving gate, a dense enemy encounter and a sector transition.
- GPU shader compilation, framebuffer output, frame time, device scaling and runtime GPU memory were not measured by this audit. Confirm them in the real browser before converting this provisional source score into a full visual gate pass.

**Verdict:** the targeted engineering corrections warrant **8.5**, with no further source-only iteration requested. Keep the live visual gate explicitly pending rather than presenting this score as completed browser playtesting.
