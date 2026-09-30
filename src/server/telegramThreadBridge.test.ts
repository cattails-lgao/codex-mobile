import { describe, expect, it } from 'vitest'
import { TelegramThreadBridge } from './telegramThreadBridge.js'

type Call = { method: string; params: Record<string, unknown> }

const turn = (id: string, items: unknown[]) => ({ id, items })
const assistantItem = (text: string) => ({ type: 'agentMessage', text })
const userItem = (text: string) => ({ type: 'userMessage', content: [{ type: 'text', text }] })

function makeBridge(handler: (method: string, params: Record<string, unknown>) => unknown) {
  const calls: Call[] = []
  const appServer = {
    rpc: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params })
      return handler(method, params)
    },
    onNotification: () => () => undefined,
  }
  return { bridge: new TelegramThreadBridge(appServer as never), calls }
}

const readLatest = (bridge: TelegramThreadBridge, threadId: string): Promise<string> =>
  (bridge as unknown as { readLatestAssistantMessage(id: string): Promise<string> }).readLatestAssistantMessage(threadId)
const readHistory = (bridge: TelegramThreadBridge, threadId: string): Promise<string> =>
  (bridge as unknown as { readThreadHistorySummary(id: string): Promise<string> }).readThreadHistorySummary(threadId)

// The bounded path: metadata read + one newest page (newest-first), short page.
const boundedHandler = (threadId: string) => (method: string, params: Record<string, unknown>): unknown => {
  if (method === 'thread/read') {
    if (params.includeTurns === false) return { thread: { id: threadId, path: '/p', status: { type: 'idle' } } }
    return { thread: { id: threadId, path: '/p', turns: [turn('t-old', [assistantItem('OLD')]), turn('t-new', [assistantItem('NEW')])] } }
  }
  if (method === 'thread/turns/list') {
    return { data: [turn('t-new', [assistantItem('NEW')]), turn('t-old', [assistantItem('OLD')])], nextCursor: '' }
  }
  throw new Error(`unexpected ${method}`)
}

describe('TelegramThreadBridge bounded reads (round-111)', () => {
  it('reads the latest assistant reply from the newest page, not the full history', async () => {
    const { bridge, calls } = makeBridge(boundedHandler('t1'))

    expect(await readLatest(bridge, 't1')).toBe('NEW')
    expect(calls.some((call) => call.method === 'thread/turns/list')).toBe(true)
    expect(calls.some((call) => call.method === 'thread/read' && call.params.includeTurns === true)).toBe(false)
  })

  it('builds the history summary from the newest page, not the full history', async () => {
    const { bridge, calls } = makeBridge((method, params) => {
      if (method === 'thread/read' && params.includeTurns === false) {
        return { thread: { id: 't1', status: { type: 'idle' } } }
      }
      if (method === 'thread/turns/list') {
        return {
          data: [
            turn('t-new', [userItem('second question'), assistantItem('NEW')]),
            turn('t-old', [userItem('first question'), assistantItem('OLD')]),
          ],
          nextCursor: '',
        }
      }
      throw new Error(`unexpected ${method}`)
    })

    const summary = await readHistory(bridge, 't1')
    expect(summary).toContain('Assistant: NEW')
    expect(summary).toContain('User: first question')
    expect(calls.some((call) => call.method === 'thread/read' && call.params.includeTurns === true)).toBe(false)
  })

  it('replays the full read when the turn page fails', async () => {
    const { bridge, calls } = makeBridge((method, params) => {
      if (method === 'thread/read') {
        if (params.includeTurns === false) return { thread: { id: 't1', path: '/p', status: { type: 'idle' } } }
        return { thread: { id: 't1', path: '/p', turns: [turn('t-new', [assistantItem('NEW')])] } }
      }
      if (method === 'thread/turns/list') throw new Error('page boom')
      throw new Error(`unexpected ${method}`)
    })

    expect(await readLatest(bridge, 't1')).toBe('NEW')
    expect(calls.some((call) => call.method === 'thread/read' && call.params.includeTurns === true)).toBe(true)
  })
})
