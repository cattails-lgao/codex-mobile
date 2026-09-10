### Feature: Model switch resets context window and appends a local divider (round-73)

#### Prerequisites
- App running from this repository against a Codex app-server / LiteLLM-backed endpoint (dev on `127.0.0.1:4173`).
- A thread that has already produced at least one turn, so it has a real `thread/tokenUsage/updated` event (a populated context window) and a seeded per-thread model.
- The composer model picker offers more than one model so you can switch.

#### Background
Two model-switch UX gaps were fixed in round-73:
1. Context window did not refresh after switching models — the value only comes from the
   app-server's `thread/tokenUsage/updated` notification, and switching models fires no such event.
   Now `invalidateThreadContextWindow` nulls the thread's `modelContextWindow` on switch, so the
   indicator enters a pending/empty state until the new model's first usage event arrives. It never
   shows a stale old-model window.
2. Switching models now appends a local-only divider message (`旧模型 → 新模型`) to the end of the
   message list. It is persisted to localStorage, does not touch the server, and is excluded from the
   turn grouping (process/final/plan/fold) pipeline.

#### Steps
1. Open a thread that already has a populated context window in its composer (token usage shown).
   Note the numeric context window.
2. In the composer model picker, switch this thread to a different model.
3. Observe the context indicator.

#### Expected Results
- Immediately after switching, the context window indicator is no longer showing the old model's
  number — it transitions to the pending/empty state (no numeric window) until the new model runs.
- A divider row `旧模型 → 新模型` appears at the end of the message list, styled as an independent
  strip. It does not appear inside any process/final/plan/folder section.
4. Send a message on the thread so the new model produces its first `thread/tokenUsage/updated` event.
   Confirm the context window repopulates with the new model's value.
5. Reload the page and reopen the thread. Confirm the divider row persists (localStorage
   `codex-web.local.thread-model-switch-markers.v1`) and still renders as its own strip, not inside a turn.

#### Rollback/Cleanup
- Reset any model you changed back to the thread's original selection if you don't want the switch to persist.
- Divider markers are local-only; deleting `${index}` localStorage key
  `codex-web.local.thread-model-switch-markers.v1` clears them.

#### Automated check
- `src/utils/modelSwitchMessages.test.ts` locks `isModelSwitchMessage` (2 cases).
- `src/composables/useDesktopState.test.ts` (93) and `src/utils/transcriptGrouping.test.ts` (33) pass;
  `vue-tsc --noEmit` clean.