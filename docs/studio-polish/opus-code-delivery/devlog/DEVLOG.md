# Devlog: audio lifecycle, before and after (state assertions, not listening)

These comparisons come from the same 13-case fixture, run against the unmodified input base and then against the patched files.
Full logs: `../evidence/repro-audio-before.log`, `../evidence/repro-audio-after.log`. Excerpts: `before-after-excerpts.txt`.

| # | Scenario (Chromium and WebKit policy) | Before | After |
|---|---|---|---|
| 1 | Phone: the first tap's `pointerdown` is not a gesture; then `pointerup`/`touchend`/`click` | context `suspended`, menu silent until START | `running` after the first tap |
| 2 | Escape pressed first, then Enter | `suspended` forever (listener was removed) | `running` on Enter |
| 3 | Unlocked, then OS `interrupted`/`suspended`; player presses P / taps resume | stays silent for the rest of the run | `running`; same context reused |
| 4 | Running audio, then the tab is hidden | keeps playing behind the auto-pause | `suspended` while hidden; back on show (WebKit: on the next tap) |
| 5 | Constructor throws / graph build throws | unhandled rejection on every START; stranded context never closed | one `console.warn` with the original error; context closed; audio inert; no retry storm |

The control case passed both before and after: visibility never resumes a context that the player never unlocked.
