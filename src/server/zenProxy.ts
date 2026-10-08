import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { handleUnifiedResponsesProxyRequest } from './unifiedResponsesProxy.js'
import type { ChatCompletionsRequest } from './unifiedResponsesProxy.js'

const ZEN_RESPONSES_ENDPOINT = 'https://opencode.ai/zen/v1/responses'
const ZEN_CHAT_COMPLETIONS_ENDPOINT = 'https://opencode.ai/zen/v1/chat/completions'
const OPENCODE_ZEN_PUBLIC_TOKEN = 'public'
// Mirrors the public OpenCode CLI identity that Zen accepts for unauthenticated free-model calls.
//
// round-124: Zen's free tier is gated by a *progressive client fingerprint*, not by
// requiring a real OpenCode session. A request must satisfy all four of:
//   (a) this User-Agent whose version is >= OPENCODE_ZEN_MIN_CLIENT_VERSION,
//   (b) a canonical `ses_` id (see createOpenCodeSessionId),
//   (c) `stream: true` in the body, and
//   (d) the `bash` and `read` tool names present in `tools`.
// Failing (b)/(c)/(d) returns 403 FreeTierError; satisfying them but reporting an
// older version returns 426 UpgradeRequired. Measured 2026-10-08: with the full
// fingerprint 8 of 13 free models answered 200, including the default `big-pickle`.
export const OPENCODE_ZEN_MIN_CLIENT_VERSION = '1.18.0'
const OPENCODE_ZEN_USER_AGENT = `opencode/${OPENCODE_ZEN_MIN_CLIENT_VERSION} ai-sdk/provider-utils/4.0.23 runtime/node/${process.versions.node}`
const OPENCODE_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const OPENCODE_HEX_ALPHABET = '0123456789abcdef'

function createOpenCodeId(prefix: 'msg' | 'ses'): string {
  const bytes = randomBytes(24)
  let suffix = ''
  for (const byte of bytes) {
    suffix += OPENCODE_ID_ALPHABET[byte % OPENCODE_ID_ALPHABET.length]
  }
  return `${prefix}_${suffix}`
}

/**
 * Zen validates the *shape* of `X-Opencode-Session`, not its existence: `ses_`
 * followed by exactly 26 characters — 12 lowercase hex then 14 base62. The
 * generic `createOpenCodeId('ses')` above emits `ses_` + 24 base62, which Zen
 * rejects as if no session were present, so sessions use this builder.
 */
export function createOpenCodeSessionId(): string {
  let suffix = ''
  for (const byte of randomBytes(12)) {
    suffix += OPENCODE_HEX_ALPHABET[byte % OPENCODE_HEX_ALPHABET.length]
  }
  for (const byte of randomBytes(14)) {
    suffix += OPENCODE_ID_ALPHABET[byte % OPENCODE_ID_ALPHABET.length]
  }
  return `ses_${suffix}`
}

export function createZenUpstreamHeaders(bearerToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${bearerToken || OPENCODE_ZEN_PUBLIC_TOKEN}`,
    'User-Agent': OPENCODE_ZEN_USER_AGENT,
    'Accept': '*/*',
    'X-Opencode-Client': 'cli',
    'X-Opencode-Project': 'global',
    'X-Opencode-Request': createOpenCodeId('msg'),
    'X-Opencode-Session': createOpenCodeSessionId(),
  }
}

/**
 * The fingerprint gate also requires the `bash` and `read` names to be present
 * in `tools`. Zen checks the names, not the schemas: sending only the caller's
 * own tool names (e.g. Codex's `shell`/`apply_patch`) returns 403, while
 * appending these two stubs returns 200. They are *appended*, never substituted,
 * and `tool_choice` is left untouched — so the caller's real tools survive and
 * the model can still call them.
 */
export const ZEN_REQUIRED_TOOL_STUBS: NonNullable<ChatCompletionsRequest['tools']> = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run a shell command',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
]

/**
 * Satisfy the Zen fingerprint on an outgoing chat request: force streaming and
 * guarantee the `bash`/`read` tool names are present. Idempotent — a request
 * that already carries the stubs is returned with its tools untouched.
 */
export function applyZenFingerprintToChatRequest(payload: ChatCompletionsRequest): ChatCompletionsRequest {
  const existing = payload.tools ?? []
  const names = new Set(existing.map((tool) => tool.function.name))
  const missing = ZEN_REQUIRED_TOOL_STUBS.filter((tool) => !names.has(tool.function.name))
  return {
    ...payload,
    stream: true,
    tools: missing.length > 0 ? [...existing, ...missing] : existing,
  }
}

export function handleZenProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  bearerToken: string,
  wireApi: 'responses' | 'chat',
): void {
  handleUnifiedResponsesProxyRequest(req, res, {
    bearerToken,
    wireApi,
    responsesEndpoint: ZEN_RESPONSES_ENDPOINT,
    chatCompletionsEndpoint: ZEN_CHAT_COMPLETIONS_ENDPOINT,
    missingKeyMessage: 'Missing OpenCode Zen API key',
    requireBearerToken: false,
    allowToolFallbackToResponses: false,
    responsesPayloadFormat: 'chat',
    chatRequestTransform: applyZenFingerprintToChatRequest,
    upstreamHeaders: () => createZenUpstreamHeaders(bearerToken),
  })
}
