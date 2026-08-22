# 热点领域模块化方案

> 本方案承接 round-48/49 前端大文件组件化。组件化系列聚焦 Vue 视图层（`.vue` 模板/组件拆分），明确排除了三个最大的 `.ts` 逻辑文件；本方案补齐其后置的「领域级模块边界」工作，按领域拆分这三个单文件巨型模块，而不改变 API 契约、持久化状态、路由或用户可见行为。

## 背景

组件化方案（`docs/componentization-plan.md`）第 19 行明确排除 `src/composables/useDesktopState.ts`、`src/api/codexGateway.ts`、`src/server/codexAppServerBridge.ts`，理由是「需要领域级模块边界，不应与 Vue 视图抽取同一系列混做」。上述四期视图组件化已全部完成（round-49 收尾），但「另行处理」的这三个逻辑文件**没有后续排期**，属于实质未收尾项。

经盘点，这三个文件是仓库最大的单文件源码：

| 文件 | 行数 | 类型 | 拆分难度 |
| --- | ---: | --- | --- |
| `src/server/codexAppServerBridge.ts` | ~10,203 | 服务端 Vite 中间件 | 高（模块级常量耦合多） |
| `src/composables/useDesktopState.ts` | ~7,375 | Vue composable 状态中枢 | 高（闭包捕获共享 ref） |
| `src/api/codexGateway.ts` | ~4,165 | 前端 API 网关 | 低（领域边界清晰、零闭包） |

## 目标与不变量

- **目标**：将三个巨型 `.ts` 文件按领域拆分为多文件，降低单文件体积与维护复杂度。
- **不变量**：不改任何 API 契约、持久化状态、路由、用户可见行为；拆分期间不新增网络调用、不改变状态同步语义。
- **收尾口径**：每批拆分后 `vue-tsc --noEmit`、`pnpm run build`（web + CLI）、全量单测通过。

## 领域梳理结论

### 1. `codexGateway.ts` —— 拆入 `src/api/gateway/`（试点，最安全）

约 150 个导出方法，全部经共享核心 `callRpc`，行区间即领域。拆分方式：`codexGateway.ts` 退化为「`callRpc` + 类型 re-export」薄壳，各领域拆成独立文件并由薄壳 `export *` 透出，调用方零改动。

