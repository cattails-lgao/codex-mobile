// round-183：`/codex-api/ws` 的心跳。
//
// 背景（线上实测）：nginx 的 proxy_read_timeout 是 120s，而这个 WebSocket 在
// 连接建立后只发一帧 `ready`，之后线程空闲时**没有任何流量**。于是每 120s
// 被中间层判死（客户端看到 code=1006，无 close 帧），前端退避重连后又会收到
// `ready` → `recoverBridgeState()` → 每 2 分钟白打一次
// `GET /codex-api/server-requests/pending`，DevTools 里还留一条红色 WS 记录。
//
// 修法：服务端按固定间隔发 ws 控制帧 ping（浏览器自动回 pong），让链路上始终
// 有字节流动；连续一个周期没收到 pong 说明连接已死，直接 terminate，避免僵死
// 连接继续占用订阅。
import type { WebSocket } from 'ws'

export const WS_HEARTBEAT_INTERVAL_MS = 25_000

/** 只依赖心跳需要的那几个成员，便于用假 socket 做确定性单测。 */
export type HeartbeatSocket = {
  ping: () => void
  terminate: () => void
  on: (event: 'pong' | 'close' | 'error', listener: () => void) => unknown
  off?: (event: 'pong' | 'close' | 'error', listener: () => void) => unknown
}

export type WebSocketHeartbeatOptions = {
  intervalMs?: number
  /** 判定连接死亡后调用（默认 terminate）。测试里可替换以断言。 */
  onDead?: () => void
}

/**
 * 给单个连接挂心跳，返回清理函数（幂等）。
 *
 * 判定口径：每个 tick 先在「上一 tick 之后是否收到过 pong」上做决定，再发下一
 * 个 ping。这样单次丢包不会误杀，连续静默一个整周期才中止。
 */
export function attachWebSocketHeartbeat(
  socket: HeartbeatSocket,
  options: WebSocketHeartbeatOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? WS_HEARTBEAT_INTERVAL_MS
  const onDead = options.onDead ?? (() => {
    try {
      socket.terminate()
    } catch {
      // 连接可能已在两次 tick 之间被对端关掉。
    }
  })

  let alive = true
  let stopped = false

  const handlePong = () => {
    alive = true
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    socket.off?.('pong', handlePong)
    socket.off?.('close', stop)
    socket.off?.('error', stop)
  }

  const timer = setInterval(() => {
    if (stopped) return
    if (!alive) {
      stop()
      onDead()
      return
    }
    alive = false
    try {
      socket.ping()
    } catch {
      stop()
      onDead()
    }
  }, intervalMs)

  // 心跳不该拖住进程退出。
  const unrefable = timer as unknown as { unref?: () => void }
  if (typeof unrefable.unref === 'function') unrefable.unref()

  socket.on('pong', handlePong)
  socket.on('close', stop)
  socket.on('error', stop)

  return stop
}

/** 生产环境用：直接作用于 ws 实例。 */
export function attachHeartbeatToWebSocket(ws: WebSocket): () => void {
  return attachWebSocketHeartbeat(ws as unknown as HeartbeatSocket)
}
