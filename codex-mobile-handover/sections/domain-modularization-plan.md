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
  - 后续（applyRealtimeUpdates 残留补充）：扩展本模块新增 `accumulateReasoningTextDelta`（textDelta 前缀去重累积）与 `clearReasoningItemTextCache`，替换 `applyRealtimeUpdates` 中 `reasoningItemTextByItemId` 的两处直接写/清空；用例增至 7 个，全量 395 单测、vue-tsc、web+CLI 构建均通过。`applyRealtimeUpdates` 残余只读 `reasoningItemTextByItemId`（resetAllState 直接 clear）保留在闭包。后续将 resetAllState 的一处 direct clear 也并入 `clearReasoningItemTextCache`，该 Map 的闭包内直接写已全部清零。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 I 批（composio HTTP 路由族）完成**。新建 `bridge/composioRoutes.ts`，迁出 composio 6 个路由 handler（status/connectors/connector/link/login/install），沿用 H 批 `handleGitWorktreeHttpRequest` 注入模式（仅注入 `setJson`/`readJsonBody`），零闭包依赖。
  - 每个 handler 均为「try-调用 composio.ts 纯函数-兜底 setJson」样板转发；`connector-logo` 及其 `fetchConnectorLogo`/`parseConnectorLogoUrl`/`readCodexAuth` 属独立 auth/logo 族（与 transcribe 共用读 auth），留驻 shell 待后续批。
  - 主 Shell：删本地 6 块定义，接线 `if (await handleComposioHttpRequest(req, res, url, { setJson, readJsonBody })) return`；移除 7 个本地 composio import（`installComposioCli`/`listComposioConnectors`/`parseComposioLimit`/`readComposioConnectorDetail`/`readComposioStatus`/`startComposioLink`/`startComposioLogin`）。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。核心派发剩余路由族（thread 读/SSE、free-mode、文件/project、automations、telegram、rpc 等）仍留驻 shell，逐族视闭包依赖再切。附注：无独立 `git-reset-*` URL 路由族——reset-history 逻辑已在 H 批并入 routes.ts（`git-reset-history` 仅为 ref 前缀），reset 操作走 `/codex-api/rpc` 核心派发（最高耦合，最后切）。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 J 批（auth/logo 族）完成**。新建 `bridge/chatgptUpstreamRoutes.ts`，迁出 `transcribe` + `connector-logo` 两个 handler 及其 8 个辅助函数（`readCodexAuth`/`proxyTranscribe`/`httpPost`/`curlImpersonatePost`/`curlImpersonateAvailable`/`parseConnectorLogoUrl`/`fetchConnectorLogo`），沿用注入模式（注入 `setJson`/`readBody(即 readRawBody)`/`getCodexAuthPath`）。`CodexAuthTokens` 用局部结构类型，不导出类型，零闭包依赖。
  - 主 Shell：删本地 2 块定义与全部 8 个辅助函数，接线 `if (await handleChatgptUpstreamHttpRequest(req, res, url, { setJson, readBody: readRawBody, getCodexAuthPath })) return`；移除已无用的 `request as httpRequest`/`request as httpsRequest` 专用 import（`spawn`/`readRawBody`/`getCodexAuthPath` 仍为主文件所需，保留）。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。auth/logo 族迁移完成。核心派发剩余路由族（thread 读/SSE、free-mode、文件/project、automations、telegram、rpc 等）仍留驻 shell，逐族视闭包依赖再切。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 K 批（free-mode 路由族）完成**。新建 `bridge/freeModeRoutes.ts`，迁出 `/codex-api/free-mode` 前缀下 5 个 handler（toggle/status/rotate-key/custom-key/custom-provider）及块内 `readFreeModeState` helper。
  - 耦合较前两批高：非零闭包。模型/常量 helper 直接 import（`freeMode.js`：`FREE_MODE_DEFAULT_MODEL`/`getFreeModels`/`getFreeKeyCount`/`getCachedFreeModels`/`refreshFreeModelsInBackground`/`OPENCODE_ZEN_PROVIDER_ID`/`shouldMarkOpenRouterKeyAsCustom`/`filterOpenCodeZenModelsForAuthState`/`FreeModeState`；`models.js`：`sortOpenCodeZenModelIds`/`fetchOpenCodeZenModelIds`/`fetchCustomEndpointDefaultModel`/`normalizeCustomEndpointBaseUrl`；`core.js`：`getCodexHomeDir`/`getErrorMessage`）。运行时依赖注入：`setJson`/`readJsonBody`/`appServer`（`dispose()` 触发 provider 重启）/`next`（前缀命中但无子路由时放行）+ Shell 所有 auth 状态 helper `writeFreeModeStateFile`/`ensureDefaultFreeModeStateForMissingAuthSync`/`hasUsableCodexAuthSync`（后者在 shell 被 9 处复用，留驻）。
  - 主 Shell：删本地 232 行块（原 4609–4840），接线 `if (await handleFreeModeHttpRequest(req, res, url, { setJson, readJsonBody, appServer, next, writeFreeModeStateFile, ensureDefaultFreeModeStateForMissingAuthSync, hasUsableCodexAuthSync })) return`；移除 6 个不再使用的 freeMode.js import（`getRandomFreeKey`/`getFreeKeyCount`/`getCachedFreeModels`/`refreshFreeModelsInBackground`/`OPENCODE_ZEN_PROVIDER_ID`/`shouldMarkOpenRouterKeyAsCustom`）。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。free-mode 族迁移完成。核心派发剩余路由族（thread 读/SSE、文件/project、automations、telegram、rpc 等）仍留驻 shell，逐族视闭包依赖再切。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 M 批（文件/project 路由族）完成**。新建 `bridge/projectRoutes.ts`，迁出 12 个 handler（`handleProjectHttpRequest`）：`home-directory` GET、`project-zip` GET/HEAD、`project-import` POST、`project-root` POST、`local-directory` POST、`github-clone` POST、`projectless-thread-cwd` POST、`project-root-suggestion` GET、`composer-file-search` POST、`prompts` GET/POST/DELETE，及随迁 helper（`createProjectlessThreadDirectory`/`cloneGithubRepositoryIntoBase`/`listFilesWithRipgrep`/`scoreFileCandidate`/`listComposerPrompts`/`createComposerPromptFile`/`removeComposerPromptFile`/`buildProjectlessFolderName` 等）。
  - 注入模式沿用 git/worktree：deps = `{ setJson, readJsonBody, readRawBody, persistWorkspaceRoot, collectProjectChatZipEntries, importProjectZip }`。`collectProjectChatZipEntries`/`importProjectZip` 依赖 shell 内 session/thread 状态（D 批留待项），故随依赖注入而非随迁。
  - 主 Shell：原 5792 行降至 5268 行（-524）；新增 `import { handleProjectHttpRequest }`，区块替换为单行派发；新增 `export { buildProjectlessFolderName }` 透出（`codexAppServerBridge.archive.test.ts` 依赖，保持公共导出面）。
  - 说明：`workspace-roots-state` GET/PUT **留驻 shell**（未随迁）——其读写闭包绑定 shell 内 workspace-roots 状态，与 M 批计划所列 14 个 handler 有出入，实际迁出 12 个。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。文件/project 族迁移完成。核心派发剩余路由族（thread 读/SSE、telegram、rpc 等）仍留驻 shell，逐族视闭包依赖再切。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 N 批（thread 读/SSE 非 SSE 部分）完成**。新建 `bridge/threadRoutes.ts`，迁出 4 个 handler（`handleThreadHttpRequest`）：`thread-turn-page` GET、`thread-file-change-fallback` GET、`thread-stream-events` GET、`thread-live-state` GET。
  - 注入：`{ setJson, appServer, externalSessionTracker, sanitizeThreadTurnsInlinePayloads, isThreadMaterializationPendingError }`。`appServer` 用窄接口 `ThreadReadAppServerFacade`（8 个只读/缓存方法：rpc/readThreadForTurnPage/getStreamEvents/storeThreadReadSnapshot/getLastThreadReadSnapshot/getCachedLiveState/cacheLiveState/mergeItemsIntoTurns），不导出 `AppServerProcess` 全量；`externalSessionTracker` 仅注入 `getExternalSession`；后两者为 shell 内纯 helper 供 rpc handler 共用，注入避免 threadRoutes→shell 循环（rpc handler 保留原样）。
  - 随迁 membrane：`mergeStreamTurnErrorsIntoThreadResult` + `readStreamTurnId`/`readStreamTurnErrorMessage`（原仅 rpc/turn-page/live-state 用），签名改收窄 `ThreadReadAppServerFacade`；rpc handler 从新模块 import 复用。`STREAM_EVENT_BUFFER_LIMIT`（被 AppServerProcess.getStreamEvents 复用）与 `THREAD_RESPONSE_TURN_LIMIT`（被 trimThreadTurnsInRpcResult 复用）迁入 `bridge/core.ts` 跨切片共享。
  - 主 Shell：删 4 块 handler（原 4464-4675），接线单行派发；`rollback-files` 与 `/codex-api/events` SSE（依赖 `middleware.subscribeNotifications` 自引用）留驻 shell。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。thread 读/SSE 非 SSE 族迁移完成；`events` SSE 留驻待订阅源抽取评估。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 O 批（telegram 族 + rpc 后处理管线）完成**。telegram 族整体迁入新建 `bridge/telegramRoutes.ts`（3 个 handler + config helper），仅注入 `{ setJson, readJsonBody, telegramBridge }`（窄 4 方法结构类型），零 appServer/externalSession 闭包。
  - rpc 族按「抽管线，HTTP 壳留驻」处理：新建 `bridge/rpcPipeline.ts`，以 `runRpcResponsePipeline(deps, method, rpcResult)` 承载 8 步 thread/session 后处理链（trim/mergeStream/mergeImported/filterSubagent/sanitize/mergeSkill/mergeCommands/overlayExternal）。`THREAD_METHODS_WITH_TURNS`/`THREAD_METHODS_WITH_THREAD_SNAPSHOT` 迁入 `bridge/core.ts` 共享。
  - 主 Shell：rpc handler 内联链（原 trim→snapshotStore→overlay）替换为单次 `runRpcResponsePipeline` 调用；触发（`callRpcWithArchiveRecovery`）、错误守卫（`hasUsableCodexAuth`/`isUnauthenticatedRateLimitError`/`isEmptyThreadReadError`/`isThreadMaterializationPendingError`）、早退短路口、指标闭包 `requestBodyBytes`/`rpcMethod` 全部保留 shell。删除本地 `trimThreadTurnsInRpcResult`/`overlayExternalSessionOnThreadList`/`filterSubagentThreadsFromThreadListResult`/`overlayExternalSessionOnThreadResult`/`readExternalSessionForThread` 及失效 import；`filterThreadListByIds`/`THREAD_METHODS_WITH_TURNS` 因测试或 sanitize 复用保留。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。telegram/rpc 族完成，核心派发剩余路由族（仅 `events` SSE 留驻待评估）。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 P 批（thread 搜索/状态/偏好族）完成**。新建 `bridge/threadPreferencesRoutes.ts`，以 `handleThreadPreferencesHttpRequest(req, res, url, deps)` 承载 9 个 handler：`thread-titles` GET/PUT、`thread-pins` GET/PUT、`thread-reasoning` GET/PUT、`preferences/first-launch-plugins-card` GET/PUT、`thread-search` POST。
  - 迁移随附 helper：title/pins/reasoning/first-launch 的跨浏览器持久化缓存（读/写/归一化/合并）、session_index 标题解析（含 `getSessionIndexFileSignature` 缓存）与降级搜索本地索引读取（`isExactPhraseMatch`）。
  - 共享 helper 迁入 `bridge/core.ts`：`normalizeStringArray`、`getCodexGlobalStatePath`（两函数原为主文件+本族共用定义，去重后归 core）。
  - 注入点（deps）：`{ setJson, readJsonBody, appServer.rpc 窄 facade, getThreadSearchIndex 闭包 }`。`getThreadSearchIndex`（buildThreadSearchIndex 延迟构建索引闭包）与 thread-search 的官方 RPC 优先 + 本地索引回退逻辑绑定 shell 状态，注入而非随迁。
  - 主 Shell：删除内联 9 个 handler 及 title/pins/reasoning/first-launch/session-index 缓存 helper（约 300 行），接入 `handleThreadPreferencesHttpRequest`；`readMergedThreadTitleCache` 复用点（project zip 导出 1196、导入 1339）改由本模块 import，随附 3 个 title-cache helper 一并 `export` 供 shell 复用。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。核心派发剩余路由族仅 `events` SSE（依赖 `middleware.subscribeNotifications` 自引用）留驻。
