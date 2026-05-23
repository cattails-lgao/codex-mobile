# OpenCode Zen Public Client Headers

## Feature / Change

OpenCode Zen no-auth requests sent through the local Zen proxy include OpenCode-style public client headers so `big-pickle` requests do not hit the unauthenticated free usage limiter.

## Prerequisites / Setup

- Start the app with no Codex auth available so OpenCode Zen fallback is active.
- Confirm `config/read` reports `model_provider = "opencode_zen"` and `model = "big-pickle"`.

## Actions

1. Send `hi` from a new thread using the default `big-pickle` model.
2. Inspect the app response and server logs.
3. Optionally enable `CODEXUI_PROXY_DEBUG=1` and repeat if an upstream error occurs.

## Expected Result

- The assistant responds successfully.
- The upstream error is not `FreeUsageLimitError`.
- Zen proxy requests include `Authorization: Bearer public`, `User-Agent: opencode/...`, and `X-Opencode-*` client/session/request headers when no user Zen key is configured.

## Rollback / Cleanup

- Stop the local app server.
- Remove any temporary no-auth `CODEX_HOME` used for the test.
