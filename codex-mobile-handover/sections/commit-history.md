# 已提交的改动

全部改动已提交并推送到 `main`（远程 `origin/main` 已同步）。环境修复见下方列表；2026-08-05 的验收轮次提交如下：

- **`6c25ba1`**：第一轮 5 个验收问题（文件夹拖拽关闭、展开 composer 的 z-index、裸斜杠菜单、压缩横幅、空提及结果）——修复验收发现的 UI/交互缺陷
- **`299210a`**：第二轮验收（斜杠菜单滚动、H5 控件溢出、worktree 变更文件、压缩改为线程消息）——修复第二轮验收发现的缺陷
- **`eedf148`**：第三轮验收——压缩进度改为消息流内渲染（pending/done 行 + 60s 超时兜底）；设置面板新增审批策略（读写 `CODEX_HOME/config.toml` 的 `approval_policy`，优先读 `CODEXUI_APPROVAL_POLICY` 环境变量）；斜杠菜单按已装技能生成 `/技能名` 命令并分组展示（Commands / Skills）。作用：压缩状态可见性、权限审批配置、技能入口发现
- **`5cd6ede`**：第四轮修复（压缩状态两个 bug）——新版本 app-server 已废弃 `thread/compacted` 通知（改用 `contextCompaction` item），导致 spinner 收不到完成信号只能等 60s 超时、且完成消息不持久化刷新即失；修复为归一化 `contextCompaction` item 为 `compaction.done` 消息 + 压缩后轮询线程详情（2s 间隔、上限 28s）直到 done 出现 + 多次压缩只保留最近一条 done + 无压缩进行中时丢弃残留 pending 行。作用：压缩 spinner 立即结束、完成状态刷新后保留
- **`2860a54` 等早期提交**：`pnpm-workspace.yaml`（`allowBuilds`）、`vite.config.ts`（watch ignore）、`package.json`（packageManager）、`docs/codex-cli-not-found-troubleshooting.md`、P0/P1/P2 功能补齐。作用：环境修复与功能补齐（见下方方案完成情况表）
- **`b71bbaf`**：第六轮交接需求——右侧文件面板点击文件改为面板内弹窗预览（`/codex-local-preview` 双通道路由 + 新增 `FilePreviewModal.vue`，文本 512KB 截断、图片内联、二进制提示并可「Open in browser」）；中英文翻译补齐（`useUiLanguage.ts` 中文字典大幅扩充，右键菜单、编辑消息弹窗、自动化/技能/Git/Review 面板等界面硬编码文案全部包 `t()`）。作用：文件预览 + 简体中文全覆盖
- **`729a936`**：第七轮反馈 8 项——可折叠计划面板（`.thread-composer-plan-panel` 折叠/展开 + Implement plan 按钮）、命令步骤徽标、共享 `AppDialog` 组件、H5 plus-popover 的 plan/approval 入口、H5 右侧栏修复、行内文件图片预览、右键菜单状态持久化、线程回收站。作用：桌面/H5 交互与视觉一致性
- **`3823011`**：第八轮上游 PR 移植（`upstream-sync-curator` 选择性引入 5 个：reasoning levels、sanitize、windows paths、fallback titles、sidebar shortcut），随后全量重构
- **`a8f27fb`**：第八轮反馈 14 项（requirement-8）——无 plan 卡片的 feed、持久化 thinking 块、tool-call chips、工作过程排序、composer 计划最新步骤 popover、右侧面板 preview tabs、暗色主题修复、上下文 pill、侧栏回收站、设置分组等
- **`7bf5b1b`**：侧栏底部设置/回收站按钮图标化
- **`0f1a970`**：需求 6 决策落地——消息展示按 trae-work 工作过程风格全量重构（工作块 `work-block`：步骤序号圆点 + 命令 + 状态标签、命令与输出同块点击展开、连续命令平铺连续编号；worked 独立总结段落；文件变更徽标 +/M/−/→ 着色、路径行数右对齐）。作用：消息展示对齐 trae-work 工作过程风格
- **`793315b`**：第九轮 4 条修复——策略按钮显示选中值、审批策略 env 不再强制 never、模型强度默认 Medium、编辑消息先停止会话
- **`3389de3`**：第十轮 3 条——侧栏底部设置/回收图标各占半宽且图标增大（24px）、模型切换按钮固定宽度超出省略（`truncate`）、H5 下模型/模型强度/上下文按钮改小（28px / 11px）
- **`483c869`**：第十一轮 7 个问题——设置弹框背板关闭后幽灵点击重开（`settingsCloseAtMs` 守卫）、移动端右侧面板遮罩、H5 输入控件行不换行、plan 面板 markdown 回退解析、命令权限拦截提示（`commandPermissionHint`）、plan 展开面板同宽（`:deep()` + `min-w-full`）、命令与叙述时间序交错恢复（桥接层会话日志恢复 `mergeSessionCommandsIntoThreadResult`）
- **`289665d`**：第十二轮 3 条——设置面板左右布局（`.settings-group-nav` 四组导航）、Awaiting response 面板滚动上限（`max-h-[min(70vh,36rem)]`）、thinking 本地持久化展示（`rememberPersistedReasoning` → localStorage `codex-web-local.thread-reasoning.v1`，消息列表 Thinking process 折叠块）
- **`7d81389`**：第十三轮 8 项——设置面板固定高度（`h-[min(84vh,46rem)]`，切换分组不再跳动）、thinking 实时显示（捕获 `item/started`+`item/completed` 全量 reasoning，本 app-server 不推 `item/reasoning/*TextDelta`）、Awaiting response 面板悬浮化（`position: fixed` 视口底部居中，脱离文档流）+ 明暗主题（暗色覆盖移入 `src/style.css`，scoped `:global(:root.dark)` 构建中不生效）+ 中文文案、计划面板 plan item 实时捕获 + turn 后强制重载、编号列表优先解析（35 步→6 步）、Implement 防重复点击（`implemented` 判定 + 计划已执行文案）、Implement popover 内部样式补齐、面板文案 i18n（15 键）。作用：第十三轮验收 8 项问题
- **`026c8a9`**：交接文档快照更新（第十三轮已推送记录 + 手动测试索引）
- **`4508827`**：第十四轮 8 项（含暗色根因修复）——plan popover 三段式重排（标题行 `🗒 Plan N/M` + Summary/Steps 分区标签 + 步骤列表 + Implement 按钮）、思考块按轮次归位（`activeReasoningTurnIdByThreadId` 记录 reasoning 所属 turn，存档带 `turnId`/`turnIndex`，`mergePersistedReasoning` 插到该轮用户消息后，旧存档无 turnIndex 回退末尾）、已实施计划面板隐藏（`composerPlanPanel` 对 `hasLaterWork || requested` 直接 `return null`）、思考内容展开字体缩小至 13px + zinc-500（暗色 zinc-400）、live overlay Thinking 可点击折叠/展开（`.live-overlay-heading` + `▾/▸`，默认展开）、live 消息按到达顺序交错（`mergeLiveMessages` sortKey 记录首次到达序，去重后整体排序，修复命令/文本/思考扎堆）、审核/询问面板与输入框 shell 同宽（`composerShellWidthPx` ResizeObserver 实测 + `panel-width` prop）、暗色主题根因修复（ThreadComposer 计划面板 + ThreadConversation 思考块/工作块/工具调用的 `:global(:root.dark)` 规则整体迁入全局 `style.css`，此前全部失效）。作用：第十四轮反馈 8 项问题
- **`4ea05b8`**：第十五轮拆分重构——`ThreadConversation.vue` 5701 行拆至 2951 行（-48%）：纯函数迁入 `src/utils/conversationPaths.ts`（路径/链接解析）、`conversationMarkdown.ts`（整条 markdown 解析链 + 类型）、`conversationFileChanges.ts`（fileChange 聚合/展示/diff 行构建，t/cwd 参数化）；UI 区块迁入 `WorkBlockItem`/`ToolCallRow`/`ReasoningBlock`/`LiveOverlayItem`/`MessageToolbar`/`FileLinkContextMenu`/`FileChangeSummaryBlock`/`DiffViewer` 8 个子组件（standalone 与 anchored file-change 两处模板合一、右键菜单 window 监听自包含、diff viewer 全套含 H5 sheet）；顺带清除约 30 个死函数与 7 个未使用 import。作用：为 Reasonix 消息列表全量移植（Process Fold / 三区渲染）清障
- **`5e35d17`**：交接文档补充 Reasonix 复用清单（逐文件核实 `reasoningDisplay.ts`/`processFoldPreference.ts`/`transcriptGrouping.ts`/`attachmentDisplay.ts`/`Transcript.tsx` 依赖后分层：纯 TS 逻辑层约 40% 原样搬运、React 组件层重写）+ 修正工期（总计 2.5~3.5 个工作日，原 4.5~5，压缩 30~40%）。作用：明确移植工作量与可复用边界
- **`1dd4815`**：Zen 代理 `reasoning_content` 往返修复——多轮连续工具调用时，第二条起无独立 reasoning item 的 function_call 生成的 assistant 消息缺失 `reasoning_content`，被 OpenCode Zen 新网关（Console，DeepSeek thinking 模式）以 400 拒绝；`unifiedResponsesProxy.ts` 新增 `lastReasoningContent` 回退（`pendingReasoningContent || lastReasoningContent`）保证每条带工具调用的 assistant 消息都带该字段，并新增单测锁定。作用：修复多工具调用会话中后段必现的 `reasoning_content must be passed back` 报错
- **`e0b19a2`**：round-30 反馈修复（`api/normalizers/v2.ts` 将 turn 完成后存档的 last plan 归一化为 implemented 态；配套 `v2.test.ts`、`App.vue`、`useDesktopState.ts` 及测试文档更新）。作用：计划面板 implemented 判定与压缩块刷新归位（详见 `rounds/round-30-feedback.md`）
- **`fc468ff`**：交接文档脱敏——本机绝对路径一律改语义占位（`<node 安装目录>`、`<pnpm 全局 bin 目录>`、`<Git 安装目录>` 等），项目跨机器/跨平台运行不写死路径；同步更新仓库版与通用版写作规范、交接注意事项、快照与落款。作用：交接文档换机可读可执行
- **`3ab96cc`**：工具链路径进一步语义化——PATH 示例等改用 `<node 安装目录>`/`<pnpm 全局 bin 目录>` 占位并附定位命令（`Get-Command`/`pnpm bin`/`npm prefix -g`），「脱敏」升级为「脱敏与不写死路径」写入仓库版与通用版写作规范。作用：多机器/多平台运行不写死路径
- **`85d65bc`**：以 `codex-mobile-re` 名义发包——`package.json` name/bin 改 `codex-mobile-re`（上游 `codexapp`/`codexui` 归 friuns 所有无发布权限）、repository/homepage 指向本 fork、CLI 命令名与提示文案同步、版本 `0.1.88`。作用：`codex-mobile-re@0.1.88` 已发布 npm 官方源（maintainer `lgao7779`），`npx codex-mobile-re` 可用
- **`5da850d`**：round-37 修复 1——回收站记录保留被删线程标题（删除时快照 `name`，回收站列表不再显示 `（无标题）`）。作用：回收站线程名丢失修复
- **`48ad2a2`**：round-37 修复 2——右侧文件面板改为真实目录树（递归遍历 + 目录折叠 + 忽略规则），替代拍平文件列表。作用：文件面板树形结构
- **`78a3e1a`**：round-37 修复 3——消息列表图片/视频行内预览（图片内联渲染、视频 `<video controls>` 播放器、`data:` 载荷外置为本地文件）。作用：收发图片/视频渲染确认可用
- **`2de2559`**：round-37 交接文档与手动测试记录
- **`e6dd743`**：round-38 修复——@ 文件提及建议排除 `.git`/`node_modules` 等忽略与生成目录（会话搜索+本地回退双路径过滤）。作用：@ 列表不再混入 VCS 内部文件
- **`b62bf3e`**：round-38 交接文档与手动测试记录
- **`f836697`**：round-39 修复 1——@ 文件搜索在 ripgrep 缺失时退回纯 Node 目录遍历（复用文件面板遍历器），`@main` 等查询不再整体失效。作用：@ 提及无 rg 兜底
- **`6eba85c`**：round-39 修复 2——`mergePersistedReasoning` 丢弃「turnIndex 在消息流中不存在」的孤儿思考（回滚/删除轮次遗留的归档条目），不再追加到对话末尾。作用：思考过程不再堆在最后
- **`aaddc8f`**：round-39 交接文档与手动测试记录
- **`93a6763`**：round-40 修复——zen-proxy（`unifiedResponsesProxy.ts`）转换 Responses 载荷为 chat 格式时保留 `input_image` 为 `image_url` 多模态块，此前只提取文本导致模型收不到图片像素（回复「无法读取图片」）。作用：发送图片模型可理解
- **`be2cf22`**：round-40 交接文档与手动测试记录
- **`e1dccb9`**：round-41 修复——自定义端点 URL 归一化（保存时剥离误填的 `/chat/completions`、`/responses` 路径段得到 base URL），此前路径重复导致 `/models` 与运行时请求 404、模型解析为空、保存无提示。作用：自定义端点粘贴完整端点也能用（详见 `rounds/round-41-feedback.md`）
- **`a33395e`**：round-41 补充——`provider-models?provider=<provider>` 在 free-mode 自定义端点/zen/openrouter 激活时直接用真实端点拉 `/models`（provider catalog 的本地代理无 `/models` 路由返回空），模型下拉不再只剩当前模型一项
- **`548983e`**：round-42 修复 1——回退后消息回填输入框（恢复 `appendTextToDraft` + `onRollback` 回填，round-36 曾移除）；同步 litellm provider 配置到本机 CODEX_HOME 的 `config.toml`，选 Codex 与 codex-cli 同用 deepseek-v4-flash。作用：回退可编辑重发、codex 模型对齐 codex-cli
- **`6378b34`**：round-42 修复 2——补齐 `model_catalog_json`（指向 codex-cli 的 models.json）使 `model/list` 返回 deepseek-v4-flash/pro；前端 `isProviderBacked` 判定把 config.toml 的 `custom`（litellm）排除，模型下拉完整显示目录模型
- **`0f02698`**：round-42 交接文档补充（models.json 加入 medium 强度档的实测与修改记录，`models.json` 为用户机器文件非仓库）
- **`2f9643b`**：round-53 修复 1——live agent delta/completed 从通知读取并保留 `turnId`，解析已知 `turnIndex` 后在 `mergeThreadMessageStreams` 插回所属持久化轮次；`buildTurnRenderGroups` 接收实际 `liveTurnId`，仅活跃轮抑制 final 提升。作用：上一轮迟到 agent 消息不会混入新轮，历史已完成最终回答不被新轮 live 错误压制。
- **`e74ab73`**：round-53 修复 2——`thread/list` 过滤改读 external-session tracker 最近完成扫描的缓存，不在 RPC 内等待 `tick()`；后台/移动端恢复不再等待 skills、限额、协作模式等附属刷新。作用：切回后台标签时线程列表和当前会话优先恢复，移除递归扫描与附属元数据造成的阻塞。
- **round-53 docs**（`716394f`）：新增交接记录与合并手测项，更新交接总入口、快照、提交历史和线程加载/状态手测索引。
- **v0.1.104 发布**（`e514016`）：收录 `2f9643b` 与 `e74ab73`，版本从 `0.1.103` 升至 `0.1.104`；GitHub Release 与 npm publish 均已完成。
- **round-54**（`ee5df5a`）：以本机 Codex CLI `0.149.1` 生成的 app-server JSON schema 完整镜像到 `documentation/app-server-schemas/json/`；`useDesktopState.test.ts` 增加技能失效、线程状态、自动审批审查和模型改路由四组通知兼容回归，89/89 通过；前端类型检查和生产构建通过。运行时代码无需改动，详见 `rounds/round-54-codex-0.149.1-protocol-compatibility.md`。
- **round-55**（`00a500a`）：Vite 根路径被 SSE 中间件阻断——SSE 严格限制为 `/codex-api/events`，所有非 `/codex-api/` 路径立即交还 Vite。`eventsRoutes.test.ts` 2/2 通过，用户刷新实测页面恢复。详见 `rounds/round-55-vite-sse-root-route.md`。
- **v0.1.105 发布**（`709665b`）：收录 `ee5df5a`（round-54）、`00a500a`（round-55）、`709665b`（round-56 版本发布与服务观察）。版本从 `0.1.104` 升至 `0.1.105`；GitHub Release 已完成，npm publish 由用户执行。
- **round-57**（`c442425`）：最终助手文本后出现命令、文件变更或 `Worked for` 等过程收尾记录时，反向定位最后一条稳定助手消息，不再让过程项遮蔽最终总结。
- **round-58**（`0e0d0e6`）：`turn/completed` 清除 overlay 而最终 `agentMessage.live` 尚未完成态回填时，已完成轮允许该文本作为最终总结；活跃轮仍抑制中间消息提升，避免多 Agent 误判。
- **v0.1.106 发布**（`c588bdb`、`dc9986f`）：收录 `c442425` 与 `0e0d0e6`，版本从 `0.1.105` 升至 `0.1.106`；GitHub Release 已创建，`codex-mobile-re@0.1.106` 已发布并成为 npm `latest`。
- **round-61 / v0.1.107（`fdbedb8`）**：版本从 `0.1.106` 升至 `0.1.107`；修复 `thread/list` 异步后处理期间 external-session tracker 更新后仍采用旧子代理过滤快照的问题，并把过滤移至全部异步合并后；修复 live overlay 出现但 `liveTurnId` 尚未知时，上一轮已完成 final assistant 被误抑制为过程项的问题。`rpcPipeline.test.ts` 与 `transcriptGrouping.repro.test.ts` 已分别增加最小回归；手测说明已更新。生产构建 `pnpm run build` 已通过，合并定向 Vitest（`rpcPipeline.test.ts`、`externalSessionTracker.test.ts`、`transcriptGrouping.test.ts`、`transcriptGrouping.repro.test.ts`）**58/58** 通过；浏览器手测未做。提交已推送至 `origin/main`，tag 与 GitHub Release `v0.1.107` 已创建；`codex-mobile-re@0.1.107` 已发布至 npm 官方源并成为 `latest`。详见 `rounds/round-61-v0.1.107-thread-state-fixes.md`。
- **round-62 领域模块化续期（`3ab0020`、`d05088c`、`ae1d18d`、`27a8ee3`、`b8932ea`、`343fc14`、`a2ebff3`、`358f0f7`、`501179c`）**：依次提取 model/provider/reasoning、context、collaboration、异步 Settings/低频 UI、rate limits、project organization、Skills/Hooks catalogs 与 Queue/Auto-compact 状态领域。`useDesktopState.ts` 从本轮对齐基线约 4,766 行降至 3,927 行；最新定向测试 95/95、全量 424/426（两个既有 Windows Bridge 差异）、`vue-tsc` 和完整构建通过。最新主 JS `551.90 kB`、gzip `171.28 kB`，既有 `>500 kB` 警告保留。详见 `rounds/round-62-domain-modularization.md` 与 `sections/domain-modularization-plan.md`。
- **round-50**（随 **v0.1.101** 发布，tag/gh release `v0.1.101`）：侧边栏重新出现子 agent 会话——两因叠加修复（`b86c220`）：(1) 服务端竞态，tracker 3s 轮询窗口内 `thread/list` 已返回新子 agent 而过滤未生效，`filterSubagentThreadsFromThreadListResult` 过滤前 `await externalSessionTracker.tick()` 强制同步最新扫描，`tick()` 改为并发安全（已有扫描时等待而非跳过）；(2) 前端并集合并残留，`useDesktopState.loadThreads` 用 `mergeThreadGroupPages` 并集合并导致已过滤行残留，改为服务端响应为权威基线直接替换列表并重置分页游标；新增并发 tick 回归单测并更新手测文档（详见 `rounds/round-50-subagent-race.md`，npm publish 由用户执行）
- **round-43**（随 **v0.1.96** 发布，tag/gh release `v0.1.96`）：侧边栏泄漏子 agent 线程——`externalSessionTracker.updateSessionMeta` 对 subagent rollout 改用自身 `id` 键控（`session_id` 是父线程 id），使 `getSubagentThreadIds` 过滤正确的子线程 id、`externalSession` 叠加挂到子线程行、`filterThreadListByIds` 不再误删父行（`ff6df2b`）；模型强度下拉档位收敛到 Low/Medium/High（`reasoningOptionCatalog` 8→3，provider-only 模型不再冒出 Ultra 等项，`5aaa458`）；版本 0.1.96（`64fa15d`）（详见 `rounds/round-43-feedback.md`）
- **round-63 ThreadConversation / App.vue hook 化（`f6cd11f`…`61307d9`、`872a1a5`、`5baeb8c`，随 **v0.1.108** 发布）**：`ThreadConversation` 八个 hook 抽取——markdown 渲染（`useMarkdownRendering.ts`）、文件变更摘要+diff 查看器（`useFileChangeSummaries.ts`）、回复复制/fork（`useReplyCopyFork.ts`）、命令执行展示（`useCommandExecutionDisplay.ts`）、文件变更 undo/redo 状态机（`useFileChangeActionMachine.ts`）、文件链接菜单+图片展示（`useFileLinkContextMenu.ts`/`useMessageImageDisplay.ts`）；`App.vue` 两个 hook——侧边栏 UI（`useSidebarUi.ts`）与右侧面板（`useRightPanel.ts`）。辅助提交：`1edd0cd` 修复 props 在 hook 之后声明导致的 TDZ 崩溃；`d3b3eb5` 新增每轮耗时显示（`sumTurnDurations` 按 turnId 聚合 worked `durationMs`）；`db1db6d` 增加 375px 移动端右侧面板抽屉 Playwright 回归（`scripts/verify-mobile-375.cjs`）；`4e9fe75` bump 0.1.108；`dff3944` `useReplyCopyFork` 复制复位计时器卸载清理补回。hook 抽取逐行对照无行为漂移，`vue-tsc` 与 Vitest 507/509 通过（2 个失败为 `codexAppServerBridge.archive.test.ts` 的 Windows 环境性旧问题）。详见 `rounds/round-63-v0.1.108-hooks-and-release.md`。
- **v0.1.108 发布（`dc839b6`、`004299d`、`e943856`）**：收录上述 hook 化与每轮耗时，版本 `4e9fe75` bump 至 `0.1.108`；main 同步至 `e943856`。git tag `v0.1.108`、GitHub Release 已创建，`codex-mobile-re@0.1.108` 已发布至 npm 官方源并成为 `latest`。发布链路全部闭环。
- **round-64 / v0.1.109（`71e7cd8`）**：版本从 `0.1.108` 升至 `0.1.109`；①回收站弹窗固定高度（`SidebarThreadTree.vue` `recycle-bin-content` 容器 `h-64 overflow-y-auto`）；②思考强度无显式选择时默认 `medium`（`useDesktopModelPreferences.ts`）；③`ComposerPopover` 面板由 `absolute` 改为 viewport `fixed` 定位（思路同 `ComposerDropdown#updateMenuPosition`），逃避移动端 `.thread-composer-controls` 的 `overflow-x-auto` 滚容器裁剪，修复 H5 下「+」附加菜单打开后不可见；同步更新推理默认断言与 H5 附加菜单手工用例。`vue-tsc --noEmit` 与 `pnpm run build`（web + CLI）通过，移动端 Browser Use 实测三项 PASS。git tag `v0.1.109` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.109` 由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.109`），发布链路闭环。详见 `rounds/round-64-v0.1.109-recycle-bin-thinking-h5.md`。
- **round-65 / v0.1.110（`0701899`、`f519842`）**：版本从 `0.1.109` 升至 `0.1.110`；①每轮耗时显示从对话底部改为「本轮过程」标题旁胶囊徽标（`ThreadTurn.vue`），并新增服务端 sidecar 持久化——`threadPreferencesRoutes.ts` 新增 `GET/PUT /codex-api/thread-turn-durations`（读写在 `~/.codex/.codex-global-state.json` 的 `thread-turn-durations`，每线程滚动保留 200 轮），`misc.ts` 新增 `getThreadTurnDurationArchive`/`persistThreadTurnDuration`，`useDesktopStatePersistence.ts` localStorage 镜像 + 桥接层同步，`useDesktopState.ts` 完成轮 `rememberTurnDuration` 记录、启动加载并 `insertPersistedTurnDurations` 合并进消息流；`ThreadConversation.vue` 过程区过滤 `worked` 行避免重复；②命令块不再自动展开——新命令到达瞬间自动展开露黑色输出区、旁白文本到达又收起导致的列表闪烁，`useCommandExecutionDisplay.ts` 移除自动展开（保持紧凑行），删除无用的 `collapsedAutoCommandIds` 自动收起状态与 watch。定向 Vitest（`turnDurations.test.ts` 6/6、`useCommandExecutionDisplay.test.ts` 7/7、`useDesktopState.test.ts` 89/89）、`vue-tsc --noEmit` 与 `pnpm run build`（web + CLI）通过，dev server 重启实测路由与 UI。git tag `v0.1.110` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.110` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.110`），发布链路闭环。详见 `rounds/round-65-v0.1.110-turn-duration-persist-command-flash.md`。
- **round-66 / v0.1.111（`762ef69`、`7d50f54`、`aca350e`）**：版本从 `0.1.110` 升至 `0.1.111`；①回退不再静默失效且保留目标轮次——`rollbackSelectedThread` 的 `turnIndex` 在持久化消息缺失时从 `turnIndexByTurnIdByThreadId` 兜底获取（此前算成 `-1` 直接无操作），`numTurns` 从 `maxTurnIndex - turnIndex + 1` 修正为 `maxTurnIndex - turnIndex`（此前回退 1 轮会连目标轮一并删除、清空线程）；②服务端 `collectFileChangesForTurns` 解析 CLI 0.149.1+ 的 `function_call` 格式 apply_patch（patch 在 `arguments.command`），与旧版 `custom_tool_call.input` 双格式兼容，回退文件变更不再报「No turns to revert」，新增可移植 fixture 单测 `session.rollback-verify.test.ts`；③现有线程（空闲/进行中）发送消息立即显示乐观用户行——`sendMessageToSelectedThread` 两个发送路径补 `appendOptimisticUserMessage`，乐观行由既有 `mergeMessages` 去重在服务端返回真实消息时无缝替换，新增单测 `sendMessageToSelectedThread shows the user message immediately`。`useDesktopState.test.ts` 90/90、`vue-tsc --noEmit` 与 `pnpm run build`（web + CLI）通过，浏览器实测三种发送路径乐观 UI 均生效。git tag `v0.1.111` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.111` 已由用户 publish 至 npm 官方源并成为 `latest`（发布时刻 `2026-09-02T14:58:10.947Z`，shasum `ddb468b9cc0207d18eadc5a3ed3cf51328effa0b`，2026-09-15 复查回填）。详见 `rounds/round-66-v0.1.111-rollback-optimistic-ui.md`。
- **round-67 / v0.1.112（`9b15b8c`、`b53ee3f`）**：版本从 `0.1.111` 升至 `0.1.112`；①线程切换卡顿优化——`models.ts` 为 `/codex-api/provider-models` 增加 30s TTL 缓存（`fetchProviderModelIds`），切换线程不再重复请求（此前每次 340~3600ms）；`App.vue` 用 `lastStableFilteredMessages` 保留上一次稳定消息列表，加载期间显示旧内容避免闪烁；`useDesktopMessageHistoryLoading.ts` 引用计数管理并发加载的 `isLoadingMessages`，`ThreadConversation.vue` 仅在消息为空时显示全屏加载、有旧消息时显示顶部加载条；②回退最后一条消息修复——`rollbackSelectedThread` 目标轮即最后一轮时 `maxTurnIndex - turnIndex` 为 0，此前 `if (numTurns < 1) return` 静默无操作（用户回退最后一条消息「点了确认没反应」），改为 `numTurns = Math.max(1, maxTurnIndex - turnIndex)` 移除该轮本身，新增单测与手测文档。`useDesktopState.test.ts` 91/91、`vue-tsc --noEmit` 通过，浏览器实测回退最后一条消息生效。git tag `v0.1.112` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.112` 已由用户 publish 至 npm 官方源并成为 `latest`（发布时刻 `2026-09-03T15:56:10.947Z`，shasum `1851ccc112eea2af67b97b09769865faf28b9acc`，2026-09-15 复查回填）。详见 `rounds/round-67-v0.1.112-thread-switch-perf-rollback-last.md`。
- **round-68 / v0.1.113（`e1be9d9`）**：版本从 `0.1.112` 升至 `0.1.113`；回退语义修复——`rollbackSelectedThread` 的 `numTurns` 从 `Math.max(1, maxTurnIndex - turnIndex)` 改为 `maxTurnIndex - turnIndex + 1`：回退目标轮移除该轮（含其用户消息）及其后的所有轮次，而非只删后续、保留目标轮（此前「确认回退后消息列表没有更新，回退那条消息还在列表」）；目标轮即最后一轮时 `maxTurnIndex - turnIndex` 为 0，`+1` 后仍为 1，删除该轮而非静默无操作；单消息线程回退后回到空线程态。新增中间轮回退单测（断言 `rollbackThread` 以 `numTurns = 2` 调用）并更新手测文档。`useDesktopState.test.ts` 92/92、`vue-tsc --noEmit` 通过，浏览器实测回退首/中/末消息均生效。git tag `v0.1.113` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.113` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.113`），发布链路闭环。详见 `rounds/round-68-v0.1.113-rollback-target-turn.md`。
- **round-69 / v0.1.114（`63417f3`）**：版本从 `0.1.113` 升至 `0.1.114`；回退健壮性修复——`rollbackSelectedThread` 目标轮 turnIndex 无法解析（如通知增量通道刚写入、缺 `turnIndex` 且映射表也未登记）时不再静默 `return`（曾导致「点了回退没反应、最后一条消息还在」），改为钳制到最新一轮再回退并 `console.warn`；真实 codex `0.149.1` app-server `thread/rollback numTurns` 语义端到端验证（28 轮 rollback 1 → 27 轮，正确删除末尾 userMessage）。新增单测（断言钳制到最新轮、`rollbackThread` 以 1 调用）并更新手测文档。`useDesktopState.test.ts` 93/93、`vue-tsc --noEmit` 通过。git tag `v0.1.114` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.114` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.114`），发布链路闭环。详见 `rounds/round-69-v0.1.114-rollback-no-silent-nop.md`。

