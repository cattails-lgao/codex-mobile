// round-140：代理注记在「轮次分组 / 渲染分组」里的行为。
// 注记本身是 role==='user'，若不特判就会成为一轮的 request，渲染成独立的用户气泡。
import { describe, expect, it } from 'vitest'
import { buildTurnGroups, buildTurnRenderGroups, isUserAuthoredMessage } from './transcriptGrouping'
import type { UiMessage } from '../types/codex'

function msg(
  id: string,
  role: UiMessage['role'],
  messageType?: string,
  extra: Record<string, unknown> = {},
): UiMessage {
  return { id, role, text: '', messageType, ...extra } as UiMessage
}

function userMessage(id: string, text: string, extra: Record<string, unknown> = {}): UiMessage {
  return msg(id, 'user', 'userMessage', { text, ...extra })
}

function agentNote(id: string, text: string): UiMessage {
  return msg(id, 'user', 'userMessage', { text, isAgentNote: true })
}

describe('isUserAuthoredMessage', () => {
  it('只认用户本人发出的 user 消息', () => {
    expect(isUserAuthoredMessage(userMessage('u1', 'hi'))).toBe(true)
    expect(isUserAuthoredMessage(agentNote('n1', 'hi'))).toBe(false)
    expect(isUserAuthoredMessage(msg('a1', 'assistant', 'agentMessage'))).toBe(false)
  })
})

describe('buildTurnRenderGroups / 代理注记', () => {
  it('注记不开新渲染组，而是留在同一轮里成为 agent-note 项', () => {
    const groups = buildTurnRenderGroups([
      userMessage('u1', '授权按方案修复'),
      agentNote('n1', 'CP8恢复实物：…需主核判据冲突'),
      msg('a1', 'assistant', 'agentMessage', { text: '收到' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.items.map((item) => item.kind)).toEqual(['user', 'agent-note', 'final-assistant'])
  })

  it('注记排在轮末时也不会开辟新组', () => {
    const groups = buildTurnRenderGroups([
      userMessage('u1', '授权按方案修复'),
      msg('a1', 'assistant', 'agentMessage', { text: '收到' }),
      agentNote('n1', '恢复后新阻塞：…待主核定本轮新共享冲突'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.items.map((item) => item.kind)).toEqual(['user', 'final-assistant', 'agent-note'])
  })
})

describe('buildTurnGroups / 代理注记', () => {
  it('注记不算轮次边界，轮内 userItem 仍是用户自己的提问', () => {
    const groups = buildTurnGroups([
      userMessage('u1', '授权按方案修复'),
      msg('a1', 'assistant', 'agentMessage', { text: '收到' }),
      agentNote('n1', 'CP8恢复实物：…'),
      msg('a2', 'assistant', 'agentMessage', { text: '继续' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.userItem.id).toBe('u1')
    expect(groups[0]?.startIdx).toBe(0)
    expect(groups[0]?.endIdx).toBe(4)
  })
})
