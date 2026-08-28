# Round-62：前端领域模块化续期（2026-08-28）

> **背景：** round-48/49 只完成 Vue 视图组件化，`useDesktopState.ts` 等逻辑中枢需按领域另行拆分。本轮在同步最新 `main` 后重新开启该工作，以公开契约、持久化键、请求顺序和消息时序不变为前提，连续完成低风险领域边界；不把 live turn/message/realtime 高风险链路混入本轮。

## 本轮范围

本轮包含 `3ab0020` 至 `501179c` 共 9 个代码提交，以及后续追加的线程列表加载提取：

| 提交 | 内容 |
| --- | --- |
| `3ab0020` | 提取 model/provider/reasoning preferences，包含 High 手动覆盖、speed mode 与模型元数据刷新 |
| `d05088c` | 提取线程/provider context key、规范化与裁剪工具 |
| `ae1d18d` | 提取 collaboration preferences |
| `27a8ee3` | 为 Settings Accounts、右侧栏、审批和 Queue 等低频表面增加异步边界 |
| `b8932ea` | 将完整 Settings 对话框提取为异步组件 |
| `343fc14` | 提取 rate-limit 状态、并发刷新与 500 ms 防抖 |
| `a2ebff3` | 提取项目显示名、顺序、置顶、改名、移除及 workspace-roots 持久化 |
| `358f0f7` | 提取 Skills / Hooks catalogs、cwd 缓存与 in-flight 请求 |
| `501179c` | 提取服务端 Queue 镜像、自动压缩暂存、阈值持久化与列表操作 |
| 后续 | 提取线程列表加载 → `useDesktopThreadListLoading.ts` |

详细的逐批依赖、测试和性能数据见 [热点领域模块化方案](../sections/domain-modularization-plan.md)。

## 边界与结果

- `useDesktopState.ts` 从本轮对齐基线约 4,766 行降至 3,927 行，线程列表加载提取后进一步降至约 3,787 行。主文件继续负责消息历史、turn 生命周期、realtime 通知和发送/压缩编排；新模块只通过窄依赖和 action 接入。
- `App.vue` 的低频表面形成真实异步 chunk；完整 Settings 迁至 `src/components/settings/SettingsDialog.vue`。主 JS 曾从对齐基线 `609.25 kB` 降至 `549.71 kB`，后续静态领域模块加入测试边界后最新为 `551.90 kB`（gzip `171.28 kB`）。
- `useDesktopState` 对 `App.vue` 的公开 refs/actions、localStorage key、RPC 参数与用户可见行为保持不变。
- 用户此前关注的 `>500 kB` chunk 警告仍存在。没有调高阈值，也没有把首屏线程树、Composer 或状态中枢强行异步化来只消除数字。

## 新增模块

### `useDesktopThreadListLoading.ts`

提取线程列表加载的读请求和缓存所有权：

- **文件：** `src/composables/useDesktopThreadListLoading.ts`
- **接口：** `ThreadListLoadingDeps` — 通过窄依赖注入写侧编排函数（`applyThreadGroups`、`hydrateWorkspaceRootsStateIfNeeded`、`loadThreadTitleCacheIfNeeded`、`loadWorkspaceRootsStateForThreadList`、`pruneThreadScopedState`、`setSelectedThreadId`）
- **所有权：** `loadedThreadListGroups`、`threadListNextCursor`、`loadedThreadListRootsState` 等缓存变量
- **公开方法：** `loadThreads`、`loadRemainingThreadPages`（内部）、`scheduleRemainingThreadPages`、`removeThreadFromLoadedLists`、`dispose`、`hasActiveInProgressThreads`、`hasRemainingThreadPages`
- **公开 refs：** `isLoadingThreads`、`isThreadListFullyLoaded`、`hasLoadedThreads`
- **原则：** 只拆分读请求与缓存所有权，不动 live turn/最终总结/realtime 时序

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过，前端 313 modules；CLI `dist-cli/index.js` 633.48 KB。
- 最新定向测试：`useDesktopQueueState.test.ts` + `useDesktopState.test.ts`，89/89 通过。
- 全量测试：423/426 通过。三个失败均为未改动 Bridge 测试的既有 Windows 差异：symlink 创建 `EPERM`；POSIX `0600` 在 Windows 读取为 `0666`；一个超时。
- 线程列表加载提取后可见行为不变，未新增 Playwright。

## 性能审计

