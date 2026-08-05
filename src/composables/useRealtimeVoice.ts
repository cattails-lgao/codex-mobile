import { onBeforeUnmount, ref } from 'vue'
import {
  appendRealtimeAudio,
  startRealtimeSession,
  stopRealtimeSession,
  subscribeCodexNotifications,
  type RealtimeAudioChunk,
  type RealtimeTranscriptPart,
  type RpcNotification,
} from '../api/codexGateway'

export type RealtimeVoiceState = 'idle' | 'connecting' | 'active' | 'stopping' | 'error'

const REALTIME_SAMPLE_RATE = 24000
const REALTIME_CHUNK_INTERVAL_MS = 200
const REALTIME_PROCESSOR_BUFFER = 4096

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function base64FromInt16(values: Int16Array): string {
  const bytes = new Uint8Array(values.length * 2)
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0
    bytes[index * 2] = value & 0xff
    bytes[index * 2 + 1] = (value >> 8) & 0xff
  }
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function useRealtimeVoice(options: {
  onError?: (error: unknown) => void
  onTranscript?: (role: string, text: string) => void
}) {
  const state = ref<RealtimeVoiceState>('idle')
  const isSupported = ref(
    typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia
      && typeof window !== 'undefined'
      && typeof window.AudioContext !== 'undefined',
  )
  const transcriptParts = ref<RealtimeTranscriptPart[]>([])
  const errorMessage = ref('')

  let activeThreadId = ''
  let mediaStream: MediaStream | null = null
  let inputContext: AudioContext | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let processor: ScriptProcessorNode | null = null
  let pendingPcm: number[] = []
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let stopNotificationStream: (() => void) | null = null
  let outputContext: AudioContext | null = null
  let stopRequested = false

  function ensureOutputContext(): AudioContext | null {
    if (outputContext) return outputContext
    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    outputContext = new AudioContextCtor()
    return outputContext
  }

  function playOutputChunk(audio: RealtimeAudioChunk): void {
    const context = ensureOutputContext()
    if (!context) return
    let pcm: Int16Array
    try {
      const binary = atob(audio.data)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      pcm = new Int16Array(bytes.buffer)
    } catch {
      return
    }
    const frames = new Float32Array(pcm.length)
    for (let index = 0; index < pcm.length; index += 1) {
      frames[index] = (pcm[index] ?? 0) / 32768
    }
    const buffer = context.createBuffer(1, frames.length, audio.sampleRate || REALTIME_SAMPLE_RATE)
    buffer.copyToChannel(frames, 0)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    void context.resume()
    source.start()
  }

  function handleNotification(notification: RpcNotification): void {
    if (state.value !== 'connecting' && state.value !== 'active' && state.value !== 'stopping') {
      return
    }
    const params = asRecord(notification.params)
    if (!params || params.threadId !== activeThreadId) return

    switch (notification.method) {
      case 'thread/realtime/started':
        if (state.value === 'connecting') {
          state.value = 'active'
          beginCapture()
        }
        break
      case 'thread/realtime/transcript/delta': {
        const role = typeof params.role === 'string' ? params.role : 'assistant'
        const delta = typeof params.delta === 'string' ? params.delta : ''
        const parts = transcriptParts.value
        const last = parts.length > 0 ? parts[parts.length - 1] : null
        if (last && last.role === role) {
          last.text += delta
        } else {
          parts.push({ role, text: delta })
        }
        options.onTranscript?.(role, parts[parts.length - 1]?.text ?? '')
        break
      }
      case 'thread/realtime/transcript/done': {
        const role = typeof params.role === 'string' ? params.role : 'assistant'
        const text = typeof params.text === 'string' ? params.text : ''
        const parts = transcriptParts.value
        const last = parts.length > 0 ? parts[parts.length - 1] : null
        if (last && last.role === role) {
          last.text = text
        } else {
          parts.push({ role, text })
        }
        options.onTranscript?.(role, text)
        break
      }
      case 'thread/realtime/outputAudio/delta': {
        const audio = asRecord(params.audio)
        if (audio) {
          playOutputChunk({
            data: typeof audio.data === 'string' ? audio.data : '',
            sampleRate: typeof audio.sampleRate === 'number' ? audio.sampleRate : REALTIME_SAMPLE_RATE,
            numChannels: typeof audio.numChannels === 'number' ? audio.numChannels : 1,
            samplesPerChannel: typeof audio.samplesPerChannel === 'number' ? audio.samplesPerChannel : undefined,
          })
        }
        break
      }
      case 'thread/realtime/error': {
        const message = typeof params.message === 'string' ? params.message : 'Realtime voice error'
        fail(new Error(message))
        break
      }
      case 'thread/realtime/closed':
        void finish()
        break
      default:
        break
    }
  }

  function flushPendingAudio(): void {
    if (!activeThreadId || pendingPcm.length === 0) return
    const int16 = new Int16Array(pendingPcm)
    pendingPcm = []
    const audio: RealtimeAudioChunk = {
      data: base64FromInt16(int16),
      sampleRate: REALTIME_SAMPLE_RATE,
      numChannels: 1,
      samplesPerChannel: int16.length,
    }
    void appendRealtimeAudio({ threadId: activeThreadId, audio }).catch(() => {
      // Best-effort audio upload; transcription continues on later chunks.
    })
  }

  async function start(targetThreadId: string): Promise<void> {
    if (state.value !== 'idle' || !isSupported.value) return
    activeThreadId = targetThreadId
    errorMessage.value = ''
    transcriptParts.value = []
    stopRequested = false
    state.value = 'connecting'
    stopNotificationStream = subscribeCodexNotifications(handleNotification)
    try {
      await startRealtimeSession({
        threadId: targetThreadId,
        outputModality: 'audio',
        includeStartupContext: false,
      })
      // Session becomes active on the thread/realtime/started notification.
    } catch (error) {
      fail(error)
    }
  }

  function beginCapture(): void {
    if (!activeThreadId || mediaStream) return
    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor || !navigator.mediaDevices?.getUserMedia) return
    void navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, sampleRate: REALTIME_SAMPLE_RATE } })
      .then((stream) => {
        if (stopRequested) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        mediaStream = stream
        inputContext = new AudioContextCtor({ sampleRate: REALTIME_SAMPLE_RATE })
        inputSource = inputContext.createMediaStreamSource(stream)
        processor = inputContext.createScriptProcessor(REALTIME_PROCESSOR_BUFFER, 1, 1)
        processor.onaudioprocess = (event) => {
          const channel = event.inputBuffer.getChannelData(0)
          for (let index = 0; index < channel.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, channel[index] ?? 0))
            pendingPcm.push(sample < 0 ? sample * 0x8000 : sample * 0x7fff)
          }
        }
        inputSource.connect(processor)
        processor.connect(inputContext.destination)
        flushTimer = setInterval(flushPendingAudio, REALTIME_CHUNK_INTERVAL_MS)
      })
      .catch((error) => {
        fail(error)
      })
  }

  function fail(error: unknown): void {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    state.value = 'error'
    options.onError?.(error)
    cleanupLocal()
  }

  function cleanupLocal(): void {
    if (flushTimer !== null) {
      clearInterval(flushTimer)
      flushTimer = null
    }
    if (processor) {
      processor.onaudioprocess = null
      processor.disconnect()
      processor = null
    }
    if (inputSource) {
      inputSource.disconnect()
      inputSource = null
    }
    if (inputContext) {
      void inputContext.close()
      inputContext = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop())
      mediaStream = null
    }
    pendingPcm = []
  }

  function cleanupOutput(): void {
    if (outputContext) {
      void outputContext.close()
      outputContext = null
    }
  }

  function unsubscribe(): void {
    if (stopNotificationStream) {
      stopNotificationStream()
      stopNotificationStream = null
    }
  }

  async function stop(): Promise<void> {
    if (state.value !== 'connecting' && state.value !== 'active') {
      unsubscribe()
      cleanupLocal()
      state.value = 'idle'
      return
    }
    stopRequested = true
    state.value = 'stopping'
    const threadId = activeThreadId
    await stopRealtimeSession(threadId).catch(() => {
      // The session may already be closed server-side.
    })
    void finish()
  }

  async function finish(): Promise<void> {
    if (state.value === 'idle') return
    cleanupLocal()
    unsubscribe()
    cleanupOutput()
    state.value = 'idle'
  }

  function toggle(targetThreadId: string): void {
    if (state.value === 'active' || state.value === 'connecting' || state.value === 'stopping') {
      void stop()
      return
    }
    void start(targetThreadId)
  }

  // Start capturing mic audio once the realtime session is confirmed active.
  onBeforeUnmount(() => {
    unsubscribe()
    cleanupLocal()
    cleanupOutput()
  })

  return {
    state,
    isSupported,
    transcriptParts,
    errorMessage,
    start,
    stop,
    toggle,
    beginCapture,
  }
}
