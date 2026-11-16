# Terra medium player takeover

On2026-11-15 the user replaced Sol Low with Terra medium as the player. The fresh Terra task completed CPU-only; no pilot/browser/server/GPU process started and no new image was viewed. The GPU slot was returned unused. Historical Sol Low notes and original model attribution are preserved; new records identify Terra medium. Final live credit remains **0/60**.

Primary verified all four delivered harness hashes and independently reran visual-note, pipeline and plan/guard tooling: all3 Node test files pass. The same separate capture→view_image tool path has not demonstrated the required10s active viewing cadence; changing models alone does not establish compliance.

Terra identified that the in-harness observation-gap blocker considers unviewed captures. Primary added independent `scripts/qa/launch/audit-live.cjs`, which matches notes to original image hashes and verifies capture spacing between actually viewed frames, actual-view acknowledgment spacing and capture-to-view ages. Four synthetic integrity regressions pass, including rejection when frequent unviewed captures hide a viewing gap. It grants **no automatic credit**, even for internally consistent records; original images/facts, source/harness and per-band uniqueness remain primary audit obligations.

Running this independent audit on the latest historical pipeline pilot retains its exclusions and identifies stale actual-view ages; the extra unviewed terminal capture does not make that pilot compliant. Audit output is retained beside the original evidence as `primary-viewed-audit.json`, without modifying the original trial or notes.
