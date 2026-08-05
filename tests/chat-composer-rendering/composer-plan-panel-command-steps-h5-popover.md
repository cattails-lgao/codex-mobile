# Composer Plan Panel, Command Step Index, and H5 Plus-Popover Controls

Feature work for round 7: a collapsible plan panel pinned above the composer (so it is not pushed away by message growth), a step-number badge on stacked command rows, and H5 plan-mode / approval-policy controls inside the "+" attach popover.

## Feature: Collapsible plan panel above the composer input

#### Prerequisites
- Dev server running at `127.0.0.1:4173`
- A thread whose history contains a `plan` / `plan.live` message (plan mode run)

#### Steps
1. Open the thread with the plan history.
2. Confirm the plan panel appears directly above the composer input (`.thread-composer-plan-panel`), showing title "Plan", an `x/y` progress count, and the explanation plus step list.
3. Click the panel header to collapse it; click again to expand.
4. While the agent streams a plan update, confirm the "Updating" badge is shown and the progress count changes.

#### Expected Results
- The panel stays above the input and does not scroll away with the message feed.
- Collapse/expand toggles `aria-expanded` and hides/shows the body.
- Dark theme renders the panel with the dark background (check with system dark mode).

#### Rollback/Cleanup
- None required; no state is persisted.

## Feature: Command step-number badges in stacked command rows

#### Prerequisites
- A thread with a turn that ran multiple commands (grouped `commandExecution` rows or worked-command rows)

#### Steps
1. Open the thread and expand a grouped command block.
2. Confirm each command row shows a leading `.cmd-step-index` badge with the step number (1, 2, 3, …).
3. Hover the badge and confirm the tooltip reads "Step N".
4. Repeat for a "worked" command row inside the message stream.

#### Expected Results
- Each stacked command row carries a distinct, ordered step number so it is clear which step each command belongs to.
- Dark theme keeps the badge readable.

#### Rollback/Cleanup
- None required.

## Feature: H5 plan mode and approval policy inside the "+" popover

#### Prerequisites
- Mobile viewport (375x812) on the dev server, a thread opened so the composer is visible

#### Steps
1. Tap the "+" attach trigger in the composer.
2. Confirm the popover contains a "Plan mode" group and an "Approval policy" group styled like the existing "In-progress send" (Steer/Queue) group, each with selectable buttons.
3. Tap "Plan mode" → "Plan mode" (or another choice) and confirm the popover closes and the chosen button shows the active state when reopened.
4. Confirm the standalone "Plan mode" and "Approval policy" pill buttons are hidden in H5 (they only render on desktop).
5. Switch back to a desktop viewport and confirm the standalone pills are present again.

#### Expected Results
- Plan mode and approval policy are reachable in H5 via the "+" popover, matching the in-progress-send visual style.
- Selecting a mode closes the popover and applies the selection.

#### Rollback/Cleanup
- None required.
