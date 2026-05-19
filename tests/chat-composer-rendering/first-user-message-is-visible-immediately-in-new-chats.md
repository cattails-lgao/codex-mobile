### First user message is visible immediately in new chats

#### Feature/Change Name
New-thread sends render the submitted user message immediately, even when the backend thread read lags behind the assistant response.

#### Prerequisites/Setup
1. Create a fresh isolated `CODEX_HOME`.
2. Start local Vite: `CODEX_HOME=<temp-home> npm run dev -- --host 127.0.0.1 --port 4173`.
3. Use an explicit test project folder to avoid projectless folder-name collisions from repeated `hi` tests.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/?openProjectPath=<encoded-test-project-path>`.
2. Send `hi` in a new unauthenticated chat and confirm the conversation pane immediately shows the user row `hi`.
3. Copy `/Users/igor/.codex/auth.json` to `<temp-home>/auth.json`.
4. Restart the same Vite server with the same `CODEX_HOME`.
5. Open the same project path, create another new chat, and send `hi`.
6. Confirm the conversation pane immediately shows the user row `hi`, then wait for the assistant response.
7. Select `GPT-5.4-mini` in a post-auth new chat, send `hi`, and confirm the user row appears before the assistant response finishes.
8. Repeat in dark theme and confirm the user row remains visible before and after the assistant response.

#### Expected Results
- The submitted first user message appears in the conversation pane immediately after send.
- Backend refreshes that contain only the assistant item do not temporarily remove the optimistic user row.
- When the backend later returns the real user item, the optimistic row is replaced without a duplicate.
- Completion events refresh the selected thread even when it was already marked loaded by an optimistic first message.
- Delayed GPT-5.4-mini replies appear automatically when the completion notification arrives; no manual refresh is required.
- Light and dark theme message rows remain readable.

#### Rollback/Cleanup
- Stop the temporary Vite server.
- Remove the temporary isolated `CODEX_HOME` and test project folder.

---
