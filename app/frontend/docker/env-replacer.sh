#!/usr/bin/env sh

set -e

# Replace placeholder values embedded by Vite in public assets and Nitro's
# server bundle so runtime-rendered HTML uses the same public configuration.
printenv | grep '^VITE_' | while IFS= read -r ENV_LINE ; do
  # Separate the key and value parts from the found lines.
  ENV_KEY=${ENV_LINE%%=*}
  ENV_VALUE=${ENV_LINE#*=}
  ESCAPED_ENV_VALUE=$(printf '%s' "$ENV_VALUE" | sed 's/[&|\\]/\\&/g')

  find app/frontend/.output/public app/frontend/.output/server -type f \
    \( -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' -o -name '*.json' \) \
    -exec sed -i.bak "s|_${ENV_KEY}_|${ESCAPED_ENV_VALUE}|g" {} \;
  find app/frontend/.output/public app/frontend/.output/server -type f -name '*.bak' -delete
done

# Execute the application main command.
exec "$@"
