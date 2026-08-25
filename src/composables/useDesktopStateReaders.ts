// Pure notification → turn/activity/message readers sliced out of
// useDesktopState()'s closure. None capture reactive refs; they only reduce
// an RpcNotification into normalized ids / messages / activities using the
// pure normalizers (useDesktopStateNormalizers) and utils (useDesktopStateUtils).
// The ref-reading variants (readCommandExecution*/readPlanItemNotification/
// readCompletedFileChange) intentionally stay in the closure because they read
// turnIndexByTurnIdByThreadId.
import type { RpcNotification } from '../api/codexGateway'
import type { UiMessage } from '../types/codex'
import { parseIsoTimestamp } from './useDesktopStateUtils'
import type { TurnActivityState, TurnCompletedInfo, TurnStartedInfo } from './useDesktopStateUtils'
import { asRecord, extractThreadIdFromNotification, readString } from './useDesktopStateNormalizers'

export function readTurnActivity(notification: RpcNotification): { threadId: string; activity: TurnActivityState } | null {
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  if (notification.method === 'turn/started') {
    return {
      threadId,
      activity: {
        label: 'Thinking',
        details: [],
      },
    }
  }

  if (notification.method === 'item/started') {
    const params = asRecord(notification.params)
    const item = asRecord(params?.item)
    const itemType = readString(item?.type).toLowerCase()
    if (itemType === 'reasoning') {
      return {
        threadId,
        activity: {
          label: 'Thinking',
          details: [],
        },
      }
    }
    if (itemType === 'agentmessage') {
      return {
        threadId,
        activity: {
          label: 'Writing response',
          details: [],
        },
      }
    }
    if (itemType === 'commandexecution') {
      const cmd = readString(item?.command)
      return {
        threadId,
        activity: {
          label: 'Running command',
          details: cmd ? [cmd] : [],
        },
      }
    }
    if (itemType === 'filechange') {
      const changes = Array.isArray(item?.changes) ? item.changes : []
      const firstChange = changes[0] as Record<string, unknown> | undefined
      const path = readString(firstChange?.path)
      return {
        threadId,
        activity: {
          label: 'Applying changes',
          details: path ? [path] : [],
        },
      }
    }
  }

  if (notification.method === 'item/commandExecution/outputDelta') {
    return {
      threadId,
      activity: {
        label: 'Running command',
        details: [],
      },
    }
  }

  if (notification.method === 'item/fileChange/outputDelta') {
    return {
      threadId,
      activity: {
        label: 'Applying changes',
        details: [],
      },
    }
  }

  if (
    notification.method === 'item/reasoning/summaryTextDelta' ||
    notification.method === 'item/reasoning/summaryPartAdded' ||
    notification.method === 'item/reasoning/textDelta'
  ) {
    return {
      threadId,
      activity: {
        label: 'Thinking',
        details: [],
      },
    }
  }

  if (notification.method === 'item/agentMessage/delta') {
    return {
      threadId,
      activity: {
        label: 'Writing response',
        details: [],
      },
    }
  }

  return null
}

export function readTurnStartedInfo(notification: RpcNotification): TurnStartedInfo | null {
  if (notification.method !== 'turn/started') {
    return null
  }

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId =
    readString(turnPayload?.id) ||
    readString(params.turnId) ||
    `${threadId}:unknown`
  if (!turnId) return null

  const startedAtMs =
    parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
    parseIsoTimestamp(readString(params.startedAt)) ??
    parseIsoTimestamp(notification.atIso) ??
    Date.now()

  return {
    threadId,
    turnId,
    startedAtMs,
  }
}

export function readTurnCompletedInfo(notification: RpcNotification): TurnCompletedInfo | null {
  if (notification.method !== 'turn/completed') {
    return null
  }

  const params = asRecord(notification.params)
  if (!params) return null
  const threadId = extractThreadIdFromNotification(notification)
  if (!threadId) return null

  const turnPayload = asRecord(params.turn)
  const turnId =
    readString(turnPayload?.id) ||
    readString(params.turnId) ||
    `${threadId}:unknown`
  if (!turnId) return null

  const completedAtMs =
    parseIsoTimestamp(readString(turnPayload?.completedAt)) ??
    parseIsoTimestamp(readString(params.completedAt)) ??
    parseIsoTimestamp(notification.atIso) ??
    Date.now()

  const startedAtMs =
    parseIsoTimestamp(readString(turnPayload?.startedAt)) ??
    parseIsoTimestamp(readString(params.startedAt)) ??
    undefined

  return {
    threadId,
    turnId,
    completedAtMs,
    startedAtMs,
  }
}

