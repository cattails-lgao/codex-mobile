### Qodo free-mode state write fixes

#### Feature/Change Name
Free-mode provider settings create missing `CODEX_HOME` before writing state.

#### Prerequisites/Setup
1. Choose a fresh path that does not exist yet, for example `/tmp/codex-missing-home-test`.
2. Start local Vite: `CODEX_HOME=/tmp/codex-missing-home-test pnpm run dev --host 127.0.0.1 --port 4173`.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/`.
2. Open Settings and switch Provider to OpenRouter or another free-mode provider setting that writes `webui-custom-providers.json`.
3. Confirm the provider update succeeds and `/tmp/codex-missing-home-test/webui-custom-providers.json` is created.
4. Confirm the state file has restrictive owner-only permissions.
5. Repeat the provider switch in dark theme and confirm the settings controls and any errors remain readable.

#### Expected Results
- Free-mode provider writes do not fail with `ENOENT` when `CODEX_HOME` is missing at startup.
- The state file parent directory is created automatically before writes.
- The state file is written with restrictive permissions.
- Light and dark theme provider settings remain readable.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove `/tmp/codex-missing-home-test` after verification.

---
