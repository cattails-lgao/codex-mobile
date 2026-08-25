# Round-55: Vite root route blocked by SSE middleware (2026-08-25)

> **Incident:** After updating to the current working tree, opening the development server root route displayed an endless Server-Sent Events body:
>
> ```text
> event: ready
> data: {"ok":true}
>
> : ping
> ```
>
> The application therefore never received Vite's HTML entry and remained unusable.

## Root cause

`handleEventsHttpRequest()` accepted every `GET` request instead of only `/codex-api/events`. Because the Codex bridge is registered as a Vite middleware, `GET /` was incorrectly upgraded to the notification SSE stream.

The bridge also evaluated its asynchronous route families before returning unrecognized paths to Vite. A non-API request could therefore wait on unrelated bridge initialization before Vite handled the page or a static asset.

## Fix

- `src/server/bridge/eventsRoutes.ts` now opens SSE only when the request pathname is exactly `/codex-api/events`.
- `src/server/codexAppServerBridge.ts` immediately calls Vite's `next()` for every pathname outside `/codex-api/`.
- `src/server/bridge/eventsRoutes.test.ts` covers both boundaries: the root route is passed through and the exact events endpoint opens SSE.
- Added the manual verification entry [Vite root route and events SSE routing](../../tests/cli-network-platform/vite-root-route-and-events-sse-routing.md).

## Validation

- User manually refreshed the running service and confirmed the page renders normally after the fix.
- `pnpm exec vitest run src/server/bridge/eventsRoutes.test.ts`: 2/2 passed.
- `pnpm run build:frontend`: `vue-tsc --noEmit` and Vite production build passed.

## Performance audit

The new non-API guard removes all bridge route matching and asynchronous work from HTML, Vite module, static asset, and frontend router requests. SSE still has one intentional persistent connection at `/codex-api/events`; no new requests, polling, cache invalidation, or blocking I/O were introduced.

## Follow-up

- Commit this round separately from the pending Round-54 protocol snapshot and notification compatibility work.
- Keep `.zcode/` untracked and outside both commits.
