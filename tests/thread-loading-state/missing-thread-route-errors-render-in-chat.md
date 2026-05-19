### Missing thread route errors render in chat

#### Feature/Change Name
Thread route load failures are visible in the conversation instead of silently showing an empty chat.

#### Prerequisites/Setup
1. Start the app with a `CODEX_HOME` that does not contain the target thread id.
2. Use local Vite: `CODEX_HOME=<temp-home> npm run dev -- --host 127.0.0.1 --port 4173`.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/thread/<missing-thread-id>`.
2. Wait for thread loading to finish.
3. Confirm the conversation area shows the `thread/resume` or `thread/read` failure text and a `Send feedback` link.
4. Confirm the model selector still loads the active provider model list instead of staying on disabled `Model`.
5. Repeat in dark theme and confirm the error text, feedback link, and model selector remain readable.

#### Expected Results
- The route does not fail silently with only `No messages in this thread yet`.
- The chat area displays the load error as a visible overlay.
- The model dropdown loads independently of the missing thread and remains usable for the current provider.
- Light and dark theme error surfaces are readable.

#### Rollback/Cleanup
- Navigate back to home or a valid thread.
- Stop the temporary Vite server if it was only used for this check.

---
