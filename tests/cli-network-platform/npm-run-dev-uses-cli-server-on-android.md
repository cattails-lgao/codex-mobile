### Feature: npm run dev uses CLI server on Android

#### Prerequisites
- Android SSH helper exists and is executable: `/Users/igor/Git-projects/codex-web-local-android/andClaw/ssh.sh`.
- Dependencies are installed on the Android clone.

#### Steps
1. On Android, run `npm run dev -- --port 4173`.
2. Confirm startup logs show `Codex Web Local is running!`.
3. In a second Android shell, run `curl -fsS http://127.0.0.1:4173/ | head -5`.
4. Stop the dev server.

#### Expected Results
- Android starts `node dist-cli/index.js`, not raw Vite.
- The server binds successfully and returns the app HTML.
- The Vite `uv_interface_addresses` Android error does not occur.

#### Rollback/Cleanup
- Stop the Android dev server.
