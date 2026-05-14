# Provider Config Restart and PR Review Follow-ups

Date: 2026-05-14

## Context

During local Vite validation with an isolated `CODEX_HOME`, the app started without auth and selected OpenCode Zen / `big-pickle`. After copying `/Users/igor/.codex/auth.json` into the same `CODEX_HOME`, Settings showed `Codex`, but the new-chat composer still showed `big-pickle`.

The live checks showed the server-side `config/read` path was still using the stale app-server process started with no-auth Zen config, even though frontend free-mode status had promoted the visible Settings provider to Codex.

## Fix

The bridge now stores a signature of the app-server startup config. Before each RPC, it rebuilds the desired config and disposes the existing app-server process if the signature changed. The next RPC starts app-server with current auth/provider state.

Validated behavior after restart:
- Browser Use on `http://127.0.0.1:4173/#/` showed the new-chat model changed from `big-pickle` to `GPT-5.5`.
- `config/read` returned `model: null` and `model_provider: null`, which is the Codex default path rather than Zen.
- Home-route performance profile showed no warnings, `threadRead: 0`, `threadResume: 0`, and `totalApiKB: 50.1`.

## GPT-5.4 Send Check

A project-scoped new chat using `GPT-5.4` successfully created thread `019e2518-f320-7651-8756-a42174365f69` and rendered the assistant reply `Hi`.

Observed timing:
- Route after send: about 3.7s.
- Backend turn duration: 24.661s.
- UI rendered `Worked for 25s` and the reply.

A projectless `Choose folder` home-state send cleared the input but did not create a thread or show an error. That is a separate UX issue from provider locking.

## Open PR Review Follow-ups

Bot comments on PR #173 identified remaining provider-lock risks that were not fixed by the app-server restart itself:

- Provider-backed model lookup should use the requested provider id for non-Zen/non-OpenRouter providers instead of re-reading global `config.model_provider`.
- Custom endpoint provider model discovery may return an empty exclusive model menu after the global provider changes away from custom.
- Zen provider-locked threads should reuse the remembered Zen key from `providerKeys['opencode-zen']` even when the current global provider is not Zen.
- Sync Codex-auth detection should treat refresh-token-only auth as usable to match the async path.
- Materialization-pending `thread/read` fallback should preserve real thread metadata such as `modelProvider`, `model`, and `path` instead of returning a minimal synthetic thread.
- OpenRouter `customKey` should not be set true merely because a resolved key was recovered from community fallback state.
- `loadMessages()` should not fire redundant model preference refreshes during ordinary selected-thread loads.
- Optimistic user-message dedupe should compare attachment and skill identities, not only counts.
- Manual test docs should use `pnpm run dev --host ... --port ...`, not `npm run dev -- --host ... --port ...`.

## Related Files

- `src/server/codexAppServerBridge.ts`
- `src/composables/useDesktopState.ts`
- `src/server/freeMode.ts`
- `tests.md`
