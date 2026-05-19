### Feature: Thread stream parity — stream-first hydration with full turn history

#### Prerequisites
- App is running from this repository (`pnpm run dev`).
- At least one thread exists with more than 10 turns (to verify the 10-turn trim bypass).

#### Steps
1. Open a long thread (>10 turns) in the UI.
2. Open DevTools Network tab and inspect the outgoing requests.
3. Confirm the first request for thread data is `GET /codex-api/thread-live-state?threadId=...` (not `POST /codex-api/rpc` with `thread/read`).
4. Inspect the response JSON and confirm `conversationState.turns` contains ALL turns (not trimmed to 10).
5. Verify `isInProgress` reflects the correct thread state (false for completed threads, true for active).
6. Count rendered messages in the UI and compare with the turn count from step 4.
7. Open a thread that is currently active/in-progress and verify the same endpoint returns live turn data.
8. Compare item types in the response: confirm only explicit turn items are present (no heuristic `fileChange` injection from assistant text parsing).
9. Open DevTools and call `fetch('/codex-api/thread-stream-events?threadId=<id>&limit=50').then(r=>r.json()).then(console.log)` and verify the endpoint returns `{ events: [...] }` structure.
10. Simulate a live-state endpoint failure (e.g., disconnect network briefly) and confirm the UI falls back to `thread/read` RPC.

#### Expected Results
- Thread detail loading uses `/codex-api/thread-live-state` as the primary data source.
- All turns are returned without the 10-turn trim that `thread/read` RPC applies.
- Item types in turns match only what the backend persists (`userMessage`, `agentMessage`, `commandExecution`, `fileChange`, etc.) — no heuristic injection.
- `thread/read` RPC is used only as a fallback when the live-state endpoint fails.
- Stream events endpoint returns buffered notification frames for active threads.
- Live command executions during an active turn include `turnId` for strict turn scoping.
- Command execution items are recovered from the session log for old/completed threads.
- Commands are interleaved with agent messages in correct chronological order (not appended at end).
- File change items (from `apply_patch` tool calls) are recovered from the session log with diff data and `kind.type` format.

#### Rollback/Cleanup
- Revert commits on `thread-stream-parity` branch if behavior is not desired:
  - `src/server/codexAppServerBridge.ts` (stream endpoints + notification buffering)
  - `src/api/codexGateway.ts` (stream-first hydration)
  - `src/api/normalizers/v2.ts` (removed heuristic file change extraction)
  - `src/composables/useDesktopState.ts` (strict turn scoping on live commands)
