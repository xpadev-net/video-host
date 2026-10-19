#!/usr/bin/env sh
set -eu

echo "Commit Hash: ${COMMIT_HASH:-unknown}"
exec node ./start.mjs
