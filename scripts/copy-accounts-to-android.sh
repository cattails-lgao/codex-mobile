#!/usr/bin/env bash
set -euo pipefail

LOCAL_CODEX_HOME="${LOCAL_CODEX_HOME:-$HOME/.codex}"
REMOTE_CODEX_HOME="${REMOTE_CODEX_HOME:-~/.codex}"
SSH_HELPER="${SSH_HELPER:-/Users/igor/Git-projects/codex-web-local-android/andclaw/ssh.sh}"
SSH_MODE_VALUE="${SSH_MODE:-auto}"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [ssh_helper_path]

Env vars:
  LOCAL_CODEX_HOME   Local codex home (default: ~/.codex)
  REMOTE_CODEX_HOME  Remote codex home on Android (default: ~/.codex)
  SSH_HELPER         SSH helper script path
  SSH_MODE           ssh.sh mode (default: auto)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ge 1 ]]; then
  SSH_HELPER="$1"
fi

if [[ ! -x "$SSH_HELPER" ]]; then
  echo "SSH helper not executable: $SSH_HELPER" >&2
  exit 1
fi

if [[ ! -d "$LOCAL_CODEX_HOME/accounts" ]]; then
  echo "Missing local accounts directory: $LOCAL_CODEX_HOME/accounts" >&2
  exit 1
fi

if [[ ! -f "$LOCAL_CODEX_HOME/accounts.json" ]]; then
  echo "Missing local accounts file: $LOCAL_CODEX_HOME/accounts.json" >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required" >&2
  exit 1
fi

tmp_tar=$(mktemp /tmp/codex-accounts.XXXXXX.tar)
cleanup() {
  rm -f "$tmp_tar"
}
trap cleanup EXIT

local_count=$(find "$LOCAL_CODEX_HOME/accounts" -name auth.json | wc -l | tr -d ' ')
echo "Local auth.json count: $local_count"

echo "Packing local account state..."
LANG=C tar -C "$LOCAL_CODEX_HOME" -cf "$tmp_tar" accounts accounts.json

echo "Ensuring SSH transport..."
SSH_MODE=auto "$SSH_HELPER" "echo ready" >/dev/null 2>&1 || true

echo "Uploading tar to Android..."
cat "$tmp_tar" | SSH_MODE=ssh "$SSH_HELPER" 'cat > /tmp/codex-accounts.tar'

echo "Extracting on Android..."
extract_output=$(SSH_MODE=ssh "$SSH_HELPER" "mkdir -p $REMOTE_CODEX_HOME && rm -rf $REMOTE_CODEX_HOME/accounts && LANG=C tar -C $REMOTE_CODEX_HOME -xf /tmp/codex-accounts.tar && rm -f /tmp/codex-accounts.tar" 2>&1 || true)
if [[ -n "$extract_output" ]]; then
  printf '%s\n' "$extract_output"
fi

raw_remote_count=$(SSH_MODE=ssh "$SSH_HELPER" "find $REMOTE_CODEX_HOME/accounts -name auth.json | wc -l" || true)
remote_count=$(printf '%s\n' "$raw_remote_count" | grep -Eo '[0-9]+' | tail -n 1 || true)

if [[ -z "$remote_count" ]]; then
  echo "Failed to parse remote count. Raw output:" >&2
  printf '%s\n' "$raw_remote_count" >&2
  exit 1
fi

echo "Remote auth.json count: $remote_count"

if [[ "$remote_count" != "$local_count" ]]; then
  echo "Copy mismatch: local=$local_count remote=$remote_count" >&2
  exit 1
fi

echo "Copy complete: local and remote counts match."
