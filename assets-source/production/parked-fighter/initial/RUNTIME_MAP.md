# Parked Fighter — frozen INITIAL runtime contract

Status: `pending_deferred_opus_review`. Formal review rounds: **0**. Formal fix/polish rounds: **0**. Technical construction self-checks and corrections are not formal review. No final art acceptance is claimed.

## Hierarchy and exact axes

All numbers here are game/glTF units, not normalized display units. +Y is up, +Z is player travel, **this parked fighter's nose is -Z**. Engine is aft +Z. Root origin is deck `(0,0,0)`, without collision-center offset. Blender authoring maps `(gameX,gameY,gameZ)` to `(blenderX,-gameZ,gameY)`; glTF Y-up export restores the game coordinates. Do not add an adapter turn or scale.

| Node | Parent | Game-local translation | Initial scale | Runtime responsibility |
|---|---|---|---|---|
| `parked_fighter` | glTF scene | `(0,0,0)` | `(1,1,1)` | static asset root, identity rotation |
| `airframe` | `parked_fighter` | `(0,0,0)` | `(1,1,1)` | all fitted hull, wings, canopy, fin, gear and fixed nozzle |
| `engine` | `parked_fighter` | `(0,1,2.3)` | `(.3,.3,.3)` | assign to `enemy.engine`; uniform source scale only |
| `engine_lens` | `engine` | `(0,0,0)` | `(1,1,1)` | amber disk, radius .24, outward face +Z |
| `beacon` | `parked_fighter` | `(0,2.4,1.6)` | `(1,1,1)` | assign to `enemy.beacon`; source visibility toggles subtree |
| `beacon_lens` | `beacon` | `(0,0,0)` | `(1,1,1)` | red lens, radius .18 |

Blender and binary node maps are authoritative for float32 rounding. `airframe` is one Blender mesh with three material slots; Three GLTFLoader creates a named group containing three primitive meshes. Traverse it rather than assuming `airframe.isMesh`. There are five **visible glTF material primitives**, not six draws for six named nodes. Engine and beacon pivots are empty groups by design; source only accesses their `scale` and `visible` properties. There are no authored bones, clips, guns, shots, gear retraction, detached parts, or new mechanics. Detachment: **N/A**.

## Material ownership and Enemy.dispose

| glTF material | Geometry / cue | Ownership after existing `instantiate()` clone |
|---|---|---|
| `PF_Armor` | warm enemy armor, ivory identification paint using `COLOR_0` | per-enemy clone in root `modelOwnedMaterials` |
| `PF_Mechanism` | blue steel, dark rubber, intake recesses, alloy ribs using `COLOR_0` | per-enemy clone in same ownership list |
| `PF_Canopy` | opaque smoked blue glazing; metalness .72, roughness .19 | per-enemy clone in same ownership list |
| `PF_EngineAmber` | exported PBR emission preview | replace with shared `mats.neon(0xff9a3a,2.2)` |
| `PF_BeaconRed` | exported PBR emission preview | replace with shared `mats.neon(0xff3d55,3)` |

Leave the two replaced original material clones in the existing ownership list so `disposeModel` disposes them, even after replacement. Do **not** add the shared `mats.neon` replacements to that list. Materials owns and caches those. Keep vertex colors enabled on cloned static materials. No textures or atlas are used. Shader-rim and bloom implementation remain the integrator's existing game pipeline, not baked into the mesh.

Construct the hit shell from the three static `airframe` primitives using the existing ground-adapter merge pattern: transform into imported-root local space, remove all attributes except position/normal, clear groups, merge, call `enemy._addFlashShell(geometry,1.12)`. **Reparent `enemy.flashMesh` under `enemy._importedRoot`** immediately after creation. It remains initially hidden and one primitive. The existing `Enemy.dispose()` then disposes all five cloned geometries plus this generated flash geometry through `disposeModel`; it separately disposes `flashMat`. No new disposal hook is required. Do not leave the shell directly under `enemy.group` or it would sit outside imported-root geometry ownership. Hidden flash: 4,554 triangles, separate from the 4,698 visible count. The supplied isolated validation executes actual current `instantiate`, `disposeModel`, and `Enemy.dispose` source, verifies clone independence and checks that shared neon remains undisposed.

