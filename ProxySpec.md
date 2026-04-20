# Provider Proxy Spec

This document describes the local provider proxy used by Codex Web Local for OpenRouter, OpenCode Zen, and custom OpenAI-compatible endpoints.

## Goal

Codex CLI expects to talk to a Responses API-compatible provider. Many third-party providers either only support Chat Completions or support Responses with provider-specific tool restrictions. The local proxy keeps Codex speaking Responses API while adapting requests and responses to the selected upstream provider.

Success criteria:

- Codex always receives Responses-shaped responses from the local app server.
- Providers can be used in either Responses mode or Completions mode when supported.
- Tool calls, tool results, and bash execution continue to work in Completions mode.
- Upstream provider errors are returned as-is whenever possible.
- Provider-specific payload fixes are isolated in provider-specific wrappers.

## Local Routes

The app server exposes one Responses-compatible route per provider:

| Provider | Local route | Upstream Responses | Upstream Chat Completions |
| --- | --- | --- | --- |
| OpenRouter | `/codex-api/openrouter-proxy/v1/responses` | `https://openrouter.ai/api/v1/responses` | `https://openrouter.ai/api/v1/chat/completions` |
| OpenCode Zen | `/codex-api/zen-proxy/v1/responses` | `https://opencode.ai/zen/v1/responses` | `https://opencode.ai/zen/v1/chat/completions` |
| Custom endpoint | `/codex-api/custom-proxy/v1/responses` | `<baseUrl>/responses` | `<baseUrl>/chat/completions` |

Even when the user selects Completions mode, Codex is configured to call the local `/responses` route. The proxy performs the final upstream protocol conversion.

## Runtime Configuration

When the app server port is known, provider config is passed to Codex CLI with `-c` arguments instead of modifying `~/.codex/config.toml`.

OpenRouter:

```toml
model_provider = "openrouter-free"
model_providers.openrouter-free.base_url = "http://127.0.0.1:<port>/codex-api/openrouter-proxy/v1"
model_providers.openrouter-free.wire_api = "responses"
model_providers.openrouter-free.experimental_bearer_token = "openrouter-proxy-token"
```

OpenCode Zen:

```toml
model_provider = "opencode-zen"
model_providers.opencode-zen.base_url = "http://127.0.0.1:<port>/codex-api/zen-proxy/v1"
model_providers.opencode-zen.wire_api = "responses"
model_providers.opencode-zen.experimental_bearer_token = "zen-proxy-token"
```

Custom endpoint:

```toml
model_provider = "custom-endpoint"
model_providers.custom-endpoint.base_url = "http://127.0.0.1:<port>/codex-api/custom-proxy/v1"
model_providers.custom-endpoint.wire_api = "responses"
model_providers.custom-endpoint.experimental_bearer_token = "custom-proxy-token"
```

The token in Codex config is only a local proxy placeholder. The real provider key is read by the app server from `~/.codex/webui-free-mode.json`.

## Mode Selection

The persisted provider state contains `wireApi`:

```ts
type WireApi = 'responses' | 'chat'
```

The UI labels these as:

- `Responses`: forward to upstream Responses API.
- `Completions`: convert to upstream Chat Completions API.

For local proxy routes, Codex still uses `wire_api="responses"` in both modes. `wireApi` controls only what the proxy sends upstream.

## Unified Proxy Flow

All provider wrappers call `handleUnifiedResponsesProxyRequest`.

High-level flow:

1. Read the incoming Responses request from Codex.
2. Load the real provider bearer token and selected `wireApi`.
3. Decide upstream protocol:
   - Responses mode: send Responses payload upstream.
   - Completions mode: convert to Chat Completions payload.
   - Provider fallback: optionally force Responses when tools require it.
4. Send request to upstream provider.
5. If upstream used Chat Completions, convert the response back to Responses format.
6. Return status, body, and errors to Codex.

## Responses To Chat Translation

When using Chat Completions upstream, the proxy maps:

