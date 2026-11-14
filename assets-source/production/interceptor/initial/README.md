ENEMY INTERCEPTOR — FROZEN INITIAL (pending deferred Opus review)

This is a new authored swept-blade enemy fighter for the existing fast=true Flyer.
It is an initial production asset, not a reviewed/polished final. Formal reviews: 0.
Formal review fix passes: 0. Opus review/polish is explicitly deferred until SuperBeast
is free. No deployment, acceptance, commits, pushes or production integration occurred.

Files: interceptor.blend (editable, self-contained plain materials), interceptor.glb,
manifest.json, scripts/, evidence/, renders/, SHA256SUMS. The SHA manifest hashes all
files in this initial directory except itself. Transfer records live outside the
immutable initial directory. Runtime binaries, sysroots, caches and wrappers are
not part of the delivered archive.

Build/runtime: Codex / gpt-6.1-sol / reasoningEffort=xhigh / AVAILABLE SPEED.
No fast-mode toggle was executed or claimed. Native Linux Blender 5.2.1 LTS,
build 9e2066aef7ef; EEVEE BLENDER_EEVEE; four render threads and 20 samples.
The existing authorized wrapper in ../blender.sh supplies archived sysroot libraries.

Regenerate from the repository root into this asset's editable work directory:

    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/build.py
    node asset-work/interceptor/work/scripts/runtime-contract.mjs
    python3 asset-work/interceptor/work/scripts/inspect_glb.py
    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/verify_blender.py
    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/verify_projection.py
    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/render.py -- --subset=rest-front,rest-rear,rest-top,rest-side,rest-three-quarter,common-neutral
    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/render.py -- --subset=action-weave,action-strafe,action-orbit-displaced,action-dive,action-peel,action-carrier-launch,action-carrier-transition,action-extreme-positive,action-extreme-negative
    asset-work/interceptor/blender.sh -b -t 4 --python asset-work/interceptor/work/scripts/render.py -- --subset=world-scale-player-comparison,gameplay-classic,gameplay-modern,gameplay-chase
    python3 asset-work/interceptor/work/scripts/contact_sheet.py
    python3 asset-work/interceptor/work/scripts/manifest.py

Copy frozen sources into work before regenerating; never run generators in initial.
Scripts resolve their output from their own parent directory. Geometry is deterministic,
with no random mesh generation or textures. Blender save metadata and renderer dithering
may prevent byte-identical .blend or PNG regeneration. Binary SHA256 identifies the
delivered files, not a promise that each rerun is byte identical.
For geometry-only regeneration in a standalone writable copy, the portable command
is `blender -b -t 4 --python scripts/build.py`. Source-contract and shipped-reference
verification additionally require this repository at the recorded commit.

Game axes: +Y up, +Z nose, root at gameplay origin. Authored Blender coordinates are
(game.x, -game.z, game.y); glTF Y-up export returns the game frame. Independent raw
binary POSITION/index/TRS inspection and clean Blender import verify the axes/bounds.
No per-model normalization is used in the player comparison: interceptor appears
screen left and shipped player screen right, both in unchanged world units.

Hierarchy is interceptor > body, eye, engine, hit-flash-shell, plus empty markers.
body contains four material primitives (INT_Hull / INT_Machinery / INT_Accent /
INT_Canopy). eye is INT_Cue (#ff3d55); engine is INT_Emission (#ff5a3a).
The engine pivot is game (0,-0.035,-1.84), at the exhaust face. Existing uniform
engine scale animation runs locally, so it cannot scale the airframe or move root.
The eye is a fixed seated sensor; current Flyer source has no eye pulse animation.

Important glTF visibility convention: hit-flash-shell is stored at zero scale,
because glTF has no standard node visibility flag. The integration recipe must set
its uniform scale to 1.018 and visible=false before the first update, then bind
Enemy.flashMesh/flashMat to the existing additive flash lifecycle. It adds one
primitive only while flashing. Its authored triangle subset follows hull/wing armor.
scripts/binding-example.js is an uninstalled integration recipe, not production code.
The current production ImportedModels loader does not load this asset yet.
Clone per-instance geometry/materials, register modelOwnedMaterials on imported root,
set Enemy._importedRoot, and let existing Enemy.dispose own these cloned resources.
Do not dispose template textures until shutdown. This asset has no textures.

Preserve fast=true HP2 / score320 / collision radius2.2, root origin, original
targeting/lead, shots, lifecycle, normal explosions/wreck effects and all motion.
Detach is N/A. No detachable flyer mechanic is introduced. Normal forward trail is
0.82 player speed (drone 0.62); dive/peel retain exceptions. Normal bank/pitch/yaw
targets and damp rates remain source-controlled; carrier launch clamp is +/-1.1 rad.
Orbit restoring force has no fixed velocity cap. Runtime evidence executes the
original Flyer.update body with source Utils/Rng, finite samples and lightweight
vector operations; rendering/audio/graphics allocation are stubbed. It is not a
live game, GLTFLoader, GPU disposal or gameplay integration test.

Known graphics/mechanics limits (do not silently repair by changing gameplay):

- The original shot is (pos.x,pos.y,pos.z+1.5) in WORLD space and does not rotate.
  A resting +Z ray from that center passes the open nose channel. The nearest
  static surface is ~0.1573 units away. A sampled bank/pitch/yaw produces ~0.4495
  units of offset from the rotated channel. Projectile radius0.9 exceeds channel
  clearance; visual opening is not a narrower gameplay aim envelope. Muzzle FX and
  aiming originate at root, inside the airframe, as in the source contract.
- Wing tips extend to +/-2.86 beyond collision radius2.2, comparable to old wings.
  At minimum root altitude2.3 and extreme +/-1.1 bank with pitch/yaw stress,
  minimum sampled world Y reaches about -0.374. Deck clipping can occur, as with
  the comparable old wings. Do not clamp aim/motion/altitude to fit this art.
- Body assemblies intentionally mate/overlap. The red sensor is seated into its
  fixed brow (32 intersecting surface-triangle pairs); this is not moving-part
  interference. Thin heat petals are intentional open surfaces. This is a game
  assembly, not a watertight monolithic manufacturing mesh.
- At knife-edge launch banks the projected silhouette is thin. Rear views show
  the exhaust cue; the forward sensor is naturally hidden from rear cameras.
- Offline reconstructed Classic/Modern/Chase images use actual CameraRig/Settings
  equations with player (0,9,0), enemy (0,9,32), no lag, shake or boost. Dusk sun/rim
  are approximated in EEVEE. There is no live PMREM/fog/bloom/postfx/HUD/level.
  EEVEE AgX differs from Three ACES exposure1.02; runtime cues use Materials.neon
  semantics in the binding recipe. Crops are explicitly 4x nearest-neighbour.
- Extreme-positive/negative images are synthetic compound stresses combining
  launch roll +/-1.1 with normal pitch +/-0.16 and yaw +/-0.288. They are not
  claimed as a single observed runtime state or a universal orbit envelope.
- No live moving wing/carrier/boss collision, occlusion or GPU profiling occurred.
  Layout density proxy seeds1-100 loops0,1,3 / 355-unit window peaks at 18 of each
  flyer; this is NOT a live maximum. Interceptor at18 = 42,480 visible triangles /
  108 base primitives, before shadows; simultaneous flash adds 11,304 triangles /
  18 draws. Integration must profile real combined waves/carrier/boss contexts.

Self-inspection is initial best effort, not a formal model review. Actual individual
rest/action/gameplay PNGs and contact sheets were opened with image viewing tools.
The final visual observations and limitations are in evidence/visual-inspection.md.
