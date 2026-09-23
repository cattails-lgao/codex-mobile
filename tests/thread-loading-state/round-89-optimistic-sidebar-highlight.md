### Feature: Sidebar click feedback is painted before the switch work

#### Prerequisites
- Start app from this repository (`pnpm run dev`, or a production build served locally).
- Ensure at least 3 threads in the sidebar, at least one with enough history that opening it costs a visible beat.

#### Steps
1. Load the app without any thread open (home route).
2. Click a thread in the sidebar and, the moment you click, watch the clicked row.
3. While the conversation is still loading, click another thread row.
4. Rapidly click across several threads (for example A -> B -> C -> A) before any of them finishes loading.
5. From thread B, click thread A and then click thread B again in quick succession.

#### Expected Results
- The clicked row shows its selected highlight immediately (within about one frame), while the conversation area still shows the previous thread and a loading state; the highlight never waits for the messages to load.
- The UI stays responsive during the switch: hover, other clicks and scrolling keep reacting.
- Every switch settles on the last clicked thread, with sidebar highlight, URL route (`/thread/:threadId`) and rendered conversation in agreement.
- In step 5 the app stays on thread B (the last click wins; a pending navigation to A must not land afterwards).
- The pending-request panel (approval / question) still matches the composer width after switching threads.

#### Rollback/Cleanup
- No cleanup required.

#### Related automation
- `node scripts/check-thread-switch-feedback.cjs` (set `PROFILE_BASE_URL` for a non-default port) asserts all of the above on a real page; `FREEZE_BUDGET_MS` bounds the unpainted window after a click. It fails on the pre-fix build.