- Preferences、Rate limits、Catalogs 与 Queue 的请求入口、顺序、缓存和失败保留语义保持不变。
- Queue 启动仍最多一次 GET；相关 turn 事件仍为一次立即 GET 加一次 650 ms 跟进 GET；同线程重叠请求继续由 in-flight guard 抑制。
- 线程列表加载的请求入口、分页调度、缓存合并语义与 `useDesktopState` 闭包中原实现完全一致。
- 没有新增 watcher、后台轮询、阻塞 I/O、无界 fanout 或大 payload。静态领域模块不是 code-splitting 手段，主 chunk 小幅变化属模块边界开销。

## 下一步 · 收官评估（2026-08-28）

此后续三批已另批完成：**消息历史加载**（`loadMessages`/`loadOlderMessages`/`ensureThreadMessagesLoaded` → `useDesktopMessageHistoryLoading.ts`）、**线程标题缓存**（`threadTitleById` + 标题加载/生成/归一化 → `useDesktopThreadTitleCache.ts`）与**待办服务端请求**（`pendingServerRequestsByThreadId`/`pendingReplyErrorByRequestId` + 读侧 computed/读助手/读请求/作用域化 prune → `useDesktopPendingServerRequests.ts`）的读请求与缓存所有权均已按「窄依赖注入 + 写侧编排保留在主闭包」模式抽出。`useDesktopState.ts` 因此自约 3,787 行降至约 3,483 行。

对本轮剩余三个候选依「只拆读请求与缓存所有权、不动 live turn/最终总结/realtime 时序」逐项评估后，**结论为全部不建议拆分，领域模块化系列正式收官**：

- **read-state/unread**：unread 的真正读取是内联在必须留在主闭包的 `applyThreadFlags` 合并写和弦（865–869），非独立函数；能搬走的仅 3 个 ref 声明 + 2 条内联 prune + 一个剪枝 helper，约 15–20 行，核心读拆不出；`markThreadAsRead`/`markThreadUnreadByEvent` 因读写 `sourceGroups`/`selectedThreadId`/`saveReadStateMap` 并调 `applyThreadFlags` 属写编排留主，且 `markThreadUnreadByEvent` 由 turn/completed 回调调用。属「贴壳搬 ref」，是明确的反模式，收益≈0、中风险。
- **reasoning archive**：`persistedReasoningByThreadId`/`liveReasoningTextByThreadId` 缓存已深度接进独立的 `useDesktopStateReasoningWrites`/`useDesktopStateReasoningTimeline`，再拆只剩边际收益，且踩 live turn 高风险线。
- **turn lifecycle / realtime**：核心 `applyRealtimeUpdates` 是约 410 行（1655–2066）的中枢写引擎，实测直接读写 ≥12 个共享闭包 ref、调用 ≥34 个本地写编排函数——抽走需约 46 成员的 deps 对象（即把整个闭包拎着走）并重构状态所有权+重排时序，改动面以千行计、无既有 SSE 交叠时序的回归保护。纯通知解析层（`useDesktopStateNormalizers`/`useDesktopStateReaders`）和 clean 的读请求+缓存候选均已抽完；残留 `readPlan*`/`readCommandExecution*` 返回前即写 live ref，本质是写编排。应作为**有意的整体边界保留**，不继续拆。

收官口径：本轮起 `useDesktopState.ts` 退化为单一协调器（消息历史、turn 生命周期、realtime 分发、发送/压缩编排、跨域 flags 合并），各领域只读增量因子路由回主闭包由 `applyThreadFlags` 合并；后续若需改造，应转向「新增领域文件 + 显式 deps 汇流点」的演进，而非继续拆写引擎。

### 新一轮 · 巨型 `.vue` 第二轮组件化（待办）

