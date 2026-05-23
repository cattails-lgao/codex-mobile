### Codex CLI + OpenCode Zen Big Pickle Model

#### Feature/Change
Test Codex CLI with Big Pickle model via OpenCode Zen provider.

#### Prerequisites/Setup
1. Codex CLI v0.93.0 installed (`npm install -g @openai/codex@0.93.0`) - this version supports `wire_api = "chat"` which Big Pickle requires.
2. OpenCode CLI v1.4.3+ installed (`npm install -g opencode`).
3. OpenCode Zen API key set as env var: `export OPENCODE_ZEN_API_KEY="sk-..."`
4. Config in `~/.codex/config.toml`:
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
5. OpenCode config in `~/.config/opencode/opencode.json`:
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

#### Step-by-Step Actions

**Test 1: Codex CLI with Big Pickle (profile)**
1. `export OPENCODE_ZEN_API_KEY="sk-..."`
2. `echo "say hi" | codex exec --profile pickle`
3. Expect: Big Pickle responds with a greeting. Shows `provider: opencode-zen` in header.

**Test 2: Codex CLI with inline config**
1. `echo "say hi" | OPENCODE_ZEN_API_KEY="sk-..." codex exec -m "big-pickle" -c 'model_provider="opencode-zen"'`
2. Expect: Same response.

**Test 3: OpenCode CLI with Big Pickle**
1. `echo "" | opencode run --pure "say hi"`
2. Expect: Big Pickle responds with a greeting.

**Test 4: Direct API verification**
1. `curl -s -X POST "https://opencode.ai/zen/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer sk-..." -d '{"model":"big-pickle","messages":[{"role":"user","content":"say hi"}],"max_tokens":100}'`
2. Expect: JSON response with `choices[0].message.content` containing a greeting.

#### Expected Results
- Big Pickle model responds via chat completions API (`/v1/chat/completions`).
- Big Pickle is free during beta period.
- Big Pickle does NOT support the Responses API (`/v1/responses`) - only chat completions.
- Codex CLI v0.118+ will NOT work with Big Pickle (removed `wire_api = "chat"` support).
- Codex CLI v0.93.0 works with `wire_api = "chat"`.

#### Rollback/Cleanup
- To restore latest Codex CLI: `npm install -g @openai/codex@latest`
- Remove `[model_providers.opencode-zen]` and `[profiles.pickle]` from `~/.codex/config.toml`.
- Remove API key from environment.

---
