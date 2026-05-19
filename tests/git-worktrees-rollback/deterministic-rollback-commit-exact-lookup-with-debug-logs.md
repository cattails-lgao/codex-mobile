### Feature: Deterministic rollback commit + exact lookup with debug logs

#### Prerequisites
- App server is running from this repository.
- `worktree git automation` is enabled in UI settings.
- Test thread available where you can send at least 3 user turns.

#### Steps
1. Send a user turn that changes files and completes.
2. Send a user turn that produces no file edits and completes.
3. Send a third user turn and complete it.
4. In rollback git history (`.codex/rollbacks/.git`), verify each completed turn created a commit, including the no-edit turn.
5. Inspect one rollback commit body and confirm it contains the user message text plus `Rollback-User-Message-SHA256: <hash>`.
6. Trigger rollback to the second turn message via UI rollback action.
7. Verify server logs contain `[rollback-debug]` entries for lookup, stash (if dirty), reset, and completion.
8. Temporarily test missing-commit path by calling `/codex-api/worktree/rollback-to-message` with a non-existent message text.

#### Expected Results
- Auto-commit creates a rollback commit for every completed turn (`--allow-empty` behavior).
- Commit body includes the user message and stable hash trailer.
- Rollback uses exact hash-based commit lookup only.
- If exact commit is missing, rollback returns error and does not continue.
- Server logs include `[rollback-debug]` records for commit creation, lookup, stash, reset, and error paths.
- Browser console includes `[rollback-debug]` client-side start/success/error logs for auto-commit and rollback API calls.
- Rollback init no longer fails when `.codex` is ignored globally; init force-adds `.codex/.gitignore`.

#### Rollback/Cleanup
- Revert the changed files if you want previous non-deterministic behavior back.
