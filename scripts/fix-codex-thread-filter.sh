#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# fix-codex-thread-filter.sh
#
# Patch Codex.app so thread/list always returns threads from ALL model
# providers, not just the one matching the current config.
#
# Root cause: The codex app-server binary filters thread/list results by
# modelProvider. Threads created with modelProvider "openai" are hidden
# when running with a different provider (e.g. "openrouter-free"), and
# vice versa.
#
# Fix: Patch the app-server bridge in the Electron main-process bundle
# so listThreads always injects modelProviders:[] into the RPC params,
# telling the app-server to return threads from ALL providers.
#
# Method: Extract app.asar → patch JS → repack → restart Codex.app
###############################################################################

CODEX_APP="/Applications/Codex.app"
ASAR_PATH="$CODEX_APP/Contents/Resources/app.asar"
ASAR_BACKUP="$CODEX_APP/Contents/Resources/app.asar.bak"
EXTRACT_DIR="/tmp/codex-app-patched"
CDP_PORT="${CDP_PORT:-9339}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=0
RESTORE=0

usage() {
  cat <<'EOF'
Usage: fix-codex-thread-filter.sh [OPTIONS]

Patch Codex.app to show threads from ALL model providers (openai,
openrouter-free, etc.) regardless of the current provider config.

Options:
  --dry-run             Show what would be done without doing it
  --restore             Restore the original unpatched app.asar
  --cdp-port PORT       CDP port for renderer verification (default: 9339)
  -h, --help            Show this help

The patch survives Codex.app restarts but will be overwritten by app
updates. Run again after updating Codex.app, or use --restore to undo.
EOF
}

while (( $# )); do
  case "$1" in
    --dry-run)       DRY_RUN=1; shift ;;
    --restore)       RESTORE=1; shift ;;
    --cdp-port)      CDP_PORT="$2"; shift 2 ;;
    -h|--help)       usage; exit 0 ;;
    *)               echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ ! -d "$CODEX_APP" ]]; then
  echo -e "${RED}Codex.app not found at $CODEX_APP${NC}" >&2
  exit 1
fi

if [[ ! -f "$ASAR_PATH" ]]; then
  echo -e "${RED}app.asar not found at $ASAR_PATH${NC}" >&2
  exit 1
fi

###############################################################################
# Restore mode
###############################################################################
if [[ "$RESTORE" -eq 1 ]]; then
  if [[ ! -f "$ASAR_BACKUP" ]]; then
    echo -e "${RED}No backup found at $ASAR_BACKUP${NC}" >&2
    echo "Nothing to restore."
    exit 1
  fi
  echo -e "${YELLOW}Restoring original app.asar...${NC}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  (dry-run) Would copy $ASAR_BACKUP → $ASAR_PATH"
  else
    # Quit Codex first
    if pgrep -x "Codex" >/dev/null 2>&1; then
      echo "  Quitting Codex.app..."
      osascript -e 'tell application "Codex" to quit' 2>/dev/null || true
      sleep 2
      pgrep -x "Codex" >/dev/null 2>&1 && pkill -x "Codex" 2>/dev/null || true
      sleep 1
    fi
    cp "$ASAR_BACKUP" "$ASAR_PATH"
    echo -e "${GREEN}Restored. Start Codex.app normally.${NC}"
  fi
  exit 0
fi

echo -e "${YELLOW}=== Codex.app Thread Provider Filter Patch ===${NC}"
echo ""
echo "This patch makes ALL threads visible regardless of model provider."
echo ""

###############################################################################
# Step 1: Extract the asar
###############################################################################
echo -e "${YELLOW}[1/4] Extracting app.asar...${NC}"

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
npx asar extract "$ASAR_PATH" "$EXTRACT_DIR" 2>/dev/null
echo -e "  ${GREEN}Extracted to $EXTRACT_DIR${NC}"

###############################################################################
# Step 2: Find and patch the main-process bundle
###############################################################################
echo ""
echo -e "${YELLOW}[2/4] Patching main-process bundle...${NC}"

# Find the product-name JS file (contains listThreads/sendInternalRequest)
MAIN_BUNDLE=$(ls "$EXTRACT_DIR/.vite/build"/product-name-*.js 2>/dev/null | head -1)

if [[ -z "$MAIN_BUNDLE" ]]; then
  echo -e "  ${RED}Could not find product-name-*.js in extracted bundle${NC}" >&2
  exit 1
fi

echo "  Target: $(basename "$MAIN_BUNDLE")"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  (dry-run) Would patch listThreads to inject modelProviders:[]"
  echo ""
  echo -e "${YELLOW}[3/4] (dry-run) Would repack and install${NC}"
  echo -e "${YELLOW}[4/4] (dry-run) Would verify${NC}"
  echo ""
  # Show what would be patched
  python3 -c "
with open('$MAIN_BUNDLE') as f:
    c = f.read()
t = 'async listThreads(e){await this.ensureReady()'
idx = c.find(t)
if idx >= 0:
    print('  Found target pattern at offset', idx)
    print('  Context: ...' + c[max(0,idx-10):idx+80] + '...')
