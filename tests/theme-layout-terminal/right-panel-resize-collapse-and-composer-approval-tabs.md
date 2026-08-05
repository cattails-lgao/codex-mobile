# Right panel resize/collapse, composer approval policy tabs, skills chips, and slash skill names

Return to the [section index](index.md).

### Feature: Right panel is resizable and collapsible; Git is the only default tab

#### Prerequisites
- Desktop viewport (≥768px wide), dev server on 4173, an open project with a thread (so `canShowRightPanel` is true).
- Clear the `codex-web-local.right-panel-width.v1` localStorage key before starting.

#### Steps
1. Open a thread. The right panel shows the Git tab as the only header tab (no Terminal tab).
2. Drag the vertical resize handle on the left edge of the right panel left and right.
3. Release the drag, then reload the page (or re-navigate) and confirm the width persisted.
4. Click the header right-panel toggle (sidebar icon) to collapse the panel, then click it again to reopen.
5. Click the `+` button in the panel header and choose "Terminal panel"; the Terminal view opens and the panel is active.
6. With the terminal open, click the `×` close button in the panel header; the panel collapses on desktop.
7. Reopen the panel and confirm the active tab is still the one selected before closing.

#### Expected Results
- Only the Git tab is visible by default; the Terminal tab is added only through the `+` menu.
- Dragging the resize handle changes the panel width between the min (260px) and max (640px) bounds, with no layout overlap.
- The width is persisted across reloads.
- The header toggle collapses and reopens the panel; the `×` button also collapses it on desktop and closes it on mobile.
- Reopening restores the previously active tab without breaking the terminal focus state.

#### Rollback/Cleanup
- Reset width: `localStorage.removeItem('codex-web-local.right-panel-width.v1')`.

### Feature: Approval policy tabs below the composer input

> Superseded: the four-tab approval row was replaced by the three-way Approval policy popover (see [Composer control layout, collaboration mode menu, approval policy menu, and slash skill rows](composer-control-layout-and-collaboration-mode-menu.md)).

### Feature: Skill chips above the composer input and full skill names in the slash menu

#### Prerequisites
- Dev server on 4173 with a project that has at least one installed skill (user, repo, system, or plugin scope).

#### Steps
1. In the composer input, type `/` and select a skill from the "Skills" group.
2. Confirm a green skill chip appears above the input box showing the skill display name, with an `×` to remove it and a clickable name that opens the skill's SKILL.md in a new tab.
3. Type `/` again and verify the Skills group lists the full skill names without truncation, including system-scoped skills that share a name with a user/repo skill.
4. Remove the chip with `×` and confirm the skill is no longer attached (draft can be sent without it).
5. In dark theme, confirm the chips and the slash menu rows remain readable.

#### Expected Results
- Selecting a skill from the slash menu shows a chip above the input immediately (selected feedback).
- Skill names in the slash menu are displayed in full; wrapping is used instead of ellipsis truncation.
- System-scoped skills appear in the Skills group even when another skill has the same normalized name.
- Removing the chip detaches the skill from the next message.

#### Rollback/Cleanup
- None; refresh the page to clear any draft state.
