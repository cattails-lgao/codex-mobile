### Project worktree threads under canonical project

#### Feature/Change Name
Managed worktree threads remain visible under their matching canonical workspace-root project, and path-like project tooltips expose the full path.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Codex global workspace roots include `/Users/igor/Git-projects/codex-web-local`
3. Thread history contains at least one thread whose cwd is under `/Users/igor/.codex/worktrees/*/codex-web-local`
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Projects section.
2. Scroll to the `codex-web-local` project.
3. Confirm the project includes the main-root thread and managed worktree threads.
4. Confirm worktree rows still show the worktree icon.
5. Confirm unrelated `.git/worktrees` rows with the same leaf folder name are not grouped into this project.
6. Hover any shortened path-like duplicate project title and confirm the tooltip shows the full project path, not only the friendly label.
7. Switch to dark theme and repeat steps 1-6.

#### Expected Results
- Managed worktree threads with the same leaf folder name are not split into hidden path-like project groups.
- Generic `.git/worktrees` rows are not treated as managed Codex worktrees for project-root grouping.
- The canonical `codex-web-local` project shows both main-root and worktree threads.
- Path-like project tooltips expose the full project path.
- Project rows and worktree icons remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---