- 2026-08-23：**codexAppServerBridge.ts 核心派发 Q 批（`events` SSE 路由）完成**。新建 `bridge/eventsRoutes.ts`，以 `handleEventsHttpRequest(req, res, deps)` 承载 `/codex-api/events` SSE handler。
  - 该 handler 是纯 pass-through：只消费注入的 `subscribeNotifications`（shell 聚合 appServer/terminalManager/externalSessionTracker 通知）+ `ServerResponse` 生命周期，故 deps 仅 `{ subscribeNotifications }` 单一窄结构类型，零其他闭包捕获。
  - 主 Shell：删除内联 SSE handler（状态头写入/订阅/keepAlive 15s ping/close 清理），接入 `handleEventsHttpRequest`（注入 `middleware.subscribeNotifications.bind(middleware)`）；`middleware.subscribeNotifications` 聚合实现含 `externalSessionTracker` 订阅触发 `appServer.invalidateLiveStateCache`，保持留驻 shell。threadRoutes.ts 头部注释同步移除「events 留驻」说明。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。至此核心派发全部路由族迁移完成，`codexAppServerBridge.ts` 主文件仅剩派发接线与共享状态闭包。
- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 R 批（workspace-roots 簇）完成**。新建 `bridge/workspaceRoots.ts`，承载 `.codex-global-state.json` 中 workspace-root 相关键（electron-saved-workspace-roots / workspace-root-labels / active-roots / project-order）的规范化与读写：
  - 平移 `canonicalizeWorkspaceRootsState` / `ForRead` / `canonicalizeThreadListResponseForRead`、`readWorkspaceRootsState`、`writeWorkspaceRootsState`、`updateWorkspaceRootsState`、`persistWorkspaceRoot`、`rollbackCreatedWorktree` 及私有 `normalizeRemoteProjects`、`PathRealpathResolver`、模块级串行锁 `workspaceRootsMutation`。
  - 共享 helper 迁入 `bridge/core.ts`：`normalizeStringRecord`（原主文件+本簇共用，去重归 core）。
  - 主 Shell：删除 `WorkspaceRootsState` 类型与整个 workspace-roots 簇（约 206 行），保留派发处经 import 复用；公共导出（测试从主模块导入的 `canonicalizeThreadListResponseForRead` / `canonicalizeWorkspaceRootsStateForRead` / `writeWorkspaceRootsState` 及 `WorkspaceRootsState` 类型）用 `export type`/`export { } from` 从新模块 re-export 保持契约。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。
- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 S 批（thread-queue-state 簇）完成**。新建 `bridge/threadQueueState.ts`，承载 `.codex-global-state.json` 中 `thread-queue-state` 键的规范化与读写：
  - 平移 `normalizeStoredQueuedMessage` / `normalizeThreadQueueState`、`readThreadQueueState`、`writeThreadQueueStateUnlocked`、`withThreadQueueStateUpdate`、`writeThreadQueueState`、`appendThreadQueuedMessage` 及私有 `ThreadQueueStateUpdate`、模块级串行锁 `threadQueueMutationChain`、常量 `THREAD_QUEUE_STATE_KEY`。
  - 类型 `StoredQueuedMessage` / `ThreadQueueState` / `BackendQueuedTurn` 迁移并以 `export type` 从新模块 re-export 保持契约（automationsRoutes 用自身结构镜像 `QueuedMessage`，不受影响）。
  - 主 Shell：删除 `THREAD_QUEUE_STATE_KEY` 常量、3 个类型定义与 7 个函数（含既有 7 个队列函数但**保留** `ResolvedCollaborationModeSettings`，它仍被 shell 内 `resolveCollaborationModeSettings` 使用），约 130 行；`BackendQueueProcessor` 与 `/codex-api/thread-queue-state` 路由改经 import 复用；`getCodexGlobalStatePath` 在 shell 内已无更多用途，从 core import 移除。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。
- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 T 批（approval-policy 簇）完成**。新建 `bridge/approvalPolicy.ts`，承载 Codex `approval_policy` 的解析与 `config.toml` 读写：
  - 平移 `resolveEffectiveApprovalPolicy` / `readApprovalPolicyFromConfigFile` / `writeApprovalPolicyToConfigFile` 与私有 `getCodexConfigPath`、`APPROVAL_POLICY_ASSIGNMENT`。
  - 依赖方：`getCodexHomeDir`（core）+ `parseApprovalPolicy` / `CodexApprovalPolicy`（appServerRuntimeConfig）+ node fs/path，零 shell 闭包。
  - 顺带删除死代码常量 `APPROVAL_POLICY_KEY`（无引用）；shell 内 `/codex-api/approval-policy` GET/POST 路由改经 import 复用；`CodexApprovalPolicy` 类型在 shell 已无直接用途，从 appServerRuntimeConfig import 移除（保留 `buildAppServerArgs` / `parseApprovalPolicy`）。注意：编辑期间一度误删 `parseAutomationToml`/`toAutomationApiRecord` re-export 与 M 批注释，已在同次修改内恢复。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。
- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 U 批（内联 data-url 净化簇）完成**。新建 `bridge/inlineImages.ts`，承载 thread 负载内联 data-url 扫描与落盘净化管线：
  - 平移整条净化链路：`isInlineDataUrl` / `inferImageMimeTypeFromBytes` / `inferImageMimeTypeFromBase64` / `normalizeBase64ImageDataUrl` / `extensionFromMimeType` / `asNonEmptyString` / `toAttachmentLinkTarget` / `persistInlineDataUrlToLocalFile` / `toLocalImageProxyUrl` / `INLINE_IMAGE_FIELD_NAMES` / `sanitizeInlineImageString` / `sanitizeInlineUserContentBlock` / `sanitizeInlinePayloadDeep` / `sanitizeThreadTurnsInlinePayloads`，并随迁仅被该簇使用的 `THREAD_METHODS_WITH_TURNS`。
  - 暴露 `sanitizeThreadTurnsInlinePayloads`（rpcPipeline/threadRoutes 注入，inlinePayload.test.ts 依赖），Shell 内 import + re-export 保持契约；`getChunkByteLength` 因被 Shell 内 API 性能日志复用**保留**在 Shell。
  - 依赖方：`asRecord`（core）+ node crypto/fs/os/path，零 shell 闭包；移除 Shell 中已无用途的 `createHash` import 与 `THREAD_METHODS_WITH_TURNS` 常量。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 inlinePayload）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 V 批（codex auth.json / free-mode 状态簇）完成**。新建 `bridge/codexAuthState.ts`，承载 ChatGPT auth 刷新与 free-mode 状态规范化：
  - 平移：`getCodexAuthPath` / `refreshChatgptAuthTokensForExternalAuth` / `hasUsableCodexAuthSync` / `readFreeModeStateSync` / `writeFreeModeStateFile` / `ensureDefaultFreeModeStateForMissingAuthSync` 及 TOML 探测链路 `stripTomlComment` / `isModelProviderAssignment` / `hasExplicitCodexModelProviderConfigSync`（含 `explicitCodexModelProviderConfigCache` 缓存），并随迁仅被本簇使用的 JWT 解码 helper 与 `CODEX_CHATGPT_CLIENT_ID` / `DEFAULT_CODEX_REFRESH_TOKEN_URL` 常量、`ChatgptAuthTokensRefreshParams`/`ChatgptAuthTokensRefreshResponse` 类型。
  - `CodexAuth` 类型提升为 `export` 供 Shell 内 `hasUsableCodexAuth` 复用；Shell 经 `hasUsableCodexAuthSyncPublicForBridge as hasUsableCodexAuthSync` 别名接入，并对 archive/authRefresh 测试与 freeModeRoutes 依赖的 `ensureDefaultFreeModeStateForMissingAuthSync`/`writeFreeModeStateFile`/`refreshChatgptAuthTokensForExternalAuth`/`CodexAuth`/类型做 re-export 保持契约；`getCodexAuthPath`/`hasUsableCodexAuthSync` 继续透传给 chatgptUpstreamRoutes/freeModeRoutes 注入。
  - 依赖方：`getCodexHomeDir`/`asRecord`/`readNonEmptyString`（core）+ `freeMode.js` 辅助，零 shell 实例闭包；移除 Shell 内该簇全部本地定义。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 authRefresh/archive）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 W 批（imported-session / state-db 簇）完成**。新建 `bridge/importedSessions.ts`，承载导入 session 记录解析改写与 sqlite `threads` 状态库读写：
  - 平移：`walkFiles` / `readSessionMetaCwd` / `readSessionMetaId` / `getCurrentImportedSessionModelDefaults` / `rewriteImportedSession` / `readImportedSessionRecord` / `sqlString` / `ensureImportedThreadsStateDbTable` / `buildImportedSessionStateDbValues` / `registerImportedSessionsInStateDb` / `listImportedThreadsFromStateDb` / `readStateDbThreadExportMetadata` / `mergeImportedThreadsIntoThreadListResult` / `filterThreadListByIds`，并随迁 `ImportedSessionRecord` / `ExportedThreadMetadata` 类型与 `sqliteStateDbPath` helper；sqlite 调用仍 `spawnSync('sqlite3', ...)` 保持不变。
  - Shell 保留较重的 `collectProjectChatZipEntries` / `importProjectZip`（依赖 thread-title 缓存与 zip 模块、注入 `persistWorkspaceRoot` 等闭包），仅从此模块导入被随迁 helper；对 rpcPipeline.freeModeRoutes 依赖的 `mergeImportedThreadsIntoThreadListResult` / `filterThreadListByIds` 做 re-export 维持公共契约。
  - 依赖方：`asRecord`/`getCodexHomeDir`/`readNonEmptyString`（core）+ `codexAuthState.ts`（free-mode 状态）+ `freeMode.js` 常量，零 shell 实例闭包；移除 Shell 中已无用途的 `spawnSync`/`readdir`/`FREE_MODE_DEFAULT_MODEL`/`OPENCODE_ZEN_DEFAULT_MODEL` import。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 inlinePayload 对 `filterThreadListByIds` 的依赖）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 X 批（API 性能日志配置簇）完成**。新建 `bridge/apiPerfLogging.ts`，承载 `CODEXUI_API_PERF_*` 环境旋钮的模块加载期解析与 chunk 尺寸辅助：
  - 平移：`readEnvValueFromFile` / `parseBooleanEnvFlag` / `parseNumberEnvFlag` / `resolveApiPerfLoggingEnabled` / `resolveNumericEnvConfig` 及常量 `API_PERF_*_ENV_KEY` / `DEFAULT_API_PERF_*` / `MB_DIVISOR`，并随迁加载期常量 `API_PERF_LOGGING_ENABLED` / `API_PERF_MS_THRESHOLD` / `API_PERF_BODY_MB_THRESHOLD` / `getChunkByteLength`。
  - Shell 仅 import 回被响应性能记账使用的 `API_PERF_LOGGING_ENABLED` / `API_PERF_MS_THRESHOLD` / `API_PERF_BODY_MB_THRESHOLD` / `MB_DIVISOR` / `getChunkByteLength`；`THREAD_TURN_PAGE_READ_CACHE_TTL_MS` / `THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT`（thread 搜索缓存配置）留在 Shell。
  - 唯一依赖 `node:fs` 的 `readFileSync`，零 shell 实例闭包；移除 Shell 内该簇本地定义。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 Y 批（auth 读取辅助簇）完成**。把 auth.json 读取与告警辅助并入 V 批的 `bridge/codexAuthState.ts`，补齐 auth 域：
  - 平移：`warnedCodexAuthReadFailures` / `getErrorCode` / `getCodexAuthReadErrorMessage` / `warnCodexAuthReadFailure` / `hasUsableCodexAuth`，复用模块内已有 `getCodexAuthPath`/`CodexAuth`/`readFile`。
  - Shell 同时 import 本地绑定（内部 rateLimits 校验用）并 re-export `hasUsableCodexAuth`（archive.test.ts 依赖），其余私有 helper 不对外。
  - 零 shell 实例闭包；移除 Shell 内该簇本地定义。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 archive 对 `hasUsableCodexAuth` 的依赖）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 Z 批（thread 域错误分类簇）完成**。新建 `bridge/threadErrors.ts`，承载 4 个纯字符串匹配判错误分类谓词：
  - 平移：`isUnauthenticatedRateLimitError` / `isEmptyThreadReadError` / `isThreadMaterializationPendingError` / `isThreadNotFoundError`，仅依赖 core 的 `getErrorMessage`。
  - Shell 同时 import 本地绑定（内部 rateLimit/thread 错误分流与 threadRoutes 注入用）并 re-export 全部 4 个（archive.test.ts 依赖），保持契约。
  - 零 shell 实例闭包；移除 Shell 内该簇本地定义。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 archive 对这 4 个错误分类函数的依赖）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AA 批（thread archive-recovery 簇）完成**。新建 `bridge/threadArchiveRecovery.ts`，承载 thread 归档失败恢复与消息文本抽取：
  - 平移：`callRpcWithArchiveRecovery` / `extractThreadMessageText`（thread-search 索引用）/ `readThreadArchiveFallbackName` / `isArchivedThreadReadResult`。
  - 依赖全部为既迁模块或 core：`callRpcWithRateLimitDecodeRecovery`（rateLimitDecodeRecovery）/ `canonicalizeThreadListResponseForRead`（workspaceRoots，R 批）/ `isThreadNotFoundError`（threadErrors，Z 批）+ core 的 `asRecord`/`readNonEmptyString`/`getErrorMessage`。
  - 注入型 `RpcExecutor` 结构类型（`{ rpc(method, params) }`）随簇迁入并导出；主 Shell 本地 `RpcExecutor` 类型删除，调用点经 import 复用。
  - 零 shell 实例闭包；移除 Shell 内该簇本地定义（含随迁未用的 `callRpcWithRateLimitDecodeRecovery` import）。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 archive.test.ts 对 recovery 链路的依赖）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AB 批（provider model-ids 高层读取簇）完成**。并入 F 批已有 `bridge/models.ts`，补齐 provider 模型发现域：
  - 平移：`readProviderBackedModelIds` / `readProviderModelIdsForProvider` 两个入口函数。这俩仅依赖模块级 import（core 的 `asRecord`/`readNonEmptyString`/`getErrorMessage`/`getCodexHomeDir`、models 同域工具、freeMode 的 `getFreeModels`/`filterOpenCodeZenModelsForAuthState`/`FREE_MODE_STATE_FILE`、codexAuthState 的 `ensureDefaultFreeModeStateForMissingAuthSync`）与 `appServer` 参数，零 shell 实例闭包。
  - 注入型 facade：新增 `export type RpcExecutor = { rpc(method, params): Promise<unknown> }` 结构类型，替代 shell 的 `AppServerProcess`，与 AA 批保持一致；主 Shell 两个调用点（`/provider/models` 派发与读写 provider 路由）传 `appServer` 满足该结构。
  - 清理主 Shell：删除本地两函数，并将 `bridge/models.js` import 收窄为仍被 middleware 使用的成员（`fetchCustomEndpointModelIds`/`fetchOpenCodeZenModelIds`/`sortOpenCodeZenModelIds`/`normalizeCustomEndpointBaseUrl`/`normalizeProviderModelsData` + 新增两入口），移除随迁无用的 6 个辅助 import。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测（含 codexAppServerBridge.providerModels.test.ts 对 normalizeProviderModelsData 的依赖）通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AC 批（queued-turn 构建辅助簇）完成**。新建 `bridge/turnFactory.ts`，承载 BackendQueueProcessor 组装 queued-turn 参数时的纯辅助函数：
  - 平移 8 项：`normalizeReasoningEffort` / `normalizeCollaborationModeReasoningEffort` / `ResolvedCollaborationModeSettings`（协作模式 reasoning-effort 归一化）、`extractLocalImagePathFromUrl` / `buildTextWithAttachments` / `fileNameFromPath`（附件/prompt 文本构建）、`extractThreadIdFromNotificationParams` / `isTurnCompletedNotification`（通知 thread-id 提取与类型判断）。
  - 依赖全部为模块级：core 的 `asRecord`、`types/codex.js` 的 `isReasoningEffort`/`ReasoningEffort`、threadQueueState 的 `StoredQueuedMessage`（类型），零 shell 实例闭包。
  - 主 Shell：删除本地 8 项定义，经 import 复用；`ResolvedCollaborationModeSettings` 类型透出给 `resolveCollaborationModeSettings` 返回类型。移除随迁不再使用的 `isReasoningEffort`/`ReasoningEffort` import（`CollaborationModeKind` 保留）。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AD 批（HTTP body/响应/文件上传簇）完成**。新建 `bridge/httpHelpers.ts`，平移 5 个纯模块级函数：`setJson`（JSON 响应写入）、`readJsonBody` / `readRawBody`（请求体解析）、`bufferIndexOf`（Buffer 子序列查找）、`handleFileUpload`（multipart 内存文件上传落地到临时目录）。
  - 依赖全为模块级：`node:http` 类型、`node:path` / `node:os` / `node:fs/promises`、core 的 `getErrorMessage`；零 shell 实例闭包。
  - 主 Shell：删除本地 5 项定义，经 import 复用同名函数；`readJsonBody` / `readRawBody` / `setJson` / `handleFileUpload` 引用继续注入到各路由 deps（threadPreferencesRoutes、skillsRoutes、review 等）。`node:fs/promises` / `node:os` / `node:http` 等导入因主文件其余逻辑（project ZIP、local-schema 打包、middleware 型面）仍在使用而保留。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**跨路由 setJson / readJsonBody 副本去重完成**（AD 批收尾）。此前 reviewGit.ts / skillsRoutes.ts / accountRoutes.ts 各自维护 `setJson`（JSON 响应写入）与 accountRoutes 维护 `readJsonBody` 的本地副本身份实现，与 AD 批新增的 `bridge/httpHelpers.ts` 重复。本次评估共 3 处本地副本：
  - reviewGit.ts / skillsRoutes.ts：仅 `setJson` 重复 → 删除本地函数，改 `import { setJson } from './bridge/httpHelpers.js'`。
  - accountRoutes.ts：`setJson` + `readJsonBody` 均重复 → 删除本地两函数，import `setJson`；`readJsonBody` 改为薄封装 `asRecord(await readHttpJsonBody(req))` 保持原 `Record<string, unknown> | null` 签名，避免改动 1239/1323/1415 三处 `payload?.xxx` 调用点。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AE 批（thread-search 索引构建簇）完成**。新建 `bridge/threadSearch.ts`，平移 `loadAllThreadsForSearch` / `buildThreadSearchIndex`，及随迁的 `ThreadSearchDocument` / `ThreadSearchIndex` 类型与 `THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT` 常量。
  - 依赖为模块级：core 的 `asRecord`、threadArchiveRecovery 的 `extractThreadMessageText`、注入的 `RpcExecutor` facade（同 AA/AB 批，替代 `AppServerProcess`）；零 shell 实例闭包。
  - 主 Shell：删除本地两函数与类型/常量定义；闭包 `getThreadSearchIndex`（含缓存）经 import 复用 `buildThreadSearchIndex` 与类型 `ThreadSearchIndex`。其余 `ThreadSearchDocument` / `THREAD_SEARCH_FULL_TEXT_THREAD_LIMIT` 为 `bridge/threadSearch.ts` 内部导出，主 Shell 无需透出（迁移前即模块私有，无外部/测试消费者）。`extractThreadMessageText` 主文件 re-export（archive.test.ts 依赖）保留。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**codexAppServerBridge.ts 模块级辅助迁移 AF 批（project ZIP 编排簇）完成**。新建 `bridge/projectZip.ts`，平移 `collectProjectChatZipEntries` / `importProjectZip` 两个项目会话导出/导入工作流函数。
  - 依赖全为模块级纯函数：core（`getCodexHomeDir` / `isSameOrDescendantPath` / `readNonEmptyString` / `asRecord`）、importedSessions（`walkFiles` / `readSessionMetaCwd` / `readSessionMetaId` / `readImportedSessionRecord` / `rewriteImportedSession` / `registerImportedSessionsInStateDb` / `readStateDbThreadExportMetadata` + 类型）、threadPreferencesRoutes（标题缓存读写）、workspaceRoots（`persistWorkspaceRoot`）、zip（`parseStoredProjectZip` / `ProjectZipVirtualEntry`）+ node:fs / node:path / node:crypto；零 shell 实例闭包。
  - 主 Shell：删除本地两函数定义；projectRoutes deps 处经 import 复用 `collectProjectChatZipEntries` / `importProjectZip`。同步清理主文件不再使用的 import：importedSessions 的会话解析/改写 helper、threadPreferencesRoutes 的标题缓存 helper、zip.js 全部成员；`node:fs/promises` 的 `realpath`/`utimes` 与 `node:fs` 的 `existsSync` 随迁出而移除。
  - 验证：`vue-tsc --noEmit` 通过、全量 395 个单测通过、`pnpm run build`（web+CLI）通过。

