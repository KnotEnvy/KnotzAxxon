```json
{
  "judge": "terra",
  "model": "codex/gpt-6.1-terra",
  "candidate": {
    "commit": "c0ee2949de29adfa52e6dcdae6768c73ec15474a",
    "sourceHash": "6d28e0210d802d0932762ba85f61d4cf43f14a646099a5f99411b0ab240f1362"
  },
  "lenses": [
    {
      "id": 1,
      "score": 7.8,
      "reason": "The frozen candidate has substantial lifecycle, collision, settings and release-integrity coverage; the retained regression log reports 329 passes. All 12 round-manifest files and all 96 runtime, 116 harness and 55 editable-source file hashes matched the working tree. The candidate's stated commit, source hash and harness hash match the round manifest. The production input and lifetime abstractions and fault-oriented tests show deliberate maintenance work. This is not a comprehensive security audit or proof that the tests exercise every real browser failure.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/judging/round-01/input-manifest.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/candidates/rc01.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/artifacts/launch/rc01-validation/regressions-329.log",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/src/core/Lifetime.js",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/ui-ownership-faults.test.js"
      ],
      "confidence": "medium",
      "limits": [
        "Readonly review of selected source and retained receipts; tests were not rerun.",
        "Per-file hash comparisons verify the listed files, not an independent exhaustive security audit or recomputation of aggregate fingerprint algorithms."
      ],
      "findings": [
        {
          "id": "TERRA-01",
          "severity": "medium",
          "description": "Missing evidence: release security and maintainability assurance is narrower than the broad lens; passing regressions are not a dependency or threat-model audit.",
          "acceptance": "Code cleanup owner or primary integration records a scoped review of production dependencies, browser-exposed surfaces, storage and build inputs; resolve material findings or document risk with ownership.",
          "owner": "code cleanup owner"
        }
      ]
    },
    {
      "id": 2,
      "score": 6.5,
      "reason": "The actual production and nested portable receipts show successful hardware-backed rendering and package verification, and fault-injection tests cover significant cleanup paths. Historical investigation records large submission stalls; the corrected ownership probes improve the evidence but do not establish that all stalls are eliminated. Callback and draw totals are not sustained FPS measurements.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/RC01-PACKAGES.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/PERFORMANCE-INVESTIGATION.md",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/context-resume.test.js",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/world-retirement.test.js"
      ],
      "confidence": "medium",
      "limits": [
        "The cited stall observations include earlier checkpoints and do not independently prove the same defect remains in RC01.",
        "Hardware checks are headless and do not establish sustained performance or physical-device behavior."
      ],
      "findings": [
        {
          "id": "TERRA-02",
          "severity": "high",
          "description": "Missing evidence: no sustained, representative RC01 frame-time and resource-lifecycle validation demonstrates that observed historical stalls are acceptably controlled.",
          "acceptance": "Primary integration records candidate-bound frame-time distributions, worst stalls, GPU/device/configuration and resource trends over representative sustained play, including pause, resume and repeated runs; investigate and fix reproducible unacceptable stalls.",
          "owner": "primary integration"
        }
      ]
    },
    {
      "id": 3,
      "score": 5.0,
      "reason": "The production code and tests cover combat and collision, and a historical pilot supplies limited loop-zero context, but the required final campaign has zero audited bot episodes and zero credited player episodes at the cutoff. No qualifying active-view path at the required cadence was demonstrated. Fairness, pacing, boss quality and replay across the prescribed bands therefore remain largely unsubstantiated rather than proven defective.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/judging/round-01/proof-packet.md",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/live-sol-low/PARALLEL-PILOT-01.md",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/src/game/WorldCollision.js",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/combat-polish.test.js"
      ],
      "confidence": "high on the evidence gap; low on subjective gameplay quality",
      "limits": [
        "No gameplay was personally played or observed continuously in this review.",
        "Historical pilots and staged or automated captures are not final player credit.",
        "The running rc01-final-0000 batch and later evidence are excluded."
      ],
      "findings": [
        {
          "id": "TERRA-03",
          "severity": "blocker",
          "description": "Missing required evidence: audited final bot 0/1000 and credited Terra Medium player 0/60; the documented pilot did not achieve the required active-view cadence.",
          "acceptance": "Primary integration establishes and demonstrates an actually viewed, timely active-play observation path, then obtains and audits the candidate-bound 1000 bot and 60 player episodes across the specified bands, including boss, pacing, failure and replay observations. Triage reproducible issues without counting pilots as final credit.",
          "owner": "primary integration"
        }
      ]
    },
    {
      "id": 4,
      "score": 7.3,
      "reason": "The inspected production desktop and environment stills show a coherent industrial isometric world, deliberate blue-and-amber lighting, depth and recognizable route markings. This is an attractive static direction, not proof of legibility during combat or movement. In the inspected dark scenes, some small dark objects and background structures blend together; whether that harms actual target recognition is a subjective risk, not a verified gameplay defect.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/artifacts/launch/pages/6d28e0210d802d09/browser-qa/desktop.png",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/assets-source/launch-environment/evidence/frames/guns-classic-wide-f345--after.png",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/fable/AMBIENT-TRAFFIC.md"
      ],
      "confidence": "medium for inspected stills; low for motion readability",
      "limits": [
        "Stills and traffic comparison captures do not establish animation quality, combat visibility or sustained ambience.",
        "Existing accepted art is not reopened merely because of this observation."
      ],
      "findings": [
        {
          "id": "TERRA-04",
          "severity": "medium",
          "description": "Subjective risk and missing evidence: dark, small world objects may be difficult to distinguish in motion against the fortress.",
          "acceptance": "Fable reviews candidate-bound continuous combat footage and player observations across relevant sectors, cameras and quality settings; only if recognition problems are demonstrated, adjust underlying lighting or asset contrast and recheck.",
          "owner": "Fable"
        }
      ]
    },
    {
      "id": 5,
      "score": 6.5,
      "reason": "The production source supports keyboard, gamepad and touch abstractions, and retained tests cover settings, UI ownership and short layouts. The portrait capture shows a complete touch-control layout, but the small, widely spaced HUD labels are a readability concern in this static image, not a verified physical-phone failure. Physical controller, touch and assistive-technology operation have not been established.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/src/core/Input.js",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/artifacts/launch/pages/6d28e0210d802d09/browser-qa/touch-portrait.png",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/settings-persistence.test.js",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/ui/RESULTS-PRESENTATION.md"
      ],
      "confidence": "medium for static layout and implemented input paths; low for accessibility and physical ergonomics",
      "limits": [
        "Emulated touch is not physical-phone testing; staged results are not normal-play replay.",
        "No screen-reader, physical controller or hands-on touch session was reviewed."
      ],
      "findings": [
        {
          "id": "TERRA-05",
          "severity": "high",
          "description": "Missing evidence and subjective risk: physical-device input, assistive operation and small-screen readability are unverified.",
          "acceptance": "Opus coordinates real phone and controller sessions and an assistive-technology/keyboard walkthrough of onboarding, settings, play and results; record device, failures and readability feedback, then fix demonstrated presentation or navigation problems.",
          "owner": "Opus"
        }
      ]
    },
    {
      "id": 6,
      "score": 4.5,
      "reason": "Actual-browser lifecycle and rendered-mix measurements, plus fault-injection disposal tests, provide useful technical evidence. They cannot establish whether music, effects and warnings are audible, intelligible, balanced, emotionally appropriate or recover correctly on real devices: nothing was heard in the reported sessions.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/audio/DISPOSAL.md",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/audio/INTEGRATION.md",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/artifacts/launch/audio/render-browser-01.log",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/tests/audio-dispose.test.js"
      ],
      "confidence": "high on missing listening proof; low on perceived quality",
      "limits": [
        "No audio was auditioned in this review or the cited measured sessions.",
        "Headless visibility interruption and physical speaker, call interruption and controller-only unlock remain unproven."
      ],
      "findings": [
        {
          "id": "TERRA-06",
          "severity": "high",
          "description": "Missing evidence: measured audio is not an audible quality, cue-recognition or real-device recovery verdict.",
          "acceptance": "Spark obtains candidate-bound human listening on representative headphones and speakers, including music/SFX balance, warning distinctness, startup gesture, mute/settings and interruption/resume; document devices and outcomes and correct confirmed issues.",
          "owner": "Spark"
        }
      ]
    },
    {
      "id": 7,
      "score": 6.8,
      "reason": "The local Pages and portable builds have candidate-bound package and hardware receipts, including nested iframe checks; the marketing bundle reports validated exports and editable assets. These are meaningful distribution preparations, but no account upload or live release of this candidate is evidenced, and the gameplay, audio and device gaps prevent a readiness claim. Visual brand effectiveness is not established by asset counts alone.",
      "evidence": [
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/RC01-PACKAGES.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/marketing-bundle.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/artifacts/launch/distribution/6d28e0210d802d09/manifest.json",
        "/home/knotzuni/.t3/worktrees/KnotzAxxon/release-final-public-la-b5c44ab788c3a985/docs/launch/JUDGING-PROTOCOL.md"
      ],
      "confidence": "high on local-package versus upload distinction; medium on presentation quality",
      "limits": [
        "A local nested iframe is not an Itch account upload or public deployment.",
        "Marketing export validation is not an independent audience or conversion test.",
        "This review does not authorize publication."
      ],
      "findings": [
        {
          "id": "TERRA-07",
          "severity": "high",
          "description": "Missing evidence: the candidate's account upload and actual published distribution behavior are unverified, and prerequisite release gates remain open.",
          "acceptance": "Primary integration retains the verified package identity, closes the applicable release gates, and when publication is authorized records an account upload and live nested-path smoke check with matching artifact identity; Opus reviews the final store presentation.",
          "owner": "primary integration"
        }
      ]
    }
  ]
}
```