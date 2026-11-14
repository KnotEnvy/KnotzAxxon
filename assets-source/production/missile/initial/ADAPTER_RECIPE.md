# Adapter recipe only — NOT production implementation

No production file is changed. The bundled CPU fixture operates on a throwaway scene,
not the game. The orchestrator must explicitly opt into a future integration.

1. Load/cache the GLB once during asset preparation, not during each launch. Require
   named `MISSILE_ROOT` / `MISSILE_POOLED`, exactly one mesh/material primitive,
   identity node transforms, +Z nose/+Y up, root0 and size`.84,.84,1.69`.
2. At Projectiles pool construction, take ONE caller-owned geometry clone from that
   loader template, once for the entire40-slot pool. Retain position/normal/COLOR_0;
   do not split by painted region. Keep no groups/material arrays that add draws.
   No geometry transform, normalization, recenter, corrective rotation or instance scale.
3. Prefer ONE per-Projectiles caller-owned clone of `materials.enemyArmor`, not a change
   to the library material. Set its base color to white and `vertexColors=true`.
   Preserve source metalness`.48`, roughness`.42`, envMapIntensity1.2,
   emissive`#4b2419`, intensity`.16`, opaque depth-tested/depth-writing FrontSide.
   Source armor has no texture maps; retain that no-texture setup.
4. Reapply source rim through the library's `addRim` on the owned clone with color
   `#ffb68a`, strength`.32`, power2.8. Three Material.clone does **not** copy the source
   custom `onBeforeCompile` callback. Do not copy serialized `userData.rim` and assume
   the shader hook/uniforms survived. The source implementation assigns new uniforms
   and callback; the CPU fixture exercises that hook. This adds no draw or mesh.
5. If `enemyArmor` is unavailable, make ONE equivalent owned MeshStandardMaterial
   with those exact parameters and white vertex-enabled base, optionally applying the
   same library rim hook. Do not clone the textured `enemyHull` fallback blindly:
   its hull/normal/roughness maps and dense tint are wrong for the absolute palette.
6. Reuse the existing ONE missile InstancedMesh with pool capacity40. Keep
   DynamicDrawUsage, frustumCulled=false, castShadow=false, receiveShadow=false,
   count0 initialization and the existing +Z-to-velocity/unit-scale draw loop intact.
   Individual slots own no geometry, material, scene node, GLTF clone or animation.
7. Leave `launchMissile`, typed arrays, free-slot/cursor behavior, homing, target guards,
   previous positions, packed counts/update ranges, options, collision logic, warnings,
   audio/muzzle/root-based trails, kill and clear unchanged. No geometry loading or
   resource disposal belongs in slot reuse/expiry. Shared template ownership stays
   with the existing loader/cache, not an individual missile.
8. On Projectiles shutdown ONLY, behind the existing idempotence guard: clear/remove
   pooled meshes and let the existing unique-geometry set dispose the owned missile
   geometry exactly once alongside the other pool geometries. Dispose the ONE owned
   missile material clone exactly once as an additional pool-owned resource. Mesh.dispose
   does not do that material cleanup for you. Do not duplicate geometry disposal after
   the existing set handles it. Never dispose `materials.enemyArmor`, `enemyHull`,
   shared textures, loader templates or other library-owned resources here.
9. Do not add any disposal on `kill`, `clear`, expired slots, overwrite or each missile.
   Clearing/resetting keeps the pool's owned geometry/material alive for reuse.

## Hue / vertex palette consequences

The GLB uses absolute **linear COLOR_0** derived from the sRGB palette in
`evidence/build-metrics.json`, with white baseColorFactor, metallic`.48`, roughness`.42`.
The export emissive factor is source-linear`#4b2419 * .16`:
`[.01125761494,.00282271276,.00155539473]`. There is no atlas or texture channel.

Unmodified source armor has `vertexColors=false`, so it ignores all painted separation.
Turning vertex colors on while retaining `#995c48` base multiplies the brown tint twice:
an authored `#995c48` face becomes approximately **#5a1c0d** before lighting. White base
on the owned clone prevents that. Uniform warm source emission and rim will still warm
steel/nozzle at runtime; this is deliberate source compatibility, not an emissive engine.
Offline PNGs have that uniform emission but omit the custom source Fresnel shader.

## Exact face palette allocation

- `armor #995c48`: body z`[-.64,-.48]`, `[-.34,.08]`, `[.22,.32]`.
- `shoulder #b47555`: narrow shoulders z`[.08,.10]`, `[.20,.22]`.
- `identification #c9b78d`: full broad band z`[.10,.20]`.
- `fin_steel #526579`: tail sleeve/collar z`[-.70,-.64]`, `[-.48,-.34]`;
  fin broad faces and trailing/root faces.
- `fin_edge #8698a1`: first two swept leading edges of each editable fin footprint.
- `nose_graphite #26323e`: continuous seeker taper z`[.32,.93]`.
- `nozzle_lip #60717d`: outer aft chamfer and inward lip from
  `(z=-.70,r=.178)` via `(-.73,.147)` to `(-.69,.107)`.
- `nozzle_wall #202b36`: recessed inner wall to `(z=-.53,r=.09)`.
- `nozzle_recess #090f17`: rear-facing recessed cap at z`-.53`.

Both broad sides of every fin remain separately editable with the one vertex palette;
export joins duplicates without destroying the original six-part blend.
