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

### Feature: Project organization controller preserves rename, removal, and order

#### Prerequisites
- Dev server at `127.0.0.1:4173`.
- At least two visible workspace-root projects, each with a thread.

#### Steps
1. Rename one project and confirm its sidebar label updates immediately; wait at least 500 ms, reload, and confirm the label persists.
2. Move the second project above the first and reload; confirm the order persists.
3. Pin a project to the top and confirm its threads remain attached to the same project row.
4. Remove the currently selected project and confirm the first remaining thread becomes selected.
5. Reload and confirm the removed workspace root and its label/order entries do not reappear.

#### Expected Results
- Rename, reorder, pin, and removal behave exactly as before the controller extraction.
- Renaming emits at most one workspace-roots update after the 500 ms debounce window.
- Removing a project prunes its thread-scoped state, preserves remaining groups, and writes the same workspace-root order/active fallback.
- No duplicate thread-list or workspace-roots requests are introduced.

#### Rollback/Cleanup
- Restore any temporary project names and ordering, and re-add removed test roots if needed.
