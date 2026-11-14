# MISSILE — frozen INITIAL handoff

Stage: **pending_deferred_opus_review**. Formal reviews: **0**. Formal fix passes: **0**.
Two construction builds, no helpers, no Claude attempts, no production edits, no publishing,
no branch/checkout updates. The second construction build reverses nozzle winding for
front-face rendering and removes an unused authoring mesh; it does not spend more geometry.
Opus review/polish and optional runtime integration remain the orchestrator's work.

## Asset and contract

- `assets/missile.blend`: saved/reopened, self-contained packed Blender 5.2.1 LTS document.
  Six editable mesh parts remain separate: continuous fitted body/nose, recessed nozzle,
  and four fitted control fins. One material, corner-domain vertex palette, no modifiers,
  no external images. Blender's pack operation has no external textures to pack.
- `assets/missile.glb`: **37,904 bytes**, **464 evaluated/exported triangles**, exactly
  **one visible material primitive**, no textures/images/animation/skins. FrontSide PBR.
  Root `MISSILE_ROOT`, mesh `MISSILE_POOLED`; both export with identity transforms.
- Rest source-world bounds: min `[-.42,-.42,-.76]`, max `[.42,.42,.93]`;
  size `[.84,.84,1.69]`. These match the measured 204-triangle source projectile's
  Float32 bounds exactly. Root remains the original pool position, not the bounds center.
  The asymmetrical center is `z=.085`; do not recenter it.
- **+Z nose, +Y up, unit instance scale.** Editable Blender coordinates are source
  `(x,y,z) -> (x,-z,y)`. The standard Y-up glTF export bakes this into geometry.
  There is no root rotation or corrective normalization to apply in the game.
- Forty copies total **18,560 triangles**. One InstancedMesh, one material, one draw by
  the source rendering contract; not a measured GPU draw submission or frame-time result.
  Budget target400–600, hard ceiling800/instance, 128KiB file limit; all pass.
- Silhouette uses a fitted 12-sided continuous pressure body/seeker, four swept thick
  tail controls embedded into the body, broad functional collar/identification band, and
  an open aft lip with an inset wall and cap. No decorative tiny fittings or microtext.
  Copper/steel/ivory tones deliberately sit beside the selected shipped fighter/silo.
- Missile detach, charge parts, articulation and animation: **N/A**. Sentinel's existing
  prelaunch charge belongs to the launcher, not to this projectile mesh.

## Unchanged source mechanics

Baseline commit `ee221ad3e05cd66292fe02b71b50f513696bdda2`.
`source/src/entities/Projectiles.js` SHA256
`59005ba34945adc131afd980dbc8a2d7ef4fa3a967ec5b7af74b69dc2aec7ab1`.
Relevant untouched source snapshots and selected reference binaries are bundled only
to reproduce this asset's evidence, not as production replacements.

- Constructor: missile capacity40; body/nose/four fins/nozzle merged into one primitive;
  one InstancedMesh using `enemyArmor ?? enemyHull`. `castShadow=false`,
  `receiveShadow=false`, `frustumCulled=false`, DynamicDrawUsage, initially count0.
- Default launch options: life6, damage1, radius1, turn2.2. Input direction normalizes
  to launcher speed. Pool stores flat typed arrays and target references. Free slots
  are preferred; saturation overwrites at the cursor. `clear()` does not reset cursor.
  Launch retains source previous-position initialization behavior; the update step
  copies current coordinates to previous coordinates before motion/collision sweeps.
- Ordinary Silo: root `(x,y+3,z)`, direction `(rand[-.3,.3],1,.35)`, speed44,
  damage1/radius1.3/life7, turn `lerp(1.5,2.9,clamp01(difficulty))`.
  Evidence executes actual `Silo.update` through 34 frames of its .55s first-shot
  telegraph. Door damping yields `.9892552`, hatch y`2.54892552`, scale`.15913308`.
  Synthetic player pose stays fixed during that lead-in; no full game simulation claim.
