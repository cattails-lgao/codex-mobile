# Work-step blocks, inline file changes, and separated work summaries

Feature work for requirement 6: message rendering restructured to the trae-work work-process style. Commands render as standalone work blocks (step dot + command + status label, output inside the block, click to expand), worked details are flattened with continuous step numbers, file changes stay as cards but are shown inline in the work area with `+`/`M` badges, and the worked summary text renders as an independent paragraph after the work blocks.

## Feature: Command messages render as work blocks

#### Prerequisites
- Dev server running at `127.0.0.1:4173`
- A thread whose history contains `commandExecution` messages (a turn that ran commands)

#### Steps
1. Open the thread with command history.
2. Confirm each command renders as a `.work-block` row with a leading `.work-step-dot` showing a continuous step number (1, 2, 3, …).
3. Confirm the header shows a stable localized `Command` label (命令 in Simplified Chinese) next to the step dot, with the status label on the right showing `✓ Done` for successful commands, `✗ Failed` for failed ones, and `Running` with a spinner for an in-progress command; the concrete shell command no longer appears in the header.
4. Click the block header (not a separate chevron) and confirm the output expands below inside the same block; the first line of the expanded panel is the exact command (`.work-block-output-command`, sky text with a divider), followed by the command output; click again to collapse.
5. Confirm the previous `cmd-step-index` badge and `worked-separator` expander no longer appear for command rows.

#### Expected Results
- Commands are visually distinct work steps with continuous numbering, matching the trae-work work-process style.
- Collapsed rows read `sequence + Command + status`; the concrete command is only visible in the expanded output panel, above the result.
- The whole block header toggles output; no intermediate group-expand interaction remains.
- Long commands wrap inside the expanded panel without horizontal page overflow.
- Dark theme keeps the step dot, status colors, command line, and output panel readable.

#### Rollback/Cleanup
- None; no state is persisted.

## Feature: File changes are inline work-area cards with +/M badges

#### Prerequisites
- A thread whose turn contains `fileChange` messages with completed status

#### Steps
1. Open the thread and expand the file-change summary row below the assistant reply.
2. Confirm each change row shows a compact operation badge: `+` for added files, `M` for edited files, `−` for deleted, `→` for moved (hover shows the full operation label).
3. Confirm the file path sits on the left and the line counts (`+N −M`) align right.
4. Confirm the Undo/Redo button still works for the turn.

#### Expected Results
- Badges are compact symbols colored by operation instead of the long Added/Edited/Deleted labels.
- Path and line counts keep the right-aligned layout; undo/redo remains functional.

#### Rollback/Cleanup
- Re-run undo to restore the previous file state if a change was applied during the check.

## Feature: Worked summary renders as an independent paragraph

#### Prerequisites
- A completed turn that ran at least one command (produces a `Worked for …` summary message)

#### Steps
1. Open the thread after the turn completes.
2. Confirm the `Worked for Xm Ys` text appears as a plain paragraph (`.work-summary-text`) after the work blocks, with no click-to-expand separator.

#### Expected Results
- The summary text is separated from the work process and appears after the command blocks, without an expand interaction.

#### Rollback/Cleanup
- None.
