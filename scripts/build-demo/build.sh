#!/usr/bin/env bash
# Regenerates the static demo (public/demo/app/, public/fr/demo/app/) from a clone of
# synaptane/synaptane. See scripts/build-demo/README.md.
#
#   [SYNAPTANE_APP=../synaptane-public] scripts/build-demo/build.sh [--admin-url URL] [--db-name NAME]
#
# Needs uv, git and a PostgreSQL with pgvector (the application's compose.dev.yaml).
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
site=$(cd "$here/../.." && pwd)
app=$(cd "${SYNAPTANE_APP:-$site/../synaptane-public}" && pwd)
unset VIRTUAL_ENV
# The application's own environment (its dependencies, its version), plus the two libraries
# of the generator.
exec uv run --quiet --project "$app" --with 'httpx>=0.28' --with 'beautifulsoup4>=4.13' \
  python "$here/build_demo.py" --app "$app" "$@"
