### Feature: Model switch resets context window and renders an anchored local divider (round-73 / round-74)

#### Prerequisites
- App running from this repository against a Codex app-server / LiteLLM-backed endpoint (dev on `127.0.0.1:4173`).
- A thread that has already produced at least one turn, so it has a real `thread/tokenUsage/updated` event (a populated context window) and a seeded per-thread model.
- The composer model picker offers more than one model so you can switch.

#### Background
Three model-switch UX fixes:
1. Context window did not refresh after switching models — the value only comes from the
   app-server's `thread/tokenUsage/updated` notification, and switching models fires no such event.
   Now `invalidateThreadContextWindow` nulls the thread's `modelContextWindow` on switch, so the
   indicator enters a pending/empty state until the new model's first usage event arrives. It never
   shows a stale old-model window.
2. Switching models injects a local-only divider message (`旧模型 → 新模型`). It is persisted to
   localStorage, does not touch the server, and is excluded from the turn grouping
   (process/final/plan/fold) pipeline.
3. (round-74) The divider is anchored to the real message that was last when the switch happened,
   instead of being fixed at the list tail. It stays between the turn at switch time and any newer
   turns. Switching again with no new turn updates the existing last divider instead of appending a
   duplicate. New messages sent after the switch correctly arrive after the divider.

#### Steps
1. Open a thread that already has a populated context window in its composer (token usage shown).
   Note the numeric context window.
2. In the composer model picker, switch this thread to a different model.
3. Observe the context indicator.

#### Expected Results
- Immediately after switching, the context window indicator is no longer showing the old model's
  number — it transitions to the pending/empty state (no numeric window) until the new model runs.
- A divider row `旧模型 → 新模型` appears in the message list at the switch position (after the turn
  that was active when you switched), styled as an independent centered strip with separator lines.
  It does not appear inside any process/final/plan/folder section and is never pinned to the tail.
- Switching again before sending a message updates the same last divider (`→ 新模型2`), it does not
  create a second duplicate divider.
4. Send a message on the thread so the new model produces its first `thread/tokenUsage/updated` event.
   Confirm the context window repopulates with the new model's value, and the new user/assistant turn
   renders below the divider (not above or merged into the previous turn).
5. Reload the page and reopen the thread. Confirm the divider row persists (localStorage
   `codex-web.local.thread-model-switch-markers.v1`) and still renders at the anchored position, not
   inside a turn and not at the tail.

#### Rollback/Cleanup
- Reset any model you changed back to the thread's original selection if you don't want the switch to persist.
- Divider markers are local-only; deleting the localStorage key
  `codex-web.local.thread-model-switch-markers.v1` (array entry for the thread under test) clears them.

#### Automated check
- `src/utils/modelSwitchMessages.test.ts` locks `isModelSwitchMessage` (2 cases).
- `src/composables/model-switch-insert.test.ts` (4) locks `insertModelSwitchMarkers` anchoring.
- `src/composables/useDesktopState.test.ts` (95) passes; `vue-tsc --noEmit` clean.