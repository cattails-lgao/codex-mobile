# Composer fifth-round feedback: shared popover, approval tip, slash skill rows, pill controls, and Files panel

Return to the [section index](index.md).

### Feature: Shared ComposerPopover replaces the three ad-hoc composer menus

#### Prerequisites
- Dev server on 4173, an active thread with a Codex backend.

#### Steps
1. Click the `+` (attach) control below the composer input; the popover opens above it.
2. Click Plan mode; the popover opens above it; note the attach popover closed (menus are mutually exclusive).
3. Click Approval policy; the popover opens above it; note the Plan mode popover closed.
4. Click outside any open popover; it closes.
5. Reopen each popover and confirm the panel is a shared surface: same border radius, shadow, width preset, and alignment above the trigger.

#### Expected Results
- All three menus are driven by the shared `ComposerPopover` component with consistent panel styling and outside-click dismissal.
- No legacy menu root refs or per-menu surface styles remain.

#### Rollback/Cleanup
- None; refresh the page to clear draft state.

### Feature: Approval policy save shows a floating tip instead of a long notice

#### Prerequisites
- Dev server on 4173, an active thread with a Codex backend.

#### Steps
1. Click Approval policy and select any option (e.g. "Unless trusted").
2. Immediately after clicking, a small rounded pill appears above the approval control showing "Approval policy saved".
3. Confirm the pill auto-dismisses after roughly 2 seconds and does not interrupt the composer layout.
4. Switch to dark theme and repeat; the pill must remain readable.

#### Expected Results
- Only a short floating tip appears; the previous long "Codex will now ask for permission…" notice is gone.
- The tip disappears automatically and never blocks clicks.

#### Rollback/Cleanup
- Re-select the previous policy to restore state.

### Feature: Slash skill descriptions clamp to two lines and rows stay within the popover width

#### Prerequisites
- Dev server on 4173, a project with at least one skill whose description is long enough to wrap.

#### Steps
1. Type `/` in the composer and scroll to the "Skills" group.
2. Confirm a long skill description is truncated to at most two lines with an ellipsis, and the skill name never widens the row beyond the popover panel.
3. Resize the window narrow (e.g. 375px); confirm no row overflows the popover width and no horizontal scrollbar appears.

#### Expected Results
- Skill descriptions render at most two lines (hidden overflow beyond that).
- Every row's width stays within the popover panel width at desktop and mobile widths.

#### Rollback/Cleanup
- None.

### Feature: Model and model-strength controls use the plan-mode pill style

#### Prerequisites
- Dev server on 4173, an active thread.

#### Steps
1. Below the composer input, compare the Model and Thinking (model strength) trigger chips with the Plan mode trigger chip.
2. Confirm all three share the same pill shape: rounded-full, hairline border, compact height, and muted text.
3. Click each pill to open its dropdown; options render normally.
4. Switch to dark theme; confirm the pills and their dropdowns remain readable.

#### Expected Results
- Model and Thinking triggers are visually identical in shape to the Plan mode button.
- Dropdown behavior is unchanged.

#### Rollback/Cleanup
- None.

### Feature: Right sidebar Files tab lists workspace files

#### Prerequisites
- Dev server on 4173, a Codex backend, and a registered workspace root that contains files (e.g. the current project).

#### Steps
1. In the right sidebar tab bar, click the Files tab (folder icon).
2. Confirm the panel lists workspace files grouped by top-level directory (files at the root appear under "(root)"); each group can be collapsed/expanded.
3. Use the search box to filter the list; matching files remain and others hide.
4. Click a file row; a browse view opens for that file path.
5. Switch to another thread/project and confirm the panel reloads for the new workspace; refresh the page and confirm the list reloads.

#### Expected Results
- The Files panel shows workspace-scoped files only, ignoring `.git`, `node_modules`, `dist`, `build`, `out`, and other generated directories.
- Grouping, search filtering, and file-open navigation all work; light and dark themes both render the list legibly.

#### Rollback/Cleanup
- None; the panel is read-only.
