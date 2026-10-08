import { describe, expect, it } from 'vitest'
import {
  OPENCODE_ZEN_MIN_CLIENT_VERSION,
  ZEN_REQUIRED_TOOL_STUBS,
  applyZenFingerprintToChatRequest,
  createOpenCodeSessionId,
  createZenUpstreamHeaders,
} from './zenProxy'
import type { ChatCompletionsRequest } from './unifiedResponsesProxy'

const CANONICAL_SESSION = /^ses_[0-9a-f]{12}[0-9a-zA-Z]{14}$/

describe('zen upstream fingerprint (round-124)', () => {
  it('reports a client version at or above the free-tier gate', () => {
    // Zen returns 426 UpgradeRequired below 1.18.0, so the advertised version must
    // never regress under the gate even if the constant is edited later.
    const [major, minor] = OPENCODE_ZEN_MIN_CLIENT_VERSION.split('.').map(Number)
    expect(major > 1 || (major === 1 && minor >= 18)).toBe(true)

    const headers = createZenUpstreamHeaders('')
    expect(headers['User-Agent']).toContain(`opencode/${OPENCODE_ZEN_MIN_CLIENT_VERSION} `)
  })

  it('emits a canonical ses_ session id (12 hex + 14 base62)', () => {
    // A `ses_` + 24 base62 id is silently treated as absent by Zen, which drops the
    // request back to the 403 gate — the shape is the whole point of this builder.
    for (let i = 0; i < 25; i += 1) {
      const id = createOpenCodeSessionId()
      expect(id).toMatch(CANONICAL_SESSION)
      expect(id).toHaveLength(4 + 26)
    }
  })

  it('carries the canonical session id plus bearer token in the request headers', () => {
    const headers = createZenUpstreamHeaders('sk-token')
    expect(headers['Authorization']).toBe('Bearer sk-token')
    expect(headers['X-Opencode-Session']).toMatch(CANONICAL_SESSION)
    expect(headers['X-Opencode-Request']).toMatch(/^msg_/)
    expect(headers['X-Opencode-Client']).toBe('cli')
  })

  it('falls back to the public token when no bearer token is configured', () => {
    expect(createZenUpstreamHeaders('')['Authorization']).toBe('Bearer public')
  })

  it('forces streaming and appends the bash/read stubs without dropping caller tools', () => {
    const payload: ChatCompletionsRequest = {
      model: 'big-pickle',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'exec_command' } }],
    }

    const result = applyZenFingerprintToChatRequest(payload)

    expect(result.stream).toBe(true)
    expect(result.tools?.map((tool) => tool.function.name)).toEqual(['exec_command', 'bash', 'read'])
    // The stubs are appended, never substituted, and the caller's payload is untouched.
    expect(payload.stream).toBeUndefined()
    expect(payload.tools).toHaveLength(1)
  })

  it('adds both stubs when the caller sent no tools at all', () => {
    const result = applyZenFingerprintToChatRequest({ model: 'big-pickle', messages: [] })
    expect(result.tools?.map((tool) => tool.function.name)).toEqual(['bash', 'read'])
  })

  it('is idempotent when the stubs are already present', () => {
    const result = applyZenFingerprintToChatRequest({
      model: 'big-pickle',
      messages: [],
      tools: [...ZEN_REQUIRED_TOOL_STUBS],
    })
    expect(result.tools).toHaveLength(2)
    expect(result.tools?.map((tool) => tool.function.name)).toEqual(['bash', 'read'])
  })

  it('does not append a duplicate when only one stub name is present', () => {
    const result = applyZenFingerprintToChatRequest({
      model: 'big-pickle',
      messages: [],
      tools: [{ type: 'function', function: { name: 'bash' } }],
    })
    expect(result.tools?.map((tool) => tool.function.name)).toEqual(['bash', 'read'])
  })

  it('leaves tool_choice untouched so the caller keeps control', () => {
    // Measured: tool_choice 'auto' (and unset) both pass the gate, so forcing 'none'
    // would only take tool use away from the caller for no benefit.
    const result = applyZenFingerprintToChatRequest({
      model: 'big-pickle',
      messages: [],
      tool_choice: 'auto',
    })
    expect(result.tool_choice).toBe('auto')
  })
})
