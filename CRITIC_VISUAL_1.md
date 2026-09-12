# Focused critic: Visual Fidelity & Shaders — Round 1

Date: 2026-09-11. Independent Harsh Game Critic / Senior Three.js Engine Auditor.

**Baseline: 7.9 / 10, source-engineering assessment only. The 8.5 gate is not yet met.**

I inspected the current material library, sky/lighting rig, post stack, player and enemy builders, particle shaders, fortress batching and texture forge. This is not a live visual verdict: browser control remains blocked by its kernel/sandbox failure, and I did not render through a substitute browser automation route. The user's acceptance of all three camera views is respected; no camera, framing, sector or collision changes are requested here. The reported 62 passing tests are context supplied by the implementation agent, not tests independently rerun in this baseline review.

## What already earns credit

- A consistent industrial palette, repeatable panel/normal/roughness textures, explicit color-space handling for albedo, and environment lighting give the fortress a coherent material system.
- Player craft uses swept extruded wings, an actual canopy, trim, intakes and nozzle rings. This is substantially more authored than a single primitive placeholder.
- Merged fortress material buckets, emissive vertex-color gains, shadow receiver surfaces and a deck-aware altitude shadow preserve the accepted visibility work.
- HDR scene rendering feeds threshold bloom, then OutputPass, then a combined display-space composite/FXAA pass. Hit aberration and restrained vignette have a sensible architecture. This is luminance-selected bloom, not an object-layer-selective bloom implementation; that trade-off is acceptable if metallic highlights remain controlled in actual play.
- GPU particle lifetimes, camera-aware point sizing and quality budgets support effects density without requiring individual particle objects.

## Concrete blockers to 8.5

1. **The solar corona is a rectangular overlay.** `Sky._buildBodies` creates a transparent additive `SpriteMaterial` with no map and `depthTest: false`. Transparency alone does not produce radial alpha: it renders the entire sprite quad, and its late transparent pass overlays intervening foreground geometry. Give the corona a soft radial-alpha texture, let scene depth occlude it, and verify owned texture/material cleanup. The existing procedural glow texture is suitable.
2. **Custom Fresnel geometry is wrong for classic view and nonuniform scale.** `forceField` and `energyCore` transform normals using `mat3(modelMatrix)` rather than inverse-transpose normal handling, and derive the view ray from finite camera position even for an orthographic camera. `addRim` also uses perspective-style `normalize(vViewPosition)` in every projection. Use consistently view-space normals (`normalMatrix`) and perspective/orthographic view directions. Preserve the intended double-sided absolute-dot response for energy materials. Meaningful checks should cover a nonuniformly scaled surface and equal normals at different screen positions under an orthographic camera.
3. **The rim light is not anchored as a directional rig.** `Sky.update` moves `rimLight.position` with the player, but leaves its target at the world origin. Its direction therefore changes with sector progress and eventually approaches the travel axis. Add/update an owned target that translates with the light, and dispose it. Verify that equal local situations at distant Z positions have the same light direction.
4. **The recurring enemies are under-authored next to the player and fortress.** The flying craft is still an octahedron plus two flat wings; turret and silo silhouettes are mostly unbroken primitive stacks. Add a bounded layer of manufactured form: fighter canopy/intake/nozzle housing, turret armor collar and barrel sleeve, silo panels/braces or a visibly mechanical hatch surround. Reuse cached or merged geometry and shared materials, keep small dressings from inflating shadow passes, and preserve existing collision silhouettes and firing telegraphs. The goal is enemy identity and material breakup, not raw polygon count.

## Re-review acceptance

Correct the three rendering defects and show that enemy secondary forms are deliberate and bounded in geometry/draw cost. Add focused regression evidence for the projection/light invariants and resource ownership. I can then reassess the **source-engineering** gate without demanding changes to the accepted views.

Actual composition, bloom clipping, specular aliasing, transparency ordering, normal-map readability and shadow stability still require live frames and a short moving playthrough. No static review can honestly certify those or an overall AAA visual result. A possible 8.5 source score must remain explicitly provisional until that inspection is available.
