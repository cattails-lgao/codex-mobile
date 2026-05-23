# OpenCode Zen Reasoning Content Proxy Fix

Date: 2026-05-09

## Problem

When unauthenticated Codex Web Local defaulted to OpenCode Zen `big-pickle`, a multi-turn workflow could fail after the model produced thinking-mode metadata and tool calls:

```json
{"error":{"message":"Error from provider (DeepSeek): The `reasoning_content` in the thinking mode must be passed back to the API.","type":"invalid_request_error","param":null,"code":"invalid_request_error"}}
```

The reproducing prompt was:

```text
Use the skill from https://anyclaw.store/skills/anyclaw-publish/SKILL.md

Then build me a beautiful todo list app and deploy it to Anyclaw.
```

The failure appeared on the second turn after an initial `hi` turn, when Codex sent prior assistant reasoning and tool-call context back through the local Zen proxy.

## Root Cause

OpenCode Zen's `big-pickle` route maps to a DeepSeek thinking-mode model that requires prior assistant `reasoning_content` to be included in later Chat Completions requests.

The local unified Responses proxy was translating Chat Completions responses into Responses-format output, but it did not fully round-trip `reasoning_content` back into later Chat Completions messages. It also had a Zen path where a Chat-shaped payload could be sent to the Responses endpoint instead of `/v1/chat/completions`.

## Fix

Commit: `47d52c8c Preserve Zen reasoning content across tool calls`

Changed files:
- `src/server/unifiedResponsesProxy.ts`
- `src/server/unifiedResponsesProxy.test.ts`
- `tests.md`

Implementation details:
- Added `reasoning_content` to internal Chat message translation.
- Translates upstream Chat Completions `message.reasoning_content` into Responses `reasoning` output items.
- Translates prior Responses `reasoning` items back into assistant Chat messages as `reasoning_content`.
- Preserves reasoning before assistant tool-call messages.
- Sends Chat-shaped Zen proxy requests to the Chat Completions endpoint.
- Preserves streaming `reasoning_content` deltas in the synthetic Responses stream.

## Verification

Commands:

```bash
pnpm vitest run src/server/unifiedResponsesProxy.test.ts
pnpm run build
```

Docker validation:
- Test server URL: `http://localhost:15900`
- Empty `CODEX_HOME`, no Codex login, no Zen API key.
- Free mode status reported `provider: "opencode-zen"`, `currentModel: "big-pickle"`, `wireApi: "chat"`.
- A synthetic multi-turn Responses payload with prior reasoning, assistant text, tool calls, and tool outputs returned HTTP 200 for both `stream:false` and `stream:true`.
- The exact app-level prompt reached the second turn without `reasoning_content`, `invalid_request_error`, or provider-error markers in thread state or fresh Docker logs.

## Operational Note

The Docker test container command re-extracts `/tmp/app.tar` into `/app` on restart. Copying only `dist-cli/index.js` into `/app` is overwritten on restart; update `/tmp/app.tar` before restarting when testing rebuilt bundles in that container.
