import { beforeEach, describe, expect, it, vi } from 'vitest'
import { base64FromInt16, useRealtimeVoice } from './useRealtimeVoice'

const subscribeCodexNotificationsMock = vi.fn()
const startRealtimeSessionMock = vi.fn()
const appendRealtimeAudioMock = vi.fn()
const stopRealtimeSessionMock = vi.fn()

vi.mock('../api/codexGateway', () => ({
  subscribeCodexNotifications: (...args: unknown[]) => subscribeCodexNotificationsMock(...args),
  startRealtimeSession: (...args: unknown[]) => startRealtimeSessionMock(...args),
  appendRealtimeAudio: (...args: unknown[]) => appendRealtimeAudioMock(...args),
  stopRealtimeSession: (...args: unknown[]) => stopRealtimeSessionMock(...args),
}))

type Notification = { method: string; params: unknown; atIso: string }
type NotificationCallback = (value: Notification) => void

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('btoa', (value: string) => Buffer.from(value, 'binary').toString('base64'))
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'))
  const contextStub = {
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createScriptProcessor: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null })),
    close: vi.fn(() => Promise.resolve()),
    destination: {},
  }
  vi.stubGlobal('window', { AudioContext: vi.fn(() => contextStub) })
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  })
  appendRealtimeAudioMock.mockResolvedValue(undefined)
  stopRealtimeSessionMock.mockResolvedValue(undefined)
})

describe('base64FromInt16', () => {
  it('encodes Int16 PCM as little-endian base64', () => {
    expect(base64FromInt16(new Int16Array([1, 2]))).toBe('AQACAA==')
  })

  it('encodes negative and boundary samples correctly', () => {
    expect(base64FromInt16(new Int16Array([-1, -32768]))).toBe('//8AgA==')
    expect(base64FromInt16(new Int16Array([32767, 0]))).toBe('/38AAA==')
  })

  it('handles empty input', () => {
    expect(base64FromInt16(new Int16Array([]))).toBe('')
  })
})

describe('useRealtimeVoice', () => {
  it('subscribes to notifications and transitions to active on started', async () => {
    let capturedCallback: NotificationCallback = () => {}
    subscribeCodexNotificationsMock.mockImplementation((callback: NotificationCallback) => {
      capturedCallback = callback
      return () => { capturedCallback = () => {} }
    })
    startRealtimeSessionMock.mockResolvedValue(undefined)

    const voice = useRealtimeVoice({})
    await voice.start('thread-1')
    expect(startRealtimeSessionMock).toHaveBeenCalledWith({
      threadId: 'thread-1',
      outputModality: 'audio',
      includeStartupContext: false,
    })
    expect(voice.state.value).toBe('connecting')

    capturedCallback({ method: 'thread/realtime/started', params: { threadId: 'thread-1' }, atIso: 'now' })
    expect(voice.state.value).toBe('active')
    await voice.stop()
  })

  it('accumulates transcript deltas and replaces text on done', async () => {
    let capturedCallback: NotificationCallback = () => {}
    subscribeCodexNotificationsMock.mockImplementation((callback: NotificationCallback) => {
      capturedCallback = callback
      return () => { capturedCallback = () => {} }
    })
    startRealtimeSessionMock.mockResolvedValue(undefined)

    const voice = useRealtimeVoice({})
    await voice.start('thread-1')
    capturedCallback({ method: 'thread/realtime/started', params: { threadId: 'thread-1' }, atIso: 'now' })

    capturedCallback({
      method: 'thread/realtime/transcript/delta',
      params: { threadId: 'thread-1', role: 'assistant', delta: 'Hel' },
      atIso: 'now',
    })
    capturedCallback({
      method: 'thread/realtime/transcript/delta',
      params: { threadId: 'thread-1', role: 'assistant', delta: 'lo' },
      atIso: 'now',
    })
    expect(voice.transcriptParts.value).toEqual([{ role: 'assistant', text: 'Hello' }])

    capturedCallback({
      method: 'thread/realtime/transcript/done',
      params: { threadId: 'thread-1', role: 'assistant', text: 'Hello world' },
      atIso: 'now',
    })
    expect(voice.transcriptParts.value).toEqual([{ role: 'assistant', text: 'Hello world' }])
    await voice.stop()
  })

  it('ignores notifications for other threads', async () => {
    let capturedCallback: NotificationCallback = () => {}
    subscribeCodexNotificationsMock.mockImplementation((callback: NotificationCallback) => {
      capturedCallback = callback
      return () => { capturedCallback = () => {} }
    })
    startRealtimeSessionMock.mockResolvedValue(undefined)

    const voice = useRealtimeVoice({})
    await voice.start('thread-1')
    capturedCallback({
      method: 'thread/realtime/transcript/delta',
      params: { threadId: 'thread-other', role: 'user', delta: 'x' },
      atIso: 'now',
    })
    expect(voice.transcriptParts.value).toEqual([])
    await voice.stop()
  })

  it('surfaces realtime errors and returns to idle after stop', async () => {
    let capturedCallback: NotificationCallback = () => {}
    subscribeCodexNotificationsMock.mockImplementation((callback: NotificationCallback) => {
      capturedCallback = callback
      return () => { capturedCallback = () => {} }
    })
    startRealtimeSessionMock.mockResolvedValue(undefined)
    stopRealtimeSessionMock.mockResolvedValue(undefined)

    const onError = vi.fn()
    const voice = useRealtimeVoice({ onError })
    await voice.start('thread-1')
    capturedCallback({
      method: 'thread/realtime/error',
      params: { threadId: 'thread-1', message: 'boom' },
      atIso: 'now',
    })
    expect(voice.state.value).toBe('error')
    expect(onError).toHaveBeenCalledWith(new Error('boom'))
  })
})
