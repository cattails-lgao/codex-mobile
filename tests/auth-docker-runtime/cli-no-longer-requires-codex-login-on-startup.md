### Feature: CLI no longer requires codex login on startup

#### Prerequisites
- Remove `~/.codex/auth.json` to simulate a first-time user.

#### Steps
1. Run `npx codexui` or `pnpm run dev`.
2. Verify the CLI prints a message about not being logged in but does NOT block or prompt for login.
3. Verify the server starts and the web UI loads successfully.
4. Use the Provider dropdown in settings to select OpenRouter and start chatting without a Codex account.

#### Expected Results
- CLI does not run `codex login` on startup.
- A friendly message is shown: "You can log in later via settings or run `codexui login`."
- The app is fully usable without a Codex account when using OpenRouter or custom providers.

#### Rollback/Cleanup
- Run `codexui login` to restore Codex authentication if needed.

---
