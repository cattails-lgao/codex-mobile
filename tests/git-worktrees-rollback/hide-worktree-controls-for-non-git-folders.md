### Hide worktree controls for non-Git folders

#### Feature/Change Name
Composer runtime options and project menu worktree actions are hidden when the selected folder is not a Git repository.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. One Git-backed project and one plain local folder without a `.git` directory are available in the folder picker/sidebar
3. Light theme and dark theme are available from the appearance switcher

#### Steps
1. In light theme, select the plain local folder in the new-thread composer.
2. Confirm the `Local project` / `New worktree` runtime toggle is not shown.
3. Confirm the first message can still be sent as a normal local-folder chat.
4. Select a Git-backed folder and confirm the runtime toggle appears again.
5. Open the project action menu for a non-Git project and confirm `New worktree` is not shown.
6. Open the project action menu for a Git-backed project and confirm `New worktree` is shown.
7. Switch to dark theme and repeat steps 1, 2, 4, 5, and 6.

#### Expected Results
- Non-Git folders do not show `Local project` or `New worktree` runtime options.
- Non-Git project menus do not show `New worktree`.
- Git-backed folders continue to expose the runtime toggle and worktree action.
- The hidden/visible states are consistent and readable in both light and dark themes.

#### Rollback/Cleanup
- Remove any disposable plain folder or test chats created for this validation.

---
