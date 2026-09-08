# Round-70：修复「本轮过程中出现空的 processFold 块」

## 背景

用户（whj@2026-09-08）反馈：本轮过程中会出现空的 `data-message-type="processFold"` 块，没有内容。

## 根因

两套分组逻辑对「连续命令」的边界判定不一致：

1. **折叠分组 `buildProcessFolds`**（`src/utils/conversationFolds.ts`）：按「**同轮次**连续的可折叠消息（commandExecution/toolCall）」成组，跨轮命令各自独立，满 2 条才折叠。
2. **命令分组 `groupedCommandsByLatestId`**（`src/components/content/useCommandExecutionDisplay.ts`）：仅按「**连续命令**」分组，**不区分轮次**，只保留连续段最后一条命令，其余命令进 `hiddenGroupedCommandIds` 隐藏（命令块降噪：多条连续命令收进一个 work block）。

当相邻两轮末尾/开头各带命令（轮 N 末尾 `cmdA,cmdB`，轮 N+1 开头 `cmdC`）时：
- 不区分轮次的命令分组把 `cmdA,cmdB` 全部隐藏（最新命令是 `cmdC`，它们被收进轮 N+1 的 command 块）。
- 折叠分组为轮 N 生成折叠 `[cmdA,cmdB]`。
- 该折叠两个成员**全部被隐藏** → 渲染出只有折叠头、无任何成员的**空 `processFold` 块**。

## 改动

- `src/utils/conversationFolds.ts`：新增纯函数 `isProcessFoldEmpty(fold, isHidden)`——所有成员都被上层隐藏（命令分组 / 文件变更摘要）时判为空折叠。
- `src/components/content/ThreadConversation.vue`：新增 `emptyFoldStartIds`（复用 `hiddenGroupedCommandIds` ∪ `hiddenFileChangeMessageIds`），模板 `v-if="isFoldStart(message)"` 追加 `&& !emptyFoldStartIds.has(message.id)`，跳过空折叠的 `<li>` 渲染。成员内容已在跨轮命令块/文件变更摘要展示，丢弃空容器不丢数据。
- 新增手测文档 `tests/chat-composer-rendering/no-empty-processfold-block-during-turn.md` 与单测。

## 验证

- 定向 Vitest `src/utils/conversationFolds.test.ts`：15/15 通过（新增 `isProcessFoldEmpty`：全隐藏 → true；至少一条可见 → false）。
- `vue-tsc --noEmit`：通过。