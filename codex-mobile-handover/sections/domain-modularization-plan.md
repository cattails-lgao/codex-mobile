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
- 2026-08-22：**codexAppServerBridge.ts C 批（composio 切片）完成**。原 9332 行降至 8843 行（-489）。
  - `bridge/core.ts` 再扩容共享类型读取辅助：`readNonEmptyString`/`readBoolean`/`readNumber`/`quoteShellTokenIfNeeded` 入驻（composio 与主文件共用，避免 composio↔main 循环依赖；主文件对应本地定义删除后 import）。
  - 新建 `bridge/composio.ts`（493 行）：平移 composio CLI 探测/whoami/toolkits 列表/连接/登录/安装集群：`buildComposioInvocation`/`probeComposioInvocation`/`resolveComposioInvocation`/`parseComposioJson`/`runComposioJson`/`readComposioUserData`/`normalizeComposio*`/`readComposioConnectionsBySlug`/`readComposioStatus`/`listComposioConnectors`/`parseComposioCursor|Limit`/`readComposioConnectorDetail`/`startComposioLink|Login`/`installComposioCli` 及全部 composio 领域类型 + `COMPOSIO_USER_DATA_PATH`/`COMPOSIO_CONNECTORS_PAGE_LIMIT_MAX`/`ComposioCliInvocation`；依赖 core 辅助与 `getSpawnInvocation`，纯机械迁移、零行为改动（环境变量 `CODEXUI_COMPOSIO_COMMAND` 保持不变）。
  - 主 Shell：删除 composio 类型块（原 184–274）、`COMPOSIO_USER_DATA_PATH`（原 292）、`readNonEmptyString`（原 2573）与 `quoteShellTokenIfNeeded`/`readBoolean`/`readNumber`/`ComposioCliInvocation`/composio 集群（原 2681–3083）五块，`import` 7 个复用点供 middleware（7885–7943 区域）复用（`readBoolean`/`readNumber` 仅 composio 内部使用，主文件不引）；`fetchConnectorLogo` 为独立函数留在主文件。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余批 D（zip）/E（session）/F（models）按上表继续。
- 2026-08-22：**codexAppServerBridge.ts D 批（zip 切片）完成**。原 8843 行降至 8442 行（-401）；按净增计：zip 打包/解析核心 415 行迁入 `bridge/zip.ts`，`isSameOrDescendantPath` 已并入 `bridge/core.ts` 供复用。
  - `bridge/core.ts` 新增 `isSameOrDescendantPath`（原主文件 1378–1382 本地定义删除，改为 import 供主文件 1850/2025 与 zip 模块共用）。
  - 新建 `bridge/zip.ts`（415 行）：平移项目 ZIP 导出流 + 底层 parse 的原生 ZIP（store 风格）实现：`PROJECT_ZIP_SKIPPED_NAMES` 忽略名单、`ZipCentralDirectoryEntry`/`ProjectZipVirtualEntry`/`ParsedProjectZipEntry` 类型、`ZIP_CRC_TABLE`/`updateZipCrc32`/`toDosDateTime`/`buildZipLocalHeader|DataDescriptor|CentralHeader|EndOfCentralDirectory`/`writeZipChunk`/`createProjectZipIgnoreMatcher`/`walkProjectZipEntries`/`writeProjectZipEntry`/`streamProjectZip`/`toProjectZipFileName`/`setProjectZipHeaders`/`resolveAllowedProjectZipCwd`/`normalizeImportedZipPath`/`readZipUInt16|32`/`parseStoredProjectZip`；依赖 core 命令执行器与 `isSameOrDescendantPath`，纯机械迁移、零行为改动。
  - 主 Shell：删除 zip 导出流集群（原 1019–1078、1098–1391）与 zip 解析集群（原 1880–1934）三块，`import` 6 个复用点供 middleware（下载 export 8205/8219/8225 与 `importProjectZip` 内 1937 调用）复用；`isSameOrDescendantPath` 改从 core import。会话编排 `collectProjectChatZipEntries`/`importProjectZip` 依赖 session/thread 状态，按计划留待 E 批。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余批 E（session）/F（models）按上表继续。
