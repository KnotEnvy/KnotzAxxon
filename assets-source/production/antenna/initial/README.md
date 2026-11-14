# Fortress antenna — INITIAL

Status: **pending_deferred_opus_review**. Formal reviews: **0**. Formal review/fix rounds: **0**. No helpers, Claude retries, production integration, commits, pushes, or deployment.

Implementation: Codex harness, **gpt-6.1-sol**, **xhigh** reasoning, available harness speed (no separate speed selector exposed). Built locally on **NitroBliss** from `ee221ad3e05cd66292fe02b71b50f513696bdda2` using native Linux **Blender 5.2.1 LTS**, build **9e2066aef7ef**, `BLENDER_EEVEE`, four threads. Tools, existing Three dependency, Blender/sysroot, caches, temporary geometry and individual render intermediates stay outside this payload.

## Asset

`asset/fortress-antenna.blend` is a reopened, self-contained packed editable file: one organizing empty, two meshes, two materials, no external images. Structural hardware is separated into named vertex groups rather than additional primitives. `asset/fortress-antenna.glb` is the clean-reimported static reference for **actual source seed 42**, not the runtime implementation. Both contain **304 evaluated triangles**: 276 dark + 28 neon, **two material primitives**. GLB has no textures, external URIs, or animation tracks.

The new construction is a continuous tapered spine with a fitted tapered shoe, flange and anchors, aerial clamps, restrained continuous rear conduit with terminal/clip, and a faceted red obstruction lens. It is not a radar tower. Geometry comes from new parametric primitives, not repurposed shipped geometry. The six shipped GLBs and source asset families are read-only style references; the shipped player is imported **only** for world-scale evidence.

## Source and density

Actual unmodified `Batch`, `Fortress._antenna`, `Fortress._deckProps`, full `_buildChunk`, and actual `Level` campaigns were measured before construction. No approximate stand-in Batch is used. The Node harness exposes the existing private Batch through an appended export and rewrites import locations, without changing its implementation. Material objects are explicitly CPU-only test doubles.

Source seeds 1/7/42/123 produce 72/60/72/84 triangles. Their maximum measured width is 2.3772611618. Full campaigns for those seeds contain 356 fortress chunks, 148 antenna-eligible citadel/gauntlet chunks, and 276 antenna props. Eligible counts 1/2/3 occur 54/60/34 times, mean 1.8648648649 per eligible 96-unit chunk. The caller loop re-evaluates `rng.int(1,3)` at every test, including termination.

Theoretical placement: center X 19.5..24, local X within ±1.2, local Z within ±.2, full Y 0..h+.4 with source h in 7..13 (upper RNG bound exclusive; 13 is an endpoint stress fixture). Thus overall theoretical X 18.3..25.2, top at most 13.4, Z within chunk 5.8..90.2. Lane ±16 and flight 1.3..25 remain unchanged; minimum decorative AABB lateral clearance is **2.3**. Detailed observed placements and transformed bounds are in the evidence JSONs.

## Integration recipe, not installed production code

Prepare `createAntennaTemplates()` **once at application startup** and retain its five geometries. Import the helper once. Replace only the existing `_antenna` method body with:

```js
emitAntenna(batch, rng, x, z, theme, antennaTemplates);
```

Keep `_deckProps`, its `farX()` expression, the caller count loop, and all surrounding RNG calls **byte-for-byte unchanged**. The recipe draws height, then width BEFORE each spacing increment, then strobe rate and phase, exactly like the source. It retains every original width and spacing draw. Height remains source-controlled; do not rescale the reference GLB to manufacture variants.

The recipe stamps cached geometry into the **actual Batch**; it creates no per-part/per-prop scene roots, mesh objects, materials, material clones, or geometry objects. Aerial hardware is 24 triangles per source element; fixed mount/lamp is 208. Across all source-admissible element counts 2..7, total is **256..376**, below 600. Chunk uploads remain existing `dark`/`neon` material buckets. There is no new animation update or per-frame mesh rebuild.

Map `dark` directly to the existing shared `materials.darkMetal` and `neon` directly to shared `materials.neonVertex`. Do not clone or replace either material or invent darkMetal maps. The shared shader clock already evaluates `aAnim = [STROBE, rng.range(.6,1), rng.next()]`; recipe mode 1 is the source `LIGHT_ANIM.STROBE`. Lamp source size is .4, starts at Y=h, gain 1.6, hue `0xff2a3a` for gauntlet and `0xff3d55` otherwise. No static glTF animation reconstructs this behavior.

GLB portability detail: Blender's exporter emits the used vertex color as COLOR_1, plus an unused white COLOR_0, and omits a linked Multiply material factor. The deterministic export canonicalization remaps the used attribute to COLOR_0 and restores the material factor. Structural AO/tints are normalized by 1.1 and the factor multiplied by 1.1 so source top-face AO above one is not clipped in glTF normalized colors. Their product is the source shared darkMetal response, to UNORM16 quantization. Runtime uses the original unnormalized Batch tint/AO and original shared material, not this portable preview material.

