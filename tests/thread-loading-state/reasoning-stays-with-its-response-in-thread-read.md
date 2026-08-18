# Reasoning Stays With Its Response in Thread Read

When the bridge recovers a turn's chronological item order from the session log (`mergeSessionCommandsIntoTurns`), it repositions assistant messages and command blocks according to the rollout order. Previously, `reasoning` items were not a slot kind the recovery interleaved, so every reasoning block was pushed to the end of the turn's `items` — rendering the thinking below the final answer. The recovery now keeps each reasoning block glued directly before the assistant message it accompanies.

#### Prerequisites
- `codexapp` running with a `CODEX_HOME` containing a session whose last turn interleaves reasoning with multiple assistant replies (a long multi-command/`spawn_agent` turn, e.g. a TUI session that ended with several `reasoning` → `output_text` pairs).

#### Steps
1. Place such a rollout file under `<CODEX_HOME>/sessions/**/rollout-*.jsonl`.
2. Open the threaded session in the web UI (direct `#/thread/<id>` link if it is outside the current project root).
3. Inspect the `thread/read` `/codex-api/rpc` response for the final turn.
4. Scroll to the end of the rendered conversation and note the order of "Thinking process" toggles vs. assistant message paragraphs.

#### Expected Results
- Step 3: in the final turn's `items`, every `reasoning` item directly precedes the `agentMessage` it belongs to (e.g. `reasoning, agentMessage, commandExecution, reasoning, agentMessage`), and **none** appear at the tail of the turn.
- Step 4: each "Thinking process" toggle renders **immediately before** its corresponding assistant message; the final assistant reply has no thinking block after it. No thinking block is stranded at the bottom of the conversation.
- The reasoning spread across multiple sub-turns stays with its own message, even when command blocks are interleaved around them.
- In the Hot zone, the final assistant response has visual separation from preceding process records, but its position remains after the last real process item. The UI does not collect reasoning at the turn tail.
- A Plan record, when present, remains a read-only chronological process item and does not replace the Composer plan panel.

#### Rollback/Cleanup
- No feature flag; to restore previous behavior, revert `mergeSessionCommandsIntoTurns` in `src/server/codexAppServerBridge.ts` (drop the `reasoningsByMessageId` pairing and the `reasoning` skip in the trailing append loop).
- No app-server state is mutated; deleting the seeded rollout files removes them from the session store.
