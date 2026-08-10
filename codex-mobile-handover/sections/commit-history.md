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

