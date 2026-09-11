# Sidebar Deduplicates Paginated Thread Segments

A single paginated thread can appear as multiple sidebar rows. Each `thread/revert` opens a new rollout segment that points back at its prefix via `session_meta.history_base` instead of rewriting the original file, and the app-server builds `thread/list` by scanning the sessions directory — so one logical thread (one row in `state_*.sqlite`, where `id` is the primary key) surfaces as one `thread/list` row per segment.

Fixed at the bridge: `dedupeThreadListByIdKeepNewest` in `rpcPipeline.ts` collapses rows that share a thread id into the segment with the greatest `updatedAt` (that matches the persisted `rollout_path`), keeping every row in its first-seen position. Only relevant to `thread/list`; legacy threads (single append-only rollout file) never repeat.

#### Prerequisites
- `codexapp` running against a `CODEX_HOME` whose `sessions/**` contains at least one paginated thread that has been rolled back one or more times (each rollback leaves an extra `rollout-*.jsonl` segment carrying `session_meta.payload.history_base.thread_id` equal to the same thread id).
- A paginated thread's `thread/list` row reports `historyMode: "paginated"`; legacy threads report `"legacy"`.

#### Steps
1. Produce duplicate rows, e.g. roll back a paginated thread several times from the UI, or point `CODEX_HOME` at a home that already contains multi-segment rollouts.
2. Open the web UI and inspect the sidebar thread list.
3. Open browser devtools, find the `/codex-api/rpc` `thread/list` request, and count rows vs unique `id`s in `response.data`.
4. Reload the page and re-check the sidebar.
5. Open a legacy thread (never reverted) and confirm it is unaffected.

#### Expected Results
- Step 2/4: every thread renders exactly once; no row is duplicated and the browser console has no Vue duplicate-key warning.
- Step 3: `response.data.length` equals the number of unique `id`s. For a thread that was reverted, the surviving row's `path`/`rollout_path` points at the newest segment (the one `state_*.sqlite` records), not an older segment.
- Row order is stable: a deduped thread stays at the position of its first occurrence rather than jumping.
- Step 5: legacy threads are untouched; a list whose ids are already unique is returned byte-identical (same object), so no unrelated rows are rewritten.
- Rows without a usable `id` are passed through unchanged.

#### Where this is covered
- Bridge unit tests in `src/server/bridge/rpcPipeline.test.ts` — duplicate ids collapse to the newest segment while keeping first-seen order; id-less rows pass through; an all-unique list is returned by reference (`toBe`).
- Frontend fallback `dedupeThreadGroupsById` (`src/utils/threadGroups.ts`) is covered by `src/utils/threadGroups.test.ts`; `SidebarThreadTree.vue` dedupes `props.groups` once before the tree, chronological, pinned, and chat views render, so a bridge regression still cannot render the same key twice.

#### Rollback/Cleanup
- No feature flag. To restore the previous behavior, remove the `dedupeThreadListByIdKeepNewest` step from `runRpcResponsePipeline` and the `dedupedGroups` computed in `SidebarThreadTree.vue`.
- No app-server or `state_*.sqlite` state is mutated; deleting the extra rollout segments removes the duplicates at the source.
