# Project Cron Automations

Project automations extend the existing sidebar automation UI from thread-scoped heartbeat records to project-scoped cron records.

## Storage

Project automations use Codex cron automation TOML records with `cwds = ["<absolute project path>"]`. Sidebar display labels must be resolved to the real project folder before saving, so folder-name rows such as `TestChat` still write the scheduler-visible cwd. This matches Codex's project/folder automation shape while preserving thread heartbeat records that use `target_thread_id`.

Source: [project-cron-automations.md](../../raw/features/project-cron-automations.md)

## UI

The sidebar project row dots menu exposes `Add automation…` or `Manage automations…`. The dialog reuses the thread automation manager style, including multiple automation selection, schedule presets, status, and remove/save behavior.

Project rows show the same compact automation icon when at least one project automation is attached. The top-level Automations panel lists both project cron automations and thread heartbeat automations together, sorted by next run and backed by the existing automation map endpoints.

Source: [project-cron-automations.md](../../raw/features/project-cron-automations.md)

## Boundaries

`Run now` remains available only for thread heartbeat automations because it queues a heartbeat message into a concrete thread. Project cron automations are scheduled against one or more working directories instead.

Source: [project-cron-automations.md](../../raw/features/project-cron-automations.md)
