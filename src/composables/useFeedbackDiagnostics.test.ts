import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildFeedbackMailto,
  recordFeedbackDiagnostic,
  useFeedbackDiagnostics,
} from './useFeedbackDiagnostics'

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: 'TestAgent/1.0' })
  vi.stubGlobal('window', {
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    location: {
      href: 'http://127.0.0.1:4173/#/',
    },
  })
  useFeedbackDiagnostics().diagnostics.value = []
})

describe('feedback diagnostics', () => {
  it('keeps feedback hidden until a diagnostic is recorded', () => {
    const state = useFeedbackDiagnostics()

    expect(state.hasFeedbackDiagnostics.value).toBe(false)

    state.recordVisibleFailure('Failed to load folders')

    expect(state.hasFeedbackDiagnostics.value).toBe(true)
  })

  it('builds a mailto with context and recent diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'api-response',
      message: 'Request failed with HTTP 500',
      url: '/codex-api/rpc',
      method: 'POST',
      status: 500,
      statusText: 'Internal Server Error',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const mailto = buildFeedbackMailto()
    const parsed = new URL(mailto)
    const body = parsed.searchParams.get('body') ?? ''

    expect(mailto.startsWith('mailto:brutalstrikedevs@gmail.com?')).toBe(true)
    expect(parsed.searchParams.get('subject')).toContain('Request failed with HTTP 500')
    expect(body).toContain('URL: http://127.0.0.1:4173/#/')
    expect(body).toContain('User agent: TestAgent/1.0')
    expect(body).toContain('Viewport: 390x844 @2x')
    expect(body).toContain('POST | /codex-api/rpc | 500 Internal Server Error')
  })

  it('dedupes identical newest diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message: 'Failed to load folders',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:01.000Z',
    })

    expect(useFeedbackDiagnostics().diagnostics.value).toHaveLength(1)
  })

  it('uses a single-line subject for multiline diagnostics', () => {
    recordFeedbackDiagnostic({
      kind: 'window-error',
      message: 'Top level failure\n    at stack frame\n    at another frame',
      url: 'http://127.0.0.1:4173/#/',
      atIso: '2026-05-12T03:00:00.000Z',
    })

    const subject = new URL(buildFeedbackMailto()).searchParams.get('subject') ?? ''

    expect(subject).toBe('Codex Web feedback: Top level failure')
  })
})
