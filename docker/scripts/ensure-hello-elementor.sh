#!/usr/bin/env bash
# Ensure Hello Elementor is available for the runtime harness (not the converter).
# Prefer HELLO_ELEMENTOR_PATH; else docker/themes/hello-elementor; else download once.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_DIR="$ROOT/docker/themes/hello-elementor"
# Pinned WordPress.org theme release (classic header.php/footer.php for Elementor Full Width).
HELLO_ZIP_URL="${HELLO_ELEMENTOR_ZIP_URL:-https://downloads.wordpress.org/theme/hello-elementor.3.4.4.zip}"
HELLO_VERSION_EXPECTED="${HELLO_ELEMENTOR_VERSION:-3.4.4}"

resolve_hello_dir() {
  if [[ -n "${HELLO_ELEMENTOR_PATH:-}" ]]; then
    echo "$HELLO_ELEMENTOR_PATH"
    return
  fi
  echo "$DEFAULT_DIR"
}

HELLO_DIR="$(resolve_hello_dir)"

theme_ok() {
  local dir="$1"
  [[ -f "$dir/style.css" && -f "$dir/header.php" && -f "$dir/footer.php" ]]
}

if theme_ok "$HELLO_DIR"; then
  echo "$HELLO_DIR"
  exit 0
fi

if [[ -n "${HELLO_ELEMENTOR_PATH:-}" ]]; then
  echo "ERROR: HELLO_ELEMENTOR_PATH=$HELLO_ELEMENTOR_PATH is missing header.php/footer.php/style.css" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEFAULT_DIR")"
TMP_ZIP="$(mktemp -t hello-elementor.XXXXXX.zip)"
TMP_EXTRACT="$(mktemp -d -t hello-elementor.XXXXXX)"

cleanup() {
  rm -f "$TMP_ZIP"
  rm -rf "$TMP_EXTRACT"
}
trap cleanup EXIT

echo "Downloading Hello Elementor ${HELLO_VERSION_EXPECTED} for runtime harness..."
if ! curl -fsSL "$HELLO_ZIP_URL" -o "$TMP_ZIP"; then
  echo "ERROR: Could not download Hello Elementor from $HELLO_ZIP_URL" >&2
  echo "Set HELLO_ELEMENTOR_PATH to a local classic Hello Elementor theme directory." >&2
  exit 1
fi

unzip -q "$TMP_ZIP" -d "$TMP_EXTRACT"
# Zip root is typically hello-elementor/
SRC=""
if theme_ok "$TMP_EXTRACT/hello-elementor"; then
  SRC="$TMP_EXTRACT/hello-elementor"
elif theme_ok "$TMP_EXTRACT"; then
  SRC="$TMP_EXTRACT"
else
  # Single nested folder fallback
  for d in "$TMP_EXTRACT"/*; do
    if theme_ok "$d"; then SRC="$d"; break; fi
  done
fi

if [[ -z "$SRC" ]]; then
  echo "ERROR: Downloaded zip did not contain a valid Hello Elementor theme." >&2
  exit 1
fi

rm -rf "$DEFAULT_DIR"
mkdir -p "$(dirname "$DEFAULT_DIR")"
cp -R "$SRC" "$DEFAULT_DIR"

if ! theme_ok "$DEFAULT_DIR"; then
  echo "ERROR: Failed to install Hello Elementor under $DEFAULT_DIR" >&2
  exit 1
fi

echo "$DEFAULT_DIR"
