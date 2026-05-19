### Custom endpoint Completions via local Responses proxy

#### Feature/Change Name
Custom endpoint `Completions` mode uses a local Responses-compatible proxy so current Codex CLI versions do not reject `wire_api="chat"`.

#### Prerequisites/Setup
1. Dev server running (`pnpm run dev`)
2. Local OpenAI-compatible endpoint running at `http://127.0.0.1:8666/v1`
3. API key `pwd`

#### Steps
1. Open Settings
2. Set Provider to `Custom endpoint`
3. Enter Custom endpoint URL `http://127.0.0.1:8666/v1`
4. Enter API key `pwd`
5. Set API format to `Completions`
6. Save
7. Select model `claude-sonnet-4.5`
8. Send `hi`
9. Select model `glm-5`
10. Send `hi`
11. In the same thread, ask `what is latest codex cli version?`

#### Expected Results
- The Codex app-server starts with `wire_api="responses"` against `/codex-api/custom-proxy/v1`
- The custom provider save records a usable default model from `/models` when available
- The Codex app-server receives the custom default model via runtime config
- The model list preserves endpoint-advertised models, including `auto-*` aliases
- The local proxy forwards the request to `/v1/chat/completions`
- The UI renders an assistant greeting such as `Hey! How can I help you today?`
- `glm-5` returns a successful assistant response
- Follow-up tool-output turns do not fail with Kiro Gateway's generic `payload size exceeded ~615KB` error when the payload is small

#### Rollback/Cleanup
- Switch provider/API format back to preferred defaults

---
