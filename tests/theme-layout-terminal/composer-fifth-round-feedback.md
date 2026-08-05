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
4. Click a file row; an in-panel preview opens for that file path.
5. Switch to another thread/project and confirm the panel reloads for the new workspace; refresh the page and confirm the list reloads.

#### Expected Results
- The Files panel shows workspace-scoped files only, ignoring `.git`, `node_modules`, `dist`, `build`, `out`, and other generated directories.
- Grouping, search filtering, and file preview navigation all work; light and dark themes both render the list legibly.

#### Rollback/Cleanup
- None; the panel is read-only.

### Feature: Right sidebar Files tab opens an in-panel file preview on click

#### Prerequisites
- Dev server on 4173, a Codex backend, and a workspace containing a mix of text, image, and binary files.

#### Steps
1. In the right sidebar Files tab, click a text file (e.g. `package.json`); a preview modal opens inside the app showing the file content in a monospace code block.
2. Press `Esc` or click the close button; the modal closes and returns focus to the panel.
3. Click an image file (e.g. `png`/`jpg`); the modal renders the image itself rather than raw bytes.
4. Click a binary file (e.g. `pdf`); the modal shows a "cannot be previewed" message with an "Open in browser" action.
5. Click a large text file (bigger than 512 KB); the modal shows only the first part and displays a truncation notice.
6. Switch to dark theme and repeat steps 1–4; the preview modal and its code block must remain readable.
7. Click a different file while the modal is open; the modal content refreshes to the newly selected file.

#### Expected Results
- Clicking any file row opens the preview in-app instead of navigating to a new browser tab.
- Text files show content (truncated at 512 KB with a notice when larger); images render inline; other file types show a fallback message plus an "Open in browser" button that opens the existing browse view in a new tab.
- ESC and the close button both dismiss the modal; light and dark themes both render legibly.

#### Rollback/Cleanup
- None; the panel and preview are read-only.

### Feature: Chinese mode fully localizes context menus, edit-message dialog, automations, skills, and Git panels

#### Prerequisites
- Dev server on 4173, a Codex backend, UI language set to 简体中文 (`src/composables/useUiLanguage.ts` locale is `zh-CN`; app language dropdown set to 简体中文).

#### Steps
1. Right-click a project or thread in the left sidebar; confirm every menu entry is Chinese (no English fallback strings).
2. Right-click a message and choose 编辑此消息 (edit this message); confirm the confirmation dialog title and body are Chinese, including the undo/redo file-change confirmations and command status labels (运行中/完成/退出/已拒绝/已停止/已中断).
3. Open the 自动化 (Automations) panel: confirm toolbar (新自动化/刷新/刷新中...), summary counts (总计/个进行中/个已暂停), empty states (加载自动化中.../还没有自动化/请通过线程或项目菜单添加自动化。), detail labels (自动化详情/目标/心跳/项目), and error toasts are Chinese.
4. Open the 技能 (Skills Hub) panel: confirm search aria-label, error toasts (加载技能失败/搜索技能失败/安装失败/卸载失败/更新技能失败 and the two 安装完成但... notices) are Chinese.
5. Open the right sidebar Git panel: confirm section titles (分支/提交), empty states (未找到分支。/请选择一个分支。/加载提交中.../未找到提交。/无文件更改。), placeholders (搜索提交...), toggles (重置历史引用), copy ref tooltips (复制/已复制提交引用), branch badges (当前/远程), buttons (检出/重置), review toggle (审查工作树更改), dirty-state warning (切换或重置前，必须提交、暂存或丢弃已跟踪的更改。...), and the 个文件已更改 count are all Chinese.
6. Open the automation edit dialog from a thread menu; confirm the interval-unit dropdown shows 分钟/小时/天 and thread timestamps show 刚刚 instead of `now`.
7. Switch to dark theme and repeat steps 1–6; all translated text must remain legible.

#### Expected Results
- Under 简体中文, the five surfaces (project/thread context menus, edit-message dialog, automations panel, skills hub, right Git panel) show no English-only descriptions; every string resolves via `useUiLanguage.t()`.
- English mode is unchanged (falls back to the English source strings).

#### Rollback/Cleanup
- Switch the app language back to English to restore original labels.
