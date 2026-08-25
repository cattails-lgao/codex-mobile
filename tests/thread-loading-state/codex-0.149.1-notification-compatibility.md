# Codex 0.149.1 Notification Compatibility

## Prerequisites

- Start the application with Codex CLI `0.149.1` available on `PATH`.
- Open a project thread and keep the browser developer tools network panel available.
- Install or edit a local skill that appears in the Skills list.

## Actions

1. Modify a watched local skill file and wait for the `skills/changed` notification.
2. Start or resume the same thread from another Codex client, then return to the browser and wait for `thread/status/changed`.
3. Run a turn that uses automatic approval review when the account and policy support it.
4. Cause an eligible model fallback, or inspect a session that emits `model/rerouted`.

## Expected Results

- The Skills list refreshes once using the active thread's current working directory.
- The selected thread refreshes asynchronously after its status changes; the page remains responsive and does not repeatedly reload its history.
- Auto-review notifications do not create error cards, duplicate messages, or approval panels without a user-facing request.
- Model-reroute notifications do not create duplicate messages or error state.

## Cleanup

- Restore the edited skill file if it was only changed for this test.
- Stop any secondary Codex client used to generate the external thread-status event.
