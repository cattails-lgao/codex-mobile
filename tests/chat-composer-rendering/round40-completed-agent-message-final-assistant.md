# Round 40: Completed Agent Message Renders as Final Assistant Block (Not Folded Into Process Block)

In the latest turn of a thread, a completed reply showed only the process block with no `data-role="assistant"` block (open-source rollout `rollout-2026-08-21T10-20-40-01a0221e-d18f-7c42-8abc-58bf1be2dfc8.jsonl` reproduces: the final `agentMessage`/`response_item`/`task_complete` were recorded but the assistant text wasn't rendered as its own block).

#### Background / Root Cause
- `readAgentMessageCompleted` (in `useDesktopState.ts`) emitted the completed `item/completed` agent message with `messageType: 'agentMessage.live'` — the same type used while streaming via `item/agentMessage/delta`.
- `isFinalAssistantItem` (in `transcriptGrouping.ts`) rejects any message whose `messageType` ends with `.live`, so the completed final reply was never marked `final-assistant`. In `buildTurnRenderGroups` it was classified as kind `assistant` and, because it was neither the request nor the final item, it fell into `processItems` — its text got swallowed inside the process block and no `data-role="assistant"` block rendered.
- This diverged from the plan handler: `readPlanItemNotification` already maps `item/completed` to the non-live `plan` type.

#### Changes
- `useDesktopState.ts` (`readAgentMessageCompleted`): an `item/completed` `agentMessage` now uses `messageType: 'agentMessage'` (non-live), matching the `plan.live → plan` completion convention. Streaming still stays `agentMessage.live` via the delta channel.
- `useDesktopState.test.ts`: added round-40 regression test asserting the message is `agentMessage.live` during streaming and becomes `agentMessage` after `item/completed`.
- Live agent delta/completed messages retain notification `turnId` and resolved `turnIndex`; a delayed prior-turn live message is inserted before the next persisted user turn rather than appended after newer history. `liveTurnId` limits final-answer suppression to the actual active turn.

#### Steps
1. Start a thread and send a message that produces a scripted/agent reply ending with `item/completed`.
2. Watch the latest turn while it streams: the reply text should appear as a live assistant block during streaming.
3. When the turn completes, confirm the final reply remains a dedicated assistant block with `data-role="assistant"` and is not folded into the process-fold block.
4. With persisted `[u1(t0), u2(t1)]`, deliver a delayed live `agentMessage` for `t0`; confirm the displayed order is `[u1, agentMessage, u2]`.
5. While `t1` is live, confirm the completed assistant answer for historical `t0` remains a dedicated final assistant block.
6. Repeat with a rollout session loaded from a `.jsonl` (e.g. one ending in `agent_message` + `response_item` + `task_complete`).

#### Expected Results
- Step 2: the streaming reply shows with live/streaming treatment while `agentMessage.live`.
- Step 3: after completion the reply is marked as the final assistant answer (`final-assistant`) — a `data-role="assistant"` block is present; the process block still contains only tool/command rows.
- Steps 4–5: delayed live content stays with `t0`, before `u2`; only `t1` has final-answer suppression while it is active.
- `vue-tsc --noEmit` passes; targeted `useDesktopState.test.ts`, `transcriptGrouping.test.ts`, and `transcriptGrouping.repro.test.ts` pass.

#### Rollback/Cleanup
- Fix lives in `readAgentMessageCompleted`; to revert, restore `messageType: 'agentMessage.live'`.
- Remove the round-40 test block from `useDesktopState.test.ts`.