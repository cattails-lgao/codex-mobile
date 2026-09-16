### Feature: Thread load capped to latest 10 turns

#### Prerequisites
- App is running from this repository.
- At least one thread exists with more than 10 turns/messages.

#### Steps
1. Open a long thread that previously caused UI lag during initial load.
2. While the thread is loading, immediately click another thread in the sidebar.
3. Return to the long thread.
4. Count visible loaded history blocks and confirm only the newest portion is shown.
5. Call `/codex-api/rpc` with method `thread/read` for the same thread and inspect `result.thread.turns.length`.
6. Call `/codex-api/rpc` with method `thread/resume` for the same thread and inspect `result.thread.turns.length`.

#### Expected Results
- Initial thread load renders only the most recent 10 turns.
- UI remains responsive during thread load.
- You can switch to another thread without the UI freezing.
- `thread/read` and `thread/resume` RPC responses contain at most 10 turns.

#### Rollback/Cleanup
- No cleanup required.

### Round-84: open-thread hydration is bounded at the request, not after it

#### Prerequisites
- App is running from this repository.
- One thread with more than 10 turns (the more turns and the bigger the rollout, the clearer the difference).
- One brand-new thread with no turns at all.

#### Steps
1. `POST /codex-api/rpc` with `{"method":"thread/resume","params":{"threadId":"<long thread>"}}` and time it.
2. In the same response, inspect `result.thread.turns.length`, `result.threadTurnStartIndex`, and whether `result.initialTurnsPage` exists.
3. `POST /codex-api/rpc` with `{"method":"thread/resume","params":{"threadId":"<same thread>","excludeTurns":false}}` and time it (this is the pre-round-84 full-hydration path; the bridge leaves an explicit caller choice alone).
4. Open the same long thread in the UI and use "load earlier messages" repeatedly until it stops offering more.
5. Open the brand-new thread with no turns.
6. Optionally: `node scripts/probe-resume-turn-page.cjs <threadId> <CODEX_HOME>`.

#### Expected Results
- Step 1 returns in a fraction of step 3's time, with `thread.turns.length` at most 10, `threadTurnStartIndex` equal to `totalTurns - 10`, and **no** `initialTurnsPage` field in the response.
- Step 1 and step 3 return the same turn ids in the same order.
- Step 4 loads earlier turns without duplication or gaps, and stops at the true beginning of the thread (no endless "load more").
- Step 5 renders an empty conversation (no error, no spinner stuck).
- Step 6 prints `RESULT: all assumptions hold` and exits 0.

#### Rollback/Cleanup
- No cleanup required.

