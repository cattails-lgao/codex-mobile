### Thread conversation loads earlier turns on demand

#### Feature/Change Name
Thread conversation incremental older-turn loading.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev --host 127.0.0.1 --port 4173`)
2. A thread with more than 10 turns is available
3. Light theme and dark theme both available from the appearance switcher

#### Steps
1. In light theme, open a thread that has more than 10 turns.
2. Confirm the newest messages render first and the conversation shows the Load earlier messages control at the top.
3. Click Load earlier messages once.
4. Confirm an older batch is prepended above the previously first visible turn and the scroll position stays near the same content.
5. Continue clicking Load earlier messages until the control disappears.
6. Confirm the oldest messages in the thread are visible and no duplicate message rows are introduced.
7. Switch to dark theme and repeat steps 1-6 on the same thread or another long thread.

#### Expected Results
- Initial thread open remains bounded to the latest turn page.
- Load earlier messages fetches older persisted turns from the local bridge instead of only revealing already-loaded messages.
- The control remains available while older persisted turns exist and disappears after the first turn is loaded.
- Message ordering, turn actions, and scroll restoration remain stable in light and dark themes.

#### Rollback/Cleanup
- None.

---

### Round-86: earlier turns come from one `thread/turns/list` page, not a full read

#### Prerequisites
- App is running from this repository.
- One thread with more than 10 turns (the more turns and the bigger the rollout, the clearer the difference).
- A turn id that exists in the thread, and one that does not.

#### Steps
1. `POST /codex-api/rpc` with `{"method":"thread/resume","params":{"threadId":"<long thread>"}}`. Note `result.threadTurnStartIndex` and the id of the **first** turn in `result.thread.turns` (that is the oldest loaded turn).
2. `GET /codex-api/thread-turn-page?threadId=<thread>&beforeTurnId=<that oldest turn id>&limit=10` and time it.
3. Repeat step 2 with `beforeTurnId` set to a turn in the **middle** of the already-loaded window and time it.
4. Repeat step 2 with `beforeTurnId=definitely-not-a-turn-id`.
5. Repeat step 2 with the `beforeTurnId` parameter omitted entirely.
6. In the UI, scroll to the top and use "load earlier messages" repeatedly until the control disappears.
7. Optionally: `node scripts/probe-turn-page.cjs <threadId> <CODEX_HOME>`.

#### Expected Results
- Step 2 (the anchor the resume handed over) returns in roughly **half** the time of step 3 (an anchor that is not a page boundary falls back to the full-hydration read) — the gap is the evidence that the bounded path really ran.
- Steps 2, 3, 5, and 6 return the same turn ids and the same `startTurnIndex` / `hasMoreOlder` as they did before round-86; the payload is unchanged, only the server-side work differs.
- Step 4 returns HTTP 200 with `turns: []`, `startTurnIndex: 0`, `hasMoreOlder: false` — the client uses that to stop asking.
- Step 5 returns the last `limit` turns with `startTurnIndex = totalTurns - limit`.
- Step 6 prepends older turns with no duplication, no gaps, and stops at the true beginning of the thread.
- Step 7 prints `RESULT: all facts hold` and exits 0. If it fails, the bridge still serves correct output but has silently fallen back to full hydration, so treat it as a regression.

#### Rollback/Cleanup
- No cleanup required.