`scripts/runtime_binding.example.mjs` is an **uninstalled integration example**, not a production adapter. `buildFlashShell` is a supplied callback; its exact tested implementation is in `scripts/verify_runtime.mjs`. The orchestrator must register/load this GLB and bind it in its authorized SuperBeast worktree. No source/public production change was made here.

Recommended loader key/file: `parked-fighter` / `parked-fighter.glb`, mapped from gameplay enemy kind `parked`. Current `buildImportedGround()` does **not** support `parked`; do not call it unchanged with that kind. The standalone verification template map uses the local test alias `parked` only. It is not a production loader registration.

## Constructor ordering: preserve both RNG calls

Keep HP 1, radius 2.4, score 150, contact damage, `pos` reference, lifecycle, aiming and camera behavior unchanged. First call remains `this.scramble=this.rng.bool(.35)`, followed by lift=0 and a new Vector3 velocity. Move the **existing** `this.group.rotation.y=this.rng.range(-.2,.2)` to immediately after those initializations, before any imported early return. Remove its old late occurrence so the procedural fallback still consumes exactly two calls, not three. Then attempt the imported binding. Geometry construction contains no intervening RNG calls, so this reordering preserves source RNG state and yaw on both branches. Never return after a successful imported build before the yaw call. Never resample scramble or yaw inside the asset adapter.

## Dynamic source contract

- Static nonscramble: engine stays .3; beacon still toggles. Spool must **not** animate nonscramble targets.
- Beacon visible iff `sin(time*5+pos.z)>.2`; source world Z phase retained, not root-local Z.
- Scramble spool = `clamp01((95-dz)/40)`; engine scale = `.3+spool*.72+sin(time*9)*.025*spool`, full-spool range `.995..1.045`.
- Only `-20<dz<60`: lift increases `dt*.55`, capped 1; velocity `(0,lift*9,player.speed*lift*.75)`; position adds velocity*dt; root Y cap 23 (`ALT_MAX-2`); pitch damps toward `-.35*lift` with coefficient 4. Preserve yaw concurrently and use Three's XYZ Euler behavior.

For Blender evidence, Three's simultaneous pitch/yaw XYZ matrix is `Rx @ Ry`, not the matrix produced by assigning the same angles to Mathutils `Euler(...,'XYZ')`. The renderer converts that explicit source matrix into Blender basis. All 12 named Blender motion bounds are independently compared against the binary glTF/source-motion report within float32 tolerance; see `blender_verification.json`.
- Source roar event crossing lift .05 stays in original update. There is no actual charge weapon: charge evidence here means **engine spool/pulse only**.
- At exact dz 60 or -20 no launch integration occurs. On leaving the window, position and pitch stop changing, but lift and velocity values persist, engine scale and beacon continue updating. Do not zero the velocity just to simplify visuals.
- Collision sphere remains source origin `(0,0,0)` with radius 2.4. Gear does not justify moving that sphere. At root altitude cap 23, upper visual surfaces may exceed altitude 25 just as source does; the cap applies to the root, not the entire airframe.

## Decorative-airfield coherence

Actual `Fortress.js parkedFighterParts` and `_parkedFighter` were inspected. The decorative hull is similarly low, pointed -Z, with swept wings, three gear supports, center fin, olive-gray upper inserts and hardstand paint. Its `stamp(...,3,...)` argument is **UV scale**, not object scale. The new target retains the same aircraft family and world-sized envelope but warm enemy armor and red/amber cues distinguish the destructible target from olive decorative props. New editable geometry was constructed independently; no player or decorative/source triangles were reused in the delivered fighter. Source geometry appears **only** in clearly named offline reference evidence.
