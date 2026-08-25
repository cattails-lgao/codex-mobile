import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { handleEventsHttpRequest } from './eventsRoutes'

function createResponse() {
  const response = new EventEmitter() as EventEmitter & {
    statusCode: number
    writableEnded: boolean
    destroyed: boolean
    setHeader: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }
  response.statusCode = 0
  response.writableEnded = false
  response.destroyed = false
  response.setHeader = vi.fn()
  response.write = vi.fn()
  response.end = vi.fn(() => {
    response.writableEnded = true
  })
  return response
}

describe('handleEventsHttpRequest', () => {
  it('passes non-events GET requests through to Vite', async () => {
    const response = createResponse()
    const subscribeNotifications = vi.fn()

    await expect(handleEventsHttpRequest(
      Object.assign(new EventEmitter(), { method: 'GET', url: '/' }) as IncomingMessage,
      response as never,
      { subscribeNotifications },
    )).resolves.toBe(false)

    expect(subscribeNotifications).not.toHaveBeenCalled()
    expect(response.write).not.toHaveBeenCalled()
  })

  it('opens SSE only for the exact events endpoint', async () => {
    const response = createResponse()
    const unsubscribe = vi.fn()
    const subscribeNotifications = vi.fn(() => unsubscribe)

    await expect(handleEventsHttpRequest(
      Object.assign(new EventEmitter(), { method: 'GET', url: '/codex-api/events?source=test' }) as IncomingMessage,
      response as never,
      { subscribeNotifications },
    )).resolves.toBe(true)

    expect(response.statusCode).toBe(200)
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream; charset=utf-8')
    expect(response.write).toHaveBeenCalledWith('event: ready\ndata: {"ok":true}\n\n')
  })
})
