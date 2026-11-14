# FUEL pickup — INITIAL implementation

Collectible-only asset, not `FuelCell` or shipped `public/models/fuel.glb`.
Zero formal review/fix passes; no helpers or Claude retries. Opus review/polish
is deferred. Implementation validation and evidence inspection are not formal
art approval. Active repair work is neither read nor modified.

## Asset and kit

`asset/fuel-pickup.blend` is a self-contained, packed, editable mesh source.
`asset/fuel-pickup.glb` contains exactly three mesh/material primitives, no
textures, lights, cameras, animations, halo or collider. Rebuild using the
standalone deterministic `scripts/build_fuel.py`; no reference asset is needed
to build the asset. The upright drum has two broad rolled hoops, shouldered
lid, offset filler cap and a recessed-looking neutral inspection panel. It has
no tiny text and no cross, shield crest, chevrons or mine spikes.

Deliberate kit reuse: frozen spread INITIAL's authored annular frame profile,
six-sided slate/titanium backplate, vertex-color/material conventions and
diagnostic utilities, themselves disclosed derivatives of shield INITIAL.
These are freshly generated standalone meshes, not linked data. Reference
script hashes are in `kit-reuse.json`. Frozen shield/spread binaries are only
read by the comparison renderer and never become delivered asset geometry.

## Exact axes, scale and pivots

Game/glTF XY is the badge plane; +Z faces the camera; +Y is up; 1 unit is 1
world unit. Blender stores `(gameX,-gameZ,gameY)`; the exporter restores glTF
axes. No corrective runtime rotation, recentering or root scale is required.
The root remains at original world origin. Named local game pivots are shell
`(0,0,0)`, core `(0,0,-.30)`, shape `(0,0,+.10)`.

CRITICAL: source fuel shape scale `(.82,.82,.25)` is BAKED INTO GEOMETRY by the
generator. The exported shape node scale is `(1,1,1)` and stays that way.
Do not apply the source static fuel scale again. Existing source update only
overwrites `shape.rotation.z`, not scale. The drum's visible depth is compressed
to match the procedural source, and even the cap fits inside its original
glyph envelope. The outer badge/collider is not enlarged for detail.

`hierarchy.json` records exact local/world row-major matrices, transformed
bounds and named pivots parsed independently from the actual GLB binary.
`runtime-map.json` contains the adapter and exact material map.

## Runtime integration recipe ONLY — no production changes

Run the ENTIRE existing `Pickup` constructor first: preserve kind `fuel`,
`0xffd76a`, label `FUEL`, score150, radius2.2, Math.random phase, baseY,
velocity, alive and halo setup. Instantiate with the existing ImportedModels
clone semantics (owned geometry/materials; template textures externally owned),
then call `attachImportedFuel` from the delivered recipe. It detaches, but does
not dispose, shared procedural shell/core/shape. It rebinds the three imported
named handles. Keep the halo as the existing sibling sprite; never put it
under imported-root disposal.

Shell/shape use owned clones of untouched `mats.neon(0xffd76a,1.15/1.35)`,
neutral vertex multipliers and `toneMapped=false`. GLB standalone nominal
factors are exactly linearized `#ffd76a`, with `KHR_materials_unlit`; source
gains are applied only by the runtime recipe. Shared neon cache is never
modified. The authored backplate intentionally uses the common kit's PBR
slate/titanium colors rather than source enemyMetal's uniform color. No other
intentional hue change. Texture count is zero.

Preserve update verbatim: phase+=dt, camera.quaternion copy, shell Z spin
dt*.3, shell uniform pulse `.975..1.025`, shape Z wobble ±.08, and halo size
`7*(1+sin(phase*4)*.2)` with shared opacity.35. For living player distance<22,
apply source `(1-d/22)^2*60` toward player times dt; otherwise source drift
`baseY+sin(phase*1.6)*.7`. No motion clamps. Controlled phases are evidence only.

Existing `_applyPickup` grants `player.refuel(.3)` through source clamp01 and
unchanged effects/HUD/audio/score. Collection at sum-of-radii3.7 and subsequent
update removal are unchanged. Destructible FuelCell remains HP1/contactDamage1,
shoot-to-refuel.16, no ramming reward, score100, separate imported tank asset.

Future imported `Pickup.dispose` MUST call `releaseImportedFuel` and return
after that imported-only cleanup, instead of disposing shared procedural
parts or traversing halo ownership. Release importedRoot exactly once with
`disposeModel(importedRoot)` and detach Pickup.group. Keep existing procedural
detach-only path and global shared geometry disposal. Never early-return from
the constructor and skip phase/baseY/velocity/halo. Recipe tests exercise128
instances and repeated disposal; production code is not changed or integrated.

## Evidence and limitations

The actual saved source classes/methods execute using installed Three.js,
GLTFLoader and BufferGeometryUtils with VM imports replaced. This is not full
Game/Engine, live WebGL, GPU performance, real audio or HUD integration QA.
Actual FuelCell constructor uses an explicit visual-import stub; actual
Game._killEnemy and _collideContact separately verify tank.16 and no contact
fuel reward, while collectible.3 and capped refill remain separate.

Saved blend reopen, clean GLB reimport, binary accessor/transform/count checks,
source motion/collection/ownership samples and clearance are recorded. The
continuous radial separating-cylinder bound covers every spin/pulse/wobble
combination; an independent Z-slab gap covers glyph/backplate. BVH finite
samples and vertex-to-triangle distances are not exact global triangle-distance
minima. Float tolerances apply. No physics integration claim is made.

PNG evidence reconstructs actual Classic/Modern/Chase source rigs, including
Classic orthographic projection, at shared world scale and source billboard
orientation. Dusk lighting, schematic deck, halo alpha and postprocessing are
offline approximations, not live-game raster captures. Halo proxy matches
size/opacity breathing but not Three's additive blend. Collection stills show
threshold/removal context, not recreated particles/HUD/audio. Nominal exact
color, runtime gains, linear Rec709 grayscale and native-pixel crops are
explicitly distinguished. Small/far glyph details may merge; no enlargement,
text-readability, universal user recognition or formal art acceptance claim.
Weapon charge/detach: N/A except normal lifecycle detach.

## Rebuild from a writable copy

Requires Blender5.2.1LTS, Python3 stdlib, Node>=22.12 and Three.js0.185.1.
The supplied wrapper uses the pre-existing native Linux runtime/sysroot;
override BLENDER_BIN and BLENDER_SYSROOT_LIB if needed. Set THREE_ROOT to an
installed Three package. No installer/download is included. Render comparisons
additionally require the repository player model and frozen shield/spread
INITIAL reference GLBs at the documented relative locations.

```sh
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/build_fuel.py
node scripts/source_probe.mjs
python3 scripts/inspect_glb.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/verify_blender.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_evidence.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_cues.py
bash scripts/native-blender.sh --background --threads 4 --factory-startup --python scripts/render_extra.py
python3 scripts/compose_evidence.py
python3 scripts/finalize_manifest.py
```

Never edit frozen INITIAL. `SHA256SUMS` covers all delivered files except itself;
its digest and archive SHA256/transfer receipt remain outside INITIAL to avoid
self-referential hashes. Future authorized polish belongs in a separate revision.
