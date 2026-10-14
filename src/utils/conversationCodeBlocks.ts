/**
 * 「复制最后一个代码块」（round-154）
 *
 * 桌面端有 `copyLastCodeBlock` 命令（标题「复制最后一个代码块」/ `Copy last code block`，
 * 描述「复制当前聊天中助手提供的最后一个代码块」，见 `tmp/r145-asar` 的 zh-CN 包），
 * 我方此前缺这一条 —— 判定书 §三·C 记为「他们」的最后一处缺口。
 *
 * 本模块是**纯函数 + 纯数据**：不 import 组件 / store / DOM，复用既有的
 * `parseMessageBlocks`（与渲染层同一条解析路径，避免「复制出来的内容和看到的不一样」）。
 *
 * 语义取自桌面端描述：
 * - 只看**助手**消息（`isAssistantContentMessage`，与组件里 `isCopyableAssistantMessage`
 *   同口径：排除命令执行、`worked` 过程消息与 `.live` 流式占位）。
 * - 「最后一个」＝**全局最后**：从末尾往前找第一条带代码块的助手消息，取该消息的最后一个块。
 *   最后一条助手消息没有代码块时会继续往前找，而不是直接判空。
 */

import type { UiMessage } from '../types/codex'
import { hasCodeFenceStart, parseMessageBlocks, type MessageBlock } from './conversationMarkdown'

export interface ConversationCodeBlock {
  /** 代码块所在消息 id（用于将来的「跳到该块」等扩展；当前只用于标识）。 */
  messageId: string
  /** 该消息所属轮次；没有轮次信息时为 null。 */
  turnIndex: number | null
  /** 围栏语言标记，未标注时为 ''。 */
  language: string
  /** 代码正文（不含围栏行）。 */
  value: string
}

/**
 * 默认的「助手内容消息」判定。
 *
 * 刻意与 `ThreadConversation.vue` 的 `isCopyableAssistantMessage` 保持**同一条规则**
 * （排除命令执行、`worked`、`.live`），但二者问的是不同问题——那边是「这条回复能不能整体复制」，
 * 这边是「这条消息里会不会有助手给出的代码」。规则相同就在此集中定义，避免两处漂移。
 */
export function isAssistantContentMessage(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !(message.messageType === 'commandExecution' && !!message.commandExecution)
    && message.messageType !== 'worked'
    && !(message.messageType ?? '').endsWith('.live')
}

type RawCodeBlock = { language: string; value: string }

/**
 * 递归收集块树里的代码块。
 *
 * 嵌套只发生在**列表项**上（`unorderedList` / `orderedList` 的 `items[].children`；
 * `taskList` 的 item 没有 children）。`blockquote` 是纯 `value: string`、
 * 内部不再解析成块 ⇒ **引用块里的围栏不算代码块**，与渲染层一致
 * （渲染层同样只按 `codeBlock` 分支出代码块）。这一点与 `hasCodeFenceStart` 不冲突：
 * 引用块的每一行都以 `>` 开头，`^\s{0,3}(```+|~~~+)` 不会命中。
 */
function collectCodeBlocksFromBlocks(blocks: readonly MessageBlock[], out: RawCodeBlock[]): void {
  for (const block of blocks) {
    if (block.kind === 'codeBlock') {
      out.push({ language: block.language, value: block.value })
      continue
    }
    if (block.kind === 'unorderedList' || block.kind === 'orderedList') {
      for (const item of block.items) {
        if (item.children && item.children.length > 0) {
          collectCodeBlocksFromBlocks(item.children, out)
        }
      }
    }
  }
}

/** 单条消息里的全部代码块（按出现顺序）。无正文 / 无围栏时为空数组。 */
export function collectCodeBlocksFromMessage(message: UiMessage): RawCodeBlock[] {
  const text = message.text
  if (!text || !text.trim()) return []
  const out: RawCodeBlock[] = []
  collectCodeBlocksFromBlocks(parseMessageBlocks(text), out)
  return out
}

/**
 * 廉价的可用性判定：是否存在能提供代码块的助手消息。
 *
 * 只做「有没有围栏起始行」的扫描（`hasCodeFenceStart`，与解析器共用同一条围栏正则 ⇒
 * 命中即保证 `parseMessageBlocks` 会产出 `codeBlock`），**不解析块**。命令面板的可用性
 * 收敛依赖 `filteredMessages`，流式期间会反复重算，全量解析在大线程上太贵。
 */
export function hasAssistantCodeBlock(
  messages: readonly UiMessage[],
  isAssistant: (message: UiMessage) => boolean = isAssistantContentMessage,
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isAssistant(message)) continue
    if (hasCodeFenceStart(message.text ?? '')) return true
  }
  return false
}

/** 全局最后一个助手代码块；找不到返回 null。 */
export function findLastAssistantCodeBlock(
  messages: readonly UiMessage[],
  isAssistant: (message: UiMessage) => boolean = isAssistantContentMessage,
): ConversationCodeBlock | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isAssistant(message)) continue
    const blocks = collectCodeBlocksFromMessage(message)
    const last = blocks[blocks.length - 1]
    if (!last) continue
    return {
      messageId: message.id,
      turnIndex: typeof message.turnIndex === 'number' ? message.turnIndex : null,
      language: last.language,
      value: last.value,
    }
  }
  return null
}
