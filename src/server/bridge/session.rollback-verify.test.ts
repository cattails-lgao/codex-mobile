import { describe, expect, it } from 'vitest'
import { collectFileChangesForTurns } from './session.js'

// CLI 0.149.1+ 把 apply_patch 记录为 function_call（arguments.command 携带 patch 内容），
// 旧版才是 custom_tool_call.input；collectFileChangesForTurns 必须两种格式都收集。
function buildSessionLog(): string {
  const turnContext = {
    timestamp: '2026-08-25T16:13:39.000Z',
    type: 'turn_context',
    payload: { turn_id: 'turn-1', cwd: 'C:\\workspace' },
  }
  const functionCallPatch = {
    timestamp: '2026-08-25T16:23:30.187Z',
    type: 'response_item',
    payload: {
      type: 'function_call',
      id: 'fc_1',
      name: 'apply_patch',
      arguments: '{"command": "*** Begin Patch\\n*** Add File: C:\\\\workspace\\\\a.py\\n+print(1)\\n*** End Patch"}',
      call_id: 'chatcmpl-tool-1',
    },
  }
  const customToolPatch = {
    timestamp: '2026-08-25T16:24:12.132Z',
    type: 'response_item',
    payload: {
      type: 'custom_tool_call',
      id: 'ct_1',
      name: 'apply_patch',
      status: 'completed',
      call_id: 'chatcmpl-tool-2',
      input: '*** Begin Patch\n*** Add File: C:\\workspace\\b.py\n+print(2)\n*** End Patch',
    },
  }
  return [JSON.stringify(turnContext), JSON.stringify(functionCallPatch), JSON.stringify(customToolPatch)].join('\n')
}

describe('collectFileChangesForTurns with CLI 0.149.1 function_call apply_patch', () => {
  it('extracts apply_patch patches recorded as function_call and custom_tool_call', () => {
    const infoByTurnId = collectFileChangesForTurns(buildSessionLog(), new Set(['turn-1']), 'C:\\workspace')
    const info = infoByTurnId.get('turn-1')
    expect(info).toBeDefined()
    expect(info?.patchInputs).toHaveLength(2)
    expect(info?.patchInputs[0]).toEqual({ callId: 'chatcmpl-tool-1', input: expect.stringContaining('*** Begin Patch') })
    expect(info?.patchInputs[1]).toEqual({ callId: 'chatcmpl-tool-2', input: expect.stringContaining('*** Begin Patch') })
  })
})
