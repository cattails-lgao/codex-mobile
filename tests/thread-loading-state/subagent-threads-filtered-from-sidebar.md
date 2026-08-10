# Subagent Threads Are Filtered From the Sidebar

Subagent sessions are materialized by the app-server with an interactive `source` (e.g. `cli`), so `thread/list` returns them alongside user threads. The bridge drops rows whose local `session_meta.thread_source` marks them as subagent, so the sidebar only shows user-facing threads.

#### Prerequisites
- `codexapp` running with a `CODEX_HOME` that contains at least one subagent session (a rollout file under `<CODEX_HOME>/sessions/**` whose `session_meta.payload.thread_source` is `subagent`, typically written by TUI/CLI multi-agent runs).
- The external-session tracker must be enabled (default on; do not set `CODEXUI_EXTERNAL_SESSION_TRACKING=0`).

#### Steps
1. Generate a subagent session, e.g. run a TUI/CLI multi-agent prompt in the same `CODEX_HOME` so a `thread_source=subagent` rollout file lands under `sessions/`.
2. Open the web UI and inspect the sidebar thread list under the project group.
3. Open the browser devtools network tab and inspect the `/codex-api/rpc` `thread/list` response.
4. Reload the page and re-check the sidebar.

#### Expected Results
- Step 2/4: the sidebar does not show rows for the subagent sessions; only user-owned threads appear.
- Step 3: the `thread/list` response `data` contains no subagent thread ids; a normal thread created in the same project is still present.
- Direct access still works: `thread/read` on a subagent thread id (e.g. from a deep link or search index) is unaffected.
- Subagent detection tolerates sessions whose `session_meta` has no `originator` (matched via `thread_source` alone).

#### Rollback/Cleanup
- There is no feature flag; to restore previous behavior, remove the subagent rows from `thread/list` handling in `codexAppServerBridge.ts` (`filterSubagentThreadsFromThreadListResult`).
- No app-server state is mutated; deleting the subagent rollout files removes them from the tracker index on the next poll.
