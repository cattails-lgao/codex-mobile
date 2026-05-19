### Thread-locked providers across Zen, Codex, and OpenRouter

#### Feature/Change Name
Threads capture their provider at creation time and keep provider-scoped model menus and sends.

#### Prerequisites/Setup
1. Create a fresh temporary `CODEX_HOME` with no `auth.json`.
2. Start the app locally with Vite only: `CODEX_HOME=<temp-home> npm run dev -- --host 127.0.0.1 --port 4173`.
3. Keep a valid host auth file at `/Users/igor/.codex/auth.json`.
4. Keep a valid OpenRouter key available.

#### Steps
1. In light theme, open `http://127.0.0.1:4173`.
2. Create a project chat with no auth present and confirm the provider is OpenCode Zen.
3. Open the model menu and confirm it only shows Zen models, including `big-pickle`, with no GPT/Codex entries.
4. Send `hi` and confirm the request uses `big-pickle` and a visible assistant reply appears.
5. Copy `/Users/igor/.codex/auth.json` into the isolated `CODEX_HOME` while the Vite server is still running, reload the app, and confirm the new-chat composer switches from `big-pickle` to a Codex/GPT model.
6. Restart the Vite server with the same `CODEX_HOME`, reload the app, and confirm the composer still shows Codex/GPT models.
7. In the same project, create a new chat and confirm it uses the current global Codex provider.
8. Open the model menu and confirm it only shows Codex/GPT models, with no Zen entries.
9. Send `hi` and confirm the request uses a GPT model and a visible assistant reply appears.
10. Reopen the old Zen thread, confirm the model menu still shows only Zen models, send `hi`, and confirm the request still uses `big-pickle` with a visible assistant reply.
11. Switch Settings provider to OpenRouter, configure the OpenRouter API key, and create another new chat in the same project.
12. Confirm the new chat uses OpenRouter, the model menu shows only OpenRouter models, and `hi` sends through OpenRouter with a visible assistant reply.
13. Reopen the Zen, Codex, and OpenRouter threads in the same project and confirm each model menu remains provider-scoped and each send uses that thread's provider.
14. Repeat the provider label and model menu checks in dark theme.

#### Expected Results
- Existing threads use their captured `modelProvider`, not the current global provider, for model-list filtering and sends.
- New chats use the current global provider at creation time and do not inherit stale models from previously opened project threads.
- Copying Codex auth into a running no-auth Vite session restarts stale Zen app-server config before the next model/config RPC, so Settings and the composer cannot disagree.
- Projects can contain Zen, Codex, and OpenRouter threads at the same time without mixed provider/model state.
- Light and dark theme model menus remain readable and provider-specific.

#### Rollback/Cleanup
- Stop the temporary Vite server.
- Remove the temporary isolated `CODEX_HOME`.
- Restore the preferred provider in Settings if it was changed during testing.

---
