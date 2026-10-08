# UI/UX Architecture - focused critic round 1

Date: 2026-09-11. Reviewer: independent Harsh Game Critic / Senior Three.js Engine Auditor.

**Score: 7.4 / 10. The focused implementation gate is not met.**

This assessment covers UI/UX Architecture only. The readable instrument-panel design, three accepted camera views, inert hidden screens, schema-generated settings, controller menu navigation, attract mode and immediate retry are good foundations. Several functional interface contracts still fail before subjective visual refinement matters. Authenticity, Performance and Feel remain at their previously recorded provisional scores.

## Evidence and limits

Reviewed Screens, HUD, Input, main, Settings, Game transitions, index.html, style.css and the latest Feel critic report. This is an independent source assessment; no rendered browser UI, physical touch device or assistive technology was observed. Browser CUA remains unavailable because its kernel fails in the host environment. Geometry, computed layout, contrast under the moving scene, and real touch scrolling must receive live acceptance later. The already passing simulation suite does not prove these browser behaviors.

## Required corrections, in priority order

1. **Make native focus and menu selection describe the same action.** Screens tracks `.sel` but never focuses its selected control and never synchronizes on focusin. Tab can focus FLIGHT MANUAL while selIndex remains ENGAGE; Enter is prevented and executes the selected action instead of the visibly focused button. The same mismatch affects settings step buttons. Screen transitions also leave focus behind in an inert screen. Establish one selection/focus contract, active-screen scoping, deliberate focus on show/back, and contained Tab traversal. Preserve native range and text editing rather than interpreting their keys as menu navigation. Guard empty menus and ignore repeated confirmation keys. Route keyboard pause through the same menu ownership rules as controller pause so P does not resume gameplay from a nested SYSTEMS screen.

2. **Give touch users a complete, readable gameplay and menu path.** Touch controls are turned on once by pointer media query and stay rendered through title, pause and results. They are below the menus (z-index 16 versus 20), so above-menu interception is not established. They do, however, share the lower corners with fuel/hull and weapon/boost instruments during play. There is no touch pause control. Reserve space for controls, make them live only during gameplay, provide pause, and respect device safe-area insets. The body's `touch-action: none` disables vertical panning inherited by overflowing menus; apply gesture blocking to gameplay controls/canvas instead, and allow panel scrolling. Verify narrow portrait and short landscape layouts; the manual's 280px minimum column and settings' wide two-column controls currently have no narrow-width adaptation.

3. **Repair the sector-progress instrument.** CSS gives `.progress-track i` width 0%, but HUD only sets `transform: scaleX(progress)`. Multiplying a zero-width element leaves it invisible at every progress value. Give it a full-width base and left transform origin, then keep the existing transform-driven updates. Check 0%, midpoint and completion.

4. **Finish record entry and persistence behavior.** A new record exposes a callsign input, but `_items()` excludes it, so a controller-only player can retry but cannot enter initials. Add a discoverable controller edit/accept path or equivalent accessible initials selector. Persisted scores are only checked for an array shape; malformed entries can fail rendering or sorting. Storage writes silently fail, while submit still announces a new record and subsequent callsign edits read an empty list. Normalize stored records and keep a session fallback when storage is unavailable, with accurate session-only feedback rather than implied durable saving.

5. **Label the controls and expose live-state semantics.** Generated range inputs have no associated label; choice arrows say only previous/next and do not identify their setting. Connect each input/step control to its setting name and readable current value. HUD remains `aria-hidden=true` even while live. Hidden touch buttons can remain in the tab order unless explicitly disabled/inert. Expose essential status without announcing every frame and make each screen's accessible name and active state coherent. Visible focus should cover setting buttons as well as menu buttons and inputs.

## Verification needed for round 2

- Exercise actual menu handlers with Tab/focusin/Enter and setting input keys; show that the focused action executes exactly once and hidden screens never receive activation.
- Exercise title, pause, nested settings, resume, results, callsign editing and retry with both keyboard and controller menu routing.
- Cover storage unavailable/corrupt cases, valid record ranking, initial sanitization and session feedback.
- Assert the progress bar's real base geometry contract and live/hidden overlay state, then run the full existing suite and build.
- Record mobile/browser checks as pending unless a rendered browser session is actually observed. Static responsive rules can resolve implementation blockers but cannot certify clipping or finger reach on hardware.

No new sectors, camera framing changes or broader gameplay redesign are requested in this category. Address the interface ownership and access gaps first; re-review the final changes independently before awarding the provisional 8.5 gate.
