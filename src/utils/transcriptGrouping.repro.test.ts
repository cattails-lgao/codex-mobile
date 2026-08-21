import { describe, expect, it } from 'vitest'
import { buildTurnRenderGroups } from './transcriptGrouping'
import type { UiMessage } from '../types/codex'

function msg(id: string, role: UiMessage['role'], messageType: string | undefined, extra: Record<string, unknown> = {}): UiMessage {
  return { id, role, text: '', messageType, turnId: undefined, turnIndex: undefined, ...extra } as UiMessage
}

// live 窗口：主代理正在流式（.live），子代理已完成（agentMessage 非 live）→ 末尾已完成的
// 中间消息不应被提升为 final（否则被拉出「本轮过程」渲染成末尾最终回复 = 本轮过程外）。
describe('repro: live 窗口 已完成的中间消息不该被误判为 final', () => {
  it('orders: [user, 主代理 .live 流式, 子代理已完成 agentMessage] → 子代理保持 process 而非 final', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('main-live', 'assistant', 'agentMessage.live', { text: '主代理仍在流式输出' }),
      msg('sub-done', 'assistant', 'agentMessage', { text: '子代理已完成的中间回复' }),
    ]
    const items = buildTurnRenderGroups(messages)[0].items
    const sub = items.find((i) => i.message.id === 'sub-done')
    expect(sub?.kind).toBe('assistant')
    expect(items.find((i) => i.message.id === 'main-live')?.kind).toBe('assistant')
    expect(items.some((i) => i.kind === 'final-assistant')).toBe(false)
  })

  it('主代理最终消息（无 .live）仍被提升为 final', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('sub-done', 'assistant', 'agentMessage', { text: '子代理回复' }),
      msg('main-done', 'assistant', 'agentMessage', { text: '主代理最终汇总' }),
    ]
    const items = buildTurnRenderGroups(messages)[0].items
    expect(items.find((i) => i.message.id === 'main-done')?.kind).toBe('final-assistant')
  })

  it('live overlay 进行中（真实最终尚在生成、未进 messages）→ 末尾已完成中间消息不提升为 final', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q' }),
      msg('curie-done', 'assistant', 'agentMessage', { text: '已创建子代理 Curie，等待它完成任务...' }),
    ]
    const items = buildTurnRenderGroups(messages, { liveOverlayActive: true })[0].items
    expect(items.some((i) => i.kind === 'final-assistant')).toBe(false)
    expect(items.find((i) => i.message.id === 'curie-done')?.kind).toBe('assistant')
  })

  it('live overlay 仅抑制活跃（最末）轮，已落定的历史轮 final 不受影响', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'first' }),
      msg('prev-done', 'assistant', 'agentMessage', { text: '上一轮最终汇总' }),
      msg('u2', 'user', undefined, { text: 'second' }),
      msg('curie-done', 'assistant', 'agentMessage', { text: '已创建子代理 Curie，等待它完成任务...' }),
    ]
    const groups = buildTurnRenderGroups(messages, { liveOverlayActive: true })
    expect(groups[0]?.items.find((i) => i.message.id === 'prev-done')?.kind).toBe('final-assistant')
    expect(groups[1]?.items.some((i) => i.kind === 'final-assistant')).toBe(false)
    expect(groups[1]?.items.find((i) => i.message.id === 'curie-done')?.kind).toBe('assistant')
  })
})