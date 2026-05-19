### Project menu permanent worktree action

#### Feature/Change Name
Project rows open the same action menu from right-click and the dots button, and can create a permanent sibling Git worktree as a new project.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has at least one Git-backed project
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, click the project row dots button.
2. Verify the menu shows `Browse files`, `New worktree`, `Rename project`, and `Remove`.
3. Close the menu, then right-click the same project row.
4. Verify the same menu opens.
5. Click `Browse files` and confirm the local file browser opens for the project cwd.
6. Reopen the project menu, click `Rename project`, and confirm the inline project name input still works.
7. Reopen the project menu, click `New worktree`, and confirm the prompt is prefilled with `<project name>-`.
8. Enter a unique folder name such as `<project name>-manual-test`.
9. Confirm a Git worktree is created at `../<worktree name>` relative to the source repo root.
10. Run `git -C ../<worktree name> branch --show-current` and confirm it prints a branch based on the worktree folder name.
11. Confirm the new worktree is added as a project and the app opens the new-chat composer with that cwd selected.
12. Rename the project to include a slash, reopen `New worktree`, and confirm the suggested folder name replaces the slash with `-`.
13. Switch to dark theme and repeat steps 1-4, verifying menu contrast and danger styling remain readable.

#### Expected Results
- Right-click and dots button expose the same project action menu.
- `Browse files`, `Rename project`, and `Remove` remain available from that menu.
- `New worktree` creates a permanent sibling worktree folder on its own branch, registers it as a project, and opens a new chat for it.
- Invalid path separator characters are not used in the default worktree folder suggestion.
- Menu text, hover states, and the remove action remain readable in light and dark themes.

#### Rollback/Cleanup
- Remove the test worktree with `git -C <source-repo-root> worktree remove ../<worktree name>`.
- Delete the test branch with `git -C <source-repo-root> branch -D <branch name>`.
- Remove the temporary project from the sidebar if it remains listed.

---
