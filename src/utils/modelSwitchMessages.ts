// round-73：模型切换分割栏消息。纯函数，无组件依赖。
// 用户在 UI 切换线程模型时，injectModelSwitchDivision 向消息列表追加一条
// `messageType === 'modelSwitch'` 的本地系统消息；渲染侧据此在 `filteredMessages`
// 提前剔除，使其完全不进入 turnGroups / renderTurns，从而不参与过程区与结论区。

import type { UiMessage } from '../types/codex'

export const MODEL_SWITCH_MESSAGE_TYPE = 'modelSwitch'

export const MAX_MODEL_SWITCH_MARKERS_PER_THREAD = 20

export function isModelSwitchMessage(message: UiMessage): boolean {
  return message.messageType === MODEL_SWITCH_MESSAGE_TYPE
}