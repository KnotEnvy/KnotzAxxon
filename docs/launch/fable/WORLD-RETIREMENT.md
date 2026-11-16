# World resource retirement under failure (Fable High, Nitro, 2026-11-15)

Implementation receipt for the primary. Ownership and error paths only: no geometry, shader,
material, RNG, collision, envelope or appearance change. Not committed.
Base: HEAD `1cdcc68e63696f308f2521ba9dc3b0434bb76590`.

## Defects (all reproduced on the committed source)

A resource whose `dispose` handler throws stopped the loop it was in. Each row is one
regression in `tests/world-retirement.test.js`, run on the shipped source with real inputs
(the 175-part kit file, a seeded streamed level) and one injected fault.

| # | Path | Before (HEAD) | After |
| --- | --- | --- | --- |
| 1 | `disposeEnvironmentKit` | 1 of 175 templates attempted; cache still holds 175; `ready` unchanged | cache emptied and `ready=false` first; 175 attempted once each; repeat revisits nothing |
| 2 | `prepareEnvironmentKit`, malformed 61st part | the part's own error replaced by the cleanup failure; remaining loader resources skipped; scene not cleared | the part's error is thrown; every loader geometry and material attempted once; scene cleared; the 60 partial templates released and no longer owned |
| 3 | `prepareEnvironmentKit` / `loadEnvironmentKit`, loader resource fails | remaining loader resources skipped; scene not cleared | all attempted once; scene cleared; `loadEnvironmentKit` still resolves `false`; called directly, the fault is reported and the accepted kit stays whole and owned |
| 4 | `prepareEnvironmentKit` over a stale kit that fails to release | the replacement file's loader resources never released | stale templates all attempted once; replacement resources released; fault reported |
| 5 | `Fortress._disposeChunk` | later geometries not attempted; group still parented; `animated`, `rearObstacles`, `emitters` records kept | owner records removed first; group detached; every unique geometry attempted once; borrowed materials untouched |
| 6 | `Fortress.clear` | later chunks not retired; maps and lists not cleared; traffic not detached | maps, queue and lists cleared first; every chunk retired; traffic detached; repeat revisits nothing |
| 7 | `Fortress.update` retiring chunks | the failed chunk stayed in the map and was re-disposed next frame; its neighbours were not retired that frame | each chunk leaves the map before release; all retired that frame; next frame revisits nothing |
| 8 | `disposeFortressTemplates` | 1 template attempted; later caches and the traffic program not released; the failed cache kept its disposed template | every cache given up first; each template, the traffic geometry and program attempted once; repeat revisits nothing |
| 9 | `disposeAmbientTraffic` | geometry failure skipped the program | geometry and program each attempted once; repeat revisits nothing |

Rows 4 and 7 were found while fixing the named cases; they are the same defect on adjacent lines.

## Change

All three files now use the existing `runCleanups` from `src/core/Lifetime.js`: snapshot the
unique owned resources, clear ownership, attempt each, then throw one `AggregateError`.

| File | Lines | SHA-256 before | SHA-256 after |
| --- | --- | --- | --- |
| `src/world/EnvironmentKit.js` | +24 −15 | `5f9f413334c9fcfa4706f4de44dca165a9077fcfbba87fbaa1b3f913f67dd05d` | `7af30353f78569218925b2dddf9dddc4ff32f61e33b8301644b05a04e27cb09c` |
| `src/world/Fortress.js` | +17 −9 | `794ade4427894c413ef2960401900ceea4b592b238feb3df535c48437ac647c5` | `c7b0e66a3c5a64d21551cbde57621835b3526959df89ba5c36216604610ee5cd` |
| `src/world/AmbientTraffic.js` | +2 −2 | `720550fd6eb8c6c7c29a60af96d5bf304a12ac6ac563c6667fa633d3c138788c` | `b66f773157b36ae19e4dbcf957c73952688635c2002d3de6b24ad2f50a423c99` |
| `tests/world-retirement.test.js` | new, 9 tests | – | `72725fc05b6f8d5533f7080e092cc125b9fdd41d193c1331c60e5c02afdf95fc` |

Exact patch: `artifacts/launch/fable/world-retirement/world-retirement.patch`
(`f0b327b3c406e8a13f3b9bc84bc0b5df35f21deb4f6bba9397573a09019c74ec`).

Behaviour that changes for callers:

* A failed retirement now throws `AggregateError('Cleanup failed')` carrying the original
  error(s) instead of the first raw error. `Game.dispose` and prewarm already wrap these calls
  in `runCleanups`; nothing in `src/` inspects the error type.
* `prepareEnvironmentKit` throws a preparation error in preference to a cleanup error. When
  both happen the cleanup error is dropped, as the repository's constructors already do.
* When preparation succeeds but a loader resource fails to release, `prepareEnvironmentKit`
  still throws and `loadEnvironmentKit` still falls back to procedural architecture. That
  outcome is unchanged on purpose: keeping the kit there would change which architecture ships.

## Tests

* `tests/world-retirement.test.js` on committed source (`git archive HEAD` into a scratch
  tree): **0 / 9 pass** — `artifacts/launch/fable/world-retirement/before.txt`.
* Same file on the working tree: **9 / 9 pass** — `after.txt`.
* `npm test`: **286 / 286 pass** (277 + 9) — `after-full.txt`. The chunk-digest, golden-source
  and seeded-parity contracts in `tests/environment-kit.test.js` and
  `tests/ambient-traffic.test.js` pass unchanged.
* The environment tool harness, which loads `Fortress.js` through an import rewrite, still loads it.

## Examined, not changed

**Constructor attachment.** `AmbientTraffic`'s constructor ends with `scene.add(mesh)` and
`Fortress`'s constructor ends by creating it. Neither can fail without an injected
`childadded` listener; three's renderer registers none. With that fault injected
(`constructor-probe.json`) the scene keeps two empty objects, no chunk geometry exists yet,
and the shared geometry and program are still released by the shutdown hook. No GPU resource is
stranded, so no code was added.

## Limits

* CPU only. Faults are injected through `dispose` event handlers; no real WebGL context loss or
  driver failure was provoked, and no browser run was made for this tranche.
* The `scripts/qa` browser checks that call `_disposeChunk` and `clear` were not re-run here.
* A disposer that throws on every attempt is attempted once and then abandoned; nothing retries.
* `AmbientTraffic.detach` and the `Batch` scratch pool were not touched: no failing path was
  reproduced in them.
