# Work-process feed, thinking blocks, plan-in-composer, preview tabs, and sidebar polish

Feature work for requirement 8: the plan card is removed from the message feed (it lives only in the composer panel), persisted reasoning renders as collapsible thinking blocks, tool calls render as compact chips, command/tool work items are reordered right after the user prompt, the composer plan panel shows the latest step and opens the full plan in a centered popover, file previews become right-panel tabs (fixing the broken `/codex-local-browse` image URL), the right panel honors the dark theme, context usage moves next to the model-strength dropdown, the recycle bin gets a sidebar entry, and the settings dialog is grouped into labeled sections.

## Feature: Plan card no longer appears in the message feed

#### Prerequisites
- Dev server running at `127.0.0.1:4173`
- A thread whose history contains a `plan` / `plan.live` item

#### Steps
1. Open a thread that went through plan mode.
2. Scroll the feed and confirm no `.plan-card` block renders for the plan item.
3. Confirm the plan still appears in the composer as the `.thread-composer-plan-panel` above the input, with `✓`-marked progress (`N/M`) and the latest step text.

#### Expected Results
- The feed never shows the blue plan card; plan details are only in the composer panel.
- The composer panel shows `🗒 Plan`, a `N/M` progress counter, and the most recent step (in-progress step wins over the last step).

#### Rollback/Cleanup
- None.

## Feature: Persisted reasoning renders as collapsible thinking blocks

#### Prerequisites
- A thread whose turn contains a `reasoning` item (model thought stream)

#### Steps
1. Open the thread with a reasoning item.
2. Confirm a `.reasoning-block` row appears right after the user prompt with a 🧠 icon and `Thinking process` label.
3. Click the header; confirm the block expands to show the reasoning summary (`.reasoning-block-summary`) and the full thought markdown (`.reasoning-block-content`); click again to collapse.

#### Expected Results
- Reasoning is visible in the feed as a collapsed-by-default thinking block, not silently dropped.
- Expanded content renders markdown and is readable in both light and dark themes.

#### Rollback/Cleanup
- None.

## Feature: Tool calls render as compact chips

#### Prerequisites
- A thread whose turn contains `mcpToolCall` items

#### Steps
1. Open the thread and find the tool-call row (`.tool-call-block`).
2. Confirm it shows the MCP server badge, the tool name, and a status (`✓ Done` / `✗ Failed` / `Running` spinner).
3. Hover to confirm the title tooltip includes server, tool, error, and duration.

#### Expected Results
- Persisted tool calls are no longer dropped during normalization; they render as a compact system row in the work area.

#### Rollback/Cleanup
- None.

## Feature: Commands and tools follow the user prompt (work-process order)

#### Prerequisites
- A thread whose turn persisted the agent text before the commands (chronological order)

#### Steps
1. Open the thread and confirm the ordering is: user message → reasoning/plan/commands/tools → final assistant text.
2. Confirm commands render as `.work-block` rows with continuous step numbers and the final assistant reply appears after them.

#### Expected Results
- The feed matches the trae-work process style even for turns whose raw items were persisted in chronological order.

#### Rollback/Cleanup
- None.

## Feature: Composer plan panel opens the full plan in a centered popover

#### Prerequisites
- A thread currently planning (or with a recent plan item)

#### Steps
1. Confirm the plan panel header shows `🗒 Plan`, the `N/M` progress, and the latest step text with its status icon.
2. Click the header; confirm a centered popover (`.thread-composer-plan-panel-popover`) opens above the header with the explanation, the full step list, and an `Implement plan` button.
3. Click `Implement plan`; confirm it sends `Implement` to the thread and closes the popover.
4. On desktop, open the Plan mode dropdown and the Approval policy dropdown; confirm the menus are horizontally centered on their trigger buttons instead of left/right aligned.

#### Expected Results
- Plan details open in a centered popover anchored to the composer panel; dropdown menus for plan mode and approval policy center on their buttons.

#### Rollback/Cleanup
- None.

## Feature: File preview opens as a right-panel tab (not a modal)

#### Prerequisites
- A project/thread with files

#### Steps
1. Open the Files tab in the right panel (`.content-right-panel-tab` with `Files`).
2. Click any file; confirm a new preview tab appears in the panel header next to `Files` with a close button.
3. For an image file, confirm the image renders in `.right-file-preview-image` and the `src` starts with `/codex-local-browse/` (the URL must include the slash after the route prefix, otherwise the server route does not match and returns 404).
4. For a text file, confirm the content renders in `.right-file-preview-code`.
5. Open a second file; confirm two tabs exist and clicking between them switches the preview. Close a tab and confirm the panel falls back sensibly.

#### Expected Results
- No modal opens; previews live in tabs inside the right panel and the image URL matches the server's `/codex-local-browse/*path` route.

#### Rollback/Cleanup
- None.

## Feature: Right panel honors the dark theme

#### Prerequisites
- None

#### Steps
1. Toggle Appearance to Dark.
2. Open the Git and Files tabs; confirm the panel header, tabs, file list, search box, and git commit rows all use dark surfaces with readable text.
3. Open a file preview tab; confirm the preview header and body use dark surfaces.

#### Expected Results
- The right panel and its children no longer keep light backgrounds after switching to dark mode.

#### Rollback/Cleanup
- Toggle back to Light.

## Feature: Context usage moves next to the model-strength dropdown

#### Prerequisites
- A thread with token usage data

#### Steps
1. Open a thread and confirm the composer controls row shows model dropdown, Thinking dropdown, and a context pill (`.thread-composer-context-usage-inline`) with e.g. `62% · 12k / 200k`.
2. Confirm the pill changes color to amber/red when context is low and shows a `Compact` label; clicking it compacts the thread.
3. Open Settings and confirm the `Context` row no longer appears there.

#### Expected Results
- Context usage is visible next to the model controls and compacting is reachable without opening Settings.

#### Rollback/Cleanup
- None.

## Feature: Recycle bin entry in the sidebar footer

#### Prerequisites
- None

#### Steps
1. Confirm the sidebar footer now shows two buttons: `Settings` and `Recycle bin` (trash icon).
2. Click `Recycle bin`; confirm the recycle-bin dialog opens with the archived threads list (or the empty state).

#### Expected Results
- The recycle bin is reachable directly from the sidebar without opening the organize menu.

#### Rollback/Cleanup
- None.

## Feature: Settings dialog grouped into labeled sections

#### Prerequisites
- None

#### Steps
1. Open Settings.
2. Confirm the body is grouped with sticky headings: `General settings`, `Models & providers`, `Integrations` (Telegram, Hooks, Remote control), and `Usage & about` (rate limits, version).
3. Confirm the Dictation language dropdown sits next to the other dictation toggles.

#### Expected Results
- Settings are organized into labeled groups; scrolling keeps the current group heading visible.

#### Rollback/Cleanup
- None.

## Feature: Approval policy labels are concise

#### Prerequisites
- None

#### Steps
1. Open the Approval policy dropdown in the composer.
2. Confirm the three options read: `请求时` / `除非信任` / `从不` in Chinese UI, and `When Codex requests it` / `Unless trusted` / `Never` in English UI.

#### Expected Results
- The labels are concise and translate cleanly in both languages.

#### Rollback/Cleanup
- None.
