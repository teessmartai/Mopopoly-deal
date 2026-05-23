#!/usr/bin/env bash
#
# Assembles the embedded Node project that ships inside the Android APK.
# src/ and public/ remain the single source of truth: this copies them into
# the app's assets and installs only the runtime dependency (ws).
#
# Run from anywhere; paths are resolved relative to the repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/android/app/src/main/assets/nodejs-project"
TEMPLATE="$ROOT/android/node-template"

echo "==> Assembling embedded Node project"
echo "    source : $ROOT/src , $ROOT/public"
echo "    dest   : $DEST"

rm -rf "$DEST"
mkdir -p "$DEST"

cp -R "$ROOT/src" "$DEST/src"
cp -R "$ROOT/public" "$DEST/public"
cp "$TEMPLATE/mobile-main.js" "$DEST/mobile-main.js"
cp "$TEMPLATE/package.json" "$DEST/package.json"

echo "==> Installing runtime dependencies (ws only; no dev/optional/native)"
(
  cd "$DEST"
  npm install --omit=dev --omit=optional --no-audit --no-fund --no-package-lock
)

# qrcode-terminal is intentionally NOT installed for mobile: server.js requires
# it inside a try/catch and skips the console QR when it (or a TTY) is absent.

echo "==> Embedded Node project ready:"
du -sh "$DEST" 2>/dev/null || true
echo "    (this folder is a build artifact and is git-ignored)"
