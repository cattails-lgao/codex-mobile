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

## Related
- Source: [opencode-zen-big-pickle-codex-cli.md](../../raw/fixes/opencode-zen-big-pickle-codex-cli.md)
- [merge-to-main-workflow.md](./merge-to-main-workflow.md)
