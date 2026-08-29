# Componentization round-64: Conversation command execution display hook

Refactor of `ThreadConversation.vue` (no user-visible behavior change): the command-execution display surface — `expandedCommandIds`/`collapsedAutoCommandIds` sets, the `activeCommandMessageId`/`hasLiveAssistantText`/`isLiveTurnRuntime`/`groupedCommandsByLatestId`/`hiddenGroupedCommandIds` computeds, the expanded/compact/condensed predicates, `toggleCommandExpand`, and the auto-collapse reset watcher — was extracted into `useCommandExecutionDisplay.ts` via dependency injection (`getMessages`, `getLiveOverlay`, `isCommandMessage`). The component's messages watcher now calls the hook's `pruneCommandIdSets(validIds)`. This page is a smoke regression of the moved command-display surface.

## Prerequisites / Setup

- App installed and running on the dev server (127.0.0.1:4173).
- A conversation that has run shell commands, ideally with several consecutive command messages and an active (in-progress) command row.

## Actions and Expected Results

### Collapsed consecutive command blocks
1. Have (or load) a conversation where two or more commands ran back-to-back. Expected: the earlier command rows fold into the last command's work block, with the condensed "hidden" count/label; the folded rows are not shown as standalone rows.

### Live-turn compression and condensing
2. While an agent turn is running (live overlay or in-progress command), verify command rows render compact and output is condensed (truncated with a show-more affordance).
3. When the turn ends, rows return to the expanded/normal output behavior.

### No auto-expand of commands (no message-list flash)
4. During an active command, its row stays collapsed by default (compact header with status). Click its toggle once → it expands to show live/aggregated output. Click again → it collapses. New commands never auto-expand, so the message list no longer flashes a dark output block that immediately collapses.
5. When the active command id changes to another command, confirm the previous command stays collapsed and the new command also stays collapsed by default.

### Work-block command list
6. For a last-command message in a block, verify the work block lists the grouped earlier commands plus the latest, in order.

## Verification / Cleanup Notes

- Behavior change: removed auto-expand of the active command to stop the expand-then-collapse message-list flash; manual toggle still expands/collapses any command.
- Rollback: covered by `useCommandExecutionDisplay.test.ts` (7 cases: active-command tracking, grouping/hiding consecutive commands, work-block list building, toggle expand/collapse, live compaction/condensing, in-progress condensing, id-set pruning) plus `vue-tsc` and production build; revert `ThreadConversation.vue`'s `createCommandExecutionDisplay` wiring if any surface above misbehaves.