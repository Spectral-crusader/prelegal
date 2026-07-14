#!/usr/bin/env bash
# Build and start the prelegal stack, then wait until it answers.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up -d --build

printf 'Waiting for http://localhost:8000 '
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/health >/dev/null 2>&1; then
    echo
    echo "Prelegal is running at http://localhost:8000"
    exit 0
  fi
  printf '.'
  sleep 1
done

echo
echo "Timed out waiting for the backend. Recent logs:" >&2
docker compose logs --tail 40 >&2
exit 1
