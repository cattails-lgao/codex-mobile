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

## 追加修复（同轮后续 bug A/B + 回退降级 + 协议快照）

### Bug A：分割栏居中 + 重复分割栏 + 固定底部位置
- `ModelSwitchDivider.vue`：`.model-switch-divider` 补 `width: 100%; box-sizing: border-box`，两侧线条经 `flex:1` 拉伸使文本真正居中。
- 重复切换不再新增分割栏，而是更新已有分割栏（`injectModelSwitchDivision` 检测 `noNewTurnSinceLastSwitch`，同轮多次切换原地改写），避免同一锚点堆积重复分隔。
- 分割栏不再固定追加列表末尾，改为按切换锚点插入真实消息之后。

### Bug B：新消息跑到上一个用户消息下方
- 重构 `ThreadConversation.renderTurns`：`leadingDivider`/`divider` 单值改为 `leadingDividers`/`dividers` 数组，`anchorToDivider` 支持一锚点多分割栏（Map 改为数组累加，不再覆盖）、`takeGroupDividers` 提取本轮全部锚定分割栏并删除已消费锚点；未命中锚点的分割栏堆叠渲染在 warm 区首轮前（`leadingDividers`）。消息列表剔除 `modelSwitch` 且 `renderTurns` 不产生空轮。
- 模板改为 `v-for="turn in renderTurns"` 包裹 `ThreadTurn`，在轮前/轮后渲染对应分割栏数组。

### 回退降级（paginated 历史）
- `threads.ts` 新增 `revertThread(threadId, beforeTurnId)`：`thread/rollback` 自 codex 0.148 起被 paginated 历史整体拒绝（`paginated threads do not support thread/rollback`），改用 `thread/revert {threadId, beforeTurnId}`（丢弃该轮及之后所有轮次）。
- `useDesktopState.ts` 新增 `rollbackThreadWithRevertFallback`：先 `thread/rollback`，按 `not support thread/rollback` 特征降级 `thread/revert`；`beforeTurnId` 命中目标轮（钳制到最新轮时用最新持久化消息 turnId）。回退顺序改为**先对话后退文件**，`revertThreadFileChanges` 返回的 `errors` 显式检查并 `console.warn`，不再静默丢弃「文件没退」。

### 协议快照同步
- `documentation/app-server-schemas/json`（416 文件）+ `typescript`（827 文件）用本机 codex `0.153.4` 以 `--experimental` 重新生成镜像，`APP_SERVER_DOCUMENTATION.md` 版本说明更新为 0.153.4。验证 `collaborationMode/list`、`fuzzyFileSearch/session*`、`remoteControl/*` 等在 0.153.4 均为有效方法或客户端有兼容降级。

## 变更范围与约束
- 仅触碰模型切换注入/窗口失效与分割栏渲染；不做热/暖/冷折叠或滚动逻辑改动。
- 未触碰高推理/子代理过滤/final 摘要/realtime 时序等硬约束路径。
- 已知简化（ponytail: 有上限）：分割栏按锚点插入而非真实时间线与消息交错；每线程上限 20 条防无界增长。

## 验证（已跑通）
- `modelSwitchMessages.test.ts` 2 通过。
- `useDesktopState.test.ts` 93 通过（含回退降级用例）；`transcriptGrouping.test.ts` 33 通过。
- `vue-tsc --noEmit` 无错误。
- 浏览器实测四例全过：正常加载、首个分割栏锚定位置、重复切换更新为单条而非堆积、新消息出现在分割栏后。另测回退 paginated/legacy 线程与回退首/中/末消息。
- 手测步骤见 `tests/providers-models/model-switch-resets-context-and-appends-divider.md` 与 `tests/thread-loading-state/rollback-works-on-legacy-and-paginated-threads.md`。

## 性能审计
- 改动均在渲染/切换的线性过滤上（`filteredMessages`、`modelSwitchMessages` 各一次 O(n) 遍历），无新增网络请求、无启动/实时/缓存失效风险；注入列表有界（≤20），localStorage 写入为微小数组；回退降级仅在 `thread/rollback` 失败时多发一次 `thread/revert`（罕见路径）。无性能回归。

## 发布
- 版本 `0.1.117 → 0.1.118`。git tag `v0.1.118` 与 GitHub Release 由维护者创建；`codex-mobile-re@0.1.118` 由用户 publish 至 npm 官方源完成闭环。