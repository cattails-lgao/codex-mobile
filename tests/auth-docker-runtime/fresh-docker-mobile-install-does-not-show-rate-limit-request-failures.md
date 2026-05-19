### Fresh Docker mobile install does not show rate-limit request failures

#### Feature/Change Name
Fresh unauthenticated install mobile home screen rate-limit handling.

#### Prerequisites/Setup
1. Docker is available.
2. A clean container has this project installed under `/workspace`.
3. `@openai/codex` is installed in the container.
4. Container dev server is running with a fresh Codex home:
   `CODEX_HOME=/tmp/codex-home CODEXUI_CODEX_COMMAND=$(command -v codex) pnpm run dev --host 0.0.0.0 --port 4173`
5. The container port is mapped to the host, for example `127.0.0.1:4174 -> 4173`.

#### Steps
1. Open `http://127.0.0.1:4174/` in a mobile viewport such as iPhone 13 `390x664`.
2. In light theme, wait for the Start new thread home screen to render.
3. Capture network responses and confirm no `/codex-api/rpc` response fails with `502` for `account/rateLimits/read`.
4. Confirm the composer renders and the quota UI is simply absent when the fresh `CODEX_HOME` has no authenticated Codex account.
5. Switch to dark theme and reload the same mobile viewport.
6. Repeat steps 2 through 4 in dark theme.
7. Add an `auth.json` containing only `tokens.access_token` and confirm `account/rateLimits/read` is not short-circuited as unauthenticated.
8. Replace `auth.json` with malformed JSON and confirm the server logs a `[codex-auth] Unable to read Codex auth state` warning while the home screen still renders.

#### Expected Results
- The fresh mobile home screen renders without a blank page.
- `account/rateLimits/read` returns an empty result instead of a `502` when no Codex account is authenticated.
- An access-token-only auth file is treated as authenticated enough to ask Codex for rate limits.
- Malformed auth files are visible in server logs instead of being silently treated as a normal fresh install.
- The UI remains usable in light theme and dark theme.
- No login or account import is required just to load the home screen.

#### Rollback/Cleanup
- Stop and remove the temporary Docker container, for example `docker rm -f <container-name>`.

---