- 2026-08-22：**codexAppServerBridge.ts E 批（session 切片）完成**。原 8442 行降至 7235 行（-1207）；按净增计：session 集群（指令/文件变更/skill 输入时序恢复）约 1207 行迁入 `bridge/session.ts`。
  - 新建 `bridge/session.ts`（1231 行）：聚合 A 批 `core.ts` 共享路径后迁入的 session 集群——skill 输入恢复（`mergeSessionSkillInputsIntoTurns`/`mergeSessionSkillInputsIntoThreadResult`）、fileChange/diff 恢复（`buildSessionFileChangeFallback`/`collectFileChangesForTurns`/`applyTurnFileChanges`/`revertTurnFileChanges`/`pathSetMatchesChange`）、command 时序恢复（`buildSessionItemOrder`/`parseExecCommandOutput`/`parseApplyPatchInput`/`reverseV4aDiff`/`applyV4aDiff`）、轮内合并（`mergeSessionCommandsIntoTurns`/`mergeSessionCommandsIntoThreadResult`）及 `SessionRecovered*`/`SessionItemSlot`/`CollectedTurnFileInfo` 等类型；依赖 `core.ts` 的 `asRecord`/`readNonEmptyString`/`runCommand`/`runCommandCapture`，纯机械迁移、零行为改动。
  - 主 Shell：删除 session 集群本地定义（原 2110–2914 一长块），`import` 7 个复用点（applyTurnFileChanges/buildSessionFileChangeFallback/collectFileChangesForTurns/mergeSessionCommandsIntoThreadResult/mergeSessionCommandsIntoTurns/mergeSessionSkillInputsIntoThreadResult/revertTurnFileChanges）供 middleware 复用；`export { mergeSessionSkillInputsIntoTurns, mergeSessionCommandsIntoTurns, pathSetMatchesChange, revertTurnFileChanges }` 保持原公共导出面（消费者与测试继续从 `./codexAppServerBridge` 导入）。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。剩余批 F（models）按上表继续。
- 2026-08-22：**codexAppServerBridge.ts F 批（models 切片）完成**。原 7235 行降至 7105 行（-130）。
  - 新建 `bridge/models.ts`（163 行）：平移 provider 模型发现纯工具集群——`ProviderModelsResponse` 类型、`PROVIDER_MODELS_FETCH_TIMEOUT_MS`、`logProviderModelDiscoveryWarning`/`isTimeoutError`、`normalizeHeaderValue`/`normalizeQueryParams`/`buildProviderModelsUrl`/`normalizeProviderModelsData`/`fetchCustomEndpointDefaultModel`/`CUSTOM_ENDPOINT_PATH_SUFFIXES`/`normalizeCustomEndpointBaseUrl`/`fetchCustomEndpointModelIds`/`fetchOpenCodeZenModelIds`/`sortOpenCodeZenModelIds`；依赖 `core.ts` 的 `asRecord`/`getErrorMessage`/`readNonEmptyString` 与 `freeMode.js` 的 `OPENCODE_ZEN_DEFAULT_MODEL`，纯机械迁移、零行为改动。
  - 主 Shell：删除三块本地定义（类型/常量 235–242、日志/超时辅助 1475–1482、发现工具 1603–1736 原行号），`import` 11 个复用点供 middleware 与保留的 `readProviderBackedModelIds`/`readProviderModelIdsForProvider`（其依赖主文件本地 `ensureDefaultFreeModeStateForMissingAuthSync`，随计划留驻主文件）复用；`export { normalizeCustomEndpointBaseUrl, normalizeProviderModelsData }` 保持原公共导出面（各有单测从 `./codexAppServerBridge` 导入）。`normalizeProviderModelsData` 亦内部使用需加入本地 import（仅 re-export 不产生绑定）。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。A–F 六批全部完成，剩余 `useDesktopState()` 主函数与 bridge 核心派发视情况再评估。
- 2026-08-22：**codexAppServerBridge.ts G 批（terminal 快速命令集群）完成**。原 7105 行降至 6974 行，再经 H 批后降至 6416 行。
  - 新建 `bridge/terminal.ts`：平移 terminal 快速命令集群——`TerminalQuickCommand` 类型、`listTerminalQuickCommands`/`addPackageJsonCommands`/`addMakefileCommands`/`addRootScriptCommands`/`addScriptsDirectoryCommands`/`resolvePackageManager` 等；依赖 `core.ts` 助手，纯机械迁移。
