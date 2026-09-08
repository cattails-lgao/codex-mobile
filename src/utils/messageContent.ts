// 判断一条「通用正文」消息是否有任何可渲染内容。用于在渲染列表时省略
// 完全为空的过程行（如逐字推理/agentMessage 文本为空且无附件时的空 <li>）。
// 纯函数，仅依赖消息自身字段，便于单测。
import type { UiMessage } from '../types/codex'

export function hasMessageBodyContent(message: UiMessage): boolean {
  return (
    message.text.length > 0
    || (Array.isArray(message.images) && message.images.length > 0)
    || (Array.isArray(message.fileAttachments) && message.fileAttachments.length > 0)
    || (Array.isArray(message.skills) && message.skills.length > 0)
  )
}

// 仅在走「通用正文」渲染分支（非 command/toolCall/fileChange/compaction/plan，
// 由调用方先行判定）时调用：没有任何可渲染内容 → 应省略该空行。
export function shouldOmitEmptyGenericMessage(message: UiMessage): boolean {
  return !hasMessageBodyContent(message)
}