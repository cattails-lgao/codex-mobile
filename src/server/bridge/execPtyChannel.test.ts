import { describe, expect, it } from 'vitest'
import { createExecPtySpawn } from './execPtyChannel'
import type { TerminalPty } from '../terminalManager'

type RpcCall = { method: string, params: Record<string, unknown> }
type Deferred = { resolve: (value: unknown) => void, reject: (error: unknown) => void }

function decode(data: unknown): string {
  return Buffer.from(String(data), 'base64').toString('utf8')
}

function createHarness() {
  const calls: RpcCall[] = []
  const pendingExec = new Map<string, Deferred>()
  const writeDelays: number[] = []
  let nextWriteDelay = 30
  let notificationHandler: ((notification: { method: string, params: unknown }) => void) | null = null

  const spawn = createExecPtySpawn({
    rpc: async (method, params) => {
      const record = (params ?? {}) as Record<string, unknown>
      calls.push({ method, params: record })
      if (method === 'command/exec') {
        // The real response is deferred until the process exits.
        return new Promise((resolve, reject) => {
          pendingExec.set(String(record.processId), { resolve, reject })
        })
      }
      if (method === 'command/exec/write') {
        // Decreasing delays: only a serialised chain keeps keystroke order.
        const delay = nextWriteDelay
        nextWriteDelay -= 10
        writeDelays.push(delay)
        await new Promise((r) => setTimeout(r, delay))
      }
      return {}
    },
    onNotification: (listener) => {
      notificationHandler = listener
      return () => {
        notificationHandler = null
      }
    },
  })

  const execCall = (): RpcCall | undefined => calls.find((call) => call.method === 'command/exec')
  const processId = (): string => String(execCall()?.params.processId ?? '')
  const openPty = (env?: Record<string, string>): TerminalPty =>
    spawn('/bin/bash', [], { name: 'xterm-256color', cols: 100, rows: 30, cwd: '/repo', env })
  const emitDelta = (targetProcessId: string, data: string): void => {
    notificationHandler?.({
      method: 'command/exec/outputDelta',
      params: {
        processId: targetProcessId,
        stream: 'stdout',
        deltaBase64: Buffer.from(data, 'utf8').toString('base64'),
        capReached: false,
      },
    })
  }

  return {
    spawn,
    calls,
    pendingExec,
    writeDelays,
    execCall,
    processId,
    openPty,
    emitDelta,
    get lastWriteDelay() {
      return writeDelays.at(-1)
    },
  }
}

describe('createExecPtySpawn', () => {
  it('opens a PTY session through command/exec with the managed env', () => {
    const harness = createHarness()
    harness.openPty({ TERM: 'xterm-256color', LANG: 'en_US.UTF-8' })

    const call = harness.execCall()
    expect(call?.params).toMatchObject({
      command: ['/bin/bash'],
      tty: true,
      size: { cols: 100, rows: 30 },
      cwd: '/repo',
      disableTimeout: true,
      disableOutputCap: true,
    })
    expect(typeof call?.params.processId).toBe('string')
    // The protocol's env is an override map; TERMINFO lookups are unset.
    expect(call?.params.env).toMatchObject({ TERM: 'xterm-256color', TERMINFO: null, TERMINFO_DIRS: null })
  })

  it('routes outputDelta to the matching session and decodes base64', () => {
    const harness = createHarness()
    const pty = harness.openPty()
    const received: string[] = []
    pty.onData((data) => received.push(data))

    harness.emitDelta(harness.processId(), 'hello ')
    harness.emitDelta('some-other-session', 'ignored')
    harness.emitDelta(harness.processId(), 'world')

    expect(received).toEqual(['hello ', 'world'])
  })

  it('buffers output that arrives before the manager attaches its handler', () => {
    const harness = createHarness()
    const pty = harness.openPty()

    harness.emitDelta(harness.processId(), 'early output')

    const received: string[] = []
    pty.onData((data) => received.push(data))
    expect(received).toEqual(['early output'])

    harness.emitDelta(harness.processId(), 'later output')
    expect(received).toEqual(['early output', 'later output'])
  })

  it('encodes writes as base64 and keeps keystroke order', async () => {
    const harness = createHarness()
    const pty = harness.openPty()

    pty.write('a')
    pty.write('b')
    pty.write('c')

    // Writes go out one at a time behind a serialised promise chain. The mock
    // gives each successive call a shorter latency, so only serialisation can
    // preserve the original keystroke order.
    await new Promise((r) => setTimeout(r, 120))

    const writes = harness.calls.filter((call) => call.method === 'command/exec/write')
    expect(writes.map((call) => decode(call.params.deltaBase64))).toEqual(['a', 'b', 'c'])
    expect(harness.writeDelays).toEqual([30, 20, 10])
  })

  it('forwards resize and terminate with the connection process id', () => {
    const harness = createHarness()
    const pty = harness.openPty()
    const processId = harness.processId()

    pty.resize(120, 40)
    pty.kill()

    const resize = harness.calls.find((call) => call.method === 'command/exec/resize')
    expect(resize?.params).toMatchObject({ processId, size: { cols: 120, rows: 40 } })
    const terminate = harness.calls.find((call) => call.method === 'command/exec/terminate')
    expect(terminate?.params).toMatchObject({ processId })
  })

  it('reports a clean exit when command/exec resolves', async () => {
    const harness = createHarness()
    const pty = harness.openPty()
    const exits: Array<{ exitCode: number, signal?: number }> = []
    pty.onExit((event) => exits.push(event))

    harness.pendingExec.get(harness.processId())?.resolve({ exitCode: 0, stdout: '', stderr: '' })
    await new Promise((r) => setTimeout(r, 0))

    expect(exits).toEqual([{ exitCode: 0 }])
  })

  it('surfaces a failed start inside the terminal and exits non-zero', async () => {
    const harness = createHarness()
    const pty = harness.openPty()
    const received: string[] = []
    const exits: Array<{ exitCode: number }> = []
    pty.onData((data) => received.push(data))
    pty.onExit((event) => exits.push(event))

    harness.pendingExec.get(harness.processId())?.reject(new Error('exec channel unavailable'))
    await new Promise((r) => setTimeout(r, 0))

    expect(received.join('')).toContain('exec channel unavailable')
    expect(exits).toEqual([{ exitCode: -1 }])
  })

  it('replays an exit that already happened to a late onExit subscriber', async () => {
    const harness = createHarness()
    const pty = harness.openPty()

    harness.pendingExec.get(harness.processId())?.resolve({ exitCode: 3 })
    await new Promise((r) => setTimeout(r, 0))

    const exits: Array<{ exitCode: number }> = []
    pty.onExit((event) => exits.push(event))
    expect(exits).toEqual([{ exitCode: 3 }])
  })
})
