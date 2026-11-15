# Contact-sheet hardware smoke 01

Run `pilot-live-sheet-smoke-01`, November 15, 2026 UTC. Development pilot only; final remains **0/60**. No production or harness code changed in this tranche.

Source before/after: `f35524e9b88d693884763838c8691da2b2c28d22e2a4a7bba6f6f440b5b22790`; HEAD `15f57edeb299427a7617341cd9cfe35ea3fe9b6f`. Full source and runtime tooling hashes are in config.json and receipt.json beside the evidence. Source stable; exit0.

Command:
```
node scripts/qa/live-sol-low/final-live.cjs --launch --pilot --pilot-seed-base 170201 --pilot-max-seconds 30 --run-id pilot-live-sheet-smoke-01
```

Only loop30 seed170201 ran, seeded-loop-start fixture at z0, keyboard bot/Chase/High, 960x540 viewport DPR1. Initial canvas912x513; subsequent recorded canvas960x540. Normal initial hull3/shield1/fuel1; original damage and actual-rAF Engine loop, every frame rendered. Primary realtime bot operated; Sol LOW inspected static contact sheets, no manual keys. No physical keyboard/device feel or heard audio claim.

NitroBliss Windows Chrome157.0.8103.52, Playwright local child-process pipe. Actual unmasked renderer: ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Ti (0x00001F95) Direct3D11 vs_5_0 ps_5_0, D3D11). Vite development graph; production bundle untested. Hardware proof in hardware.json and trial row.

Genuine normal-resource death:743 actual frames/743 renders, raw12.6006s, game10.0442s, sectors0/1 only, hull0/shield0/fuel0.91266, score4260. No boss/rack/Loop2 coverage. No page errors. End command came after terminal; total controller wall46.886s includes post-death inspection. Max rAF349.9ms. Render submission CPU p50=2.6ms/p95=4.9ms/max342.4ms; largest at frame451 sector1, programs49→51. Opening frame56.1ms. These are CPU submission measurements, not GPU frame times; cause unisolated.

First burst captured three active frames at 20:25:31.928,33.730,35.946Z (start gaps2.010/1.993s). Sheet composition1.985s. I opened the sheet once, inspected all panels, then recorded conservative viewedAt20:25:52.424Z. Ages20.496/18.694/16.478s. Explicit panel facts are preserved in visual-notes.jsonl: centered ship/full resources; readable OUTER FORTRESS altitude instruction; later orange outlined obstacle and altitude073. Interpretation: sampled HUD/instruction text was legible at displayed size, but reaction windows, collision fairness and motion feel cannot be established.

`note-sheet` with `nextBurst:true` accepted notes and captured terminal sheet at20:25:59.665Z. I opened and inspected it, recorded viewedAt20:26:11.281Z (age11.616s): MISSION FAILED, sector242, total4260, targets3, threads1/grazes0, flight0:10; RE-ENGAGE/Main Menu visible. Intervening collision/death was not visually observed. Capture-start gap24.140s. No continuous-video claim. Extra end capture o005 was not viewed and has no viewed note.

**Viewed cadence remains unsolved.** Contact-sheet and nextBurst controls work, but tool-return, image inspection and note submission overhead still exceed10s. The existing blocker correctly rejected credit. Do not start final60 on this evidence. A next CPU improvement should separate immediate factual viewing acknowledgment from longer interpretation and return the next capture with that acknowledgment; reducing panel size/composition may help, but must be measured in another separately authorized bounded pilot. Do not automatically acknowledge viewing or remove gap rules.

Cleanup: graceful end/quit, coordinator exit0; shared reservation absent; no matching owned Vite40793, Windows windows-live Node or Playwright-profile Chrome remained in read-only process checks. No rerun, helpers, commit or PR. Original PNGs, sheets, commands, notes, source receipts and telemetry preserved under artifacts/launch/live-sol-low/pilot-live-sheet-smoke-01/.
