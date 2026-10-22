import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesFromNewestFirstPages, normalizeThreadMessagesV2 } from './v2'
import type { ThreadReadResponse, Turn } from '../appServerDtos'

// round-185：`thread/revert` 之后的补水从「一次要 200 轮全量 items」改成「按游标分页」。
// 分页会逐页归一化后立刻丢掉原始图（峰值从整段历史降到一页）。这里锁定的是**功能
// 等价**：分页归一化的结果必须与一次性全量归一化逐位一致，含跨轮修正
// （压缩折叠 / compaction 归位）与 turnIndex 平移。

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
      preview: 'chunked',
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

/**
 * 把一整段升序轮次切成 `thread/turns/list {sortDirection:'desc'}` 会返回的页：
 * 页与页之间是「越往后越旧」，**每页内部也是 newest-first**。
 */
function toNewestFirstPages(allTurns: Turn[], pageSize: number): Turn[][] {
  const pages: Turn[][] = []
  for (let end = allTurns.length; end > 0; end -= pageSize) {
    const from = Math.max(0, end - pageSize)
    pages.push([...allTurns.slice(from, end)].reverse())
  }
  return pages
}

describe('normalizeThreadMessagesFromNewestFirstPages', () => {
  it('与一次性全量归一化逐位一致（100 轮 / 每页 20 轮）', () => {
    const payload = buildResponse(100)
    const full = normalizeThreadMessagesV2(payload, 0)
    const chunked = normalizeThreadMessagesFromNewestFirstPages(toNewestFirstPages(payload.thread.turns, 20))
    expect(chunked).toEqual(full)
    expect(chunked.length).toBeGreaterThan(0)
  })

  it('页大小不一致（末页不足一页）时仍然一致', () => {
    const payload = buildResponse(97)
    const pages = toNewestFirstPages(payload.thread.turns, 20)
    // 97 = 20+20+20+20+17：最旧的最后一页只有 17 轮。
    expect(pages[pages.length - 1]).toHaveLength(17)
    expect(normalizeThreadMessagesFromNewestFirstPages(pages)).toEqual(normalizeThreadMessagesV2(payload, 0))
  })

  it('只剩一页时等价于直接归一化该页', () => {
    const payload = buildResponse(12)
    const pages = toNewestFirstPages(payload.thread.turns, 20)
    expect(pages).toHaveLength(1)
    expect(normalizeThreadMessagesFromNewestFirstPages(pages)).toEqual(normalizeThreadMessagesV2(payload, 0))
  })

  it('没有任何页时返回空数组（游标为空 / 线程被 revert 清空）', () => {
    expect(normalizeThreadMessagesFromNewestFirstPages([])).toEqual([])
  })
})