| 建议文件 | 主要方法 |
| --- | --- |
| `gateway/search.ts` | `startFuzzyFileSearchSession` / `updateFuzzyFileSearchSession` / `stopFuzzyFileSearchSession` / `normalizeFuzzyFileSearchResults` / `searchComposerFiles` / `searchThreads` |
| `gateway/threads.ts` | `getThreadGroups` / `getThreadMessages` / `getThreadSummary` / `getThreadDetail` / `getOlderThreadMessages` / `resumeThread` / `archiveThread` / `unarchiveThread` / `compactThread` / `renameThread` / `rollbackThread` / `startThread` / `forkThread` / `startThreadTurn` / `interruptThreadTurn` |
| `gateway/models.ts` | `getAvailableModels` / `getAvailableModelIds` / `getCurrentModelConfig` / `setDefaultModel` / `setCodexSpeedMode` / `getFreeModeStatus` / `setFreeMode` / `setFreeModeCustomKey` / `setCustomProvider` / `getAvailableCollaborationModes` |
| `gateway/directory.ts` | `listDirectoryPlugins` / `readDirectoryPlugin` / `installDirectoryPlugin` / `uninstallDirectoryPlugin` / `setDirectoryPluginEnabled` / `listDirectoryApps` / `setDirectoryAppEnabled` / `listDirectoryMcpServers` / `reloadDirectoryMcpServers` / `startDirectoryMcpLogin` / `getDirectoryComposioStatus` / `listDirectoryComposioConnectors` / `readDirectoryComposioConnector` / `startDirectoryComposioLogin` / `startDirectoryComposioCliLogin` / `installDirectoryComposioCli` / `getMethodCatalog` / `listHooks` / `addDirectoryMarketplace` / `removeDirectoryMarketplace` / `upgradeDirectoryMarketplaces` / `savePluginShare` / `listPluginShares` / `deletePluginShare` / `checkoutPluginShare` |
| `gateway/automations.ts` | `getThreadAutomationMap` / `getProjectAutomationMap` / `getThreadAutomation` / `upsertThreadAutomation` / `upsertProjectAutomation` / `deleteThreadAutomation` / `deleteProjectAutomation` / `runThreadAutomationNow` |
| `gateway/accounts.ts` | `getAccounts` / `refreshAccountsFromAuth` / `startCodexLogin` / `completeCodexLogin` / `switchAccount` / `removeAccount` / `getAccountRateLimits` / `getAccountRateLimitsResponse` / `readRemoteControlStatus` / `readApprovalPolicy` / `writeApprovalPolicy` / `setRemoteControlEnabled` / `startRemoteControlPairing` / `listRemoteControlClients` / `revokeRemoteControlClient` |
| `gateway/git.ts` | `getWorkspaceRootsState` / `setWorkspaceRootsState` / `createWorktree` / `createPermanentWorktree` / `getWorktreeBranchOptions` / `getGitBranchState` / `getGitRepositoryStatus` / `checkoutGitBranch` / `getGitBranchCommits` / `getGitCommitFiles` / `resetGitBranchToCommit` / `openProjectRoot` / `getProjectZipDownloadUrl` / `downloadProjectZip` / `importProjectZip` |
| `gateway/files.ts` | `getProjectRootSuggestion` / `listLocalDirectories` / `listWorkspaceFiles` / `previewLocalFile` / `getHomeDirectory` / `createLocalDirectory` / `cloneGithubRepository` / `createProjectlessThreadDirectory` |
| `gateway/develop.ts` | `getThreadReviewResult` / `getReviewSnapshot` / `getReviewSummary` / `applyReviewAction` / `initializeReviewGit` / `startThreadReview` / `updateThreadFileChanges` / `revertThreadFileChanges` |
| `gateway/terminal.ts` | `attachThreadTerminal` / `getThreadTerminalStatus` / `getThreadTerminalQuickCommands` / `sendThreadTerminalInput` / `resizeThreadTerminal` / `closeThreadTerminal` / `getThreadTerminalSnapshot` |
| `gateway/misc.ts` | `subscribeCodexNotifications` / `getNotificationCatalog` / `replyToServerRequest` / `getPendingServerRequests` / `generateThreadTitle` / `getSkillsList` / `getComposerPrompts` / `createComposerPrompt` / `removeComposerPrompt` / `uploadFile` / `listRealtimeVoices` / `startRealtimeSession` / `appendRealtimeAudio` / `stopRealtimeSession` / `configureTelegramBot` / `getTelegramConfig` / `getTelegramStatus` / `getThreadTitleCache` / `persistThreadTitle` / `getThreadReasoningArchive` / `persistThreadReasoningArchive` / `getPinnedThreadState` / `persistPinnedThreadIds` / `getFirstLaunchPluginsCardPreference` / `persistFirstLaunchPluginsCardPreference` / `getThreadQueueState` / `setThreadQueueState` / `pickCodexRateLimitSnapshot` / `isIgnoredFileSearchPath` / `getBackgroundThreadListLimit` |

> 实分文件可按实际操作再作微调，核心是：**薄壳保留 `callRpc` 与类型，领域方法平移到独立文件，入口 `export *` 保证调用方无感知**。

### 2. `useDesktopState.ts` —— 先拆纯工具 + 持久化层（保守）

文件头（1–1778）为大批纯函数与 localStorage 持久化函数；`useDesktopState()` 主函数自 1778 行起聚拢共享响应式 ref。主函数内被闭包捕获的共享 ref **不能简单按函数拆文件**（拆分会把响应式状态从闭包变成跨模块传参，改动面大且正是 round-52 反复踩坑的区域）。

| 批次 | 拆出文件 | 内容 | 风险 |
| --- | --- | --- | --- |
| A | `useDesktopStateUtils.ts` | 文件头的纯函数：`mergeLiveMessages` / `dedupeAssistantAgentMessageText` / `normalizeMessageText` / `removeRedundantLiveAgentMessages` / `mergeThreadGroups` / 字符串键记录工具 / token usage 归一化 / `mergeThreadMessageStreams` 配套纯逻辑 | 低（0 依赖共享 ref，取 round-52/50 现成单测） |
| B | `useDesktopStatePersistence.ts` | `loadPersisted*` / `savePersisted*` 系列（reasoning/plan/threadId/reasoning/模型/项目序/thread title 等） | 低-中 |
| C | 主函数内部 | `useDesktopState()` 自身 | 高（保守，最后做） |

### 3. `codexAppServerBridge.ts` —— 先拆纯工具集群（高风险，最后）

`createCodexBridgeMiddleware()`（7823 行起）是核心入口，其被调用方散落约 100+ 函数，且通过模块级常量跨集群耦合（`THREAD_×`、`CUSTOM_ENDPOINT_PATH_SUFFIXES` 等）。先抽独立集群更安全。

