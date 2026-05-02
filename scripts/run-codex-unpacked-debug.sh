#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${CODEX_APP_PATH:-/Applications/Codex.app}"
ELECTRON_PATH="${CODEX_ELECTRON_BIN:-}"
REMOTE_DEBUG_PORT="${CODEX_ELECTRON_REMOTE_DEBUG_PORT:-9229}"
INSPECT_PORT="${CODEX_NODE_INSPECT_PORT:-9222}"
DRY_RUN=0
EXTRA_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  run-codex-unpacked-debug.sh [options] [-- <extra app args>]

Options:
  --app <path>             Codex.app path (default: /Applications/Codex.app)
  --electron <path>         Custom electron binary path
  --remote-debugging-port N Set Chromium remote debugging port (default: 9229)
  --inspect-port N          Set Node.js inspector port (default: 9222)
  --dry-run                 Print command only
  -h, --help               Show this help

Examples:
  ./run-codex-unpacked-debug.sh
  ./run-codex-unpacked-debug.sh --app /Applications/Codex.app -- --webui --port 4310
USAGE
}

while (( $# )); do
  case "$1" in
    --app)
      APP_PATH="${2:?missing value for --app}"
      shift 2
      ;;
    --electron)
      ELECTRON_PATH="${2:?missing value for --electron}"
      shift 2
      ;;
    --remote-debugging-port)
      REMOTE_DEBUG_PORT="${2:?missing value for --remote-debugging-port}"
      shift 2
      ;;
    --inspect-port)
      INSPECT_PORT="${2:?missing value for --inspect-port}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    *)
      EXTRA_ARGS+=("$1")
      shift
      ;;
  esac
done

APP_ENTRY="$APP_PATH/Contents/Resources/app.asar"
CLI_PATH="$APP_PATH/Contents/Resources/codex"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app not found: $APP_PATH" >&2
  exit 1
fi
if [[ ! -f "$APP_ENTRY" ]]; then
  echo "Error: app.asar missing: $APP_ENTRY" >&2
  exit 1
fi
if [[ ! -x "$CLI_PATH" ]]; then
  echo "Error: codex CLI missing or not executable: $CLI_PATH" >&2
  exit 1
fi

if [[ -n "$ELECTRON_PATH" ]]; then
  if [[ ! -x "$ELECTRON_PATH" ]]; then
    echo "Error: specified electron is not executable: $ELECTRON_PATH" >&2
    exit 1
  fi
  ELECTRON_CMD=("$ELECTRON_PATH")
elif command -v electron >/dev/null 2>&1; then
  ELECTRON_BIN="$(command -v electron)"
  ELECTRON_CMD=("$ELECTRON_BIN")
else
  ELECTRON_CMD=("npx" "--yes" "electron")
fi

ELECTRON_FLAGS=(
  "--enable-logging"
  "--remote-debugging-port=$REMOTE_DEBUG_PORT"
  "--inspect=$INSPECT_PORT"
)

export ELECTRON_FORCE_IS_PACKAGED=true
export CODEX_CLI_PATH="$CLI_PATH"
export CUSTOM_CLI_PATH="$CLI_PATH"

CMD=("${ELECTRON_CMD[@]}" "${ELECTRON_FLAGS[@]}" "$APP_ENTRY")
if ((${#EXTRA_ARGS[@]})); then
  CMD+=("${EXTRA_ARGS[@]}")
fi

echo "Launching Codex (unpacked) with Electron debug flags"
echo "App: $APP_ENTRY"
echo "Command:"
printf '  %q' "${CMD[@]}"
echo

if (( DRY_RUN )); then
  exit 0
fi

exec "${CMD[@]}"
