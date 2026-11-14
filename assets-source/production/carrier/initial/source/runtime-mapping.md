# Source/runtime mapping — CARRIER prototype

## Placement, modules, hierarchy

Full GLB has six identity-space mesh nodes named `carrier-template-<bucket>`.
Its transformed coordinates are already game axes; only Z translation is
permitted. `carrier-template.json.parts` names each editable mesh, collection
role, material key, non-indexed firstVertex/count, rest bounds and effect data.
`.blend` collections include primary-hull, hangar-frame/interior/effect,
flightdeck/rail/structure, catapult/effect, island/effect, machinery, radar,
stern-engine/effect. Distinctive island, radar and stern are authored once.

Part ranges describe **source binary** ordering, not GLTFLoader's reindexed
vertex order. Do not stamp JSON ranges blindly onto GLB vertex indices.
The binary is the authoritative runtime prototype source; GLB is static
interchange/preview. Do not load/mount both as duplicated draw geometry.

`loadTemplate` reads little-endian Float32 arrays. Descriptor includes byte
offset, scalar count and itemSize. Positions/normals/pivots/axes are game
space; vertex colors are linear; structural UVs use dominant box projection
at10-unit scale, preserving common texel scale rather than one tiny atlas.
No images/textures or additional material slots are needed.

`prepareModules(template, start)` translates positions/pivots, corrects light
phase, clips each triangle against each intersected96-unit world slab, and
linearly interpolates attributes. Effects have separate topology, so clip
interpolation never averages different modes/axes/pivots within a face.
The fixture drops degenerate cut triangles and verifies Float32 seams.
Modules are unique cached arrays keyed by absolute chunk index; no distinctive
superstructure repetition, duplicate decorations or caps across chunk cuts.

At start6510, chunk67 is the first partial bow, chunk72 contains the island,
and chunk78 contains the stern. Exact key/bucket/triangle table lives in
`checks/runtime-fixture.json`; alignment is computed, never hardcoded.

## Six shared material keys

| Template key | Existing source material | Geometry/color intent |
|---|---|---|
| hull | `Materials.hull` | Cool steel faceted skin, fitted frames, mullions, cantilevers, rails; source hull maps/normals/roughness retained |
| deck | `Materials.deck` | Flightdeck planes/soffit/taper; source deck mapped response retained |
| dark | `Materials.darkMetal` | Deep interior, machinery, channel liners, bell cavities; source base0x3a4a5e multiplies authored colors |
| paint | `Materials.paint ?? Materials.deck` | Restrained white/amber operating lines/04; source polygon offset retained |
| neon | `Materials.neonVertex` | One self-lit hue/brightness bucket, world-phased source lightGain/aAnim |
| spin | `Materials.spinMetal ?? Materials.darkMetal` | Single open radar; source aPivot/aSpin shader and clock |

No material clones, new per-part draws, unique shaders, per-part textures or
new rim passes. Structural source materials have no player/enemy fresnel rim
patch; use their original environment response plus existing sky rim light.
Do not transplant the shipped fighter rim shader onto the landmark. Source
spinMetal is dark, metallic0.78/roughness0.36, and source hull/deck have their
existing mapped metalness0.36/0.22, roughness and normal response. Offline
plain authored materials intentionally approximate, not replace, these.

The source binary includes modest top/bottom face tint. Bulk append passes
this tint once and does **not** apply Batch's per-box AO again. Its source
front/side-light lift is not numerically reproduced; later adapter validation
must judge the real texture/lighting exposure. Shared texture ownership stays
with Materials, never a module or GLTF preview clone.

## Effects

- Neon vertex attribute `aAnim=(mode,rate,phase)`, same mode constants0..4.
  Headers steady; cyan depth chase `(2,.8,-worldZ/128 mod1)`;
  catapult chase `(2,1.4,-worldZ/96 mod1)`; beacon `(1,.7,0)`;
  bells `(3,.8,8/30)` and `(3,.8,24/30)`. No flicker is newly invented.
- `runtimeNeonGain` restores source-role intensity into CPU vertex colors:
  amber header1.15, cyan0.8, catapult1.3, bridge1.05, strobe1.6, bell1.1.
  GLB colors remain0..1; static preview uses its own emission approximation.
  This matters for source bloom threshold1.02 and no-tonemap neonVertex.
