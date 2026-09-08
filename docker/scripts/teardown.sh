#!/usr/bin/env bash
# Tear down the Phase 11 Docker runtime (keeps named volumes unless --volumes).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/docker/wordpress"
if [[ "${1:-}" == "--volumes" ]]; then
  docker compose down -v
else
  docker compose down
fi
