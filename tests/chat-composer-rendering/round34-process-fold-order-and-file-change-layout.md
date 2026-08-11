# Round 34: Process-Fold Ordering Restored + File-Change Row Layout Moved to the Left

Two message-list fixes verified against a real online rollout (12-turn session, 87 tool calls, `exec_command`/`write_stdin`/`apply_patch` mixed with many empty assistant messages).

#### Background / Root Cause
- **Process-fold blocks all ran to the front of the conversation.** `buildSessionItemOrder` counted every rollout assistant message (including ~13 empty-text `output_text` messages per turn that models emit between tool calls) as an `agentMessage` slot. `mergeSessionCommandsIntoTurns` compared the materialized `agentMessages.length` (4) against this inflated `agentSlotCount` (17), concluded "materialization collapsed replies", and took the "commands first, replies at turn end" branch — stacking all command/tool blocks before every reply.
- **File-change rows showed the delta count and undo button at the far right.** `FileChangeSummaryBlock.vue` pushed `.file-change-delta` and `.file-change-file-undo-button` to the row end with `ml-auto`; the requested layout puts the change numbers and the undo button at the far left of each row.

#### Changes
- `codexAppServerBridge.ts` (`buildSessionItemOrder`): an assistant message only counts as an `agentMessage` slot when its `content` has a non-empty `text`. Empty assistant messages (pure `output_text: ""`) no longer inflate `agentSlotCount`, so text-bearing replies interleave with commands in true rollout order.
- `FileChangeSummaryBlock.vue`: moved the delta count and per-file undo button to the start of each `file-change-item` (before the operation badge and path); removed `ml-auto` from both so they stay left-aligned. Works in light and dark themes.

#### Steps
1. Open a long thread whose turns ran many commands with interleaved assistant replies (a rollout with empty assistant messages between tool calls reproduces the ordering bug).
2. Scroll the conversation and inspect the process-fold blocks: each fold should sit where its commands actually ran, interleaved with assistant replies, not stacked at the front.
3. Expand a file-change block and inspect a row: the `+N/-N` delta and the undo icon should be the leftmost elements, before the operation badge and file path.

#### Expected Results
- Step 2: tool/command blocks appear in real execution order, alternating with replies (e.g. `3 commands → reply → 9 commands → reply → 6 commands → final reply`), instead of `12 commands + 6 commands` stacked before every reply.
- Step 3: every row starts with the signed delta and the undo icon, followed by badge and path; the undo icon stays adjacent to the delta; both light and dark themes keep them visible and left-aligned.
- `vue-tsc --noEmit` passes; full unit suite passes (Windows baseline: 2 pre-existing POSIX mode-bit failures in `codexAppServerBridge.archive.test.ts` are environmental and unrelated).

#### Rollback/Cleanup
- Ordering fix lives in `buildSessionItemOrder`; revert the `hasText` check to count all assistant messages.
- Layout fix lives in `FileChangeSummaryBlock.vue` template + styles; restore the original element order and `ml-auto` classes.
