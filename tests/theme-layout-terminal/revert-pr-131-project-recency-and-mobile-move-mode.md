### Revert PR 131 project recency and mobile move mode

#### Feature/Change Name
PR #131 revert: remove project recency ordering and mobile project move mode while preserving later sidebar actions.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has at least two projects and projectless chats
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open the sidebar Projects section.
2. Open the Projects organize menu.
3. Confirm the menu still exposes thread organization and chat sort controls, but does not expose project recency/manual sort controls.
4. Open a project action menu and confirm browse, rename, remove, worktree, and git status actions still behave normally.
5. On a mobile-sized viewport, confirm there is no project move mode affordance or drag handle from PR #131.
6. Switch to dark theme and repeat steps 1-5.

#### Expected Results
- Project recency/manual sort controls from PR #131 are absent.
- Project pinning/move mode controls from PR #131 are absent.
- Existing sidebar project actions and git-status menu behavior remain available.
- Sidebar rows, menus, and actions remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---
