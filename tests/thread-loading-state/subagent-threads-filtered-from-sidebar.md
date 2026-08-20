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

#### Filtering is immediate and survives refresh
- The bridge forces a fresh tracker scan before applying the `thread/list` filter (`externalSessionTracker.tick()` awaited in `codexAppServerBridge.ts`), so a subagent session that lands on disk just before the request is already excluded — no need to wait for the tracker's 3s poll.
- The sidebar thread list treats each `thread/list` response as authoritative on refresh: `useDesktopState.ts` replaces `loadedThreadListGroups` instead of union-merging it with the previous snapshot. A subagent thread that was visible in an earlier load disappears on the next load once the server stops returning it.
- Expected: with the web UI already open, spawn a subagent session while observing the sidebar; the subagent row never appears (or disappears on the next thread-list refresh) and no row lingers after a page reload.

#### Subagent use `session_id` == parent thread id (own `id` is the filtered id)
- In subagent rollouts, `session_meta.payload.session_id` holds the **parent** thread id and `payload.id` holds the subagent's **own** thread id — the one the app-server materializes in `thread/list` (the TUI's own `rollout-*` files use both fields equal). The tracker keys subagent threads by `payload.id`; the sidebar filter therefore removes the subagent's own row and never the parent's.
- Expected: after spawning a subagent (e.g. a TUI/CLI multi-agent prompt), the sidebar keeps the parent thread row and hides the subagent row; the parent's `thread/read` still opens normally. A TUI subagent's "working" overlay attaches to the subagent's own row.
- This scenario is covered by unit tests in `externalSessionTracker.test.ts` (`id` differs from `session_id`; parent + subagent sharing one parent id are both kept).

#### Rollback/Cleanup
- There is no feature flag; to restore previous behavior, revert the subagent keying in `externalSessionTracker.ts` (`updateSessionMeta` ignores `session_id` for subagent rollouts) and the `thread/list` filtering in `codexAppServerBridge.ts` (`filterThreadListByIds`).
- No app-server state is mutated; deleting the subagent rollout files removes them from the tracker index on the next poll.
