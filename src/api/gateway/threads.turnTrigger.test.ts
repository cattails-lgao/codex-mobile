// 批 4（round-169）：内联编辑保存后重发走 `turn/start` 的 `turnTrigger` 发起方分类
// （schema: string|null；桌面端编辑重发取 'edit_user_message'）。断言三点：
// ① 传值时原样上车；② 不传时请求里**不带**该键（普通发送保持净载荷）；
// ③ 空白值同样不上车（trim 后为空视为未传）。
import { beforeEach, describe, expect, it, vi } from 'vitest'

const callRpcMock = vi.hoisted(() => vi.fn())

vi.mock('./core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core')>()
  return { ...actual, callRpc: callRpcMock }
})

import { startThreadTurn } from './threads'

function turnStartParams(): Record<string, unknown> {
  const call = callRpcMock.mock.calls.find(([method]) => method === 'turn/start')
  expect(call).toBeTruthy()
  return call?.[1] as Record<string, unknown>
}

beforeEach(() => {
  callRpcMock.mockReset()
  callRpcMock.mockResolvedValue({ turn: { id: 'turn-1' } })
})

describe('startThreadTurn turnTrigger', () => {
  it('rides the given trigger on the turn/start params', async () => {
    await startThreadTurn('thread-1', 'edited text', [], undefined, undefined, undefined, [], undefined, 'edit_user_message')

    expect(turnStartParams().turnTrigger).toBe('edit_user_message')
  })

  it('omits the key entirely for a normal send (no trigger passed)', async () => {
    await startThreadTurn('thread-1', 'normal message')

    expect('turnTrigger' in turnStartParams()).toBe(false)
  })

  it('omits the key for a blank trigger value', async () => {
    await startThreadTurn('thread-1', 'normal message', [], undefined, undefined, undefined, [], undefined, '   ')

    expect('turnTrigger' in turnStartParams()).toBe(false)
  })
})
