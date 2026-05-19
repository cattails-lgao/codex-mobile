### New chat live thinking and stop controls

#### Feature/Change Name
Projectless new chats show live thinking state and interrupt controls while a turn is active.

#### Prerequisites/Setup
1. Use an isolated `CODEX_HOME` with valid Codex auth.
2. Start local Vite: `CODEX_HOME=<temp-home> pnpm run dev --host 127.0.0.1 --port 4173`.

#### Steps
1. In light theme, open `http://127.0.0.1:4173/#/`.
2. In the projectless `Chats` composer, send `create todo list app`.
3. Within a few seconds after send, confirm the conversation shows a live `Thinking` overlay even if no detailed activity event has arrived yet.
4. Confirm the composer shows a stop button while the turn is active.
5. Wait for the assistant output and confirm the stop button is replaced by the normal send button after completion.
6. Repeat in dark theme and confirm the live overlay and stop button remain readable.

#### Expected Results
- Active thread status from `thread/read`, including `{ status: { type: "active" } }`, keeps the selected thread marked in progress.
- The live overlay renders default `Thinking` for any active selected thread, even before reasoning/activity text arrives.
- The stop button is visible while the turn is active and disappears after completion.

#### Rollback/Cleanup
- Stop the temporary Vite server if it was only used for this check.
- Remove temporary projectless chat folders under `~/Documents/Codex/<today>/` if they are no longer needed.

---
