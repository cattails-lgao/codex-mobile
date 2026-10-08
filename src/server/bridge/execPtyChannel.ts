import { randomUUID } from 'node:crypto'
import { asRecord, readNonEmptyString } from './core.js'
import type { SpawnTerminal, TerminalPty } from '../terminalManager.js'

/**
 * Official exec/PTY channel: drives `command/exec { tty: true }` on the
 * app-server and adapts it to the `SpawnTerminal` shape that
 * `ThreadTerminalManager` consumes, so the integrated terminal no longer needs
 * a locally built native PTY.
 *
 * Why this replaces node-pty: node-pty is an *optional* native dependency, so
 * any host where its build fails silently loses the whole integrated terminal
 * (`available: false`). The app-server is already required for everything else,
 * and its exec channel gives a real PTY on every platform the app-server runs
 * on. Measured on the local 0.158.0 app-server (Windows): `command/exec
 * {tty:true}` produces ANSI sequences plus a real shell banner/prompt,
 * `outputDelta` notifications arrive incrementally, `command/exec/write` round
 * trips keystrokes, and resize/terminate are accepted.
 *
 * round-131 复测（codex-cli 0.160.1，直连 app-server + 隔离 home）：本节这批行为逐项复验
 * 通过——`command/exec {tty:true}` 仍产出 ANSI 序列与 Windows banner/提示符、`outputDelta`
 * 多帧增量到达（4 帧 4 个时刻）、`write` 回显命中、`resize`/`terminate` 被接受、两会话输出
 * 不串、大输出 283 帧 38KB 未触发 `capReached`、UTF-8 往返正确、`exit` 的延后响应
 * `{exitCode:0}`、`terminate` 后 `exitCode` 为 1（与本节「退出码透传」一节记录一致）。
 *
 * Protocol details that shape this adapter:
 *   - bytes are base64 in both directions (`deltaBase64`), so we encode on the
 *     way in and decode on the way out;
 *   - a `command/exec` session is connection-scoped -- if the app-server
 *     connection drops, the server terminates the process;
 *   - the final `command/exec` response is deferred until the process exits and
 *     is sent only after every `outputDelta`, so `onData` always precedes
 *     `onExit`;
 *   - `command/exec/write` is an async RPC while `TerminalPty.write` is
 *     synchronous, so writes are chained to keep keystroke order;
 *   - `disableTimeout`/`disableOutputCap` are requested because an interactive
 *     terminal must neither be killed by a server default timeout nor truncated
 *     by a server default byte cap -- `ThreadTerminalManager` does its own
 *     16 KiB trim.
 */

type ExecRpc = (method: string, params: unknown) => Promise<unknown>
type ExecNotification = { method: string, params: unknown }

export type ExecPtyChannelOptions = {
  rpc: ExecRpc
  onNotification: (listener: (notification: ExecNotification) => void) => () => void
}

type ExecPtySession = {
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(event: { exitCode: number, signal?: number }) => void>
  pendingData: string[]
  exitEvent: { exitCode: number } | null
  writeChain: Promise<void>
}

const OUTPUT_DELTA_METHOD = 'command/exec/outputDelta'
const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

