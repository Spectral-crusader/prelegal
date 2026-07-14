#!/usr/bin/env bash
# Stop the prelegal stack. The database lives in the container, so stopping
# discards it and the next start comes up with an empty schema.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down
echo "Prelegal stopped."
