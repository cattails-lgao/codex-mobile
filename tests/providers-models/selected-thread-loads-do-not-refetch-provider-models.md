### Selected thread loads do not refetch provider models

#### Feature/Change Name
Message loads for an already selected thread do not trigger redundant model preference or provider-model requests.

#### Prerequisites/Setup
1. Use a thread that already has a captured provider and visible messages.
2. Start local Vite: `CODEX_HOME=<temp-home> pnpm run dev --host 127.0.0.1 --port 4173`.
3. Keep browser developer tools or the profiling report available for request inspection.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/thread/<thread-id>`.
2. Reload the route or navigate away and back to force a message load.
3. Confirm the conversation messages render and the model dropdown remains scoped to that thread's provider.
4. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
5. Inspect the generated `output/playwright/browser-runtime-profile-*.json`.
6. Repeat the route reload in dark theme and confirm the same model dropdown and messages remain readable.

#### Expected Results
- Loading messages does not call the model config or provider-model endpoints again after the thread/provider state is already loaded.
- The profile shows no duplicate provider model/config requests caused by `loadMessages`.
- The model dropdown still shows only the selected thread provider's models.
- Light and dark theme conversation and model dropdown surfaces remain readable.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove the temporary isolated `CODEX_HOME` and unset or restore `CODEX_HOME` if it was exported.

---