- 2026-08-23：**useDesktopState() 主函数收官决定（不再继续切分）**。本轮为主函数拆分目标做收官评估，结论：**就此收官、不再切分**。
  - 现状：主文件 7375 → 4752 行，纯工具/持久化/读取/请求/写入侧 7 个分片已拆出并各有单测（`useDesktopStateUtils`/`Persistence`/`Readers`/`Requests`/`LiveWrites`/`TurnIndex`/`ReasoningWrites`/`ReasoningTimeline`）。计划 C 批本标「高（保守，最后做）」，可安全注入式拆出的写入侧已全部按第四批模式迁出。
  - 不复切理由：① 模块级可平移纯函数已清空，残余闭包辅助（`extractLocalImagePathFromUrl`/`setSelectedModelIdForThread`/`ensureReasoningEffortSupportedForModel` 等）全部捕获共享 ref，属状态中枢本体，无法独立成纯模块；② 该区为 round-50/51/52 反复踩坑处（live 去重、overlay 双守卫、中间消息误提升 final），跨模块传 ref 进一步切碎回归风险高、无用户可见价值；③ 主函数作为应用最内聚的状态中枢，复核为合理，不应为行数再切。

- 2026-08-28：**useDesktopState() 主函数领域拆分重新开启，model/provider/reasoning preferences 完成**。用户在新一轮领域计划中明确要求继续拆分；本批只迁移边界完整且已有回归覆盖的模型偏好领域，不触碰 live turn/message 时序。
  - 新建 `useDesktopModelPreferences.ts`，由领域工厂持有模型列表、provider 上下文、线程模型映射、reasoning effort、speed mode 与 Codex CLI 缺失状态；迁出模型读取/选择、provider 兼容、fallback、模型元数据刷新、High 手动覆盖与 speed mode 更新。
  - `useDesktopState()` 只注入 `selectedThreadId` 与共享错误 ref，并继续透出原有 refs/actions；线程选择通过 `syncSelectedThreadModel` 协调，线程裁剪通过 `pruneThreadModelState` 收口，公共返回契约和 localStorage 键保持不变。
  - 性能不变量：没有新增请求、watcher、定时器、缓存或动态 fanout；`refreshModelPreferences` 的 `getCurrentModelConfig` + `getAvailableModels` 请求序列保持原样。

- 2026-08-28：**useDesktopStateUtils 上下文领域切片完成**。新建 `useDesktopStateContext.ts`，迁出无原型 record 操作、线程/provider context key、模型与协作模式规范化/读取/写入、线程上下文裁剪。
  - `useDesktopStateUtils.ts` 保留 `export *` 兼容入口；`useDesktopModelPreferences`、`useDesktopStatePersistence` 与 `useDesktopState` 改为直接依赖上下文领域，内部不再经 1300+ 行工具门面耦合。
  - 新增 `useDesktopStateContext.test.ts`，覆盖 provider id 规范化、全局/provider/活跃线程 context 保留、陈旧线程裁剪与模型 fallback 读取。
  - 纯函数机械迁移，不新增 I/O、请求、响应式状态或缓存。

- 2026-08-28：**collaboration preferences 领域完成**。新建 `useDesktopCollaborationPreferences.ts`，持有可用协作模式、按线程 context 持久化的选中模式，以及刷新/选择/裁剪动作。
  - `useDesktopState()` 在线程切换时只调用 `syncSelectedThreadCollaborationMode`，线程列表裁剪时只调用 `pruneThreadCollaborationState`；不再直接读写 collaboration context map。
  - 既有 `useDesktopState.test.ts` collaboration selection 用例覆盖 legacy storage、按线程切换和默认模式恢复；90 个状态/上下文定向测试通过。
  - 请求语义不变：仍只在 ancillary refresh 中调用一次 `getAvailableCollaborationModes`，没有新增 watcher、定时器或存储写入。

- 2026-08-28：**低频完整 UI 表面新增真实异步边界**。`SettingsAccountsPanel`、`RightGitPanel`、`RightFilesPanel`、`RightFilePreview`、`ThreadPendingRequestPanel`、`QueuedMessages` 从 `App.vue` 静态 import 改为 `defineAsyncComponent`。
  - 父层 refs、事件和 API controller 保持不变；组件仅在设置打开、右栏打开/切换、审批出现或队列非空时下载，没有新增 API 请求、watcher 或缓存失效路径。
  - 首轮四个表面构建后，主 JS chunk `610.71 → 591.02 kB`（gzip `186.58 → 181.10 kB`）；加入审批/队列边界后最终降至 `567.87 kB`（gzip `175.00 kB`）。主 CSS 最终为 `427.56 kB`（gzip `43.44 kB`）。相对本轮对齐基线 `609.25 kB`，主 JS 减少 `41.38 kB`；仍保留 `>500 kB` 构建警告，下一批继续提取完整 Settings 对话框。
  - 4173 实页验证：深色下 Settings Accounts、Git、Files、文本预览均渲染；浅色下 Settings 对话框与右侧面板表面颜色正确，测试后恢复 System 主题。

