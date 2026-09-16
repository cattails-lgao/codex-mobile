# Tool-Call Blocks No Longer Run to the End of the Conversation

Long multi-turn conversations (e.g. 24-turn sessions with dozens of `exec_command` calls) could render with command/tool blocks stacked at the very end of the conversation, after the assistant's final reply.

#### Background / Root Cause
- Modern app-servers (codex-cli 0.146+, verified against a real 977 KB / 821-line rollout) materialize thread history with native `session-cmd-*` item ids. The round-11 session-log chronology recovery (`mergeSessionCommandsIntoTurns`) used `id.startsWith('session-')` as its idempotence guard, so it bailed out for every modern thread and never restored command/reply ordering.
- Materialization also collapses multiple assistant replies inside one turn into a single `agentMessage`, placed after the first command; the remaining commands then trail at the end of the turn. The final, text-bearing reply should sit at the turn end.

#### Fix (`codexAppServerBridge.ts` `mergeSessionCommandsIntoTurns`)
- Removed the `session-` prefix idempotence guard (recovery is deterministic: same rollout + same turns → same result, verified by a repeated-pass test).
- When the materialized agent message count is smaller than the rollout's assistant-reply slot count (replies collapsed), all commands/file changes are emitted in rollout order first and the agent reply is appended at the turn end; otherwise the original interleaving is preserved.

#### Steps
1. Open a long thread that ran many commands and had multiple assistant replies per turn.
2. Scroll to the bottom of the conversation.
3. Inspect the last message block.

#### Expected Results
- The conversation ends with the assistant's reply (agent message / worked summary), not a stack of command/tool blocks.
- Commands still appear in their real execution order within each turn; replies that were interleaved mid-turn remain interleaved when the app-server preserved them.
- Reopening/reloading the thread yields the same order (no double-insertion).

#### Rollback/Cleanup
- The recovery runs only on `thread/read` responses in the bridge; disabling it requires reverting `mergeSessionCommandsIntoThreadResult` usage in the RPC handling chain.

### Round-85: current-shape sessions keep the app-server's own interleaving

#### Prerequisites
- App is running from this repository.
- One long thread whose rollout writes commands as `custom_tool_call` named `exec` (any session created by a current CLI version), with several turns that ran commands between replies.
- One older thread whose rollout still writes `function_call` named `exec_command` / `shell_command`.

#### Steps
1. `POST /codex-api/rpc` with `{"method":"thread/resume","params":{"threadId":"<current-shape thread>"}}` and time it; repeat the request so the timing is warm.
2. In that response, walk `result.thread.turns[*].items` and write down the `type` of each item, turn by turn.
3. Count the `commandExecution` items whose `id` starts with `session-cmd-`.
4. Repeat steps 1–3 for the older thread.
5. `node scripts/probe-session-log-recovery.cjs <path to the current-shape rollout>`.
6. `node scripts/probe-session-log-recovery.cjs <path to the older rollout> --require-recovery`.

#### Expected Results
- Step 2 shows each turn's items still alternating in the order the app-server produced them — `userMessage`, `reasoning`, `agentMessage`, then `commandExecution` blocks, with later replies appearing after the commands that preceded them. Commands are **not** bunched after every reply at the end of the turn.
- Step 3 reports **0** `session-cmd-*` items: the recovery recognises nothing in this rollout shape, so it must leave the feed alone rather than reorder it.
- Step 4 reports a non-zero `session-cmd-*` count (measured on the local sample: 58/58 and 51/51) — legacy rollouts keep their chronology recovery.
- Step 1 is materially faster than before this round for a large rollout (measured locally on a 30.89MB session: warm median 1071ms → 610ms, with no overlap between the two groups).
- Step 5 prints `verdict: recovery DOES NOT APPLY` and exits 0; step 6 prints `verdict: recovery APPLIES` and exits 0. If step 6 fails, the recogniser has fallen behind a newer tool shape again.

#### Rollback/Cleanup
- No cleanup required.
