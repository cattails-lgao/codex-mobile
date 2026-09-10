# round-73：切换模型后上下文窗口未更新 + 模型切换分割栏消息（v0.1.118）

## 需求
1. 切换模型后上下文窗口没有更新。
2. 切换模型时，在消息列表里插入一条**独立的分割栏**消息（展示「旧模型 → 新模型」），单独成栏，不参与本轮过程区/结论区，且本地持久化、不写服务器。

## 需求 1 根因
上下文窗口值完全来自 app-server 的 `thread/tokenUsage/updated` 通知（携带 `modelContextWindow` + token 计数），按线程持久化到 `codex-web-local.thread-token-usage.v1`。切换模型**不会立刻产生 usage 事件**，因此指示器继续显示旧模型的窗口。本地没有「模型 → 窗口大小」的可靠数据源（provider-models 只返回 model ID），硬编映射表会是错误数字。

## 需求 1 方案（诚实方案）
新增 `invalidateThreadContextWindow(threadId)`（`useDesktopState.ts`）：把该线程 `threadTokenUsageByThreadId[threadId]` 的 `modelContextWindow` 置 `null`（保留总/末 token 计数）并 `saveThreadTokenUsageMap`。
- 效果：`ThreadComposer.buildContextUsageView` 在 `modelContextWindow` 为 null 时返回空 → 指示器进入「等待新模型首个 tokenUsage 事件」占位态。
- 新模型跑完首个 turn 后 app-server 发来真实 `modelContextWindow` 自动恢复，不再展示误导性的旧模型窗口。

## 需求 2 方案
- 新增纯函数 `isModelSwitchMessage`（`src/utils/modelSwitchMessages.ts`，含单测），`messageType === 'modelSwitch'`。`UiMessage` 补可选字段 `modelSwitchFrom`/`modelSwitchTo`。
- 持久化：`useDesktopStatePersistence.ts` 新增 `loadModelSwitchMarkerMap`/`saveModelSwitchMarkerMap`，key `codex-web.local.thread-model-switch-markers.v1`，每线程最多保留 20 条。
- useDesktopState：新增 `modelSwitchMarkersByThreadId` ref、`injectModelSwitchDivision(threadId, from, to)`；`messages` 计算属性末尾 append 该线程 markers（裁剪到 20）。
- 触发点：`App.vue:onSelectModel` 先 `readModelIdForThread` 取旧模型，`setSelectedModelIdForThread` 后若旧→新不同，调用 `injectModelSwitchDivision` + `invalidateThreadContextWindow`。
- 渲染：`ThreadConversation.vue` 的 `filteredMessages` 改为同时剔除 `isPlanMessage` 与 `isModelSwitchMessage`（modelSwitch 完全不进 `turnGroups`/`renderTurns`）；新增 `modelSwitchMessages` computed，在消息列表容器末尾渲染独立分割条 `ModelSwitchDivider.vue`（light 用 `slate-300`，dark 用 `zinc-700` 轨道，与 `.message-divider` 约定一致）。

## 涉及文件
- `src/utils/modelSwitchMessages.ts`（新）+ `.test.ts`
- `src/components/content/ModelSwitchDivider.vue`（新）
- `src/types/codex.ts`：`UiMessage` 可选 `modelSwitchFrom`/`modelSwitchTo`
- `src/composables/useDesktopStatePersistence.ts`：`loadModelSwitchMarkerMap`/`saveModelSwitchMarkerMap`
- `src/composables/useDesktopState.ts`：`modelSwitchMarkersByThreadId` + `injectModelSwitchDivision` + `invalidateThreadContextWindow` + messages append + 导出
- `src/App.vue`：`onSelectModel` 触发注入与窗口失效
- `src/components/content/ThreadConversation.vue`：`filteredMessages` 剔除 + 分割栏渲染块
- `tests/providers-models/model-switch-resets-context-and-appends-divider.md` + `index.md`：手测文档

## 变更范围与约束
- 仅触碰模型切换注入/窗口失效与分割栏渲染；不做热/暖/冷折叠或滚动逻辑改动。
- 未触碰高推理/子代理过滤/final 摘要/realtime 时序等硬约束路径。
- 已知简化（ponytail: 有上限）：分割栏消息始终追加在线程消息列表末尾，不按真实切换事件与后续真实消息交错；每线程上限 20 条防无界增长。

## 验证（已跑通）
- `modelSwitchMessages.test.ts` 2 通过。
- `useDesktopState.test.ts` 93 通过；`transcriptGrouping.test.ts` 33 通过。
- `vue-tsc --noEmit` 无错误。
- 手测步骤见 `tests/providers-models/model-switch-resets-context-and-appends-divider.md`（请在本地 dev 4173 验证后放行发布）。

## 性能审计
- 改动均在渲染/切换的线性过滤上（`filteredMessages`、`modelSwitchMessages` 各一次 O(n) 遍历），无新增网络请求、无启动/实时/缓存失效风险；注入列表有界（≤20），localStorage 写入为微小数组。无性能回归。

## 发布
- 版本 `0.1.117 → 0.1.118`。git tag `v0.1.118` 与 GitHub Release 由维护者创建；`codex-mobile-re@0.1.118` 由用户 publish 至 npm 官方源完成闭环。