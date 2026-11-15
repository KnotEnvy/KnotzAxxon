I finished the read-only review of RC01. Identity checks pass, but the evidence cannot support a score near 9 in any lens, and I found one provenance problem that affects the bot evidence.

**Verified this round (read-only, no processes launched, no files written):**
- The frozen inputs match: all 267 file hashes in `docs/launch/candidates/rc01.json` match the working tree, and the manifest and package-receipt hashes match.
- Candidate `c0ee2949…` is an ancestor of HEAD `e9040d4`, and no `src`, `public`, `tests`, or `scripts/qa` file changed between them.
- `regressions-329.log` shows 329 pass and 0 fail.
- The portable Itch ZIP hash matches the receipt.
- A candidate-bound 32 s audio audition (source `6d28…`) has peak −5.32 dBFS and zero clipped samples. Nothing was heard.
- The live-observation contract is documented as unsolved, with a 41.7 s note age in the parallel pilot.
- Excluded: I did not read `artifacts/launch/bot/rc01-final-0000`. I listed its file names and line counts during a directory sweep, but used none of its contents.

**Key finding, verified in source:** the bot harness (`scripts/qa/launch/run-bot.cjs`) starts a Vite dev server, and `window.KZ` exists only under `import.meta.env.DEV` (`src/main.js:201`). `credit.cjs` only checks `kind === 'final-candidate'`. Nothing in the audit path checks for a production build, so bot records are not evidence about the shipped production or Itch bundle.

