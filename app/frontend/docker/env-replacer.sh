#!/usr/bin/env sh

set -e

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
node "$script_dir/replace-runtime-env.mjs"

# Execute the application main command.
exec "$@"