- 2026-08-28：**完整 Settings 对话框迁出并异步加载**。新建 `src/components/settings/SettingsDialog.vue`，迁入四个设置分组的完整模板与专属样式；`App.vue` 保留 API/controller 状态，通过响应式 props 映射和原回调接线。
  - Settings 形成独立 `33.73 kB` JS（gzip `8.28 kB`）与 `61.10 kB` CSS（gzip `5.63 kB`）chunk；主 JS `567.87 → 549.71 kB`（gzip `175.00 → 170.57 kB`），主 CSS `427.56 → 385.24 kB`（gzip `43.44 → 40.81 kB`）。
  - 性能审计：设置打开 watcher、账号/Hooks/Remote Control 请求入口与调用顺序未变；新增 computed 仅在组件渲染所需依赖变化时组装固定大小 props，不含 I/O、fanout 或缓存失效。主 chunk 仍有 `>500 kB` 警告；剩余主体属于首屏线程树、composer 与状态中枢，不以首屏额外请求换取仅数字层面的消警告。
  - 4173 实页验证：异步首次打开正常，General / Models / Integrations / Usage 四组切换成功；浅色背景 `rgb(255, 255, 255)`，深色表面与文字颜色正确，最后恢复 System 主题并关闭对话框。

- 2026-08-28：**useDesktopState rate-limit 领域迁出**。新建 `src/composables/useDesktopRateLimits.ts`，统一持有 Codex quota、账号快照、并发刷新复用、500 ms notification 防抖与 timer 清理；`useDesktopState.ts` 删除对应局部 refs/timer/promise/函数并复用同名 controller API。
  - 行为不变：临时请求失败继续保留最后快照；连续 notification 仍合并为一次请求；`stopPolling()` 仍取消待执行刷新并只清空当前 Codex quota，不改变账号快照保留语义。
  - 新增 `useDesktopRateLimits.test.ts`，覆盖 in-flight 请求复用、失败保留、防抖和 stop 清理；连同既有状态/上下文共 92 个定向测试通过。
  - 性能审计：每个 `useDesktopState()` 实例仍只有一个 refresh promise 和一个 timer；没有新增 watcher、请求、fanout 或缓存失效路径。生产构建主 JS `549.99 kB`（拆分前 `549.71 kB`，静态模块边界不承担 code-splitting 目标）。

- 2026-08-28：**useDesktopState 项目组织领域迁出**。新建 `src/composables/useDesktopProjectOrganization.ts`，持有项目显示名与顺序，并迁出 rename/remove/reorder/pin、500 ms 改名防抖及 workspace-roots 持久化。
  - `useDesktopState()` 只注入 source/rendered groups、当前线程，以及刷新 flags、线程状态裁剪和重新选中回调；项目模块不依赖消息、turn 或 realtime 内部状态。线程创建、workspace-roots hydrate 和线程列表应用改为调用领域 setter，不再直接写项目偏好持久化。
  - 新增 `useDesktopProjectOrganization.test.ts`，覆盖改名的本地立即写入与全局防抖持久化、移除项目后的 roots/线程裁剪/选中回退、重排和置顶；连同既有状态/上下文共 93 个定向测试通过。
  - 性能审计：仍是一个改名 timer；项目操作的 workspace-roots 请求数量和先后顺序不变，没有新增 watcher、后台任务、fanout 或缓存。生产构建主 JS `550.74 kB`（上一静态领域批 `549.99 kB`）。
  - 全量单测 414/416 通过；两个失败仍为未改动 Bridge 测试在 Windows 下的 symlink `EPERM` 与 POSIX `0600`/Windows `0666` 差异。

- 2026-08-28：**useDesktopState Skills / Hooks catalogs 领域迁出**。新建 `src/composables/useDesktopCatalogs.ts`，统一持有 installed skills、Hooks 列表/loading、两个 in-flight Promise、Skills cwd/2 秒成功缓存与两个 refresh action；`useDesktopState()` 仅注入当前选中线程 cwd，公开 refs/actions 与通知、启动、线程切换调用点保持不变。
  - 新增 `useDesktopCatalogs.test.ts`，覆盖同 cwd 短期复用、cwd 变化重载、projectless 全局请求、force 绕过缓存、Hooks 并发复用和失败保留旧列表/loading 恢复；连同 `useDesktopState.test.ts` 共 93 个定向测试通过。
  - 性能审计：每个 state 实例仍各只有一个 Skills/Hooks refresh Promise；未新增 watcher、timer、请求、阻塞工作、无界 fanout 或缓存失效路径。生产构建主 JS `550.93 kB`、gzip `171.05 kB`，静态领域边界不承担 code-splitting 目标，既有 `>500 kB` 警告保留。
  - `useDesktopState.ts` 由 4,186 行降至 4,125 行；全量单测 418/420 通过，两个失败仍为未改动 Bridge 测试在 Windows 下的 symlink `EPERM` 与 POSIX `0600`/Windows `0666` 差异。

## 剩余路由族迁移风险总览（截至 K 批后）

> 依据逐 handler 闭包锚点盘点的全局评估，用于指导后续切分顺序。

**核心闭包耦合锚点**（Shell 实例/可变状态，迁移需注入或解耦）：

| 锚点 | 类型 | 被引用的族 |
| --- | --- | --- |
| `appServer` | 实例（thread/rpc facade，10+ 接口） | thread 读/SSE、rpc、thread-search |
| `externalSessionTracker` | 实例 | thread live-state、rpc overlay |
| `backendQueueProcessor` | 实例 | automations（run） |
| `telegramBridge` | 实例 | telegram |
| `appendThreadQueuedMessage` | 闭包函数 | automations（run） |
| `persistWorkspaceRoot` | 闭包函数 | 文件/project |
| `middleware`（自引用 `subscribeNotifications`） | 闭包对象 | events/SSE |
| `requestBodyBytes`/`rpcMethod` | 可变指标状态 | rpc |

**各族风险分级（从易到难）与建议顺序**：

1. **文件/project 族**（低）——依赖多为模块 helper（`streamProjectZip`/`importProjectZip`/`collectProjectChatZipEntries`/`cloneGithubRepositoryIntoBase`），唯一注入点 `persistWorkspaceRoot`+`readRawBody`。
2. **telegram + approval-policy 族**（低-中）——注入 `telegramBridge` 实例；`write/read/normalizeTelegramBridgeConfig`、`resolveEffectiveApprovalPolicy` 等为模块 helper。
3. **automations 族**（中）——8 个 CRUD 零闭包，仅 run 依赖 `appendThreadQueuedMessage`+`backendQueueProcessor`（方案见下节 L 批）。
4. **thread 读/SSE 族**（高）——重度依赖 `appServer`+`externalSessionTracker`；`events` SSE handler 依赖 `middleware.subscribeNotifications`（自引用），需把订阅源抽离才能解耦。
5. **rpc 族**（最高，最后）——除 `appServer`+`externalSessionTracker` 外，依赖闭包指标状态 `requestBodyBytes`/`rpcMethod` + 跨领域 thread 结果合并 pipeline（`mergeSessionSkillInputs`/`mergeSessionCommands`/`filterSubagentThreads`/`overlayExternalSession`…）。

**thread-terminal 族**（4627-4738）：依赖 `terminalManager`+`appServer`，耦合同 thread 读族，需另评估。

> 更新（Q 批后）：上表为 K 批时的规划盘点。截至 Q 批，**核心派发全部路由族已迁移完成**——`events/SSE` 以其订阅源 `middleware.subscribeNotifications` 作为唯一注入点迁入 `bridge/eventsRoutes.ts`（该聚合实现自身依赖 appServer/terminalManager/externalSessionTracker 闭包，留驻 shell）。`requestBodyBytes`/`rpcMethod` 指标状态与 rpc HTTP 壳、workspace-roots 闭包、`thread-terminal` 族仍留驻 shell，均非独立 HTTP 路由族或属派发接线本身。

## 收尾验证口径（每批）

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`（web + CLI）：通过。
- 全量单测：通过；涉及被拆逻辑的既有测试文件无回归。
- 改动应纯机械迁移，不改变任何网络调用、状态同步或用户可见行为。

## automations 族迁移方案（L 批，已完成）

> 状态：已完成实施，验证通过。

### 族边界
真正的自动化 handler 共 **9 个**（CRUD 8 个 + run 1 个）。`thread-search`/`thread-titles`/`thread-pins`/`thread-reasoning`/`first-launch-plugins-card` 属 thread 搜索/状态/偏好域，**不归自动化**，单列到后续 thread 族。

### 逐 handler 闭包依赖核对结论
**零闭包 handler（8 个，可直接迁）**——依赖全部来自 `bridge/automations.ts`（已导出 `listThreadHeartbeatAutomations`/`listProjectCronAutomations`/`readThreadHeartbeatAutomation(s)`/`readProjectCronAutomation(s)`/`writeThreadHeartbeatAutomation`/`writeProjectCronAutomation`/`deleteThreadHeartbeatAutomation`/`deleteProjectCronAutomation`/`toAutomationApiMap`/`toAutomationApiData`/`toAutomationApiRecord`）+ `setJson`/`readJsonBody`，project PUT 额外用 `isAbsoluteLikePath`：

- thread-automations GET / project-automations GET
- thread-automation GET / project-automation GET
- thread-automation PUT / project-automation PUT
- thread-automation DELETE / project-automation DELETE

**闭包依赖 handler（1 个，thread-automation/run POST @5759）**——依赖链：
`readThreadHeartbeatAutomation`（automations.ts）→ `buildHeartbeatQueuedMessage` → `appendThreadQueuedMessage` → `backendQueueProcessor.scheduleThreadQueueDrain(threadId, 0)`。

### run handler 注入点决策
- **`appendThreadQueuedMessage`（2792）唯一调用点即 run handler**，但它薄薄一层包着共享队列事务子系统 `withThreadQueueStateUpdate`→`threadQueueMutationChain`/`readThreadQueueState`/`writeThreadQueueStateUnlocked`——该子系统同时被 `BackendQueueProcessor`（4035/4054/4072）与 `thread-queue-state` GET/PUT（5247/5292）复用，**不能搬走**。→ `appendThreadQueuedMessage` **整体作为 deps 注入**。
- **`buildHeartbeatQueuedMessage`（2840）+ `escapeHeartbeatXmlText`（2833）** automations 专属，**随迁**到新模块（`randomBytes`+`ThreadAutomationRecord` 可直接 import）。
- **`backendQueueProcessor.scheduleThreadQueueDrain`** 注入 `backendQueueProcessor` 实例（结构化类型仅暴露该方法）。

### 实施要点
- 新建 `bridge/automationsRoutes.ts`，`handleAutomationsHttpRequest`，deps = `{ setJson, readJsonBody, appendThreadQueuedMessage, scheduleThreadQueueDrain }`；`StoredQueuedMessage` 用局部结构类型，不导出类型。
- 主 Shell：删 8 个 CRUD 块 + run 块（原 5595-5800 区间，剔除 thread-search/titles/pins/reasoning/first-launch），接线 `if (await handleAutomationsHttpRequest(req, res, url, { setJson, readJsonBody, appendThreadQueuedMessage, scheduleThreadQueueDrain })) return`；清理随迁后不再使用的 import。
- `thread-search`（依赖闭包 `getThreadSearchIndex`/`appServer.rpc`）留驻，归入 thread 族。
- 验证：`vue-tsc --noEmit`、全量单测、`pnpm run build`（web+CLI）通过后收尾。

## 文件/project 族迁移方案（M 批）

> 状态：已完成实施，验证通过（见上方批次日志 M 批）。

### 族边界
主 Shell `5200-5492` 区间 + prompts 子族（`5494-5529`），共 **14 个 handler**。`thread-queue-state`（依赖 `backendQueueProcessor`）**不归本族**，归 queue 族。

- `/codex-api/home-directory` GET、`/codex-api/workspace-roots-state` GET/PUT
- `/codex-api/project-zip` GET/HEAD、`/codex-api/project-import` POST、`/codex-api/project-root` POST
- `/codex-api/local-directory` POST、`/codex-api/github-clone` POST、`/codex-api/projectless-thread-cwd` POST
- `/codex-api/project-root-suggestion` GET、`/codex-api/composer-file-search` POST
- `/codex-api/prompts` GET/POST/DELETE

### 逐 handler 闭包依赖核对结论
**该族零 Shell 实例闭包**（较此前「低」级进一步下调）。全部依赖仅两类：

1. **模块级 helper（`column 0` 的 `async function`，无实例捕获，可直接随迁）**
   - `readWorkspaceRootsState`/`updateWorkspaceRootsState`/`prependUniqueString`/`normalizeStringArray`/`normalizeStringRecord`
   - `collectProjectChatZipEntries`/`importProjectZip`/`createProjectlessThreadDirectory`/`cloneGithubRepositoryIntoBase`/`listFilesWithRipgrep`/`scoreFileCandidate`
   - `listComposerPrompts`/`createComposerPromptFile`/`removeComposerPromptFile`/`readRawBody`/`readJsonBody`/`setJson`
2. **纯 import**：`node:path`/`node:fs`/`node:os`、`listWorkspaceFiles`(localBrowseUi)、project-zip 四件套（`resolveAllowedProjectZipCwd`/`setProjectZipHeaders`/`streamProjectZip`/`toProjectZipFileName`）

### 注入点决策
为避免新 bridge 模块反向 import 主文件，参照 git/worktree 模式注入下列共享函数（它们留驻主文件且被多处复用，不整组搬移）：

- `setJson`、`readJsonBody`：通行。
- `readRawBody`：仅 project-import 使用（主文件 5091 亦作 `readBody` 复用）。
- `persistWorkspaceRoot`：project-root 与 `cloneGithubRepositoryIntoBase`（随迁）均调用；主文件 1437/1557/5221（git 族已注入）多处复用。

### 实施要点
- 已实施：新建 `bridge/projectRoutes.ts`，`handleProjectHttpRequest`，实际 deps = `{ setJson, readJsonBody, readRawBody, persistWorkspaceRoot, collectProjectChatZipEntries, importProjectZip }`。
- 实际迁出 12 个 handler；`workspace-roots-state` GET/PUT 留驻 shell（其闭包绑定 shell 内 workspace-roots 状态，未随迁）。

## thread 读/SSE 族迁移方案（N 批）

> 状态：已完成实施，验证通过（见上方批次日志 N 批）。仅迁 4 个非 SSE handler；`/codex-api/events` SSE handler（依赖 `middleware.subscribeNotifications` 自引用）留驻 shell 待评估。

### 族边界
迁出 4 个 handler（零 `readJsonBody` 依赖，仅 `setJson`）：
- `/codex-api/thread-turn-page` GET、`/codex-api/thread-file-change-fallback` GET
- `/codex-api/thread-stream-events` GET、`/codex-api/thread-live-state` GET

`thread/rollback-files`(4750，文件回溯写)、`server-requests/pending|respond`、`thread-search|titles|pins|reasoning`、`thread-queue-state`、`events`(SSE，5189) 不归本批。

### 闭包锚点与注入
- **`appServer`（`AppServerProcess` 大类，3064 起，共用不得搬）**：thread 读/SSE 仅用 8 个只读/缓存方法——`rpc`/`readThreadForTurnPage`/`getStreamEvents`/`storeThreadReadSnapshot`/`getLastThreadReadSnapshot`/`getCachedLiveState`/`cacheLiveState`/`mergeItemsIntoTurns`。→ 定义为窄接口 `ThreadReadAppServerFacade`（局部结构类型，不导出 `AppServerProcess` 全量），注入。
- **`externalSessionTracker`（`createExternalSessionTracker()`，4137）**：仅 `getExternalSession`(live-state 用)，注入窄签名。
- **`setJson`**：通行。
- deps = `{ setJson, appServer, externalSessionTracker }`。

### 随迁（membrane）
- `mergeStreamTurnErrorsIntoThreadResult` + `readStreamTurnId`/`readStreamTurnErrorMessage`（718/725/746，仅被 turn-page/live-state 与 rpc handler 用）随迁。依赖 `getStreamEvents` 故签名改收窄接口 `ThreadReadAppServerFacade`；rpc handler(4502) 改从新模块 import。
- `STREAM_EVENT_BUFFER_LIMIT` 被 AppServerProcess.getStreamEvents(3273) 复用，**搬入 `bridge/core.ts` 共享**（跨切片常量），主文件与新模块共用。

### 模块级 helper（import）
- 主文件：`sanitizeThreadTurnsInlinePayloads`(615)/`isThreadMaterializationPendingError`(708)（rpc handler 亦用，留驻，import）。
- session.ts：`mergeSessionSkillInputsIntoThreadResult`/`mergeSessionCommandsIntoThreadResult`/`mergeSessionCommandsIntoTurns`。
- core.ts：`asRecord`/`readNonEmptyString`/`getErrorMessage`/`STREAM_EVENT_BUFFER_LIMIT`。
- Node：`isAbsolute`/`join`/`stat`/`readFile`。

### 实施要点
- 新建 `bridge/threadRoutes.ts`，`handleThreadHttpRequest(req, res, url, deps)`，命中返回 `true`。
- 主 Shell：删 4 块 handler（原 4537-4748），接线 `if (await handleThreadHttpRequest(req, res, url, { setJson, appServer, externalSessionTracker })) return`；`events` SSE 与 rpc handler 留驻（rpc 改用 import 的 merge helper、`STREAM_EVENT_BUFFER_LIMIT` 改用 core import）。
- 验证：`vue-tsc --noEmit`、全量单测、`pnpm run build`（web+CLI）通过后收尾。

## telegram 与 rpc 族方案（O 批）

> 状态：已完成实施，验证通过（见上方批次日志 O 批）。telegram 族整体迁出；rpc 族按「抽后处理管线（`bridge/rpcPipeline.ts`）+ HTTP 壳留驻」策略处理。

### telegram 族

**族边界（3 个 handler）**：`configure-bot` POST、`config` GET、`status` GET。

**逐 handler 闭包依赖核对结论**——零 `appServer`/`externalSessionTracker` 闭包。唯一共享 shell 实例为 `telegramBridge`，且 3 个 handler 只用到其中 4 个方法（`configureToken`/`configureAllowedUserIds`/`start`/`getStatus`），定义为窄结构类型注入；`configure-bot` 用到的 `readTelegramBridgeConfig`/`writeTelegramBridgeConfig`（Config 落盘）与块内 `normalizeTelegramBridgeConfig` 为模块 helper，随迁。

**注入点决策**：deps = `{ setJson, readJsonBody, telegramBridge }`。`setJson`/`readJsonBody` 沿用各批通用注入；`telegramBridge` 仅暴露上述 4 方法（程序内部还会注入 `appServer`、`readRawBody`、`notifySubscribers`、刷新策略等复杂状态，**不随迁**，整实例归属 shell）。核心 import：`asRecord`/`getCodexHomeDir`；Node：`join`/`readFile`/`writeFile`。

**实施要点**：新建 `bridge/telegramRoutes.ts` 的 `handleTelegramHttpRequest(req, res, url, deps)`，命中返回 `true`；主 Shell 删除本地 3 块定义与 3 个 config helper，接线 `if (await handleTelegramHttpRequest(req, res, url, { setJson, readJsonBody, telegramBridge })) return`（随迁 `readTelegramBridgeConfig`/`writeTelegramBridgeConfig`，供 status/config 直读）。

### rpc 族

**族边界（1 个 handler）**：`/codex-api/rpc` POST。

**逐 handler 闭包依赖核对结论**——整个 `createCodexBridgeMiddleware` 中耦合最重的单 handler，闭包按归属分四类：

1. **RPC 触发与错误守卫（留驻 shell）**：`callRpcWithArchiveRecovery`（1589）、`hasUsableCodexAuth`（747，account/rateLimits/read 守卫）、`isUnauthenticatedRateLimitError`（705）+`isEmptyThreadReadError`（710，thread/read 空结果走 `appServer.getLastThreadReadSnapshot` 快照兜底）+`isThreadMaterializationPendingError`（715）；此外 `generate-thread-title`/`account/rateLimits/read` 早退短路口（4329-4337）也在 shell。这些分支织在“调用→合成兜底响应”的请求级逻辑里，整体搬移动线大且收益低，留驻。
2. **可变指标状态（留驻 shell，无法搬）**：闭包 `requestBodyBytes`（4095）/`rpcMethod`（4099），在 rpc 块 4320/4322 写入、metrics 层 4116/4121 读取，绑定请求作用域与 HTTP 适配。
3. **后处理管线（抽至 `bridge/rpcPipeline.ts`）**：8 步 thread/session 结果后处理链。纯 helper 随迁——`trimThreadTurnsInRpcResult`（用 `THREAD_RESPONSE_TURN_LIMIT`）、`overlayExternalSessionOnThreadList`/`overlayExternalSessionOnThreadResult`、`filterThreadListByIds`/`filterSubagentThreadsFromThreadListResult`（依赖 tracker.tick 闭合 subagent 竞态）。随迁函数零 shell 闭包，仅收窄依赖注入。
4. **跨切片纯函数 import（不迁）**：`mergeStreamTurnErrorsIntoThreadResult`（threadRoutes，已随 N 批迁入）、`mergeSessionSkillInputsIntoThreadResult`/`mergeSessionCommandsIntoThreadResult`（session.ts）、`THREAD_METHODS_WITH_TURNS`/`THREAD_METHODS_WITH_THREAD_SNAPSHOT`/`THREAD_RESPONSE_TURN_LIMIT`（core.ts）。

**rpc 方向决策**：**不整体迁出 rpc HTTP handler**，仅抽取其后处理管线。原因：`requestBodyBytes`/`rpcMethod` 是 shell 指标层与请求作用域的状态，`callRpcWithArchiveRecovery`/各错误守卫是调用→兜底响应的请求级逻辑，二者都与 shell 强绑定；真正可脱壳的是 8 步纯后处理链。故以 `bridge/rpcPipeline.ts` 的 `runRpcResponsePipeline(deps, method, rpcResult)` 承载该链。

**注入点决策**：`RpcPipelineDeps = { appServer(ThreadReadAppServerFacade，仅 storeThreadReadSnapshot), externalSessionTracker(getExternalSession/tick/getUserFacingSubagentThreadIds), sanitizeThreadTurnsInlinePayloads(shell 纯 helper，供 rpc 与 threadRoutes 共用), mergeImportedThreadsIntoThreadListResult(shell 会话索引缓存) }`。后两者读 shell 状态故注入不随迁。

**实施要点**：主文件 rpc 块中，将现内联后处理链（4374-4407：trim → mergeStream → mergeImported → filterSubagent → sanitize → mergeSkill → mergeCommands → snapshotStore → overlayExternal）替换为对 `runRpcResponsePipeline` 的调用并 `setJson` 200 返回；`rpcResult` 调用、错误守卫、`generate-thread-title`/`account/rateLimits/read` 早退、指标写入全部保留原样。
