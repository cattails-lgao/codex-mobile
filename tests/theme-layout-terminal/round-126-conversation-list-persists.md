### Regression: The conversation list survives a slow reload

#### Prerequisites
- A running server that has the `/codex-api` bridge (dev server `node scripts/dev.cjs`, or a `dist-cli` instance).
- A thread long enough to scroll (`scrollHeight - clientHeight > 600px`) — the bigger the thread, the easier the slow load is to hit.
- A desktop width (≥ 1024px).

#### Steps
1. Open the long thread and scroll the message list to somewhere in the middle (e.g. 40% down). Note the position.
2. Make a reload of that thread take longer than 5 seconds — on a big thread this happens naturally (slow disk / busy browser); to force it deterministically, delay the message RPCs (see Automation).
3. While the reload is in flight, keep watching the same thread.
4. After the "Still loading — the first open of a large history can take a while." note has appeared, look at the message list again.
5. Let the load finish and read the scroll position once more.

#### Expected Results
- Step 4: the message list is **still on screen** (`.conversation-list` is in the DOM, with its items), and it is **at the same scroll position as step 1**. The "still loading" note is an addition *above* the list, not a replacement for it.
- Step 5: the position is **unchanged** — nothing was lost, and the list is not pinned to the top.
- Not-regressed: a thread with no messages still shows only "No messages in this thread yet." (the always-mounted empty list renders nothing visible), and the "Load earlier messages" row does not appear for an empty thread.

#### Automation
- `node scripts/verify-conversation-list-persists.cjs` (needs `PROFILE_BASE_URL`) drives the real code path (bumps the thread's version so the reload is genuine, then simulates tab-away/tab-back with the message RPC delayed) and asserts both rows above. On the pre-round-126 code it fails 6/10 with `listPresent=false`, `items=0`, and the final scroll position back at `0`.
- `node scripts/check-ui-contract.cjs` statically asserts the list is not a member of a `v-if`/`v-else` chain (item: "消息列表是滚动容器，不得挂在 v-if/v-else 分支上（round-126）").

#### Rollback/Cleanup
- Close the thread. No state is written — the check only reads.
