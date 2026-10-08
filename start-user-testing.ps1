$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw 'Install dependencies with npm ci first.' }
if (-not (Test-Path -LiteralPath 'dist/index.html')) { throw 'Build the game with npm run build:pages first.' }
$releaseHtml = Get-Content -LiteralPath 'dist/index.html' -Raw
$previewBase = if ($releaseHtml -match '"/KnotzAxxon/assets/') { '/KnotzAxxon/' } else { '/' }
Write-Host "Open http://127.0.0.1:4173$previewBase for exploratory user testing. Press Ctrl+C to stop."
& node node_modules/vite/bin/vite.js preview --base $previewBase --host 127.0.0.1 --port 4173 --strictPort
exit $LASTEXITCODE
