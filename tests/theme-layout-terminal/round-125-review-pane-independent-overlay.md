### Feature: Review pane is an overlay — it must not evict the conversation

#### Prerequisites
- A running server that has the `/codex-api` bridge (dev server is enough: `node scripts/dev.cjs`, or a `dist-cli` instance).
- At least one real thread long enough to scroll (`scrollHeight - clientHeight > 600px`).
- Run the manual steps at a desktop width (≥ 1024px) so the right panel is expanded with the Git tab active. At 1280px the Git tab is already showing — **do not click the right-panel toggle**, it collapses the panel.

#### Steps
1. Open a long thread and scroll the message list up so it is clearly not at the bottom (e.g. 35% of the way down).
2. In the right Git panel, click **Review Worktree Changes**.
3. With the review pane open, inspect the conversation: it should still be mounted under the overlay.
4. Close the review pane (the `×` in its header, or click the backdrop).
5. Read the message list's scroll position again.

#### Expected Results
- Step 3: `.conversation-list` still exists in the DOM while the pane is open (1 element). The review pane is a full-screen overlay (`fixed inset-0` + backdrop), so the list is covered but **not unmounted**.
- Step 5: the list is at **the same scroll position as step 1** — nothing was lost, and the previously loaded "earlier messages" pages / auto-follow flag / image previews / file-change action state are all still there.
- Not-regressed guard: the pane still fills the viewport width on narrow screens (it is `fixed inset-0`, so this no longer depends on unmounting the thread).

#### Automation
- `node scripts/verify-review-pane-scroll.cjs` (needs `PROFILE_BASE_URL`) asserts both rows above; on the pre-round-125 code it fails with `count=0` and `scrollTop 2018 → 0`.
- `node scripts/check-ui-contract.cjs` statically asserts that `ReviewPane` and `.content-thread` are **not** `v-if`/`v-else` rivals (item: "审查面板是覆盖层，不得与会话列构成 v-if/v-else 互斥").

#### Rollback/Cleanup
- Close the review pane and the thread. No state is written; the check only reads.