else:
    print('  WARNING: target pattern not found')
"
  rm -rf "$EXTRACT_DIR"
  echo -e "${GREEN}Done (dry-run).${NC}"
  exit 0
else
  # Patch: find the listThreads method and inject modelProviders:[] into params
  # Original pattern:
  #   async listThreads(e){await this.ensureReady();let t=`thread/list:${...}`,n=await this.sendInternalRequest({id:t,method:`thread/list`,params:e});
  # Patched:
  #   async listThreads(e){e=Object.assign({},e||{},modelProviders:[]);await this.ensureReady();...

  python3 << PYEOF
import sys

with open("$MAIN_BUNDLE", "r") as f:
    content = f.read()

# The exact pattern in the minified code
original = 'async listThreads(e){await this.ensureReady()'
patched  = 'async listThreads(e){e=Object.assign({},e||{},{modelProviders:[]});await this.ensureReady()'

if '__threadFilterPatched__' in content:
    print("  Already patched!")
    sys.exit(0)

if original not in content:
    print("  ERROR: Could not find listThreads pattern in bundle")
    print("  Searching for alternative patterns...")
    # Try to find it with variations
    idx = content.find('listThreads')
    if idx >= 0:
        print(f"  Found 'listThreads' at offset {idx}")
        print(f"  Context: ...{content[max(0,idx-20):idx+100]}...")
    else:
        print("  'listThreads' not found at all in this file")
    sys.exit(1)

# Apply patch
content = content.replace(original, patched, 1)

# Also add a marker so we can detect if already patched
content = content + '\n// __threadFilterPatched__\n'

count = content.count(patched)
if count != 1:
    print(f"  WARNING: patch applied {count} times (expected 1)")

with open("$MAIN_BUNDLE", "w") as f:
    f.write(content)

print("  Patch applied to listThreads")
PYEOF

  if [[ $? -ne 0 ]]; then
    echo -e "  ${RED}Patching failed${NC}" >&2
    exit 1
  fi
  echo -e "  ${GREEN}Patched successfully${NC}"
fi

###############################################################################
# Step 3: Repack the asar and replace
###############################################################################
echo ""
echo -e "${YELLOW}[3/4] Repacking and installing...${NC}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  (dry-run) Would backup original to $ASAR_BACKUP"
  echo "  (dry-run) Would repack $EXTRACT_DIR to $ASAR_PATH"
else
  # Quit Codex first
  if pgrep -x "Codex" >/dev/null 2>&1; then
    echo "  Quitting Codex.app..."
    osascript -e 'tell application "Codex" to quit' 2>/dev/null || true
    sleep 2
    if pgrep -x "Codex" >/dev/null 2>&1; then
      pkill -x "Codex" 2>/dev/null || true
      sleep 1
    fi
  fi

  # Backup original if not already backed up
  if [[ ! -f "$ASAR_BACKUP" ]]; then
    echo "  Backing up original app.asar..."
    cp "$ASAR_PATH" "$ASAR_BACKUP"
  else
    echo "  Backup already exists at $ASAR_BACKUP"
  fi

  # Repack
  echo "  Repacking asar..."
  npx asar pack "$EXTRACT_DIR" "$ASAR_PATH" 2>/dev/null
  echo -e "  ${GREEN}Installed patched app.asar${NC}"

  # Restart Codex
  echo "  Starting Codex.app..."
  open -a "Codex" --args --remote-debugging-port="$CDP_PORT"
  sleep 5
fi

###############################################################################
# Step 4: Verify
###############################################################################
echo ""
echo -e "${YELLOW}[4/4] Verifying...${NC}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  (dry-run) Would verify threads from multiple providers are visible"
  echo ""
  echo -e "${GREEN}Done (dry-run).${NC}"
  exit 0
fi

BUNDLE_NAME=$(basename "$MAIN_BUNDLE")
VERIFY_DIR="/tmp/codex-verify-patch-$$"
rm -rf "$VERIFY_DIR"
mkdir -p "$VERIFY_DIR"
if npx asar extract "$ASAR_PATH" "$VERIFY_DIR" 2>/dev/null; then
  if grep -q '__threadFilterPatched__' "$VERIFY_DIR/.vite/build/$BUNDLE_NAME" 2>/dev/null; then
    echo -e "  ${GREEN}Patch marker verified in installed asar${NC}"
  else
    echo -e "  ${RED}Patch marker NOT found in installed asar${NC}"
  fi
fi
rm -rf "$VERIFY_DIR"

# Clean up extraction dir
rm -rf "$EXTRACT_DIR"

echo ""
echo -e "${GREEN}=== Patch applied successfully ===${NC}"
echo ""
echo "All threads are now visible regardless of model provider."
echo "Threads from openai, openrouter-free, and any other provider"
echo "will appear together in the sidebar."
echo ""
echo -e "${CYAN}Persistence:${NC} This patch survives restarts but will be"
echo "overwritten by Codex.app updates. Run again after updates."
echo ""
echo -e "${CYAN}Restore:${NC} To undo the patch:"
echo "  bash $0 --restore"
