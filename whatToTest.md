# What To Test: Thread Provider Locking

Use local Vite only with an isolated `CODEX_HOME`. Do not use Docker for this workflow.

## Task 1: New Chat Uses Current Global Provider

Prerequisites:
- Start the app with `CODEX_HOME=<isolated-home> pnpm run dev --host 127.0.0.1 --port 4173`.
- Open `http://127.0.0.1:4173/#/`.

Steps:
1. Open Settings and choose the provider you want to test.
2. Create a new chat in the current project.
3. Check the composer model dropdown before sending.

Expected result:
- The new chat uses the current global provider at creation time.
- The model dropdown contains only models for that provider.
- It does not reuse the model list from any previously opened thread in the project.

Screenshot evidence:
- `output/playwright/what-to-test-task-1-current-provider-models.png`

## Task 2: Existing Thread Keeps Its Captured Provider

Prerequisites:
- Have an existing thread that was created under a different provider than the current global provider.

Steps:
1. Open the old thread directly by URL or from the sidebar.
2. Open the composer model dropdown.
3. Compare the visible models with the thread's captured provider.

Expected result:
- The dropdown remains scoped to the old thread's captured provider.
- Changing global provider in Settings does not change this existing thread's model list.

Screenshot evidence:
- `output/playwright/what-to-test-task-2-existing-thread-provider.png`

## Task 3: Send Uses The Thread Provider

Prerequisites:
- Use one existing Zen thread and one existing Codex/OpenAI thread in the same project.

Steps:
1. Open the Zen thread and send `hi`.
2. Verify the run uses Zen / `big-pickle` and a reply appears.
3. Open the Codex/OpenAI thread and send `hi`.
4. Verify the run uses a GPT model and a reply appears.

Expected result:
- Each send uses the provider captured on that thread.
- Replies render in the chat and errors appear visibly in the conversation if a request fails.

Screenshot evidence:
- `output/playwright/what-to-test-task-3-thread-send-reply.png`

## Task 4: Message Loading Does Not Refetch Provider Models

Prerequisites:
- Use a thread with visible messages and a captured provider.

Steps:
1. Open `http://127.0.0.1:4173/#/thread/<thread-id>`.
2. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
3. Inspect the generated JSON report.

Expected result:
- `warnings` is empty.
- `duplicateCounts.providerModels` is `0` for the thread route profile.
- The chat remains usable and the dropdown remains provider-scoped.

Screenshot evidence:
- `output/playwright/what-to-test-task-4-profile-result.png`

## Task 5: Dark Theme Provider Model UI

Prerequisites:
- Use any thread with a captured provider and visible model dropdown.

Steps:
1. Switch Appearance to Dark in Settings.
2. Open the thread's model dropdown.
3. Verify the selected model and dropdown list are readable.

Expected result:
- Dark theme model controls are readable.
- Provider-scoped models remain unchanged in dark theme.

Screenshot evidence:
- `output/playwright/what-to-test-task-5-dark-theme-models.png`
