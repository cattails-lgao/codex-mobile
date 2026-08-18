# Composer control layout, collaboration mode menu, approval policy menu, and slash skill rows

Return to the [section index](index.md).

### Feature: Slash skill rows show a scope icon on the left and name + description on the right

#### Prerequisites
- Dev server on 4173 with a project that has at least one installed skill (user, repo, system, or plugin scope).

#### Steps
1. In the composer input, type `/` and scroll to the "Skills" group.
2. Inspect a skill row: there is a circular badge on the left showing a single-letter scope indicator (U for user, R for repo, S for system, P for plugin), colored per scope.
3. Confirm the skill name is shown in full to the right of the icon, with the description below it (description may be omitted when empty).
4. Confirm the right-side kind tag is no longer shown on skill rows.
5. Switch to dark theme and confirm the icon colors and name/description text remain readable.

#### Expected Results
- Each skill row has a left icon that visually distinguishes user vs repo vs system vs plugin scope.
- The skill name is never truncated; wrapping is used instead.
- No duplicate `kind` label on the right side of skill rows.
- Dark theme colors the icons and text consistently with the light theme.

#### Rollback/Cleanup
- None; refresh the page to clear any draft state.

### Feature: Composer submit button sits to the right of the input; voice buttons removed

#### Prerequisites
- Desktop and mobile viewports, dev server on 4173, an active thread.

#### Steps
1. Scroll to the composer. Confirm the input textarea fills the left side and the submit (arrow-up) button is vertically aligned at the right edge of the input box, not in a row below it.
2. While a turn is running (or a draft is queued), confirm the stop button replaces the submit button in the same right-edge position.
3. Confirm there is no microphone button and no realtime-voice button anywhere in the composer, and no voice bubble above the input.
4. On a 375px-wide viewport, confirm the input + submit still fit without horizontal overflow.

#### Expected Results
- The submit/stop control is attached to the right of the input box, aligned to the input bottom.
- No voice/dictation controls or voice bubbles are present.
- Responsive widths (375px, 768px) show the input row and control row without clipping.

#### Rollback/Cleanup
- None.

### Feature: Composer control row order and the three popovers (attach, plan mode, approval policy)

#### Prerequisites
- Desktop and mobile viewports, dev server on 4173, an active thread with a Codex backend.

#### Steps
1. Below the input row, confirm the control row order is: `+` (attach), Plan mode, Approval policy, Model, Thinking (model strength).
2. Click `+`. The popover lists "Add photos & files", "Add folder", "Take photo", then an "In-progress send" Steer/Queue switch. There are no Fast mode or Plan mode toggles in this popover.
3. Click Plan mode. The popover lists three choices: Default, Plan mode (with a "Agent proposes a plan before acting" sub-label), and Execution plans. Execution plans is disabled and shows "Not supported by this Codex version" when the backend does not advertise it.
4. Select "Plan mode"; the check mark moves to it and the selection persists after reopening the menu and after reload.
5. Click Approval policy. The popover lists "When Codex requests it", "Unless trusted", "Never". Clicking one saves the policy immediately (check mark moves).
6. Open the Plan mode menu and the Approval policy menu at the same time is not possible: opening one closes the other; clicking outside closes any open menu.
7. In dark theme, confirm the trigger chips, popover surfaces, disabled item hint, and check marks remain readable.

#### Expected Results
- Control order is exactly: attach, plan mode, approval policy, model, thinking.
- Attach popover has exactly the four listed items (three file actions + in-progress send), no mode toggles.
- Plan mode popover is a three-way radio (Default / Plan mode / Execution plans); ExecPlans is disabled with an explicit unsupported hint when the backend lacks it.
- Approval policy popover is a three-way radio that saves on click.
- The three menus are mutually exclusive and dismiss on outside click.
- Light and dark themes both render the menus legibly.
- Model trigger width is content-sized (`w-fit`): a short model name (e.g. `gpt-5`) leaves no fixed blank block, while a long name caps at 160px desktop / 128px H5 and ellipsizes; the H5 control row stays `flex-nowrap` with no horizontal overflow (`.thread-composer-controls` shows no `scrollWidth > clientWidth`).

#### Rollback/Cleanup
- Reset collaboration mode and approval policy by re-selecting the previous values in the two popovers.