- 2026-08-22：**codexAppServerBridge.ts H 批（git/worktree 路由族迁出核心派发）完成**。原 6974 行降至 6416 行（-558）。
  - 新建 `bridge/routes.ts`（629 行）：将 `createCodexBridgeMiddleware` 巨型内联 HTTP 派发中的 9 个状态无关路由 handler 平移为 `handleGitWorktreeHttpRequest(req, res, url, deps)`——`worktree/create`、`worktree/create-permanent`、`worktree/branches`、`git/branches`、`git/repository-status`、`git/checkout`、`git/branch-commits`、`git/commit-files`、`git/reset-to-commit`。命中路由返回 `true`，否则返回 `false`。
  - 依赖策略：路由 handler 仅依赖 `bridge/git.ts`（`assertLocalGitBranch`/`readGitHeaderState`/`checkoutGitBranchWithWorktreeRecovery` 等）与 `bridge/core.ts`（`runCommandCapture`/`getErrorMessage`/`asRecord` 等）及 Node 内建；主文件壳上的 4 个共享助手（`setJson`/`readJsonBody`/`persistWorkspaceRoot`/`rollbackCreatedWorktree`）通过 `deps` 参数注入，避免 `routes.ts` 反向 import 主文件造成循环依赖。
  - 主 Shell：新增 `import { handleGitWorktreeHttpRequest } from './bridge/routes.js'`，将原内联块替换为单行派发 `if (await handleGitWorktreeHttpRequest(req, res, url, { setJson, readJsonBody, persistWorkspaceRoot, rollbackCreatedWorktree })) return`，其余零改动。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。核心派发剩余路由族（thread/git-reset-* / 文件 / composio / 自动化等）仍留驻 shell，逐族视闭包依赖再切。
- 2026-08-22：**useDesktopState() 主函数首批（闭包内 normalizer 纯函数簇）完成**。删除闭包内 17 个纯 normalizer（notification/snapshot 归一化），新建 `useDesktopStateNormalizers.ts`（224 行）。
  - 迁出：`normalizePlanStepStatus`/`buildPlanMessageText`/`asRecord`/`readString`/`readNumber`/`getRateLimitSnapshotKey`/`normalizeRateLimitWindow`/`normalizeRateLimitSnapshot`/`normalizeRateLimitSnapshotsPayload`/`normalizeTokenUsageBreakdown`/`normalizeThreadTokenUsage`/`readThreadTokenUsageUpdate`/`extractThreadIdFromNotification`/`readTurnErrorMessage`/`readNotificationErrorState` 等。均为不捕获 ref 的纯函数；主函数内删除本地定义并 `import` 复用。
  - 说明：闭包内 `normalizeThreadTokenUsage` 与 `useDesktopStateUtils.ts` 中已导出的存储值归一化变体刻意不同，故单独落文件而不并入 utils；文件从 `useDesktopStateUtils` import `clamp` 及 `Turn*` 类型不改语义。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过。
- 2026-08-22：**useDesktopState() 主函数第二批（纯 notification 消息读取器簇）完成**。删除闭包内 17 个纯读取器/助手，新建 `useDesktopStateReaders.ts`（380 行）。
  - 迁出：`readTurnActivity`/`readTurnStartedInfo`/`readTurnCompletedInfo`/`liveReasoningMessageId`/`readReasoningStartedItemId`/`readReasoningDelta`/`readReasoningSectionBreakMessageId`/`readReasoningCompletedId`/`readReasoningItemText`/`readReasoningItemNotification`/`readAgentMessageStartedId`/`readAgentMessageDelta`/`readAgentMessageCompleted`/`toLocalImageUrl`/`toImageGenerationUrl`/`readCompletedImageView`/`readCommandOutputDelta`。只依赖 `notification` 参数 + 纯 normalizer/utils（`asRecord`/`readString`/`extractThreadIdFromNotification`/`parseIsoTimestamp`）。
  - 边界：`readCommandExecutionStarted`/`readCommandExecutionCompleted`/`readPlanItemNotification`/`readCompletedFileChange` 因读取 `turnIndexByTurnIdByThreadId.value` 共享 ref，**留驻闭包**不迁移（避免跨模块传响应式状态）。
  - 主 Shell：为各纯读取器补 `import`，删除本地定义，清理未用导入（`toLocalImageUrl`/`toImageGenerationUrl`/`readReasoningItemText` 仅被迁出者使用则不再 import）。净删闭包约 597 行。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。闭包仍剩 `readCommandExecution*`/`readPlanItemNotification`/`readCompletedFileChange` 及写入侧（upsert/append/set）等闭包状态函数留待后续评估。