## round-70（v0.1.115 发布，已闭环）

- **round-70 / v0.1.115（`f2233bb`）**：版本从 `0.1.114` 升至 `0.1.115`；修复「本轮过程中出现空的 `processFold` 块、无内容」。根因：折叠分组按「同轮次连续命令/工具」成组（`buildProcessFolds`），命令分组按「连续命令、不区分轮次」分组（`groupedCommandsByLatestId`）；相邻两轮末尾/开头各带命令时，下一轮命令成为跨轮命令块最新命令，本轮折叠全部命令被 `hiddenGroupedCommandIds` 隐藏 → 空壳折叠头。修复：`conversationFolds.ts` 新增 `isProcessFoldEmpty`，`ThreadConversation.vue` 新增 `emptyFoldStartIds` 并于模板跳过空折叠 `<li>` 渲染（成员内容已在跨轮命令块/文件变更摘要展示，不丢数据）。`conversationFolds.test.ts` 15/15、`vue-tsc --noEmit` 通过。git tag `v0.1.115` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.115` 已由用户 publish 至 npm 官方源并成为 `latest`，发布链路闭环。详见 `rounds/round-70-fix-empty-processfold-block.md`。

## round-71（v0.1.116 发布，已闭环）

- **round-71 / v0.1.116（`79622df`）**：版本从 `0.1.115` 升至 `0.1.116`；修复「本轮过程中空的 `agentMessage`/通用正文过程行、无内容」。根因：推演消息（`agentMessage` 等）出现在本轮过程区，当 `text` 为空、又无图片/文件附件/技能时落入 `ThreadConversation.vue` 通用正文分支——`message-card`（`v-if="message.text.length > 0"`）被跳过、附件/技能也为空 → 渲染出完全空的 `<li class="conversation-item conversation-item-process" data-message-type="agentMessage">`（round-70 守卫只覆盖全隐藏折叠）。修复：新增纯函数 `src/utils/messageContent.ts`（`hasMessageBodyContent` + `shouldOmitEmptyGenericMessage`），普通 `<li>` 分支（`v-else-if`）追加 `&& !shouldOmitEmptyGenericMessage(message)`——仅在命中通用正文分支且无任何可渲染内容时省略，不触碰 command/toolCall/fileChange/compaction/plan 专用分支。`messageContent.test.ts` 5/5、`conversationFolds.test.ts` 15/15、`vue-tsc --noEmit` 通过。git tag `v0.1.116` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.116` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.116`），发布链路闭环。详见 `rounds/round-71-fix-empty-process-row.md`。

## round-72（v0.1.117 发布，已全部闭环）

- **round-72 / v0.1.117（`e5e1efd`）**：版本从 `0.1.116` 升至 `0.1.117`；修复「线程模型切换不生效」。根因：`startTurnForThread` 对「本会话尚未 resume 过的线程」发首个 turn 前调用 `resumeThread` 并**无条件** `setThreadModelId(threadId, resumedThread.model)`——用服务端线程持久化的旧 model 覆盖用户在 UI 已切换的新选择；旧模型被下线/删除时，resume 返回的仍是旧 ID，直接拿去发请求被 LiteLLM 400 拒绝。修复：`useDesktopModelPreferences.ts` 新增 `hasThreadModelSelection(threadId)`（线程上下文键已有显式选择才为真），`startTurnForThread` resume 覆盖前加门控 `!existingThreadModel`——有显式选择不覆盖，无显式选择仍用服务器 model 初始化（无回归）。`useDesktopModelPreferences.test.ts` 4/4、`useDesktopState.test.ts` 93 通过、`vue-tsc --noEmit` 通过。手测 `tests/providers-models/thread-model-switch-persists-on-resume.md`。git tag `v0.1.117` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.117` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.117`），发布链路闭环。详见 `rounds/round-72-fix-thread-model-switch-on-resume.md`。

## round-73（v0.1.118 发布）

- **round-73 / v0.1.118（`8aced6f` 需求实现，+ 追加修复提交 + 版本/文档提交）**：版本从 `0.1.117` 升至 `0.1.118`；四组改动——①切换模型后上下文窗口未更新：`invalidateThreadContextWindow` 把 `modelContextWindow` 置 null（保留 token 计数），指示器进占位态待新模型首个 `tokenUsage` 事件恢复；②模型切换分割栏：`injectModelSwitchDivision` 按切换锚点注入本地持久化「旧→新」分割栏（`codex-web-local.thread-model-switch-markers.v1`，≤20/线程，不写服务器，重复切换原地更新），`ThreadConversation.renderTurns` 重构为多分割栏锚定（`leadingDividers`/`dividers` 数组），修复分割栏文本不居中、重复堆积、新消息跑到上次用户消息下方；`filteredMessages` 剔除 `modelSwitch`；③回退降级：`threads.ts` 新增 `revertThread(threadId, beforeTurnId)`，`useDesktopState.rollbackThreadWithRevertFallback` 在 paginated 历史拒绝 `thread/rollback`（`not support thread/rollback`）时降级 `thread/revert`，回退顺序改**先对话后退文件**、`console.warn` 显式上报文件回退错误；④协议快照同步：`documentation/app-server-schemas/{json,typescript}` 用本机 codex `0.153.4`（`--experimental`）重新生成（json 416 / ts 827 文件），`APP_SERVER_DOCUMENTATION.md` 更新至 0.153.4。`modelSwitchMessages.test.ts` 2、`useDesktopState.test.ts` 93、`transcriptGrouping.test.ts` 33 通过，`vue-tsc --noEmit` 干净，浏览器实测分割栏四例 + 回退 paginated/legacy 全过。git tag `v0.1.118` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.118` 已由用户 publish 至 npm 官方源并成为 `latest`（发布时刻 `2026-09-10T16:18:43.363Z`，shasum `3fddde93e5c5ba99f4fe30a0d66f0d71dfc11fdf`，2026-09-15 复查回填）。详见 `rounds/round-73-model-switch-context-and-divider.md`。

## round-74（v0.1.119 发布，已闭环）

- **round-74 / v0.1.119（`abee79b` 修复；+ `ca756cb` 夹具对齐 0.153.4 schema）**：版本从 `0.1.118` 升至 `0.1.119`；修复 0.1.118 上「回退 paginated 历史迁移没接完」的两个线上缺陷——①消除探路 502：`UiThread` 接线 `historyMode`（缺省 legacy），`rollbackThreadWithRevertFallback` 读 `historyMode` **一次**直达 `thread/revert`（paginated）或 `thread/rollback`（legacy），不再先发注定失败的 `thread/rollback` 撞墙降级，每次回退不再多一个 `POST /codex-api/rpc` 502；②消除消息列表刷新：`revertThread` 不再消费恒空的 `revert.thread.turns`（schema 明写 `turns` 恒空、须经 `thread/turns/list` 增量 hydrate），改用返回的 `turnsBackwardsCursor` 经 `thread/turns/list`（desc/limit 200/itemsView full）增量加载裁剪后历史，杜绝「先清空再全量重灌」；③桥接裁剪补全：`THREAD_METHODS_WITH_TURNS` 加入 `thread/revert`（trim/inline/session 对空 turns 无害空转），`THREAD_METHODS_WITH_THREAD_SNAPSHOT` 改显式枚举避免空快照污染 read 兜底。注：`ca756cb` 是发布构建修复——协议同步 0.153.4 后 `ThreadItem/Thread/Turn/...` 新增必填字段，补全 `v2.test.ts` 测试夹具使 `vue-tsc` 与发布构建通过。`useDesktopState.test.ts` 定向用例 + `vue-tsc --noEmit` 干净 + `pnpm run build` 通过。git tag `v0.1.119` 与 GitHub Release 由维护者创建，`codex-mobile-re@0.1.119` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.119`），发布链路闭环。详见 `rounds/round-74-rollback-paginated-fixes.md`。

## round-75（v0.1.120 发布，已闭环）

- **round-75 / v0.1.120（`8852718` 修复）**：版本从 `0.1.119` 升至 `0.1.120`；修复「侧边栏同一线程渲染多行 + Vue duplicate-key 告警」。根因（绕过 bridge 直连 app-server 实测确认）：paginated 线程经 `thread/revert` 后不重写原 rollout 文件，而是新开一段并以 `history_base` 指向前缀（预期设计）；app-server 从 `sessions/` 目录扫描构建 `thread/list`，把同一 session 的多段 rollout 当成多条线程返回（`state_*.sqlite` 仍是「一 id 一行」，PRIMARY KEY 保证）；实测 `thread/list` rows 21 / unique 18，`01a080b5-...` ×3、`01a08b25-...` ×2。fork 侧 `filterThreadListByIds`、`normalizeThreadGroupsV2`、`groupThreadsByProject`、`mergeThreadGroups` 均不去重（CodeGraph 标注无覆盖），`SidebarThreadTree` 四处 `v-for :key="thread.id"` 同 key 重复渲染。修复：①bridge 层 `rpcPipeline.ts` 新增 `dedupeThreadListByIdKeepNewest`，作为 `thread/list` 终态按 `id` 归并、保留 `updatedAt` 最大（最新）段、保持首次出现顺序、无 id 行透传、无重复返回原引用；②前端新增 `src/utils/threadGroups.ts`（`dedupeThreadGroupsById`），`SidebarThreadTree.vue` 加 `dedupedGroups` 计算属性把 `filteredGroups`/`globalThreads`/`threadById` 三处渲染源全部接上，不改 `loadThreads` 的服务端权威语义；③`rpcPipeline.test.ts` +3 例、`threadGroups.test.ts` +4 例。验证：定向 `threadGroups` 4/4 + `rpcPipeline` 5/5、全量 541 通过/2 失败（`codexAppServerBridge.archive.test.ts` Windows 权限差异，既有环境性失败）、`vue-tsc --noEmit` 干净、`vite build`（335 模块）与 `tsup` CLI 构建通过。手测 `tests/thread-loading-state/sidebar-deduplicates-paginated-thread-segments.md`。git tag `v0.1.120` 与 GitHub Release 已由维护者创建（https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.120 ，非草稿/非预发布，已标记 Latest），`codex-mobile-re@0.1.120` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.120`），发布链路闭环。详见 `rounds/round-75-dedupe-paginated-thread-segments.md`。

## round-76（v0.1.121 发布，已闭环）

- **round-76 / v0.1.121（`0d18ca2` 性能优化，文档/版本提交 `3e6405c`）**：版本从 `0.1.120` 升至 `0.1.121`；用户需求「左侧的线程和消息列表加载很慢」。先测量后改动（AGENTS.md）——基线直连 app-server 与桥层逐环计时，最重线程 `01a0465a-f570-78a0-ae6b-badc1c40b4e8`（rollout 两段 3.07MB + 32.4MB）实测 `thread/read` **13.55MB / 867–912ms**（19 轮未裁剪）、前端打开 `thread/resume` **3041.8ms / 4,496,900B**、首屏 `/codex-api` 合计 **4,448.4KB**、冷启动队首 free-mode/status 2619ms / meta/methods 1306ms / thread-queue-state 1287ms（`thread/list` 934ms 冷 vs 63ms 热）。按 item 类型统计字节：`commandExecution` **74%**（单块最大 803KB，默认折叠渲染）、`mcpToolCall` **18%**（其中 `result` 1.52MB，**前端从不读取**）、`fileChange` 6%，真实对话仅 ~1.5%。调研业界共识（Codex TUI `truncate_lines_middle` + `createTruncatingCollector`；Claude Code Bash ~30K 字符内联窗口、MCP 超限落盘并返回路径；Slack 元数据 API + 懒加载且有「不要什么都缓存」教训；Discord 懒加载 + 虚拟列表 + 游标分页）后用户裁定「截断 + 落盘 + 路径回指」并四项一起做。实现（全在桥层与消费端）：①`payloadSlimming.ts` 删 `mcpToolCall.result`；②`aggregatedOutput` 超 `COMMAND_OUTPUT_INLINE_LIMIT_BYTES = 16KB` 中段截断（保头 60% + 尾 40%，`truncateUtf8Middle` 按字节切分后剥接缝 U+FFFD）并附 `aggregatedOutputSpill { ref, totalBytes, omittedBytes }`，原文以 sha1 落盘（> `COMMAND_OUTPUT_SPILL_MAX_BYTES = 8MB` 只截断不落盘），`inlineImages.ts` 首步接入使 rpc pipeline / thread-turn-page / thread-live-state 三条路径一并覆盖；`threadRoutes.ts` 新增 `GET /codex-api/command-output`，`resolveCommandOutputSpillPath` 用 `/^[0-9a-f]{40}$/` 白名单校验 ref；前端 `types/codex.ts` 加 `CommandOutputSpill`、`normalizers/v2.ts` 加 `readCommandOutputSpill`、`gateway/threads.ts` 加 `getCommandOutputText`、`WorkBlockItem.vue` 加截断提示行与「查看完整输出」入口、`useUiLanguage.ts` 加 4 条文案；③`threadReadCache.ts` 新增 `ThreadReadResultCache`（TTL 20s、≤6 条、`turn/` 与 `thread/start|fork|rollback|revert|resume|archive|unarchive|delete|compact|name/` 命中即失效、dispose 清空；**刻意不缓存 `thread/resume`**，因其建立 app-server 会话状态），`codexAppServerBridge.ts` 接线并在 `rpc()` 里按方法失效；④`AppServerProcess.warmUp()`（best-effort `disposeIfConfigChanged()` + `ensureInitialized()`）在 `createCodexBridgeMiddleware` 中触发。另修 `SHARED_BRIDGE_VERSION` → `experimental-api-v3`（不 bump 会让长驻 dev server 复用旧 `AppServerProcess` 实例，报 `appServer.warmUp is not a function` 并陷入 restart 失败循环）。实测成效：最重线程响应体 **4,391.5KB → 1,599.1KB（−63.6%）**、首屏 `/codex-api` 总字节 **4,448.4KB → 2,010.3KB（−54.8%）**、重复 `thread/read` **1745ms → 72ms**（服务端日志 1717ms → 21ms）、命令输出该类型 **−70.8%**（215 块中 31 块超限，原文 3.78MB → 内联 1.10MB + 落盘 2.67MB）、回读 **13.6ms 取回 36,841B**（穿越尝试 400 / 不存在 404）、热态端点全部 ≤70ms 无回归。预热诚实结论：冷启动单次采样未见改善（前端 1–3s 到达 vs init ~2.1s，只能部分重叠），价值在后续加载而非首屏，已写进代码注释；副作用是 spawn 由懒触发变为桥创建即触发。验证：全量 Vitest **569 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` Windows 权限差异，既有环境性失败）、`vue-tsc --noEmit` 干净、`vite build`（335 模块）通过；新增 `payloadSlimming.test.ts`、`threadReadCache.test.ts`、`commandOutputRoute.test.ts` 与 `v2.test.ts` 3 例；新增 `scripts/profile-bridge-rpc.cjs` 供复现。顺带修复既有 flake——`useDesktopState.test.ts` 补 `persistThreadTurnDuration` mock。手测 `tests/thread-loading-state/thread-payload-slimming-and-output-spill.md`。git tag `v0.1.121`（annotated，指向 `b8642f2`）与 GitHub Release 已由维护者创建（https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.121 ，非草稿/非预发布，已标记 Latest）；`codex-mobile-re@0.1.121` 已由用户 publish 至 npm 官方源并成为 `latest`（`dist-tags.latest` → `0.1.121`，发布时刻 `2026-09-11T08:05:17.895Z`），发布链路闭环。详见 `rounds/round-76-thread-loading-perf.md`。

## round-77 / round-78（v0.1.122 发布，已闭环）

- **round-77（`66b6996` 线程打开时延：轮耗时镜像写放大消除 + provider-models 并发去重）**：用户反馈 round-76 后「左侧线程加载快了一点但还是有点慢；消息列表感觉没有变化」。先测量再改动（AGENTS.md），dev server 4173 + 真实 home 环境（最重 rollout 4.03MB，线程 `019ffb5c-7f50-7381-bdd5-9b20d4787599`）：热态桥层并不差——`thread/list` 91ms、`thread/resume` 148–718ms / 374KB、`thread/read` 重复 149→9ms（round-76 缓存命中）、首屏总 API 仅 **116.6KB**（载荷瘦身确实生效）；说明 round-76 减的是「响应字节」，而打开线程的耗时由**并发请求争抢**主导。根因：`savePersistedTurnDurationMap` 每次保存都把**全部线程的每一轮**逐条 `PUT /codex-api/thread-turn-durations`，且在「启动时合并服务端存档」之后同样被调用 → 每次开页把服务端已有数据原样回写（本机 **27 个 PUT**）；桥接层每个 PUT 都是「读整份 `codex-global-state.json` + 写回」，占满浏览器 ~6 条同源连接并串行占用服务端文件 I/O，直接拖慢并发的 `thread/list` / `thread/resume`。**A/B 决定性验证**（短路 PUT 风暴、其余不变）：`thread/resume` 平均 **224→84ms**、点击线程 **455/258/243→246/114/123ms**。两处改动：①`useDesktopStatePersistence.ts` 新增 `mirroredTurnDurations` 快照 + `seedMirroredTurnDurations`，`savePersistedTurnDurationMap` **只发新增/变化的增量**；`useDesktopState.ts` 的 `loadThreadTurnDurationsIfNeeded` 合并服务端存档后先种子化再保存（来自服务端的数据不回写，纯本地新增仍正常上行）；②`src/api/gateway/models.ts` 加 `providerModelsInflight`，同一 provider 的并发 `provider-models` 调用共享同一个 in-flight Promise（原先缓存只在响应回来后写入，首屏多个调用方各自 miss，×4 → ×2）。实测稳态：`thread/resume` **224→81ms（−64%）**、点击线程 #1/#2/#3 **−47%/−65%/−49%**、`thread-turn-durations` 请求 **28→1**、请求总数 **85→53**、boot→侧栏 403–476ms（持平）。新增 `useDesktopStatePersistence.turn-durations.test.ts` 3/3；全量 Vitest **572 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` Windows 权限差异，既有环境性失败）、`vue-tsc --noEmit` 干净。手测 `tests/thread-loading-state/turn-duration-mirror-sends-deltas.md`。详见 `rounds/round-77-turn-duration-mirror-and-provider-models-dedupe.md`。

