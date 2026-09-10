### Feature: Rollback works on both legacy and paginated threads (round-74)

#### Prerequisites
- App running from this repository against a Codex app-server that supports paginated history
  (codex app-server >= 0.148, the rolled-out `history_mode = paginated` store). Dev on `127.0.0.1:4173`.
- Two threads available:
  - a **legacy** thread (created before ~2026-08-20, `history_mode = legacy`), and
  - a **paginated** thread (created after ~2026-08-20, `history_mode = paginated`, i.e. virtually
    every thread created after the app-server 0.148 rollout).
- The paginated thread must have at least two user turns so a mid-history rollback is meaningful.

#### Background
`thread/rollback {numTurns}` works only for legacy history. Paginated history must use
`thread/revert {threadId, beforeTurnId}`.

Round-73 wired a naive fallback: it called `thread/rollback` first, caught the
`not support thread/rollback` error, then degraded to `thread/revert` — and consumed the always-empty
`thread.turns` of the revert response as the new message list. That left two defects:

1. Every paginated rollback produced a deliberate, guaranteed-to-fail `thread/rollback` probe
   (`POST /codex-api/rpc` → HTTP 502, `{"error":"paginated threads do not support thread/rollback"}`).
2. `thread/revert` returns `turns: []` (metadata-only; retained history must be hydrated via
   `thread/turns/list`), so the client cleared the list and then full-reloaded it — a visible refresh.

Round-74 fixes both at the root:
- The client now reads `selectedThread.historyMode` **once** (`'paginated' | 'legacy'`, default `legacy`)
  and branches directly to `thread/revert` (paginated) or `thread/rollback` (legacy), eliminating the
  probe request and its 502 entirely.
- `revertThread` no longer normalizes the revert response. It reads the returned `turnsBackwardsCursor`
  and incrementally hydrates the truncated history via `thread/turns/list`
  (`desc` / limit 200 / `itemsView full`), so only the retained prefix is loaded — no full reload.
- Bridge `THREAD_METHODS_WITH_TURNS` now includes `thread/revert` so its response is trimmed/inlined/
  session-merged like other turn-bearing methods (harmless no-op on the empty `turns`).

File revert runs only after the conversation revert succeeds, and a file-revert error is surfaced as a
console warning instead of being silently dropped.

#### Steps
1. Open a **paginated** thread that has 2+ user turns. Pick an earlier user turn (not the newest).
2. Open DevTools → Network and note requests for subsequent steps.
3. Click Rollback on that earlier user turn and confirm.
4. Verify in the Network tab that no `POST /codex-api/rpc` returns **502** during the rollback
   (before round-74 there was a guaranteed 502 probe; now there should only be 200s).
5. Verify the message list removes that turn and everything after it **without** a large full-reload
   pattern (no 「先小后大」pair like a small revert response immediately followed by a huge re-fetch).
6. Repeat step 1, 3-5 on the **legacy** thread (any older user turn).

#### Expected Results
- Paginated thread: the target user turn and all later turns disappear and are no longer in the list;
  no 502 probe request; no full-list refresh.
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
- `src/composables/useDesktopState.test.ts` includes the round-73/round-74 cases:
  - branches to `thread/revert` when `historyMode === 'paginated'`;
  - branches to `thread/rollback` when `historyMode === 'legacy'` (or undefined);
  - re-applies the truncated message list after a successful revert.
- `src/api/gateway/threads.ts` exposes `revertThread(threadId, beforeTurnId)` using the revert
  `turnsBackwardsCursor` + `thread/turns/list` incremental hydration.
- Type-check (`vue-tsc --noEmit`) clean.