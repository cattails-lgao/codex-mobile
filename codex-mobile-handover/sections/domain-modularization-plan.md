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

- 2026-08-22：完成三个文件领域梳理并出本方案（见「领域梳理结论」）；尚未开始代码拆分。

## 收尾验证口径（每批）

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`（web + CLI）：通过。
- 全量单测：通过；涉及被拆逻辑的既有测试文件无回归。
- 改动应纯机械迁移，不改变任何网络调用、状态同步或用户可见行为。