# Project cron automations source

Date: 2026-05-10

Project-scoped automations are represented as Codex cron automations with a `cwds` array containing the absolute project folder path. The sidebar resolves display labels such as `TestChat` to the real cwd before saving so the Codex scheduler can run in the intended project. Thread automations remain heartbeat automations keyed by `target_thread_id`.

Implementation facts:
- `src/server/codexAppServerBridge.ts` parses and serializes `cwds` in automation TOML records.
- `GET /codex-api/project-automations` returns project cron automations grouped by project cwd.
- `GET`, `PUT`, and `DELETE /codex-api/project-automation` read, save, and remove automations for one project cwd.
- `src/api/codexGateway.ts` exposes project automation helpers mirroring the thread automation helpers.
- `src/components/sidebar/SidebarThreadTree.vue` adds project menu `Add automation…` / `Manage automations…`, project row `Auto` chips, and reuses the existing automation dialog with project-specific copy.
- Project automations intentionally do not expose `Run now`; the existing manual run behavior remains thread-heartbeat-only.