useDesktopState 收敛结束后，盘点前端大文件并评估是否再来一轮视图组件化，测量与结论记录在 [domain-modularization-plan.md](../sections/domain-modularization-plan.md#巨型-vue-第二轮组件化评估)。要点：`App.vue`/`SidebarThreadTree`/`ThreadConversation` 的"大"在 `<script setup>` 编排逻辑（`App.vue` script 4,271 行 / 102 局部 ref / 124 await），模板已被 round-48/49 抽干净，再抽叶组件收益有限；剩余杠杆是**hook 化**而非 `.vue` 拆分。

**下一步（已完成 · SidebarThreadTree 试点）**：先只读评估 `SidebarThreadTree` 的真实簇边界，结论已修正原「过滤 / 键盘导航 / 右键菜单」三簇假设——**键盘导航并非独立簇（仅 `onProjectHeaderKeyDown` 单函数），过滤即树形塑造是 `filteredGroups` 主耦合核心不拆**。真正内聚、可做 hook 的两个目标实现完成：

### SidebarThreadTree 第二轮组件化试点结果（2026-08-28）

两个 hook 均已实现并接回 `SidebarThreadTree.vue`（`vue-tsc` 通过、`vite build` 通过、sidebar 定向测试 8/8）：

- **`useProjectDragAndDrop.ts`（新增，~380 行）**：`createProjectDragAndDrop(deps)` 工厂，自持 `pending/activeProjectDrag`、指针采样与 rAF、分组测量缓存（`measuredHeightByProject`、`ResizeObserver`、元素/名称 WeakMap 映射）、`suppressNextProjectToggleId`，以及布局 computeds（`layoutProjectOrder`/`layoutTopByProject`/`groupsContainerStyle`）与 `projectGroupStyle`/`isDraggingProject`。**边界判断：**该项目分组测量 + 拖拽布局 + 掉落定位是一体的「项目组布局引擎」（所有分组本就 `position:absolute` 由 `layoutTopByProject` 摆放），并非纯动作层，故测量基础设施一并归入 hook；对外依赖收窄为 7 个窄注入（`getGroups`/`getFilteredGroups`/`isSearchActive`/`isCollapsed`/`getElevatedProjectName`/`onReorderProject`/`closeProjectMenu`）。纯掉落投影数学抽成**可导出纯函数** `projectProjectedDropIndex` 并配 6 例定向单测（`useProjectDragAndDrop.test.ts`），作为可运行回归检查。组件侧的 toggle 抑制消费走 `takeToggleSuppression`、groups 变化剪枝走 `pruneProjectGroups`、卸载走 `dispose`。
- **`useAutomationDialog.ts`（继续完成，~645 行）**：`createAutomationDialog(deps)` 工厂，自持自动化表单/draft/调度状态、thread/project 自动化缓存、编辑器/创建器/删除/运行编排；新增 `removeAutomationsForThread` 供组件 `archiveThread` 复用（含 API 删除 + 本地缓存移除），旧内联自动化函数块（约 287 行）从组件删除，改由解构接入。

边界干净性：组件脚本因此显著瘦身，拖拽/自动化逻辑不再存活于巨型 `<script setup>`；两者均以「窄依赖注入 + 写侧编排保留在组件（reorder 事件、archive 编排等）」接线，未改动任何行为。**结论：巨型 `.vue` 第二轮组件化的 hook 化路径可行**，可推广到其它候选，但应优先选择内聚、自持状态、对外依赖窄的簇（如本例），而非贴壳搬 ref。

### ThreadConversation 渲染管道试点结果（2026-08-28）

`ThreadConversation` 的 `<script setup>`（约 2,400 行）此前被划为「round-19 高风险 UI」不拆——但逐簇盘点后发现：**Markdown/代码块渲染管道是一簇内聚、自持、窄依赖、无深度时序的纯渲染簇**，与高风险 UI 状态（文件链接上下文菜单、图片面板、生命周期）解耦，可安全抽出而不踩 round-19 红线。本轮实现：

- **`useMarkdownRendering.ts`（新增，~355 行）**：`createMarkdownRendering({ getCwd, isVideoMediaUrl })` 工厂，自持三段 LRU 缓存（`messageBlockCache` / `inlineSegmentCache` / `markdownHtmlCache` / `highlightHtmlCache`，各设上限与伪 LRU 命中提升）、highlight.js 延迟加载（`ensureHighlightJsLoaded`，动态 import，加载成功后 `highlightCacheVersion` 递增并清空 HTML 缓存）、块/内联/列表/表格/代码块 HTML 渲染（`renderMessageBlockAsHtml` / `renderListItemContentAsHtml` / `renderMarkdownBlocksAsHtml`）、浏览/编辑 URL 换算（`toBrowseUrl` / `toEditUrlFromBrowseHref`）、`clearRenderCaches`。对外依赖仅 2 个窄注入（`getCwd` / `isVideoMediaUrl`）+ 既有纯工具函数。
- 组件删除约 326 行内联渲染——缓存声明、`GET` 失效逻辑、highlight.js 加载、`sanitizeHtml` 调用及各 `render*`/解析 helper，改由 `createMarkdownRendering` 解构接入；保留文件链接上下文菜单、图片面板、生命周期等非渲染 UI。
- 单元回归：`useMarkdownRendering.test.ts`（5 例：内联加粗渲染、块缓存命中、按 text/cwd 的缓存键、未加载高亮时原始代码转义、清缓存后仍渲染），`vue-tsc --noEmit` 与 5/5 定向测试通过。迁移说明见 `tests/chat-composer-rendering/componentization-round-62-conversation-markdown-rendering.md`（44 节）。

边界结论：渲染管道是「纯函数式」簇，与队内先例（`useMarkdownRendering` deps 仅 2 个）一致是**最干净的候选**；`ThreadConversation` 剩余的深 UI 状态（文件链接菜单、图片面板、生命周期、消息窗口化）仍保持不动。

### ThreadConversation 文件变更摘要 + diff viewer 试点结果（2026-08-28）

延续渲染管道试点，本轮抽取同组件的**文件变更摘要 + diff viewer**簇（候选8/9 的前半，纯 read 部分）：

- **`useFileChangeSummaries.ts`（新增，~400 行）**：`createFileChangeSummaries(deps)` 工厂，自持 `expandedFileChangeSummaryIds`/`activeDiffViewerSummary`/`activeDiffViewerChangeKey`/`isDiffViewerFileListOpen` 状态，以及三组摘要 computed（`anchoredFileChangeSummaryByAnchorId` / `standaloneFileChangeSummaryByMessageId` / `hiddenFileChangeMessageIds`）与三个 diff viewer computed（`diffViewerChanges` / `activeDiffViewerChange` / `activeDiffViewerLines`），外加 toggle/open/close/select 读写方法、`isFileChangeSummaryVisible` 与 watcher 用的 `pruneFileChangeSummaryIds()`。对外依赖为 9 个窄注入（`getMessages` / `getLiveTurnId` / `isFileChangeMessage` / `isCopyableAssistantMessage` / `isReasoningMessage` / `isPlanMessage` / `isFoldMember` / `getHiddenGroupedCommandIds` / `isMobile`）+ 既有纯工具函数；谓词因模板/回合塑形/复制簇广泛共用而保留组件作单源，经窄注入回传。
- 组件删除约 212 行内联逻辑（含 4 个状态 ref、3 组摘要/diff computed、11 个读写/读函数，及 watcher 里对 `expandedFileChangeSummaryIds` 的直接剪枝改写为 `pruneFileChangeSummaryIds()`），`ThreadConversation.vue` 从提取渲染管道后的状态再瘦约 212 行。
- **边界保留：** 异步的**文件变更 action 状态**（`fileChangeActionState`/`fileChangeActionError`/`fileChangeRedoPatchIds`/`pendingConfirm` + `runFileChangeAction` 的 idle/undoing/redoing 流转）按评估结论留在组件，未拖入本 hook。
- 单元回归：`useFileChangeSummaries.test.ts`（6 例：anchored 按轮末实质消息聚合、standalone 兜底、hidden 源消息集、toggle 展开状态、live-turn 可见性 gate、diff viewer 开关），`vue-tsc --noEmit` 与 6/6 定向测试通过。迁移说明见 `tests/chat-composer-rendering/componentization-round-62-file-change-summaries-and-diff-viewer.md`（45 节）。

此轮与渲染管道试点共同验证了「纯 computed/读簇」的 hook 化路径：内聚、自持状态、对外依赖窄、无深度时序的簇（`activeDiffViewerSummary` 等私有态 + 计算）可安全抽离，异步/写编排（文件变更 action 状态、回合塑形、生命周期）留在组件。`ThreadConversation` 剩余深 UI（文件链接菜单、图片面板、生命周期、消息窗口化）与文件变更 action 簇仍保持不动。

本轮暂不动手：`App.vue` / `ThreadComposer`（await 交叠最深）、`ThreadConversation`（round-19 高风险 UI）中除已抽两个纯 read 簇外（渲染管道、文件变更摘要/diff viewer）的深状态簇、`SidebarThreadTree` 的树形塑造簇（主耦合核心）。

## 交接注意事项

- 不要为了继续降行数直接搬运闭包函数；先确认领域拥有的 refs、请求缓存和唯一写入口，再用窄依赖接线。
- High reasoning、子 agent 过滤、最终总结归属均是历史高风险路径。后续线程加载拆分不得顺带改其行为，除非另起修复批并提供针对性回归。
- 当前完整构建仍会报告 `>500 kB` 主 chunk 警告，这是已记录的剩余首屏结构，不应通过提高 warning limit 掩盖。