| 批次 | 拆出文件 | 内容 |
| --- | --- | --- |
| A | `bridge/automations.ts` | 自动化 TOML 全套（5303–5680） |
| B | `bridge/git.ts` | git worktree/分支/回滚/untracked 保留（4409–4829） |
| C | `bridge/composio.ts` | Composio CLI/连接/status 全套（2634–3155） |
| D | `bridge/zip.ts` | 项目 ZIP 打包解析（1085–1436、1878–2102） |
| E | `bridge/session.ts` | session skill/fileChange/diff 恢复（280–447、3165–4035） |
| F | `bridge/models.ts` | provider 模型发现（2104–2360） |
| G | 其余保留 | 图片 sanitize、标题/置顶/推理缓存、heartbeat、middleware 派发等 |

> 需先抽公共常量；图为方向，落地按批推进。

## 实施建议顺序

1. **`codexGateway.ts` 试点**：领域最清晰、零闭包、入口 `export *` 保证调用方零改动，先跑通整条「薄壳+领域文件」模式与验证口径。
2. **`useDesktopState.ts` A/B 批**：纯函数 + 持久化层，既有的 round-52/50 单测现成覆盖。
3. **`codexAppServerBridge.ts` A 批起**：自动化/git/composio 等纯工具集群逐步搬出。
4. 最后视情况评估 `useDesktopState()` 主函数与 bridge 核心派发。

## 实施记录

- 2026-08-22：完成三个文件领域梳理并出本方案（见「领域梳理结论」）。
- 2026-08-22：**codexGateway 试点（search 领域）完成**。新建 `src/api/gateway/core.ts`（`callRpc` + `getErrorMessageFromPayload` 共享底层）与 `src/api/gateway/search.ts`（fuzzy 搜索会话/composer 文件搜索/线程搜索 + `ComposerFileSuggestion`/`FuzzyFileSearchSession`/`ThreadSearchResult`/`isIgnoredFileSearchPath`/`normalizeFuzzyFileSearchResults`）。`codexGateway.ts` 从 core 导入共享底层、末尾 `export * from './gateway/search'` 透传，调用方零改动。`vue-tsc`、全量 370 个单测、`pnpm run build`（web+CLI）均通过。
- 2026-08-22：**codexGateway 全部领域迁移完成**。codexGateway.ts 薄壳化为纯 re-export（13 行），11 个领域按本表落地：`search.ts`/`automations.ts`/`terminal.ts`/`threads.ts`/`models.ts`/`directory.ts`/`accounts.ts`/`git.ts`/`files.ts`/`develop.ts`/`misc.ts`，共约 150 个导出方法平移到领域文件，调用方零改动（消费者仍从 `./codexGateway` import）。共享底层统一：`callRpc`/`readJsonResponse` 等入 `core.ts`；`cachedWorkspaceRootsState` 缓存收敛为 git.ts 单实例并发 `invalidateWorkspaceRootsCache` 供 files 复用；`pickCodexRateLimitSnapshot` 归 misc.ts 供 accounts 复用。验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余两项（useDesktopState A/B 批、codexAppServerBridge A 批起）按上表继续。
- 2026-08-22：**useDesktopState.ts A/B 批完成**。删除原文件头 74–1776 行大批模块级辅助函数，新建两个领域文件：
  - `useDesktopStateUtils.ts`（A 批，纯工具、0 依赖共享 ref + 少量本地响应式 live sortKey 状态）：约 100 个导出函数 + 若干类型，含 `mergeMessages`/`dedupeAssistantAgentMessageText`/`mergeThreadMessageStreams`/`buildTurnSummaryMessage`/各组 `*Equal` 比较器/项目组聚合与消歧（`mergeProjectOrder`/`disambiguateProjectGroupsByCwd`/`addWorkspaceRootPlaceholderGroups`/`isProjectlessGroup` 等）/live sortKey 交错排序（`sortKeyForLiveMessage`/`pruneLiveMessageSortKeys`/`resetLiveMessageSortKeys`/`pruneLiveMessageSortKeysByActiveThreads`）/类型 `TurnErrorState`/`TurnStartedInfo`/`TurnCompletedInfo` 等。
  - `useDesktopStatePersistence.ts`（B 批，localStorage 读写统一收口）：21 个 `load*`/`save*` 函数（reasoning/plan/threadId/模型/协作模式/project order/title/terminal/token usage）。
  - `useDesktopState.ts` 保留主函数 `useDesktopState()` 与未迁移常量（新增恢复 round 定时/防抖常量：`EVENT_SYNC_DEBOUNCE_MS`/`BACKGROUND_THREAD_PAGINATION_DELAY_MS`/`RATE_LIMIT_REFRESH_DEBOUNCE_MS`/`TURN_START_FOLLOW_UP_SYNC_DELAY_MS`/`RECENT_THREAD_*_LOAD_REUSE_MS` 等），文件头顶部 `export *` 两新文件保持对外 API 不变 + 显式 import 供主函数复用，消费者零改动（仍从 `./useDesktopState` import）。
  - 边界处理：可变模块级 live sortKey（`liveMessageSortKeyByComposite`/`liveMessageSortCounter`）留在 utils 内私有，主函数原先直接 `.clear()`/`= 0`/按活跃线程裁剪的三处读写收敛为该局受控函数 `resetLiveMessageSortKeys`/`pruneLiveMessageSortKeysByActiveThreads`，规避 ESM 导入绑定的只读限制。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过（含 useDesktopState 83 个）、`pnpm run build`（web+CLI）通过。剩余 `codexAppServerBridge.ts` A 批起按上表继续。
