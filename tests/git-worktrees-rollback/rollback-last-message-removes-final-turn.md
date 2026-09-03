### Fix: Rolling back the last user message removes that turn instead of no-oping

#### Prerequisites
- App is running from this repository.
- A thread exists whose newest turn is a user message (e.g. a single-message thread, or a thread where the last reply has not arrived yet).

#### Steps
1. Open a thread where the last turn is a user message.
2. Click the rollback button (回退此消息) on that last user message.
3. Confirm the rollback dialog.
4. Observe the conversation after confirming.

#### Expected Results
- The last user message (and its turn) is removed after confirmation.
- For a single-message thread, the conversation shows the empty-thread state ("此线程还没有消息").
- No silent no-op: confirming always changes the thread when the target turn exists.
- Rolling back a middle turn still keeps the target turn and only removes later turns.

#### Rollback/Cleanup
- Revert the updated file if this behavior is not desired:
  - `src/composables/useDesktopState.ts`
