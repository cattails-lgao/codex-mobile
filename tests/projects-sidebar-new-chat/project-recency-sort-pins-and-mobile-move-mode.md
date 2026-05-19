### Feature: Project recency sort, pins, and mobile move mode

#### Prerequisites
- App is running from this repository on `feature/project-recency-sort-upstream`.
- At least two visible projects exist with threads updated at different times.
- Light and dark themes are both available from Settings.

#### Steps
1. Open the sidebar in light theme.
2. Open Projects -> Organize and confirm `Recent projects` is selected by default.
3. Confirm projects appear in descending recent thread activity order.
4. Tap the Projects header reorder icon and confirm move mode starts, all current project thread lists collapse, and drag handles are visible.
5. Drag a non-top project above the first project while still in recent mode.
6. Confirm the moved project appears in the pinned prefix, recent mode remains selected, and project threads do not expand from the drag release.
7. Tap `Done`, open the moved project's menu, choose `Unpin project`, and confirm it returns to its recency-derived position.
8. Switch to `Manual project order`, drag a project, and confirm the manual order sticks independently of recent-mode pins.
9. Enter sidebar search text and confirm project move mode/dragging cannot start while the project list is filtered.
10. Repeat steps 1-9 in dark theme.

#### Expected Results
- Recent mode ignores saved manual `projectOrder` except for explicit pinned project overrides.
- Recent-mode drags pin the moved project without switching the persisted sort mode to manual.
- Recent-mode drag and pin actions update only the pinned project override list and do not rewrite saved manual order.
- Unpinning removes the override and restores the project to recency order.
- Manual project order remains a separate full-list ordering mode.
- Move mode collapses project thread lists, restores prior expansion state on exit, and is blocked while search filters the sidebar.
- Reorder icon, `Done`, drag handles, pin labels, and menus remain readable in light and dark themes.

#### Rollback/Cleanup
- Tap `Done` to leave move mode.
- Reset the sidebar Organize menu to the preferred project sort mode.
- Remove any temporary chats or workspace roots created for verification.
