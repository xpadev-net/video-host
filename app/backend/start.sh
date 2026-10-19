#!/usr/bin/env sh

echo "Commit Hash: $COMMIT_HASH"
exec node dist/index.js
