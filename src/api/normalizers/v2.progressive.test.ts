import { describe, expect, it, vi } from 'vitest'
import {
  normalizeThreadMessagesV2,
  normalizeThreadMessagesV2Progressive,
  THREAD_NORMALIZE_CHUNK_TURNS,
} from './v2'
import type { ThreadReadResponse, Turn } from '../appServerDtos'

function buildTurn(index: number): Turn {
  const items: Turn['items'] = [
    { type: 'userMessage', id: `u${index}`, clientId: null, content: [{ type: 'text', text: `question-${index}`, text_elements: [] }] },
    { type: 'agentMessage', id: `a${index}`, text: `reply-${index}`, phase: null, memoryCitation: null, delivery: null, questions: null },
  ]
  // 每 7 轮塞一个 contextCompaction（触发跨轮修正路径）。
  if (index % 7 === 0) {
    items.push({ type: 'contextCompaction', id: `c${index}` })
  }
  return {
    id: `turn-${index}`,
    status: 'completed',
    itemsView: 'full',
    rootTurnId: null,
    error: null,
    startedAt: 1000 + index,
    completedAt: 1100 + index,
    durationMs: 100,
    items,
  }
}

function buildResponse(turnCount: number, baseTurnIndex = 0): ThreadReadResponse {
  const turns = Array.from({ length: turnCount }, (_, i) => buildTurn(baseTurnIndex + i))
  return {
    thread: {
      id: 'thread-1',
      extra: null,
      sessionId: 'session-1',
      forkedFromId: null,
      parentThreadId: null,
      preview: 'progressive',
      ephemeral: false,
      section: null,
      sectionEnteredAt: null,
      projectId: null,
      historyMode: 'paginated',
      modelProvider: 'openai',
      model: null,
      reasoningEffort: null,
      createdAt: 1,
      updatedAt: 2,
      recencyAt: null,
      status: { type: 'idle' },
      path: null,
      cwd: '/tmp/project',
      cliVersion: 'test',
      source: 'appServer',
      canAcceptDirectInput: null,
      threadSource: null,
      agentNickname: null,
      agentRole: null,
      gitInfo: null,
      name: null,
      environments: null,
      originator: null,
      daybreakEnabled: null,
      turns,
    },
  }
}

describe('normalizeThreadMessagesV2Progressive', () => {
  it('渐进归一化最终结果与全量归一化逐位一致（含 compaction 修正）', async () => {
    const payload = buildResponse(100)
    const sync = normalizeThreadMessagesV2(payload, 5)
    const partials: number[][] = []
    const progressive = await normalizeThreadMessagesV2Progressive(payload, 5, (messages) => {
      partials.push(messages.map((m) => m.turnIndex ?? -1))
    })
    expect(progressive).toEqual(sync)
    expect(progressive.length).toBeGreaterThan(0)
  })

  it('首片只含最新 THREAD_NORMALIZE_CHUNK_TURNS 轮，分片单调增长', async () => {
    const payload = buildResponse(100)
    const snapshots: UiMessageLength[] = []
    const partials: UiMessageFirst[] = []
    const result = await normalizeThreadMessagesV2Progressive(payload, 0, (messages) => {
      snapshots.push({ len: messages.length })
      partials.push({ firstTurnIndex: messages[0]?.turnIndex ?? -1, lastTurnIndex: messages[messages.length - 1]?.turnIndex ?? -1 })
    })
    expect(snapshots.length).toBe(4) // 100 轮 = 30+30+30+10
    // 首片 = 最新 30 轮（turnIndex 70..99），末片补到最旧（turnIndex 0）。
    expect(partials[0]).toEqual({ firstTurnIndex: 70, lastTurnIndex: 99 })
    expect(partials[partials.length - 1]).toEqual({ firstTurnIndex: 0, lastTurnIndex: 99 })
    for (let i = 1; i < snapshots.length; i += 1) {
      expect(snapshots[i].len).toBeGreaterThan(snapshots[i - 1].len)
    }
    expect(result[0]?.turnIndex).toBe(0)
  })

  it('轮数不超过一片时走同步路径，不调用 onPartialMessages', async () => {
    const payload = buildResponse(THREAD_NORMALIZE_CHUNK_TURNS)
    const onPartial = vi.fn()
    const result = await normalizeThreadMessagesV2Progressive(payload, 0, onPartial)
    expect(onPartial).not.toHaveBeenCalled()
    expect(result).toEqual(normalizeThreadMessagesV2(payload, 0))
  })

  it('不传 onPartialMessages 时行为与原同步路径一致', async () => {
    const payload = buildResponse(80)
    const result = await normalizeThreadMessagesV2Progressive(payload, 3)
    expect(result).toEqual(normalizeThreadMessagesV2(payload, 3))
  })
})

type UiMessageLength = { len: number }
type UiMessageFirst = { firstTurnIndex: number; lastTurnIndex: number }
