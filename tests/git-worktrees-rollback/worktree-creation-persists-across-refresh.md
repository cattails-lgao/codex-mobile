### Worktree creation persists across refresh

#### Feature/Change Name
Newly created temporary and permanent worktrees are persisted in workspace roots so their threads remain visible after a full browser refresh.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. A Git-backed workspace root is registered and selected in the Start new thread screen
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open Start new thread for the Git-backed workspace root.
2. Select `New worktree`, send a unique first prompt, and wait for the thread page to open.
3. Note the created worktree path from the selected folder or thread metadata.
4. Refresh the browser tab.
5. Confirm the new worktree-backed project/thread remains visible in the sidebar and can be opened.
6. Open the project action menu for the original Git-backed project and create a permanent named worktree.
7. Confirm the permanent worktree appears in the folder/project list, then refresh the browser tab.
8. Confirm the permanent worktree remains visible after refresh.
9. Switch to dark theme and repeat steps 1 through 5 with a second unique temporary worktree prompt.

#### Expected Results
- Temporary worktree creation writes the new worktree cwd to persisted workspace roots.
- Permanent worktree creation writes the new worktree cwd to persisted workspace roots.
- Full page refresh does not hide the newly created worktree project or its thread.
- The same behavior works in light theme and dark theme.
- If workspace-root persistence fails after `git worktree add`, the request fails cleanly and best-effort rollback removes the created worktree instead of leaving retry-prone orphaned worktrees.

#### Rollback/Cleanup
- Remove temporary test worktrees with `git worktree remove --force <worktree-path>`.
- Delete any empty temporary parent directory left under `$CODEX_HOME/worktrees/<id>`.
- Remove permanent test worktrees with `git worktree remove --force <worktree-path>` and delete their test branch if needed.

---
