# What To Test: Thread Provider Locking

Use local Vite only with an isolated `CODEX_HOME`. Do not use Docker for this workflow.

## Task 1: Background Refresh Keeps Old Provider Models

Prerequisites:
- Use an isolated `CODEX_HOME` that contains an old Zen thread.
- Copy `/Users/igor/.codex/auth.json` into that same `CODEX_HOME` so the current global provider becomes Codex.
- Start local Vite: `CODEX_HOME=<isolated-home> pnpm run dev --host 127.0.0.1 --port 4173`.

Steps:
1. Open the old Zen thread.
2. Wait for the post-route background refresh to finish.
3. Open the model dropdown.
4. Capture a screenshot.

Expected result:
- The dropdown is populated.
- The dropdown shows Zen models such as `big-pickle`.
- The dropdown does not show Codex/GPT models.

Required evidence:
- Screenshot of the old Zen thread model dropdown after the background refresh.
- DOM or network evidence that the dropdown is not empty.

## Task 2: New Chat Uses Current Global Provider

Prerequisites:
- Use the same isolated `CODEX_HOME` after Codex auth is present.
- Use a project that already contains at least one older Zen thread.

Steps:
1. Open the project home/new-chat surface.
2. Confirm Settings provider is Codex.
3. Create a new chat in that project.
4. Open the model dropdown before sending.
5. Capture a screenshot.

Expected result:
- The new chat uses the current global Codex provider.
- The dropdown shows only Codex/GPT models.
- The dropdown does not inherit Zen models from older project threads.

Required evidence:
- Screenshot of the new chat model dropdown.
- Session JSONL or RPC evidence that the new thread has Codex/OpenAI provider metadata.

## Task 3: Send Uses Each Thread's Captured Provider

Prerequisites:
- Use one Zen thread and one Codex thread in the same project.

Steps:
1. Open the Zen thread and send `hi`.
2. Wait for the assistant reply.
3. Open the Codex thread and send `hi`.
4. Wait for the assistant reply.
5. Capture screenshots of both replies.

Expected result:
- The Zen thread sends with `big-pickle` and receives a visible reply.
- The Codex thread sends with a GPT model and receives a visible reply.
- Errors, if any, are rendered in the conversation instead of failing silently.

Required evidence:
- Screenshot of the Zen reply.
- Screenshot of the Codex reply.
- Session JSONL or backend request evidence proving the actual model/provider used for each send.

## Task 4: Route Profile Has No Provider-Model Regression

Prerequisites:
- Use a loaded thread with visible messages.
- Keep the local Vite server running at `http://127.0.0.1:4173`.

Steps:
1. Run `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
2. Open the generated JSON report.
3. Capture the profile screenshot or save the JSON path.

Expected result:
- `warnings` is empty.
- `duplicateCounts.providerModels` is `0` for the Codex thread route profile.
- No duplicate `thread/read` request appears during the route load.

Required evidence:
- Profile JSON path.
- Key JSON values: `warnings`, `duplicateCounts`, `totalApiKB`.

## Task 5: Light And Dark Message Controls Are Readable

Prerequisites:
- Use a thread with assistant replies.

Steps:
1. In light theme, open a thread with assistant replies.
2. Confirm copy/fork controls or assistant metadata are readable without disappearing into the background.
3. Switch to dark theme and repeat.
4. Capture screenshots for both themes.

Expected result:
- Assistant copy/fork controls are visible enough to discover in light theme.
- Dark theme remains readable.
- Provider-scoped model dropdown behavior is unchanged in both themes.

Required evidence:
- Light-theme screenshot.
- Dark-theme screenshot.
