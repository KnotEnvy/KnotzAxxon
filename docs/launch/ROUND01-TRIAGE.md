# Round 01 disposition and remaining evidence

Round 01 remains unchanged at RC01 commit `c0ee2949…`, source `6d28e021…`.
All three original responses, their 21 scores, the failing gate output and all12
byte-identical cutoff inputs are preserved in `judging/round-01/`. Later corrections
are new evidence for a future round; they do not change those scores.

| Finding | Disposition / next evidence | Owner |
|---|---|---|
| Security/dependency scope | Focused client/storage/build/dependency review recorded in SECURITY-SCOPE.md. Real Vite developer-tooling advisories corrected with7.3.7/loopback default in22ef1c0; complete audit now reports zero advisories. This is scoped assurance, not security certification. | Primary / Sol code |
| DEV versus production episode provenance | Confirmed harness defect. RC01's100 completed DEV episodes earn no production credit. Corrected package path, full-file browser hashes, freeze-pinned manifests and strict auditor landed; completed production pilot remains uncredited. See PRODUCTION-PROVENANCE.md. | Primary |
| Old future-sector grade discrepancy | Confirmed historical clock defect already fixed and hardware-verified; NEGATIVE-FIRST-FRAME.md retains cause and before/after evidence. No duplicate fix or new UI diagnosis. | Primary / code |
| Sustained performance and resource trends | RC02 realtime two-run diagnostic is collecting actual rAF/CPU submission distributions, stalls, resource samples and trusted pause/menu resume. Keep observed stalls and instrumented-session limits. No callback-count FPS claim. | Primary |
| Bot1000 / observed player60 | Both final totals remain zero at this checkpoint. Production campaign follows correct provenance; Terra Medium actual-view timing is independently audited and remains unproven. | Primary / Terra Medium |
| Dark/small targets in motion | Static-image concern, not a demonstrated recognition defect. Obtain source-pinned ordinary/boss combat motion and actual-player observations before changing lighting/contrast. Accepted art remains accepted. | Fable |
| Short results TOTAL/callsign | Existing hardware proof shows heading/summary/action visibility and keyboard navigation. Original total/callsign may require scroll; summary repeats total. Check actual small-screen use before deciding a change; preserve working results fixes. | Opus |
| Small HUD text / input/accessibility | Physical phone/controller and assistive walkthrough remain missing. Emulated viewports and synthetic gamepads do not fill that gap. Document actual supported limits and fix demonstrated navigation/readability failures. No automatic new remap/palette/text-scaling feature expansion. | Opus |
| Font fallback | Export manifest explicitly records DejaVu Sans Mono in Linux's private fontconfig; game CSS uses a system monospace stack. Different font metrics are known, but a branding/legibility defect is not established by fallback alone. Review actual final exports and target-device clipping/legibility before changing type. | Opus |
| Audible mix/cues/interruption | Measurements and lifecycle tests remain technical evidence only. Nothing has been heard; representative listening/output and interruption/recovery observations remain required. | Spark |
| Distribution/account proof | Both RC02 local46-file packages passed fresh GTX1650Ti browser checks, with identical shipped inventory to RC01. No upload, account-image change or public URL verification occurred. Postupload checks remain pending until prepublication gates pass and publication is authorized. | Primary / Opus store |

The long-module finding is scoped explicitly: RC02 has Game.js1578lines,
Audio.js1658lines and Screens.js586lines. Length is a maintenance concern, not a
reproduced defect. Game orchestrates separately owned Engine/world/entity/UI systems;
Audio centralizes the graph, clock, buses, voice recipes and scheduler with shared
retirement; Screens owns navigation and settings/result templates. The50-path cleanup
audit and targeted fault regressions document ownership boundaries and known limits.
Sol remains code owner, Spark owns audio and Opus owns presentation. Do not split
modules across those leases or alter synthesis/gameplay merely to reduce line counts.
Any proposed extraction needs a concrete maintenance benefit and preserved behavior.

The publication order has a real boundary: local immutable package proof and the
required independent scores precede publication; live account/URL proof verifies the
approved upload afterwards. A judge who still requires prior publication for9 creates
a gate conflict to resolve explicitly with the user, not an exception to assume.
No score is reinterpreted as passing and no early publication is authorized here.

Primary also inspected an original RC02 production-pilot failure PNG at960x540.
Heading, summary and actions are visible, only slot1is graded, and the callsign is
partly behind the sticky action area. The450ms capture intersects staggered result
row animation, so blank lower rows at that moment do not prove persistent absence.
Facts/hash/limits are in ui/RC02-STATIC-RESULTS-TRIAGE.json; it is static triage with
zero player credit, not a physical-device or realtime-use verdict.
