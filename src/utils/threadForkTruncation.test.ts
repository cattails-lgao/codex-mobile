import { describe, expect, it } from 'vitest'

import type { UiMessage } from '../types/codex'
import { findForkCutoffTurnId, isForkTruncatedAsRequested } from './threadForkTruncation'

function msg(id: string, turnIndex: number, turnId?: string): UiMessage {
  return { id, role: 'user', text: id, turnIndex, turnId }
}

describe('findForkCutoffTurnId', () => {
  it('取 turnIndex 之后首个带 turnId 的轮次', () => {
    const messages = [msg('a', 0, 't0'), msg('b', 1), msg('c', 2, 't2'), msg('d', 3, 't3')]
    expect(findForkCutoffTurnId(messages, 0)).toBe('t2')
    expect(findForkCutoffTurnId(messages, 1)).toBe('t2')
    expect(findForkCutoffTurnId(messages, 2)).toBe('t3')
  })

  it('没有更晚轮次 ⇒ 空串（fork 全量即可）', () => {
    expect(findForkCutoffTurnId([msg('a', 0, 't0')], 0)).toBe('')
    expect(findForkCutoffTurnId([], 0)).toBe('')
  })

  it('后面只有无 turnId 的消息（乐观未回执）⇒ 空串', () => {
    expect(findForkCutoffTurnId([msg('a', 0, 't0'), msg('b', 1)], 0)).toBe('')
  })

  it('turnIndex 非数值的消息被跳过', () => {
    const messages = [msg('a', 0, 't0'), { id: 'x', role: 'user', text: 'x' } as UiMessage, msg('c', 2, 't2')]
    expect(findForkCutoffTurnId(messages, 0)).toBe('t2')
  })
})

describe('isForkTruncatedAsRequested', () => {
  it('cutoffTurnId 为空 ⇒ 恒真（无截断诉求）', () => {
    expect(isForkTruncatedAsRequested([msg('a', 5, 't5')], '', 0)).toBe(true)
  })

  it('结果已不含截断点轮次 ⇒ true', () => {
    const forked = [msg('a', 0, 't0'), msg('b', 1, 't1')]
    expect(isForkTruncatedAsRequested(forked, 't2', 1)).toBe(true)
  })

  it('上游忽略参数：结果仍含截断点 turnId ⇒ false（走回退路径）', () => {
    const forked = [msg('a', 0, 't0'), msg('c', 2, 't2'), msg('d', 3, 't3')]
    expect(isForkTruncatedAsRequested(forked, 't2', 1)).toBe(false)
  })

  it('上游忽略参数：turnId 缺失但 turnIndex 越过截断点 ⇒ false', () => {
    const forked = [msg('a', 0, 't0'), msg('x', 3)]
    expect(isForkTruncatedAsRequested(forked, 't2', 1)).toBe(false)
  })

  it('turnIndex 全部 ≤ 截断诉求 ⇒ true（索引重编号的保守兼容）', () => {
    const forked = [msg('a', 0, 't0'), msg('b', 1, 't1')]
    expect(isForkTruncatedAsRequested(forked, 't2', 1)).toBe(true)
  })
})
