# OpenCode Zen + Big Pickle Model Configuration

Big Pickle is a free stealth model available on [OpenCode Zen](https://opencode.ai/docs/zen/) during its beta period. It uses the Chat Completions API exclusively.

## Compatibility Matrix

| Tool | Version | Works? | Notes |
|------|---------|--------|-------|
| Codex CLI | v0.93.0 | Yes | Last version with `wire_api = "chat"` |
| Codex CLI | v0.118.0+ | No | Removed chat completions support |
| OpenCode CLI | v1.4.3 | Yes | Pipe empty stdin in non-TTY: `echo "" \| opencode run --pure "msg"` |
| Direct curl | - | Yes | POST to `/v1/chat/completions` |

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

## Codex Web Local Proxy Behavior

Codex Web Local can expose OpenCode Zen through its local Responses-compatible proxy. The proxy translates between Codex-style Responses input and Zen's Chat Completions-only API.

For thinking-mode models behind `big-pickle`, the proxy must preserve assistant reasoning in both directions:
- Upstream Chat `message.reasoning_content` becomes a Responses `reasoning` output item.
- Later Responses `reasoning` input becomes assistant Chat `reasoning_content`.
- Reasoning that precedes function calls is attached to the assistant tool-call message.
- Streaming Chat `reasoning_content` deltas are emitted as synthetic Responses reasoning output.

This behavior was fixed in commit `47d52c8c` after a Docker repro using an empty `CODEX_HOME`, no login, and no Zen API key.

## Related
- Source: [opencode-zen-big-pickle-codex-cli.md](../../raw/fixes/opencode-zen-big-pickle-codex-cli.md)
- Source: [opencode-zen-reasoning-content-proxy.md](../../raw/fixes/opencode-zen-reasoning-content-proxy.md)
- [merge-to-main-workflow.md](./merge-to-main-workflow.md)
