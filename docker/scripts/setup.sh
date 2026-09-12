#!/usr/bin/env bash
# Bring up WordPress + Elementor Free 4.2.4 + Hello Elementor (runtime harness only).
# Does not change the converter. Hello Elementor is for visual verification so
# Elementor Full Width (elementor_header_footer) has classic header.php/footer.php.
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

# Runtime-only classic theme for Elementor Full Width / Canvas verification.
HELLO_DIR="$(bash "$ROOT/docker/scripts/ensure-hello-elementor.sh")"
export HELLO_ELEMENTOR_PATH="$HELLO_DIR"
if [[ ! -f "$HELLO_DIR/header.php" || ! -f "$HELLO_DIR/footer.php" ]]; then
  echo "ERROR: Hello Elementor at $HELLO_DIR is missing classic header.php/footer.php." >&2
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

# Activate Hello Elementor (classic) — required for Elementor Full Width visuals.
# Do not leave Twenty Twenty-Five active (block theme breaks header-footer.php).
if ! run_wp theme is-installed hello-elementor >/dev/null 2>&1; then
  echo "ERROR: hello-elementor theme is not visible inside the container." >&2
  echo "Expected bind-mount at wp-content/themes/hello-elementor from HELLO_ELEMENTOR_PATH." >&2
  exit 1
fi
run_wp theme activate hello-elementor
ACTIVE_THEME="$(run_wp theme list --status=active --field=name | tr -d '\r' | head -1)"
if [[ "$ACTIVE_THEME" != "hello-elementor" ]]; then
  echo "ERROR: Active theme must be hello-elementor for runtime visuals. Got: '${ACTIVE_THEME}'" >&2
  exit 1
fi
HELLO_VERSION="$(run_wp theme get hello-elementor --field=version | tr -d '\r')"

# Disable noisy onboarding redirects where possible
run_wp option update elementor_onboarded 1 >/dev/null || true
run_wp option update elementor_tracker_notice 1 >/dev/null || true

# Application Passwords work over HTTP only when WP treats the site as local.
# Must be a quoted string constant (never --raw).
run_wp config set WP_ENVIRONMENT_TYPE local --type=constant >/dev/null 2>&1 || true

# Provision Application Password for Phase 14c media uploads from the host
# (same WP instance as visual harness). Password is written only under
# tests/runtime/generated/ (gitignored) — never committed.
MEDIA_APP_NAME="n2e-runtime-media"
BASE_URL="http://127.0.0.1:${N2E_WP_PORT}"

# Drop prior passwords with the same name so create always returns a fresh secret.
EXISTING_UUIDS="$(
  run_wp user application-password list admin --fields=uuid,name --format=csv 2>/dev/null \
    | tr -d '\r' \
    | awk -F, -v name="$MEDIA_APP_NAME" 'NR>1 && $2==name { print $1 }' \
  || true
)"
for uuid in $EXISTING_UUIDS; do
  run_wp user application-password delete admin "$uuid" --yes >/dev/null 2>&1 || true
done

APP_PASSWORD="$(
  run_wp user application-password create admin "$MEDIA_APP_NAME" --porcelain 2>/dev/null | tr -d '\r' | tail -1
)"
if [[ -z "$APP_PASSWORD" ]]; then
  echo "ERROR: Failed to create WordPress Application Password for media uploads." >&2
  echo "Ensure Application Passwords are available (WP_ENVIRONMENT_TYPE=local on HTTP)." >&2
  exit 1
fi

# Escape JSON string values for the password (may contain spaces).
json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().rstrip("\n")))' <<<"$1"
}

cat > "$ROOT/tests/runtime/generated/wp-media.json" <<EOF
{
  "baseUrl": $(json_escape "$BASE_URL"),
  "username": "admin",
  "applicationPassword": $(json_escape "$APP_PASSWORD"),
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# PHP / WP versions for the report
PHP_VERSION="$(docker compose exec -T wordpress php -r 'echo PHP_VERSION;')"
WP_VERSION="$(run_wp core version | tr -d '\r')"

cat > "$ROOT/tests/runtime/generated/environment.json" <<EOF
{
  "wordpress": "${WP_VERSION}",
  "php": "${PHP_VERSION}",
  "elementor": "${ACTIVE_VERSION}",
  "theme": "hello-elementor",
  "themeVersion": "${HELLO_VERSION}",
  "docker": true,
  "baseUrl": "http://127.0.0.1:${N2E_WP_PORT}",
  "elementorSourcePath": "${ELEMENTOR_PATH}",
  "helloElementorPath": "${HELLO_DIR}",
  "proActive": false,
  "mediaConfigured": true,
  "mediaConfigPath": "tests/runtime/generated/wp-media.json"
}
EOF

echo "Runtime ready:"
echo "  WordPress ${WP_VERSION}"
echo "  PHP ${PHP_VERSION}"
echo "  Elementor Free ${ACTIVE_VERSION}"
echo "  Theme Hello Elementor ${HELLO_VERSION} (runtime harness only)"
echo "  Media uploads: configured for ${BASE_URL} (wp-media.json)"
echo "  URL http://127.0.0.1:${N2E_WP_PORT}"
