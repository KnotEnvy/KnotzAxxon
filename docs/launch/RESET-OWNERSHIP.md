# Previous-sortie retirement on reset

Primary implementation on 2026-11-15, after cleanup tranche 1 (`1cdcc68`). `Game.reset` now gives up the previous enemies, pickups and boss before retirement, and uses the existing `runCleanups` to attempt the fortress clear, next-level preparation, each previous entity and each independent pool/HUD reset in the existing success-path order. A failed reset still throws the cleanup errors after those attempts; it does not claim the partially reset game can continue. Prewarm retention is untouched.

The three actual-source tests fault fortress clear, the first enemy disposal or projectile clear after performing the real cleanup. They verify both actual enemy groups and the pickup/boss detach, the ownership collections are empty, every remaining retirement runs, and the original fault is retained in AggregateError. All three fail on original source and pass after. The fixture explicitly creates two real enemy kinds (`turret`, `drone`); an earlier draft used an unsupported `fighter` kind and was corrected before recording the final baseline.

The focused run with the existing frame-clock, feel and studio-feel suites passed **57/57**. It is CPU behavior/fault testing, with no hardware or gameplay-episode credit. Failure-before and pass-after logs are retained under `artifacts/launch/integration/reset-ownership/`.