```json
{
  "judge": "haiku",
  "model": "claudeAgent/claude-haiku-5-5",
  "candidate": {
    "commit": "c0ee2949de29adfa52e6dcdae6768c73ec15474a",
    "sourceHash": "6d28e0210d802d0932762ba85f61d4cf43f14a646099a5f99411b0ab240f1362"
  },
  "lenses": [
    {
      "id": 1,
      "score": 6,
      "reason": "Strong, reproducible identity and test discipline: all 267 frozen file hashes match, the candidate is an ancestor of HEAD with no runtime changes since, and 329/329 regressions pass. window.KZ is correctly gated behind import.meta.env.DEV. innerHTML sinks in Screens.js/HUD.js were reviewed; the one user-influenced value (callsign) is sanitized to A-Z0-9 and no injection path was demonstrated. Deductions: the bot QA path runs against a Vite dev server and nothing rejects that for credit, so the bot evidence is not provenance-bound to the production bundle; large files (Audio.js 1658 lines, Game.js 1578) and ad hoc innerHTML templates without a shared escape helper raise maintenance cost.",
      "evidence": [
        "docs/launch/candidates/rc01.json",
        "docs/launch/judging/round-01/input-manifest.json",
        "artifacts/launch/rc01-validation/regressions-329.log",
        "scripts/qa/launch/run-bot.cjs",
        "scripts/qa/launch/credit.cjs",
        "src/main.js",
        "src/ui/Screens.js",
        "src/ui/HUD.js",
        "artifacts/launch/bot/pilot-controls-02/config.json"
      ],
      "confidence": "high",
      "limits": [
        "Did not run tests; relied on the recorded 329-pass log with matching hashes.",
        "Security review is limited to static grep and sink inspection; no dynamic testing.",
        "Did not read rc01-final-0000 (excluded from this round)."
      ],
      "findings": [
        {
          "id": "L1-F1",
          "severity": "high",
          "description": "Bot campaign provenance: run-bot.cjs spawns node_modules/vite/bin/vite.js (dev server) and waits for window.KZ, which main.js sets only when import.meta.env.DEV. credit.cjs checks only kind==='final-candidate' and campaign-report.cjs has no build-mode or served-bundle check. Pre-cutoff bot config.json files all record a local 127.0.0.1 Vite URL. Credited bot episodes therefore would not be from the frozen production bundle that Pages and Itch ship.",
          "acceptance": "Final bot and live records must come from a served production build whose served file hashes match the frozen candidate (e.g. vite build plus a hash-verified static server, with a QA hook that does not depend on DEV). credit.cjs and campaign-report.cjs must reject any record whose served build is not that production bundle. Demonstrate on a non-credited pilot that the audit rejects a dev-server record and accepts a production-served one.",
          "owner": "primary (scripts/qa/launch); code cleanup owner for any production-safe QA hook in src/main.js"
        },
        {
          "id": "L1-F2",
          "severity": "medium",
          "description": "Maintainability: Audio.js (1658 lines) and Game.js (1578 lines) are very large single-owner modules; dynamic HTML is built with template strings through innerHTML in Screens.js (lines ~443, 514, 519) and HUD.js (~188-193) with no shared escape helper. Safe today by construction, not by a common guard.",
          "acceptance": "Split or document module boundaries for the two large files without changing behavior (regressions must stay 329/329 and hashes must be re-frozen). Route dynamic values in innerHTML through one escape helper or textContent, with a test that a crafted callsign or label cannot inject markup.",
          "owner": "code cleanup owner (Sol XHigh thread); primary if no owner is active"
        }
      ]
    },
    {
      "id": 2,
      "score": 5,
      "reason": "Lifecycle handling is careful and verifiable in source: blur and visibility suspend input (Input.js), Engine.js handles webglcontextlost/restored with a manual resume, dispose() chains cover engine, input, postfx, renderer, and game owners, and audio resumes on gesture with a retry. Hardware pass is recorded on a GTX 1650 Ti via NitroBliss Chrome 157 in production and nested-iframe runs with zero page/network errors. Deductions: render-submission stalls remain unexplained (pilot max submission 431.6 ms and 290.1 ms, a 3.1 s observation stall with no confirmed cause), no sustained FPS was measured, and physical phone behavior is untested.",
      "evidence": [
        "src/core/Engine.js",
        "src/core/Input.js",
        "src/audio/Audio.js",
        "src/main.js",
        "docs/launch/PERFORMANCE-INVESTIGATION.md",
        "docs/launch/HARDWARE-QA.md",
        "docs/launch/live-sol-low/PARALLEL-PILOT-01.md",
        "docs/launch/live-sol-low/OBSERVATION-PATH-ASSESSMENT.md",
        "docs/launch/RC01-PACKAGES.json"
      ],
      "confidence": "medium",
      "limits": [
        "Render counts are not FPS; no sustained frame-rate measurement exists for this candidate.",
        "Headless hardware browser only; no physical phone or tablet.",
        "Stall causes are reported as unisolated in the cited docs; I did not reproduce them."
      ],
      "findings": [
        {
          "id": "L2-F1",
          "severity": "high",
          "description": "Observed-viewing cadence is unsolved on the evidence. PARALLEL-PILOT-01 shows the view-note age at 41.7 s; the assessment concludes the single-frame tool path acknowledges in about 13-14 s against a 10 s requirement. The required 60 live observations are at 0/60.",
          "acceptance": "A non-credited pilot where audit-live.cjs shows actual-view acknowledgment spacing at or under 10 s across a full episode, using an image-returning tool path, followed by the final 60 live observations passing the same audit. No final live run until the pilot passes.",
          "owner": "primary (live tooling and audit); not a Fable, Opus, or Spark item"
        },
        {
          "id": "L2-F2",
          "severity": "medium",
          "description": "Unexplained render-submission stalls: pilot-stall-high-to-medium-01 max submission 431.6 ms, pilot-stall-medium-boot-01 290.1 ms, and a 3.1 s stall localized to observation o001. The cited fix reuses retained program IDs, but the docs state it does not prove stalls are eliminated.",
          "acceptance": "A per-frame submit-timing trace on the frozen candidate under the same hardware path, showing p95 and max submission times within a stated budget across a full episode, with any residual stall attributed to a cause. Otherwise state the residual stall as a known limit in the judging packet.",
          "owner": "code cleanup owner for the reliability investigation; Fable for any material or geometry changes it requires"
        }
      ]
    },
    {
      "id": 3,
      "score": 4,
      "reason": "The design and implementation have substance: the difficulty law in src/world/Level.js matches the stated formula (threat multiplied by 1+0.3*loop, clamped at 2.2; difficultyAt multiplied by 1+0.35*loop), and the sector, boss, and fortress structure is implemented. The evidence for fairness and pacing is nearly absent: 0 credited bot episodes of 1000, 0 credited player episodes of 60, and one genuine loop-0 victory in a development pilot (not credited). Pilots show early deaths (e.g. the 511-frame sector-0 death). Subjective feel and replay have no human evidence.",
      "evidence": [
        "src/world/Level.js",
        "src/game/Game.js",
        "docs/launch/judging/round-01/input-manifest.json",
        "docs/launch/live-sol-low/CONTROLS-PILOT-20261115.md",
        "docs/launch/live-sol-low/PARALLEL-PILOT-01.md",
        "docs/launch/live-sol-low/TERRA-TAKEOVER.md",
        "docs/launch/FINISH-LINE.md"
      ],
      "confidence": "low",
      "limits": [
        "No credited episode of any kind exists at this cutoff, so gameplay balance cannot be judged from outcome data.",
        "Feel is subjective and no human play was recorded.",
        "The bot runs on the dev build (see L1-F1), so even future bot outcomes are not yet production-bound."
      ],
      "findings": [
        {
          "id": "L3-F1",
          "severity": "high",
          "description": "No credited gameplay at the cutoff: bot 0/1000 and Terra Medium player 0/60, with no human-play record. Pilot outcomes cannot be attributed as fairness or pacing results.",
          "acceptance": "Complete the final bot allocation (180 each at loops 0, 1, 2, 3, 7; 100 at loop 30) on a production-bound build with campaign-report.cjs passing, and complete 10 live observed episodes per band (60 total) under the audited observation contract. Report per-band outcome distributions and failed-seed repros.",
          "owner": "primary (bot campaign and report); Terra Medium (live player runs)"
        },
        {
          "id": "L3-F2",
          "severity": "medium",
          "description": "Grade bookkeeping discrepancy on record: the fast single pilot shows grade slots 1 and 7 displayed as C while trials.jsonl records grades only for sectors 0-1 and no boss or rack progression. The cause is unisolated; the observation assessment says it is not demonstrated to be a renderer misalignment.",
          "acceptance": "A regression test that grade display and grade bookkeeping agree on a seeded loop-30 fixture, or a documented explanation that the display is correct and the record is stale. Confirm the closing state on the candidate before final runs.",
          "owner": "code cleanup owner for Game.js grade bookkeeping; Opus only if the fault is in result presentation"
        }
      ]
    },
    {
      "id": 4,
      "score": 7,
      "reason": "The staged captures I viewed show a coherent, distinctive look: a lit Iron Sentinel boss on a fortress deck with readable lane and hazard lines and a clear HUD in 01-iron-sentinel, and a gun-battery highway with a purple skyline, distinct sector identity, and legible fuel canisters in 04-gun-batteries. Ambient traffic evidence exists. The user has accepted the gunner and art set. Deductions: evidence is stills at 1920x1080 only; there is no continuous motion, small-phone readability check, or live-play frame, and the marketing frames are explicitly staged.",
      "evidence": [
        "assets-source/launch-marketing/screenshots/01-iron-sentinel-1920x1080.png",
        "assets-source/launch-marketing/screenshots/04-gun-batteries-1920x1080.png",
        "assets-source/launch-marketing/ITCH-LISTING.md",
        "docs/launch/fable/AMBIENT-TRAFFIC.md",
        "docs/launch/judging/round-01/proof-packet.md"
      ],
      "confidence": "medium",
      "limits": [
        "Two of five screenshots reviewed plus proof-packet summaries; I did not review the other captures.",
        "Staged teleport captures, not gameplay; the listing says so.",
        "No continuous motion evidence or phone-sized readability check for the world."
      ],
      "findings": [
        {
          "id": "L4-F1",
          "severity": "low",
          "description": "Readability at phone size and during motion has not been evaluated with a gameplay frame: the HUD in the 1920x1080 stills is legible, but its smallest labels are 8-11 px in CSS and the phone layout is not sampled in art evidence.",
          "acceptance": "One 390x844 and one 844x390 live gameplay still with HUD and a 5 s continuous clip, checked for shape and label readability, with notes on any legibility fault.",
          "owner": "Fable for world and lighting readability; Opus for HUD label size"
        }
      ]
    },
    {
      "id": 5,
      "score": 6,
      "reason": "The UI work is careful in the code: aria roles and live regions on HUD and grades, aria-hidden and inert handling for screens and touch controls, focus-visible outlines, reduced-motion overrides across many blocks, 44 px touch targets on touch devices, device-matched control legends on title, and gamepad menu walking. Known defects remain: on short viewports the results TOTAL row and callsign field sit under the sticky action bar until scrolled or walked to, which the packet records as a limit. There is no text-size option, no colorblind palette, and no key remapping (KEYMAP is fixed in Input.js). Physical controller, touch, and assistive-technology use are untested.",
      "evidence": [
        "src/style.css",
        "src/ui/Screens.js",
        "src/ui/HUD.js",
        "src/core/Input.js",
        "index.html",
        "docs/launch/ui/RESULTS-PRESENTATION.md",
        "assets-source/launch-marketing/results-evidence/RECEIPT.json",
        "docs/launch/judging/round-01/proof-packet.md"
      ],
      "confidence": "medium",
      "limits": [
        "Touch and gamepad were emulated in Chrome; no physical phone or controller.",
        "No assistive-technology session (screen reader or switch) was run.",
        "Results-screen fix verified in staged runs only, not in a normal-play replay."
      ],
      "findings": [
        {
          "id": "L5-F1",
          "severity": "medium",
          "description": "Results screen on short viewports (667x375 touch, 390x844): the TOTAL row and callsign field sit under the sticky action bar until the user scrolls or walks focus to them. The packet records this as a limit, not as fixed.",
          "acceptance": "Captures at 667x375 and 390x844 showing the TOTAL row and callsign field fully visible without scrolling, or a documented placement change, with the staged results regression still passing.",
          "owner": "Opus High (Screens.js and style.css presentation)"
        },
        {
          "id": "L5-F2",
          "severity": "medium",
          "description": "Accessibility gaps: no text-size setting; no colorblind-safe palette option; no key remapping (fixed KEYMAP in Input.js line 11); several HUD labels at 8-11 px (style.css line 301 uses 8 px for grade index digits).",
          "acceptance": "Either ship at least a text-size option and a legible-minimum rule (for example 12 px for HUD labels on touch), plus a documented decision on remapping and colorblind palettes, or state these as explicit known limits in the packet and listing.",
          "owner": "Opus High for text size and palette (UI); code cleanup owner for key remapping in Input.js"
        },
        {
          "id": "L5-F3",
          "severity": "low",
          "description": "No physical controller, touch-device, or assistive-technology session exists; all coverage is emulated or staged.",
          "acceptance": "One physical phone and one physical gamepad session with observed notes, and a screen-reader pass of the title and settings flow, recorded with their limits. Account and device constraints are outside the repository.",
          "owner": "primary, with the account or device owner"
        }
      ]
    },
    {
      "id": 6,
      "score": 4,
      "reason": "Audio code is substantial and carefully scoped: trusted-gesture unlock with retry, context suspend and resume on visibility, a separate missile-lock cue, and disposal tests. The candidate-bound 32 s OfflineAudioContext audition has peak -5.32 dBFS, zero clipped or non-finite samples, and no page errors. This is measurement, not perception. No person or agent has listened, and the headless tab never exercised a real hidden-tab or phone-call interruption, so recovery is untested in practice.",
      "evidence": [
        "artifacts/launch/audio/audio-render-2026-11-15T22-06-27-345Z/audition.json",
        "artifacts/launch/audio/audio-render-2026-11-15T22-06-27-345Z/source-receipt.json",
        "docs/launch/audio/INTEGRATION.md",
        "src/audio/Audio.js",
        "src/main.js",
        "docs/launch/RC01-PACKAGES.json"
      ],
      "confidence": "medium",
      "limits": [
        "No listening of any kind; no speaker or headphone audition.",
        "The audition is a scripted cue program rendered offline, not a live gameplay mix capture.",
        "Hidden-tab and phone-call recovery untested; the lifecycle runs stayed visible and Escape was not blocked.",
        "The audition render was on source d90d5ec; the candidate c0ee294 has the same sourceHash, so runtime files are identical."
      ],
      "findings": [
        {
          "id": "L6-F1",
          "severity": "high",
          "description": "The mix has never been heard. Peak, RMS, and clipping measurements do not establish cue audibility, balance, fatigue, or priority under dense combat.",
          "acceptance": "A human listening audition of audition.wav on headphones and a laptop speaker, with notes on each labelled cue (missile lock, damage confirm, boss roar, warning priority), plus one live hardware session recording the audio state across a tab switch and resume.",
          "owner": "Spark (any cue or mix changes); primary to arrange the listening and live session"
        },
        {
          "id": "L6-F2",
          "severity": "low",
          "description": "Recovery after interruption is untested in practice: the lifecycle receipts stayed visible and Escape was not blocked, so the hidden-tab policy path and the phone-call path are not exercised.",
          "acceptance": "A hardware run that actually hides the tab or interrupts the audio context, showing ctx.state transitions and a successful resume on a trusted gesture, with the receipt retained.",
          "owner": "primary (QA run); Spark if the recovery path needs a code change"
        }
      ]
    },
    {
      "id": 7,
      "score": 5,
      "reason": "The title and listing copy are clear and consistent with the code (eight sectors, one boss, three camera rigs, device-matched legend). Marketing exports have sha256 manifests and an explicit staged-capture disclosure in ITCH-LISTING.md, which is honest. The portable ZIP hash matches its receipt and passes local nested verification. Readiness is weak: the live Itch listing still links to Pages with zero screenshots, nothing is uploaded or applied, the compositor renders typography with DejaVu rather than the in-game font, and the new portable package has not been published. The gate requires publication to be authorized, and it is not.",
      "evidence": [
        "assets-source/launch-marketing/ITCH-LISTING.md",
        "assets-source/launch-marketing/export-manifest.json",
        "index.html",
        "artifacts/launch/distribution/6d28e0210d802d09/knotzaxxon-html5.zip",
        "artifacts/launch/distribution/6d28e0210d802d09/manifest.json",
        "docs/launch/DISTRIBUTION.md",
        "docs/launch/RC01-PACKAGES.json"
      ],
      "confidence": "medium",
      "limits": [
        "No live listing change, upload, or deployment exists; the listing is unapplied and no account action was observed.",
        "Did not open the live Itch page this round.",
        "Market or community reception is not evidence in this round."
      ],
      "findings": [
        {
          "id": "L7-F1",
          "severity": "high",
          "description": "Distribution readiness: the live Itch listing links to Pages with no screenshots and no HTML5 upload; the ITCH-LISTING.md changes are unapplied; the verified portable ZIP has not been uploaded to the account.",
          "acceptance": "The account owner applies the listing, screenshots, and ZIP (keeping the previous build as rollback) and a post-upload inspection confirms the listing and the iframe render with no errors. Until then, no launch-readiness claim is made.",
          "owner": "account owner (user), with primary coordinating the upload and inspection"
        },
        {
          "id": "L7-F2",
          "severity": "low",
          "description": "Export typography fallback: the cover, banner, and OG exports were composed in headless Linux with DejaVu Sans Mono, not the Cascadia or SF Mono used in game, so exported title type differs from the shipped one.",
          "acceptance": "Re-export the title and cover typography with an in-game-matched font stack on the target platform, or document the substitution on the export page and in the listing.",
          "owner": "Opus High (compositor and presentation)"
        }
      ]
    }
  ]
}
```