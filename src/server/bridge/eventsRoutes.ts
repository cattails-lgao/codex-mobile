// /codex-api/events SSE HTTP route, sliced out of createCodexBridgeMiddleware.
// The handler is a pure pass-through from the shell-owned notification
// subscription stream: it only touches the injected `subscribeNotifications`
// (which aggregates appServer / terminalManager / externalSessionTracker
// notifications) plus the ServerResponse lifecycle. Because barely anything is
// captured here, deps is a single narrow structural type and this slice never
// imports back into the bridge shell.
import type { IncomingMessage, ServerResponse } from 'node:http'

type NotificationListener = (value: { method: string; params: unknown; atIso: string }) => void

export type EventsHttpRouteDeps = {
  subscribeNotifications: (listener: NotificationListener) => () => void
}

export async function handleEventsHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: EventsHttpRouteDeps,
): Promise<boolean> {
  if (req.method === 'GET') {
    const { subscribeNotifications } = deps

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    const unsubscribe = subscribeNotifications((notification: { method: string; params: unknown; atIso: string }) => {
      if (res.writableEnded || res.destroyed) return
      res.write(`data: ${JSON.stringify(notification)}\n\n`)
    })

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`)
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n')
    }, 15000)

    const close = () => {
      clearInterval(keepAlive)
      unsubscribe()
      if (!res.writableEnded) {
        res.end()
      }
    }

    req.on('close', close)
    req.on('aborted', close)
    return true
  }

  return false
}