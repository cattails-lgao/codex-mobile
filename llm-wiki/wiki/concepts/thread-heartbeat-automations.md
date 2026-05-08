# Thread Heartbeat Automations

Thread heartbeat automations are local Codex automation records stored under `$CODEX_HOME/automations/<automation-id>/automation.toml`. The web bridge reads those records and attaches them to sidebar threads by `target_thread_id`.

Source: [thread-heartbeat-automations.md](../../raw/features/thread-heartbeat-automations.md)

## Model

- A single thread can have multiple heartbeat automations.
- The bridge exposes automations as `threadId -> automation[]`, ordered by creation time and id.
- Edit and delete operations identify a specific automation with both `threadId` and `automationId`.
- Deleting a thread removes all automations attached to that thread, while deleting one automation from the manager leaves sibling automations intact.

## Sidebar UI

The thread overflow menu shows `Add automation...` when no automation is attached and `Manage automations...` when one or more automations exist. The manager lists saved automations, supports selecting one automation for editing, and exposes `Add another automation` for creating another record with the same `target_thread_id`.

## Run Now

Saved automations have a `Run now` action. The backend validates the selected automation, appends a Codex.app-style heartbeat payload to the persisted thread queue, and schedules immediate queue drain.

This keeps manual runs aligned with normal thread behavior: an idle thread can start the run immediately, while a busy thread receives the automation run as a queued turn instead of being interrupted.

Manual run heartbeat payloads include `automation_id`, `current_time_iso`, and `instructions`, matching the fields Codex.app requires for heartbeat user-message parsing. Incomplete heartbeat payloads remain normal text instead of being labeled as automation runs.

## Testing

Regression coverage should verify multiple automations on one thread, independent edit/remove behavior, idle `Run now`, busy-thread queued `Run now`, and readable light/dark theme states.
