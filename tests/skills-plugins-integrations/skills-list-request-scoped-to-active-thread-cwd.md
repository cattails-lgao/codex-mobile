### Feature: Skills list request scoped to active thread cwd

#### Prerequisites
- App is running from this repository.
- Browser DevTools Network tab is open.
- At least two threads exist with different `cwd` values.

#### Steps
1. Reload the app and wait for initial data load.
2. In Network tab, inspect `/codex-api/rpc` requests with method `skills/list`.
3. Verify request params contain `cwds` with only the currently selected thread cwd.
4. Re-select the same thread within two seconds and confirm no duplicate `skills/list` request is sent.
5. Switch to another thread with a different cwd.
6. Inspect the next `skills/list` request and verify `cwds` now contains only the new selected thread cwd.
7. Trigger `Force Refresh Skills` from Skills Hub and confirm a new request is sent even when the active cwd has not changed.

#### Expected Results
- A normal refresh reuses the most recent successful result for the same cwd for up to two seconds.
- Changing cwd always requests the newly selected cwd, while a projectless thread omits `cwds`.
- Force refresh bypasses the recent-result cache.
- A failed refresh leaves the last successful installed-skills list visible.

#### Rollback/Cleanup
- No cleanup required.
