### Fix: Rolling back a message removes that turn (and everything after it) instead of no-oping

#### Prerequisites
- App is running from this repository.
- A thread exists with at least one turn (user message + reply).

#### Steps
1. Open a thread with two or more turns.
2. Click the rollback button (回退此消息) on the first (or a middle) user message.
3. Confirm the rollback dialog.
4. Observe the conversation after confirming.
5. Repeat on a thread whose last turn is a user message (e.g. a single-message thread).

#### Expected Results
- Rolling back a middle/early turn removes the target turn AND all later turns; the target message no longer appears in the list.
- Rolling back the last user message removes that turn (no silent no-op).
- For a single-message thread, the conversation shows the empty-thread state ("此线程还没有消息").
- The rolled-back user message text is backfilled into the composer for editing/resending.
- Confirming always changes the thread when the target turn exists.

#### Rollback/Cleanup
- Revert the updated file if this behavior is not desired:
  - `src/composables/useDesktopState.ts`