- **round-78（`66b6996` 接入 `@colbymchenry/codegraph` MCP + provider 目录服务端缓存与启动预热，文档/版本提交 `a2d43c0`）**：用户要求「配置好 `@colbymchenry/codegraph` MCP 后再排查一次」。**MCP 接入**：codegraph v1.5.0 已由 pnpm 全局安装、项目 `.codegraph/` 索引已存在（699 文件 / 9709 节点）；因 pnpm 全局目录是版本哈希目录（`codegraph upgrade` 后失效、MCP 会静默坏掉），新增稳定启动器 `~/.workbuddy/bin/codegraph-mcp.cjs`（运行时在全局根下搜索 `npm-shim.js` 并委派），`~/.workbuddy/mcp.json` 合并追加 `codegraph`（`serve --mcp`，原 godot-mcp/godot-lsp 未动）；握手验证 `serverInfo={"name":"codegraph","version":"1.5.0"}`、`tools/list=[codegraph_explore]`；**待办：MCP 改动不会自动生效，需在连接器管理页右上角「自定义连接器」入口对 `codegraph` 点「信任」后才加载**（本会话工具列表未刷新，复查用等价 CLI `explore`/`callers`/`query`）。**复查结论**：稳态切换已快（点击 #1/#2 82–264ms），但**首次点击固定 ~1.1s，且与线程内容无关**（9 条消息的线程同样慢）；请求时间线显示 `thread/resume` 本身仅 **32ms**，却等到点击后 **+1221ms** 才发出——正好是 `provider-models` 结束（+1208ms）后的 13ms。**A/B 逐项隔离**（一次只短路一个）：基线首次点击 1102ms；只短路 `/codex-api/provider-models*` → **126ms**；只短路 `free-mode/status` → 1058ms；只短路 `/codex-api/git/**` → 1121→1092ms（**顺带更正 round-77 把 `git/branches` 500 归因于「git 在 dev server 里不可用」的说法**：git 可用，只是本机单条 git 命令即需 316–488ms、该路由串行跑 4–6 条（1.4–2.8s/项目）；但它**不在关键路径上**）。**根因**：`selectThread`（`useDesktopState.ts:2441`）里 `await refreshModelPreferences({ includeProviderModels: true })` 把外部 provider 目录放在了打开线程的关键路径上，而服务端 `fetchOpenCodeZenModelIds()` / `fetchCustomEndpointModelIds()`（`src/server/bridge/models.ts`）**每次调用都打一次外部接口、完全没有缓存**（本机 provider 是 opencode-zen，走的正是这条），`getFreeModels()`（`src/server/freeMode.ts`）更严重——**只在成功时写缓存**（失败/超时则每次重付一次网络），且其 `fetch` **连超时都没有**。这也解释了 round-77 只做客户端并发去重（×4→×2）为何无效：减的是重复次数，第一次的真实网络时间仍在。**改动（3 文件）**：①`src/server/bridge/models.ts` 加模块级目录缓存（TTL 10 分钟／空结果只压 1 分钟／同 key in-flight 去重／**过期时先返回旧值再后台刷新**），原实现降级为 `*Uncached`；②`src/server/freeMode.ts` 给 openrouter 目录请求加 1.5s 超时、**失败也记账**（返回给调用方的值不变，只是后续不再重复等网络）、兜底列表只压 60s；③`src/server/codexAppServerBridge.ts` 新增 `warmProviderModelCatalog()` 并接入既有启动预热块，按当前 free-mode 配置预热对应目录。**为什么不做「客户端不 await」**：`refreshModelPreferences` 会用该列表校正 `selectedModelId`（不在列表里就回落到第一项），改成 fire-and-forget 或在列表未取到时返回兜底列表，**反而可能把用户选的模型改掉**；服务端缓存返回的是同一个值，只有延迟变化——行为零变更。实测：`provider-models` **1276ms → 3ms（max 5ms）**、稳态首次点击 **1040–1121ms → 107/111/122ms（−90%）**（与「提前短路 provider-models」的理论下限 126ms 一致），点击 #1/#2 与 boot→侧栏持平（209–250 / 82–96 / 410–428ms）。新增 `src/server/freeMode.freeModelsCache.test.ts` + `src/server/bridge/models.catalogCache.test.ts` **6/6 通过**（失败被记忆化、成功被记忆化、TTL 过期先发后用、zen 目录只取一次、空目录记忆化、custom 端点按 URL 分 key）；全量 Vitest **578 通过 / 2 失败**（同上既有 Windows 环境性失败）、`vue-tsc --noEmit` 干净。**如实记录的边界**：服务端重启后的第一次 `provider-models` 仍可能付一次上游往返（启动预热是后台的）；dev 模式服务器重启后**第一个**页面 boot→侧栏会到 ~6.3s，那是 Vite 首次 transform 全站（生产构建不存在），随后回落 ~420ms。手测 `tests/thread-loading-state/provider-model-catalog-cache-server.md`。详见 `rounds/round-78-provider-catalog-cache-open-thread-path.md`。

- **v0.1.122 发布**（`a2d43c0` 版本 bump + 文档）：版本从 `0.1.121` 升至 `0.1.122`，一并收录 round-77 与 round-78。`d87859d` 记录提交哈希、`3393175` 记录推送状态后，git tag `v0.1.122`（annotated，指向 `3393175`）与 GitHub Release 已由维护者创建（https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.122 ，非草稿/非预发布，已标记 Latest）；`codex-mobile-re@0.1.122` 已由用户 publish 至 npm 官方源并成为 `latest`（`dist-tags.latest` → `0.1.122`，发布时刻 `2026-09-11T13:27:47.938Z`，shasum `3a331aab8ba9ea361a4c071498a964193fbbcf9e`），发布链路全部闭环。

## round-79（回退后消息列表倒序修复，随 v0.1.123 发布）

