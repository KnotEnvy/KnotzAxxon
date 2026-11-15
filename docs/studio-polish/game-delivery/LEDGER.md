# Game startup ownership delivery

Base HEAD and start HEAD: `0ed9d2cd935e514d5c89862cc0815c4e9a6bf542`, existing `main`.
Game.js matched that HEAD at start. Base/start SHA-256:
`9703ecf1d74a80ad8ac622e9b3b04e5d039805d61482b3347bc209a57f930d2f`.
End Game.js SHA-256:
`7c199cc275b76855e10ca0c9ea14e96d4c34eea7aecdbe368f3b9c5a56674892`.
Complete base/start/end file hashes and Git blob IDs are in `start.json` and `hashes.json`.

## Ownership and scope

Only these paths are in `changes.patch`:

- `src/game/Game.js`
- `tests/game-startup-lifecycle.test.js` (new)
- `tests/fixtures/game-startup-lifecycle.mjs` (new)

This worker wrote no sibling or earlier-patch source/test file. Six of the seven
earlier-patch files remain byte-identical to their starting hashes. Engine.js
changed concurrently through the sibling's authorized render/quality-hook work;
its start/end hashes are recorded, and its existing lifecycle fixes are still
present. This is intentionally a shared, dirty working tree, not a pristine-tree
claim. No unrelated patch/source bytes are included in the delivery.

No helper agents, commits, pushes, deployment, installation, checkout/worktree
creation, fetch/reset/clean, browser/full-model QA, or formal Opus pass occurred.
The only delivery network action is the authorized Windows Tailscale file copy
to `100.112.66.64:`. Transfer evidence stays outside the frozen archive.

## Confirmed gaps and disposition

| Status | Item | Actual-source evidence and change |
| --- | --- | --- |
| fixed | Failed Game constructor loses the unassigned instance | Original supplied repro: initial `engine.sky.apply()` throws, outer `game` is unassigned, scene retains 50 geometry-bearing objects. Fixed repro: original error preserved, scene contains only the camera, zero orphaned geometry objects. Constructor now retires assigned owners before rethrowing. |
| fixed | Early prewarm preparation bypasses cleanup | Original second-chunk failure: first staged chunk's eight geometries receive zero disposals after shutdown. Fixed: all eight receive disposal. All preparation is inside the cleanup scope; attached chunk groups are captured even if the builder does not return. |
| fixed | Cleanup failure interrupts later Game/prewarm owners | All owned cleanup calls are attempted once through the existing `runCleanups` utility. Game disposal is partial-safe and idempotent. Entity arrays and boss ownership retire before cleanup; each live fortress chunk is attempted independently before collection reset and root/material retirement. A preparation/compile error survives cleanup errors; cleanup-only errors are reported. |
| fixed | Ownership may be lost between creation and scene attachment/positioning | Enemy ownership is registered before `scene.add`; boss, pickups, field meshes and field geometries are captured incrementally. Tests throw after scene attachment and before positioning, plus between geometry creation and mesh construction. Only newly staged enemies/chunks retire; preexisting live owners survive prewarm. |
| retained | Shared templates/materials/textures and normal application shutdown | Existing owner-specific disposers remain responsible for their resources. Force-field materials stay fortress-owned until Game shutdown. Enemy/pickup cached geometry and application materials/textures survive instance/chunk retirement. Later installed quality callbacks are preserved. |
| already resolved | Normal repeated Game shutdown, quality-pool retirement, main compile/upload render-target restoration | Existing source/tests confirm these work. No replacement lifecycle, renderer, quality, or main-loop system was introduced. Earlier notes describing these as unresolved are obsolete for the current source. |
| outside scope | Settings/UI/HUD/render quality and nested visual constructors | Owned by sibling Sol XHigh. Original broad repro includes those older findings; this delivery claims fixes only for the two Game rows and their directly required cleanup behavior. |

## Validation

- Baseline: **114/114** tests passed before owned edits.
- New owned coverage: **35/35** cases executing verbatim Game source with real
  dependencies and injected boundary failures. **34/35 fail against captured
  original Game.js**; the normal allocation/RNG contract passes both versions.
- Constructor boundaries: HUD, CameraRig, Effects, AmbientDust, Projectiles,
  Player, Level, Fortress, initial sky application, settings subscription, and
  quality callback installation. Previously completed owners retire exactly once.
- Prewarm boundaries: second chunk entry/attached group, second enemy, enemy
  scene attachment, boss construction/positioning, second pickup, both force-field
  material stages, second plane geometry/mesh, field positioning/attachment,
  wreck/chunk/explosion/update effects, compile, compile plus multiple cleanup
  failures, cleanup-only failures, and normal flow.
- Additional tests cover independent failing Game disposers, every chunk cleanup,
  repeated prewarm/teardown, shared ownership, preexisting live owners, both
  silhouette visibility states, and replacement quality callbacks.
- Deterministic normal-startup signature matches the original source exactly:
  `15a619aab805b7b06de0b147e1c2b755d7bfacda1fb252127e71a45011f8353f`.
  It covers level features, camera/player state, staged scene allocation order,
  chunk geometry counts, enemy attributes, and **3,945 RNG calls** with the same
  final RNG state. No gameplay, timing, camera, collider, balance, or RNG tuning.
- Shared workspace suite at recorded input hashes: **155/155** tests passed
  (114 baseline + 35 owned + 6 concurrent sibling tests). Input hashes were
  unchanged across this suite/build interval; later sibling work is not implied
  to have these exact results.
- `npm run build` passed. Vite's existing static/dynamic ImportedLandmarks import
  warning remains; no build failure.
- Three owned syntax checks, whitespace checks, reverse-working-tree patch check,
  and base-index patch check passed. The latter used a temporary isolated index,
  never the shared root index. Patch contains only the three owned paths.

See `validation.json`, `evidence/*`, and `hashes.json` for commands, exact source
hashes, test output, negative original-source results and repro counts.

## Limits and acceptance

These are CPU fault injections and a production bundle, not new GPU/device
measurements. The user's extensive cross-device gameplay acceptance is retained;
full model/browser/device QA belongs to root integration and was not duplicated.

Game can retire completed owners assigned to it. A different constructor that
throws before returning must clean up its own private allocations; those nested
owners cannot be recovered through a failed JavaScript assignment. Attached
Fortress chunk groups are explicitly recovered here. Likewise, each child
disposer is attempted once; a child that throws before releasing its private
internals needs hardening inside that child. Tests do not claim exhaustive failure
injections inside every nested entity/pool constructor or disposer.

Prewarm's compile callback remains synchronous, matching its actual main caller.
The existing main renderer-target `finally` is preserved. No formal Opus pass
or new presentation approval is claimed.

The frozen source/evidence archive includes the owned source/tests, captured base
Game.js, patch, this ledger, hashes, and selected small evidence files. It excludes
dependencies, tools, caches, media, build output and unrelated patches. The SHA-256
sidecar and before/after transfer receipt live beside the archive, outside it.
