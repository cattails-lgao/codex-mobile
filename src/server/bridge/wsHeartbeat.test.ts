// round-183：WS 心跳的确定性单测。用假 socket + 假定时器，不依赖真实网络。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachWebSocketHeartbeat, WS_HEARTBEAT_INTERVAL_MS, type HeartbeatSocket } from './wsHeartbeat'

type FakeSocket = HeartbeatSocket & {
  emitPong: () => void
  emitClose: () => void
  pings: number
  terminated: number
  listenerCount: () => number
}

function createFakeSocket(): FakeSocket {
  const listeners = new Map<string, Set<() => void>>()
  const socket: FakeSocket = {
    pings: 0,
    terminated: 0,
    ping() {
      socket.pings += 1
    },
    terminate() {
      socket.terminated += 1
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return socket
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener)
      return socket
    },
    emitPong() {
      for (const listener of [...(listeners.get('pong') ?? [])]) listener()
    },
    emitClose() {
      for (const listener of [...(listeners.get('close') ?? [])]) listener()
    },
    listenerCount() {
      let total = 0
      for (const set of listeners.values()) total += set.size
      return total
    },
  }
  return socket
}

afterEach(() => {
  vi.useRealTimers()
})

describe('attachWebSocketHeartbeat', () => {
  it('sends a ping on the configured cadence', () => {
    vi.useFakeTimers()
    const socket = createFakeSocket()
    attachWebSocketHeartbeat(socket, { intervalMs: 1_000 })

    expect(socket.pings).toBe(0)
    vi.advanceTimersByTime(1_000)
    expect(socket.pings).toBe(1)
    // 未回 pong 之前不再发第二个（下一次 tick 会判定死亡）。
    vi.advanceTimersByTime(999)
    expect(socket.pings).toBe(1)
  })

  it('keeps the connection when the peer answers with pong', () => {
    vi.useFakeTimers()
    const socket = createFakeSocket()
    const onDead = vi.fn()
    attachWebSocketHeartbeat(socket, { intervalMs: 1_000, onDead })

    for (let tick = 0; tick < 5; tick += 1) {
      vi.advanceTimersByTime(1_000)
      socket.emitPong()
    }

    expect(socket.pings).toBe(5)
    expect(onDead).not.toHaveBeenCalled()
    expect(socket.terminated).toBe(0)
  })

  it('terminates the connection after one full silent interval', () => {
    vi.useFakeTimers()
    const socket = createFakeSocket()
    attachWebSocketHeartbeat(socket, { intervalMs: 1_000 })

    vi.advanceTimersByTime(1_000) // 第一个 ping，尚未回 pong
    expect(socket.terminated).toBe(0)
    vi.advanceTimersByTime(1_000) // 整个周期无 pong ⇒ 判定死亡
    expect(socket.terminated).toBe(1)
    // 停掉后不再继续 ping / 重复 terminate。
    vi.advanceTimersByTime(5_000)
    expect(socket.terminated).toBe(1)
    expect(socket.pings).toBe(1)
  })

  it('stops pinging and releases listeners when the socket closes', () => {
    vi.useFakeTimers()
    const socket = createFakeSocket()
    attachWebSocketHeartbeat(socket, { intervalMs: 1_000 })

    socket.emitClose()
    const afterClose = socket.pings
    vi.advanceTimersByTime(10_000)

    expect(socket.pings).toBe(afterClose)
    expect(socket.terminated).toBe(0)
    expect(socket.listenerCount()).toBe(0)
  })

  it('survives a ping throw (already-closed socket) without leaving the timer running', () => {
    vi.useFakeTimers()
    const socket = createFakeSocket()
    const onDead = vi.fn()
    socket.ping = () => {
      throw new Error('socket closed')
    }
    attachWebSocketHeartbeat(socket, { intervalMs: 1_000, onDead })

    vi.advanceTimersByTime(1_000)
    expect(onDead).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5_000)
    expect(onDead).toHaveBeenCalledTimes(1)
  })

  it('exposes a 25s production cadence well under the 120s proxy idle timeout', () => {
    expect(WS_HEARTBEAT_INTERVAL_MS).toBe(25_000)
    expect(WS_HEARTBEAT_INTERVAL_MS * 2).toBeLessThan(120_000)
  })
})