- 2026-08-22：**useDesktopState() 主函数第三批（server 请求解析/分类簇）完成**。删除闭包内 11 个纯请求解析/分类函数，新建 `useDesktopStateRequests.ts`（186 行）。
  - 迁出：`GLOBAL_SERVER_REQUEST_SCOPE` 常量、`normalizeServerRequest`、`normalizePendingServerRequestMethod`、6×`looksLike*`（exec/patch/toolUserInput/toolCall/mcpServerElicitation/permissions）、`readToolRequestUserInputQuestionIds`、`isApprovalRequestMethod`。仅依赖 `params`/`method` 参数 + 纯 normalizer（`asRecord`/`readString`），不碰 ref。
  - 主 Shell：删除本地 `const GLOBAL_SERVER_REQUEST_SCOPE` 与对应函数定义，改为 `import` 复用（仅 import 闭包仍直接调用的 4 个符号：`GLOBAL_SERVER_REQUEST_SCOPE`/`isApprovalRequestMethod`/`normalizeServerRequest`/`readToolRequestUserInputQuestionIds`）。净删闭包约 179 行（5115 行）。
  - 边界：写入侧 `upsertPendingServerRequest`/`removePendingServerRequestById`/`replacePendingServerRequests`/`applyThreadFlags` 及 `pendingReplyErrorForRequest` 留在闭包。
  - 验证：`vue-tsc --noEmit` 通过、全量 370 个单测通过、`pnpm run build`（web+CLI）通过。闭包写入侧（live 消息 upsert/append、turnIndex 维护、server 请求状态写入）均为 ref 写操作，后续视需求评估是否注入式重构。
- 2026-08-22：**useDesktopState() 主函数第四批（注入式写入侧：live 消息）完成**。`e22eae4` 迁出 pending-request 写入侧，本次新建 `useDesktopStateLiveWrites.ts`（100 行），迁出 live 消息 ref 写入簇。
  - 迁出（注入式）：定义 `LiveWriteDeps { liveCommandsByThreadId, liveFileChangeMessagesByThreadId }` 两个 ref 注入。函数：`setLiveFileChangeMessagesForThread`、`upsertLiveCommand`、`removeLiveCommandsPersistedIn`、`removeLiveFileChangesPersistedIn`、`upsertLiveFileChangePatch`、`upsertTurnDiff`。仅依赖注入 ref + 纯工具（`upsertMessage`/`omitKey`/`areMessageArraysEqual`），零闭包回环。
  - 主 Shell：新增 `liveWriteDeps` 对象注入两个 ref，本地函数退化为一行薄包装（`xxxImpl(liveWriteDeps, …)`），对外签名不变。
  - `e22eae4`：server 请求写入侧迁出，新建 `PendingRequestWriteDeps { pendingServerRequestsByThreadId, pendingReplyErrorByRequestId, applyThreadFlags }`，迁出 `upsertPendingServerRequest`/`removePendingServerRequestById`/`replacePendingServerRequests`/`readPendingReplyErrorForRequest`；新增 `useDesktopStateRequests.test.ts`（pending-request 写操作单测）。
  - 新增 `useDesktopStateLiveWrites.test.ts`（live 命令/文件变更写入单测）。
  - 验证：`vue-tsc --noEmit` 通过、全量 380 个单测通过、`pnpm run build`（web+CLI）通过。主函数降至 5038 行。剩余写入侧（live plan/agent/reasoning 写入、turnIndex 维护、liveReasoning 文本写入）仍留闭包，视需求再评估。
- 2026-08-23：**useDesktopState() 主函数第四批扩展（注入式写入侧：live plan/agent）**。扩展 `useDesktopStateLiveWrites.ts` 至 178 行，`LiveWriteDeps` 扩为 5 个 ref（新增 `liveAgentMessagesByThreadId`/`livePlanMessagesByThreadId`/`lastPlanByThreadId`）。
  - 迁出：`setLiveAgentMessagesForThread`、`clearLiveAgentMessagesForThread`、`setLivePlanMessagesForThread`、`upsertLivePlanMessage`、`rememberLastPlan`（含 `saveLastPlanMap` 持久化调用）、`upsertLiveAgentMessage`（含 round-52 文本级去重）、`upsertLiveFileChangeMessage`。仅依赖注入 ref + 纯工具（`upsertMessage`/`omitKey`/`areMessageArraysEqual`/`normalizeMessageText`）+ 持久化函数 `saveLastPlanMap`，零闭包回环。
  - 主 Shell：新增 8 个函数对应的 `xxxImpl(liveWriteDeps, …)` 薄包装，对外签名不变。
  - 测试：`useDesktopStateLiveWrites.test.ts` 扩至 8 个用例（plan 追加并记忆、agent 文本级去重、saveLastPlanMap 持久化 spy）。
  - 验证：`vue-tsc --noEmit` 通过、全量 383 个单测通过、`pnpm run build`（web+CLI）通过。主函数降至 5010 行。live 消息写入侧已基本迁出；剩余闭包写入侧（liveReasoning 文本写入/snapshot、turnIndex 维护、agent 内容事件相关）留待评估。
