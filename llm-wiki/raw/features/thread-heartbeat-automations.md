# Thread heartbeat automations source notes

Captured: 2026-05-09

## Scope

Thread heartbeat automations are local Codex automation records stored under `$CODEX_HOME/automations/<automation-id>/automation.toml`. Each record can attach to a chat thread through `target_thread_id`.

## Multiple automations per thread

The thread automation bridge supports multiple heartbeat automations with the same `target_thread_id`. Backend listing returns a map from thread id to an ordered automation array. Individual automation edit and delete operations use both `threadId` and `automationId`, so removing one automation does not remove the other automations attached to that thread.

The sidebar thread menu shows `Manage automations...` when at least one automation exists. The manager lists existing automations, lets the user select one for editing, and includes `Add another automation` to create an additional automation for the same thread.

## Manual run

The automation manager includes `Run now` for saved automations. The run endpoint validates the `threadId` and `automationId`, appends the saved automation prompt as a default-mode queued message for the target thread, and schedules the backend queue processor immediately.

Manual runs intentionally do not inject the raw `<heartbeat>` envelope into the queued message. That envelope is a renderer-specific marker in `codex-web-local`; Codex.app displays it as normal user text when it is written into thread history.

Manual runs use the persisted thread queue rather than directly interrupting or steering a turn. If the target thread is idle, the queue can start the automation turn immediately. If the thread is already running, the automation waits in queue order until the thread is available.

## Verification expectations

Manual verification should cover light and dark themes, multiple automations on one thread, selecting and editing each automation independently, `Run now` while idle, `Run now` while another turn is active, and cleanup of all test automations.
