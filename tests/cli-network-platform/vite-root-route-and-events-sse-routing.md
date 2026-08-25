### Vite root route and events SSE routing

#### Feature/Change Name
Keep the Vite application entry route separate from the Codex notification SSE endpoint.

#### Prerequisites/Setup
1. Start the repository with `pnpm run dev --host 127.0.0.1 --port 4173`.

#### Steps
1. Open `http://127.0.0.1:4173/` in a new browser tab.
2. Confirm that the application shell renders.
3. Open browser developer tools and inspect the response for `GET /`.
4. Confirm that the notification stream is requested only from `/codex-api/events`.
5. Refresh the page and repeat the checks.

#### Expected Results
- `GET /` returns the Vite HTML entry instead of `text/event-stream` content.
- The page does not display `event: ready` or repeated `: ping` lines.
- `/codex-api/events` remains the only endpoint that opens the SSE stream.
- Refreshing the page renders the application without an indefinite loading state.

#### Rollback/Cleanup
- Stop the temporary development server when manual verification is complete.
