# Portable HTML5 distribution

Pages and Itch are separate deliveries. The user has authorized publication of the
completed implementation despite unfinished playtest/judging acceptance. Preserve the
previous Itch upload for rollback; an implementation release does not imply that the
remaining acceptance gates passed.

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

The previous publication hold was superseded by the user's explicit authorization
to publish the completed implementation. Publish the reviewed build, preserve the
prior Itch upload, and record actual deployment/upload identities and live checks.
This does not change the required 1,000 bot / 30 observed-player / 21-score acceptance
gates, which remain open. Never place credentials in chat or Git.


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
brand/OG metadata. Hardware verification passed2026-11-15 at20:12UTC: all46files
were fetched/hash-matched, all28default model resources loaded, nested iframe
fullscreen and four responsive/reduced-motion fixtures passed with actual draws.
A separate WebGL-disabled browser correctly showed the explicit WebGL2 requirement.
The report has no page errors or failed network requests and identifies
GTX1650Ti/D3D11 Chrome157.0.8103.52. These are local production-package diagnostics;
settings were Low/Classic/DPR1 and host NitroBliss (the next verifier also records
those fields directly in each receipt). Exact report: browser-qa/report.json beside
this archive.
This archive has not been uploaded and is not a final judged delivery.


## Current implementation publication — 2026-11-16

Approved source: `release/final-public-launch`, implementation checkpoint
`5d73464c3716ab02816ac34585d236961895cf88`. The frozen RC02 gameplay candidate
remains `22ef1c0067c0aa7ec9461991d0abf9c2a674586e`; later tooling and release-record
changes do not amend its immutable package or campaign records.

Publication authorization followed explicit disclosure of these remaining facts:
100/1,000 audited RC02 bot episodes; 0/30 observed Terra Medium episodes; Round 01
all 21 scores below 9; actual listening and physical-device proof still open. Keep
these counts visible wherever publication is described. Fill the final PR/head,
merge SHA, Pages workflow/live hash receipt and Itch ZIP/hash/live iframe receipt
only after each step succeeds. Retain the previous Itch upload for rollback.

## Current implementation package — 2026-11-16

The verified source fingerprint is
`95251c20acca3f0fc8dc251b9ed45c60c7bc920db6b7d523ae0eaa1652be9cec`.
The portable ZIP contains 46 files (7,354,917 bytes), SHA-256
`14ce809412e858f1146af3570ab55db4b525db9c5ddadff6364abe1357f5d008`.
Nitro Windows Chrome 157 / GTX 1650 Ti D3D11 verified all packaged file hashes,
iframe fullscreen, responsive desktop and emulated touch, and the clean-storage
normal-URL defaults. Fresh launches use Modern 20; valid saved camera choices remain
intact. Title START was confirmed to enter Sector 01 / Loop 0 at normal timeScale 1
from the exact production package. The Pages package passed its hardware and model
hash checks, and a separate clean-storage production smoke verified Modern 20 there.

Both checks are local package receipts. The Pages URL and Itch account upload still
require their respective live deployment checks. Emulated touch is not physical
device evidence; no gameplay, judge, or audio acceptance count changes. See
`docs/release-validation.json` for package IDs, settings, open gates and delivery
state.
