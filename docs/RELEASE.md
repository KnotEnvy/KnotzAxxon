# GitHub Pages release

Playtest URL: https://knotenvy.github.io/KnotzAxxon/

The release workflow is [.github/workflows/pages.yml](../.github/workflows/pages.yml). It installs the lockfile on Node 24, runs the regression suite, builds with the project path, and starts the production build in Chromium. Only a successful main-branch validation can deploy the dist artifact to the github-pages environment. Pull requests run the same validation without deploying. Pushes that only change docs, README or handoff do not redeploy; use workflow_dispatch to redeploy manually.

## Reproduce the release

Use Node 24 (also recorded in .nvmrc):

```powershell
npm ci
npx playwright install chromium
npm test
npm run build:pages
npm run test:release
./start-user-testing.ps1
```

The smoke script owns a temporary preview on an available local port and stops it afterward. On Windows, set KZ_BROWSER_CHANNEL=msedge to use installed Edge instead. Set KZ_TEST_URL to the Pages URL to test the deployed site; set KZ_COMPARE_DIST=1 to compare its three assets byte-for-byte with the local dist build. Generated evidence goes to artifacts/release-smoke/ and is ignored by Git; CI retains it as release-browser-evidence.

The portable build remains npm run build (relative asset paths). The Pages build uses /KnotzAxxon/; publish only dist, never the repository root. No server, backend, API keys or external assets are required. WebGL 2 is required. Browser storage holds local settings, records and grades; it is specific to the browser and origin.

## Deploy and rollback

Merge a reviewed change into main or manually run GitHub Pages release in Actions. Check both validate and deploy jobs, then test the public URL in a fresh browser. Pages is configured to build from GitHub Actions; the environment allows main.

For a regression, use a Git revert commit on main and let the same tests and deployment run. Preserve shared history. Record the deployed revision and reproduce the bug with its fortress code before changing game balance.

## Repository map

- src/ — current game; tests/ — behavioral regressions.
- scripts/qa/ — reproducible browser, scene, campaign and audio QA.
- docs/reviews/ — historical reviews, including their original evidence limits.
- docs/testing/2026-09-12/ — retained screenshots and reports from that pass.
- artifacts/ — ignored generated captures; retain only useful summaries in docs/testing/.
- legacy/ — preserved prototype reference, excluded from the built game.
- handoff.json — authoritative current status and next-team tasks.

Deployment follows [GitHub's custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite's static deployment guide](https://vite.dev/guide/static-deploy.html#github-pages). Automated startup checks do not establish human gameplay, audio or physical-device acceptance.