- 2026-08-23：**useDesktopState() 主函数第四批扩展（注入式写入侧：turnIndex 维护）**。新建 `useDesktopStateTurnIndex.ts`，定义 `TurnIndexDeps { turnIndexByTurnIdByThreadId, persistedMessagesByThreadId, liveFileChangeMessagesByThreadId }`。
  - 迁出：`inferNextTurnIndex`、`setTurnIndexForThread`、`replaceTurnIndexLookupForThread`、`resolveThreadTurnIndex`、`rebindLiveFileChangeTurnIndices`。仅依赖注入 ref，零闭包回环。
  - 主 Shell：新增 `turnIndexDeps` 对象注入三个 ref，本地函数退化为一行薄包装（`xxxImpl(turnIndexDeps, …)`），对外签名不变。
  - 新增 `useDesktopStateTurnIndex.test.ts`（5 个用例：inferNext、set+非法入参、replace、resolve、rebind）。
  - 验证：`vue-tsc --noEmit` 通过、全量 388 个单测通过、`pnpm run build`（web+CLI）通过。主函数降至 4960 行。剩余闭包写入侧（liveReasoning 文本写入/snapshot、agent 内容事件相关）留待评估。
- 2026-08-23：**useDesktopState() 主函数第四批扩展（注入式写入侧：liveReasoning 文本快照）**。新建 `useDesktopStateReasoningWrites.ts`，定义 `LiveReasoningWriteDeps { liveReasoningTextByThreadId, inProgressById }`。
  - 该簇含实例级可变状态（快照映射 + 脏标志 + 节流定时器），采用工厂函数 `createLiveReasoningTextWrites` 封装，避免模块级状态污染。
  - 迁出：`setLiveReasoningText`、`appendLiveReasoningText`、`restoreLiveReasoningSnapshot`、`clearLiveReasoningSnapshot`（round-27 刷新后 overlay 思考文本恢复，节流写 localStorage）。
  - 主 Shell 保留 ref 所有权，新增 `reasoningWrites` 工厂实例，本地函数退化为薄包装。主函数降至约 4974 行。
- 2026-08-23：**useDesktopState() 主函数第四批扩展（注入式写入侧：reasoning 时间线存档）**。新建 `useDesktopStateReasoningTimeline.ts`，定义 `ReasoningTimelineDeps`（4 个 ref + 4 个 Map + 2 个回调 + `savePersistedReasoningMap`）。
  - 闭包保留 4 个 Map（`reasoningItemTextByItemId`/`reasoningAppendedTextByItemId`/`turnItemSequenceByThreadId`/`activeReasoningTurnIdByThreadId`）的所有权（实时通知处理器与 resetAllState 仍直接读写），注入 ref/Map 到纯函数集合，零回环。
  - 迁出：`recordActiveReasoningTurn`、`clearLiveReasoningForThread`、`rememberPersistedReasoning`、`rememberPersistedReasoningItems`、`appendReasoningItemProgress`、`recordTurnItemOrder`、`buildTurnReasoningItems`；后四者仅内部使用、直接删除本地定义，前三者保留一行薄包装。
  - 新增 `useDesktopStateReasoningTimeline.test.ts`（6 个用例：时序锚点、到达顺序、增量追加、item 存档、整段兜底、去重）。
  - 验证：`vue-tsc --noEmit` 通过、全量 394 个单测通过、`pnpm run build`（web+CLI）通过。主函数降至 4755 行。reasoning 文本写入/存档簇已迁出完成。

## 收尾验证口径（每批）

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`（web + CLI）：通过。
- 全量单测：通过；涉及被拆逻辑的既有测试文件无回归。
- 改动应纯机械迁移，不改变任何网络调用、状态同步或用户可见行为。