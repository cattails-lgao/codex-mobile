### Unified provider proxy: OpenRouter + OpenCode Zen tool-capable completions

#### Feature/Change Name
Both OpenRouter and OpenCode Zen routes use a unified Responses proxy layer that preserves tool-capable behavior when using Completions mode.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Valid OpenRouter and/or OpenCode Zen API keys configured
3. Existing thread open

#### Steps
1. Select `OpenRouter`, set API format to `Completions`, and send: `what codex cli version is? it should run bash commands`
2. Confirm shell execution appears and includes `codex --version`
3. Select `OpenCode Zen`, set API format to `Completions`, and send the same prompt
4. Confirm shell execution appears and includes `codex --version`
5. Repeat each provider once with simple `hi` to verify non-tool path still returns assistant text normally

#### Expected Results
- Both providers work through a common proxy path without provider-specific regressions
- In Completions mode, tool-capable prompt triggers command execution for both providers
- `codex --version` output is returned in the assistant response flow
- Simple text prompt (`hi`) continues to work in Completions mode

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults
