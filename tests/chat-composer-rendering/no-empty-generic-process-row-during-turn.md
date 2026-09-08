# No empty generic process rows during a turn

2026-09-08（round-71）。修复「本轮过程区的空推演/通用正文行」。

## 问题

本轮过程中 `ol.conversation-turn-process-items` 内出现完全空的 `<li class="conversation-item conversation-item-process" data-role="assistant" data-message-type="agentMessage">`（DevTools 确认）。

## 根因

推演类消息（`agentMessage` 等）文本为空且无图片/附件/技能时，落入通用正文分支：`message-card` 因 `message.text.length === 0` 被跳过，图片/附件/技能列表也为空 → 渲染出空 `<li>`。（round-70 只处理了「全成员被隐藏的空折叠」，未覆盖此路径。）

## 改动

- 新增 `src/utils/messageContent.ts`：`hasMessageBodyContent` / `shouldOmitEmptyGenericMessage`。
- `ThreadConversation.vue` 普通 `<li>` 分支追加 `!shouldOmitEmptyGenericMessage(message)`：仅省略「走通用正文分支且无任何内容」的消息行；command/toolCall/fileChange/compaction/plan 专用分支不受影响。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`。

## 验证步骤

1. 打开 App，进入一个包含逐步推演/agentMessage 的多轮线程。
2. 滚动浏览各轮过程区，注意 `ol.conversation-turn-process-items` 下的 `<li>`。

## 期望结果

- 过程区不再出现完全空的 `<li>`（尤其中间步骤的 `agentMessage` 空行）。
- 有实际内容（文本/推理块/工具/命令/文件变更）的行正常渲染，无丢失。

## 自动化

- `src/utils/messageContent.test.ts`：5 条用例（空正文省略、文本/图片/附件保留）。

## 回滚

- 撤销 `ThreadConversation.vue` 的 `!shouldOmitEmptyGenericMessage(message)` 守卫与 `messageContent.ts` 即可回到旧的（会渲染空过程行）行为。