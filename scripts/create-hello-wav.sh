#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$ROOT_DIR/test/fixtures/hello.wav"
TMP_AIFF="$(mktemp /tmp/hello.XXXXXX.aiff)"

cleanup() {
  rm -f "$TMP_AIFF"
}
trap cleanup EXIT

mkdir -p "$(dirname "$OUT_FILE")"

say "hello" -o "$TMP_AIFF"
afconvert -f WAVE -d LEI16@16000 "$TMP_AIFF" "$OUT_FILE"

echo "Created $OUT_FILE"