- Sentinel heavy: actual `_updateLauncher` launch from `launcher.mouth` world position,
  direction `(0,.1,-1)`, speed40, damage1/radius1.9/turn2.3/life8. Existing launcher
  charge2.6s, six-hit interruption and warning `MISSILE LOCK - ROLL` remain untouched.
  CPU test starts an already charged rest-pose mouth; it is not an animated boss replay.
- Sentinel salvo: actual `_missiles` launches `2+phase`, lateral offset4 per slot,
  source y+8, direction `((i-(n-1)/2)*.4,.9,-.6)`, speed46,
  damage1/radius1.4/life7.5/turn`2+phase*.3`. Phase2 tests four simultaneous launches.
- Homing: target alive/pos guard; optional target velocity lead `.22`; normalized-lerp
  steering toward target preserves speed. Source turn is not an exact slerp angular cap:
  heavy sample max step `.0383356424rad` versus nominal `2.3/60=.0383333325rad`.
  This small source overshoot is recorded, not corrected. Missing/dead targets continue
  ballistically by source logic. Culls: z < playerZ-60, y<-50 or y>140; lifetime unchanged.
- `_drawMissiles`: +Z-to-normalized-velocity quaternion, scalar1, packed active indices,
  count=live, update ranges only `live*16` floats. Zero-velocity source edge case is tested
  as a labeled diagnostic; it is not a normal launcher behavior.
- Existing exhaust: probability`.85` per missile update, one spark at the **pool root**,
  inverse velocity, spread`.5`, speed6, life`.34`, size2.6, original colors/variation.
  The visual nozzle is not a new trail origin. Preserve warning/audio/muzzle/proximity
  behavior; source proximity uses70 world units. Evidence captures FX calls, not effects.
- Source Game resolves swept enemy/missile contact against player radius1.5 plus launcher
  radius, with moving-player correction and world sweep priority. Near-graze margin1.7,
  `player.damage`, shield/roll results and impact/explosion paths are unchanged. They are
  inspected/snapshotted, **not** simulated by the asset CPU harness.
- Source kill clears life/target; clear resets life/targets and mesh counts; subsequent
  drawing repacks count/update range. Source disposal is idempotent, removes/disposes
  pooled meshes, disposes unique geometry once, and does **not** dispose shared armor.

See `ADAPTER_RECIPE.md` for one-owned-material lifetime handling. No per-missile
Object3D, GLTF clone, mesh, material, dynamic material, animation or extra draw is allowed.

## Evidence and measurements

- `evidence/build-metrics.json`: authored profiles, exact sRGB/linear palette, build count.
- `evidence/glb-binary-inspection.json`: independent stdlib binary reader, indices,
  triangles, identity hierarchy, palette error, front-face nozzle winding, no degenerate
  triangles, and transformed bounds for23 actual source orientation/trajectory matrices.
- `evidence/blender-reopen-reimport.json`: saved blend reopened, evaluated464 triangles
  across six parts; GLB imported into a fresh scene as one mesh/material, matching bounds.
- `evidence/source-contract.json`: actual constructor/launch/homing/slot packing/clear/
  dispose executions, Silo and both Sentinel launch sites, warning/FX captures, source
  camera snap projections and sampled trajectories at0/.2/.5/1/1.5s.
- `evidence/pool-asset-cpu-verification.json`: independent Three GLB load, throwaway
  capacity40 source pool,60 steps, stable shared resources, reset/reuse and double-shutdown.
  Owned geometry/material dispose once; source library and imported templates dispose0.
- `evidence/projected-pixel-footprints.json`: geometry footprint at960x540 for every
  sampled pose in Classic/Modern/Chase. Launch Silo Modern is about7.75x15.96 pixels;
  Sentinel heavy Chase at .5s about14.37x17.17; heavy Classic launch9.85x6.00.
  The four fins and recessed nozzle are therefore often subpixel or occluded; they are
  not promised readable in every game frame. Broad body, graphite tip and ivory band
  do more real screen-space work. Later synthetic trajectories can leave the camera.
  Projected extents are not actual lit-pixel segmentation or occlusion measurements.
  One thin fin is especially low-contrast in the near-head-on neutral PNG; the binary
  geometry and extreme-pose evidence confirm all four controls. This is a deferred
  readability/polish consideration, not a reason to enlarge this tiny munition.
