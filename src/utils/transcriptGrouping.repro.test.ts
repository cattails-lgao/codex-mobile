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

  it('turn/completed 后即使消息暂时保留 .live，也保持最终总结', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'q', turnId: 't1', turnIndex: 0 }),
      msg('final-live', 'assistant', 'agentMessage.live', { text: '刚完成的最终总结', turnId: 't1', turnIndex: 0 }),
      msg('worked-1', 'system', 'worked', { text: 'Worked for 2s', turnId: 't1', turnIndex: 0 }),
    ]
    const items = buildTurnRenderGroups(messages, { liveOverlayActive: false, liveTurnId: 't1' })[0].items
    expect(items.find((item) => item.message.id === 'final-live')?.kind).toBe('final-assistant')
    expect(items.find((item) => item.message.id === 'worked-1')?.kind).toBe('process')
  })

  it('liveTurnId 尚未返回时，不会把上一轮 final 当作活跃轮抑制', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'first', turnId: 't0', turnIndex: 0 }),
      msg('prev-done', 'assistant', 'agentMessage', { text: '上一轮最终汇总', turnId: 't0', turnIndex: 0 }),
    ]
    const items = buildTurnRenderGroups(messages, { liveOverlayActive: true, liveTurnId: undefined })[0].items

    expect(items.find((item) => item.message.id === 'prev-done')?.kind).toBe('final-assistant')
  })

  it('按 liveTurnId 仅抑制活跃轮，历史 final 不会被 live t1 抑制', () => {
    const messages = [
      msg('u1', 'user', undefined, { text: 'first', turnId: 't0', turnIndex: 0 }),
      msg('prev-done', 'assistant', 'agentMessage', { text: '上一轮最终汇总', turnId: 't0', turnIndex: 0 }),
      msg('u2', 'user', undefined, { text: 'second', turnId: 't1', turnIndex: 1 }),
      msg('curie-done', 'assistant', 'agentMessage', { text: '已创建子代理 Curie，等待它完成任务...', turnId: 't1', turnIndex: 1 }),
    ]
    const groups = buildTurnRenderGroups(messages, { liveOverlayActive: true, liveTurnId: 't1' })
    expect(groups[0]?.items.find((i) => i.message.id === 'prev-done')?.kind).toBe('final-assistant')
    expect(groups[1]?.items.some((i) => i.kind === 'final-assistant')).toBe(false)
    expect(groups[1]?.items.find((i) => i.message.id === 'curie-done')?.kind).toBe('assistant')
  })
})