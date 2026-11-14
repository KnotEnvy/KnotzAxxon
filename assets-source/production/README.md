# Initial production models

Drone, interceptor, heavy turret, mine, shield pickup, parked fighter, spread pickup, repair pickup, fuel pickup and missile were built with Sol XHigh on NitroBliss using native Linux Blender 5.2.1 LTS. These are frozen initial submissions, pending the user-deferred Opus review and polish. The user approved these initials for release on2026-11-14;formal Opus review/polish remains deferred.

Each `initial/` directory includes editable sources, packed blend, GLB, measurement and motion evidence, original renders and SHA256SUMS. Never regenerate into or modify a frozen initial directory. Use a writable copy and follow its regeneration instructions. Receipts in `docs/asset-production/` verify archive and all frozen content hashes on SuperBeast.

The user-approved assets now load by default. `?productionModels=0` retains the prior procedural QA alternatives. Run `npm run test:models` for actual loader,motion,state and lifetime checks,and `npm run test:models:legacy` for the fallback. Sources remain editable;complete frozen originals are archived before repository evidence is curated by the retention manifest. Release status is recorded in `docs/asset-production/status.json`.

Both flyers retain the game's fixed world-space shot spawn, which does not follow the banked airframe. Diagnostic renders measure that existing graphics/mechanics mismatch. Extreme banks can also put wing tips below the deck; do not clamp gameplay or alter hit radii to hide this. These remain items for deferred art polish. Offline EEVEE images are labeled reconstructions; actual in-engine QA captures are separate integration evidence under `artifacts/imported-models/`.

The heavy turret uses an annular foundation and open weapon yoke. Its original turntable and twin gun pivots remain unchanged, including predictive shot placement. The shared source red neon binds the charge lens; the existing additive hit shell follows the turntable. `heavy-turret/initial/runtime-map.json` records the complete contract and deferred limitations.

Mine retains root-based tumble/bob, the original red proximity pulse and one-time warning. Its authored shell is hidden on load and retains its existing1.2 scale; imported per-instance resources are disposed separately from the Materials-owned neon. The exact map is `mine/initial/node-material-map.json`.

Shield pickup is a camera-facing badge, not a deployed bubble. Its three authored mesh/material batches replace only shield visuals in the opt-in path. Imported instance geometry/materials are released by Pickup.dispose, while shared halo/template resources retain their original ownership. The authored cyan facet palette is unlit with toneMapped=false; it deliberately replaces the procedural uniform gains, as recorded in the frozen manifest.

Parked fighter retains its -Z-facing nose, deck origin, seeded scramble/yaw, attached landing gear and source engine/beacon/launch motion. Generated hit geometry is parented beneath the imported root for explicit disposal. Original shared-neon cues remain Materials-owned. The full map and known limits are in `parked-fighter/initial/RUNTIME_MAP.md`.

Spread pickup declares reuse of the shield frame kit and supplies a distinct triple-chevron glyph. Its shell and shape use instance-owned clones of the source amber neon with neutral vertex multipliers, preserving the original gains while leaving cached source materials unchanged. The14-second spread grant, score and existing shared halo remain game-owned.

Repair pickup retains its green cross identity and source one-point hull restoration/cap. Its authored unlit vertex palette is preserved with toneMapped=false; shared halo remains external. All received initial directories are hash-verified read-only snapshots with executable modes retained. Copy to a writable directory for regeneration or polish.

Fuel pickup uses a yellow barrel glyph, separate from the destructible fuel tank. Its authored static scale is baked into geometry; the imported shape remains identity scale. Source neon1.15/1.35 clones preserve yellow hue/gains without changing shared caches. Collection restores0.3 fuel capped at1 and awards150 points.

Missile remains one instanced draw for40 pooled slots. Its464-triangle vertex palette uses a white source armor clone with the rim shader hook reapplied once per Projectiles object. Slot launch/update/kill/clear never clone or dispose resources; shutdown owns the single geometry/material pair. Source typed-array and orientation behavior is checked against the frozen procedural module.

Dreadnought is a frozen Sol XHigh landmark initial, streamed through existing fortress material buckets in the opt-in preview. It introduces no gameplay collider. Its own mapped sections include the stern overflow, while the original random branches preserve subsequent scenery. Source shared fortress textures/rim/light animation are retained; actual posed evidence is distinct from offline EEVEE. Final art/readability and sustained streaming acceptance remain pending.

Carrier uses its original GLB for interchange and separate frozen carrier-template.bin/JSON as the runtime source. The adapter reconstructs neon phase/gain and radar pivot/spin into the existing six chunk buckets; it does not load both as duplicated geometry. Modules prepare once per level start/grid phase. The source RNG consumer preserves subsequent scenery. Unsnapped launch origins remain unchanged, with pier intersections documented for deferred art review.

Asteroid kit contains Talus/Keel/Scar templates, loaded once and selected without new game RNG. Only void scenery rocks change. The adapter retains five original shape draws,seeded radius/anisotropy/tint,world UV projection and shader pivot/spin, then multiplies authored vertex palette into the existing rock tint. Barrier/ring rocks retain procedural geometry and ownership.6 template geometries (imported plus baked) are loader-owned until shutdown.

Drifting wreckage has two hollow fragment templates532/480 triangles. Its frozen runtime sidecar reconstructs attached ember-slot animation and linear palettes into existing shared dark/neon buckets; the GLB remains interchange evidence. Original taken-branch random draws and following scenery remain unchanged. No motion,colliders or new effects are introduced.

Antenna has a static seed42 Blender/GLB reference plus a startup parametric recipe preserving source h7..13 and aerial widths/spacings. Five geometries are shared until shutdown; source dark/neon buckets and surface records remain unchanged. Cooling stack similarly uses its height-weighted cached template at h7..11;heat phase and the steam emitter retain original source control and ownership. Their actual-engine evidence lives separately from frozen offline renders.

Rooftop flak is static ambient scenery,not an enemy turret. Its704-triangle source template poses continuously at original seeded pitch/yaw and roof origin,then merges into hull/dark buckets. The original emitter remains between barrel tips with unchanged direction/rate/ownership. Source wall occlusion and finite roof-envelope limitations remain for deferred art review.

Bunker uses its three audited GLB meshes directly as shared loader templates. Runtime source tints,world-projected UV/AO and one warm phase draw remain authoritative;there are no per-bunker roots/material clones. The initial GLB remains byte-identical,with three geometries released once at shutdown. Source decorative surface records stay unchanged.

Bulk fuel depot is separate passive airfield scenery:992 triangles into existing mapped hull/unmapped dark buckets,using two startup-cached geometries and no game-RNG draws. Original four saddle guide surfaces and all callers/placements stay unchanged. The GLB is authoring/interchange evidence;runtime uses fuel-depot.template.json. Source lighting darkens the offline palette significantly. All47 frozen content hashes and public copies verify;Opus review/fix remain deferred.
