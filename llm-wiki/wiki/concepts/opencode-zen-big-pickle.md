# OpenCode Zen + Big Pickle Model Configuration

Big Pickle is a free stealth model available on [OpenCode Zen](https://opencode.ai/docs/zen/) during its beta period. It uses the Chat Completions API exclusively.

## Free-Tier Gate Change (measured 2026-10-08, round-123)

**This page's "Direct curl works" premise is obsolete.** Since 2026-09 the Zen free tier is gated on a **client fingerprint**, enforced server-side and tightened in stages. Measured progression against `https://opencode.ai/zen/v1` with `NO_PROXY='*'`:

| Request shape | Result |
|---|---|
| bare, or with the legacy `zenProxy` spoof headers | `403 FreeTierError: ...free tier can only be used from within OpenCode` |
| `+ X-Opencode-Session: ses_<12 hex><14 Base62>` (26 chars; the proxy used to send 24) | `403` (unchanged) |
| `+ stream: true` | `403` (unchanged) |
| `+ function tools named bash and read` | **`426 UpgradeRequired: OpenCode 1.18.0 or newer is required to use the free tier`** — the previous gate passed |
| `+ User-Agent: opencode/1.18.0` (proxy hard-codes `1.15.9`) | gates pass; per-model availability decides |

With all four satisfied, **8 of 13 free models returned 200 with real content** (`big-pickle`, `mimo-v2.6-flash-free`, `space-bunny-free`, `longcat-2.5-preview-free`, `ling-3.1-flash-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `fledge-alpha-free`); `muse-spark-*.contributor-free` returns `403 RegionError` outside some regions, and 3 others fail upstream.

Consequences already applied in round-123:
- The **default free-mode fallback** no longer seeds OpenCode Zen (it would 403 for every new user); it seeds the OpenRouter community pool instead.
- The Zen offline model list no longer advertises `minimax-m2.5-free` / `nemotron-3-super-free` / `trinity-large-preview-free` — all three are **gone from the catalog**.
- The fingerprint was deliberately **not** updated: satisfying it means continuously defeating an access control the provider states explicitly, and the gate has already tightened twice. See `codex-mobile-handover/rounds/round-123-free-fallback-and-zen-fingerprint-gate.md`.

Note the anonymous free lane is separate from the **keyed** lane: a syntactically valid but bogus `sk-…` key returns `401 AuthError` (not `403`), so a real Zen API key is a different door. `GET /v1/models` remains open (200, no auth). `POST /v1/responses` returns `500` upstream — the working endpoint is `/v1/chat/completions`.

## Compatibility Matrix

| Tool | Version | Works? | Notes |
|------|---------|--------|-------|
| Codex CLI | v0.93.0 | Yes | Last version with `wire_api = "chat"` |
| Codex CLI | v0.118.0+ | No | Removed chat completions support |
| OpenCode CLI | v1.4.3 | Yes | Pipe empty stdin in non-TTY: `echo "" \| opencode run --pure "msg"` |
| Direct curl | - | **No longer** | Was: POST to `/v1/chat/completions`. Now needs the 4-part free-tier fingerprint, or a real API key |

## Config Recipes

### Codex CLI (`~/.codex/config.toml`)
```toml
[model_providers.opencode-zen]
name = "OpenCode Zen"
base_url = "https://opencode.ai/zen/v1"
env_key = "OPENCODE_ZEN_API_KEY"
wire_api = "chat"

[profiles.pickle]
model = "big-pickle"
model_provider = "opencode-zen"
```

### OpenCode CLI (`~/.config/opencode/opencode.json`)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/big-pickle",
  "provider": {
    "opencode": {
      "options": { "apiKey": "sk-..." }
    }
  }
}
```

## Gotchas
- Big Pickle only supports `/v1/chat/completions`, NOT `/v1/responses`
- `opencode run` hangs without piped stdin in headless environments
- Codex CLI deprecation warning for `wire_api = "chat"` is safe to ignore on v0.93.0
- In Codex Web Local's Zen proxy, DeepSeek thinking-mode responses must round-trip `reasoning_content` into later Chat Completions messages. Missing this field can produce `The reasoning_content in the thinking mode must be passed back to the API`.
- Chat-shaped Zen proxy payloads must be posted to `/v1/chat/completions`, even when the incoming local request uses the Responses-shaped `/responses` route.
- In no-auth Docker mode, OpenCode Zen provider models are authoritative. Fetch `/codex-api/provider-models` before relying on Codex `model/list`, because `model/list` may return Codex catalog rows or fail independently.
- During authenticated Docker first-turn startup, `thread ... is not materialized yet; includeTurns is unavailable before first user message` is a transient in-progress state, not a chat error.

## Codex Web Local Proxy Behavior

Codex Web Local can expose OpenCode Zen through its local Responses-compatible proxy. The proxy translates between Codex-style Responses input and Zen's Chat Completions-only API.

For thinking-mode models behind `big-pickle`, the proxy must preserve assistant reasoning in both directions:
- Upstream Chat `message.reasoning_content` becomes a Responses `reasoning` output item.
- Later Responses `reasoning` input becomes assistant Chat `reasoning_content`.
- Reasoning that precedes function calls is attached to the assistant tool-call message.
- Streaming Chat `reasoning_content` deltas are emitted as synthetic Responses reasoning output.

This behavior was fixed in commit `47d52c8c` after a Docker repro using an empty `CODEX_HOME`, no login, and no Zen API key.

## Docker Auth and Model Loading

Codex Web Local's unauthenticated Docker path should use OpenCode Zen only as a runtime fallback. It should not permanently write fallback provider configuration, and it should not depend on Codex `model/list` for the Zen selector.

Validated Docker states:
- Empty `CODEX_HOME`: `config/read` reports `model = "big-pickle"` and `model_provider = "opencode-zen"`, the app-server command includes local Zen proxy flags, and the model selector loads provider models from `/codex-api/provider-models`.
- `auth.json` mounted into `CODEX_HOME`: `config/read` reports `model = null` and `model_provider = null`, the app-server command has no Zen flags, and sending `hi` uses the default Codex provider path.

The first authenticated turn may briefly make `thread/read includeTurns=true` fail with `not materialized yet; includeTurns is unavailable before first user message`. The bridge maps that exact response to an in-progress empty live state with no `liveStateError`; real `thread/read` failures still surface as errors.

## Copied Auth Promotion

If a container starts without auth and later receives a valid `auth.json`, Codex auth should take precedence over community fallback provider state. This matters when a user starts in no-auth Zen mode, switches to OpenRouter, then copies auth into `CODEX_HOME`.

Expected behavior after copying auth and reloading:
- Community fallback provider state (`openrouter` or `opencode-zen` without a custom key) is suppressed.
- Provider promotes to Codex.
- Accounts imports the copied active auth file and the badge updates from `0` to at least `1`.
- The new-thread composer shows a concrete Codex model, not a generic `Model` placeholder.
- Stale historical diagnostics do not show a `Send feedback / Issue detected` row unless a current visible error remains.

User-configured provider state is preserved: OpenRouter with `customKey: true`, OpenCode Zen with an explicit API key, and custom endpoint providers should not be suppressed merely because Codex auth exists.

This behavior was fixed in commit `7ee94f83` and validated in a packaged Docker image by running: no-auth Zen startup, switch to OpenRouter, copy host `auth.json`, reload, verify Codex provider + Accounts `1`, send `hi`, and wait for a Codex reply.

## Thread-Locked Providers

Threads capture their provider at creation time. Existing threads should use their captured `modelProvider` for model-list filtering and sends, while a new chat uses the current global provider at the moment it is created.

Expected behavior:
- A no-auth Zen thread keeps Zen models such as `big-pickle` after Codex auth appears.
- A new chat created after Codex auth appears uses Codex/GPT models.
- A new chat created after switching Settings to OpenRouter uses OpenRouter models.
- One project can contain Zen, Codex, and OpenRouter threads without model-menu leakage from the last opened thread.

The client resolves existing-thread model menus from `useDesktopState.threadModelProviderByThreadId`. The server `/codex-api/provider-models` route accepts a provider-specific request so an older Zen thread can still load Zen model ids while the current global provider is Codex.

## App-Server Config Restart

When `auth.json` or provider state changes while local Vite is still running, the embedded Codex app-server can otherwise keep the provider config it was spawned with. The observed failure was: Settings showed `Codex` after copying auth into an isolated `CODEX_HOME`, but the new-chat composer still showed `big-pickle` because `config/read` still came from the stale no-auth Zen app-server process.

The bridge fixes this by storing a startup-config signature and checking it before each RPC. If the desired app-server args or provider env vars changed, the bridge disposes the stale process and lets the next RPC start app-server with current auth/provider state.

Validation notes:
- Browser Use reload of `http://127.0.0.1:4173/#/` changed the new-chat model from `big-pickle` to `GPT-5.5`.
- `config/read` returned `model: null` and `model_provider: null`, matching the Codex default provider path.
- Home-route profiling reported no warnings, `threadRead: 0`, `threadResume: 0`, and `totalApiKB: 50.1`.

## Remaining Provider-Lock Risks

PR review comments on the provider-lock branch identified follow-up risks to resolve before treating provider isolation as complete:
- Provider-backed model discovery must honor the requested provider for non-Zen/non-OpenRouter providers instead of falling back to global `config.model_provider`.
- Custom endpoint threads need a non-empty provider-scoped model strategy after the global provider changes away from custom.
- Provider-locked Zen threads should reuse a remembered Zen key from `providerKeys` even when Zen is not the current global provider.
- Sync and async Codex-auth detection should agree on refresh-token-only auth files.
- Materialization-pending `thread/read` fallback should preserve real thread metadata, including `modelProvider`.
- OpenRouter community fallback keys must not be misclassified as user custom keys.
- Selected-thread message loads should avoid redundant model metadata refreshes.

## Related
- Source: [opencode-zen-big-pickle-codex-cli.md](../../raw/fixes/opencode-zen-big-pickle-codex-cli.md)
- Source: [opencode-zen-reasoning-content-proxy.md](../../raw/fixes/opencode-zen-reasoning-content-proxy.md)
- Source: [opencode-zen-docker-auth-provider-models.md](../../raw/fixes/opencode-zen-docker-auth-provider-models.md)
- Source: [copied-auth-provider-promotion.md](../../raw/fixes/copied-auth-provider-promotion.md)
- Source: [thread-locked-provider-models.md](../../raw/fixes/thread-locked-provider-models.md)
- Source: [provider-config-restart-and-review-followups.md](../../raw/fixes/provider-config-restart-and-review-followups.md)
- [merge-to-main-workflow.md](./merge-to-main-workflow.md)