- 2026-08-22：**codexAppServerBridge.ts A 批（automations 自动化切片）完成**。原 10203 行降至 9746 行（-477）。
  - 新建 `src/server/bridge/core.ts`：收纳跨切片共享路径 `getCodexHomeDir`（25 处调用点主文件改为 import，解除桥文件↔切片循环依赖；后续 git/models/session/zip 切片复用）。
  - 新建 `src/server/bridge/automations.ts`：平移自动化 TOML 全套（原 5210–5680）：`getCodexAutomationsDir`/TOML 读写辅助/`ThreadAutomationRecord`/`ThreadAutomationStatus` 类型/`parseAutomationToml`/`serializeAutomationToml`/`toAutomationApiRecord|Map|Data`/heartbeat 与 cron 自动化的 list/read/write/delete 共 20+ 函数；依赖 `getCodexHomeDir`（core）与 `isAbsoluteLikePath`（pathUtils），纯机械迁移、零行为改动。
  - 主 Shell：删除该块，`import` 供 middleware（9756–10056 区域）复用 + `export { parseAutomationToml, toAutomationApiRecord }` 保持原公共导出面（测试仍从 `./codexAppServerBridge` 导入）；`buildHeartbeatQueuedMessage` 的 `ThreadAutomationRecord` 类型改 import。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余批 B（`bridge/git.ts`）/C（`bridge/composio.ts`）/D（zip）/E（session）/F（models）按上表继续。
- 2026-08-22：**codexAppServerBridge.ts B 批（git 切片）完成**。原 9746 行降至 9332 行（-414）；按净增计：git 集群 317 行迁入 `bridge/git.ts`，命令执行器 136 行并入 `bridge/core.ts`，主文件删除对应本地定义。
  - `bridge/core.ts` 扩容命令执行器与共享错误/类型工具：`runCommand`（带 timeout）/`runCommandCapture`/`runCommandCaptureRaw`/`runCommandWithOutput` 与 `getCodexHomeDir`/`asRecord`/`getErrorMessage` 一并入驻（主文件对应本地定义删除后全部 import），后续 composio/zip/session/models 切片复用。
  - 新建 `bridge/git.ts`：平移原 4443–4850 段 git 工具集群（worktree/分支/回滚/untracked 保留）：`isMissingHeadError`/`isNotGitRepositoryError`/`ensureRepoHasInitialCommit`/`normalizeBranchRefName`/`toHeaderGitResetHistoryRef`/`HEADER_GIT_RESET_HISTORY_REF_LIMIT`/`assertLocalGitBranch`/`splitGitPathList`/`preserveUntrackedFilesForGitTarget`/`withPreservedUntrackedFilesForGitTarget`/`rollbackPreservedUntrackedFiles`/`checkoutGitBranchWithWorktreeRecovery`/`pruneHeaderGitResetHistoryRefs`/`readGitHeaderState`/`parsePorcelainChangedFiles`/`assertNoTrackedGitChanges`/`allocatePermanentWorktreeBranchName` 等；依赖 `core` 命令执行器与 `getErrorMessage`，纯机械迁移、零行为改动。
  - 主 Shell：删除散落 `asRecord`（原 569–573）/`getErrorMessage`（原 969–988）/git 集群+命令执行器（原 4443–4850）三块，`import` 补齐 4 个复用点（`normalizeBranchRefName`/`assertLocalGitBranch`/`splitGitPathList`/`HEADER_GIT_RESET_HISTORY_REF_LIMIT`）供 middleware（8276–8637 区域）复用，对外公共导出面不变。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余批 C（`bridge/composio.ts`）/D（zip）/E（session）/F（models）按上表继续。

## 收尾验证口径（每批）

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`（web + CLI）：通过。
- 全量单测：通过；涉及被拆逻辑的既有测试文件无回归。
- 改动应纯机械迁移，不改变任何网络调用、状态同步或用户可见行为。