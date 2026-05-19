### env_key Authentication for Custom Providers (codex CLI v0.93.0)

#### Feature/Change
Use `env_key` instead of `experimental_bearer_token` for API key injection when spawning the codex `app-server` subprocess. API keys are passed as environment variables to the subprocess rather than CLI config arguments.

#### Prerequisites/Setup
- codex CLI v0.93.0 installed
- Dev server running (`pnpm run dev`)
- OpenCode Zen API key: any valid key from opencode.ai

#### Step-by-Step Actions

**Test 1: OpenCode Zen with big-pickle model**
1. Open Settings, select "OpenCode Zen" provider
2. Enter a valid API key, save
3. In the model dropdown, select `big-pickle`
4. Type "say SUCCESSTEST in one word" and click Send
5. Wait for response (typically 3-5 seconds)
6. Verify: AI responds with "SUCCESSTEST"

**Test 2: Verify env var is set on subprocess**
1. After step 1-2 above, run: `ps -p $(pgrep -f "codex app-server" | tail -1) -E | tr ' ' '\n' | grep OPENCODE`
2. Verify: `OPENCODE_ZEN_API_KEY=sk-...` appears in the process environment

**Test 3: Model mismatch causes 401 (expected)**
1. With OpenCode Zen provider active, select a paid model like `gpt-5.4-mini`
2. Send a message
3. Verify: 401 Unauthorized error appears (OpenCode Zen returns 401 for paid models without billing)
4. Switch to `big-pickle` and retry — should succeed

**Test 4: wire_api deprecation awareness**
1. Run: `OPENCODE_ZEN_API_KEY="<key>" codex -c 'model_providers.oz.wire_api="chat"' -c 'model_providers.oz.base_url="https://opencode.ai/zen/v1"' -c 'model_providers.oz.env_key="OPENCODE_ZEN_API_KEY"' -c 'model_provider="oz"' -m big-pickle exec "say hi"`
2. Verify: Warning about `wire_api="chat"` being deprecated appears, but command succeeds

#### Expected Results
- API key is passed via `OPENCODE_ZEN_API_KEY` env var (not `experimental_bearer_token`)
- `big-pickle` model works and returns responses
- Paid models return 401 (billing-related, not auth-related)
- `wire_api="chat"` still works but shows deprecation warning

#### Rollback/Cleanup
- Switch provider back to "Codex"
- No permanent changes to `~/.codex/config.toml`

---
