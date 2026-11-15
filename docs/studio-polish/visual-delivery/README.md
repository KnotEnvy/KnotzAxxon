# NitroBliss studio visual delivery

Sol XHigh solo implementation on the shared Nitro repository. No helpers, commits, pushes, merges, deployments, new checkouts/worktrees, root fetch/reset/clean, credential changes, audio or asset creation.

Read `LEDGER.md`, `validation.json` and `owned-files.json`. The five retained comparisons and `comparisons.html` document the visible changes. `evidence/manifest.json` and capture reports record image hashes, camera matrices and capture state; `viewed.json` records inspection and limits.

## Apply after the technical patch

This is **not a HEAD diff**. Engine START is `f18ae181a8998a42ab84c080f5e9a5650a7a0455a7eed70b06792f78a044d8ce`, the prior technical worker's delivered Engine. Verify every `beforeSHA256` in `owned-files.json` before applying. The three new test paths must not already exist. From the integration repository:

```bash
git apply --check /absolute/path/to/changes.patch
git apply /absolute/path/to/changes.patch
npm test
npm run build:pages
```

`changed-paths.txt` lists the 13 patch paths. `replacement/` contains all 13 full replacement files as a fallback; compare hashes before using it. `start/` contains the ten exact START owner files for audit/regeneration. Game/main/Input/Lifetime/existing tests are not part of this patch. Primary's newer SuperBeast-only Input fix must remain intact. Capture/audit scripts travel beside the patch as supporting files, not additional source hunks.

The forward patch check uses the owner-only `start/` snapshot; the reverse check uses the final working source. No index or checkout creation is needed. SHA256SUMS covers every frozen payload file except itself. Transfer/archive receipts live outside the frozen payload.

## Regenerate without changing project dependencies

Use a writable copy of this pack. Set `STUDIO_REPO` to the integration repository when the pack is outside `asset-work/studio-visual`. Use Node 24 and the repository's Three 0.185.1 dependency. Vite 7.3.6 was reused from `/tmp/nitrobliss-studio-code-tools`. Playwright 1.64.0/Chromium headless shell 1248 were isolated in `/tmp/nitrobliss-studio-visual-qa`. No tools/caches are included in this pack.

```bash
npm install --prefix /tmp/nitrobliss-studio-visual-qa --no-audit --no-fund playwright@1.64.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/nitrobliss-studio-visual-qa/browsers node /tmp/nitrobliss-studio-visual-qa/node_modules/playwright/cli.js install chromium --only-shell
```

This minimal WSL host also needed Ubuntu Jammy browser libraries downloaded with `apt-get download` and extracted with `dpkg-deb -x` into `/tmp/nitrobliss-studio-visual-qa/lib`, not installed system-wide: libnspr4, libnss3, libatk1.0-0, libatk-bridge2.0-0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libgbm1, libxkbcommon0, libasound2, libatspi2.0-0, libxrender1, libxi6, libxshmfence1, libdrm2/common, libwayland-server0, libxcb-randr0 and fonts-liberation. Exact versions and hashes are in `toolchain.json`. Use standard native libraries if already installed. `fonts.conf` is supplied as the temporary Fontconfig example; adjust its extracted-font directory if needed.

Export these only in your QA shell:

```bash
export STUDIO_REPO=/absolute/path/to/KnotzAxxon
export KZ_PLAYWRIGHT_PATH=/tmp/nitrobliss-studio-visual-qa/node_modules/playwright
export PLAYWRIGHT_BROWSERS_PATH=/tmp/nitrobliss-studio-visual-qa/browsers
export LD_LIBRARY_PATH=/tmp/nitrobliss-studio-visual-qa/lib/usr/lib/x86_64-linux-gnu
export FONTCONFIG_FILE=/absolute/path/to/writable-pack/fonts.conf
```

From the repository, start the normal temporary Vite server on 5183 with the existing native Vite executable. In a second shell run `node /absolute/path/to/writable-pack/serve-baseline.mjs` (5184). Its load hook substitutes only saved owner source bytes. No second checkout is created. Then run:

```bash
STUDIO_PHASE=before node /absolute/path/to/writable-pack/capture.cjs
STUDIO_PHASE=after node /absolute/path/to/writable-pack/capture.cjs
node /absolute/path/to/writable-pack/make-evidence.cjs
node /absolute/path/to/writable-pack/ui-qa.cjs
```

The capture script clears inherited DISPLAY/WAYLAND_DISPLAY for its child browser and uses headless Ozone/SwiftShader. It saves raw captures only under `/tmp/nitrobliss-studio-visual-qa/captures-{before,after}`. Stop both temporary Vite servers afterwards. No server is needed to open `comparisons.html`.

CPU regression/fault replay, from the repository:

```bash
node --test tests/studio-*.test.js
node --import /absolute/path/to/writable-pack/start-loader.mjs --test tests/studio-render-ownership.test.js
```

The second command intentionally fails all eight rendering tests against START owners. It reads the snapshots through Node 24 load hooks without swapping working files. `reproduction-before.json`/`reproduction-after.json` retain the earlier technical worker's audit results; Game rows are other-worker results and not patch ownership.

To repeat existing native default/legacy model and production release QA:

```bash
node /absolute/path/to/writable-pack/run-existing-qa.cjs scripts/qa/imported-models.cjs --legacy
node /absolute/path/to/writable-pack/run-existing-qa.cjs scripts/qa/imported-models.cjs
node /absolute/path/to/writable-pack/run-existing-qa.cjs scripts/qa/release-smoke.cjs
```

The runner uses the original QA source with temporary dependency/Vite resolution, headless browser flags, a LOW model-QA boot and 120-second model screenshot timeout substituted in memory. It does not edit existing QA scripts. Their temporary servers close in finally blocks. Re-run the Pages build first for release QA. Software-GPU frame delivery is not physical FPS.
