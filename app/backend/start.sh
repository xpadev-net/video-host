#!/usr/bin/env sh
set -eu

echo "Commit Hash: ${COMMIT_HASH:-unknown}"
echo "Applying database migrations"
./node_modules/.bin/prisma migrate deploy
exec node dist/index.js
