### OpenCode Zen Provider & Wire API Selector in codexui

#### Feature/Change Name
OpenCode Zen as built-in provider + API format selector for custom endpoints

#### Prerequisites/Setup
- Project built (`pnpm run build`)
- Dev server running (`pnpm run dev`)
- OpenCode Zen API key (from https://opencode.ai/auth)

#### Step-by-Step Actions

**Test 1: Select OpenCode Zen provider**
1. Open the app in browser
2. Click the provider dropdown in the sidebar settings
3. Select "OpenCode Zen"
4. Verify: An API key input field appears with "Get API key" link
5. Enter a valid OpenCode Zen API key (sk-...)
6. Click "Save"
7. Verify: Provider is saved, model list fetches from OpenCode Zen `/models` endpoint
8. Send a message — it should use `wire_api = "chat"` (Chat Completions API)

**Test 2: Select Custom endpoint with API format selector**
1. Select "Custom endpoint" from the provider dropdown
2. Enter a custom base URL (e.g., `https://opencode.ai/zen/v1`)
3. Enter an API key
4. Verify: An "API format" dropdown appears with "Responses API" (default) and "Chat Completions"
5. Select "Chat Completions"
6. Click "Save"
7. Verify: Provider is saved with `wireApi = "chat"`
8. Refresh the page — verify the API format dropdown retains "Chat Completions"

**Test 3: Provider persistence**
1. Select "OpenCode Zen", enter key, save
2. Refresh the page
3. Verify: Provider dropdown shows "OpenCode Zen" (not "Codex" or "OpenRouter")

**Test 4: Switch back to Codex**
1. From OpenCode Zen, select "Codex" provider
2. Verify: Free mode is disabled, standard Codex flow resumes

#### Expected Results
- OpenCode Zen appears in provider dropdown alongside Codex/OpenRouter/Custom
- OpenCode Zen defaults to `wire_api = "chat"` (Chat Completions API)
- Custom endpoints show an API format selector; default is "Responses API"
- Provider selection and wireApi are persisted in `~/.codex/webui-custom-providers.json`
- Model list for OpenCode Zen is fetched from `https://opencode.ai/zen/v1/models`

#### Rollback/Cleanup
- Switch provider back to "Codex" to disable free mode
- Project config files are not modified; only user-level state is written to `~/.codex/webui-custom-providers.json`
