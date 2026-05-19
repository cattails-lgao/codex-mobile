### Free Mode (OpenRouter)

#### Feature
Toggle "Free mode" in settings to use free OpenRouter models without an OpenAI API key. Uses XOR-encrypted community keys that rotate randomly per request. Default model is `openrouter/free` — OpenRouter's meta-model that auto-routes to the least-loaded free model, avoiding per-model rate limits. Model selector shows only free models when free mode is on. Config is isolated from `~/.codex/config.toml` — state stored in `~/.codex/webui-custom-providers.json` and passed to app-server via `-c` CLI args.

#### Prerequisites
- Project built: `pnpm run build`.
- Codex CLI installed and available in PATH.

#### Steps
1. Start the server: `node dist-cli/index.js --no-tunnel --no-open --no-login`.
2. Open the UI in a browser (default `http://localhost:5999`).
3. Open the sidebar settings panel (gear icon).
4. Toggle **Free mode (OpenRouter)** ON.
5. Verify the toggle turns on and model dropdown changes to `openrouter/free`.
6. Click the model dropdown — verify it shows **only** free models (gemma, llama, qwen, etc.) and no GPT/OpenAI default models.
7. Verify `~/.codex/config.toml` was NOT modified (no `model_provider` or `model` entries added).
8. Verify `~/.codex/webui-custom-providers.json` exists and contains `{"enabled":true,"apiKey":"sk-or-v1-...","model":"openrouter/free"}`.
9. Open a new thread and send a message (e.g. "Say hello").
10. Verify a response comes back from a free OpenRouter model (may be rate-limited during high demand).
11. Toggle **Free mode (OpenRouter)** OFF.
12. Verify the model dropdown reverts to GPT-5.3-codex (or default OpenAI model).
13. Verify model dropdown shows normal OpenAI models (not free models).

#### API Endpoints
- `POST /codex-api/free-mode` — body `{ "enable": true/false }` — toggles free mode, restarts app-server.
- `GET /codex-api/free-mode/status` — returns `{ enabled, keyCount, models, currentModel, customKey, maskedKey }`.
- `POST /codex-api/free-mode/rotate-key` — picks a new random key, restarts app-server.
- `POST /codex-api/free-mode/custom-key` — body `{ "key": "sk-or-v1-..." }` — sets a custom OpenRouter API key. Send empty string to revert to community keys.
- `GET /codex-api/provider-models` — returns `{ data: [...], exclusive: true }` when free mode is on (only free models shown).

#### Custom API Key
- When free mode is ON, an "OpenRouter API key" input appears below the toggle in settings.
- Enter your own `sk-or-v1-...` key and click "Set" (or press Enter) to use your own OpenRouter key.
- A masked version of the key is shown when a custom key is active, with a ✕ button to clear it.
- Clearing the custom key reverts to community keys.

#### Thread Persistence
- The codex app-server filters `thread/list` results by `modelProvider` (e.g. `openai` vs `openrouter-free`).
- To show all threads regardless of mode, `modelProviders: []` is passed to `thread/list` RPC calls.
- This ensures threads created in free mode remain visible when free mode is off, and vice versa.
- Toggling free mode ON/OFF preserves all threads — no data is lost.
- Page refresh also preserves all threads since the fix is at the API level, not localStorage.

#### Known Limitations
- `wire_api="chat"` is not supported by the codex CLI — must use `wire_api="responses"`.
- Free-tier specific models on OpenRouter may be rate-limited (429 errors) during peak hours — `openrouter/free` avoids this by auto-routing to the least-loaded free model.

#### Expected Results
- Free mode ON: App-server is restarted with `-c` config args for openrouter-free provider. Model selector shows only free models.
- Free mode OFF: App-server is restarted without free mode args. Model selector shows default models.
- `~/.codex/config.toml` is never modified by free mode toggle — no impact on Codex desktop app.
- 68 encrypted keys available, decrypted at runtime with XOR key `er54s4`.
- Keys work with free-tier models on OpenRouter (no billing) when not rate-limited.
- Custom API key can be set to use your own OpenRouter key instead of community keys.

#### Rollback/Cleanup
- Remove `src/server/freeMode.ts`, revert changes in `codexAppServerBridge.ts`, `codexGateway.ts`, and `App.vue`.
- Delete `~/.codex/webui-custom-providers.json` to clear free mode state.
