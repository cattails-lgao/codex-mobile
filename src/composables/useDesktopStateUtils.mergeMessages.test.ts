// round-121：mergeMessages 的乐观消息时序锚定回归测试。
// 缺陷：preserveMissing 合并把「incoming 快照新增的消息」一律尾追加。上一轮
// 的收尾消息若在乐观用户消息追加之后才物化进快照（turn/completed 防抖刷新
// 晚于用户下一次发送），就会排到乐观用户消息后面——渲染上表现为「新发的
// 用户消息出现在上一轮 message 中间」。修复后：以快照里第一条真实用户消息
// （等值对应乐观消息）为时序锚，锚前的新消息插到乐观消息之前；无锚（新 turn
// 尚未落地）时全部前插；锚已在 previous（乐观将被过滤）时维持尾追加。

import { describe, expect, it } from 'vitest'
import { mergeMessages } from './useDesktopStateUtils'
import type { UiMessage } from '../types/codex'

function msg(
  id: string,
  role: UiMessage['role'],
  text: string,
  messageType?: string,
  turnId?: string,
): UiMessage {
  return {
    id,
    role,
    text,
    ...(messageType ? { messageType } : {}),
    ...(turnId ? { turnId } : {}),
  }
}

const optimistic = 'userMessage.optimistic'

describe('mergeMessages preserveMissing: 乐观消息时序锚定', () => {
  it('上一轮收尾消息晚于乐观发送物化且快照无真实对应时，按已知 turnId 插到乐观用户消息之前', () => {
    const previous = [
      msg('user-1', 'user', '第一问', 'userMessage', 'turn-1'),
      msg('assistant-1a', 'assistant', '过程回复', 'agentMessage', 'turn-1'),
      msg('opt-2', 'user', '第二问', optimistic),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问', 'userMessage', 'turn-1'),
      msg('assistant-1a', 'assistant', '过程回复', 'agentMessage', 'turn-1'),
      msg('assistant-1b', 'assistant', '上一轮的最终回复', 'agentMessage', 'turn-1'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'assistant-1a', 'assistant-1b', 'opt-2'])
  })

  it('无锚且新增消息缺失 turnId（新线程首轮回包形态）时保守尾追加', () => {
    const previous = [msg('opt-1', 'user', 'hi', optimistic)]
    const incoming = [msg('assistant-1', 'assistant', 'Hi.')]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['opt-1', 'assistant-1'])
  })

  it('无锚但新增消息带未知 turnId（真正的新轮内容）时保守尾追加', () => {
    const previous = [
      msg('user-1', 'user', '第一问', 'userMessage', 'turn-1'),
      msg('opt-2', 'user', '第二问', optimistic),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问', 'userMessage', 'turn-1'),
      msg('assistant-2a', 'assistant', '新轮回复', 'agentMessage', 'turn-2'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'opt-2', 'assistant-2a'])
  })

  it('快照含真实对应用户消息时，锚之前的新消息前插、锚起尾追加且乐观被过滤', () => {
    const previous = [
      msg('user-1', 'user', '第一问'),
      msg('assistant-1a', 'assistant', '过程回复'),
      msg('opt-2', 'user', '第二问', optimistic),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问'),
      msg('assistant-1a', 'assistant', '过程回复'),
      msg('assistant-1b', 'assistant', '上一轮的最终回复'),
      msg('user-2', 'user', '第二问'),
      msg('assistant-2a', 'assistant', '新轮回复'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual([
      'user-1',
      'assistant-1a',
      'assistant-1b',
      'user-2',
      'assistant-2a',
    ])
    expect(merged.some((m) => m.messageType === optimistic)).toBe(false)
  })

  it('已在错误位置（历史脏序）的乐观消息被过滤后顺序自然归位', () => {
    const previous = [
      msg('user-1', 'user', '第一问'),
      msg('opt-2', 'user', '第二问', optimistic),
      msg('assistant-1b', 'assistant', '上一轮的最终回复'),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问'),
      msg('assistant-1b', 'assistant', '上一轮的最终回复'),
      msg('user-2', 'user', '第二问'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'assistant-1b', 'user-2'])
  })

  it('锚已在 previous 而非新增时，新增内容维持尾追加（乐观将被过滤）', () => {
    const previous = [
      msg('user-1', 'user', '第一问'),
      msg('opt-2', 'user', '第二问', optimistic),
      msg('user-2', 'user', '第二问'),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问'),
      msg('user-2', 'user', '第二问'),
      msg('assistant-2a', 'assistant', '新轮回复'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'user-2', 'assistant-2a'])
    expect(merged.some((m) => m.messageType === optimistic)).toBe(false)
  })

  it('无乐观消息时保持原语义：新增内容尾追加、previous 独有消息保留', () => {
    const previous = [
      msg('user-1', 'user', '第一问'),
      msg('extra', 'assistant', '本地独有'),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问'),
      msg('assistant-1b', 'assistant', '服务端新增'),
    ]

    const merged = mergeMessages(previous, incoming, { preserveMissing: true })

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'extra', 'assistant-1b'])
  })

  it('preserveMissing 关闭时 incoming 顺序直接生效', () => {
    const previous = [
      msg('user-1', 'user', '第一问'),
      msg('extra', 'assistant', '本地独有'),
    ]
    const incoming = [
      msg('user-1', 'user', '第一问'),
      msg('assistant-1b', 'assistant', '服务端新增'),
    ]

    const merged = mergeMessages(previous, incoming)

    expect(merged.map((m) => m.id)).toEqual(['user-1', 'assistant-1b'])
  })
})
