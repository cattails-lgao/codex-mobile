#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# fix-codex-worktree-button.sh
#
# Workaround for Codex.app bug where the "New worktree" button disappears
# after switching accounts. The root cause is a Statsig SDK race condition:
# during updateUserAsync, the evaluation store is cleared synchronously but
# refilled asynchronously, causing feature gate 505458 (worktree) to return
# false momentarily. The full component tree unmounts during this transition,
# losing the composer mode state permanently.
#
# This script:
#   1. Quits Codex.app if running
#   2. Clears the stale Statsig evaluation cache from Local Storage (LevelDB)
#   3. Optionally clears Session Storage
#   4. Relaunches Codex.app so it fetches fresh gate values on startup
#
# The fresh fetch on startup avoids the race because the gate value is
# resolved before the component tree mounts.
###############################################################################

CODEX_APP="/Applications/Codex.app"
CODEX_DATA_DIR="$HOME/Library/Application Support/Codex"
LOCAL_STORAGE="$CODEX_DATA_DIR/Local Storage/leveldb"
SESSION_STORAGE="$CODEX_DATA_DIR/Session Storage"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

RELAUNCH=1
CLEAR_SESSION=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: fix-codex-worktree-button.sh [OPTIONS]

Fix the missing "New worktree" button after account switch in Codex.app.

Options:
  --no-relaunch       Don't relaunch Codex.app after clearing cache
  --clear-session     Also clear Session Storage (more aggressive)
  --dry-run           Show what would be done without doing it
  -h, --help          Show this help
EOF
}

while (( $# )); do
  case "$1" in
    --no-relaunch)   RELAUNCH=0; shift ;;
    --clear-session) CLEAR_SESSION=1; shift ;;
    --dry-run)       DRY_RUN=1; shift ;;
    -h|--help)       usage; exit 0 ;;
    *)               echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -d "$CODEX_APP" ]]; then
  echo -e "${RED}Codex.app not found at $CODEX_APP${NC}" >&2
  exit 1
fi

if [[ ! -d "$CODEX_DATA_DIR" ]]; then
  echo -e "${RED}Codex data directory not found: $CODEX_DATA_DIR${NC}" >&2
  exit 1
fi

echo -e "${YELLOW}=== Codex.app Worktree Button Fix ===${NC}"
echo ""

# Step 1: Quit Codex.app
if pgrep -x "Codex" >/dev/null 2>&1; then
  echo -e "${YELLOW}[1/3] Quitting Codex.app...${NC}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  (dry-run) Would quit Codex.app"
  else
    osascript -e 'tell application "Codex" to quit' 2>/dev/null || true
    sleep 2
    if pgrep -x "Codex" >/dev/null 2>&1; then
      echo "  Graceful quit failed, force-killing..."
      pkill -x "Codex" 2>/dev/null || true
      sleep 1
    fi
    echo -e "  ${GREEN}Codex.app stopped${NC}"
  fi
else
  echo -e "[1/3] Codex.app is not running"
fi

# Step 2: Clear Statsig cache from Local Storage
echo ""
echo -e "${YELLOW}[2/3] Clearing Statsig evaluation cache...${NC}"

if [[ -d "$LOCAL_STORAGE" ]]; then
  statsig_files=0
  total_bytes=0

  for f in "$LOCAL_STORAGE"/*.ldb "$LOCAL_STORAGE"/*.log; do
    [[ -f "$f" ]] || continue
    if python3 -c "
import sys
with open(sys.argv[1], 'rb') as fh:
    sys.exit(0 if b'statsig' in fh.read() else 1)
" "$f" 2>/dev/null; then
      size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null || echo 0)
      total_bytes=$((total_bytes + size))
      statsig_files=$((statsig_files + 1))
      echo "  Found statsig data in: $(basename "$f") (${size} bytes)"
    fi
  done

  if [[ "$statsig_files" -gt 0 ]]; then
    echo ""
    echo "  Files with Statsig cache: $statsig_files"
    echo "  Total size: $((total_bytes / 1024)) KB"
    echo ""

    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "  (dry-run) Would delete Local Storage to clear stale evaluations"
    else
      backup_dir="$CODEX_DATA_DIR/Local Storage.bak.$(date +%s)"
      cp -r "$CODEX_DATA_DIR/Local Storage" "$backup_dir"
      echo "  Backed up to: $(basename "$backup_dir")"

      rm -rf "$LOCAL_STORAGE"
      mkdir -p "$LOCAL_STORAGE"
      echo -e "  ${GREEN}Local Storage cleared${NC}"
    fi
  else
    echo -e "  ${GREEN}No stale Statsig cache found${NC}"
  fi
else
  echo "  Local Storage directory not found (nothing to clear)"
fi

if [[ "$CLEAR_SESSION" -eq 1 && -d "$SESSION_STORAGE" ]]; then
  echo ""
  echo "  Clearing Session Storage..."
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  (dry-run) Would clear Session Storage"
  else
    rm -rf "$SESSION_STORAGE"
    mkdir -p "$SESSION_STORAGE"
    echo -e "  ${GREEN}Session Storage cleared${NC}"
  fi
fi

# Step 3: Relaunch
echo ""
if [[ "$RELAUNCH" -eq 1 ]]; then
  echo -e "${YELLOW}[3/3] Relaunching Codex.app...${NC}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  (dry-run) Would open Codex.app"
  else
    open "$CODEX_APP"
    echo -e "  ${GREEN}Codex.app launched${NC}"
  fi
else
  echo "[3/3] Skipping relaunch (--no-relaunch)"
fi

echo ""
echo -e "${GREEN}Done.${NC} On next launch, Codex.app will fetch fresh Statsig"
echo "evaluations, and the 'New worktree' button should appear normally."
echo ""
echo "If the button disappears again after another account switch,"
echo "run this script again. The underlying bug is in Codex.app's"
echo "Statsig SDK integration (gate 505458 race during updateUserAsync)."
