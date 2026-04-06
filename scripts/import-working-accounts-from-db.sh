#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-/Users/igor/Git-projects/any-auto-register/account_manager.db}"
LIMIT="${2:-10}"
CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

mkdir -p "$CODEX_HOME_DIR/accounts"

DB_PATH="$DB_PATH" LIMIT="$LIMIT" CODEX_HOME_DIR="$CODEX_HOME_DIR" python3 - <<'PY'
import base64
import hashlib
import json
import os
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Optional

DB_PATH = os.environ["DB_PATH"]
LIMIT = int(os.environ["LIMIT"])
CODEX_HOME_DIR = Path(os.environ["CODEX_HOME_DIR"]).expanduser()
STATE_PATH = CODEX_HOME_DIR / "accounts.json"
SNAP_ROOT = CODEX_HOME_DIR / "accounts"

CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
REDIRECT_URI = "http://localhost:1455/auth/callback"
TOKEN_URL = "https://auth.openai.com/oauth/token"


def iso_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def parse_account_id(access_token: str) -> Optional[str]:
    parts = access_token.split(".")
    if len(parts) < 2:
        return None
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    auth_claims = claims.get("https://api.openai.com/auth") or {}
    value = auth_claims.get("chatgpt_account_id") or auth_claims.get("user_id")
    return value.strip() if isinstance(value, str) and value.strip() else None


def exchange_refresh_token(refresh_token: str) -> Optional[dict]:
    body = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "redirect_uri": REDIRECT_URI,
    }).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={
            "content-type": "application/x-www-form-urlencoded",
            "accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None

    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token.strip():
        return None

    account_id = parse_account_id(access_token)
    if not account_id:
        return None

    return {
        "access_token": access_token,
        "refresh_token": payload.get("refresh_token") or refresh_token,
        "id_token": payload.get("id_token"),
        "account_id": account_id,
    }


def storage_id(account_id: str) -> str:
    return hashlib.sha256(account_id.encode("utf-8")).hexdigest()


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {"activeAccountId": None, "accounts": []}
    try:
        parsed = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"activeAccountId": None, "accounts": []}

    accounts = parsed.get("accounts")
    if not isinstance(accounts, list):
        accounts = []
    active = parsed.get("activeAccountId")
    if not isinstance(active, str):
        active = None
    return {"activeAccountId": active, "accounts": accounts}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.chmod(STATE_PATH, 0o600)


def upsert_account(state: dict, account_id: str, email: Optional[str], auth_mode: str = "chatgpt") -> None:
    sid = storage_id(account_id)
    now = iso_now()
    existing = None
    for item in state["accounts"]:
        if isinstance(item, dict) and item.get("accountId") == account_id:
            existing = item
            break

    entry = {
        "accountId": account_id,
        "storageId": sid,
        "authMode": auth_mode,
        "email": email,
        "planType": existing.get("planType") if isinstance(existing, dict) else None,
        "lastRefreshedAtIso": now,
        "lastActivatedAtIso": existing.get("lastActivatedAtIso") if isinstance(existing, dict) else None,
        "quotaSnapshot": existing.get("quotaSnapshot") if isinstance(existing, dict) else None,
        "quotaUpdatedAtIso": existing.get("quotaUpdatedAtIso") if isinstance(existing, dict) else None,
        "quotaStatus": existing.get("quotaStatus") if isinstance(existing, dict) else "idle",
        "quotaError": existing.get("quotaError") if isinstance(existing, dict) else None,
        "unavailableReason": existing.get("unavailableReason") if isinstance(existing, dict) else None,
    }

    state["accounts"] = [
        entry,
        *[x for x in state["accounts"] if not (isinstance(x, dict) and x.get("accountId") == account_id)],
    ]


def write_snapshot(account_id: str, token_payload: dict) -> None:
    sid = storage_id(account_id)
    dest_dir = SNAP_ROOT / sid
    dest_dir.mkdir(parents=True, exist_ok=True)
    os.chmod(dest_dir, 0o700)
    dest = dest_dir / "auth.json"
    auth_json = {
        "auth_mode": "chatgpt",
        "OPENAI_API_KEY": None,
        "tokens": {
            "id_token": token_payload.get("id_token"),
            "access_token": token_payload["access_token"],
            "refresh_token": token_payload.get("refresh_token"),
            "account_id": account_id,
        },
        "last_refresh": iso_now(),
    }
    dest.write_text(json.dumps(auth_json, indent=2), encoding="utf-8")
    os.chmod(dest, 0o600)


conn = sqlite3.connect(DB_PATH)
rows = conn.execute(
    """
    SELECT id, email, refresh_token
    FROM account_tokens
    WHERE refresh_token IS NOT NULL AND trim(refresh_token) <> ''
    ORDER BY id ASC
    """
).fetchall()
conn.close()

state = load_state()
existing_ids = {
    item.get("accountId")
    for item in state["accounts"]
    if isinstance(item, dict) and isinstance(item.get("accountId"), str)
}

imported = 0
attempted = 0

for row_id, email, refresh_token in rows:
    if imported >= LIMIT:
        break
    attempted += 1
    token_payload = exchange_refresh_token(refresh_token)
    if token_payload is None:
        continue
    account_id = token_payload["account_id"]
    if account_id in existing_ids:
        continue
    write_snapshot(account_id, token_payload)
    upsert_account(state, account_id=account_id, email=email)
    existing_ids.add(account_id)
    imported += 1
    print(f"imported row_id={row_id} email={email} account_id={account_id}")

save_state(state)
print(f"done imported={imported} attempted={attempted} limit={LIMIT}")
print(f"state={STATE_PATH}")
print(f"snapshots={SNAP_ROOT}")
PY
