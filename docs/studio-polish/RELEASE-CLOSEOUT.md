# Facelift release closeout

PR #5 merged the validated facade/environment and studio-polish release at `1b3ff18bbabdedf30295846f3594c831ef5c30a5`. The PR validation passed before merge. Local validation passed 241 regressions, Pages build, default and legacy imported-model motion/ownership QA, context/audio recovery, short-screen keyboard navigation and reduced motion, and production desktop/touch smoke (28 runtime resources, 35 model/template hashes).

All 175 environment templates are tracked through browser shutdown and released exactly once. A malformed-kit regression reproduces the original loader cleanup leak and now passes. The existing historical prop comparisons remain byte-strict with the new architecture isolated; it is restored and verified before the integration captures and shutdown checks.

Full delivery/source snapshots were read back and hashed before cleanup. The retained source manifests verify 924 earlier production paths, 114 new environment paths, and the curated studio/environment records. All ten editable composition scenes and deterministic generators remain. Redundant scratch copies are archived outside the checkout, and the merged remote release branch has been deleted. The bound worktree is retained for the user.

Public deployment verification and its exact workflow/result are recorded in docs/release-validation.json after Pages completes. Software WebGL proves appearance/interaction, not physical GPU frame time; no new human play session on the authored environment is claimed. Optional barrier-wall/arch decoration and deliberate procedural debris rings are recorded scope choices, not an open release blocker. Formal Opus polish of the earlier approved assets remains deferred.

## Public result

Pages workflow `43740120349` succeeded and the public game passed desktop/portrait/landscape smoke. All 28 runtime resources loaded; all 35 served model/template hashes match dist. Three public PNGs were inspected. The live runtime revision is `1b3ff18bbabdedf30295846f3594c831ef5c30a5`; final documentation updates do not alter the runtime.
