### Feature: Thread item parity — commands and file changes come from the persisted read path

Item fidelity on the two live read paths — `thread/read` or `thread/resume` over `/codex-api/rpc`, and `/codex-api/thread-turn-page`: command executions and file changes are recovered from the session log and interleaved chronologically with agent messages, instead of being appended at the end or synthesised from assistant text.

Do not test this through `GET /codex-api/thread-live-state` or `GET /codex-api/thread-stream-events`. Both routes still exist server-side but have **zero client callers** — audited 2026-09-15, they are not referenced anywhere under `src/` and do not appear in the built `dist/assets` bundle. The client hydrates through `/codex-api/rpc` and pages through `/codex-api/thread-turn-page`.

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- A thread with more than 10 turns that contains both shell commands and file edits, so the recovery can also be observed inside a paged slice.

#### Steps
1. Open the long thread. In DevTools Network, confirm thread hydration is `POST /codex-api/rpc` with method `thread/read` (or `thread/resume`), not `GET /codex-api/thread-live-state`.
2. Confirm that request returns at most the newest 10 turns plus a non-zero `threadTurnStartIndex`, and that no request during the load goes to `thread-live-state` or `thread-stream-events`. Seeing either one means a regression re-introduced the retired stream-first path.
3. Replay the read: `POST /codex-api/rpc` with body `{"jsonrpc":"2.0","method":"thread/read","params":{"threadId":"<id>","includeTurns":true},"id":1}` and inspect `result.thread.turns[*].items`.
4. Confirm `commandExecution` items carry `command`, `status` and `aggregatedOutput`, recovered from the session log rather than only from the app-server turn payload.
5. Confirm `fileChange` items carry `changes[].path`, `changes[].operation` and `changes[].diff`, sourced from the `apply_patch` entries in the session log.
6. Confirm commands and file changes are interleaved chronologically with `agentMessage` items — not all commands grouped at the start or end of a turn.
7. Confirm no `fileChange` item was synthesised out of assistant message text: every item type present is one the backend persists.
8. Start a new turn and run a command. Confirm the live `commandExecution` item carries a `turnId` matching the active turn, so it stays scoped to that turn instead of attaching to a previous one.
9. Click **Load earlier messages** and confirm the older batch arrives from `GET /codex-api/thread-turn-page?threadId=<id>&beforeTurnId=<id>&limit=10`. Repeat steps 3-7 on that batch to confirm the recovery also applies to paged slices.

#### Expected Results
- Thread hydration is served by `thread/read` or `thread/resume` over `/codex-api/rpc`; `thread-live-state` and `thread-stream-events` are never requested by the client.
- Command executions and file changes are recovered from the session log and interleaved chronologically with agent messages in correct order.
- Item types are limited to what the backend persists (`userMessage`, `agentMessage`, `commandExecution`, `fileChange`, …) with no heuristic injection from assistant text.
- Live command executions during an active turn include `turnId` for strict turn scoping.
- The same item fidelity holds for turns delivered by `/codex-api/thread-turn-page`, i.e. for turns older than the newest 10.

#### Rollback/Cleanup
- None.

