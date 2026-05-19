### Lazy project Git status checks

#### Feature/Change Name
Project Git repository status is loaded lazily from project menus instead of scanning every visible project during startup.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. Sidebar contains multiple projects, including at least one Git-backed project and one non-Git project
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, load the home route and confirm the Projects section renders normally.
2. Open browser devtools or runtime profile output and confirm startup does not issue one `/codex-api/git/repository-status` request per visible project.
3. Open the action menu for a Git-backed project.
4. Confirm the menu remains readable and the `New worktree` item appears after the Git status check completes.
5. Right-click the header row for the same Git-backed project.
6. Confirm the context menu remains readable and the `New worktree` item appears after the Git status check completes.
7. Open the action menu for a non-Git project.
8. Confirm the menu remains readable and `New worktree` is not shown.
9. Switch to dark theme and repeat steps 3 through 8.

#### Expected Results
- Startup avoids eager Git status scans for all project rows.
- Opening a project menu through click or right-click still loads that project's Git status on demand.
- Menus re-measure placement after async Git status updates add the `New worktree` row.
- `New worktree` remains available for Git-backed projects and hidden for non-Git projects.
- Project menus remain usable and visually consistent in both light and dark themes.

#### Rollback/Cleanup
- None.

---
