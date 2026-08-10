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
