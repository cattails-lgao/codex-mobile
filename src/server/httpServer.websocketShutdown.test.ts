import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { describe, expect, it } from 'vitest'
import { shutdownWebSocketServer } from './httpServer.js'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Mirrors how createServer() wires the endpoint: a noServer WebSocketServer fed by the
// http server's upgrade event.
async function startHarness(): Promise<{ server: HttpServer; wss: WebSocketServer; port: number }> {
  const wss = new WebSocketServer({ noServer: true })
  const server = createHttpServer()
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ method: 'ready' }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { server, wss, port: (server.address() as AddressInfo).port }
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/codex-api/ws`)
    ws.on('message', () => resolve(ws))
    ws.on('error', reject)
  })
}

describe('shutdownWebSocketServer', () => {
  it('releases server.close() by terminating upgraded websocket clients', async () => {
    const { server, wss, port } = await startHarness()
    const client = await connectClient(port)

    let closed = false
    server.close(() => {
      closed = true
    })

    // Baseline: an upgraded socket is invisible to the http server's tracked connections, so
    // close() alone never calls back — this is what trips systemd's TimeoutStopSec.
    await delay(200)
    expect(closed).toBe(false)

    shutdownWebSocketServer(wss)
    await delay(200)
    expect(closed).toBe(true)

    client.terminate()
  })

  it('closes safely when no client is connected', async () => {
    const { server, wss } = await startHarness()
    expect(() => shutdownWebSocketServer(wss)).not.toThrow()
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  })
})
