# Portable HTML5 distribution

The previously verified Pages runtime and the current live Itch upload are separate
deliveries. Nothing in this release work has uploaded or replaced an Itch build.
Keep the previous live upload available until the new, judged package is ready.

Build a separately fingerprinted relative-base package:

```sh
node scripts/qa/launch/package-itch.mjs
```

Outputs live under `artifacts/launch/distribution/<source-hash-prefix>/`:
`html5/`, `knotzaxxon-html5.zip` and `manifest.json`. The ZIP has `index.html` at
its root, all production assets, deterministic entry timestamps and full hashes.
The tool refuses to overwrite an earlier package, checks source stability during
the build and reads the ZIP back. It does not alter `dist/` or upload anything.
For a frozen candidate use `--candidate <full-source-fingerprint>`.

When the Nitro GPU slot is free, verify the actual packaged bytes:

```sh
node scripts/qa/launch/verify-itch.cjs artifacts/launch/distribution/<source-hash-prefix>
```

The verifier owns a localhost-only HTTP server and Windows Chrome launched through
local Playwright pipes. It serves the upload beneath an arbitrary nested path,
fetches and hashes **every** packaged file, and exercises the production UI inside
a sandboxed iframe as well as directly. Desktop/portrait/landscape/short-screen,
reduced-motion, touch start, keyboard start, help/settings, iframe fullscreen,
WebGL2 renderer, actual draw calls, required default models and absence of the
development debug API are checked. It never credits these smoke fixtures as bot
or live-agent gameplay episodes. Failed network requests and page errors fail QA.

This local fixture establishes portable path/layout behavior, not the live Itch
upload, physical mobile hardware or actual Itch account configuration. Final live
verification must inspect the listing, the actual served build and complete assets
after account publication. A successful Pages deployment is not an Itch update.

## Current receipts

The first development packaging pilot used source
`3cae253d41356ad907ec501e0f1d1f2293e1f5e678aa33bdee16a160d0614f34`.
Its ZIP is5,487,065bytes across43files, SHA256
`8f0274399a34c21e00ae600a200b39af13e98ae39c6e9e6dd4b26df79c454781`.
This changing-release checkpoint is **not** the final distribution candidate.
The browser verifier passed on NitroWindowsChrome157 / GTX1650Ti D3D11: all43files
were fetched/hash-matched at the nested upload path; all28default models loaded;
iframe fullscreen, desktop/portrait/landscape/short-screen and reduced-motion UI
checks passed without page/network errors. Actual engine callbacks and draw calls
are recorded in `browser-qa/report.json` beside the package. These are package-smoke
fixtures, not gameplay episodes or physical mobile-device proof. Official listing/
image specifications and current upload inspection belong in Opus's
`marketing-listing.json` receipt.

Publication remains blocked on required final gameplay evidence and all21 independent
judge scores>=9 on the same candidate. Prepare the complete reviewable result before
requesting any account-only secret/action. Never place credentials in chat or Git.


Actual public browser inspection now supplements Opus's raw HTTP audit:
`artifacts/launch/public-inspection/2026-11-15T19-40-49-304Z/` retains DOM, screenshots,
HTML and status/error report for Itch, Pages and the official creator specs.
Itch still publicly links out to Pages and has no iframe or public upload controls.
No account dashboard was accessed. All four pages returned200 without page errors;
Pages rendered through the actual GTX1650Ti adapter. This is baseline inspection,
not evidence of final publication or account upload preservation.


After native marketing integration, a second **development** package is at
`artifacts/launch/distribution/e1623af9d9da402d/`:46files,7,355,877B, ZIP SHA256
`65ed78c05863ebfb673f0de27beb74fda3bc667ac1f3bb0164bde2f1844bbea2`.
All paths and ZIP readback passed. Runtime fingerprint
`e1623af9d9da402d89b80adfb0cef43a9a4e1b6c98c9df7f01eb0c7764c7236a` includes new
brand/OG metadata. It still needs the hardware nested-path/WebGL-disabled smoke.
This archive has not been uploaded and is not a final judged delivery.
