# CPU cleanup delivery — 2026-11-15

Base: `62d85e2`, branch `cleanup/public-launch-hydrogen`, existing SuperBeast
worktree. Sol XHigh resumed the same thread after Hydrogen's quota failure.
No new checkout, helper, browser/GPU work, merge or deployment was performed.
The preserved five-file proposal is retained in ignored
`artifacts/launch/cleanup/preserved-hydrogen.patch`; SHA256
`b49fde3ccd1013cc820b739972c88e942d1cdd94268a425325ffb8bcf02e8055`.
The original proposal passed 267 tests and the Pages build at takeover; it was
unaccepted and its performance claims are not adopted.

## Implemented

- `Game.prewarm`: keep one detached set of the **actual staged owners**, including
  their replaced flyer and pickup materials. A successful replacement retires the
  prior set; failed compile or staging cleanup retires the new set and preserves
  the old. Final Game shutdown releases the retained set. Cached GLTF templates
  are never attached or modified. Shared player, fortress, material and texture
  owners retain their existing lifetimes. The retained set is 14 owners (nine
  enemy kinds, boss, four pickups), with 13 imported enemy/pickup roots holding
  123 unique geometry/material resources in the CPU fixture. This deliberately
  retains bounded CPU geometry as well as materials to keep ownership explicit.
  Detached groups contribute no scene draws. Actual GPU program retention,
  shadow/quality variants, frame-time and appearance require Nitro validation.
- `main`: rewarm on a changed quality before a new sortie, and preserve the
  original compile/upload/target-selection error even when target restoration
  also throws. Target restoration is attempted after partial target selection.
- `Input`: track physical keyboard aliases independently; releasing A leaves a
  held Left arrow active. Duplicate aliases generate one action edge. Suppressed
  keyboard, pointer and touch starts cannot dispatch while blurred/suspended;
  a fresh active gesture still works. Pointer cancellation releases mouse holds.
- `disposeModel`: attempt every unique owned geometry/material/instance resource
  and detach even after throwing disposers; repeated retirement is harmless.
  Enemy/Boss/Pickup cleanup also finishes independent owned resources and detaches.
- `ImportedModels`: register parsed roots before preparation can fail; global
  cleanup attempts every subordinate owner and parsed resource, clears the map
  before disposal, and preserves original load errors over cleanup failures.
- Preserve Hydrogen's reset/pause audio state resets through the existing audio
  API. `Audio.js`, mix, title, HUD, world appearance and accepted assets are unchanged.

## Validation

72 focused tests passed, including actual Game/Three/shipped-GLB CPU ownership
tests with file-backed I/O and an image decoder stub. The imported regression
observed all 99 tracked rollback resources released despite a throwing geometry
disposer, 123 replacement resources retired exactly once, and 87 sampled global
template resources attempted despite a throwing disposer. Compile failure left
the prior successful owners valid and the live scene unchanged. Existing staging
failure coverage remains; successful staging now verifies deferred retirement at
shutdown. Full suite: **272/272**. `npm run build:pages` passed.

Reproduce with `npm test` and `npm run build:pages`. Focused command:

```sh
node --test tests/imported-prewarm-lifecycle.test.js tests/game-startup-lifecycle.test.js tests/lifecycle.test.js tests/studio-render-ownership.test.js tests/performance.test.js
```

Ignored raw logs and resource counts are in `artifacts/launch/cleanup/`.
No golden, score/seed/settings schema, collision envelope, generation law or
public fallback flag changed. The old Engine/Level clock bug is still present
in this older base and is intentionally not duplicated: Nitro owns its verified
`9b36398` fix. Integrate this tranche into the current primary tree before any
freeze; the whole-code path audit continues separately.