The actual source normally disables decorative surface capture before `_deckProps`. If enabled by a caller, the recipe explicitly appends **only the original pole, aerial and lamp rectangles**, identical to source, not the extra hardware. Stamping adds no new cover. No emitter, collider, damage, targeting, camera, aim, rotation, or game mechanics are added.

At chunk retirement, dispose each merged chunk geometry once using existing ownership. Do not dispose shared materials, textures, or templates there. Call `disposeAntennaTemplates(antennaTemplates)` once at final shutdown, after chunk retirement, alongside existing global template disposal. Never add these cached geometries to a chunk's disposal traversal.

## Checks and viewed evidence

- `runtime-validation.json`: 4,096 seed comparisons, adversarial h7/h13 + width/spacing extrema, exact RNG draw arrays/state, original surface records, per-vertex strobe colors/attributes, finite geometry, and downstream probe geometry. Also 356 whole-source-chunk comparisons (276 actual antennas), excluding only intended replacement spans from byte hashes; all other geometry, source emitters and RNG traces match. Material test doubles are disclosed.
- Lifecycle probe: two uploaded bucket meshes, each geometry disposed once; zero material/template disposals at chunk retirement; five cached template disposals at shutdown.
- Clearance: 72 finite height/X/Z/flight samples plus endpoint geometry bounds. Lighting: 48 finite rate/phase/cycle samples of the exact source strobe formula, range .08..1.53. These are CPU probes, not GPU shader execution or exhaustive all-seed verification.
- `blender-reopen-clean-reimport.json`: saved blend reopened, GLB reimported into a fresh empty Blender scene, evaluated 304 triangles in each, two meshes, matching transformed game-axis bounds.
- `independent-binary-audit.json`: separate standard-library GLB binary/accessor/index/TRS audit, 304 triangles, two primitives/materials, finite positions/unit normals, zero degenerate triangles/textures/images/animations/external URIs.
- `01-multiview.png`, `02-hardware-closeups.png`, and `03-world-scale-classic-modern-chase.png` were actually opened and visually inspected with the local image tool. They are not formal review or acceptance passes.

World sheet columns are Classic/Modern/Chase, rows h7 dim, h7 peak, h13 dim, h13 peak. All use the same world-unit scale, actual shipped player at (12,6,0), antenna at (19.5,0,30), 3:2 viewport, no boost/shake. Source rig formulas are used unchanged, including Classic corridor-anchored lead and half-height 40. The forced endpoint fixtures use explicit non-random 2.2 spacing and documented widths, not claimed source random draws. Dim rows show citadel hue, peak rows gauntlet hue; this is not a same-hue colorimetric comparison.

**Rendering limitations:** offline software EEVEE, AgX, source dusk key/rim approximation, not the live Three renderer. Hemisphere/PMREM/fog/bloom and tone mapping are not source-equivalent. The pale deck/channel/edge-marker surfaces are labeled test doubles and do not reproduce source deck materials. Rear studio faces are dark; thin Classic hardware is small at true world scale. Lamp brightness is approximate display evidence, not source bloom calibration. No live GPU timing, FPS, final visual acceptance or receiver verification is claimed. Opus formal review/polish remains deferred.

## Reproduction

Run from the repository root with the same source commit, Node/Three 0.185.1, and the native Blender build. Set `THREE_ROOT` to an existing Three installation when not using the local antenna tooling symlink. Do not install tools into this payload.

```sh
node --no-warnings --loader ./asset-work/antenna/initial/source/three-loader.mjs asset-work/antenna/initial/source/measure-source.mjs
node --no-warnings --loader ./asset-work/antenna/initial/source/three-loader.mjs asset-work/antenna/initial/source/build-geometry.mjs
node --no-warnings --loader ./asset-work/antenna/initial/source/three-loader.mjs asset-work/antenna/initial/source/validate-runtime.mjs
```

Then run native Blender in background with four threads and `--python-exit-code 1` on `source/build-blender.py`, followed by `source/verify-blender.py`; run `python3 source/audit-glb.py` from the repository root using each full payload path. `ANTENNA_ASSET_ONLY=1` skips offline renders when rebuilding just the asset. Generator geometry JSON is deterministic on repeated runs; Blender container bytes are not claimed cross-version bit-identical. Regenerate into a writable working copy, **not this frozen initial directory**.

`SHA256SUMS` covers every payload file except itself. Archive and sender receipt are outside the sealed payload. Transfer is only the assigned asset, generator/runtime-prototype source, measurements/evidence and checksums; no tooling, node_modules, sysroot, caches, raw references or unrelated work are included. Sender success is not receiver verification.
