#!/usr/bin/env bash
# Run an actual-game software WebGL capture against the localhost URL in spec.json.
# The caller owns its temporary dev server and coordinates any shared GPU/browser lock.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${KZ_BROWSER_WRAPPER:-}" ]]; then
  exec "$KZ_BROWSER_WRAPPER" node "$HERE/env-capture.cjs" "$1"
fi
exec node "$HERE/env-capture.cjs" "$1"
