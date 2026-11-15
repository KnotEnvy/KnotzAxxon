# Pages and portable HTML5 release

Published game: https://knotenvy.github.io/KnotzAxxon/

The final public-launch candidate is tracked in [launch/FINISH-LINE.md](launch/FINISH-LINE.md) and [launch/PROOF-PACKET.md](launch/PROOF-PACKET.md). That work has separate freeze, gameplay-evidence and independent-judge gates. A successful local build or Pages deployment does not mean the itch.io listing or upload changed.

The release workflow is [.github/workflows/pages.yml](../.github/workflows/pages.yml). It installs the lockfile on Node 24, runs the regression suite, builds with the project path, and starts the production build in Chromium. Only a successful main-branch validation can deploy the dist artifact to the github-pages environment. Pull requests run the same validation without deploying. Pushes that only change docs, README or handoff do not redeploy; use workflow_dispatch to redeploy manually.

## Reproduce the release

Use Node 24 (also recorded in .nvmrc):

```powershell
npm ci
npx playwright install chromium
npm test
npm run build:pages
npm run test:models
npm run test:models:legacy
npm run test:release
./start-user-testing.ps1
```

The smoke script owns a temporary preview on an available local port and stops it afterward. On Windows, set KZ_BROWSER_CHANNEL=msedge to use installed Edge instead. Set KZ_TEST_URL to the Pages URL to test the deployed site; set KZ_COMPARE_DIST=1 to compare its three assets byte-for-byte with the local dist build. Generated evidence goes to artifacts/release-smoke/ and is ignored by Git; CI retains it as release-browser-evidence.

The portable build remains npm run build (relative asset paths). The Pages build uses /KnotzAxxon/; publish only dist, never the repository root. No server, backend, API keys or external assets are required. WebGL 2 is required. Browser storage holds local settings, records and grades; it is specific to the browser and origin.

## Link preview art" section of docs/RELEASE.md

docs/RELEASE.md is outside the Opus marketing lease, and Hydrogen may be cleaning docs, so this is not applied.
Primary or Hydrogen can paste it in place of the current section, which still describes the legacy generator.

---

## Link preview art

Launch link art is composed from real engine frames by `scripts/brand/launch/compose.cjs`. Editable sources, capture
receipts and the export manifest live in `assets-source/launch-marketing/` (`README.md`, `compositions.json`,
`export-manifest.json`, `ITCH-LISTING.md`). The outputs are:

- `public/brand/og-1200x630.png`: Open Graph and Twitter cards, referenced by `index.html`.
- `public/brand/social-preview-1280x640.png`: the GitHub repository social preview (under 1 MB). Upload it by hand under
  repository Settings → Social preview; the GitHub API does not accept it.
- `public/brand/itch-cover-630x500.png`, and `assets-source/launch-marketing/exports/itch-banner-1200x260.png` for itch.io.

Regenerate under the cooperative GPU reservation after a visual change:

```bash
node scripts/brand/launch/with-gpu-lease.cjs "compose" \
  /home/knotzuni/code/KnotzAxxon/asset-work/studio-browser-tools/bin/kz-pw node scripts/brand/launch/compose.cjs
```

The legacy `public/og-image.png` and `public/social-preview.png` stay deployed for already-cached links.
`scripts/brand/render-link-art.cjs` is the legacy generator for those cards and for `apple-touch-icon.png` and
`icon-512.png`, which are unchanged. Re-running it overwrites the legacy cards.


## Deploy and rollback

Merge a reviewed change into main or manually run GitHub Pages release in Actions. Check both validate and deploy jobs, then test the public URL in a fresh browser. Pages is configured to build from GitHub Actions; the environment allows main.

For a regression, use a Git revert commit on main and let the same tests and deployment run. Preserve shared history. Record the deployed revision and reproduce the bug with its fortress code before changing game balance.

## Repository map

- src/ — current game; tests/ — behavioral regressions.
- scripts/qa/ — reproducible browser, scene, campaign and audio QA.
- docs/release-validation.json — concise current validation and deployment evidence.
- artifacts/ — ignored generated captures; fold useful results into release-validation.json.
- legacy/ — preserved prototype reference, excluded from the built game.
- handoff.json — authoritative current status and next-team tasks.

Retain launch run JSONL, failed seeds, original screenshots/clips, measured audio and
hash receipts. Broad generated QA output stays ignored under artifacts/ or the indexed
external archives; selected editable sources and curated evidence live in assets-source/.
Before any eventual scratch cleanup, verify the retained originals and hash manifest.
The user requires these launch records; do not delete them merely because a run was
reviewed. Historical text reviews and JSON evidence remain in docs/reviews/ and
docs/testing/. Their old image references describe their historical builds.

Deployment follows [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's static deployment guide](https://vite.dev/guide/static-deploy.html#github-pages). Automated startup checks do not establish human gameplay, audio or physical-device acceptance.

The production asset release loads the accepted models and authored environment kit
by default. `?productionModels=0` and `?environmentKit=0` remain QA fallbacks. Release
smoke derives expected default resources and served model/template files from its
explicit checked inventory. The November15 facelift/current-preparation checkpoints
verified28 default resources and35 served model/template hashes; a future candidate's
own report is authoritative if its inventory changes. Local validation or live
`KZ_COMPARE_DIST=1` compares served bytes with the identified build. Hardware evidence
is recorded separately from CI's software-browser checks.

## Portable itch.io package

Use `node scripts/qa/launch/package-itch.mjs` to build a relative-base HTML5 ZIP outside
`dist/`, then `node scripts/qa/launch/verify-itch.cjs <package-directory>` for the owned
Nitro hardware check. See [launch/DISTRIBUTION.md](launch/DISTRIBUTION.md) for nested
upload paths, iframe/fullscreen/WebGL2/responsive checks and exact archive hashes.
The separate Pages package uses `package-pages.mjs` and `verify-pages.cjs`; its
`/KnotzAxxon/` base must not be substituted for a portable itch upload.

The existing itch page and previous upload remain untouched until the release gate
passes and account publication actually occurs. Ready-to-apply listing copy, tags,
cover/banner/screenshot mapping and manual account steps are in
[ITCH-LISTING.md](../assets-source/launch-marketing/ITCH-LISTING.md). Publish the tested
HTML5 archive while retaining the previous build. Record the actual upload and then
verify the public iframe/resources; Pages deployment alone is not that verification.
