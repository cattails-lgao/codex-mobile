### Feature: Pinned threads persist across reload and prune removed threads

#### Prerequisites
- App is running from this repository.
- At least two threads exist in the sidebar.

#### Steps
1. Pin two threads from the sidebar using the pin button.
2. Refresh the app page.
3. Confirm the same threads are still shown in the `Pinned` section and in the same order.
4. Archive one of the pinned threads from the thread menu.
5. Refresh the app page again.

#### Expected Results
- Pinned threads are restored after reload from Codex app global state (`~/.codex/.codex-global-state.json` key `thread-pinned-ids`).
- Pin order is preserved between reloads.
- Archived/removed pinned thread is automatically pruned and no stale pinned row remains.

#### Rollback/Cleanup
- Unpin test threads if needed.
- `skills/list` no longer sends every thread cwd in one request.
- Each `skills/list` call includes at most one cwd for the active thread context.
- Skills list still updates when changing selected thread.

#### Rollback/Cleanup
- No cleanup required.

---
