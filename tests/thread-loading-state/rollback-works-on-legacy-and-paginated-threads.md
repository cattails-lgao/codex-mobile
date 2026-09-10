### Feature: Rollback works on both legacy and paginated threads (round-73)

#### Prerequisites
- App running from this repository against a Codex app-server that supports paginated history
  (codex app-server >= 0.148, the rolled-out `history_mode = paginated` store). Dev on `127.0.0.1:4173`.
- Two threads available:
  - a **legacy** thread (created before ~2026-08-20, `history_mode = legacy`), and
  - a **paginated** thread (created after ~2026-08-20, `history_mode = paginated`, i.e. virtually
    every thread created after the app-server 0.148 rollout).
- The paginated thread must have at least two user turns so a mid-history rollback is meaningful.

#### Background
Before this fix, clicking Rollback on any paginated thread did nothing and showed no error. The server
rejects `POST /codex-api/rpc` with `{"error":"paginated threads do not support thread/rollback"}`
(HTTP 502 through nginx), and the client only wrote `error.value` without reapplying the message list —
so the reverted messages stayed on screen and the list appeared frozen.

Root cause: `thread/rollback {numTurns}` works only for legacy history. Paginated history must use
`thread/revert {threadId, beforeTurnId}`. The bridge now calls `thread/rollback` first and, when it
sees the `not support thread/rollback` error, falls back to `thread/revert` using the target turn id.
File revert runs only after the conversation revert succeeds, and a file-revert error is surfaced as a
console warning instead of being silently dropped.

#### Steps
1. Open a **paginated** thread that has 2+ user turns. Pick an earlier user turn (not the newest).
2. Click Rollback on that earlier user turn and confirm.
3. Verify the message list now removes that turn and everything after it.
4. Repeat step 1-2 on the **legacy** thread (any older user turn).

#### Expected Results
- Paginated thread: the target user turn and all later turns disappear and are no longer in the list.
- Legacy thread: the same behavior (the `thread/rollback` + `numTurns` path still applies).
- No in-chat error toast on a successful rollback.
- If a rollback genuinely fails (e.g. non-server issue), an error message appears instead of silently
  leaving the list unchanged.

#### Rollback/Cleanup
- Rollback is destructive to the conversation prefix in the server's history store. Use a scratch
  thread (or a low-value thread) for the paginated case, and verify afterwards by re-opening it.
- File revert failures only emit a `console.warn` — check DevTools Console if you expect file changes
  to be undone and they are not.

#### Automated check
- `src/composables/useDesktopState.test.ts` includes the round-73 cases:
  - falls back to `thread/revert` when paginated history rejects `thread/rollback`;
  - does not fall back when the rollback error is unrelated.
- `src/api/gateway/threads.ts` exposes `revertThread(threadId, beforeTurnId)`.
- Type-check (`vue-tsc --noEmit`) clean.