export function liveReasoningMessageId(reasoningItemId: string): string {
  return `${reasoningItemId}:live-reasoning`
}

export function readReasoningStartedItemId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/started') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'reasoning') return ''
    return readString(item.id)
  }

  return ''
}

export function readReasoningDelta(notification: RpcNotification): { messageId: string; itemId: string; delta: string } | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/reasoning/summaryTextDelta') {
    const itemId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!itemId || !delta) return null
    return { messageId: liveReasoningMessageId(itemId), itemId, delta }
  }

  if (notification.method === 'item/reasoning/textDelta') {
    const itemId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!itemId || !delta) return null
    return { messageId: liveReasoningMessageId(itemId), itemId, delta }
  }

  return null
}

export function readReasoningSectionBreakMessageId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/reasoning/summaryPartAdded') {
    const itemId = readString(params.itemId)
    if (!itemId) return ''
    return liveReasoningMessageId(itemId)
  }

  return ''
}

export function readReasoningCompletedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'reasoning') return ''
    return liveReasoningMessageId(readString(item.id))
  }

  return ''
}

export function readReasoningItemText(item: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['content', 'summary']) {
    const rows = Array.isArray(item[key]) ? item[key] : []
    for (const row of rows) {
      const text = typeof row === 'string' ? row : asRecord(row)?.text
      if (typeof text === 'string' && text.trim()) parts.push(text)
    }
  }
  return parts.join('\n').trim()
}

export function readReasoningItemNotification(notification: RpcNotification): { itemId: string; text: string } | null {
  if (notification.method !== 'item/started' && notification.method !== 'item/completed') return null
  const params = asRecord(notification.params)
  const item = asRecord(params?.item)
  if (!item || readString(item.type).toLowerCase() !== 'reasoning') return null
  const itemId = readString(item.id)
  if (!itemId) return null
  return { itemId, text: readReasoningItemText(item) }
}

export function readAgentMessageStartedId(notification: RpcNotification): string {
  const params = asRecord(notification.params)
  if (!params) return ''

  if (notification.method === 'item/started') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'agentMessage') return ''
    return readString(item.id)
  }

  return ''
}

export function readAgentMessageDelta(notification: RpcNotification): { messageId: string; delta: string; turnId?: string } | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/agentMessage/delta') {
    const messageId = readString(params.itemId)
    const delta = readString(params.delta)
    if (!messageId || !delta) return null
    const turnId = readString(params.turnId) || readString(params.turn_id)
    return { messageId, delta, turnId: turnId || undefined }
  }

  return null
}

export function readAgentMessageCompleted(notification: RpcNotification): UiMessage | null {
  const params = asRecord(notification.params)
  if (!params) return null

  if (notification.method === 'item/completed') {
    const item = asRecord(params.item)
    if (!item || item.type !== 'agentMessage') return null
    const id = readString(item.id)
    const text = readString(item.text)
    if (!id || !text) return null
    const turnId = readString(params.turnId) || readString(params.turn_id)
    return {
      id,
      role: 'assistant',
      text,
      messageType: 'agentMessage',
      turnId: turnId || undefined,
    }
  }

  return null
}

export function toLocalImageUrl(path: string): string {
  return `/codex-local-image?path=${encodeURIComponent(path)}`
}

export function toImageGenerationUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/codex-local-image?')
  ) {
    return trimmed
  }
  const compact = trimmed.replace(/\s+/gu, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(compact)) return ''
  return `data:image/png;base64,${compact}`
}

export function readCompletedImageView(notification: RpcNotification): UiMessage | null {
  if (notification.method !== 'item/completed') return null
  const params = asRecord(notification.params)
  const item = asRecord(params?.item)
  if (!item) return null
  const id = readString(item.id)
  if (!id) return null
  if (item.type === 'imageView') {
    const path = readString(item.path)
    if (!path) return null
    return {
      id,
      role: 'assistant',
      text: '',
      images: [toLocalImageUrl(path)],
      messageType: 'imageView',
    }
  }
  if (item.type !== 'imageGeneration' && item.type !== 'image_generation') return null
  const result = readString(item.result)
  const imageUrl = result ? toImageGenerationUrl(result) : ''
  if (!imageUrl) return null
  return {
    id,
    role: 'assistant',
    text: '',
    images: [imageUrl],
    messageType: 'imageView',

  }
}

export function readCommandOutputDelta(notification: RpcNotification): { itemId: string; delta: string } | null {
  if (notification.method !== 'item/commandExecution/outputDelta') return null
  const params = asRecord(notification.params)
  if (!params) return null
  const itemId = readString(params.itemId)
  const delta = readString(params.delta)
  if (!itemId || !delta) return null
  return { itemId, delta }
}