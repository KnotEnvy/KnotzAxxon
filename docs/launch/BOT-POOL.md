# Browser-worker throughput experiment

The two-minute target for 1,000 complete bot episodes remains **unmet**. Four
independent browser workers were slower on this machine. The default remains one
worker, and no full campaign was launched with the changed recipe.

| Scheduling | Completed pilot episodes | Simulation frames | Actual draws | Whole coordinator | Frames/second |
|---|---:|---:|---:|---:|---:|
| One browser worker | 12 | 114,130 | 24 | 37.573 s | 3,037.6 |
| Four browser workers | 12 | 120,328 | 24 | 65.890 s | 1,826.2 |

Four workers achieved **0.6012 times** the serial frame throughput in these runs.
Both runs used seeds 810101–810112, two per loop band 0/1/2/3/7/30, Low quality,
Classic camera, synthetic analog intent, 960×540/DPR1. Normal native randomness and
the original wall-time streaming budgets remained active, so the outcomes and frame
counts differ: serial had 3 victories/9 deaths, pooled had 4 victories/8 deaths.
This is a scheduling experiment, not an exact replay-parity claim. Both reached all
eight sectors and every boss phase. Nothing was visually inspected or heard in
this experiment; terminal PNGs are retained captures, not viewed player evidence.

The serial sample implies about 10.2 million frames for the weighted 1,000-row
matrix. Completing that workload in 120 seconds would need about **84,956 simulation
frames/second**, roughly **28 times** its measured whole-coordinator throughput.
The small-sample projections are about 55.9 minutes serial and 98.1 minutes pooled.
They include startup, production verification, checkpoint capture, continuation and
closing overhead at the pilot scale. They are not full-campaign measurements or
performance guarantees. Two seeds per band, one quality/camera/input and variable
outcomes do not establish a robust duration prediction. No isolated CPU/GPU cause
is assigned to the pooled slowdown.

## Execution and ownership

`run-bot.cjs --workers N` accepts 1–4 workers; default 1. Comparison and realtime
probes require one worker. Every worker owns a separate Chrome process, browser
context, game instance, PRNG, storage and page. A synchronous parent allocator
claims each plan index once, and each worker runs one episode at a time. The one
coordinator retains the shared GPU lease for the entire pool. A worker failure
closes admission immediately; the pool awaits every browser owner's cleanup before
rejecting. Independent callbacks append evidence through the same parent Node
process. Each worker records its production-package proof, actual renderer and
closing receipt. Rows carry their worker and plan index. Existing damage, physics,
input, collisions, resource consumption, camera and late hooks remain unchanged.

The three new CPU regressions cover concurrent independent owners, unique ordered
claims, immediate admission closure after failure, awaited cleanup and bounds.
The full suite passes **345/345**; scheduling/provenance tests pass **14/14**.
No production source, assets or package files changed. Runtime source remains
`8ecde1d465d12f89680fdb530dea3a695b2ab56cf7e12c8cd1d8fb2ec7987f28`.

Both pilots ran through Windows Chrome 157.0.8103.52 on NitroBliss, Intel
Core i5-10300H, GTX1650Ti/NVIDIA ANGLE/D3D11. All workers verified all 46 production
files, detached the QA debugger before play and completed without page/network
errors. Both closed with exit 0 and stable source, harness and package. Both used
harness `c364a04a207b16c2b2b09f4425d5e8ac5dc6e156a813d104b841c3a529e26edc`;
the reporting script was added afterwards and does not alter the captured runs.

Exact commands (each requires the free cooperative GPU lease):

```sh
node scripts/qa/launch/run-bot.cjs --production artifacts/launch/pages/8ecde1d465d12f89 --count 12 --loops 0,1,2,3,7,30 --seed 810101 --workers 1 --run-id pilot-speed-pool-serial-10
node scripts/qa/launch/run-bot.cjs --production artifacts/launch/pages/8ecde1d465d12f89 --count 12 --loops 0,1,2,3,7,30 --seed 810101 --workers 4 --run-id pilot-speed-pool-four-11
node scripts/qa/launch/pool-report.cjs docs/launch/BOT-POOL.json pilot-speed-pool-serial-10 pilot-speed-pool-four-11
```

Raw records and exact evidence hashes remain in
`artifacts/launch/bot/pilot-speed-pool-{serial-10,four-11}/`. The audited report is
[BOT-POOL.json](BOT-POOL.json). Regression output is
`artifacts/launch/rc02-validation/pool-regressions.log`.

## Release disposition

These 24 development episodes earn **zero** final campaign or player credit. RC02
retains its previous **100/1000** audited production episodes; observed Terra Medium
credit is **0/30**. The revised harness has no frozen final campaign and no new
candidate was created. The late RC01 DEV completion notification does not change
any counts. Round01 scores are preserved.

The unchanged full-engine browser path has no measured route to a two-minute
campaign on this machine. Separating visual work from gameplay simulation is a
possible architectural direction; it has not been implemented or proven equivalent.
Any such path must retain real movement, damage, fuel, collisions, weapons, camera
visibility and RNG effects, and must state which rendering/lifecycle coverage is
kept in separate hardware tests. It cannot be counted as completed full-game
coverage merely because it is fast. No more full-length batch was launched on the
strength of an unsupported runtime estimate.