export function createExecPtySpawn(options: ExecPtyChannelOptions): SpawnTerminal {
  const sessions = new Map<string, ExecPtySession>()

  const dispatchData = (session: ExecPtySession, data: string): void => {
    if (session.dataListeners.size === 0) {
      // Output can land before the manager attaches its handler (the RPC is
      // fire-and-forget, the handler is registered right after spawn returns).
      session.pendingData.push(data)
      return
    }
    for (const listener of session.dataListeners) {
      listener(data)
    }
  }

  const settleExit = (session: ExecPtySession, exitCode: number): void => {
    if (session.exitEvent) return
    session.exitEvent = { exitCode }
    for (const listener of session.exitListeners) {
      listener({ exitCode })
    }
  }

  options.onNotification((notification) => {
    if (notification.method !== OUTPUT_DELTA_METHOD) return
    const params = asRecord(notification.params)
    const processId = readNonEmptyString(params?.processId)
    const session = processId ? sessions.get(processId) : undefined
    if (!session) return
    const encoded = readNonEmptyString(params?.deltaBase64)
    if (!encoded) return
    dispatchData(session, Buffer.from(encoded, 'base64').toString('utf8'))
  })

  return (file, args, opt) => {
    const processId = randomUUID()
    const session: ExecPtySession = {
      dataListeners: new Set(),
      exitListeners: new Set(),
      pendingData: [],
      exitEvent: null,
      writeChain: Promise.resolve(),
    }
    sessions.set(processId, session)

    void options
      .rpc('command/exec', {
        command: [file, ...args],
        processId,
        tty: true,
        size: {
          cols: normalizeDimension(opt.cols, DEFAULT_COLS),
          rows: normalizeDimension(opt.rows, DEFAULT_ROWS),
        },
        ...(opt.cwd ? { cwd: opt.cwd } : {}),
        env: buildExecEnv(opt.env),
        disableTimeout: true,
        disableOutputCap: true,
      })
      .then((result) => {
        settleExit(session, readExitCode(result))
      })
      .catch((error: unknown) => {
        // Surface the reason inside the terminal itself, then report an exit so
        // the manager tears the session down instead of leaving it hanging.
        const message = error instanceof Error ? error.message : String(error)
        dispatchData(session, `\r\n[terminal] failed to start: ${message}\r\n`)
        settleExit(session, -1)
      })
      .finally(() => {
        sessions.delete(processId)
      })

    const pty: TerminalPty = {
      write(data: string): void {
        session.writeChain = session.writeChain
          .then(() =>
            options.rpc('command/exec/write', {
              processId,
              deltaBase64: Buffer.from(data, 'utf8').toString('base64'),
            }),
          )
          .then(
            () => undefined,
            () => undefined,
          )
      },
      resize(cols: number, rows: number): void {
        void options
          .rpc('command/exec/resize', {
            processId,
            size: {
              cols: normalizeDimension(cols, DEFAULT_COLS),
              rows: normalizeDimension(rows, DEFAULT_ROWS),
            },
          })
          .catch(() => undefined)
      },
      kill(): void {
        void options.rpc('command/exec/terminate', { processId }).catch(() => undefined)
      },
      onData(listener: (data: string) => void): { dispose: () => void } {
        session.dataListeners.add(listener)
        if (session.pendingData.length > 0) {
          const buffered = session.pendingData.splice(0, session.pendingData.length)
          for (const chunk of buffered) {
            listener(chunk)
          }
        }
        return {
          dispose: () => {
            session.dataListeners.delete(listener)
          },
        }
      },
      onExit(listener: (event: { exitCode: number, signal?: number }) => void): { dispose: () => void } {
        session.exitListeners.add(listener)
        if (session.exitEvent) {
          listener(session.exitEvent)
        }
        return {
          dispose: () => {
            session.exitListeners.delete(listener)
          },
        }
      },
    }
    return pty
  }
}

/**
 * The protocol's `env` is an *override* map merged into the server-computed
 * environment (`null` unsets an inherited name), so the manager's full env can
 * be forwarded as-is. TERMINFO lookups are explicitly unset: an app-server-
 * hosted PTY must not resolve terminfo from the server's own environment.
 */
function buildExecEnv(env: Record<string, string> | undefined): Record<string, string | null> {
  const overrides: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value === 'string') overrides[key] = value
  }
  overrides.TERMINFO = null
  overrides.TERMINFO_DIRS = null
  return overrides
}

/**
 * The deferred `command/exec` response carries the process exit code
 * (`{ exitCode, stdout, stderr }`). An absent or non-numeric value is treated as
 * a clean exit rather than as an error: by the time this resolves the process is
 * gone either way, and the manager reports whatever code we hand it.
 */
function readExitCode(result: unknown): number {
  const value = asRecord(result)?.exitCode
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeDimension(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(500, Math.trunc(parsed)))
}
