### Feature: Rollback no longer fills composer input with rolled-back user text

#### Prerequisites
- App is running from this repository.
- Open any non-home thread with at least one completed user/assistant turn.
- Composer input is visible in the thread view.

#### Steps
1. In the selected thread, locate a message row with a visible rollback action (`.message-rollback-button` on a user message).
2. Click rollback, then confirm "Rollback this turn?" in the dialog.
3. Observe the composer input immediately after rollback completes.
4. Send a new message and confirm the conversation continues from the rolled-back turn.

#### Expected Results
- The thread rolls back: the selected turn and all later turns are removed from the conversation.
- The composer input is left untouched — it is NOT pre-filled with the rolled-back user message text (round-36 fix; previously the upstream "edit" flow appended the rolled-back text to the draft, which made the message reappear when the user sent again).
- If the composer already had a draft before the rollback, that draft text is preserved as-is.
- Sending a new message creates a fresh turn and the previously rolled-back messages do not reappear.

#### Rollback/Cleanup
- No cleanup required; rollback removes the turns server-side.