| Responses field/item | Chat Completions field/item |
| --- | --- |
| `input: string` | one `user` message |
| `instructions` | one leading `system` message |
| `input[].type = "message"` | message with mapped role |
| `role = "developer"` | `system` role |
| `function_call` | assistant message with `tool_calls` |
| `function_call_output` | `tool` message with `tool_call_id` |
| `computer_call_output` | `tool` message with `tool_call_id` |
| `max_output_tokens` | `max_tokens` |
| `temperature` | `temperature` |
| `top_p` | `top_p` |
| `tools[].type = "function"` | `tools[].type = "function"` with nested `function` object |
| `tool_choice` function | Chat function `tool_choice` |

Unsupported non-function tools are omitted from Chat Completions payloads because standard Chat Completions only accepts function tools.

## Chat To Responses Translation

When upstream returns a Chat Completions response, the proxy maps:

| Chat Completions item | Responses item |
| --- | --- |
| `choices[].message.content` | `output[].type = "message"` with `output_text` |
| `choices[].message.tool_calls[]` | `output[].type = "function_call"` |
| `tool_calls[].id` | `call_id` |
| `tool_calls[].function.name` | `name` |
| `tool_calls[].function.arguments` | `arguments` |
| `usage.prompt_tokens` | `usage.input_tokens` |
| `usage.completion_tokens` | `usage.output_tokens` |
| `usage.total_tokens` | `usage.total_tokens` |

This is the critical part that lets Codex continue its tool loop after a Chat Completions provider asks for a bash/tool call.

## Streaming Behavior

If Chat Completions streaming is active and no tool loop is involved, the proxy converts streaming chat deltas into Responses-style server-sent events:

- `response.created`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.output_text.done`
- `response.content_part.done`
- `response.output_item.done`
- `response.completed`

If the upstream Chat Completions response is non-streaming but Codex requested streaming, the proxy sends a synthetic Responses SSE completion from the final converted response.

## Provider Wrappers

Provider wrappers only define provider-specific endpoints and behavior.

### OpenRouter

OpenRouter wrapper:

- Responses endpoint: `https://openrouter.ai/api/v1/responses`
- Chat endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Allows fallback to Responses when tools or tool outputs are present.
- Sanitizes Responses tool entries before forwarding to OpenRouter.

Allowed OpenRouter Responses tool types:

- `function`
- `openrouter:datetime`
- `openrouter:image_generation`
- `openrouter:experimental__search_models`
- `openrouter:web_search`

If no valid tools remain after sanitization, the proxy removes both `tools` and `tool_choice`.

This prevents OpenRouter from rejecting Codex-local tool descriptors with errors like:

```text
Invalid Responses API request
tools[N]: No matching discriminator
```

### OpenCode Zen

OpenCode Zen wrapper:

- Responses endpoint: `https://opencode.ai/zen/v1/responses`
- Chat endpoint: `https://opencode.ai/zen/v1/chat/completions`
- Uses `responsesPayloadFormat: "chat"` for Responses endpoint compatibility.
- Does not fallback to Responses for tool traffic in Completions mode.

### Custom Endpoint

Custom endpoint wrapper:

- Responses endpoint: `<baseUrl>/responses`
- Chat endpoint: `<baseUrl>/chat/completions`
- Does not filter provider-advertised models.
- Does not apply provider-specific tool sanitization.
- Returns upstream errors without rewriting them when possible.

## Why Direct Chat Mode Was Not Enough

Directly setting Codex to `wire_api="chat"` is not reliable for this app because Codex and the app server expect Responses-shaped tool-loop semantics. A plain Chat Completions provider can return valid text, but Codex may not receive the function-call output shape it needs to continue with bash/tool execution.

The local proxy solves this by:

- Presenting Responses API to Codex.
- Translating Chat Completions tool calls back into Responses `function_call` items.
- Translating tool results from Responses input back into Chat `tool` messages on the next request.

## Why OpenRouter Failed Before

The failing `hi` case happened because Codex sent a Responses request containing tool entries that OpenRouter does not accept in its Responses schema. OpenRouter validated the full `tools` array and rejected the request before the model could answer.

The proxy fix avoids that failure by sanitizing OpenRouter Responses tools and by routing Completions mode through the unified adapter.

## Error Handling

Rules:

- Missing local provider key returns a local `401` with the provider-specific missing-key message.
- Upstream JSON errors are forwarded with their original status when possible.
- Non-JSON upstream failures are returned as JSON with the raw response prefix as the message.
- Network/proxy failures return `502` with `Proxy error: <message>`.
- The proxy must not replace provider errors with unrelated auth-refresh errors.

