// round-140：代理注记判别的单测。
//
// 背景：codex 多代理通信（`collabAgentToolCall{tool:'sendInput', receiverThreadIds:[本会话]}`）
// 会被 app-server **以 userMessage 条目写进接收会话正在运行的那个 turn**，且不经任何客户端
// ⇒ `clientId` 为 null。UI 从条目流读回来只能把它画成右侧用户气泡（观感上"我说过这句话"）。
// 判据见 src/api/normalizers/v2.ts 的 isInjectedUserMessage。
import { describe, expect, it } from 'vitest'
import { normalizeThreadMessagesV2 } from './v2'
import type { ThreadReadResponse } from '../appServerDtos'

function responseWithTurns(turns: Array<{ id: string; items: unknown[] }>): ThreadReadResponse {
  return {
    thread: {
      id: 'thread-1',
      turns: turns.map((turn) => ({
        id: turn.id,
        status: 'completed',
        itemsView: 'full',
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        items: turn.items,
      })),
    },
  } as unknown as ThreadReadResponse
}

function userMessage(id: string, text: string, clientId: string | null) {
  return { type: 'userMessage', id, clientId, content: [{ type: 'text', text }] }
}

describe('normalizeThreadMessagesV2 / 代理注记判别', () => {
  it('同一 turn 内非首条且 clientId 为空的 user 消息判为代理注记；首条与带 id 的 steer 不算', () => {
    const messages = normalizeThreadMessagesV2(responseWithTurns([{
      id: 'turn-1',
      items: [
        userMessage('user-1', '授权按方案修复四组问题', null),
        userMessage('user-2', 'CP8恢复实物：…需主核判据冲突', null),
        userMessage('user-3', '补充一句：先跑类型检查', 'b131b25d-4265-499b-b47d-65cae053342b'),
      ],
    }]))

    const userMessages = messages.filter((message) => message.role === 'user')
    expect(userMessages.map((message) => [message.id, message.isAgentNote === true])).toEqual([
      ['user-1', false],
      ['user-2', true],
      ['user-3', false],
    ])
  })

  it('把服务端回写的 clientId 带到 UI 层（空串归一为 null）', () => {
    const messages = normalizeThreadMessagesV2(responseWithTurns([{
      id: 'turn-1',
      items: [
        userMessage('user-1', '第一个提问', 'fd2977a2-e909-47fa-a753-e48a83c7dd88'),
        userMessage('user-2', '第二个提问', ''),
      ],
    }]))

    const userMessages = messages.filter((message) => message.role === 'user')
    expect(userMessages[0]?.clientId).toBe('fd2977a2-e909-47fa-a753-e48a83c7dd88')
    expect(userMessages[1]?.clientId).toBeNull()
  })

  it('轮内首条即带 <subagent_notification> 包裹也算代理注记（首条豁免只对"无前缀"生效）', () => {
    const messages = normalizeThreadMessagesV2(responseWithTurns([{
      id: 'turn-1',
      items: [
        userMessage('user-1', '<subagent_notification>part_01 已完成…</subagent_notification>', null),
      ],
    }]))

    expect(messages.filter((message) => message.role === 'user').map((message) => message.isAgentNote === true))
      .toEqual([true])
  })

  it('轮内首条即带 <environment_context> 包裹也算代理注记', () => {
    const messages = normalizeThreadMessagesV2(responseWithTurns([{
      id: 'turn-1',
      items: [
        userMessage('user-1', '<environment_context>cwd=/home/lighthouse</environment_context>', null),
      ],
    }]))

    expect(messages.filter((message) => message.role === 'user').map((message) => message.isAgentNote === true))
      .toEqual([true])
  })

  it('每个 turn 独立计数：各轮首条都不算代理注记', () => {
    const messages = normalizeThreadMessagesV2(responseWithTurns([
      { id: 'turn-1', items: [userMessage('user-1', '第一轮提问', null)] },
      { id: 'turn-2', items: [userMessage('user-2', '第二轮提问', null)] },
    ]))

    expect(messages.filter((message) => message.role === 'user').map((message) => message.isAgentNote === true))
      .toEqual([false, false])
  })
})
