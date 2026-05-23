### Qodo review fixes for PR 130 and PR 131 reverts

#### Feature/Change Name
Fix review regressions from reverting PR #130 and PR #131.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Sidebar has multiple projects, including duplicate folder leaf names when available
3. Sidebar has at least one projectless chat
4. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, search the sidebar so the project list is filtered.
2. Try to drag a project row while search is active.
3. Confirm no project drag or reorder starts during the filtered search view.
4. Clear search and drag a project row, then release it and confirm the follow-up click does not collapse or expand the dragged project unexpectedly.
5. Open a project menu near the bottom of the scrollable sidebar and confirm the menu opens upward only when needed and stays within the visible sidebar boundary.
6. Open or create a project whose folder leaf name collides with another root and confirm the intended full-path-disambiguated project moves to the top.
7. Confirm projectless chats with empty cwd remain visible when workspace roots are configured.
8. Switch to dark theme and repeat steps 1-7.

#### Expected Results
- Project dragging is disabled during sidebar search.
- Drag completion does not trigger an accidental project collapse or expansion.
- Project menu direction uses the rendered menu height and avoids viewport/sidebar overflow.
- Duplicate folder leaf names use the disambiguated project order name.
- Empty-cwd projectless chats remain visible.
- Sidebar rows, menus, and drag states remain readable in light and dark themes.

#### Rollback/Cleanup
- None.

---
