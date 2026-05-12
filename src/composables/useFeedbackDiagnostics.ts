import { computed, ref } from 'vue'

const FEEDBACK_EMAIL = 'brutalstrikedevs@gmail.com'
const MAX_DIAGNOSTICS = 20
const MAX_BODY_CHARS = 6500
const MAX_PAGE_TEXT_CHARS = 1800

export type FeedbackDiagnosticKind = 'window-error' | 'unhandled-rejection' | 'fetch-error' | 'api-response' | 'visible-error'

export type FeedbackDiagnostic = {
  kind: FeedbackDiagnosticKind
  message: string
  atIso: string
  url?: string
  method?: string
  status?: number
  statusText?: string
}

const diagnostics = ref<FeedbackDiagnostic[]>([])
let listenersInstalled = false
let fetchInstalled = false
let originalFetch: typeof window.fetch | null = null

function normalizeMessage(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function normalizeFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const initMethod = init?.method?.trim()
  if (initMethod) return initMethod.toUpperCase()
  if (typeof input === 'object' && 'method' in input && typeof input.method === 'string' && input.method.trim()) {
    return input.method.trim().toUpperCase()
  }
  return 'GET'
}

function normalizeSubjectMessage(message?: string): string {
  const firstLine = (message || '').split(/\r?\n/, 1)[0] ?? ''
  return firstLine.replace(/\s+/g, ' ').trim().slice(0, 80) || 'issue report'
}

function readVisiblePageText(): string {
  if (typeof document === 'undefined') return 'unknown'
  const text = document.body?.innerText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
  if (!text) return 'No visible page text captured.'
  return text.length > MAX_PAGE_TEXT_CHARS
    ? `${text.slice(0, MAX_PAGE_TEXT_CHARS)}\n...[truncated]`
    : text
}

export function recordFeedbackDiagnostic(input: Omit<FeedbackDiagnostic, 'atIso'> & { atIso?: string }): void {
  const message = input.message.trim()
  if (!message) return
  const newest = diagnostics.value[0]
  if (
    newest &&
    newest.kind === input.kind &&
    newest.message === message &&
    newest.url === input.url &&
    newest.method === input.method &&
    newest.status === input.status
  ) {
    return
  }

  const next: FeedbackDiagnostic = {
    ...input,
    message,
    atIso: input.atIso ?? new Date().toISOString(),
  }
  diagnostics.value = [next, ...diagnostics.value].slice(0, MAX_DIAGNOSTICS)
}

export function buildFeedbackMailto(entries: FeedbackDiagnostic[] = diagnostics.value): string {
  const viewport = typeof window === 'undefined'
    ? 'unknown'
    : `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`
  const currentUrl = typeof window === 'undefined' ? 'unknown' : window.location.href
  const userAgent = typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent
  const appVersion = import.meta.env.VITE_APP_VERSION || 'unknown'
  const worktreeName = import.meta.env.VITE_WORKTREE_NAME || 'unknown'
  const recentDiagnostics = entries.slice(0, 12).map((entry, index) => {
    const parts = [
      `${index + 1}. [${entry.atIso}] ${entry.kind}`,
      entry.method ? `${entry.method}` : '',
      entry.url ?? '',
      typeof entry.status === 'number' ? `${entry.status} ${entry.statusText ?? ''}`.trim() : '',
      entry.message,
    ].filter(Boolean)
    return parts.join(' | ')
  }).join('\n')

  const body = [
    'What happened?',
    '',
    '',
    'Context',
    `URL: ${currentUrl}`,
    `User agent: ${userAgent}`,
    `Viewport: ${viewport}`,
    `App version: ${appVersion}`,
    `Worktree: ${worktreeName}`,
    '',
    'Recent diagnostics',
    recentDiagnostics || 'No diagnostics captured.',
    '',
    'Visible page text',
    readVisiblePageText(),
  ].join('\n').slice(0, MAX_BODY_CHARS)

  const params = new URLSearchParams({
    subject: `Codex Web feedback: ${normalizeSubjectMessage(entries[0]?.message)}`,
    body,
  })
  return `mailto:${FEEDBACK_EMAIL}?${params.toString()}`
}

export function openFeedbackMail(): void {
  if (typeof window === 'undefined') return
  window.location.href = buildFeedbackMailto()
}

export function installFeedbackDiagnostics(): void {
  if (typeof window === 'undefined') return

  if (!listenersInstalled) {
    listenersInstalled = true
    window.addEventListener('error', (event) => {
      recordFeedbackDiagnostic({
        kind: 'window-error',
        message: event.error ? normalizeMessage(event.error) : event.message,
        url: event.filename || window.location.href,
      })
    })
    window.addEventListener('unhandledrejection', (event) => {
      recordFeedbackDiagnostic({
        kind: 'unhandled-rejection',
        message: normalizeMessage(event.reason),
        url: window.location.href,
      })
    })
  }

  if (!fetchInstalled) {
    if (typeof window.fetch !== 'function') {
      recordFeedbackDiagnostic({
        kind: 'fetch-error',
        message: 'Feedback diagnostics could not monitor fetch: window.fetch is unavailable',
        url: window.location.href,
      })
      return
    }

    try {
      originalFetch = window.fetch.bind(window)
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = normalizeFetchUrl(input)
        const method = normalizeFetchMethod(input, init)
        try {
          const response = await originalFetch!(input, init)
          if (!response.ok) {
            recordFeedbackDiagnostic({
              kind: url.includes('/codex-api/') ? 'api-response' : 'fetch-error',
              message: `Request failed with HTTP ${response.status}`,
              url,
              method,
              status: response.status,
              statusText: response.statusText,
            })
          }
          return response
        } catch (error) {
          recordFeedbackDiagnostic({
            kind: 'fetch-error',
            message: normalizeMessage(error),
            url,
            method,
          })
          throw error
        }
      }) as typeof window.fetch
      fetchInstalled = true
    } catch (error) {
      originalFetch = null
      fetchInstalled = false
      try {
        recordFeedbackDiagnostic({
          kind: 'fetch-error',
          message: `Feedback diagnostics could not monitor fetch: ${normalizeMessage(error)}`,
          url: window.location.href,
        })
      } catch {
        // Startup diagnostics must never prevent the app from mounting.
      }
    }
  }
}

export function useFeedbackDiagnostics() {
  const hasFeedbackDiagnostics = computed(() => diagnostics.value.length > 0)

  function recordVisibleFailure(message: string, url?: string): void {
    recordFeedbackDiagnostic({
      kind: 'visible-error',
      message,
      url: url || (typeof window === 'undefined' ? undefined : window.location.href),
    })
  }

  return {
    diagnostics,
    hasFeedbackDiagnostics,
    recordVisibleFailure,
    openFeedbackMail,
    buildFeedbackMailto,
  }
}
