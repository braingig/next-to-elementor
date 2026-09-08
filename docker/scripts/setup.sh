#!/usr/bin/env bash
# Bring up WordPress + Elementor Free 4.2.4 and verify the exact plugin version.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE_DIR="$ROOT/docker/wordpress"
ELEMENTOR_PATH="${ELEMENTOR_FREE_4_2_4_PATH:-/Users/nusratnova/Downloads/elementor}"
export ELEMENTOR_FREE_4_2_4_PATH="$ELEMENTOR_PATH"
export N2E_WP_PORT="${N2E_WP_PORT:-9080}"

if [[ ! -f "$ELEMENTOR_PATH/elementor.php" ]]; then
  echo "ERROR: Elementor Free 4.2.4 not found at $ELEMENTOR_PATH" >&2
  exit 1
fi

VERSION_LINE="$(grep -E "define\(\s*'ELEMENTOR_VERSION'" "$ELEMENTOR_PATH/elementor.php" || true)"
if [[ "$VERSION_LINE" != *"4.2.4"* ]]; then
  echo "ERROR: Refusing to mount Elementor that is not 4.2.4. Found: $VERSION_LINE" >&2
  echo "Do not use in-repo ./elementor (4.2.1)." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not reachable." >&2
  exit 1
fi

mkdir -p "$ROOT/tests/runtime/generated"

cd "$COMPOSE_DIR"
docker compose up -d db wordpress

echo "Waiting for WordPress..."
for i in $(seq 1 60); do
  if docker compose exec -T wordpress bash -lc 'curl -fsS http://127.0.0.1/ >/dev/null'; then
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "ERROR: WordPress failed to become ready." >&2
    exit 1
  fi
done

run_wp() {
  docker compose run --rm wpcli wp "$@"
}

# Install WP if needed
if ! run_wp core is-installed >/dev/null 2>&1; then
  run_wp core install \
    --url="http://127.0.0.1:${N2E_WP_PORT}" \
    --title="N2E Elementor Runtime" \
    --admin_user="admin" \
    --admin_password="password" \
    --admin_email="admin@example.com" \
    --skip-email
fi

run_wp rewrite structure '/%postname%/' --hard >/dev/null
run_wp option update blogdescription "Phase 11 runtime harness" >/dev/null

# Activate Elementor Free only — never Pro
run_wp plugin activate elementor

ACTIVE_VERSION="$(run_wp plugin get elementor --field=version | tr -d '\r')"
if [[ "$ACTIVE_VERSION" != "4.2.4" ]]; then
  echo "ERROR: Elementor version must be exactly 4.2.4. Got: '${ACTIVE_VERSION}'" >&2
  exit 1
fi

# Fail if Pro is present/active
if run_wp plugin is-active elementor-pro >/dev/null 2>&1; then
  echo "ERROR: Elementor Pro must not be active in this harness." >&2
  exit 1
fi

# Disable noisy onboarding redirects where possible
run_wp option update elementor_onboarded 1 >/dev/null || true
run_wp option update elementor_tracker_notice 1 >/dev/null || true

# PHP / WP versions for the report
PHP_VERSION="$(docker compose exec -T wordpress php -r 'echo PHP_VERSION;')"
WP_VERSION="$(run_wp core version | tr -d '\r')"

cat > "$ROOT/tests/runtime/generated/environment.json" <<EOF
{
  "wordpress": "${WP_VERSION}",
  "php": "${PHP_VERSION}",
  "elementor": "${ACTIVE_VERSION}",
  "docker": true,
  "baseUrl": "http://127.0.0.1:${N2E_WP_PORT}",
  "elementorSourcePath": "${ELEMENTOR_PATH}",
  "proActive": false
}
EOF

echo "Runtime ready:"
echo "  WordPress ${WP_VERSION}"
echo "  PHP ${PHP_VERSION}"
echo "  Elementor Free ${ACTIVE_VERSION}"
echo "  URL http://127.0.0.1:${N2E_WP_PORT}"