## Caveats

The proxy is a compatibility adapter, not a guarantee that every provider behaves identically to OpenAI Responses API.

- No custom prompts are injected by the proxy. Behavior changes come from request/response translation only.
- Completions mode still presents a local Responses API surface to Codex. This is intentional because Codex tool execution depends on Responses-shaped tool-loop semantics.
- OpenRouter Responses mode sanitizes unsupported tool entries. This avoids schema rejection, but it also means unsupported provider tools are not available unless explicitly allowed by the OpenRouter wrapper.
- Non-function tools are not converted into Chat Completions tools. Standard Chat Completions only supports function tools in the shape this proxy emits.
- Streaming tool-call deltas from Chat Completions are not fully reconstructed. Tool-capable turns should rely on non-streaming responses or providers that return complete tool calls.
- Provider-specific built-in tools need explicit wrapper support. Adding a provider does not automatically make its custom tool types work.
- Custom endpoints are assumed to be OpenAI-compatible. If a custom provider has a non-OpenAI schema, it needs a dedicated wrapper or adapter.
- The proxy cannot make a weak model use tools correctly. It can preserve the protocol path, but tool-call quality still depends on the selected model.
- Large context, provider rate limits, provider payload limits, and provider-side safety/filtering errors are still upstream constraints.
- Chat Completions translation is intentionally conservative. Unknown Responses fields are not all mirrored into Chat payloads because sending provider-unsupported fields can break otherwise valid requests.
- Error forwarding depends on upstream response shape. JSON provider errors are preserved best; HTML/plain-text failures are wrapped into a JSON error for Codex.
- Local proxy placeholder bearer tokens are not security boundaries. They prevent Codex from needing direct provider keys, but the app server still holds and forwards the real key.

## TODO

- Add automated unit tests for Responses-to-Chat message conversion, including `function_call`, `function_call_output`, and `developer` role mapping.
- Add automated unit tests for Chat-to-Responses conversion, including assistant text, tool calls, usage mapping, and empty choices.
- Add integration tests with mocked upstream providers for OpenRouter, OpenCode Zen, and custom endpoint modes.
- Add a regression test for the OpenRouter invalid tool discriminator failure.
- Add a regression test that asks for `codex --version` in Completions mode and verifies a bash/tool call is emitted and completed.
- Add explicit handling for Chat Completions streaming tool-call deltas if providers used in practice stream tool calls instead of returning complete tool calls.
- Add structured proxy diagnostics in development mode that show selected upstream protocol, sanitized tool count, and upstream status without logging secrets.
- Add provider capability metadata so the UI can warn when a selected mode/provider combination has known limitations.
- Add a small compatibility matrix to the settings UI or docs for tested models/providers.
- Add stricter validation for custom endpoint base URLs before saving settings.
- Add opt-in debug capture for raw upstream request/response metadata with API keys and payload content redacted.
- Revisit OpenCode Zen `responsesPayloadFormat: "chat"` after upstream behavior stabilizes or official docs clarify the expected payload.

## Manual Verification

Recommended smoke tests:

1. OpenRouter Responses mode, send `hi`.
2. OpenRouter Completions mode, ask `what codex cli version is?`; verify bash runs.
3. OpenCode Zen Completions mode, ask `what codex cli version is?`; verify bash runs.
4. Custom endpoint Completions mode against `http://127.0.0.1:8666/v1`, ask `what codex cli version is?`; verify bash runs.
5. Custom endpoint model list should keep provider-advertised models, including `auto-*` aliases.
6. Provider errors should display the actual upstream message.

## Code Map

- Unified adapter: `src/server/unifiedResponsesProxy.ts`
- OpenRouter wrapper: `src/server/openRouterProxy.ts`
- OpenCode Zen wrapper: `src/server/zenProxy.ts`
- Custom endpoint wrapper: `src/server/customEndpointProxy.ts`
- Provider CLI config: `src/server/freeMode.ts`
- App server proxy routes: `src/server/codexAppServerBridge.ts`
- UI API mode toggles: `src/App.vue`
