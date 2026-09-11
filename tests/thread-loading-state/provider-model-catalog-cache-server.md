### Feature: Provider model catalog is cached on the server (open-thread path)

#### Prerequisites
- Start the app from this repository (`pnpm run dev --host 127.0.0.1 --port 4173`).
- Use a provider-backed free-mode setup (on this machine: OpenCode Zen) so `/codex-api/provider-models` is exercised.
- Have at least 2 threads with history in the sidebar.

#### Steps
1. Restart the dev server, then open a fresh browser profile (clear the HTTP cache) so the tab starts cold.
2. Open DevTools Network, filter by `provider-models`.
3. Note the duration of the first `provider-models` response.
4. Click a thread in the sidebar and record how long it takes for the conversation to render.
5. Switch to a second thread, then back, and compare.
6. `curl` the endpoint directly a few times in a row:
   `curl -s -o /dev/null -w '%{time_total}\n' http://127.0.0.1:4173/codex-api/provider-models`

#### Expected Results
- The first `provider-models` response after a server restart may still pay one upstream round trip (the startup warm-up fires in the background; if it has not finished the request is served by the first real fetch).
- Every later `provider-models` response is single-digit milliseconds and does not contact the upstream provider, because the catalog is memoized for 10 minutes (empty/failed results for 1 minute).
- When the cached catalog is older than the TTL, the response still returns immediately with the previous list and refreshes in the background.
- Opening a thread no longer waits on the provider catalog: the first sidebar click should land in roughly the same time as the second and third clicks (measured ~110ms vs ~210ms on this machine, down from ~1100ms for the first click).
- Cold-start boot may still be slow on the very first page load in dev mode (Vite has to transform the app); that is dev-only and not part of this check.

#### Notes
- Why this matters: `selectThread` awaits `refreshModelPreferences({ includeProviderModels: true })`, so a slow provider catalog fetch directly delays the first thread open. The upstream catalog calls had no memoization at all before this change.
- `getFreeModels()` (openrouter path) additionally gained a 1.5s timeout — it previously had none, and a hang could block the open-thread path indefinitely.

#### Rollback/Cleanup
- No cleanup required.
