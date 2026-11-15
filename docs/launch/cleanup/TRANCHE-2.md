# Remaining CPU ownership cleanup and audit

This tranche applies after `effe59628ff49ee72fd3e8009c9435b0394661e8` on the
existing cleanup branch. It does not include Nitro's independent clock/evidence
changes or any other owner's implementation.

The [audit ledger](AUDIT.json) records all **50 production paths**, findings,
reproductions, actions, owner dependencies and validation limits. The 62 current
JS/Python tooling files were syntax checked; only the named release tools had
focused contract review. Historical capture scripts were inventoried, not fully
executed. No formal security proof, exhaustive allocation-failure coverage,
physical-device acceptance or sustained-FPS claim is made.

## Implemented behavior

- Player, Boss, Projectiles, AmbientDust, Trail, ParticleSystem and Effects now
  roll back partial construction. Nested debris/ring/wreck/light owners register
  attachments before later operations can fail. Every independent private
  resource and scene detach is attempted on final shutdown, even after a thrown
  disposer. Shared material/texture owners remain borrowed. Projectile target
  references are cleared. Constructors preserve their normal scene allocation
  order, generation RNG and appearance definitions.
- Enemy/pickup/texture and imported antenna/cargo/fuel/covered-fighter caches
  clear ownership before retirement and attempt all unique resources. Cargo
  preparation consumes loader inputs on success and failure; a missing second
  cargo node releases the first clone. Recipe preparation registers geometry
  before a later attribute can fail and preserves the original error.
- `SettingsStore.save()` returns the actual payload-write result and sets
  `persistent`: `null` until a write has been attempted, then `true` or `false`.
  Existing change listeners observe the completed write status. Session values,
  valid persisted precision and schema keys are preserved; a later successful
  save recovers persistence. Opus's separate Screens patch consumes this API.
- Passing only the two required Three constructors to the covered-fighter
  recipe avoids retaining the entire namespace during bundling. The unnecessary
  cargo namespace parameter was unused and was removed internally; callers
  supplying an extra `THREE` field remain compatible. Measured final Three
  bundle: 605.98 kB / 154.78 kB gzip, compared with tranche1's 612.10 / 157.15.
  This is a package measurement, not a frame-time claim.

## Validation

**292/292 tests pass**, and Pages plus portable builds pass. All seven new
component constructor tests failed against the pre-fix source before repair;
they now cover every normal scene-attachment position. Seven additional cases
throw from geometry retirement and verify all private resources release once,
the scene empties, borrowed resources survive, and repeated teardown is harmless.
Template tests cover malformed cargo, partial recipe geometry, independent
cache retirement, cache rebuilding and failed settings writes/recovery.

Portable readback found **46 files**, including all **35 model/template files**
byte-equal to `public/models/`, with relative application URLs. All existing
goldens remain unchanged. No browser/GPU work was performed on SuperBeast.

Reproduce:

```sh
npm test
npm run build:pages
npm run build -- --outDir artifacts/launch/cleanup/portable-build
node --test tests/component-lifecycle.test.js tests/template-lifecycle.test.js tests/studio-settings-quality.test.js
node docs/launch/cleanup/evidence/world-disposal-probe.mjs
node docs/launch/cleanup/evidence/reserved-path-probe.mjs
```

The last two commands print fault-injection observations for the older reserved
source in this branch; they are diagnostic probes, not passing release tests.
Their original JSON outputs are retained alongside them. Fable, Opus, Spark and
the primary have been sent these cases for implementation in their own leases.

## Integration still required

The primary reported that tranche1 integrated as `1cdcc68` passes 277 tests
including five primary regressions. Nitro's actual GTX probe retained the same
targeted material program IDs across successful and failed replacements; the
old baseline evicted and recreated them. Default/legacy model, context and UI
hardware checks also passed on that tranche. Those reports support lifetime
correctness and do not establish subjective FPS or eliminate every stall.

This tranche needs combined-tree validation on Nitro. Reserved findings D01-D04
and the Settings UI seam remain outside this branch: Fable owns world cleanup,
Opus owns UI construction/timers/observers, Spark owns audio scheduler/context
retirement, and the primary owns `Game.reset`. The primary also owns source
freeze, portable distribution QA, campaigns, judging and publication. No final
candidate or whole-release completion is asserted here. Current authoritative
handoff/release records, editable assets, archived evidence and accepted art
remain intact; no source/media/archive was deleted.