- Sidecar stores local phase and period. Module preparation subtracts
  `start/period mod1`, preserving source world-Z phase despite local export.
- Radar `aPivot=[94,39,start+420]`, `aSpin=[0,1,0,.6]`. Rotate positions and
  normals via source Rodrigues shader using shared `Materials.clock`.
- Source Batch.merge keeps spin frustumCulled=false and source no-cast rules.
  Do not use only a rest boundingSphere as the radar's animated visibility box.
  Sampled full-turn local sweep bounds are in the fixture report.
- No Blender action is offered as runtime motion. Shader attributes are not
  claimed to survive ordinary static GLB export; the separate source binary,
  JSON and CPU fixture reconstruct them explicitly.

The fixture calls real source neon getter/addSpin/update on a prototype-created
receiver to avoid the DOM texture forge, and checks shader declarations,
normal/position rotation and shared uniform identity. It does **not** compile
a GPU shader. Actual merged attributes are separately verified using real Batch.

## Exact RNG preservation

Replace only `_carrier` visual output at its original `_voidProps` position.
Never run the old `_carrier` geometry as well as the new one. First execute
`consumeCarrierRng` from the fixture with the **same rng instance/z0/sector**:

1. start=`(sector.zStart??0)+160`, end=start+980.
2. a=max(z0,start), b=min(z0+96,end).
3. Iterate z=a;z<b;z+=16, len=min(16,b-z), zc=z+len/2.
4. Only when `floor(zc/16)%3===0`, for four windows consume
   `rng.range(-4,4)` then `rng.bool(.7)`, in that order.
5. No calls elsewhere; island/bells consume none. Append cached authored
   module with **no RNG calls**, then resume original `_voidProps` asteroid
   and following decoration generation.

Fresh real-source checks compare post-call PRNG state on48 seed/chunk cases.
State equality guarantees the same subsequent random sequence, even though
authored window locations no longer depend on those consumed random values.
Do not replace with a constant number of draws perchunk: clipped16-unit
segments/endpoints and world-Z modulo change the correct count. Do not seed
a second decorative RNG into the shared stream.

The new runtime emission lookup must also run on chunks intersecting any
authored overhang (e.g. end+7), even if the old a/b span itself is empty;
consumeCarrierRng correctly consumes zero there. Do not retain the source's
early-return as an overhang-visibility test.

## Chunk build and lifetime

Reference sequence, NOT a production edit:

```
preload: source = loadTemplate(assetDirectory)
level preparation: modules = prepareModules(source, sector.zStart + 160)
replacement _carrier build:
    consumeCarrierRng(rng, z0, sector)
    appendPreparedModule(batch, modules.get(floor(z0 / 96)))
continue unchanged _voidProps and the existing Batch.merge once
```

Bulk append copies source arrays into existing per-material scratch buffers.
`Batch.merge` copies those buffers to unique chunk BufferGeometry, retaining
original `_matFor` shared resources and lifecycle. No temporary GLTF part
roots/material clones are created, no full-landmark stamps, and no per-frame
clip/rebuild. Prepartition before entering gameplay, not at every chunk build;
the CPU clipping fixture is illustrative, not a measured loading-time promise.

Discard prepared/source CPU templates only on loader shutdown or a deliberate
level-cache eviction after users release them. `_disposeChunk` must dispose
only that chunk's unique geometry. Shared materials/textures and templates
must remain alive. Source Batch.add consumes supplied temporary geometries;
this bulk path supplies no intermediate geometry to accidentally dispose.
The tests assert separate arrays, matching attribute lengths, real-Batch
counts,57 per-bucket test geometry retirements, and zero shared material
disposals before shutdown. The exact measured disposal count is authoritative
in JSON if a topology edit changes it.

## Still deferred

Production loader selection/integration, source texture exposure, actual GPU
shader/render behavior, performance/VRAM, streaming under arbitrary movement,
camera transitions/portrait, launch visual adjacency, final art judgment,
Opus review and all acceptance remain deferred. No new collision/cover/target
geometry or damage/detach/retraction/door/launch system is part of this asset.
