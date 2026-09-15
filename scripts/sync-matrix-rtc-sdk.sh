#!/usr/bin/env bash
#
# Copyright 2026 Element Creations Ltd.
#
# SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Element-Commercial
# Please see LICENSE in the repository root for full details.
#
# Vendors the matrix-rtc crate's uniffi web bindings into
# src/matrix-rtc-sdk/generated/. Until the crate ships as an npm package this
# is how Element Call picks up a new build of it: build it there, copy the
# generated TypeScript, the wasm-bindgen glue and the wasm here.
#
#   scripts/sync-matrix-rtc-sdk.sh [path-to-MatrixSdkArchitectureDraft] [--no-build]
#
# The build uses web-test-app/ubrn.element-call.config.yaml (feature `uniffi`
# only, release profile, its own output directory so the app's test build is
# left alone). Pass --no-build to copy whatever was built last.

set -euo pipefail

DRAFT="${1:-../matrix-rust-rtc/MatrixSdkArchitectureDraft}"
BUILD=1
for arg in "$@"; do
  [[ "$arg" == "--no-build" ]] && BUILD=0
done

APP="$DRAFT/web-test-app"
GENERATED="$APP/src/generated-element-call"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/matrix-rtc-sdk/generated"

if [[ ! -f "$APP/ubrn.element-call.config.yaml" ]]; then
  echo "No web-test-app/ubrn.element-call.config.yaml under $DRAFT" >&2
  exit 1
fi

if [[ "$BUILD" == 1 ]]; then
  (cd "$APP" && npx ubrn build web --config ubrn.element-call.config.yaml --release)
fi

mkdir -p "$DEST/wasm-bindgen"
cp "$GENERATED/matrix_rtc.ts" "$GENERATED/matrix_rtc-ffi.ts" "$DEST/"
cp "$GENERATED/wasm-bindgen/index.js" "$GENERATED/wasm-bindgen/index_bg.wasm" "$DEST/wasm-bindgen/"

REV="$(git -C "$DRAFT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
DIRTY="$(git -C "$DRAFT" status --porcelain 2>/dev/null | grep -q . && echo '-dirty' || true)"
cat > "$DEST/VERSION" <<VERSION
matrix-rtc (MatrixSdkArchitectureDraft) ${REV}${DIRTY}
built $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/sync-matrix-rtc-sdk.sh
VERSION

echo "Synced matrix-rtc bindings from $DRAFT ($REV$DIRTY) into $DEST"
ls -la "$DEST" "$DEST/wasm-bindgen"
