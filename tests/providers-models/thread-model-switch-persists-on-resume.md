### Feature: Thread model switch persists and wins on first resume (round-72)

#### Prerequisites
- App is running from this repository against a Codex app-server / LiteLLM-backed endpoint.
- You have an unfinished thread that was started on an older model ID that is no longer available (or can simulate by switching a thread's model, then reloading so `resumedThreadById` is fresh for that thread in the session).
- The composer model picker offers the newer target model.

#### Background
`startTurnForThread` resumes a thread on its first turn of a session and previously wrote the
server-persisted `model` back unconditionally, overwriting any model the user already switched to in
the UI. When that server model was a deleted/offlined ID, the very next request used the old ID and was
rejected (400). The fix gates the resume overwrite: if the thread has an explicit UI selection
(`hasThreadModelSelection`), the user's choice wins.

#### Steps
1. Open an unfinished thread whose persisted model is the removed/offlined ID.
2. In the composer, switch this thread's model to the available target model (e.g. `gpt-5.6-terra`). Confirm the composer shows the target.
3. Send a message on that thread (this is the first turn in the session for that thread, forcing a resume).
4. Inspect the outbound turn/start request body for the thread.

#### Expected Results
- The request body's `model` equals the model you switched to in step 2, NOT the thread's old persisted model.
- No 400 / "model not found" error from the upstream gateway for that request.
- A thread that never had an explicit per-thread selection still restores its server-persisted model (seeded on resume), so new/undecided threads behave as before.

#### Rollback/Cleanup
- If you changed an existing conversation's model for the test, reset it back to its original selection.
- No durable state is written beyond the normal per-thread model preference (localStorage `codex-web-local.selected-model-by-context.v1`).

#### Automated check
- `src/composables/useDesktopModelPreferences.test.ts` locks `hasThreadModelSelection` semantics (4 cases).
- `useDesktopState.test.ts` (93) and `useDesktopStateContext.test.ts` pass; `vue-tsc --noEmit` clean.