# Round-71：修复「空的 agentMessage / 通用正文过程行」

## 背景

round-70 已修复「空的 processFold 块」（全成员隐藏的折叠被移除，v0.1.115）。用户复测 v0.1.115 后报告：本轮过程中仍存在空元素，且都集中在 `<ol class="conversation-turn-items conversation-turn-process-items">` 内。经 DevTools 确认，空元素是两类 `<li>`：

1. `class="conversation-item conversation-item-fold" data-message-type="processFold"`（折叠，round-70 已处理）
2. `class="conversation-item conversation-item-process" data-role="assistant" data-message-type="agentMessage"`（空文本推演消息，本次新修）

## 根因（新）

推演类消息（`agentMessage` 等）出现在本轮过程区；当其 `text` 为空、且无图片/文件附件/技能时，落入 [ThreadConversation.vue](file:///d:/code/codex-mobile/src/components/content/ThreadConversation.vue) 的通用正文分支——「文本为空」时 `message-card`（`v-if="message.text.length > 0"`）被跳过，而图片/附件/技能列表也为空 → `message-body` 无任何内容 → 渲染出一个完全空的 `<li>`。

round-70 的守卫只针对「全成员被隐藏的折叠」，未覆盖此类空文本通用正文行。

## 改动

- 新增纯函数 `src/utils/messageContent.ts`：`hasMessageBodyContent(message)`（文本/图片/附件/技能任一非空）与 `shouldOmitEmptyGenericMessage(message)`（无内容 → 省略）。
- [ThreadConversation.vue](file:///d:/code/codex-mobile/src/components/content/ThreadConversation.vue)：普通 `<li>` 分支（`v-else-if`）追加 `&& !shouldOmitEmptyGenericMessage(message)`，仅在命中通用正文分支且无任何可渲染内容时省略，不触碰 command/toolCall/fileChange/compaction/plan 各专用分支。

## 验证

- `src/utils/messageContent.test.ts`：5/5 通过（省略空正文、保留有文本/图片/附件）。
- `src/utils/conversationFolds.test.ts`：15/15（round-70 回归不受影响）。
- `vue-tsc --noEmit`：通过。

## 备注

- 空 `processFold`（全隐藏折叠）自 v0.1.115 起已修复；若在 v0.1.115+ 仍见空折叠，说明实例为旧构建。本轮修复的是**空 agentMessage/通用正文行**。