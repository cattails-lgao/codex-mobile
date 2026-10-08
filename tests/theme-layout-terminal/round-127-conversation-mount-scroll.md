### Regression: The conversation keeps its scroll position across a re-mount

#### Prerequisites
- A running server that has the `/codex-api` bridge (dev server `node scripts/dev.cjs`, or a `dist-cli` instance).
- A thread long enough to scroll (`scrollHeight - clientHeight > 150px`) — the bigger the thread, the easier this is to see.
- A desktop width (≥ 1024px).

#### Steps
1. Open a long thread and scroll the message list to the bottom, so the newest message is visible.
2. Note the scroll position (or just remember that you were at the latest output).
3. Navigate away from the thread to a **non-thread** view — the home/`#/` route, the directory/`#/directory`, settings/`#/settings`, or automations/`#/automations`.
4. Navigate back into the **same** thread (re-open it from the sidebar, or go back to `#/thread/<id>`).
5. Look at where the message list sits now.

#### Expected Results
- Step 5: the message list is **at the latest output (bottom)** — `.conversation-list` is scrolled to its end and the newest message is visible. It must **not** be pinned at the top of the thread.
- Not-regressed: the first open of a thread still lands on the latest output, and switching between two different threads still lands on the latest output of the newly selected thread.
- Not-regressed: the mobile 375px layout still opens/closes the drawer and shows the right panel as before.

#### Automation
- `node scripts/verify-conversation-mount-scroll.cjs` (needs `PROFILE_BASE_URL`) drives the real code path (opens a scrollable thread, parks the list at the bottom, then walks `#/`, `#/directory`, `#/settings`, `#/automations` and returns to the same thread) and asserts the position is unchanged. It also asserts the conversation root really was removed and re-added, so the check cannot pass vacuously. On the pre-round-127 code it fails **4/7** with `base=438 back=0` on all four routes.
- `node scripts/check-ui-contract.cjs` statically asserts the component mounts with a scroll initialisation (item: "会话挂载期有滚动初始化，重挂不停在 TOP（round-127）", which requires both the `onMounted` import from `vue` and a `scheduleConversationScroll()` call inside the mount callback).

#### Rollback/Cleanup
- Close the thread. No state is written — the check only reads.
- If you want to also re-run `verify-conversation-list-persists.cjs` / `verify-review-pane-scroll.cjs`, note that both need a thread scrollable by **more than 600px** and will exit with code 2 (SKIP) on a shorter sandbox thread.
