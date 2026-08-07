# 第十四轮交接需求（2026-08-06 提出）

> **2026-08-06 第十四轮进展：** 8 条需求/问题全部落地并验证（`vue-tsc --noEmit` 通过、`pnpm run build` 通过、单测 245 通过 + 2 个既有 Windows 环境性失败与改动无关、Playwright 桌面/H5 + 明暗主题实测）。涉及 `App.vue`、`ThreadComposer.vue`、`ThreadConversation.vue`、`ThreadPendingRequestPanel.vue`、`useDesktopState.ts`、`useDesktopState.test.ts`、`useUiLanguage.ts`、`style.css`。手动测试文档：`tests/chat-composer-rendering/plan-popover-layout-reasoning-turn-thinking-toggle.md`（r13 文档补「审核/询问面板与输入框同宽」一节）。

1. **plan popover 内容重排版（标题/摘要/步骤）**：popover 内容改为三段式——顶部标题行（🗒 Plan + N/M 进度，`border-b` 分隔）、Summary 分区（摘要标签 + explanation 文本）、Steps 分区（步骤标签带计数 + 步骤列表），底部 Implement 按钮；popover 面板 padding 0 + 内容容器 10px，`useUiLanguage` 补 `Steps` 键。实测：`🗒 Plan 0/8` + `Summary`/`Steps (8)` 标签齐全。
2. **思考块（reasoning-block）串到新轮次**：根因——本地存档 thinking 消息统一追加在消息流末尾（`[...persisted, ..., ...persistedReasoning]`），上一轮思考显示到下一轮之后。修复：reasoning 开始流式时记录所属 turn（`activeReasoningTurnIdByThreadId`，因 `turn/completed` 会先清 `activeTurnIdByThreadId`），存档时打上 `turnId`/`turnIndex`；`messages` computed 改走 `mergePersistedReasoning`，按轮次把思考块插到该轮用户消息之后（旧存档无 turnIndex 回退末尾、同轮多条按时间正序）。实测：turn0 思考在第 1 轮用户消息后、turn1 思考在第 2 轮用户消息后。
3. **（确认）`live-overlay-reasoning` 即思考过程**：是 live overlay 中实时流式的模型思考文本，保留现有展示（默认展开），无代码改动需求。
4. **计划已实施但输入框上方 plan 面板仍存在**：`composerPlanPanel` 此前只把按钮置灰；现 `hasLaterWork || requested`（后续轮次已有工作或已点 Implement）时直接 `return null` 隐藏整个面板。实测：已实施线程面板消失，未实施线程面板保留。
5. **思考过程展开后字体灰一点、小一点**：`.reasoning-block-content` 及内部 `.message-text`/`.message-heading` 改为 `text-[13px]`（原 14px）+ zinc-500（原 slate-800），暗色 zinc-400。实测 13px / zinc-500 vs 普通消息 14px / slate-800。
6. **思考过程放到 Thinking 下可展开**：live overlay 的 reasoning 流包在 `.live-overlay-heading` 可点击行（活动标签 + `▾/▸` 切换，默认展开，`aria-expanded` 同步），feed 内 `reasoning-block` 本就支持折叠/展开。
7. **审核/询问面板宽度对齐输入框 shell**：`.thread-pending-request` 原固定 `min(100vw-1rem, 30rem)`（480px）。`App.vue` 用 ResizeObserver 实测 `.composer-with-queue` 内容宽度（减去左右 padding），经 `panel-width` prop 传入面板内联覆盖宽度。实测 1280 桌面 measured 711px == shell 711px。
8. **Thinking 时各类消息扎堆（命令一堆/文本一堆/思考一堆）**：根因——`messages` computed 把 livePlan/liveCommands/liveFileChanges/liveAgent 四组数组按组拼接。修复：`mergeLiveMessages` 用单调递增 sortKey 记录每条 live 消息首次到达顺序（通知本身按真实时间序），去重（turn 中刷新已持久化的 id 不重复展示）后整体排序；排序前统一分配 key（比较器内惰性分配顺序不确定）。实测真实多命令 turn：流式顺序 `agentMessage.live → commandExecution → agentMessage.live → commandExecution …` 正确交错。
9. **暗色主题根因修复（顺带）**：实测发现 scoped `:global(:root.dark)` 规则在本构建中整体被编译丢弃（0 条生效），计划面板/思考块/工作块/工具调用的暗色覆盖全部失效（浅色主题下正常、暗色下仍是浅底）。按仓库规则把 ThreadComposer 计划面板 + ThreadConversation 思考块/工作块/工具调用的 `:global(:root.dark)` 规则整体迁入全局 `style.css`（普通 `:root.dark` 选择器）。实测暗色下计划面板 zinc-900、思考块 zinc-900/60、工作块 zinc-900/60、popover 标题行分隔线 zinc-700。

> **验证说明：** 单测新增 5 例锁定合并逻辑（`mergePersistedReasoning` 按轮次插入/同轮多条顺序/无匹配轮次回退末尾、`mergeLiveMessages` 按到达交错/对 persisted 去重，两函数已导出）。Playwright 实测：已实施面板隐藏、popover 三段式布局、reasoning 归位（注入带 turnIndex 存档）、展开字体 13px/zinc-500、宽度 711px==711px、真实多命令 turn 交错、暗色主题（面板/思考块/工作块）。遗留：live Thinking 折叠因本环境模型思考太快（reasoning 随 item 全量到达即存档）未能在真实 turn 中稳定复现交互点击，折叠/展开逻辑经代码与 DOM 渲染（heading + aria-expanded + 默认展开）确认。

