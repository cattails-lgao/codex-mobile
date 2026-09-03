### Feature: Thread switch avoids loading flash and provider-models refetch

#### Prerequisites
- Start app from this repository (`pnpm run dev`).
- Use a provider-backed setup (e.g. OpenCode Zen) so `/codex-api/provider-models` is exercised.
- Ensure there are at least 2 existing threads with history.

#### Steps
1. Open the app and wait for the initial thread to finish loading.
2. Open DevTools Network tab, filter by `provider-models`.
3. Click a second thread in the sidebar, then click back to the first thread.
4. Repeat switching between the two threads several times within ~30 seconds.
5. Observe whether the "Loading messages..." empty-state text ever flashes and how many `provider-models` requests appear.

#### Expected Results
- Switching between already-loaded threads does not flash the empty "Loading messages..." text; the previous conversation stays visible until the new one renders.
- Only the first `provider-models` request (startup) is issued; subsequent thread switches within the TTL window reuse the cached model list instead of re-fetching.
- The first time a never-opened thread is selected, a brief "Loading messages..." state is still expected (its messages are not cached yet).

#### Rollback/Cleanup
- No cleanup required.
