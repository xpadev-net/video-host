#!/usr/bin/env sh

set -e

echo "Commit Hash: $COMMIT_HASH"
node app/frontend/.output/server/index.mjs