- **round-79（`f2cd90a` fix + 回归测试 + 手测文档）**：用户反馈「回退的时候会导致消息列表渲染顺序错误，比如最老的一条消息显示在最新或最下面」。排查：全仓只有 `revertThread` 消费 `thread/turns/list`（向上翻页路径 `/codex-api/thread-turn-page` 是全量 `thread/read` 升序切片，无此问题）；实测 dev server RPC 确认 `sortDirection: 'desc'` 返回页 **newest-first**（首个 turn `019feaa1-…` 新于 `019fea87-…`，turn id 为 UUIDv7 时间有序；`ThreadTurnsListParams.json` 亦写明默认 descending），而 `normalizeThreadMessagesV2` 完全保序且 `turnIndex = base + offset` 按输入顺序递增——round-74 的 `revertThread` 未反转 desc 页直接消费，paginated 回退后保留历史**整段倒序**（最老消息沉底）且 `turnIndex` 全部反向（破坏后续回退 `maxTurnIndex`/`numTurns` 计算）；回退后 silent 重载走 `mergeMessages(preserveMissing: true)` 保留既有排布，错误顺序不自愈。修复：`revertThread` 在 normalize 前 `[...page.data].reverse()`（游标锚定/limit 200/itemsView full 沿用 round-74）。新增 `src/api/gateway/threads.revertOrder.test.ts` 2 例（mock `./core` 的 `callRpc`：desc 页反转成时间序 + `turnIndex` 从 0 递增；无游标不调 turns/list）。验证：定向 Vitest 97/97（含 `useDesktopState.test.ts` 95）、全量 **580 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` Windows 权限差异，既有环境性失败）、`vue-tsc --noEmit` 干净、`pnpm run build`（vite + tsup）通过。手测文档 `tests/thread-loading-state/rollback-works-on-legacy-and-paginated-threads.md` 新增 round-79 节。性能审计：回退一次性动作中 ≤200 元素 O(n) reverse，无新增请求/缓存（代码路径分析）。提交 `f2cd90a`、`556d302` 已推送 `origin/main`。详见 `rounds/round-79-rollback-revert-order.md`。




## round-80（首条用户消息正文为空导致线程从列表消失，随 v0.1.123 发布）

- **round-80（`b7d88e4` fix + 测试 + 手测文档）**：用户反馈一条线程在 WebUI 里「消失」。排查（从 codex 二进制取证 + 隔离 app-server 回放，详见 `rounds/round-80-attachment-only-first-message-thread-visibility.md`）：①codex `0.153.4` 的 `thread/list` 查询 WHERE 片段含 `AND threads.preview <> ''`，部分索引同谓词，空 preview 是**行级不可见**（列表、搜索、置顶分组全取不到）；②用临时 `CODEX_HOME` 起 app-server 回放三种首消息形态——「附件前言 + 空正文」与「空文本块」落库 `preview`/`title`/`first_user_message` **全为空串**（3 行仅 1 行可见），纯文本对照正常，说明 app-server 是**剥掉前言取正文**；③`thread/metadata/update` 只能改 `gitInfo`/`projectId`、`thread/name/set` 只写 `name`，**没有任何 RPC 能直接写 `preview`**（该结论后来在 round-81 被部分更正：存在 `resume + goal/set` 侧门可救济）。修复：新增 `src/utils/turnPromptText.ts` 的 `resolveTurnPromptText`（正文非空则原样返回，否则回退 **首个附件 label → `[Image]` → `[Attachment]`**，顺序刻意对齐 `useDesktopThreadTitleCache.resolveFallbackThreadTitle`），接入 `startThreadTurn` 与 `buildQueuedTurnParams` 两处组装点（放在调用点而非 `buildTextWithAttachments` 内部，因为只有调用点知道本条还带了哪些图片）。验证：修复后同口径回放 app-server 得 `preview='clip.mp4'`、**2/2 行可见（PASS）**；新增 `src/utils/turnPromptText.test.ts`(4) + `src/api/gateway/threads.blankPrompt.test.ts`(3) 共 7 例全过；全量 Vitest **587 通过 / 2 失败**（既有 Windows 环境性失败）、`vue-tsc` 干净、`vite build` 与 `tsup` 通过。本机存量 30 行 `threads` 全部 preview 非空，故本轮对本机是**预防性**修复。手测文档 `tests/thread-loading-state/attachment-only-first-message-keeps-thread-listable.md`。

## round-81（已消失线程的救济路径，随 v0.1.123 发布）

- **round-81（`450b642` 救济工具 + 结论修正）**：用户指出 round-80 的受害者出现在**线上环境**。为线上线程找救济时，实测**两次推翻** round-80 的收尾结论：①**直写 `state_*.sqlite` 的 `preview` 列无效**——服务运行中改列 `thread/list` 不变（判决实验：改对照组那一行，列表仍返回旧文案），停机改完冷启动该行**仍不可见**，说明 **rollout 才是元数据事实源、sqlite 只是写穿缓存**；②协议里确有一条侧门：`thread/goal/set` 会往 **rollout** 追加 `thread_goal_updated` 事件，而元数据派生在首消息正文为空时回退到 goal objective（正是二进制里 `failed to set empty thread preview from goal objective` 的来处）；③关键前提：必须**先 `thread/resume`**——对 app-server 未加载的线程调 `goal/set` 时 RPC 返回 OK、缓存列也更新，但 rollout 一行都不写、列表不变、重启后又派生回空。可用救济序列 = `thread/resume` → `thread/goal/set`（objective 填推导文案、status=complete）→ `thread/goal/clear`（清掉 goal、preview 保留、`goal/get` 归 null、rollout 只留 `thread_goal_updated`）。新增 `scripts/rescue-empty-preview.mjs`（默认 dry-run；读库只读、不写 sqlite；救济经运行中服务的 `POST /codex-api/rpc` 发出，回环 `Host: 127.0.0.1` 免鉴权；受害者判据用 rollout 里是否存在用户轮次，而非 `has_user_event`——后者在失败的 turn 上不置位会漏判；执行后用真实 `thread/list` 自行复核）。验证：隔离 `CODEX_HOME` 造两条真实受害者（附件前言+空正文 / 空文本块），走**真实 dist-cli 服务**：基线 `thread/list` **0 条 → 救济后 2 条可见**（`clip.mp4` / `[Attachment]`）、**服务重启仍在**；对本机真实 `CODEX_HOME` 冒烟为 0 条候选（符合预期，未写入任何数据）。同批修正 round-80 文档与 `src/utils/turnPromptText.ts` 注释里已被证伪的「只能预防、事后修不回来」结论。**如实记录的代价**：救济会在受害者 rollout 里永久追加一行 goal 事件（rollout 只追加不回退，`goal/clear` 也不移除它），对模型上下文无影响。

## v0.1.123 发布（round-79 + round-80 + round-81，同批）

- **v0.1.123 发布**（版本 bump + 文档）：版本从 `0.1.122` 升至 `0.1.123`，一并收录 round-79（回退后消息列表倒序修复）、round-80（首条用户消息正文为空导致线程从列表消失）、round-81（已消失线程的救济路径）。代码/工具提交 `f2cd90a`、`b7d88e4`、`450b642`（均已推送 `origin/main`）。版本 bump + 文档提交 `4199dd3`；`b2cbb12` 记录提交哈希、`c967957` 记录推送状态（`01c3539..c967957` 已推送 `origin/main`）。git tag `v0.1.123`（annotated，指向 `c967957`）与 GitHub Release 已由维护者创建（非草稿/非预发布，已标记 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.123 。`codex-mobile-re@0.1.123` 已由用户 publish 至 npm 官方源并成为 `latest`（发布时刻 `2026-09-14T12:09:44.833Z`，shasum `0be567b2068556baa644f082270e72501a8d796e`，2026-09-15 复查回填）。发布链路全部闭环。

## round-82（systemd 停止超时修复，随 v0.1.124 发布）

- **round-82 修复（`93d4b69`）**：用户报告 `systemctl restart codexapp.service` **每次**都在 systemd 日志留下失败行，形态两种交替——`Failed with result 'exit-code'`（应用 `status=1`）与 `Failed with result 'timeout'`（systemd SIGKILL）；并已自行完成诊断（systemd `DefaultTimeoutStopSec=5s` → unit `TimeoutStopUSec=5s`，与应用 `shutdown()` 里 5000ms 兜底构成「两个 5 秒定时器赛跑」；service 层加 drop-in `TimeoutStopSec=30` 只能缓解，`ExecStart` 指向包内 `dist-cli/index.js`，故根治必须在 app 层源码）。本轮用**真实 Node 22.22.2 + 真实 `ws`** 探测收窄根因，并**否定了「补 `closeIdleConnections()`/`closeAllConnections()` 即可」的思路**：http keep-alive 连接不持有 `server.close()`（回调 1ms）；**websocket 才是持有者**——Node 在 `upgrade` 后把 socket 移出 http server 的 tracked connections，两个 `close*Connections()` 都遍历不到它（而 `server._connections` 仍计 1），因此 `server.close()` 永不回调；只有显式 `terminate()` 客户端能释放（2ms）。SSE 等活跃 HTTP 长响应才需要 `closeAllConnections()`（1s 宽限后，实测约 1.01s）。修复 2 个源文件：`src/server/httpServer.ts` 新增导出 `shutdownWebSocketServer(wss)`（terminate 全部 clients + `wss.close()`），并把 `ServerInstance.attachWebSocket` 签名改为返回清理函数；`src/cli/index.ts` 的 `shutdown()` 改为先终止 ws 客户端 → `server.close()` → `closeIdleConnections()` → 1s 后 `closeAllConnections()`，并把 5 秒兜底定时器**提到函数最前注册**（清理步骤抛错也不至于挂到 systemd 停超时）、`closeIdleConnections` 加 `typeof === 'function'` 防护（`engines` 声明 `>=18`，而该 API 是 Node 18.2 引入，不加防护会把 5 秒兜底退化成 30 秒挂死）。新增契约单测 `src/server/httpServer.websocketShutdown.test.ts`（2/2，含「有 ws 客户端时 `server.close()` 不回调」基线断言）。验证：全量 Vitest **589 通过 / 2 失败**（基线 587/2，+2 为本轮新增；2 例为既有 `codexAppServerBridge.archive.test.ts` Windows 环境性失败）、`vue-tsc --noEmit` 干净、tsup CLI 构建通过、真实 dist-cli 启动 + `GET /` 200 + `/codex-api/ws` 握手通过、产物 `dist-cli/index.js` 含新逻辑。**未验证**：本机 Windows 无法投递真实 SIGTERM（`child.kill('SIGTERM')` 走 TerminateProcess、JS handler 不执行），信号路径与 `systemctl restart` 日志消除待 Linux 侧复核。
- **round-82 文档（`1fe51e3`）**：新增 `codex-mobile-handover/rounds/round-82-systemd-stop-websocket-shutdown.md`、手测 `tests/cli-network-platform/systemd-stop-finishes-inside-timeout.md`，同步总入口快照·索引·未完成事项·落款，以及 `tests.md` 与 `tests/cli-network-platform/index.md` 登记。

## v0.1.124 发布（round-82）

- **v0.1.124 发布**（版本 bump + 文档）：版本从 `0.1.123` 升至 `0.1.124`，收录 round-82（systemd 停止超时修复）。代码/测试提交 `93d4b69`（已推送 `origin/main`）；版本 bump + 文档提交 `1fe51e3`（已推送 `origin/main`）。git tag `v0.1.124`（annotated，指向 `1fe51e3`）与 GitHub Release 已由维护者创建（非草稿/非预发布，已标记 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.124 。`codex-mobile-re@0.1.124` 最终**未 publish 至 npm**（2026-09-15 复查 `dist-tags.latest` 仍为 `0.1.123`；2026-09-16 复查确认 `GET /codex-mobile-re/0.1.124` 始终 404 —— 该版本号在 npm 上留空，内容已并入 `0.1.125`）。

## v0.1.125 发布（round-83 ~ round-86）

版本从 `0.1.124` 升至 **`0.1.125`**，收录 round-83 ~ round-86 与「切模型清派生字段」一处小修复。本批代码/测试/文档提交共 9 个（推送范围 `7348f53..3534018`），加推送状态文档提交 `46a5e0e`，随后是版本 bump + 文档提交 `f2678df`（已推送 `origin/main`）。git tag `v0.1.125`（annotated，tag 对象 `6c18f64`，指向 `f2678df`）与 GitHub Release 已由维护者创建（非草稿/非预发布，已标记 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.125 。`codex-mobile-re@0.1.125` 已由用户 publish 至 npm 官方源。

> 版本序列说明：上一版 `v0.1.124`（round-82）只创建了 tag 与 GitHub Release，**从未 publish 至 npm**（复查 registry 时 npm `latest` 仍是 `0.1.123`，`GET /codex-mobile-re/0.1.124` 返回 404）。为避免版本断号影响使用者，`0.1.125` 一并包含 round-82 的内容，`0.1.124` 在 npm 上留空。

**版本 bump + 文档提交 `f2678df`**（已推送 `origin/main`）：`package.json` `0.1.124` → `0.1.125`；同步总入口交接文档（快照「Git 分支」「Dev 状态」「npm `latest`」，新增「最近发布（v0.1.125）」行并把原 v0.1.124 行改标注为未 publish 至 npm）、轮次索引四行（round-83 ~ round-86）加「v0.1.125 发布」前缀、未完成事项四条口径由「已推送、未发版」改为「随 v0.1.125 发布」、落款，以及本小节。round-82 ~ round-86 的 round 文档与 `sections/auto-compact-plan.md` 同步补了「已随 v0.1.125 发布」的回填。

**推送状态**：版本 bump 提交 `f2678df`、tag `v0.1.125` 与本次回填提交均已推送 `origin/main`（远端 `refs/tags/v0.1.125` → tag 对象 `6c18f64` → 指向 `f2678df`）。Release 正文由 `.git/release-notes-v0.1.125.md` 提供、创建后已删除。

**发布闭环**：用户于 2026-09-16 执行 `npm publish`（`prepublishOnly` 先跑 `pnpm run build`，工作区 `dist/` 与 `dist-cli/` 于 14:43 重建），registry 记录发布时刻 `2026-09-16T06:46:49.279Z`，`dist-tags.latest` 由 `0.1.123` 切换为 **`0.1.125`**（版本总数 35 → 36）。维护者随后下载 tarball 复核：1,468,953 字节、47 个文件（`dist/` 36 + `dist-cli/` 2 + `scripts/` 3 + `README.md`/`LICENSE`/…）、sha1 `558cfcc2d6edab8428a67e7e7540a9f3d16f426d` 与 integrity `sha512-wY1bCTtc93GfmZHLPwbAe6ahVI103qjk9ELIfU/b7MzR82jzpsJiEatzC/RES3hV/5mVx8ybXG2V4niK9paO3g==` 与 registry 逐项一致，包内 `package.json` 版本为 `0.1.125`、`bin` 指向 `dist-cli/index.js`。

> **操作提示（本轮踩过）**：`npm publish` 的构建阶段结束后，**上传与 registry 入库还有数分钟延迟**——本轮镜像构建完成于 14:43:18，而 registry 直到 **14:46:49** 才记录该版本。因此发布后立刻查 `dist-tags.latest` 会看到旧值（甚至 `GET /codex-mobile-re/0.1.125` 返回 404），**不要据此判定发布失败**；等待数分钟再复查即可。另记两点本机环境特征：`pnpm publish` 用的是 pnpm 自己的凭据库（`%LOCALAPPDATA%\pnpm\config\auth.ini`，token 有效、`whoami` = `lgao7779`），而 `~/.npmrc` 里另有一个**已失效**的 `_authToken`（直连 `GET /-/whoami` 返回 401）——经 `pnpm` 发布不受影响，但若改用 `npm publish` 会因它报 401，宜清理掉那条陈旧凭据。

- **round-83（`2aa962a`，单提交含代码+测试+文档）**：客户端自动压缩在长 turn 下不触发——阈值此前只被「发送 + 空闲」消费，turn 内按设计跳过、turn 结束又只补发暂存不做压缩，改为在 turn 转空闲那一刻按同一阈值预检（`shouldAutoCompactOnTurnEnd` 接入 `setThreadInProgress(false)`）。刻意不挂在 `thread/tokenUsage/updated` 上（避免「压缩→用量事件→再压缩」循环）。按用户决定阈值维持 **10%**、不 bump 版本。新增单测 2 例（含 `git stash` 判别力 A/B）、全量 **591 通过 / 2 失败**。
- **测试文档清理（`365d41d`）**：退役 stream-first 水合手测、修正漂移的 harness 登记（`tests.md`、`tests/thread-loading-state/index.md` 等）。
- **auto-compact 派生字段清理（`5e98cf6`）**：切模型失效上下文窗口时同步清派生字段（`remainingContextPercent` 是发送前预检的唯一输入），否则预检读到陈旧百分比。与 round-83 改同一对文件但 hunk 相隔较远，rebase 零冲突，两者互补。
- **round-84（`1e6045d` 代码+测试+脚本 / `0a319e0` 文档）**：打开会话去掉全量历史水合。`thread/resume` 原让 app-server 全量水合 16 轮（12.12MB / 1.9s）后桥才 slice 到 10 轮，成本白付；改为 `{excludeTurns, initialTurnsPage{limit:10, desc, itemsView:'full'}}`，桥把返回页反转成升序提升为 `thread.turns`、补 `threadTurnStartIndex`、丢弃 `initialTurnsPage`，前端与既有管道零改动；旧 app-server 忽略该字段时按原请求重放兜底。新增单测 23 例、`scripts/probe-resume-turn-page.cjs` 7/7 PASS、同桥 A/B **2.0–3.1×** 且输出逐字一致、全量 **615 通过 / 2 失败**。
- **round-85（`d8d31bb` 代码+测试+脚本 / `33295ce` 文档）**：会话日志时序恢复的适用范围。管道最大一段是命令合并（**434–681ms**），而 CLI 已把命令从 `function_call exec_command` 换成 `custom_tool_call exec`，对当前形状日志**识别 0 行**、纯白付；更糟的是没有命令槽时它仍把 user/agent 提前、命令追加轮末，**抹掉 app-server 已正确的交错**。改为「形状闸门（无 `commandExecution`/`fileChange` 槽即原样返回、全无改动返回入参同一引用）+ 版本判据缓存（`mergeSessionCommandsIntoTurnsFromPath`：判据为假只付一次 stat、不读文件）」。同环境 `git stash` A/B 热态中位 **1071→610ms（−43%）**、条目顺序与「跳过合并」基线 10/10 逐字一致、旧形状两会话仍 58/58 与 51/51、新增 `scripts/probe-session-log-recovery.cjs` 固化判据、全量 **623 通过 / 2 失败**。
- **round-86（`8db72cc` 代码+测试+脚本 / `3534018` 文档）**：上翻更早轮次改为游标分页（去掉最后一处全量水合）。`readThreadForTurnPage` 原发 `thread/read {includeTurns:true}` 再内存 slice，实测 **1295ms / 12.12MB**（`includeTurns:false` 仅 2ms / 0.00MB）；**并纠正 round-84/85「顶层 `turnsBackwardsCursor` 是该用的游标」这一错误措辞**（它 `includeAnchor:true`、用它只会重发自己那一页；真正往更老走的是 `initialTurnsPage.nextCursor`；游标是不透明 JSON、turn id 不是游标 → 只能逐页串链）。新增 `src/server/bridge/threadTurnPage.ts`（升序 id 列 + 游标链 + 页长/页首页尾校验，任何意外返回 null 回落原全量水合且回落路径逐字相同）、`SHARED_BRIDGE_VERSION` v3→v4。新增单测 24 例、`scripts/probe-turn-page.cjs` 11/11 PASS、`git stash` 端到端 A/B 四锚点响应逐字相同（含字节数）、**真实 Linux（WSL2）全量 649 通过 / 0 失败**（关闭既有的 2 例 Windows 环境性失败注记）。

## round-87（模型切换对上下文窗口的语义收口）

- **round-87（`17e23fc` 代码+测试 / `a56dbdc` 文档；均已推送 `origin/main`）**：本轮由用户两问驱动——先「模型切换，上下文会怎么样？」，再「当前项目对于模型切换，对上下文窗口做了哪些操作？会重置还是继承？」，最后口径「处理未修的」。**结论先行（逐行代码确认）**：model 是**按轮参数**（`startThreadTurn` 把 `params.model` 塞进 `turn/start`，`threadId` 不变 → 同线程同历史，**不 fork / 不 rollback / 不 resume**），对话内容**完全继承**、`total`/`last` 真实计数保留；**只有 3 个派生窗口字段被置 `null`**（`modelContextWindow` / `remainingContextTokens` / `remainingContextPercent`，`invalidateThreadContextWindow`；唯一手动入口是 `App.vue` 的 `onSelectModel` 下拉切换且要求 `previous !== modelId`，`modelContextWindow` 已是 null 时早退）。消费侧两处进入「待定」——指示器**整体隐藏**（`buildContextUsageView` 在窗口非数字时返回 null，模板 `v-if`，不是旧值也不是 0%）、压缩预检**暂停一轮**（`shouldAutoCompactOnTurnEnd` / `maybeStashForAutoCompact` 以 `remainingContextPercent` 为唯一输入，为 null 即 `return false`）；新模型首个 `thread/tokenUsage/updated` 到达后经 `normalizeThreadTokenUsage` 按新窗口重算恢复，刷新不会复活旧窗口（置空状态本身持久化）。用量只有通知推送 + 启动 localStorage 恢复，**没有拉取式刷新**。
  **修① 回退换模型不失效窗口**：服务端回报模型不受支持自动换到回退模型，改的是同一个「线程模型」字段却从不失效窗口；危害有方向（回退模型窗口通常更小，界面仍显示旧大窗口 → 预检判「还有余量」跳过压缩，把请求顶到真实上限）。改法：`DesktopModelPreferencesDeps` 新增 `onThreadModelChanged?: (threadId) => void`，`applyFallbackModelSelection` 写完模型后回调，`useDesktopState` 构造该 composable 时接到 `invalidateThreadContextWindow`——四处回退调用点（错误通知 / 建线程失败 / `turn/start` 同步失败的内联分支 / 回退补发）**一次覆盖**。**否掉两个备选**：下沉进底层写函数 `setThreadModelId`（该函数同时服务水合——resume 初始化与线程详情水合都往里写服务端 model，在那里失效会把本地恢复出来的**有效**窗口清成待定，而写函数内部**无法区分**「用户改变」与「用服务端值初始化」）；每个调用点各补一遍（4 处重复，且下一条新回退路径照样会漏，正是本轮要消灭的形态）。
  **修② 线程详情水合无条件覆盖用户刚选的模型**：`useDesktopMessageHistoryLoading` 加载线程时**无条件**用服务端 `detail.model` 覆盖——「在本线程切了模型但还没发送就刷新/重开线程」会被改回服务端旧值，连同一并失效的窗口也白失效；与 round-72 在发送路径立下的判据自相矛盾。改法：新增**窄判据** `hasThreadOwnModelSelection`（**只认线程自身上下文键**，不含新线程兜底读）作为水合闸门，无显式选择时仍按服务端初始化。**必须新加判据而不能复用 `hasThreadModelSelection` 的原因**：后者经 `readSelectedModel` 会**兜底读**裸 `__new-thread__` 键，该键一旦有值（早期版本写入的数据）就会把新线程默认算成**每个**线程的选择、挡住本线程模型本应发生的初始化；顺带确认易误判点——新线程默认模型通常落在 **provider 作用域键** `__new-thread-provider__::<provider>`（`normalizeProviderContextId('')` → `codex`），故两判据在常规数据下结果相同，用错只会在地摊数据上悄悄坏掉。
  **调研结论（本轮未改代码）**：`retryPendingTurnWithFallback` 的 re-resume 分支**不可达**——进入需同时满足 `pending.fallbackRetried === false` 与 `resumedThreadById[thread] !== true`；后者只可能来自 resume 抛错，而 resume 抛错会让 `sendMessageToSelectedThread` 的 catch 执行 `setThreadInProgress(thread, false)`，该函数在 `true→false` 跃迁时经 `clearCompletedTurnLiveState` → `clearPendingTurnRequest` 清掉暂存请求，回退补发随即 `!pending` 早退；`turn/start`「模型不受支持」失败则在内联 catch 里把暂存请求标成 `fallbackRetried: true`，同样早退。临时探针（已删）实测：投递「模型不受支持」错误通知后 `error` 已置位但 `rollbackThread` 0 次、`resumeThread` 仍 1 次、`startThreadTurn` 0 次——回退补发确实没执行；对照把线程详情报成「进行中」使暂存请求不被 turn 收口清掉，错误通知路径**可以**走到 `rollbackThread` + 回退模型生效，即**函数本身可达、只有那个 re-resume 分支不可达**。故本轮不对该分支加守卫（改了无实际作用，且写不出修复前会失败的测试）；将来恢复「客户端自动回退」前需先决策 `setThreadInProgress(false)` 收口是否还应清掉暂存请求。
  验证：`vue-tsc --noEmit` 干净；全量 Vitest **658 例：656 通过 / 2 失败**（2 例为既知 Windows 平台差异 `codexAppServerBridge.archive.test.ts` 的 symlink realpath 与 `mode 0o600` vs `0o666`，与本轮无关），本轮新增单测 **9 例**（`useDesktopModelPreferences.test.ts` +5：窄判据 3 + 回退出口回调 2；`useDesktopState.test.ts` +4：两条回退路径的窗口失效 2 + 水合守卫 2）。手测见 `tests/providers-models/model-switch-resets-context-and-appends-divider.md` 新增的「Round-87」小节。详见 `rounds/round-87-model-switch-context-window-scope.md`。

## round-88（侧边栏线程切换卡顿：分支列表渲染窗口化）

- **round-88（`da887f4` 代码+脚本+测试 / 文档提交紧随其后；**已推送 `origin/main`**）**：由用户口径「在左侧边栏中进行线程切换的时候，页面会卡顿」驱动，先测后改，全部在生产构建（`vite build` + `dist-cli` 起在非 4173 端口）上用 headless 真实浏览器测量。**先否定「稳态切换慢」这个前提**：同一行反复点、内容已渲染过时主线程阻塞 **0–9ms、无长任务**；卡顿集中在「本会话**首次**打开某条线程」（75–164ms）与首次打开 **~2.5s 后**的一次追加冻结。
  **根因（DOM 记账 + Chrome timeline 实测）**：右侧 Git 面板的分支选择器是「224px 高的可滚动 listbox + 搜索框」，而 `filteredBranches` 在搜索为空时**返回全部分支**、模板 `v-for` 全渲染——本工作区 `git/branches` 响应体 **624 101 字节 / `data.options` 4 608 项**（含大量 `origin/bot/*`），渲染出 **4 608 个 `<li>` / 23 040 节点 / 205 818 字符**（同一面板的提交列表只有 50 项）；`branches` RPC 返回后**一次 mutation 批次插入 +4 614 个节点**（文档 538 → **23 589**），落在点击后 +2.5~+2.8s，对应长任务 **66–128ms**（高负载时 **358ms**）。**危害不止那一次插入**：文档布局对象从 669 涨到 **32 987**，于是会话底部锁定每次读 `scrollHeight`（强制同步布局）都要付 **`Layout dirty=32295 total=32987 → 81.1ms`**——单对象 **0.0025ms 完全正常**，**没有慢元素，是树被撑大 50 倍**。这回收了一处旧误判：开发态 CPU 采样榜首的 `scrollToBottom`（压缩名 `Ln` = `isAtBottom`，self time 116–130ms）**不是它自己慢**，而是它的 `scrollHeight` 读在为 3.2 万对象的树做布局。
  **修①**（`src/components/content/RightGitPanel.vue`）：新增 `BRANCH_PAGE_SIZE = 100` / `visibleBranchCount` / `visibleBranches = filteredBranches.slice(0, count)`，`<ul>` 加 `@scroll="onBranchListScroll"`（距底 24px 内按 100 增长，越界即停），`watch(filteredBranches)` 在新查询或新列表时重置；空态仍判 `filteredBranches.length`。**否掉的备选**：`content-visibility: auto` / `contain-intrinsic-size`（实测**无效**——跳过屏外布局但**拦不住 Vue 创建节点**，`ul` 子项仍 4 608，这解释了「CSS 层怎么调都不动」）、硬截断+提示行（静默丢掉第 200 条之后的分支）、真虚拟化（对 4 608 项 picker 属过度实现）。
  **修②**：删掉 `RightGitPanel` `onMounted` 的 `nextTick(() => searchInputRef.value?.focus())`（连带移除已无用的 `nextTick` 导入）——该面板是 `defineAsyncComponent`、**首次选中线程才挂载**，这次聚焦会把用户按键引到**分支搜索框**而不是消息输入框（切 Files/Git 往复还会反复触发）；实测 `focus()` 只 4–6.5ms，**不是卡顿主因但是确凿缺陷**。
  **修③（副产物，证据强度如实标注）**：`ThreadConversation.scrollToBottom` 加「已在底部则早退」守卫（把底部锁定每帧的「读+写+`scrollIntoView`」降为只读，加守卫后 `scrollToBottom` 从 CPU 自耗时榜消失；但**改动前后累计阻塞对比落在噪声内**，真正价值是与修①叠加）、`App.updateComposerShellWidth` 合并同一元素的两次 `getComputedStyle`。
  **已逐一实测否掉**：文本整形/行盒构造（合成 240 段 CJK 首次布局 **8.8ms**、同内容第二次 0.9ms、拉丁 0.1ms、真实会话文本重复 15 份 1.7ms）、`overflow-wrap: anywhere`（换 `break-word` 反而 162→217ms）、`contain: layout`（162→204ms）、`overflow-anchor: none`（104→101ms，噪声内）、右面板 CSS 首次注入 19KB（隐藏整个右面板后整文档样式重算成本不变）、`focus()`（4–6.5ms）、区域隔离（隐藏右面板 101ms vs 基线 104ms；隐藏侧栏无变化；只有隐藏会话区把总布局 201.7→114.7ms）。**顺带更正**：早前把一次 116ms CPU 自耗时记在 `focus` 名下是采样归因错误，真正的主人是 `isAtBottom`。
  **实测对照（生产构建，同机同数据）**：分支行数 **4 608→100**、分支节点 **23 040→500**、文档节点 **23 589→1 049–1 349**、插入批次 **+4 614 节点（66–128ms 长任务）→ +106 节点（无长任务）**、挂载后全文档布局 **81.1–93ms → 4.9ms**、`+2.5s` 冻结消失。**验证**：`vue-tsc --noEmit` 干净、`vite build` 通过（18.86s）、全量 Vitest **658 例 656 通过 / 2 失败**（与 round-87 基线逐字相同，2 例为既知 Windows 平台差异 `codexAppServerBridge.archive.test.ts`）、新增可复跑检查 `scripts/check-branch-list-budget.cjs` **5/5 通过**（断言渲染行数 ≤100 / 文档节点 ≤4000 / 滚动只按页增长 / 搜索后回到预算内，改动回退即失败）。**工具**：`scripts/profile-thread-switch.cjs` 由「只测顶部 2 条线程」扩展为多能力探针（`.thread-row` 逐行遍历、`longtask`/`layout-shift`/`rAF` 帧间隔、逐次 CDP CPU 采样、可选逐次 Chrome timeline（`layoutPasses`/`biggestEvents`/`topFunctionCalls`）、`PROFILE_HIDE_CSS` 区域隔离、`PROFILE_WARMUP` 预热排除冷启动、`tmp/` 下另有把 trace 对齐到 `performance.mark('CLICK')` 的统一时间轴与 MutationObserver 记账探针，未入库）。
  **残留（未修，需产品决策）**：首次点击线程路径上仍有约 **170–200ms** 阻塞（`EventDispatch ~72ms` + 一次 `FunctionCall/Layout ~91ms`，`dirty=411 total=669`，单对象 ~0.22ms，比 0.0025ms 高约 88 倍），区域隔离显示会话区约贡献 47ms、其余（输入区/头部）约 34ms；上述候选已逐一排除，继续压缩需要结构性改动（把会话渲染与输入区测量挪出点击任务，或分帧）——**已由 [round-89](#round-89切换时点击反馈被长任务吞掉先画高亮再切路由) 定性为「绘制被推迟而非渲染慢」并修掉**（点击只落过渡高亮 + 让出一帧再切路由；输入区测量改到 `ResizeObserver` 回调。交错 A/B 4 轮：高亮中位 **102→6ms**、冻结窗口 **112→21ms**、内容绘制无代价）。**未测**：非 headless 下的合成帧率、真实多线程工作区的 per-thread 冷开成本（本机 `CODEX_HOME` 只有 1 条真实线程，「每条线程各付一次」为机制推断）。手测见 `tests/git-worktrees-rollback/round-88-branch-list-render-window.md`。详见 `rounds/round-88-sidebar-switch-jank.md`。

## round-89（切换时点击反馈被长任务吞掉：先画高亮再切路由）

- **round-89（`c8a5e14` 代码+脚本 / 文档提交紧随其后；**已推送 `origin/main`**）**：用户口径「解决切换的时候消息列表会卡的问题吗？卡了后左侧的线程列表点击切换都没有选中状态了」。round-88 把「稳态切换 0–9ms」与「首点 170–200ms」分开之后留了个尾巴，本轮由用户补充的后半句（**点击连选中态都不出现**）切入，把尾巴修掉并给机制定性。
  **现象量化（生产构建 + 真实页面）**：CDP `Profiler` 采样 + `Tracing` 主线程嵌套树（按 pid/tid 过滤、按 ts/dur 包含关系缩进）显示，一次点击是 `EventDispatch type=click` 内的 `FunctionCall（点击监听器）` **1.2ms**，随后 `UpdateLayoutTree` / `Layout dirty=67 total=256 → 38.5ms`；**高亮进 DOM 的时刻与「点击任务结束」重合 → 59–127ms（中位 102ms）**。`requestAnimationFrame` 帧间隔之和（「冻结窗口」= 点击后连续帧间隔之和，直到出现一帧 <40ms）**76–143ms（中位 112ms）**——这段时间浏览器**一帧都没画**，高亮即使已经写进 DOM 也看不见。
  **根因**：不是渲染慢，是**绘制被推迟**——点击监听器同步走完 `router.push` → 路由换视图 → `selectThread` → 会话内容水合与首帧布局（`Layout dirty=411 total=644`），全部落在同一个任务 + 微任务排空内，浏览器要等它跑完才有绘制机会。这也解释了 round-88 为什么把候选一个个排除掉仍压不下去：被排除的每一项都不是「这段时间为什么长」的答案。
  **修①**（`src/App.vue` `onSelectThread`，主修）：点击只落**过渡高亮**、让出一帧、再切路由。新增 `optimisticSelectedThreadId` + 计算属性 `sidebarSelectedThreadId`（`optimistic || selectedThreadId`，侧栏 `:selected-thread-id` 改绑后者）；`yieldToNextPaint()` = `rAF` + `setTimeout(0)`（**纯 `nextTick` 不够**——微任务仍在绘制前跑完；**纯 `rAF` 也不够**——rAF 回调就在绘制前执行；后台标签页不触发 rAF，故加 80ms 定时器兜底避免导航被无限推迟）；`watch(selectedThreadId)` 清空过渡值。
  **关键设计约束**：**刻意不写 `selectedThreadId`**，让路由落地后 `syncThreadSelectionWithRoute` 的判据 `selectedThreadId.value !== threadId` 仍然成立，从而保留完整的 `selectThread`（含 `refreshModelPreferences({includeProviderModels:true})` 与 `refreshSkills()`）——绕开它就会静默丢掉模型偏好与技能刷新。连点用导航令牌 `pendingThreadNavigation`（只有最后一次点击的导航会发出）；**「点回当前这条」的早退分支改为撤销尚未落地的导航并清掉过渡高亮**——原实现会把该次点击整口吃掉，「先点 A 再点回 B」停在 A（基线构建上同样失败，属既有缺陷，由本轮新检查抓到）。
  **修②**（同文件）：`watch(composerQueueRef)` 里原来同步调用 `updateComposerShellWidth()`，正好压在路由切换那次 patch 上（新容器刚建、树还是脏的）→ 一次 `getComputedStyle` 强制出 **89ms** 样式+布局；改为有 `ResizeObserver` 时只 `observe` 后 `return`，测量交给 RO 回调（帧内布局完成后才触发，那时再读不强制布局），无 RO 才退化成直接测量。实测 `contentRect.width = 871px` 与 `clientWidth − padding = 919 − 48` 一致；`composerQueueRef` 只绑在线程路由那处容器（首页同名容器无 ref、本来就不测量），无行为变化。
  **明确不做**：`isAtBottom` 的强制布局（自耗时 102–119ms）未动——那一次布局无论如何都要发生（新插入的会话总要有一次首帧布局），守卫只能避免重复读；要再压得把「是否在底部」改成不读几何（如 `IntersectionObserver` 维护），属较大改动。
  **已实测否掉（续 round-88 的清单）**：字体/文本整形（sans / mono / 雅黑 × CJK / ASCII 各 40 段首次布局 **1–11ms**，热 0.1ms）、会话子树自身的布局成本（把已渲染的 `.conversation-list`（244 节点，含 1 table / 41 inline-code / 48 `pre-wrap`）**拆下来再插回**并强制布局 = **2.4–4.7ms**、克隆新对象插入 2.4ms，而真实首点是 185ms）、`localStorage` 同步 I/O（`Storage.prototype` 换内存实现无改善）、滚动条/视口宽度（强制 `html{overflow-y:scroll}` 无改善）。另注意 `(program)` 只 20–24ms——**不是原生卡死，是在树还脏的时候做测量**。
  **测量方法论（本轮最该记住的一条）**：跨构建的**顺序 A/B 在这台机器上不可信**（同一变体重复得到 59ms 与 127ms，2 倍级漂移；一次顺序 A/B 还报出「内容晚 130ms」的假象）。最终采信**交错 A/B**：探针自己在两次运行之间切换 `dist` 目录、两变体轮流执行、偶数轮反向顺序以抵消顺序偏置（`PROBE_REPS=4`）。环境事实：`(idle)` 占 1565/1976ms、本机常驻约 454 个进程（24×Trae CN / 19×msedge / 21×node），所有绝对耗时都被负载放大。
  **实测对照（交错 A/B，4 轮）**：点击→高亮画出 基线 59/102/127/86ms（中位 **102ms**）→ 修复 5.4/6.2/2.9/9.3ms（中位 **6ms**）；点击后冻结窗口 基线 76/112/143/94ms（中位 **112ms**）→ 修复 21/17/22/16ms（中位 **21ms**，≈ 一个 60Hz 帧）；点击→内容画出 基线 86/159/188/127ms → 修复 201/112/148/186ms（**区间大幅重叠 → 无可测的内容延迟代价**）。**验证**：新增可复跑检查 `scripts/check-thread-switch-feedback.cjs`（**11 项**；基线构建 **3 项失败**：`first-open freeze 152ms` / `switch freeze 62ms` / 连点停在 A；修复构建 **11/11 通过**；dev 模式下自动跳过计时断言，因 Vite 按需编译污染计时）、`vue-tsc --noEmit` 干净（`TSC_EXIT=0`）、`vite build` 通过、全量 Vitest **658 例 656 通过 / 2 失败**（与 round-88 逐字相同）、round-88 的 `scripts/check-branch-list-budget.cjs` **5/5 仍通过**。
  **残留（未修，如实记录）**：**会话内容首帧布局仍在**（`Layout dirty=411 total=644 → 148ms`），只是现在排在「高亮已绘制」之后——切换的**内容**仍要约 110–200ms 才出现，用户看到的是「立刻选中 + Loading messages…」、期间帧不再冻结；点击任务里约 **36ms「无任何 trace 事件」的空隙**与「**644 对象花 148ms**」（0.23ms/对象，比合成对照组高一个数量级）的机制**未定论**（已排除内容量/字体/整形/子树自身布局成本；最可能是本机负载放大）。**未测**：非 headless 真实浏览器、更重会话（本机 `CODEX_HOME` 只有 1 条真实线程）、合成帧率、非 Windows 平台。手测见 `tests/thread-loading-state/round-89-optimistic-sidebar-highlight.md`。详见 `rounds/round-89-switch-feedback-masked-by-long-task.md`。

- **round-90（`03da220` 代码+脚本；文档提交紧随其后；**已推送 `origin/main`**）**：用户对 UI 方案的选择——「先只做 token 化的部分、排版等看过 P1 主界面再一起做」。本轮据此把 **P0 的 token 化真正做完**，一行排版未动。
  **发现一（漏做 + 闸门失明）**：上一轮报的「token 层 + 深色迁移已完成」只覆盖 `src/style.css`。扫描全部 `.vue` 的 `<style>` 块得 **1213 处裸 zinc/slate 类（模板/脚本里 0 处）**，按层切开是 **暗色覆盖层 108 处 / 亮色基线 1105 处**（108 处分布：`DirectoryHub` 34、`SettingsDialog` 21、`DirectorySkillsTab` 15、`App.vue` 13、`ThreadConversation` 12、`ThreadTurn` 8、`ThreadComposer` 3、`SettingsAccountsPanel` 2）；而 `scripts/check-ui-contract.cjs` 同样只读 `src/style.css`，却断言「深色覆盖层已无裸色板」——**断言的覆盖面小于措辞**，所以「检查全绿」与「还有 108 处裸类」能同时成立。另漏 2 处 `ring-offset-*`（旧检查的属性表里没有它）。
  **发现二（架构澄清）**：这套 UI **默认是亮色**，暗色是 `src/style.css` 里 841 个 `:root.dark` 覆盖层堆出来的。用像素探针（`tmp/probe-png-pixels.cjs`，解码 PNG 后读点；肉眼第一眼把两张截图都看成亮色，故不采信肉眼）裁决：暗色侧栏 `rgb(24,24,27)` / 正文 `rgb(9,9,11)`，亮色侧栏 `rgb(241,245,249)`＝**slate-100** / 正文白；源码侧对应 `.desktop-layout { @apply bg-slate-100 text-slate-900 }` 与 `:root.dark .desktop-layout { @apply bg-s1 text-ink-1 }`。**推论：token 化天然分两半，且难度不同**——暗色半边 token 取值＝原 zinc 值，纯机械、可证等值；亮色半边取值即设计。
  **修复①（108 处 + 2 处）**：一次性脚本 `tmp/migrate-vue-dark-to-tokens.cjs` 用**与上次完全同一张 MAP** 替换，20 个类名 100% 命中、零未映射；`ring-offset-zinc-900/950 → ring-offset-s1/s0`。亮色基线一处未动（`style.css` 7 处 + 组件 1105 处 = 1112，与迁移前一致）。
  **修复②（必要前置，构建期报错驱动）**：迁完构建直接失败——`Cannot apply unknown utility class `border-line-2``。根因是 54 个组件 `<style>` 写的是 `@reference "tailwindcss";`，它只把**框架默认主题**带进 `@apply` 解析范围、**看不见项目在 `src/style.css` 里 `@theme` 定义的那套 token**（所以 `@apply bg-slate-100` 能过、`@apply bg-s1` 不能）。按 Tailwind v4 推荐做法把 54 处改指项目样式表（`@reference "./style.css"` / `"../../style.css"`，`@reference` 只读主题不输出 CSS）。**不修它，P1 在组件样式里用 token 同样会炸。**
  **修复③（闸门修正）**：`check-ui-contract.cjs` 改为扫描**全部 CSS 单元**（`style.css` + 每个 `.vue` 的每个 `<style>`，本轮 **56 个**），属性表补 `ring-offset-*`，新增「组件 `@reference` 必须指向项目样式表」断言，判块由逐行正则改为**逐字符栈式扫描**——逐行正则在 `}` 与 `{` 不同行时会把上一行的 `}` 记进下一行，暗色状态刚压入就被弹出（第一版分类器据此报出 `dark=0 / light=2389` 的假干净，真值是 108/1105；改对后总数 1213 与独立统计逐字吻合）。共 **18 项**。
  **验证**：真实页面 **37 个元素 / 222 项计算属性逐字相同**（`fontFamily`/`fontSize`/`background`/`color`/`border`/`radius` 全比，基线含暗色 6 页 + 亮色 1 页，故「亮色没被动」也被覆盖），不是「差异在容差内」；契约 **18/18**、主题 **15/15**、字体 **13/13**、`vue-tsc` 干净、`vite build` 通过、全量 Vitest **658 例 656 通过 / 2 失败**（既有 Windows 平台差异，与 round-89 逐字相同）。
  **性能审计**：运行时行为零改动（无新增/删除请求、缓存、监听器、阻塞路径），唯一可测代价是 CSS 字节，故做 **HEAD ↔ 当前 构建 A/B**（备份 `src/` → `git checkout HEAD -- src` 构建 → 备份恢复重建，两次产物总量逐字一致）：**763,965 → 759,527 B（−4,438，−0.58%）**，变小是预期的（108 处 zinc 工具类失去引用被裁掉，而 token 工具类本已被 `style.css` 生成）。**未测**：非 Windows 字体回退与高 DPI 发丝线观感。
  **明确不做（连同依据）**：排版阶梯（用户决定推迟到看过 P1 主界面；`text-xs` 215 / `text-sm` 162 / `text-[Npx]` 147 一处未动）；**亮色基线 token 化**（1112 处）——前置是**定下亮色 token 取值**，因为已提交的亮色值（中性 `#f1f1f4`/`#121215`）与现状实际渲染（冷调 `slate-100 #f1f5f9`/`slate-900 #0f172a`）**不是同一套**，直接替换等于顺手改掉默认主题色调；且审计已把「侧栏 slate、其余 zinc」列为确证缺陷，故正确顺序是 P1 定值后再统一替换；状态色 250 处（P1，要按「颜色只表示状态」重新归类）。
  **相位变更**：亮色 `body`/`theme-color` 提前到 P0（确证缺陷）；「组件暗色覆盖层 token 化」与「`@reference` 改指向」补入 P0；「亮色基线 token 化」明确为 **P2 且需 P1 先定值**；排版阶梯移出 P0。手测见 `tests/theme-layout-terminal/round-90-dark-token-layer-completion.md`。详见 `rounds/round-90-token-layer-completion.md`。


## v0.1.126 发布（round-87 ~ round-100）

版本从 `0.1.125` 升至 **`0.1.126`**，收录 round-87 ~ round-100 共 36 个提交（推送范围 `fdb96a6..768b3a5f`）——UI 改造方案「控制台 / Instrument Panel」从立项（round-89 方案文档 d8698504）到 P0~P3 四期全部落地与遗留清零的完整内容，外加线程切换/会话水合性能修复与模型切换上下文窗口语义收口。

**内容总览**：①**token 层与主题**（round-90~98）——`@theme` 4 表面 + 4 墨色 + 5 状态 token，亮侧裸色板 1112→0、暗色 841 规则覆盖层退役、文字 ≥4.5:1、全局 `:focus-visible` + `prefers-reduced-motion`；②**排版与动效**（round-96/99）——IBM Plex + 7 级阶梯（`text-[Npx]` 147→0）、120ms 默认过渡 + 200ms 面板 + 320ms 路由进入；③**主界面重做**（round-91~95/99）——输入区四控件改芯片语言（模型前置 + `--model` 紫身份 + 单主按钮）、签名组件「工具调用行」（pip + 等宽命令名 + 读数 + OK/RUN/FAIL 徽记）、代码块楼层（语言标签 + 复制）、标题层级/线程行/侧栏字形/目录行列表 + 字母头像清零；④**性能**（round-84~89，输出逐字不变、交错 A/B 验证）——打开会话去全量水合（2118ms→有界页，A/B 2~3×）、上翻游标分页、Git 面板分支列表窗口化（布局 81ms→4.9ms）、切换高亮中位 102ms→6ms；⑤**正确性**（round-82/83/87）——模型切换派生窗口字段收口（含回退出口与水合窄判据）、自动压缩长 turn 预检、CLI 停止超时（真实 systemd 闭环）；⑥**收尾**（round-100）——sr-only 清点归零 + Tailwind 扫描源收窄（主 CSS −6.8KB）+ 死组件删除。

**验证基线（发版时点）**：契约 **37/37**、主题 15/15、字体 13/13、等值探针 **870/870 逐字相同**、`vue-tsc` 干净、`vite build` 通过、全量 Vitest **658 例 656 通过 / 2 失败**（既有 Windows 平台差异，真实 Linux 全绿）。

**发布动作**：版本 bump + 本小节提交（见 git log）；git tag `v0.1.126`（annotated）指向该提交；GitHub Release 由维护者创建（非草稿/非预发布，标 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.126 。

**发布闭环**：用户于 2026-09-28 执行 `npm publish`，registry 记录发布时刻 `2026-09-28T09:06:42.665Z`，`dist-tags.latest` 由 `0.1.125` 切换为 **`0.1.126`**。维护者随后下载 tarball 复核：1,605,877 字节、55 个条目（`dist/` 47 + `dist-cli/` 2 + `scripts/` 3 + `package.json`/`README.md`/`LICENSE`）、sha1 `6a34332a4aa5c4384ee6ec157fea1e32d21abe77` 与 integrity `sha512-4mel2hXVvxzEd11sMdIOpJOFSrAH+epBGMfdYby6a5BUkb9yKouKP2JSsOdrVf3vt9AaYnDkBKaBW9zxxZQRdw==` 均与 registry 逐项一致，包内 `package.json` 为 `codex-mobile-re@0.1.126`。（复查时再次确认 v0.1.125 的口径：registry 传播有分钟级延迟——`npm view dist-tags` 先报 `0.1.125`、版本详情 404，约 1 分钟后 `latest` 即挪正，不能据此判失败。）

## v0.1.127 发布（round-101 ~ round-121）

版本从 `0.1.126` 升至 **`0.1.127`**，收录 round-101 ~ round-121 共 51 个提交（推送范围 `b761b601..v0.1.127`）——主线是「codex-cli 0.157–0.159 协议升级适配」与「全量水合彻底退场」两大战役，外加消息串位排序修复、测试基线零失败治理与集成终端去 native 依赖。

**内容总览**：①**协议升级与兼容**（round-101/103/106/108/109）——codex-cli 0.153.4→0.158.0→0.159.0 三段式升级：纯调研审计先行、真实探针逐项验证后接入 `instant_interrupt`（按 `codex --version` 门控，<0.159 整条 key 不发）、回退改 `thread/revert`-only（`thread/rollback` 已被移除）、`items/list` 网关与 turn 时间戳/originator 身份采纳、steer 改显式 `turn/steer {expectedTurnId}`（不可转向自动降级排队、前置不匹配回落 `turn/start`）；legacy `custom` provider 在 spawn 时注册占位（旧自定义端点线程 502→200）；②**性能：全量水合退场收口**（round-102/110/111/112/113）——`thread/read` 有界化、翻旧页兜底在 turns/list 不可用时改答边界**绝不回落全量水合**、队列 drain / 排队轮开跑 / telegram 转发 / 回退文件路径的裸全量读逐处收口（大线程 6.0–6.2s/26MB 的 `canStartQueuedTurn` 路径在内）；③**正确性**（round-104/121）——真实 124MB/173 轮大线程实测揭出并修复「legacy custom 线程打开必 502」与「慢开提示接在死信号上」两枚真 bug；**修「新发用户消息串进上一轮 message 中间」**：`mergeMessages` 乐观消息时序锚定 + `mergeThreadMessageStreams` 乐观消息边界（codegraph 复核发现的 live 层第二路径），不变量＝乐观用户消息代表「现在」，发送前已存在的内容不得排到它后面；大线程慢开 5s 诚实提示；④**集成终端**（round-116）——改走 app-server 官方 `command/exec {tty:true}` PTY 通道，删 `node-pty` native 依赖与 postinstall 修补；⑤**测试基线**（round-115）——从「恒定 2 例失败」修到**零失败**（三个根因全在测试与环境口径，产品代码零改动）；⑥**UI 与闸门**（round-117/118/119/120/114）——7 级排版阶梯归档（`text-sm` 162 处语义分档）、侧栏/会话区 `data-thread-id` 稳定标识 + 闸门按 id 定位条件等待（12 项）+ 内容挑选 preview 兜底、设计审计三处机械小改（过冲缓动/裸 hex token 化/缓动家族统一）、Directory 写死的他人机器技能绝对路径清理。

**验证基线（发版时点）**：`vue-tsc --noEmit` 干净、全量 Vitest **725/725 零失败**（714→725，round-115 治理后零失败基线）、UI 契约 **38/38**（round-117 起）、闸门 `check-thread-switch-feedback` **12/12**。

**发布动作**：版本 bump + 本小节提交（见 git log）；git tag `v0.1.127`（annotated）指向该提交；GitHub Release 由维护者创建（非草稿/非预发布，标 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.127 。

**发布闭环**：用户于 2026-10-08 执行 `npm publish`，registry 记录发布时刻 `2026-10-07T17:33:05.712Z`（＝北京时间 2026-10-08 01:33:05），`dist-tags.latest` 由 `0.1.126` 切换为 **`0.1.127`**。维护者随后下载 tarball 复核：1,618,158 字节、54 个条目（`dist/` 47 + `dist-cli/` 2 + `scripts/` 2 + `package.json`/`README.md`/`LICENSE`）、sha1 `05a2f3311f852d817f3932e4a8d14e3fea721132` 与 integrity `sha512-Y+07jli5GfpXLxH9SFleHqNnEDuj9XrzaudS5P+2Rvc04m7EtyH7CiPNxiVrCU6maUHh8Oxa+FXWSMTA1KpaHw==` 均与 registry 逐项一致，包内 `package.json` 为 `codex-mobile-re@0.1.127`，主前端 bundle（`dist/assets/index-CkZzIAPA.js`）含 round-121 乐观消息修复标记（`userMessage.optimistic`）。**本次传播延迟明显长于既往**：发布后约 5 分钟内 curl 直查 registry 源头仍报旧 packument（`time.modified` 停在 v0.1.126 时点、404），约 8 分钟后才可见——复查时不能凭单次查询判失败，须以 `time.modified` 变更或更长等待窗为准。

## round-122（`-c` 兼容占位顶掉用户自定义 `custom` provider，未发布）

**修复提交 `0c22ab48`**：`fix(server): 兼容占位 provider 仅在用户未定义时注入，不再顶掉用户的 custom（round-122）`（6 文件，+303/−23）。`appServerRuntimeConfig.ts` 新增 `collectModelProviderIds` / `readUserConfiguredProviderIds`（读 `$CODEX_HOME/config.toml` 的 `model_providers.<id>`，mtime+size 键控缓存，复用 `bridge/codexAuthState` 的 `stripTomlComment`）；`bridge/codexAuthState.ts` 仅导出该函数（零逻辑改动）；`freeMode.ts` 的 `getProviderCompatibilityConfigArgs` 第二参数改为必填并对 `custom` / `opencode_zen` 都条件注入，占位 `base_url` 改指 `LEGACY_CUSTOM_COMPAT_PATH`（无端口时回落 `127.0.0.1:9`）；`codexAppServerBridge.ts` 传入已定义的 provider id 并新增 `POST /codex-api/provider-compat/v1/responses` 返回 400 + 可读提示。

**文档提交 `6c8d291e`**：`docs: round-122 轮次文档 + 总入口登记 + 手测章节（round-122）`（5 文件，+168/−4）——轮次文档、总入口快照/索引/未完成事项/落款、手测章节 `tests/providers-models/round-122-user-owned-custom-provider-not-overridden.md` 与两处索引登记。
**文档提交 `314cded6`**：`docs: round-122 补真实 CLI（发布路径）端到端验证记录（round-122）`（2 文件，+16/−4）——轮次文档补入真实 `dist-cli` 双变体 `config/read` 结果（A 用户定义 `custom` → `active=custom` / `name=litellm` / `base_url=http://127.0.0.1:4460/v1`；B 未定义 → 占位指向 `http://127.0.0.1:4291/codex-api/provider-compat/v1` 且该路由回 400）与路由返回体原文，总入口的当前快照行与 Dev 状态行同步补记该验证路径——**只有打包 CLI 会设置 `CODEXUI_SERVER_PORT`，故 fix③ 的兼容路由 `base_url` 只在发布路径上生效、也只能在发布路径上验**。

## round-123（免费兜底改 OpenRouter + 失效模型 slug 校准，未发布）

**修复提交 `375852ee`**：`fix(free-mode): 默认兜底改 OpenRouter，并清理失效模型 slug`（7 文件，+44/−22）。`bridge/codexAuthState.ts` 的 `ensureDefaultFreeModeStateForMissingAuthSync` 由 `createDefaultOpenCodeZenFreeModeState()` 改 `createDefaultOpenRouterFreeModeState()`（判定语义不变——仍只在「无可用 auth **且** config.toml 未显式写顶层 `model_provider`」时播种）；`freeMode.ts` 的 `FALLBACK_FREE_MODELS` 按 2026-10-08 实测校准（`gemma-3-27b` / `llama-3.3-70b` / `qwen3-coder` 三个 `:free` 已下架）；`bridge/models.ts`、`bridge/freeModeRoutes.ts`、`codexAppServerBridge.ts` 三处 Zen 离线兜底清单同步换掉三个已从目录消失的 slug；删 `codexAppServerBridge.ts` 里 `createDefaultOpenCodeZenFreeModeState` 的死导入；`freeMode.test.ts` 与 `codexAppServerBridge.archive.test.ts` 同步更新（3 条断言 + 3 个用例标题改 OpenRouter）。

**未发布**：未 bump 版本、未 tag、已推送 `origin/main`（`308f368b`，2026-10-08）。

**本轮的重要结论（推翻用户前提）**：OpenCode Zen 免费档**没有下线**，是插件 `zenProxy` 的客户端指纹过期。上游闸门是递进的，实测分界点：`403 FreeTierError`（缺 `stream:true` + `bash`/`read` 工具桩）→ 补齐后 `426 UpgradeRequired`（要求 `opencode/1.18.0+`，插件 UA 硬编码 `1.15.9`）→ UA 提上去后 **13 个免费模型 8 个可用**（含插件默认的 `big-pickle`），另 2 个地区限制（`RegionError`）、3 个上游端点不可用。**故未按用户原意移除 Zen 模块**——它同时是遗留 rollout 的承重 provider 注册（round-104 / round-122 的 `getProviderCompatibilityConfigArgs`）。**指纹不修**：属持续绕过上游明确设置的门禁，且 9 月内已收紧两级，判定为军备竞赛，只诊断上报、不实施。**验证**：定向 60/60、`vue-tsc` EXIT=0、全量 **732/732 零失败**。

## round-124（OpenCode Zen 客户端指纹修复，未发布）

**修复提交 `ab5cd983`**：`fix(free-mode): 修复 OpenCode Zen 客户端指纹，免费档恢复可用`（4 文件，+364/−6）。`src/server/zenProxy.ts` —— UA 由硬编码 `opencode/1.15.9` 改为常量 `OPENCODE_ZEN_MIN_CLIENT_VERSION = '1.18.0'`；新增 `createOpenCodeSessionId()` 生成规范 `ses_` id（12 位小写 hex + 14 位 base62，共 26 字符，替代原先的 `ses_` + 24 base62）；新增 `ZEN_REQUIRED_TOOL_STUBS` 与 `applyZenFingerprintToChatRequest()`（强制 `stream: true` + **幂等追加** `bash`/`read` 桩，不替换调用方工具、不动 `tool_choice`）；`createZenUpstreamHeaders` 导出供测试。`src/server/unifiedResponsesProxy.ts` —— 导出 `ChatCompletionsRequest` 类型；新增 `chatRequestTransform` 选项（provider 级出站载荷改写钩子，opt-in，不传则行为逐字不变）；新增 SSE 聚合器 `aggregateSseChatCompletion` 与嗅探式 `parseUpstreamChatPayload`，chat 分支应用 transform、响应分支改走嗅探解析。新增 `src/server/zenProxy.test.ts`（9 例）、`src/server/unifiedResponsesProxy.test.ts` +1 例 SSE 聚合。

**为什么需要 SSE 聚合（round-123 §六① 预测漏掉的第四处）**：指纹要求 `stream: true` ⇒ 上游**必定**返回 SSE；而带工具时 `effectiveStreaming` 为 false（既有设计），走的是**非流式分支**，那里原本是裸的 `JSON.parse(rawResponseBody)` —— 对 SSE 必然抛错 → 502。只加 `stream` 而不加聚合，修复会以「403 没了、换成 502」告终。

**闸门的具体值（A/B 探测，决定修法）**：①**闸门检查工具名字** —— 只给 Codex 自己的 `shell`/`apply_patch` → 403 `FreeTierError`，**追加** `bash`/`read` 桩 → 200 ⇒ 桩必须存在但**不必替换**调用方工具；②**`tool_choice` 不在闸门内** —— `'auto'` 与不传都 200 ⇒ 无须强制 `none`、调用方工具选择权可保留；③**版本段独立且必需** —— 其余三段齐全但 UA 停在 `1.15.9` → 426 `UpgradeRequired`。故修法＝「**追加桩 + 保留调用方工具与 `tool_choice`**」，比 round-123 的设想更保守。

**真机验证（决定性）**：一次性 vitest 探针（`src/server/zenProxyLiveness.test.ts`，跑完即删）把真实 `handleZenProxyRequest` 挂本地端口、发**带工具的 Codex 风格** Responses 请求打真实上游 —— 非流式 **HTTP 200** 返回真实内容（`output` 含 `{type:'message', content:[{type:'output_text', text:'PONG'}]}` 与一段 `reasoning`，`usage = 194/13/207`）、流式 **HTTP 200** 且 SSE 含 `response.created` / `response.completed`。

**未发布**：未 bump 版本、未 tag、已推送 `origin/main`（`308f368b`，2026-10-08）。`0.1.127` 已 publish 且含 round-122 的 `custom` 缺陷。

**文档提交**（见 git log）：round-124 轮次文档 + 总入口登记（快照 / Dev 状态 / rounds 索引 / 未完成事项 / 落款）+ 手测章节 `tests/providers-models/round-124-zen-free-tier-fingerprint.md` + 两处索引登记；**顺带修掉 round-122 在 commit-history 里遗留的两处格式瑕疵** —— 第 198 / 211 行的两处字面 `\n` 文本行，以及被 round-123 段落插入切断的 `314cded6` 登记残片（已补回 `**文档提交 \`314cded6\`**` 前缀并归位到 round-122 段落）。

**诚实边界**：主动绕过上游明确设置的门禁（**非 bug 修复**），上游再收紧即失效；桩会让模型看见 `bash`/`read` 两个不该调用的工具（**未做响应侧过滤**）；`OPENCODE_ZEN_MIN_CLIENT_VERSION` 是硬编码快照，上游提高门槛后须人工同步；修指纹只恢复「门」、不修上游模型可用性（13 个免费模型里 5 个本身就是坏的）。

**验证基线**：定向 21/21、`vue-tsc --noEmit` EXIT=0、全量 **742 例**（默认 15s 下 6 例负载敏感 fs 超时 → `--testTimeout=30000` 降为 1 例 → 隔离复跑通过，与本改动无关）。

## round-125（审查面板改为独立覆盖层，未发布）

**修复提交 `c0a91c72`**：`fix(ui): 审查面板改为独立覆盖层，不再顶掉消息列表`（3 文件，+294/−93；产品源码只有 `src/App.vue` 一处，91 增 93 删）。

**现象与根因**：用户报告「点开审查工作树更改再关闭，消息列表回到最上面」。`src/App.vue:569-580` 里 `ReviewPane` 与「会话列 + composer」是 `v-if`/`v-else` 的**互斥分支** ⇒ 打开面板即**卸载整条 `ThreadConversation`**，关闭时**全新挂载**；而 `ThreadConversation.vue` **没有 `onMounted`**（全文件只有 `onBeforeUnmount`）、五个滚动相关 watcher（`messages`/`isLoading`/`activeThreadId`/`liveOverlay`/`pendingRequests`）**都没有 `immediate`** ⇒ 重挂时 props 未变、一个都不触发 ⇒ 新 `<ul class="conversation-list">` 的 `scrollTop` 停在浏览器默认 **0**。同因一并丢失已上翻加载的更早分页、`autoFollowOutput`（重置为 true）、`warmLayerState`、图片预览、文件变更动作态，并白付一次整条线程 DOM 重渲。

**溯源**：`0e147705`「Show review pane in place of thread content」（2026-04-02，taobo）把**并列布局**（`content-grid.has-review-pane` 的 `md:grid-cols-[minmax(0,1fr)_34rem]` + `.content-thread-column`，会话列常驻）改成互斥。故「顶掉会话列」是当时**有意**的（让窄屏下的审查面板占满宽度），**丢滚动位置是没被考虑到的副作用**；该重构此前未出现在任何轮次文档中。`ReviewPane` 本是 `<Teleport to="body">` + `fixed inset-0` 的覆盖层，因此「覆盖」与「顶掉」在这里被混为一谈。

**改动**：只做三件事 —— 删 `<template v-else>`、删配对的 `</template>`、中间 93 行整体减 2 空格缩进；`<ReviewPane>` **原地不动**（Teleport 到 body，不占布局）。改后 `.content-grid` 的三个子节点（`ReviewPane` + `.content-thread` + `.composer-with-queue`）全部为无条件渲染；关闭态 DOM 与改前**逐字相同**（`<template>` 是 fragment、不产生元素），故布局与 CSS 零变化。

**新增闸门（2 个）**：
- `scripts/check-ui-contract.cjs` **38 → 39 项**：新增「审查面板是覆盖层，不得与会话列构成 v-if/v-else 互斥」。**反跑证明非空**——改动前 **38/39**、该项 FAIL（诊断行 `← 仍被 v-else 包着`），改动后 **39/39**。
- `scripts/verify-review-pane-scroll.cjs`（新，浏览器侧可复跑）：断言 ①面板打开期间 `.conversation-list` 仍挂载 ②关闭后 `scrollTop` 与打开前一致；改动前的构建必然失败（退出码 1），环境不足时 SKIP（退出码 2）。

**真机 A/B（同一 harness 交错三跑，决定性）**：改动前 ①**count=0** ②**scrollTop 2018 → 0**（FAILED 3/7，逐字复现用户报告）／改动后 ①count=1 ②**2018 → 2018**（ALL GREEN 7/7）／换回旧码再跑一次仍 ALL GREEN（交错确认）。测试线程为隔离 `CODEX_HOME` 里一条真实线程（可滚动 5768px）。

**生产构建复跑**：`vite build`（46.26s，EXIT=0）→ `dist-cli` 起 4190（隔离 `CODEX_HOME`）→ 闸门 **7/7**、`verify-mobile-375.cjs` **EXIT=0**。

**环境新事实**：`dist-cli` 绑 `0.0.0.0:4190` 时，本机沙箱内 **node 的 `fetch` 连不上它**（`TypeError: fetch failed`，`127.0.0.1` / `localhost` 皆然、`NO_PROXY=*` 无效），**但系统浏览器（Edge）可正常访问** ⇒ 这类闸门必须走浏览器，不能用 node 探针判断「服务是否就绪」。另：1280px 下右侧面板**默认已展开**，点 `.content-header-right-panel-toggle` 会把它收起。

**验证基线**：`vue-tsc --noEmit` EXIT=0、全量 **742 例**（默认 15s 下 5 例负载敏感 fs 超时 → `--testTimeout=30000` 降为 1 例 → 隔离复跑 2/2 通过、1518ms）。

**未发布**：未 bump 版本、未 tag、已推送 `origin/main`（`308f368b`，2026-10-08）。`0.1.127` 已 publish 且含 round-122 的 `custom` 缺陷。

## round-126（滚动容器不再被加载状态摘掉，未发布）

**修复提交 `64ce0b54`**：`fix(ui): 消息列表的滚动容器不再被加载状态摘掉`（3 文件，+298/−2；产品源码只有 `src/components/content/ThreadConversation.vue` 一处，2 增 2 删）。

**现象与根因**：用户报「有时消息列表会跑到 TOP 去」与「新增命令块的时候会闪一下」。`ThreadConversation.vue` 里会话唯一的滚动容器 `<ul class="conversation-list">` 是 `v-if`/`v-else` 链的最后一环：`<p v-if="isSlowOpen">` → `<p v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay">` → `<ul v-else>`。`isSlowOpen` 由 `useDesktopMessageHistoryLoading.ts` 决定（`SLOW_OPEN_HINT_DELAY_MS = 5000`；`loadMessages` 每次都会武装该定时器、与 `silent` 无关）⇒ 任何一次重载超过 5 秒，整条 `<ul>` 就从 DOM 消失；加载结束后它作为全新元素挂回来，`scrollTop` 从浏览器默认 0 开始，而该组件没有挂载期滚动恢复（无 `onMounted`，五个滚动 watcher 都没有 `immediate`）。**关键推理**：`scrollToBottom()` 只写 `scrollHeight`、`loadMoreAbove()` 只写正数，**没有任何代码把 `scrollTop` 设为 0** ⇒ 元素被重新创建是「列表自己跑到 TOP」的唯一机制。

**为什么日常必踩**：`useDesktopState.syncFromNotifications()` 在 `currentThreadVersion`（= 线程行的 `updatedAtIso`）变化时强制重载选中线程，而**每持久化一个新条目（= 每个新命令块）都会改变它** ⇒ 流式回合期间重载是常态。另有两条用户可触发的强制重载：`App.onFileChangesChanged`（文件变更动作后，`silent:true, force:true`）与 compaction 后的重读。

**溯源**：`git log -S '<ul v-else ref="conversationListRef"'` 与 `-S 'v-else-if="messages.length === 0'` 都只命中 **`fbc8a668`（2026-02-16, "init"）** ⇒ 这条链是初版设计、不是后来引入的回归，这正是它长期没被发现的原因。

**改动**：空态 `<p>` 由 `v-else-if` 改为 `v-if` 并补 `&& !isSlowOpen`（保持「慢开提示出现时不显示『本线程还没有消息』」的原有观感）；`<ul class="conversation-list">` 去掉 `v-else`，无条件渲染。`.conversation-list` 无内边距/边框/背景 ⇒ 空线程时它没有子节点、视觉上不存在，与改前一致；`hasMoreAbove`/`hasColdTurns` 在无轮次分组时均为 false，不会冒出「Load earlier messages」。改后语义是「慢开提示与列表并存」，而不是「用提示把列表换掉」。

**新增闸门（2 个）**：
- `scripts/check-ui-contract.cjs` **39 → 40 项**：新增「消息列表是滚动容器，不得挂在 v-if/v-else 分支上（round-126）」。**反跑证明非空**——改动前 **39/40**、该项 FAIL（诊断行 `<ul class="conversation-list">@28 ← 仍带 v-if/v-else 指令；空态仍是 v-else-if（链未断开）`），改动后 **40/40**。
- `scripts/verify-conversation-list-persists.cjs`（新，浏览器侧可复跑）：用应用自己的触发链（桩 `thread/list` 的 `updatedAt` +1h 让重载真的发生 → 伪造 `visibilitychange` hidden→visible ＝ 切走再切回标签页 → `refreshAll({includeSelectedThreadMessages:true})` → `thread/read` 注入 9s），断言「慢开提示出现时列表仍在 DOM、仍有内容、保持原位置」+「加载结束后位置不变」。**慢开提示若没被触发会 SKIP 退 2 —— 闸门不允许空过。**

**真机 A/B（同一 harness 交错四跑，决定性）**：改动前 提示出现那一刻 `listPresent=false`（items=0）、摘除 1 次、**`scrollTop` 2307 → 0**；改动后 `listPresent=true`（items=108、`scrollTop` 2307）、摘除 0 次、最终 **2307**；交错复跑重复同样结果（提示命中 6119 / 6133 / 6085 / 5902 ms，唯一变量是代码）。测试线程为隔离 `CODEX_HOME` 里一条真实线程（108 个条目、可滚动 5768px）。

**生产构建复跑**：`vite build`（34.95s，EXIT=0）→ `dist-cli` 起 4190（隔离 `CODEX_HOME`）→ 新闸门 **10/10**、`verify-review-pane-scroll` **7/7**、`verify-mobile-375` **EXIT=0**、`check-fonts` **13/13**、`check-theme` **15/15**、`check-token-equivalence` **EXIT=0**（外观与基线一致 → 无需重置基线）、`check-thread-switch-feedback` **12/12**（`chars=24506→24517`，冻结 17/21ms ≤ 60ms 预算）。`check-thread-switch-feedback` 的 `chars` 正是读 `.conversation-list` 的 `textContent.length`（缺席按 0 计）——它仍通过，说明「空列表现在存在于 DOM」没有改变它的判读口径。

**「闪一下」的取证（未定案）**：用同一条触发链做了一次「内容不变的重载」，实测 `.conversation-item` 新增 **0**、删除 **0**，滚动容器也未摘除 ⇒ **重载本身不重渲**（键稳定，Vue 走 patch）。又核对 `removeLiveCommandsPersistedIn` 是**按 id 相等**过滤的 ⇒ live 项与持久化项 key 不换、节点不重建。剩余候选（未证）：新块插入本身的一帧布局变化 + `autoFollowOutput` 重新钉底（`scrollToBottom()` 里还有 `anchor.scrollIntoView({block:'end'})`，会连带滚动祖先容器）。**要定案必须驱动一个真实的流式回合**，本轮不做。

**验证基线**：`vue-tsc --noEmit` EXIT=0、全量 **742 例**（默认 15s 下 3 例负载敏感 fs 超时 → 隔离复跑 63/63、15.89s）。

**未发布**：未 bump 版本、未 tag、已推送 `origin/main`（`308f368b`，2026-10-08）。

## round-127（会话重挂不再把滚动位置丢回 TOP，未发布）

**修复提交 `b0b6a990`**：`fix(ui): 会话重挂不再把滚动位置丢回 TOP（挂载期滚动初始化）（round-127）`（3 文件；产品源码只有 `src/components/content/ThreadConversation.vue` 一处，11 增 1 删）。

**由来**：收口 round-126 的两条遗留——①「新增命令块的时候会闪一下」尚未定案；②没有挂载期滚动恢复。round-125 / round-126 都把「加挂载期滚动恢复」写成「独立议题，本轮不做」，理由是「那会改变**所有**挂载路径（含首次打开线程）的行为」；要判断值不值得改，得先回答一个可测的问题：**除了已被修掉的两条路径（审查面板、慢开提示），还有哪条路会重挂而 `activeThreadId` 不变？**

**先证后改（决定性探针 `tmp/probe-r127-remount.cjs`）**：`ThreadConversation` 是 `defineAsyncComponent`（`App.vue:1019`），会话列位于 `<template v-else>` 分支 ⇒ 切到非线程视图会整棵卸载。实测四个入口——`#/` / `#/directory` / `#/settings` / `#/automations`——「切走再切回**同一条**线程」时 `.conversation-root` 各摘挂 1 次（`rootsRemoved/Added = 4/4`）、**scrollTop 438 → 0**（四个入口全中）。机制：该组件五个滚动相关 watcher（`messages` / `pendingRequests` / `liveOverlay` / `isLoading` / `activeThreadId`）**一个都不会触发**（`activeThreadId` 没变、props 也没变），而它当时**没有 `onMounted`** ⇒ 新挂载的 `<ul class="conversation-list">` 停在浏览器默认 `scrollTop = 0`。⇒ **这是可复现的真缺陷，不是理论隐患。**

**改动**：`import` 补 `onMounted`；新增 `onMounted(() => { void scheduleConversationScroll() })`。两点分寸：①**只做一件事**——结算一次滚动（`autoFollowOutput` / `modalImageUrl` / `isLoadingMore` / `warmLayerState` 在挂载时本就处于初值，不必像 `activeThreadId` watcher 那样逐项重置）；②**与「切换线程」同口径 = 落到最新内容（底部）**，不是恢复用户停下的原位置：剩余的重挂路径**全是用户主动导航**（切走再切回），此时「打开就看见最新」才是预期；而两类**非导航**的意外重挂已由 round-125（审查面板改覆盖层）与 round-126（滚动容器脱离 `v-if` 链）修掉。

**新增闸门（2 个）**：
- `scripts/verify-conversation-mount-scroll.cjs`（新，浏览器侧可复跑）：进入可滚动线程 → 停在底部记录 `scrollTop` → 依次切到 `#/` / `#/directory` / `#/settings` / `#/automations` 再切回 → 断言位置未丢；**并断言「会话确实被重挂过」（`rootsRemoved > 0`），否则闸门会空过**。**真机 A/B**：改动前 四个入口全部 `438 → 0`（**FAILED 4/7**，exit 1）；改动后 全部 `438 → 438`（**ALL GREEN 7/7**）。
- `scripts/check-ui-contract.cjs` **40 → 41 项**：新增「会话挂载期有滚动初始化，重挂不停在 TOP（round-127）」（同时校验 `onMounted` 从 `vue` 导入、挂载回调里确实调用了 `scheduleConversationScroll`）。**反跑证明非空**——改动前 **40/41**、该项 FAIL（诊断行 `未定位到 onMounted()`），改动后 **41/41**（`onMounted@2021`）。

**性能审计（按 `AGENTS.md` 量测，`tmp/probe-r127-perf.cjs`）**：在页面里挂 `Element.prototype.scrollIntoView` 计数 + 给 `.conversation-list` 装 `scrollTop` setter 计数，量「hash 切到线程」这一段。`codex-api` 请求数 **8 / 8 / 8**、`scrollIntoView` 调用 **1 / 1 / 1**、`scrollTop` 写入 **1 / 1 / 1** —— **改动前后逐项相同**。原因是 `scheduleConversationScroll` 自带 in-flight 合并（`if (conversationScrollPromise) return conversationScrollPromise`）：首次打开时「挂载初始化」与「`activeThreadId` watcher」落在同一次结算里，零额外滚动、零额外请求、零额外布局读取。（量测口径的一处诚实说明：探针给 `scrollTop` 装自定义 setter 后回读的是**写入值**而非浏览器钳制后的值，日志会出现 `endTop=1008/438` 这种越界读数——那是探针副作用。）

**「闪一下」的取证（候选从 2 条收窄到 1 类，仍未定案）**：`tmp/probe-r127-append-flash.cjs` 用应用自己的链路注入——①桩 `thread/list` 的 `updatedAt` +1h（让重载真的发生）②往 `thread/read` 响应最后一轮的 `items` **追加一个合成的 `commandExecution` 条目**（形状抄自同线程真实条目：`{id,type,command,cwd,status,aggregatedOutput,exitCode,durationMs}`）③伪造 `visibilitychange` hidden→visible，且**把列表停在底部触发**（走「跟随输出」链 = 用户看最新内容时的真实处境）。**排除 4 条候选**：①**重载重建既有 item**——`itemsAdded=0 / itemsRemoved=0`，items 10 → 11（纯追加）；②**顶部 `isLoading` 切换条闪动**——全程 `switching-bar=false`（代码依据：`isLoadingMessages` 只在 `options.silent !== true && !alreadyLoaded` 时置真，而重载路径全部 `silent:true`）；③**`scrollIntoView` 连带滚动祖先**——原语级 A/B 显示 `list.scrollTop = scrollHeight` 单独已到底（两次 `listTop` 都是 438），加不加 `scrollIntoView` 时**11 个祖先的 `scrollTop` 逐位相同、`document.scrollingElement` 也是 0**（耗时 0 → 0.1ms）；④**位置被重置回 TOP**——`listTop` 轨迹 `438 → 510`（跟随到底）。**唯一新增的形态证据**：内容变化的重载确实带来非 item 节点重建（文本节点 ×80/−50、`<li.conversation-turn>` ×12/−7、`<section.conversation-turn-process>` ×2、v-if 占位注释 ×2 移除），但都在**同一次 patch** 内完成、观测不到可见中间态。⇒ 剩余只有 **(a) 真实流式回合里 live 项 → 持久化项的交接**（本条注入只造了持久化项，live 侧未被触发）与 **(b) 内容落地与滚动跟随之间那一帧的差**（滚动写在 `requestAnimationFrame` 里）；两者都必须驱动**真实流式回合**（需要模型在跑），本轮不做、也不据此下结论。

**生产构建复跑**：`vite build` EXIT=0（9.47s，重建 `dist/`）→ `dist-cli` 起 4190（隔离 `CODEX_HOME`）→ 新闸门 **7/7**（与 dev 数字逐字相同：438→438、removed=4/added=4）、`verify-mobile-375` **EXIT=0**、`check-thread-switch-feedback` **12 项全过**（`frozen=8ms/11ms` ≤ 60ms 预算）、`check-fonts` **13/13**、`check-theme` **15/15**、`check-ui-contract` **41/41**。

**验证基线**：`vue-tsc --noEmit` EXIT=0、全量 **742 例 / 742 通过（76 文件）零失败**（默认 15s 超时下即零失败）。

**本轮未跑（环境不足，非失败）**：`verify-conversation-list-persists` 与 `verify-review-pane-scroll` 都要求线程可滚动 **>600px**，而本机沙箱 `.codex` 里最长只有 **438px** ⇒ 两者均 **SKIP（退 2）**；`check-token-equivalence` 因缺 `output/playwright/ui-audit/facts.json` 未跑（本改动是纯 DOM 生命周期、不触碰样式/token）。`check-fonts` / `check-theme` 需顶层 `playwright-core`（本机只在 pnpm store 里）——用 `NODE_PATH=<store>/playwright-core@1.62.1/node_modules` 指过去后正常运行。

**新环境事实**：**dev server 与 `dist-cli` 共用同一个 `CODEX_HOME` 会互抢 writer lock** —— 先起 dev 再起 dist-cli，后者打开线程得 `RPC thread/resume failed with HTTP 502: thread … already has an active writer`，页面表现为「消息列表只剩 1 项、一个 `thread/read`/`resume` 请求都没发」。跑生产构建闸门前必须先停 dev（或换 home）。这是 round-44 记录的 writer 锁限制在现场的样子。

**未发布**：未 bump 版本、未 tag；`b0b6a990` 已在本地 `main`。

## round-128（命令块 live→持久化交接延迟清空，未发布）

**修复提交 `5133d130`**：`fix(ui): 命令块 live→持久化交接延迟清空，回合收尾不再「闪一下」（round-128）`（3 文件：`src/composables/useDesktopState.ts` **64 增 10 删**、`scripts/check-ui-contract.cjs` +50、新增 `scripts/verify-command-block-handoff.cjs`）。

**由来**：用户口径「继续收口」，收口 round-127 的唯一遗留——「新增命令块时闪一下」尚未定案。round-126 排除了重载重渲与顶部 `isLoading` 切换条，round-127 又排除了 `scrollIntoView` 连带滚动与「位置被重置回 TOP」，把候选收窄到 **(a) 真实流式回合里 live→持久化项的交接**、**(b) 内容落地与滚动跟随之间那一帧的差** —— 两者都必须驱动**真实流式回合**才能判。

**根因（本轮定案，逐帧取证）**：先搭出能跑真实回合的隔离环境（隔离 `CODEX_HOME` + `gpt-5.5` relay），再用 rAF 逐帧采样 ⇒ `turn/completed` **急切清空 live 命令**（`liveCommandsByThreadId[thread]`），而渲染用的持久化副本要等防抖 `EVENT_SYNC_DEBOUNCE_MS = 220` 的收尾 `thread/read` 才落地 ⇒ 命令块从 DOM 真空约 **250ms**（A 侧实测 `@+11635ms 消失、持续 250ms`；真空期结构读数 `request(2:userMessage|userMessage) + final(2:agentMessage|agentMessage)` —— 命令块所在的 `process` 段**整段被摘掉**，落地后回来的才是 `+ process(1:commandExecution)`）。**清空本身必需、不能改成不清**：live 命令 id 是通知里的裸 `call_xxx`、桥层重建的持久化命令 id 是 `session-cmd-<callId>`，**不同源**，`removeLiveCommandsPersistedIn` 的按 id 剪除对它无效，不收尾清空就会在原位多出一个命令块。

**关键发现（第一版修复因此失效）**：收尾有**两条通知路径** —— `applyRealtimeUpdates(notification)`（WS 回调里**先**执行，含 `setThreadInProgress(completedTurn.threadId, false)`）与 `handleNotification(notification)` 的 `turn/completed` 分支。第一版只改了后者，A 侧读数与改动前**逐字相同**（临时钩子 `window.__r128dbg` 显示 `defer` 从未置 1、`liveCmd` 仍 `1→0`）；抽出 `finishTurnForThread` 作**统一收尾入口**、两条路径都调它之后，`defer=1` 首次出现且 `cmds` 全程不归零。

**改动**：`src/composables/useDesktopState.ts`（唯一产品改动文件）——新增 `deferredLiveCommandClearThreadIds` / `flushDeferredLiveCommands` / `finishTurnForThread`；`clearCompletedTurnLiveState` 支持 `keepLiveCommands`；`setThreadInProgress` 透传 `keepDeferredLiveCommands`；新增 1.5s 兜底上界 `LIVE_COMMAND_HANDOFF_FALLBACK_MS`；**只对当前选中线程延迟**，非选中线程维持立即清空。之所以「同一拍」安全：`loadMessages` 在 `setPersistedMessagesForThread` 之后**同一同步块（无 await）**里调 `clearCompletedTurnLiveState` ⇒ 新旧副本在同一帧换手。取证用的 `TEMP-r128-DEBUG` 钩子在提交前已整体删除（`grep -rn "__r128dbg\|TEMP-r128-DEBUG" src/ scripts/` 返回 none）。

**新增闸门（2 个）**：

- `scripts/verify-command-block-handoff.cjs`（新，浏览器侧可复跑）：用 UI composer 发一条**会触发 shell 命令**的提示词驱动**真实流式回合**（先热身一轮），逐帧记 `[data-message-type="commandExecution"]` 的个数 `cmds`；判定「`cmds` 从 >0 归零、随后又在 5s 内回到 >0」= 真空事件。**真机 A/B（交错三跑 B1→A1→B2，唯一变量是代码）**：改动前 **FAILED 1/6**（真空 `@+11635ms` 250ms）、改动后 **ALL GREEN 6/6**（无真空）。三条**非空过**断言：观测回合确实产出命令块（`maxCmds=1`）、确实有 `lastStatus=completed` 的收尾 `thread/read`、采样帧数 ≥60（实测 1658 / 1787 / 1849 帧，最大帧间隔 13–17ms）；模型整轮没出命令块或回合没跑完 ⇒ **SKIP 退 2**（不是失败也不是通过）。
- `scripts/check-ui-contract.cjs` **41 → 42 项**：新增「命令块 live→持久化交接延迟清空，不出现真空（round-128）」，钉 9 个子事实（延迟集合 / 兜底常量 / flush 清 live / `finishTurnForThread` 调用点 ≥2 / 仅选中线程延迟 / clear 接受 `keepLiveCommands` / `turn/completed` 走 finish / **`turn/completed` 不得再急切清空** / **`applyRealtimeUpdates` 不得直接 `setThreadInProgress(completedTurn.threadId, false)`**）。**反跑证明非空**——改动前 **41/42**、该项 FAIL 且诊断行 `…turn/completed 仍急切清空=YES(退化了) / applyRealtimeUpdates 直接 setThreadInProgress=YES(退化了)`；改动后 **42/42**。（**口径修正的诚实说明**：断言第一版写的是「live 命令的 `omitKey` 清空**全文件只允许 1 处**」，实测全文件有 **4** 处——另三处是**合法**路径（回合失败回滚 / fork / 重置）——故改钉「**收尾路径**不得急切清空」这一语义不变式，而不是数个数。）

**生产构建复跑**：`vite build` EXIT=0（重建 `dist/`；服务 4191 按请求从磁盘读 `dist/index.html` ⇒ 重建即生效、无需重启）→ 新闸门 **6/6**、`verify-mobile-375` **exit 0**、`check-thread-switch-feedback` **12 项全过**（`frozen=12/9ms` ≤ 60ms 预算；`chars=161→197`；`rows=10 with-messages=4`）、`check-fonts` **13/13**、`check-theme` **15/15**、`check-ui-contract` **42/42**；`verify-conversation-mount-scroll`（需线程可滚 >150px）、`verify-conversation-list-persists` / `verify-review-pane-scroll`（需 >600px）因本轮隔离 `CODEX_HOME` 里最长线程只可滚 **132px** 而 **SKIP 退 2**（环境不足、非失败）。`check-fonts` / `check-theme` 需 `NODE_PATH=node_modules/.pnpm/playwright-core@1.62.1/node_modules`。

**验证基线**：`vue-tsc --noEmit` EXIT=0、全量 **742 例 / 742 通过（76 文件）零失败**（默认 15s 超时下即零失败）、`vite build` EXIT=0（三次：13.77s / 12.97s / 13.66s）。

**复现真实回合的四道坑（本轮都真实拦过一次）**：①**不能在仓内 cwd 起服务** —— codex 按**进程 cwd** 发现 `<cwd>/.codex/config.toml`，其 `model_provider` 会被「忽略为 unsupported」却仍**覆盖**，实测把模型打回 `deepseek-v4-flash`（litellm 死端口 → 404）；②**`%TEMP%` 不可作 `CODEX_HOME`** —— codex 拒绝在临时目录创建 helper 二进制（PATH aliases），app-server 会中途异常退出（`thread/read 502 thread not loaded` / `turn/start 502 app-server exited unexpectedly`）；③`env_key = "OPENAI_API_KEY"` ⇒ 服务进程需要该环境变量（从真实 `~/.codex/auth.json` 读出来注入）；④隔离 home **只拷 `auth.json`**，其余全部自建 —— **绝不碰真实库**。

**未发布**：未 bump 版本、未 tag；`5133d130` 已在本地 `main`（round-122 ~ round-128 随下一次发布走，npm `latest` 仍是 `0.1.127`）。

## round-133（经 `thread/read` 打开的线程也播种游标链：上翻 7.5s → 1.0s，未发布）

**提交**：

| 提交 | 信息 | 规模 |
| --- | --- | --- |
| （本轮修复提交） | `fix(thread-turn-page): 经 thread/read 打开的线程也播种游标链（round-133）` | 3 文件（产品 2 + 测试 1，30 增 0 删） |
| （本文档提交） | `docs(handover): round-133 上翻游标链播种修复（轮次文档 + 总入口 + 提交史）` | 4 文件 |

**由来**：用户「推送，接着修症状2」—— 先把本地 8 个提交推上 `origin/main`（`e8e7a94a..c9d4a052`），再实施 round-132 §3.2 / §3.3 / §10.6 / §11.6 **点名却未实施**的那条缺口。

**根因（一条接线漏了，不是路由本身慢）**：上翻路由 `/codex-api/thread-turn-page` 只在 `ThreadTurnPageCursorChain` 里有该锚点的游标时才走有界页（`threadTurnPage.ts` L279 `chain.lookup(...)`，拿不到就 `return null` ⇒ 路由回落 `readThreadForTurnPage()` ＝ 全量 `thread/read {includeTurns:true}` + 内存切片）。而链的**唯一**种子本来是 `thread/resume` 的 `initialTurnsPage.nextCursor`；round-110 引入的 **`thread/read` 有界读同样拿到了 `nextCursor`，却没有交给同一个 `onTurnPageBoundary`**（`codexAppServerBridge.ts` L1943–1947 未传）⇒ **任何经 `thread/read` 打开的线程链是空的**，首次上翻必然未命中并回落。而 `readThreadWithTurnPage` 内部**早就在用这个游标**（`needsCount = page.data.length > 0 && page.nextCursor !== ''`），**手里握着播种所需的全部信息，只是没有出口**。

**改动（2 个产品文件 + 1 个测试文件）**：

- `src/server/bridge/threadReadTurnPage.ts`：`ThreadReadTurnPageDeps` 新增 `onTurnPageBoundary?: (threadId, oldestTurnId, olderCursor) => void`；在 `const turns = [...page.data].reverse()` 之后、`needsCount` 之前回报边界 ——

```ts
const oldestTurnId = readNonEmptyString(asRecord(turns[0])?.id)
if (oldestTurnId && deps.onTurnPageBoundary) {
  deps.onTurnPageBoundary(threadId, oldestTurnId, page.nextCursor || null)
}
```

  三处细节是有意的：①锚点取 **reverse 之后**的 `turns[0]`（页是 newest-first，最老一轮才是前端下次要问「它之前是什么」的锚点）；②空页（新线程）**不回报**（`readNonEmptyString` 自然得空串）；③`page.nextCursor || null` —— 短页 `nextCursor === ''` 表示已到线程开头，而 `ThreadTurnPageCursorChain.record` 对空游标本来就是**直接 return**（不记）。
- `src/server/codexAppServerBridge.ts`：`thread/read` 那一支接上 `recordThreadTurnPageBoundary`，与 resume 支**逐字对称**（resume 支是 round-86 加的，同样一行）。

**为什么这个改动只会变快、不会变慢**：`readBoundedThreadTurnPage` 在拿不到游标时**才**回落。多播一个边界 ⇒ 命中率只增不减；命中时是 ~1.0s 的有界单页，未命中时是 ~7.5s 的全量读，而**两条路返回的内容已被 A/B 证明逐字节相同**。

**测试与反跑（决定性）**：

- **单测 8 → 11 例**（新 describe「older-turn cursor boundary (round-132)」）：①满页 ⇒ 回报 `('thread-1', 't11', 'cursor-back')`（page `t20…t11`、reverse 后 `turns[0] === t11`）；②短页到线程开头 ⇒ `('thread-1', 't1', null)`；③空页（新线程）⇒ **一次都不回报**。
- **`tmp/r133-flip-boundary.cjs off|on`**（把回报语句改成 `if (false && …)`）⇒ `off` 时 **2 failed | 9 passed**（`expected "vi.fn()" to be called 1 times, but got 0 times`）、`on` 还原后 **11 passed** 且与备份**逐字节一致**（7515 字节）。**踩到并修掉的一处**：第一版用**跨行**锚点，而该文件是 **CRLF** ⇒ `NEEDLE` 出现 **0 次**、脚本正确拒绝写盘（`断言失败：NEEDLE 出现 0 次（应为 1），不写盘`）；改**单行**锚点后 `NEEDLE=1 次`。
- **端到端 A/B（同窗口同锚点）**：`tmp/r133-e2e-first-scrollup.cjs`。线程 `01a0cdce-…-4801b2a1cfa9`（**174 轮**），锚点 `ids[len-10]` ＝ `01a0eace-18ec-7243-bfdf-94a22035cd82`（index 164）：

| 相 | 进程/链路状态 | 首次上翻 | 字节 | turns | startTurnIndex | oldestReturnedTurnId |
| --- | --- | --- | --- | --- | --- | --- |
| **A** | 进程刚起、链空（＝修复前等效） | **7558ms** | 1631498 | 10 | 154 | `01a0e64e-…-6f3d2d9e31fb` |
| **B** | 先 `thread/read` 打开（修复后已播种） | **1018ms** | **1631498** | **10** | **154** | **`01a0e64e-…-6f3d2d9e31fb`** |

  ⇒ **7.4×**，且载荷**逐字节相同**。B 相里 `thread/read` 返回的 10 轮其**最老一轮恰好就是锚点**（`threadTurnStartIndex = 164`）—— 这正是被播进链的那个键，所以下一句请求必然命中。
- **排除替代解释（同进程换一个没播种过的锚点）**：`tmp/r133-probe-unseeded-anchor.cjs` —— B 相之后**同一个已「热」的进程**里，已播种锚点 `01a0eace-…` **999ms** vs 未播种锚点 `01a0e3ae-…`（`ids[len-30]`）**6566ms** ⇒ 「快」的唯一条件是**该锚点在链上**，不是 app-server 变热、也不是缓存副作用。

**验证基线**：`vue-tsc --noEmit` **EXIT=0 / 0 错误**、全量 **747 例 / 747 通过（76 文件）零失败**（＝ round-132 基线 744 ＋ 本轮 3 例）。**闸门脚本本轮未改**：`check-ui-contract.cjs` 不覆盖 `src/server/**`（实测 `grep src/server` **零命中**），故该不变式由单测 ＋ 端到端守，**不硬塞进 UI 契约**。

**推送（本轮完成）**：本地 8 个提交（round-130 ~ round-133 前序）推上 `origin/main`，`e8e7a94a..c9d4a052`。**环境事实**：本机 WorkBuddy 注入的 `HTTP(S)_PROXY=127.0.0.1:64639` 对 `github.com` 的 `CONNECT` 返 **502**（只放行 `api.github.com` / `codeload`），用户自建的 **7890** 可通 ⇒ 正确姿势是 `env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy git -c http.proxy=http://127.0.0.1:7890 push origin main`。**另一条坑**：git **没有** `https.proxy` 这个配置项（写它等于没写、仍走环境变量 `https_proxy`），必须用 **`http.proxy`**；`credentials` 走 `manager-core`，`git` 会打印 `git: 'credential-manager-core' is not a git command` 但推送仍然成功（凭据从 Windows 凭据管理器取到）。

**诚实边界**：①**链仍是进程内内存** —— 桥 / app-server 重启（rollout ordinal 重编号）、LRU 淘汰（64 线程 × 每线程 256 锚点）之后仍会回到未命中；本轮只是把「打开线程」这条路也接上，**不等于**链永远命中（重启后若在打开该线程**之前**就上翻，仍是 7.5s 量级，A 相读数就是它）。②**回落路径仍不登记锚点**（`threadTurnPage.ts` L323 只在有界路径执行）⇒ 一次未命中之后靠 30s TTL 的全量读缓存兜住（A 相第二次 891ms），而该缓存会被 `thread/resume`/`thread/read`/`thread/fork`/`thread/start` 的 pipeline 快照与任何带该 threadId 的通知清掉，清掉之后又是 7.5s。③**`record` 对 `null` 游标是 no-op** ⇒「线程开头」这个边界靠的是「查不到 ⇒ 未命中 ⇒ 回落」，不是「查到 null ⇒ 停住」；本轮没有改变这一语义。④只在本机 Windows / codex-cli 0.160.1 的隔离 home（174 轮线程）上实测；更大的线程（round-132 记的 30.89MB / 16 轮那种）收益比例只会更高但**未实测**。⑤症状 A 的 §10.6 第 ②③④ 条**一行未动**。

**未发布**：未 bump 版本、未 tag（npm `latest` 仍是 `0.1.127`）。
## round-132（线上「Thinking 时消息列表整段消失」定位并修复 + 上翻 6–7s 归因，未发布）

**提交**：

| 提交 | 信息 | 规模 |
| --- | --- | --- |
| （本轮修复提交） | `fix(thread-load): 服务端答 0 条不再清空本地消息历史与轮次索引（round-132）` | 3 文件（产品 1 + 测试 1 + 契约 1，145 增 3 删） |
| （本文档提交） | `docs(handover): round-132 线上两症状定位与修复（轮次文档 + 总入口 + 提交史）` | 4 文件 |

**由来**：用户报「更新 codex-mobile-re 版本后线上环境 Thinking 状态消息列表没有展示、而且 rpc 接口还会长时间挂起」；追问一轮后补充**关键口径**——「**是整个消息列表都不见了，在 Thinking 的时候**」。本轮先把两个症状拆开定位（§症状② / §症状①），再实施症状①的修复。

**症状②（上翻 RPC 长时间挂起）：6–7s 全部来自「游标链未命中即回落全量水合」**。冷进程**同窗口同锚点** A/B：回落＝全量 `thread/read{includeTurns:true}` ＝ **7202ms / 1.46MB / 1198 items**（每轮 items `7,6,191,196,232,1,90,22,445,8`），命中链的有界单页 ＝ **969ms**，**逐轮 items 个数逐字相同** ⇒ ①6–7 秒在回落、②**回落不丢内容**（早先看到的 0.19MB 那条是**另一个更旧窗口**的固有体积）。链路：`readBoundedThreadTurnPage` 在 `chain.lookup(threadId, beforeTurnId)` 为 null 时 `return null` → 路由回落 `readThreadForTurnPage()`。**游标链唯一种子是 `thread/resume` 的 `initialTurnsPage.nextCursor`**（`threadReadTurnPage` 拿到 `nextCursor` 却**没接** `onTurnPageBoundary`），且链只在**进程内存**、app-server 重启后 rollout ordinal 重编号即全部作废。**真实 App 连续上翻不触发**（浏览器实测 6 次全 852–1013ms，锚点依次是 resume 边界 → 上一页新边界）。**顺带纠正上一轮一条口径**：先前的「稳定 6.0–7.5s 冷热一致」是**探针自污染**——`r132-probe-decompose.cjs` 每次上翻前先发一条 `thread/read{includeTurns:true}`，经 `storeThreadReadSnapshot` 把全量读缓存删掉，于是每次都冷。**本轮只做归因，未改此路**（四条候选见轮次文档 §10.6）。

**症状①（Thinking 时整个消息列表不见）：定案 + 修复**。代码链上 `messages` 的每一步（`mergeThreadMessageStreams` → `insertTurnSummaryMessage` → `insertPersistedTurnDurations` → `insertModelSwitchMarkers`）**只插入不删除** ⇒ 列表空白 **⟺ `persisted` 为空**；而 `persisted` 唯一的清空通道是 `loadMessages` 里那行 `preserveMissing`（非 silent 刷新 **且** 本地无乐观消息时为假 ⇒ `mergeMessages` 把服务端返回**整体替换**本地历史）⇒ 服务端答 0 条＝本地历史被换成空数组；此时 `isLoadingMessages` 为假（非 silent 且已加载过）、App 的 `lastStableFilteredMessages` 兜底不生效，而渲染侧空态又带 `!liveOverlay` ⇒ **列表空掉、只剩一个 Thinking 浮层**。**三个必要条件逐条实测**：①线程处于 Thinking —— 非 inProgress 时前台恢复的全量刷新**命中复用缓存、连一次 `thread/read` 都不发**（发了 list/config/rateLimits/skills，items 167 不动），只有 Thinking 才会真的取数；②`persisted` 里**没有**乐观用户消息 —— 刚发送就给空响应时 items **169 不动**（乐观消息把 `preserveMissing` 抬成 true）；③该次响应 **0 条**。**真实浏览器确定性复现**：两次前台恢复，`refresh#1` 用「真响应打补丁（`status=inProgress` + 补等值 `userMessage`）」让乐观消息退场，`refresh#2` 把 `thread/read` 换成 `{turns:[], status:{type:'inProgress'}}` ⇒ **`items 169 → 1`**（`userRows 11→0`、`turns 11→1`、正文 `38360 → 8` 即 "Thinking" 本身），浮层**全程在位**。**三条会给出「0 条」的现成通道**：`isThreadMaterializationPendingError` 兜底（直接答 `{turns:[],status:{type:'inProgress'}}`——空列表与 Thinking 由**同一响应**制造）、`isEmptyThreadReadError` 的空缓存快照、round-110 有界读把**一页空数组**当作「线程真的没有轮次」（后者是更新后新引入的形态）。

**修复（实施轮次文档 §10.6 第 1 条，并顺手保护轮次索引）**，唯一产品文件 `src/composables/useDesktopMessageHistoryLoading.ts`：把 `previousPersisted` 提前取出，新增判据

```ts
const suspiciousEmptyResponse = nextMessages.length === 0 && previousPersisted.length > 0
```

该判据**同时**用于三处——①进 `preserveMissing`（服务端答 0 条时保留本地历史）；②成立时**不**调 `replaceTurnIndexLookupForThread`（空快照同样没有轮次表，覆盖会让保留下来的消息失去轮次索引：轮次耗时 / 轮次摘要 / 计划归档都按 turnId 查这张表）；③成立时打一条可检索的 `[thread-load] <threadId>: server returned 0 messages while N are persisted locally; keeping local history`。**判据与 §10.6 原文的差别**：原文只判 `nextMessages.length === 0`，实现补了 `&& previousPersisted.length > 0`——单侧判据会在**真正的空线程**上刷噪音警告；补上后本地也空时行为与改前**逐字相同**（`mergeMessages` 对两个空数组本来就返回 `[]`）。

**测试与反跑（决定性）**：

- **单测 2 例**（新 describe「empty thread-read snapshot protection (round-132)」）：①本地有历史 + 非 silent 刷新答 0 条 ⇒ 消息仍是 `['user-1','agent-1']`、轮次索引 `turn-1 → 0` 仍在、恰好一条 `keeping local history` 警告；用例**忠实还原触发条件**（`Date.now` 前推 5s 越过 2s 复用窗 + 线程 `inProgress` ⇒ 真的会发请求、非 silent、不带 `force`，与线上「前台恢复」同一路径）。②反向保证：本地也为空的真新线程仍是空列表且无噪音警告。
- **`tmp/r132-flip-fix.cjs off|on`**（把判据临时换成 `false`）⇒ 用例断言 `expected [] to deeply equal ['user-1','agent-1']` **变红**，`on` 还原后转绿。脚本对替换片段做「出现次数必须为 1」断言并留 `.bak` 复核（`与备份一致 = true`、16381 字节）。
- **静态契约 42 → 43 项**（`check-ui-contract.cjs`，与 round-128 同做法）：新增「空快照不覆盖本地消息历史与轮次索引（round-132）」钉 5 个子事实（双侧判据 / 进 `preserveMissing` / `previousPersisted` 先读后写 / 跳过轮次索引覆盖 / 留 warning）。**反跑证明非空**：改动前 **42/43**、该项 FAIL 且诊断行 `双侧判据=NO`；改动后 **43/43**。**诚实说明**：静态断言钉的是**形状**（把判据换成 `false` 时其余 4 个子事实仍 `yes`），行为层证据是上面那条单测与下面的浏览器 A/B。
- **浏览器端到端复跑（同一条决定性探针前后对照）**：`tmp/r132-e2e-thinking-wipe2.cjs` ⇒ 修复前 `refresh#2` 的 `items 169 → 1`；修复后 **`items 169 → 169`**、`items=0` 的样本 **0**。**无需重启服务**：桥按请求从磁盘读 `dist/`（实测服务返回的入口 chunk 哈希与磁盘一致），前端 `vite build` 重建（15.83s）即生效。

**验证基线**：`vue-tsc --noEmit` **EXIT=0 / 0 错误**、全量 **744 例 / 744 通过（76 文件）零失败**（＝ round-131 基线 742 ＋ 本轮 2 例）、`check-ui-contract` **43/43**、`node --check scripts/check-ui-contract.cjs` OK、`vite build` EXIT=0。

**本轮新增探针（`tmp/`，未入库）**：`r132-copy-home-measure.cjs`（可复用的**等长路径**隔离副本测量器）、`r132-probe-home-writemap.cjs`、`r132-probe-big-copy.cjs`、`r132-probe-bridge-big.cjs`、`r132-probe-turnpage-coldchain.cjs`、`r132-probe-decompose.cjs`、`r132-probe-cursor-cost.cjs`、`r132-probe-ab-chain.cjs`、`r132-probe-payload-paths.cjs`、`r132-probe-coldchain-ab.cjs`（**冷进程同窗口 A/B，症状②的决定性读数**）、`r132-probe-live-blank.cjs`、`r132-probe-vue-state.cjs`（结论：生产构建下 `app._instance` 不挂、App 的 `setupState` 为空，**该仪表在本构建不可用**）、`r132-e2e-open-big.cjs`、`r132-e2e-scrollup-big.cjs`、`r132-e2e-inject-archive.cjs`（**注入实验：`.reasoning-block` 0 → 10，证明渲染/合流管线正常**）、`r132-e2e-empty-wipe.cjs`、`r132-e2e-thinking-wipe.cjs`、`r132-e2e-thinking-wipe2.cjs`（**决定性复现/复验**）、`r132-e2e-newthread-live.cjs`、`r132-e2e-send-live.cjs`、`r132-e2e-live-blank.cjs`、`r132-flip-fix.cjs`、`r132-doc-crossref.cjs`、`r132-memory-payload*.md` 等 ＋ 各自 `.txt` / `.json`。

**环境事实（本轮踩到并记住）**：①**拷贝 home 不是隔离**的进一步确认——`state_*.sqlite` 记的是 rollout 的**绝对路径**，必须**同长度改写**（`C:\Users\cattails\.codex` 24 字符 → `D:\codex-home-isolate123` 24 字符）才安全；真实 `~/.codex` 被托管 daemon（`app-server-daemon/releases/0.161.0`，PID 33400）占用，**绝不能**在其上再起 app-server。②**写盘映射已实测**：`thread/read` / `thread/turns/list` / `thread/resume` 对 rollout **只读**（只新建 sqlite `-wal/-shm` 边车）⇒ 可安全直连副本 home 做只读测量。③**round-131 的「拷 home 后 0 轮」曾被误判为隔离失败**，本轮用干净副本复测证明那是**那次的 JSON 重写膨胀破坏了 rollout**，隔离手法本身有效（12 轮全在）。

**诚实边界**：①**线上那一次「0 条」出自哪条通道仍未确证**（桥层三条都能给 0 条），区分需要线上桥日志或那一次 `thread/read` 的响应体——建议下次复现时抓 `/codex-api/rpc` 的响应体并查桥日志有无 `materialization` / `rollout … is empty`。②症状②**只归因、未修**。③修复保住的是**消息**，`setThreadInProgress` / `status` 语义未动 ⇒ **可疑响应仍可能让界面出现一个不该有的 Thinking 浮层**。④判据只覆盖「本地有历史而服务端答空」；当前产品里不存在「服务端合法清空一条线程」的路径，若将来出现，该保护会表现为**保留陈旧历史**。⑤与症状②**无因果关系**，是两个独立缺陷。⑥**未发布**（npm `latest` 仍 `0.1.127`）、**未推送**（本会话外网不通）。

**未发布**：未 bump 版本、未 tag；本轮提交待在本地 `main`（round-122 ~ round-132 随下一次发布走）。

## round-131（`execPtyChannel` / `rollbackTurnContext` 的 0.158.0 实测在 0.160.1 上复验，未发布）

**提交**：

| 提交 | 信息 | 规模 |
| --- | --- | --- |
| `15db1cfb` | `docs(comments): 复验 execPtyChannel / rollbackTurnContext 的「0.158.0 实测」结论（round-131）` | 2 文件（20 增 0 删，纯注释） |
| （本文档提交） | `docs(handover): round-131 PTY / 回滚复验（轮次文档 + 总入口 + 提交史）` | 3 文件 |

**由来**：用户「execPtyChannel.ts / rollbackTurnContext.ts 的旧结论进行复验」，结清 round-130 §十⑥ 与 §十一① 明确记的「未在 0.160.1 复验」。

**结论先行**：两个模块头部那批「0.158.0 实测」的结论在 0.160.1 上**逐条成立**（PTY 14/14 断言、回滚正确性 5 项全过），**产品源码零行为改动**（只追加注释）。唯一未复现的是 round-113 §三 那张成本表的**绝对值**，原因已定性（下）。

**口径**：与 round-116 / round-113 同构——**直连 `codex app-server`**（stdio JSON-RPC；PTY 用全新空 home，rollback 用「逐字拷贝的 home」），不是经桥。exec 与线程无关，故不受下面的隔离问题影响。

**PTY（`command/exec`，14/14）**：banner = `\u001b[2J\u001b[m\u001b[HMicrosoft Windows [版本 10.0.19045.6466]\u001b]0;C:\Windows\system32\cmd.exe\u0007\u001b[?25h`；4 帧 / 4 个不同到达时刻＝真增量；`echo R130PTY-MARKER` 回显命中；`chcp 65001` 后 `中文-测试-é` 逐字命中；`resize`/`terminate` 均 `{}`；大输出 **283 帧 / 38248B / `capReached=true` 的帧 0**；`exit` → `{"exitCode":0,"stdout":"","stderr":""}` 且**所有 delta 先于最终响应**；会话 B 含 `ONLY-B` 而不含 A 的 marker；`terminate` 后 `exitCode = 1`（与 round-116 §四「退出码透传」一致）；stderr 无 error/warning。**附带修正一条读法**：`command/exec/outputDelta` 的 params 键实测为 `processId, stream, deltaBase64, capReached`——`capReached` 是**每帧自带**的布尔字段，用「有没有收到 cap 通知」判上限是错的。

**回滚读取（7 个真实线程，正确性全过）**：三条路径 A=`thread/read{includeTurns:true}`、B=`{includeTurns:false}`、C=`thread/turns/list{limit:10000,desc,itemsView:"notLoaded"}` + `nextCursor` 链（与 `readThreadTurnIds` 同参数）。读数（12 轮那条）：A **21ms / 0.01MB**、B **1ms / 1046B**、C **1ms / 2381B / 1 页**；其余 6 条线程 A 2–4ms、B 0–2ms / ~1KB、C 1–2ms / 0.4–0.8KB。**7/7 线程**：C 的 id 序列与 A **逐位一致**；B 与 A 的 `thread` 对象**字段集与取值逐字相同**（`onlyFull`/`onlyMeta`/`changed` 三类全空，字段数仍 **32**）；两次读的 `path` 相同。**scope 语义**：最老/中间/最新/不存在四种 target 下 `single_turn` 与 `turn_and_later` 由 A 与由 C 推得的集合**完全相等**。**桥端到端**：`POST /codex-api/thread/rollback-files`（bogus anchor，只读）→ `200 {"reverted":0,"errors":[],"message":"No turns to revert"}`。

**为什么绝对值没复现（三条证据）**：①本机已无大线程——最大 **155KB / 12 轮**，round-113 的 12.12MB/16 轮线程随 `tmp` 清理；②把最大 rollout 的 `message` 正文（唯一会被水合成 items 的形态）膨胀到 **13.37MB**，A 列响应仍是 **0.01MB**；差分定位：响应里**有**原始正文「只回复一个词」、**没有**膨胀串 `R131PADDING`；③真因 = **拷 home 不是隔离**——app-server 的 turns/items 走自有状态库，副本 `state_*.sqlite` 记的是 rollout 的**绝对路径**，直接证据：`CODEX_HOME=D:/code/codex-mobile/tmp/r130-rb-inject` 时 `thread.path` 仍返回 `D:\code\codex-mobile\tmp\r130-codex-home\sessions\…jsonl`。另两条排除项：只拷 `sessions/`（无 sqlite）→ `thread/list` 7 条但 **turns = 0**（轮次索引在库里）；同长度改写副本 sqlite 的绝对路径（`state_5.sqlite` 7 处 / `logs_2.sqlite` 57 处）→ 仍 **0 轮**（`logs_2.sqlite` 带 `-wal`，未随副本）。`thread/inject_items` 注入 12×1MB 后 `thread/read` 与 `turns/list` 都**不含**注入串——该方法只进「模型可见历史」。

**0.160.1 的新契约事实（本轮的额外收获）**：`ThreadReadParams.includeTurns` 的文档已改为「When true, include turns and their items from rollout history. **Full-history hydration is deprecated for paginated threads; prefer a metadata-only read and page with `thread/turns/list` and `thread/items/list`.**」；`Turn` 新增必填 `itemsView`（`TurnItemsView = "notLoaded" | "summary" | "full"`），`ThreadTurnsListParams` / `ThreadResumeInitialTurnsPageParams` 均有 `itemsView?`。⇒ `rollbackTurnContext`（round-113）、`threadTurnPage`（round-86/104）、`threadReadTurnPage`（round-110）一直以来的做法**正是上游现在的官方建议**；`includeTurns:true` 作为回落兜底仍可用，但语义上已是过渡形态。

**本轮踩的坑（已还原）**：取证期间 `thread/inject_items` **写穿到 4191 服务真实 home 的 rollout**（`01a11baf…d8b7`：155.4KB / 123 行 → 12.16MB / 136 行），根因同上（副本里的线程仍解析回源 home 的绝对路径）。处置：用探针运行**之前**就拷好的干净副本逐文件还原——7 份里 6 份本来就逐字节相同，1 份还原后**逐字节相同**；复核服务 home 内**探针标记零残留**。教训：拷 home 只对「从未被加载过」的线程等价于隔离；一旦拷了 `state_*.sqlite` 就必须同长度改写其中的 rollout 绝对路径**并连 `-wal`/`-shm` 一起拷**；更稳的做法是造**全新空 home 再自己种数据**。

**验证基线**：`vue-tsc --noEmit` **EXIT=0 / 0 错误**、全量 **742 例 / 742 通过（76 文件）零失败**、`check-ui-contract` **42/42**、exec/PTY 探针 **14/14**、回滚复验探针 **11/12**（唯一 FAIL ＝ §四 已定性为「不可复现」的那条断言）。改动只有注释，复跑是为了不把「注释改动」当免检理由。

**诚实边界**：①回滚侧的性能结论本轮**没有量测**，只有「两条廉价路径恒定在毫秒/千字节级」这一相对事实。②PTY 只覆盖协议层，**未**重跑 round-116 的端到端（真实 vite dev + SSE + 终端路由）。③桥端到端只测 bogus anchor 前缀，「找到轮之后的 patch 应用 / 命令文件回退」一行未动。④`multiPage = 0`，id 链多页能力无新读数。⑤污染已还原但「还原」是**文件层**的（4191 是本轮自起的 dev 实例）。⑥未发布（npm `latest` 仍 `0.1.127`）、未推送（本会话外网不通）。

**未发布**：未 bump 版本、未 tag；`15db1cfb` 待在本地 `main`（round-122 ~ round-131 随下一次发布走）。


## round-130（codex-cli 0.160.1 协议复测，未发布）

**三个提交**（按「src → schema → 闸门」拆分，每个提交单独可编译）：

| 提交 | 信息 | 规模 |
| --- | --- | --- |
| `1f281aab` | `fix(protocol): 适配 codex-cli 0.160.1 的契约漂移 + 补齐复测口径注释（round-130）` | 13 文件（43 增 12 删） |
| `47d32ede` | `chore(docs): 同步 app-server 协议快照到 codex-cli 0.160.1（--experimental）` | 190 文件（9 172 增 3 514 删） |
| `3a4cdc47` | `test(gate): 切换反馈闸门在环境不足时退 2（SKIP），不再伪装成回归（round-130）` | 1 文件（18 增 3 删） |

**由来**：用户「我把 codex-cli 更新到了 0.160.1，还有哪些需要处理？」，并结清 round-129 §四⑤ 明确记的「未在 0.160.1 上复测」。

**结论先行**：**本轮未发现任何回归**；升级本身带来两项**正向**行为变化（历史可真正分页上翻、中断抢占快约 3 倍），代价是 schema 出现 3 处类型层漂移（已处置，无运行时影响）。

**契约变化（真机实测）**：①`thread/turns/list` **已实现**（0.158.0 档每次回 `-32601: list_turns is not supported yet`），返回 `{data:[{id,items,itemsView,status,error,startedAt,completedAt,durationMs}],nextCursor,backwardsCursor}`——turn 新增 `itemsView` 字段，`notLoaded` → `items:[]`、`full` → 带正文（实测 4 项）、**省略即 full**；②`features.instant_interrupt` **首次真实生效**——同 prompt / 同隔离 home / 同二进制，唯一变量是 flag：`true` 抢占间隔 **5799ms** vs `false` **17476ms**（≈3×），横幅 `Instant interrupt: on`、stderr 零警告；③请求方法表 **170 个**（`thread/*` 48），`thread/rollback` 确已移除（上游 0.156），**未发现任何本仓活跃调用被移除**——本仓 round-106 起已统一走 `thread/revert`。

**最重要的发现：round-86/110 的有界分页第一次真正生效**。这两轮写的有界路径（打开线程走 `initialTurnsPage`、上翻走 `turns/list` 游标链）**都依赖 `thread/turns/list`**，而它在 0.158.0 档上必回 `-32601` ⇒ 打开线程回落到全量 `thread/resume`、上翻走到 round-102 的 `olderTurnsUnavailable` 边界（提示「当前 codex-cli 版本暂不支持加载更早的消息」）。**即：那两轮写的有界代码在本机历史上从未被真正驱动过。** 0.160.1 让它第一次跑通，真机取证（隔离 home 上造的 **12 轮**线程，经真实服务）：

| 环节 | 读数 | 期望 |
| --- | --- | --- |
| 连续开 12 轮时 `thread/read` 的 turns | 递增到 **10 就停住**（第 11、12 轮仍 10） | 只水合一页的表征 |
| `thread/resume` 返回 turns | **10** | 10（= `THREAD_RESPONSE_TURN_LIMIT`） |
| `threadTurnStartIndex` | **2** | 2 = 12 − 10 |
| `initialTurnsPage` 残留 | **false** | false（不得发两遍轮次） |
| 页内首轮 `items` 数 | **2** | > 0（页必须带正文） |
| 上翻 `beforeTurnId=第3条&limit=3` | ids **恰好 t1、t2**；`startTurnIndex=0`、`hasMoreOlder=false`、**`olderTurnsUnavailable` 未触发** | t1、t2 |
| 再上翻（`beforeTurnId=t1`） | **空** | 已到起点 |

⇒ 用户可见：「暂不支持加载更早的消息」**不再出现**；长线程上翻**不再回落全量水合**（＝round-102 P0 想避免的挂死路径）。round-102 的 P0 分支与 `isThreadTurnPageUnsupported()` 闩锁在 0.160.1 上恒为 false——**对旧二进制仍然有效**，只是不再是每台机器的必经之路。

**schema 快照同步暴露的契约漂移（本轮的意外收获）**：快照 0.153.4 → 0.160.1（json 416→440：新增 26 / 删 2 / 改 62；ts 827→875：新增 50 / 删 2 / 改 47；删的 2 个是 `v2/ThreadRollback{Params,Response}`）。因为 `src/api/appServerDtos.ts` 直接 export 这些生成的 TS 类型，**换快照＝换类型定义**，`vue-tsc` 当场报出 **5 条错误 / 3 个位置**：①`UserInput` 的 image 变体变成 `{ type:"image", detail? } & ({url} | {fileId})`，直接读 `.url` 不再合法；②`Thread` 新增必填 `environments` / `originator` / `daybreakEnabled`；③`mcpToolCall` 新增必填 `mcpAppUi`。处置：②③ 补 fixture；①加 `'url' in block` 收窄联合类型——**运行时行为逐字不变**（原守卫 `typeof block.url === 'string'` 对 `{fileId}` 变体本就是 false），差别仅在能否编译。修完 **0 错**。

**注释口径更正（16 处 / 11 文件）**：原注释称「app-server 不实现 thread/turns/list（codex-cli 0.158.0）」，补一行 round-130 复测结论说明该降级分支只对旧二进制可达。**原则：只追加、不改写历史版本号**——因为本轮同时发现这批「0.158.0」标注本身存疑（见下）。改动脚本对每个片段断言「出现次数必须为 1」，任一失败整批不写盘。

**闸门退码（环境不足不再伪装成回归）**：`check-thread-switch-feedback.cjs` 有两处在环境不足时走退 1：①等 `.thread-row` 30s 超时（这个 home **一条线程都没有**），②`contentIds.length < 2`（**只有 1 条有消息**）。均改为打印 `SKIP:` 并**退 2**，退出码约定写进文档头。**三条取证**：空 home（4192，`thread/list=[]`）→ **2**；只有 1 条有消息线程（4193，`rows=1 with-messages=1`）→ **2**；正常 home（4191，7 行 / ≥2 条有消息）→ **0**（`all checks passed`，`frozen=8ms ≤ 60ms` 预算）。①那处是修脚本时才发现的第二处——原报告只提「1 条有消息的线程退 1」。

**环境层新事实（影响「升级是否生效」的判断）**：本机有 **3 套 codex** —— ①PATH 上的 pnpm 全局 = **0.160.1**（用户升级的这套，`resolveCodexCommand()` 当前正确解析到它）；②`%LOCALAPPDATA%\OpenAI\Codex\bin\<16hex>\codex.exe` = 桌面 App 的内容寻址缓存 = **0.154.0-alpha.6.2**（Sep 15）；③`~/.codex/packages/app-server-daemon/releases/{0.159.0,0.161.0}/` = 桌面 App 的托管守护进程。**关键**：此前 4191 的服务被显式钉在②上 ⇒ **round-123 ~ round-129 的闸门实际驱动的 app-server 是 0.154.0-alpha.6.2，而文档标注的是 0.158.0**。本轮已改钉 0.160.1 并重取全部读数。**这不推翻那些轮的结论**（它们量的是本仓行为，与补丁号无关；`turns/list` 相关几条更是从来没走通过），但**版本标注不可再当凭据**；本轮**未回溯修正**历史文档，只在此披露一次。

**验证基线**：`vue-tsc --noEmit` **EXIT=0 / 0 错误**（换快照初跑 5 错 → 修完归零）、全量 **742 例 / 742 通过（76 文件）零失败**、`vite build` EXIT=0（13.73s）、`check-ui-contract` **42/42**、`check-fonts` **13/13**、`check-theme` **15/15**、`check-thread-switch-feedback --self-test` **8/8**、`verify-command-block-handoff` **6/6**、`verify-mobile-375` PASS。三个滚动闸门在隔离 home 上 **SKIP 退 2**（线程只可滚 0px，环境不足）。

**诚实边界**：①「有界分页首次生效」由**代码路径 + 端到端读数**推出，不是与旧二进制直接对照（本机没有 0.158.0 可跑，只有 0.160.1 与被钉过一阵的 0.154.0-alpha.6.2）；那三条读数本身独立于版本叙事。②测试线程是 **12 轮**，不是 round-86 的 30.89MB/16 轮对照 ⇒ 只证**正确性**（含「确实走了有界分支」），**没有量性能**。③**`{fileId}` 形式的图片在 UI 上仍不显示**，且是**静默缺失**（`image` 类型不在「未处理」通道里）；要修需先定 fileId→URL 的解析语义与产品口径。④滚动类闸门在隔离 home 上是 SKIP ⇒ 0.160.1 上的**滚动行为本轮未验证**。⑤`execPtyChannel.ts` / `rollbackTurnContext.ts` 的 0.158.0 结论**未复验**（协议表层面已确认 `command/exec`、`thread/revert` 都还在）。⑥schema 生成环境未完全对齐历史（历史提交未记录 cwd 与 feature flag）。⑦未在 0.160.1 上复验即时中断的 **UI 侧观感**（A/B 是端到端时序）。

**未发布**：未 bump 版本、未 tag；`1f281aab` / `47d32ede` / `3a4cdc47` 待在本地 `main`（round-122 ~ round-130 随下一次发布走，npm `latest` 仍是 `0.1.127`）。

## round-129（闸门 freeze 预算按环境帧节奏归一，未发布）

**闸门提交 `ce8e7d75`**：`test(gate): freeze 预算按环境帧节奏归一，载机器上不再误红（round-129）`（1 文件：`scripts/check-thread-switch-feedback.cjs` 17 538 → 27 112 字节 / 203 增 9 删；**产品源码零改动**）。

**由来**：round-120 明确记「round-119 的 freeze 预算断言负载敏感仍未处置（闸门观察项，与重排无关）」。round-119 的原始记录：macOS 机器上老闸门无注入连跑 15 次，按失败签名分类得「`first-open freeze <= 60ms` 失败 **6/15**（frozen 61–100ms）」，且「本机空载时读数 50–60ms 本就贴着预算」。

**根因（两个独立缺陷）**：①断言＝**单次采样 + 绝对 60ms 阈值**，与机器无关的常数对比；②**指标本身会退化** —— `window.__freeze()` 原本「从点击那一帧起累加帧间隙，直到出现一个 <40ms 的帧就停」，默认机器正常帧短于 40ms；当每帧都 ≥40ms（载机器正是如此）时循环**永不 break**（旧实现无界累加；若只加一个 12 帧边界则变成 12×帧长），两个数都不再表示「点击到首次绘制」。**因此只把阈值放宽是无效的**——值已经爆炸，指标与阈值都得改。

**改动（唯一文件 `scripts/check-thread-switch-feedback.cjs`）**：①`__ambient(pct)` 支持任意分位、点击前开 **700ms 静默窗**（`AMBIENT_WINDOW_MS`）量本机此刻帧节奏；②`__freeze` 的停止条件从写死的 `<40ms` 改成 `quiet = max(40ms, 2×ambient_p50)`（快机器上退化为原来的 40ms 地板 ⇒ 测量逐字不变；慢机器上点击后第一帧就 break，读数回到「点击到首次绘制」语义）；③预算 `min(max(60ms, 2×ambient_p90), 200ms)`；④`FREEZE_BUDGET_MODE=absolute` 保留 round-128 及以前行为；⑤过载（2×ambient > cap）**跳过而非误红**（只打印 skip、不计失败）；⑥自测开关默认全关：`FREEZE_SYNTHETIC_LOAD_MS`（每帧 rAF 忙等）、`FREEZE_INJECT_CLICK_STALL_MS`（捕获相点击期阻塞）；⑦新增浏览器无关 `--self-test`（8 例算式，含 cap / skip）。

**关于合成负载为何必须是 rAF 忙等**：实测 `setInterval` 忙等（90ms 忙 / 180ms 周期）只把帧间隙 `max` 从 10ms 抬到 **96ms**、`p90` **仍是 8ms**（大多数帧不受影响、点击多半落在快帧上）⇒ 复现不了载机器；改成每帧忙等后 `p50 = p90 = max = 70ms`（**均匀**变慢），才等价于载机器看到的帧节奏。

**取证（决定性，唯一变量＝判定模式）**：跑在生产构建服务上（`dist/` 按请求读盘、`isDev=false`、该 home 10 条线程 / 4 条有消息）。

| 腿 | 条件 | 读数 | 结果 |
| --- | --- | --- | --- |
| A / A2 | 空载 / scaled | `frozen 10→11ms, ambient90 8ms, budget 60ms` | **PASS** |
| B | load=70 / **absolute**（＝round-128 及以前） | `frozen=74ms, ambient90=71ms, budget=60ms` ×2 | **FAIL 2/2** |
| C / C2 | load=70 / scaled | `frozen 74→73ms, ambient90 71→70ms, budget 142→140ms` | **PASS** |
| D | load=70 / scaled + 注入 150ms 点击期阻塞 | `frozen 316→300ms, ambient90 70ms, budget 140ms` | **FAIL 2/2** |
| E | load=70 / scaled + `cap=60`（过载） | `skip ×2`，无失败项 | **PASS**（EXIT 0） |

B vs C 是对照组：同一负载、同一构建、**唯一变量是判定模式**——`absolute` 判 `74>60` 失败（＝round-119 的假红逐字复现），`scaled` 判 `74≤142` 通过（假红消除）。D 证明没有「一律放行」（真回归形状仍 FAIL）。A/A2 证明空载严格度不变。E 证明过载走跳过。

**`--self-test`**：`node scripts/check-thread-switch-feedback.cjs --self-test` → **8/8、EXIT 0**（idle 保地板 60 / load 放大到 140 / absolute 忽略节奏 / 超限截到 cap / zero-ambient 回落地板 / 三条 cap-skip 判定）。

**为什么本轮不加静态契约断言**：`check-ui-contract.cjs` 只读 `src/` 的产品源码、不读 `scripts/`（已核对），把闸门断言塞进「UI 契约」属错位；本轮的「非空过」证据是上表的 **B vs C**（同一负载、唯一变量）与 **`--self-test` 8 例**，强度高于静态断言。

**验证基线**：`node --check` SYNTAX_OK、`vue-tsc --noEmit` EXIT=0、全量 **742 例 / 742 通过（76 文件）零失败**（与 round-128 基线逐字相同）、`vite build` EXIT=0（13.46s）。

**诚实边界**：本机（Windows）空载 `frozen=8–11ms`，**复现不了 round-119 的真实假红**，载态只能合成（且合成的是均匀变慢、与真实载机器的突发式停顿不同构）；归一化必然降低载机器上的灵敏度（`2×ambient` 以内的停顿无法与调度抖动区分），空载不受影响；ambient 只在点击前 700ms 窗口内采样，窗口内无停顿而点击瞬间来停顿仍可能误红（概率性残留）；过载跳过是「静默放行」，本仓无 CI 接线（只有 `.github/workflows/build-apk.yml`，不跑这些闸门）；未在 0.160.1 上复测。

**未发布**：未 bump 版本、未 tag；`ce8e7d75` 待在本地 `main`（round-122 ~ round-129 随下一次发布走，npm `latest` 仍是 `0.1.127`）。
