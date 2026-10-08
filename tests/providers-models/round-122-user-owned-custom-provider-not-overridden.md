### Feature: User-owned `custom` provider survives the legacy compatibility placeholder

#### Prerequisites
- A `CODEX_HOME` whose `config.toml` activates a provider literally named `custom`:
  ```toml
  model = "deepseek-flash"
  model_provider = "custom"

  [model_providers.custom]
  name = "litellm"
  base_url = "http://127.0.0.1:4460/v1"
  wire_api = "responses"
  ```
- The provider above must be reachable (or the failure will be a normal model error, which is fine for step 3).
- Not required for steps 1–2: a working model endpoint.

#### Steps
1. Start the app with that `CODEX_HOME` (`codex-mobile-re -p 3030 --no-password --no-tunnel --no-open --no-login`, or the dev server with `CODEX_HOME` + `CODEXUI_SERVER_PORT` set).
2. Ask the app-server what it actually believes, through the running bridge:
   ```bash
   curl -s -X POST http://127.0.0.1:3030/codex-api/rpc \
     -H 'Content-Type: application/json' \
     -d '{"method":"config/read","params":{}}'
   ```
3. Send any message in a thread.

#### Expected Results
- Step 2 shows the user's own definition, **not** the placeholder:
  - `model_providers.custom.name = "litellm"`
  - `model_providers.custom.base_url = "http://127.0.0.1:4460/v1"`
  - `model_provider = "custom"` (the active provider is the user's, not `Legacy Custom Endpoint`)
- Step 3 reaches the user's endpoint. A failure there is a normal provider/model error; it must **not** be `ERROR: Reconnecting... waiting for network` looping forever.
- On a `CODEX_HOME` that does **not** define `custom`, the compatibility placeholder is still registered, and its `base_url` points at `http://127.0.0.1:<port>/codex-api/provider-compat/v1`. Posting to that route answers `400` with
  `This thread uses a legacy compatibility provider that has no endpoint. Start a new thread, or define [model_providers.custom] in your config.toml to send from here.`
  (previously it pointed at the unreachable `http://127.0.0.1:9/v1`, which made the CLI spin on `Reconnecting... 1/5` — that endpoint has no listener at all).

#### Rollback/Cleanup
- Nothing is written outside `CODEX_HOME`; remove any temporary `CODEX_HOME` you created.
- If you changed a real `config.toml` to test this, restore it.
