### Feature: Thread heartbeat automations

#### Prerequisites
- App is running from this repository.
- At least one local thread exists in the sidebar.
- Local Codex home is writable (`$CODEX_HOME` or `~/.codex`).
- Light and dark themes are both available from Settings.

#### Steps
1. In light theme, open the sidebar thread menu for a thread without an attached automation.
2. Confirm the menu shows `Add automation…`.
3. Click `Add automation…`.
4. Fill name, prompt, RRULE schedule, and set status to `Paused`.
5. Save the automation and reopen the same thread menu.
6. Confirm the menu now shows `Manage automations…` and the thread row shows an automation chip.
7. Open `Manage automations…`, confirm the saved values are prefilled, then click `Add another automation`.
8. Fill a second automation with a different name and RRULE, save it, and confirm both automations appear in the dialog list.
9. Select each automation from the list and confirm its own prompt, RRULE, and status load independently.
10. Click `Run now` for one saved automation while the thread is idle and confirm the automation run is queued or starts in the selected thread.
11. Start a normal thread turn, reopen `Manage automations…`, click `Run now` for another saved automation, and confirm it waits in the queue until the active turn can finish.
12. Remove one automation and confirm the other remains attached to the same thread.
13. Switch to dark theme, reopen `Manage automations…`, and confirm the list, inputs, textarea, status select, `Run now`, and queued-run notice remain readable.
14. Select a thread that already contains automation runs and confirm both the automation prompt card and the assistant reply are visible.
15. Remove the final automation and confirm the thread menu returns to `Add automation…`.

#### Expected Results
- Multiple thread-scoped heartbeat automations can be created under the Codex automations store with the same `target_thread_id`.
- The automation manager is hosted from the thread menu and supports adding, selecting, editing, and removing individual automations.
- `Run now` enqueues the selected automation immediately using a Codex.app-style heartbeat payload with `automation_id`, `current_time_iso`, and `instructions`, without requiring a schedule tick.
- Automation heartbeat prompts render as visible user-side cards labeled `Sent via automation`; raw heartbeat XML is not shown.
- Manual runs use the existing thread queue, so they do not interrupt an active turn and run in order when the thread is available.
- Removing one automation does not remove other automations attached to the same thread.
- Removing the final automation removes the thread row automation chip and returns the menu to `Add automation…`.
- Light and dark theme automation manager surfaces remain readable.

#### Rollback/Cleanup
- Remove any test automations from the thread automation dialog or delete their folders under `$CODEX_HOME/automations/<automation-id>/`.
