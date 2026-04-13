# OpenCode Zen Big Pickle + Codex CLI Fix

Date: 2026-04-13

## Problem
Big Pickle model (free stealth model on OpenCode Zen) only supports the Chat Completions API (`/v1/chat/completions`), but Codex CLI v0.118+ removed `wire_api = "chat"` support entirely (only Responses API `/v1/responses` is supported).

Additionally, `opencode run "message"` hangs in non-TTY environments (like Cursor's shell) because it waits for stdin.

## Solution

### Codex CLI Approach
Downgrade Codex CLI to v0.93.0 which still supports `wire_api = "chat"`:
```bash
npm install -g @openai/codex@0.93.0
```

Config (`~/.codex/config.toml`):
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

Usage:
```bash
export OPENCODE_ZEN_API_KEY="sk-..."
echo "say hi" | codex exec --profile pickle
```

### OpenCode CLI Approach
The `opencode run` command hangs in non-TTY environments because it waits for stdin. Fix: pipe empty stdin.

Config (`~/.config/opencode/opencode.json`):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/big-pickle",
  "provider": {
    "opencode": {
      "options": {
        "apiKey": "sk-..."
      }
    }
  }
}
```

Usage:
```bash
echo "" | opencode run --pure "say hi"
echo "" | opencode run --pure --format json "say hi"
```

### Direct API
```bash
curl -X POST "https://opencode.ai/zen/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-..." \
  -d '{"model":"big-pickle","messages":[{"role":"user","content":"say hi"}],"max_tokens":100}'
```

## Key Facts
- Big Pickle endpoint: `https://opencode.ai/zen/v1/chat/completions`
- Big Pickle does NOT support `/v1/responses` (returns "Model big-pickle not supported for format openai")
- Big Pickle is free during beta, 200K context window, 128K max output
- Codex CLI v0.93.0 is the last version that reliably supports `wire_api = "chat"`
- Codex CLI v0.95.0+ (Feb 4, 2026) removed chat completions support
- OpenCode CLI v1.4.3 works but needs `echo "" |` prefix in non-TTY environments