- Common neutral camera: `(-16,24,-30)`, origin target, vertical orthographic span14;
  key`(-12,22,-12)`, fill`(14,12,8)`. New and source lone views use that identical camera.
  Lineup places new x-7, baseline x-5, selected player x0, selected silo x6, ALL scale1.
  No per-model normalization. The missile is deliberately tiny beside these references.
- `evidence/png/`: actual rendered PNGs, including multiview, ±axes/oblique/zero velocity,
  source launch/incoming/outgoing full frames, matching baseline frames, launcher closeups
  and source homing attitude strips. `sheet-*` PNGs are compositions of those images.
  `CROP-4X-*` and the crop sheet are clearly named nearest-neighbor diagnostics from
  64x64 regions of real PNGs, not resized models or source-camera full frames.
- Source rigs execute actual CameraRig.snap / FlightCamera: Classic vertical span80 at
  16:9; Modern58° vertical FOV; Chase66°. Synthetic moving player `(3,0,20)` determines
  sampled camera snaps; smoothing/shake/boost are not a full-game camera replay.
- Launcher closeups preserve actual sampled root/attitude and world scale1, with a
  tighter diagnostic camera only. Silo aft geometry may remain partly inside the well
  at initial launch, as the source root/visual contract already permits. No eject/retract
  animation or fake moving missile component is invented.

## Explicit limits

Salvo PNGs show the first missile slot only, not the complete four-missile volley.
All four source launches and the40-slot shared-pool resource contract are tested on CPU.
The late Sentinel-salvo Chase pair is retained as explicit offscreen/negative evidence;
it is not a successful visibility demonstration.

All images are **offline Blender Cycles CPU**,24 samples, AgX. They are not live WebGL
screenshots. The source-derived dusk sun is approximated; Blender world fill is not
Three HemisphereLight. No live source rim shader, fog, bloom, tone mapping parity,
runtime material bindings for selected reference GLBs, exact per-object shadow parity,
source particles/trails, real
fortress geometry, collision resolution, GPU profiling or gameplay maximum-density
claim. Offline deck/lane geometry is labeled context only. Sentinel reference is its
shipped **rest hierarchy**, not animated Boss.update. CPU loading strips reference
textures in memory solely for hierarchy/mouth measurement; bundled reference GLBs
remain unchanged. Reference embedded textures are not missile textures.

Only the orchestrator should opt in to production pool integration, run live WebGL/
gameplay verification, conduct deferred Opus review, and verify receipt hashes on
SuperBeast. Sender-side Taildrop completion does not establish receiver integrity.

## Reproduction (copy to writable staging first)

Do not regenerate or edit this frozen INITIAL. Use a separate writable copy.
Python3 stdlib and Node24+, a matching Three.js runtime, and Blender5.2.1 are needed.
External runtimes/binaries/caches are intentionally **not** in the archive.
Set `MISSILE_THREE_ROOT` to the external Three package root. `scripts/blender.sh` uses
the existing local Linux Blender cache by default; override `MISSILE_BLENDER_CACHE`,
or invoke your own Blender executable directly with `-b -t 4 --factory-startup --python`.
The generator's runtime ledger caps construction builds at two in that staging copy.

1. `node scripts/source_probe.mjs`
2. `blender -b -t 4 --factory-startup --python scripts/build_missile.py`
3. `python3 scripts/inspect_glb.py`
4. `blender -b -t 4 --factory-startup --python scripts/verify_blender.py`
5. `node scripts/verify_pool_asset.mjs`
6. `blender -b -t 4 --factory-startup --python scripts/render_evidence.py`
7. `python3 scripts/compose_pngs.py`

Exact binary .blend reproduction across paths/runtimes is not claimed; geometry,
palette, bounds, source mechanics and budget checks are reproducible from these sources.
The bundled `SHA256SUMS` covers every frozen content file except itself.

Delivery was explicitly authorized to SuperBeast `100.112.66.64:` via the known Windows
Tailscale CLI. Transfer results are recorded outside the frozen initial in the sender
receipt, so sending never mutates hashed content.
