# codexapp 本地开发环境交接

> 本仓库是 `codexapp`（Codex 的轻量级浏览器 Web UI，跑在 Codex app-server 之上）。本文档记录本地环境当前状态、启动方式、历次会话解决的「Codex CLI not found」与页面转圈问题、各轮验收进展，以及交接时需要注意的事项。

**当前快照**

| 项 | 值 |
|---|---|
| Git 分支 | main (synced) |
| Dev 端口 | 4173 |
| Dev 状态 | 运行中 · HTTP 200 |
| App-server | 正常响应 RPC |
| 工具链 | pnpm 11.18.0 · Node 22 |
| 最近提交 | 2ff6052 |

---

## 项目概况

`codexapp` 是一个面向 Codex 的轻量级 Web 界面，运行在 Codex app-server 之上，可从任何浏览器远程访问。技术栈为 Vue 3 + Vite 6 + TypeScript，npm 包名 `codexapp`（`codexui` 为别名）。上游仓库为 friuns2/codexUI，本机 fork 自 `cattails-lgao/codex-mobile`。

- 开发入口：`scripts/dev.cjs`，内部包装 Vite dev server
- 关键桥接层：`src/server/codexAppServerBridge.ts`（Vite 中间件，代理 `/codex-api/*` 到 codex app-server）
- 命令解析：`src/commandResolution.ts`（定位本机 codex CLI 可执行文件）
- 构建：`pnpm run build`（前端 vite build + CLI tsup）

## 当前运行状态

开发服务器正在 `http://127.0.0.1:4173/` 运行，页面与静态资源返回 200，codex app-server 的 RPC 调用（`thread/list`、`skills/list`、`config/read`、`provider-models`）均正常响应。以下为本次启动的实际日志：

```text
VITE v6.4.3  ready in 7934 ms
➜  Local:   http://127.0.0.1:4173/
[codex-api-perf] POST /codex-api/rpc -> 200 (1483ms, rpcMethod=thread/list)
[codex-api-perf] POST /codex-api/rpc -> 200 (1980ms, rpcMethod=skills/list)
[codex-api-perf] POST /codex-api/rpc -> 200 (1604ms, rpcMethod=config/read)
```

端口占用情况：`5173` 被本机 HBuilderX uniapp 项目占用（非本仓库），因此开发统一使用 `4173` 规避冲突。

> **服务当前健康。** 若之后页面再次「一直转圈」，优先怀疑 dev 进程僵死或 app-server 退出，按下一节「页面转圈的诊断」排查。

## 本次会话解决的问题

### 问题一：Codex CLI not found

打开页面提示 `Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.`，所有 `/codex-api/rpc` 请求返回 502。根因是三层叠加，其中两层仅存在于本机或本环境，一层在任意电脑上都会复现：

#### 层 1：磁盘 `src/` 残留旧 `.js` 构建产物

- **根因**：`src/` 残留 106 个未跟踪的旧 `.js` 构建产物（如旧版 `commandResolution.js`），Vite 解析 `import '../commandResolution.js'` 命中旧代码，不认识 pnpm 全局布局且缺 Windows `.cmd` shim 解析，导致 `resolveCodexCommand()` 返回 null
- **换机是否复现**：不会（git 中无这些文件）
- **解决方案**：删除全部未跟踪 `src/*.js`，Vite 自动回退到 `.ts` 源码

#### 层 2：pnpm 11 默认阻止依赖的 build scripts

- **根因**：pnpm 11 默认阻止依赖的 build scripts（`node-pty`、`esbuild`、`@firebase/util`、`protobufjs`），旧字段 `pnpm.onlyBuiltDependencies` 已被忽略，导致 `pnpm install` 返回非零码、dev 无法启动
- **换机是否复现**：会（任何 pnpm 11 电脑）
- **解决方案**：新增 `pnpm-workspace.yaml` 用 `allowBuilds` 声明允许构建的包

#### 层 3：TRAE 沙箱禁止写 `~/.codex`

- **根因**：TRAE 沙箱禁止 codex app-server 写默认的 `~/.codex`（sqlite 状态文件），启动即退出，RPC 返回 502
- **换机是否复现**：不会（仅 TRAE 沙箱终端）
- **解决方案**：设置 `CODEX_HOME` 指向工作区内、已被 `.gitignore` 忽略的 `.codex/` 目录

### 问题二：页面一直转圈

现象是浏览器打开 `http://127.0.0.1:4173/` 后无限加载。诊断确认 `4173` 端口虽有 node 进程监听，但 HTTP 请求全部超时（curl 返回 exit 28），属于上次会话遗留的**僵死 dev 进程**，页面请求得不到响应所以一直转圈。处理方式是终止该进程并重新启动 dev server，随后所有接口恢复正常。

> **排查方法。** 转圈时不要只看进程是否存在，要发真实请求验证：`curl.exe -s -o NUL -w "%{http_code}" --max-time 8 http://127.0.0.1:4173/`。若超时即进程僵死，重启即可。

### 第三轮验收修复（commit `eedf148`）

针对第三轮验收的 3 个问题做了修复，均已通过 Playwright 端到端验证（dev 环境：`http://127.0.0.1:4173/`）：

| 问题 | 修复 | 验证 |
|---|---|---|
| 压缩进度条在会话顶部独立横幅显示，不随消息流走 | 移除 `App.vue` 顶部横幅；压缩时向消息流注入 `compaction.pending` 行（旋转动画），收到 `thread/compacted` 或 60s 超时后替换为 `compaction.done` 行 | Playwright：输入 `/compact` 后消息流内出现 "Compacting thread context…"，60s 后切换为 "Context compacted"，两态互斥 |
| 无权限时希望提示用户同意 codex 自带的审批策略配置文件 | 设置面板新增「审批策略」区块：读写 `CODEX_HOME/config.toml` 的 `approval_policy`（`untrusted`/`on-failure`/`on-request`/`never`），写入去重保留其余配置；读取优先 `CODEXUI_APPROVAL_POLICY` 环境变量再回退配置文件 | Playwright：面板渲染 4 个选项，保存后 GET 返回新值、配置文件无重复行；TRAE 沙箱下写 `~/.codex` 会被拦截，需将 `CODEX_HOME` 指向项目内 `.codex/` |
| 斜杠命令未集成已安装的技能，无法分组展示 | `slashCommands.ts` 新增 `buildSkillSlashCommands()` 按技能生成 `/技能名` 命令；`ComposerSlashMenu.vue` 分组渲染（Commands / Skills），技能行绿色前缀，选中后附加技能到消息 | Playwright：菜单显示 Commands 12 项 + Skills 10 项；单测 20/20 通过 |

### 第四轮修复（commit `5cd6ede`）：压缩状态两个 bug

第三轮把压缩进度改为消息流内渲染后出现两个问题，根因同源——**新版本 codex app-server 已废弃 `thread/compacted` 通知**（协议 schema 标注 `Deprecated: Use 'ContextCompaction' item type instead.`），压缩完成改为在消息 payload 中插入 `contextCompaction` item，而旧实现只等废弃通知：

| 问题 | 根因 | 修复 | 验证 |
|---|---|---|---|
| 执行 `/compact` 后 thinking 已结束但 spinner 仍转圈 | `thread/compacted` 通知收不到（已废弃），只能等 60s 超时兜底才切换 done | `src/api/normalizers/v2.ts` 将 `contextCompaction` item 归一化为 `compaction.done` 消息；`compactThreadById` 在 `thread/compact/start` 后轮询线程详情（2s 间隔、上限 28s）检测到 done 即收尾；兼容旧版通知路径 | Playwright：pending 短暂显示后立即切换 done，不再等 60s |
| 压缩成功后刷新页面，完成提示消失 | 完成消息是内存注入的（`injectedSystemMessagesByThreadId`），不持久化，刷新即失 | `contextCompaction` item 来自服务端持久化数据，归一化后随消息加载自然保留；多次压缩只保留最近一条 done（`collapseCompactionDoneMessages`）；无压缩进行中且已有持久化 done 时丢弃残留 pending 行 | Playwright：刷新后仍有 "Context compacted"、无 spinner、只显示 1 条；单测新增 3 例通过 |

## 启动方式

### 普通电脑（无沙箱限制）

```bash
# 首次安装依赖后即可直接启动
pnpm run dev --host 127.0.0.1 --port 4173
```

无需设置 `CODEX_HOME`，codex CLI 正常读写 `~/.codex`。

### TRAE 沙箱内

```powershell
$env:CODEX_HOME='<项目目录>\.codex'
pnpm run dev --host 127.0.0.1 --port 4173
```

`CODEX_HOME` 必须指向沙箱允许写入的位置；项目内 `.codex/` 已被 `.gitignore` 忽略，不会污染 git。

### 端口冲突

本机 `5173` 被 HBuilderX uniapp 占用，始终使用 `--port 4173` 规避。其他电脑若无冲突可自由选端口。

## 已提交的改动

全部改动已提交并推送到 `main`（远程 `origin/main` 已同步）。环境修复见下方列表；2026-08-05 的验收轮次提交如下：

- **`6c25ba1`**：第一轮 5 个验收问题（文件夹拖拽关闭、展开 composer 的 z-index、裸斜杠菜单、压缩横幅、空提及结果）——修复验收发现的 UI/交互缺陷
- **`299210a`**：第二轮验收（斜杠菜单滚动、H5 控件溢出、worktree 变更文件、压缩改为线程消息）——修复第二轮验收发现的缺陷
- **`eedf148`**：第三轮验收——压缩进度改为消息流内渲染（pending/done 行 + 60s 超时兜底）；设置面板新增审批策略（读写 `CODEX_HOME/config.toml` 的 `approval_policy`，优先读 `CODEXUI_APPROVAL_POLICY` 环境变量）；斜杠菜单按已装技能生成 `/技能名` 命令并分组展示（Commands / Skills）。作用：压缩状态可见性、权限审批配置、技能入口发现
- **`5cd6ede`**：第四轮修复（压缩状态两个 bug）——新版本 app-server 已废弃 `thread/compacted` 通知（改用 `contextCompaction` item），导致 spinner 收不到完成信号只能等 60s 超时、且完成消息不持久化刷新即失；修复为归一化 `contextCompaction` item 为 `compaction.done` 消息 + 压缩后轮询线程详情（2s 间隔、上限 28s）直到 done 出现 + 多次压缩只保留最近一条 done + 无压缩进行中时丢弃残留 pending 行。作用：压缩 spinner 立即结束、完成状态刷新后保留
- **`2860a54` 等早期提交**：`pnpm-workspace.yaml`（`allowBuilds`）、`vite.config.ts`（watch ignore）、`package.json`（packageManager）、`docs/codex-cli-not-found-troubleshooting.md`、P0/P1/P2 功能补齐。作用：环境修复与功能补齐（见下方方案完成情况表）
- **`b71bbaf`**：第六轮交接需求——右侧文件面板点击文件改为面板内弹窗预览（`/codex-local-preview` 双通道路由 + 新增 `FilePreviewModal.vue`，文本 512KB 截断、图片内联、二进制提示并可「Open in browser」）；中英文翻译补齐（`useUiLanguage.ts` 中文字典大幅扩充，右键菜单、编辑消息弹窗、自动化/技能/Git/Review 面板等界面硬编码文案全部包 `t()`）。作用：文件预览 + 简体中文全覆盖

## Codex 功能补齐方案完成情况

仓库另有一份《Codex 功能补齐方案》（`codex-parity-plan/codex-parity-plan.html`，2026-08-03 制定），按 P0/P1/P2 三批推进，目标是缩小 codex-mobile 与官方 Codex.app 的协议与功能差距。经对照代码库核实，截至本次交接的完成情况如下：

### P0

- **P0-1 上下文压缩**：已完成。commit `04709d9`；`compactThread`、`thread/compacted` 通知处理、压缩按钮与单测均已落地；第四轮（`5cd6ede`）补充新版 `contextCompaction` item 归一化与轮询收尾，spinner 不再等 60s 超时、完成状态刷新后保留
- **P0-2 实时语音**：已完成。`useRealtimeVoice.ts` + `thread/realtime/*` 网关封装（committed）；composer 新增实时语音按钮与转录气泡，单测 7/7 通过，Playwright 验证 start/stop 与气泡显隐

### P1

- **P1-1 线程搜索**：已完成。commit `9b625b5`；`/codex-api/thread-search` 已切换到官方 `thread/search` RPC（`searchTerm` 参数），保留自研索引为旧版 codex 的降级路径
- **P1-2 模糊文件搜索**：已完成。commit `cc6fd41`；composer `@` 提及已切换到官方 `fuzzyFileSearch/session*`，保留自研端点为降级路径
- **P1-3 通知面补齐**：已完成。`applyRealtimeUpdates` 补齐 `app/list/updated`、`thread/status/changed`、`thread/archived`、`thread/deleted`、`thread/closed`、`thread/unarchived`、`item/fileChange/patchUpdated`、`turn/diff/updated`、`skills/changed`、`mcpServer/*` 分支；40+ 已知忽略通知显式空分支 + debug 日志；App.vue 事件转发给 DirectoryHub；undo/redo 真实化（无实际变更不再假报 undone/redone，成功后重取消息）；清理 `UndoStartedEvent`/`UndoCompletedEvent` 死代码；单测 43/43 通过
- **P1-4 输入框命令菜单**：已完成。commit `125ff2c`；`ComposerSlashMenu.vue` + `slashCommands.ts` + 单测，支持 `/` 命令触发与 RPC dispatch
- **P1-5 UI 同步与视觉一致性**：已完成。commit `2830cdc`；composer placeholder 对齐 Codex.app 引导文案（en/zh-CN）；提及弹层与命令菜单共用 `.composer-popover` 弹层样式并统一 150ms 淡入+上移动效；补齐 file-mention 子元素 dark 覆盖；单测通过，Playwright light/dark + 375x812/768x1024 验证 12/12；Windows 无 Codex.app 参考图，parity blocker 仍在

### P2

- **Hooks / Marketplace / Plugin 分享 / 远程控制**：全部完成。P2-1 Hooks 设置面板（commit `934b807`）、P2-2 Marketplace 管理（commit `691fe28`）、P2-3 Plugin 分享（commit `6d47a75`）、P2-4 远程控制（commit `ecd0d6e`）；全部走 `getMethodCatalog()` 特性探测，能力缺失时 UI 降级提示；单测 + Playwright light/dark/移动端验证通过；详见 `tests/skills-plugins-integrations/` 下 4 篇手动用例

> **总体进度：** 方案 11 个任务项已全部完成（P0-1、P0-2、P1-1 ~ P1-5、P2-1 ~ P2-4）。

## 待办需求（下一轮，2026-08-05 提出）

> **2026-08-05 第二轮进展：** 需求 1、2、3、4、5、7 已实现（本轮工作区改动，未提交/未推送，需 commit 后推送）；需求 6（消息展示 vs TUI）为调研结论，按用户指示保留、不做实现，待产品决策（2026-08-06 已决策改为对齐 trae-work 工作过程风格并全量重构实施，commit `0f1a970`，见下）。具体改动见下方各条的「现状」与「改动要点」。

以下需求来自下一轮产品验收。前 5 条为明确的界面改造，第 6 条是现状调研结论（供决定是否对齐 TUI），第 7 条为交互防误触。涉及组件：`App.vue`、`ThreadComposer.vue`、`ComposerSlashMenu.vue`、`ThreadConversation.vue`、`ContentHeader.vue`。

### 1. 输入框下的技能 chips 可移除

- **现状**：技能已集成到斜杠菜单（`/技能名`，见 `eedf148`），但输入框下方仍有 `.thread-composer-skill-chips` 技能 chips（`ThreadComposer.vue` 第 65 行起），`selectedSkills` 会随选中技能追加
- **改动要点**：删除技能 chips 的渲染与相关样式；保留 `selectedSkills` 状态本身（提交消息时仍需携带 `skills` 载荷），仅移除其视觉呈现，或将选中态改为仅体现在斜杠菜单高亮

### 2. 设置面板从侧边栏提出来

- **现状**：设置面板是侧边栏底部的内嵌浮层（`.sidebar-settings-panel`，`App.vue` 第 117 行），由 `.sidebar-settings-button` 打开，缩在侧边栏内
- **改动要点**：改为独立对话框/全屏抽屉（`dialog` 或覆盖层），或新增独立设置路由；面板内容（账号、Hooks、Marketplace、Plugin 分享、远程控制、审批策略）原样迁移，需保留现有 `v-if` 逻辑与状态

### 3. 去掉右上角终端按钮与 Detached Head 按钮

- **现状**：`ContentHeader` actions 区有两个入口：终端命令下拉（`ComposerDropdown` + `IconTablerTerminal`，`App.vue` 第 688-700 行）与 git 分支下拉（`HeaderGitBranchDropdown`，第 701 行起，含 detached head 标识）；打开的是 `ThreadTerminalPanel`
- **改动要点**：移除这两个头部入口及其相关状态（`canShowTerminalToggle`、`isComposerTerminalOpen`、`canShowContentHeaderBranchDropdown` 等）；终端与 git 面板能力并入第 4 点的右侧边栏 tab

### 4. 布局改 3 栏：左侧边栏 + 消息 + 右侧边栏

- **现状**：当前为 2 栏：`Sidebar`（左侧）+ `content-root`（消息），无右侧面板；终端/文件变更等以弹层或行内方式呈现
- **改动要点**：新增右侧边栏：顶部 tab 栏 + 一个 `+` 按钮，点击弹出 popover 可选「终端面板」「Git 面板」，默认显示 Git 面板；左侧边栏与消息区保持不变；新面板复用现有 `ThreadTerminalPanel` 与 git 下拉的数据逻辑

### 5. 斜杠菜单技能组展示完整技能名称

- **现状**：`ComposerSlashMenu.vue` 技能行显示 `command.id`（由技能名规范化而来，如 `frontend-code-review`），非完整展示名；`SkillItem` 已带 `displayName` 字段可用
- **改动要点**：技能行主文本改用 `displayName`（无则回退 `name`），`id` 仅用于匹配与插槽文本

### 6. 当前消息展示 vs TUI 的差异（调研结论）

- **现状**：见下方「消息展示现状与 TUI 对比」
- **改动要点**：2026-08-06 已决策不对齐 TUI，改为按 trae-work 工作过程风格全量重构（commit `0f1a970`），见下

### 7. 编辑 / 回退消息需确认提示

- **现状**：`editMessage()`（`ThreadConversation.vue` 第 2432 行）点击即把消息文本填入草稿、`onRollback()`（`App.vue` 第 4615 行）点击即回退线程，均无确认
- **改动要点**：为编辑/回退/撤销文件变更等破坏性操作增加确认弹层（如「确认编辑此消息？」/「确认回退到该轮？后续回复将被移除」），或至少编辑态进入前提示

### 消息展示现状与 TUI 对比（需求 6 调研）

| 维度 | codex-mobile 现状（ThreadConversation.vue） | codex TUI |
|---|---|---|
| 整体形态 | Web 纵向消息流，按 `data-role`（user/assistant/system）区分样式，支持明暗主题与移动端 | 终端内全屏分栏（会话列表 + 对话区 + 输入区），ANSI 色块与边框线绘制 |
| 文本渲染 | markdown 分段渲染：段落、加粗/斜体/删除线、行内文件链接（`getMessageBlocks`/`getInlineSegments`） | 纯文本 + 终端内粗体/链接高亮，markdown 仅部分支持 |
| 命令执行 | 折叠行（`cmd-row`，▶ + 命令 + 状态），点击展开输出；连续命令可分组折叠；worked 消息带分隔线可展开明细 | 带边框的「工作块」缩进展示，命令与输出实时流式出现 |
| 文件变更 | 独立文件变更卡片：操作徽标（+/-/M）+ 路径 + 行数，可展开 diff 视图，支持 undo/redo 文件变更 | 以 git diff 风格内联展示，无独立 undo/redo 按钮 |
| 计划 / 推理 | Plan 卡片（步骤列表 + 状态图标 + Implement 按钮）；live overlay 展示推理与活动标签 | 计划以文本块展示，推理过程在状态栏/工作区滚动 |
| 附件与富交互 | 图片预览（可点开大图）、文件/技能 chips（可点开浏览）、复制/编辑/分叉工具栏按钮、自动化消息标签 | 无图片预览与链接式附件，交互以键盘快捷键为主 |
| 差异结论 | Web 版是「增强型」展示：折叠/展开、diff、undo/redo、图片、按钮式交互均为 TUI 没有或弱化的能力；TUI 的优势在终端环境下的实时滚动与无鼠标操作。对齐建议：不追求像素级一致，保留 Web 折叠/交互能力，仅需在视觉密度与信息层级上参考 TUI（如命令块边框、状态色）即可 |  |

### 需求 6 产品决策（2026-08-06）：对齐 trae-work 工作过程风格

> **2026-08-06 决策：** 需求 6 不再对齐 TUI，改为按 trae-work 的工作过程风格改造消息展示，用户已确认「全量重构」。

> **2026-08-06 实施完成：** 全量重构已落地（commit `0f1a970`）：命令消息改为独立「工作块」（`.work-block`：步骤序号圆点 + 命令 + 状态标签 ✓/✗/运行中 spinner，命令与输出同块，点击整块展开，连续命令直接平铺连续编号，删除组折叠行与 worked 分隔条展开两层交互）；worked 消息渲染为独立总结段落（`.work-summary-text`）；文件变更徽标改为 `+/M/−/→` 符号着色（title 保留完整操作名），路径与行数右对齐，undo/redo 保留。清理死代码（`getCommandsForWorked`/`toggleWorkedExpand`/`toggleCommandGroup`/`expandedCommandGroupIds`/`expandedWorkedIds` 及对应 CSS，含 `src/style.css` 残留）。构建（vue-tsc + vite + tsup）通过；Playwright（Edge channel）mock 线程数据验证：3 个工作块步骤 1/2/3、状态 ✓ Done / ✗ Failed / Running、点击展开输出、文件变更徽标 +/M 与行数右对齐均正常，旧类 `cmd-step-index`/`worked-separator` 计数为 0；明暗主题截图 `output/playwright/req6-work-blocks-{light,dark}.png`。手动测试文档 `tests/chat-composer-rendering/work-step-blocks-and-inline-file-changes.md`。

改造目标（trae-work 工作过程风格）与当前实现对照：

| 维度 | 当前实现 | 改造目标（trae-work 风格） |
|---|---|---|
| 命令执行 | 折叠行（`cmd-row`：▶ + 命令 + 状态），点击展开输出；连续命令可分组折叠；worked 消息需先点分隔条展开 | 独立「工作块」：左侧步骤序号圆点 + 命令 + 状态标签（完成/进行中带旋转动画），命令与输出同块，点击整块展开；worked 明细直接平铺、步骤连续编号（1/2/3），去掉中间一层交互 |
| 文件变更 | 独立文件变更卡片：操作徽标（+/-/M）+ 路径 + 行数，可展开 diff，支持 undo/redo | 保持卡片但改为工作区内联，操作徽标（+/M）着色区分增改，路径与行数右对齐，undo/redo 保留 |
| 总结文本 | 随消息流混排 | 与工作过程分离，作为独立段落出现在工作块之后 |

> **涉及文件（预计）：** `ThreadConversation.vue`（模板 + `getCommandsForWorked`/`getGroupedCommandsForLatest`/`commandStatusClass` 等命令渲染逻辑与 CSS）、相关 i18n。数据层不变，风险可控。命令与 worked 本质是同一套渲染逻辑（`getCommandsForWorked` 与命令分组），建议合并改造而非分两次改模板。

## 第三轮验收调整（2026-08-05 提出）

> **2026-08-05 第三轮进展：** 6 条调整已全部实现（本轮工作区改动，待 commit 后推送）。涉及 `App.vue`、`ThreadComposer.vue`、`ComposerSlashMenu.vue`、`slashCommands.ts`。

1. **右侧面板可拖动宽度 + 可收起（桌面端）**：`App.vue` 新增 `rightPanelWidth`（localStorage 持久化 `codex-web-local.right-panel-width.v1`，范围 260-640px）与左侧边缘拖拽手柄 `.content-right-panel-resize-handle`；桌面端新增收起/展开（`isRightPanelCollapsed`，头部侧栏按钮与面板内 `×` 均可收起）
2. **右侧面板 tab 默认只有 Git**：移除头部 Terminal tab 按钮，仅保留 Git tab；终端面板通过 `+` popover 添加
3. **审批策略移到输入框下方，4 个 tab 切换**：设置对话框中的审批策略区整体移除；`ThreadComposer` 新增 `approvalPolicy*` props 与 `update:approval-policy`/`save-approval-policy` 事件，输入框下方渲染 4 个策略 tab（Only untrusted commands / After a command fails / When Codex requests it / Never），点击即保存；`App.vue` 挂载时 `refreshApprovalPolicy()` 预载
4. **移除输入框下的技能下拉（已并入斜杠命令）**：删除 `ComposerSearchDropdown` 组件及 prompts 相关死代码（`getComposerPrompts`/`createComposerPrompt`/`removeComposerPrompt`、`savedPrompts`、`skillDropdownOptions`、`reloadPrompts` 等）
5. **斜杠命令选中技能后恢复输入框上方技能 chips**：恢复 `.thread-composer-skill-chips` 渲染与 `removeSkill`/`skillMarkdownPath`/`openSkillMarkdown` 函数及样式
6. **斜杠命令技能组完整显示技能名称 + 系统技能加入**：`ComposerSlashMenu` 技能名改用不截断样式（`.thread-composer-slash-skill-name`）；`buildSkillSlashCommands` 改为按路径去重（同名不同 scope 的技能全部保留，系统技能不再被同名技能顶掉）

## 第四轮反馈（2026-08-05 提出）

> **2026-08-05 第四轮进展：** 3 条需求已全部实现并验证（vue-tsc / build / 单测 / Playwright 布局断言），本轮改动已 commit 并推送。涉及 `ThreadComposer.vue`、`ComposerSlashMenu.vue`、`slashCommands.ts`、`useUiLanguage.ts`、`style.css`、`App.vue`、`codexGateway.ts`、`types/codex.ts`。

1. **斜杠技能行布局：左侧图标（区分用户/系统）+ 右侧名称（完整）+ 描述（可省略）**：`SlashCommand` 增加 `scope` 字段；`buildSkillSlashCommands` 带出 `scope`；`ComposerSlashMenu` 技能行改为左侧圆形 scope 图标（U/R/S/P，按 scope 着色）+ 右侧垂直排列的名称（不截断）与描述，移除右侧 kind 标签；明暗主题样式同步到 `style.css`
2. **composer 输入框下方的按钮移到输入框右侧，暂不需要语音**：`ThreadComposer` 新增 `.thread-composer-main`（纵向）+ `.thread-composer-input-row`（横向：输入框 + 右侧 submit/stop 按钮列）；移除麦克风、实时语音按钮与实时语音气泡；移除实时语音死代码（`useRealtimeVoice` 导入与相关 computed/函数）及 mic/realtime 样式
3. **composer 下方布局：加号、规划模式、审批策略、模型、模型强度；三个 popover 内容调整**：控制行顺序为 加号（attach，popover 含添加图片和文件/添加文件夹/拍照/执行中发送 Steer·Queue，原 Fast/Plan 开关已移除）、规划模式（plan，popover 三选一：Default / Plan mode / Execution plans，ExecPlans 后端不支持时禁用并提示）、审批策略（approval，popover 三选一：When Codex requests it / Unless trusted / Never，点击即保存）、模型、模型强度（不变）；`CollaborationModeKind` 增加 `'execplans'`，`getAvailableCollaborationModes` 过滤逻辑同步放行；三个菜单互斥，点击外部关闭

## 第五轮反馈（2026-08-05 提出）

> **2026-08-05 第五轮进展：** 8 条需求已全部实现并验证（vue-tsc / build / 单测 216 通过，2 个失败为 Windows 基线环境性失败与改动无关；Playwright 用本机 Edge channel 8/8 通过，截图见 `output/playwright/round5-*.png`）。本轮改动涉及 `ThreadComposer.vue`、`ComposerDropdown.vue`、`ComposerSlashMenu.vue`、`codexAppServerBridge.ts`、`localBrowseUi.ts`、`httpServer.ts`、`vite.config.ts`、`codexGateway.ts`、`App.vue`、`style.css`，并新增 `ComposerPopover.vue`、`RightFilesPanel.vue`、`IconTablerFiles.vue`。

1. **模型列表没有模型**：根因：审批策略写入器匹配正则不匹配自己写的行（写入 `approval_policy = "..."` 带空格，匹配用 `approval_policy=` 无空格），每次保存追加重复 key，最终 TOML 解析失败 → `config/read`、`provider-models`、`skills/list` 全挂。`writeApprovalPolicyToConfigFile` 改为 `APPROVAL_POLICY_ASSIGNMENT = /^approval_policy\s*=/u`：删除所有现有赋值行去重后把 key 放文件顶部（避免落入 `[table]`）；同时手动修复被破坏的 `.codex/config.toml`（删除 5 个重复 key）。验证后恢复审批策略为 untrusted，确认写入幂等
2. **popover 抽取为公用组件**：新增 `ComposerPopover.vue`（受控 `open`/`update:open`、`align` start|end、`width` md|lg、`panelClass`、`ariaLabel`，trigger slot 暴露 `toggle`/`isOpen`）；`ThreadComposer` 的 attach/plan/approval 三个菜单重构为 `ComposerPopover`，删除旧 `attachMenuRootRef` 等 ref 与旧菜单样式类；`onDocumentClick` 改用 `.composer-popover-anchor` 判断点击内外
3. **审批策略选中提示改为 tip**：保存后不再弹出长文案通知，改为按钮上方悬浮 tip（`.thread-composer-approval-tip` 圆角胶囊，`role="status"`，2200ms 自动消失）；`App.vue` 提示文本用 `t('Approval policy saved')`，明暗主题样式同步到 `style.css`
4. **斜杠命令中技能组不见了**：与需求 1 同根因：config.toml 损坏导致 `skills/list` 失败，技能组随配置层一起挂掉；配置修复后技能组恢复（验证 10 行技能，含系统/用户/仓库 scope）
5. **技能组每项描述最多两行，超出隐藏**：`.thread-composer-slash-desc--skill` 加 `-webkit-line-clamp: 2; overflow: hidden; white-space: normal; overflow-wrap: anywhere`
6. **每组每项宽度不能超过 popover 宽度**：`.thread-composer-slash-row` 加 `min-w-0 max-w-full overflow-hidden`；`.thread-composer-slash-skill-name` 加 `min-w-0` 与 `overflow-wrap: anywhere`；`.composer-popover` 加 `min-w-0 max-w-full overflow-x-hidden`（Playwright 实测行宽 ≤ popover 宽）
7. **模型按钮和模型强度改为和规划模式按钮一样的样式**：`ComposerDropdown` 新增 `variant?: 'plain' | 'pill'`；模型与模型强度两个下拉用 `variant="pill"`，走与规划模式按钮同款 pill 样式（`.composer-dropdown-trigger--pill`：`h-8 rounded-full border border-zinc-200 bg-white px-2.5 text-xs`），dark 主题同步
8. **右边栏添加显示文件功能（显示工作区文件，作用域在工作区）**：`localBrowseUi.ts` 新增 `listWorkspaceFiles`（忽略 `.git/node_modules/dist/build/out/.next/.nuxt/coverage/__pycache__/.cache/.turbo/target/.venv/venv/.idea/.vscode/output`，目录优先 + 字母排序，maxEntries 2000 / maxDepth 8）；`GET /codex-local-files?path=` 路由（`httpServer.ts` + `vite.config.ts` dev 中间件）；`codexGateway.listWorkspaceFiles(cwd)`；新增 `RightFilesPanel.vue`（搜索过滤、按顶层目录分组折叠、点击文件 `window.open('/codex-local-browse'+encodeURI(path))`）与 `IconTablerFiles.vue`；`App.vue` 右侧栏新增 Files tab 与 `+` 菜单项（验证 1080 文件 / 11 组）

> **验证说明：** 需求 1/4 属于同一配置层损坏的根因修复，其余为 UI 改造；Playwright（`chromium.launch({ channel: 'msedge' })`）8/8 断言通过：pill 触发按钮 ≥2、模型下拉选项 >0、斜杠菜单 Skills 组存在、行宽不超 popover、描述两行截断（实测高度断言）、approval 菜单、tip 文本、Files tab 文件列表；明暗主题截图齐全。

## 第六轮交接需求（2026-08-05 提出）

> **2026-08-05 第六轮进展：** 2 条需求已全部实现并验证（`vue-tsc --noEmit` 通过；单测 214 通过，4 个失败为 Windows 基线环境性失败与改动无关），本轮改动已 commit 并推送（`b71bbaf`）。涉及 `localBrowseUi.ts`、`httpServer.ts`、`vite.config.ts`、`codexGateway.ts`、`RightFilesPanel.vue`、`useUiLanguage.ts` 及 20+ 组件，并新增 `FilePreviewModal.vue`。

1. **右侧文件面板中，点击文件需要进行文件预览**：`localBrowseUi.ts` 新增 `getFilePreview()`（文本截断 512KB）；`GET /codex-local-preview?path=` 双通道注册（`httpServer.ts` Express + `vite.config.ts` dev 中间件）；`codexGateway.previewLocalFile(path)`；新增 `FilePreviewModal.vue`（文本用 `pre` 等宽块展示、图片 `<img>` 内联、二进制显示提示 + 「Open in browser」按钮 `window.open('/codex-local-browse' + encodeURI(path))`、超过 512KB 显示截断提示、ESC/关闭按钮/点击遮罩均可关闭）；`RightFilesPanel.vue` 点击文件行改为打开面板内预览弹窗，不再新开浏览器页
2. **项目中的中英文翻译不全**：采用「扫描清单 → 加字典 key → 逐组件包 `t()` → vue-tsc 验证」循环补齐 `useUiLanguage.ts` 中文字典并覆盖各界面硬编码文案：①首轮补主要模板文本约 100 条；②脚本扫描 `script` 字符串字面量（token 统计、额度、插件/技能/自动化 toast、RRULE 等）约 70 条；③右键菜单（复制聊天/创建聊天分叉/固定线程/取消固定线程/重命名项目/重命名线程等）、编辑消息确认弹窗（编辑此消息？/撤销、重做文件变更及说明、命令状态标签、6 个审批标题）、自动化面板（新建/刷新/心跳/项目/总计/空状态）、技能面板（搜索/加载/安装/卸载/更新失败提示）、Git 面板（分支/提交/检出/重置/复制提交引用/脏状态长警告/current·remote 徽章）、Review 面板（Added/Deleted/Renamed/Modified）等约 90 条；修复后中文模式下上述界面已无英文残留（仅保留 `ID` 等技术性标识）

> **验证说明：** 需求 2 的右键菜单残留经全量 grep 复查后清零（`SidebarThreadTree.vue` 的 Copy chat / Create chat fork / Pin thread / Unpin thread / Rename project / Open this chat before copying，`ReviewPane.vue` 的 `formatOperation`）；`vue-tsc` 无重复 key、无类型错误；手动测试文档新增一节（`tests/theme-layout-terminal/composer-fifth-round-feedback.md`）。

## 第七轮交接需求（2026-08-06 提出）

> **2026-08-06 第七轮进展：** 9 条需求/问题中 8 条已实现（1/2/3/4/5/6/7/8），需求 9 为现状调研结论（见下）。本轮改动尚在工作区（未 commit/推送）。验证：`vue-tsc --noEmit` 通过、`vite build` 通过；Playwright（本机 Edge channel）冒烟 16/16 通过（回收站开/归档/还原、H5 加号 popover 的 Plan mode/Approval policy、独立按钮隐藏、文件 tab 图片内联预览），明暗主题截图见 `output/playwright/smoke-*.png`。涉及 `App.vue`、`ThreadComposer.vue`、`ThreadConversation.vue`、`SidebarThreadTree.vue`、`RightFilesPanel.vue`、`codexGateway.ts`、`useUiLanguage.ts`，并新增 `AppDialog.vue`、`useThreadRecycleBin.ts`、`utils/plan.ts`。

1. **Plan 面板固定到输入框上方（可折叠），不再随消息被顶走**：新增 `src/utils/plan.ts`（`parsePlanFromMessageText` / `readPlanData`，优先结构化 `message.plan`，回退解析 `- [x]`/`-[~]`/`- [ ]` 文本）；`ThreadConversation.vue` 改为复用该工具；`App.vue` 新增 `composerPlanPanel` computed（倒序找最近一条 plan/plan.live 消息），通过 `:plan-panel` 传给 `ThreadComposer.vue`，在输入框上方渲染 `.thread-composer-plan-panel`（标题/Updating 徽章/x-y 进度/解释与步骤列表，点击 header 折叠，明暗主题齐全）
2. **命令被堆叠看不出是哪一步执行的，需像 trae-work 一样清晰**：`ThreadConversation.vue` 分组命令与 worked 命令模板加 `v-for` 序号，新增 `.cmd-step-index` 步骤序号徽章（`title="Step N"`），明暗主题样式齐全
3. **Dialog 弹出层抽成公共组件**：新增 `src/components/content/AppDialog.vue`（Teleport 到 body、`open`/`title`/`subtitle`/`ariaLabel`/`size` sm|md|lg、遮罩点击与 ESC 关闭、默认 header 带关闭按钮、body + footer 插槽、明暗主题齐全）；`SidebarThreadTree.vue` 的重命名/删除/回收站对话框与删除确认子标题（`deleteThreadDialogSubtitle` computed 规避模板引号冲突）改用 `AppDialog`
4. **H5 模式下规划模式与审批策略放进「+」popover，选中切换沿用执行中发送（Steer/Queue）样式**：`ThreadComposer.vue` 加号 `ComposerPopover` 内新增 `v-if="isMobile"` 的 Plan mode / Approval policy 两组按钮（复用 `.thread-composer-attach-mode` 区块样式，选中带 `is-active`）；独立 plan/approval popover 加 `v-if="!isMobile"`；`onMobileCollaborationModeSelect` 选中后关闭 attach 菜单；Playwright 验证移动端独立触发按钮隐藏
5. **H5 模式右侧边栏无法显示，需兼容 H5**：根因：Tailwind v4 的 `translate-x-full` 使用 CSS `translate` 属性，旧覆盖用 `transform: translateX(0)` 无效（样式被计算值 `translate: 100%` 覆盖）。`App.vue` 的 `@media (max-width: 767px)` 中 `.content-right-panel.is-mobile-open` 改为 `translate: 0 0`；Playwright 实测面板 rect x=56.25 可见
6. **右侧文件 tab 点击图片直接在 tab 内预览，不用弹窗**：`RightFilesPanel.vue` 新增 `isPreviewImage`（正则 `\.(avif|bmp|gif|jpe?g|png|svg|webp)$`）与 `previewBrowseUrl`（`/codex-local-browse` 路径）；图片文件走内联 `.rfp-inline-preview`（header + 关闭按钮 + `<img>`），非图片仍走 `FilePreviewModal`；明暗主题样式齐全；Playwright 实测点击 `chat-mobile.png` 内联预览可见
7. **左侧线程右键菜单移开即消失；正常打开后点空白不消失**：`SidebarThreadTree.vue` 新增 `threadMenuOpenSource: 'hover' | 'contextmenu'`：hover 打开（dots 按钮）仍随移开关闭，右键打开不随鼠标离开关闭，仅由空白点击/再次操作关闭；Playwright 验证 A（右键后移开→保持）/ B（空白点击→关闭）/ C（dots 打开+移开→关闭）符合预期
8. **线程移除后无还原入口，需要线程回收站**：新增 `src/composables/useThreadRecycleBin.ts`（localStorage `codex-web-local.recycle-bin.v1` 持久化）；`codexGateway.ts` 新增 `unarchiveThread`（`thread/unarchive`）；`SidebarThreadTree.vue` 删除线程时 `recordArchivedThread` 入回收站，组织菜单新增「Recycle bin」打开 `AppDialog` 回收站（列表/还原/永久删除/空状态/时间格式化），还原调用 `restoreArchivedThread` → unarchive 并 emit `restore-thread`；`App.vue` `onRestoreThread` 调 `refreshAll({ includeSelectedThreadMessages: false, forceThreadRefresh: true })` 刷新列表；i18n 中文字典补充；Playwright 实测归档→回收站可见→还原→记录移除全链路通过
9. **（问题）thinking 中点击停止后最新会话消息消失，是否正常**：调研结论：属 codex app-server 的 turn 语义，非本应用 UI bug。`turn/interrupt` 中断一个尚未产出任何 agent 输出的 turn 时，服务端会将该 turn（含用户消息）从线程历史整体移除（未提交的事务式回滚）；随后本应用 `interruptSelectedThreadTurn` 会 `pendingThreadMessageRefresh + syncFromNotifications` 刷新，本地合并 `preserveMissing` 虽会短暂保留乐观消息，但侧栏摘要已按服务端重建、后续权威刷新后消息即永久消失。`blockInterruptUntilThreadIsPersisted` 本意是防止此窗口，但 `turn/started` 到达即解除阻塞（`maybeUnblockInterruptForActiveTurn`）仍留有小竞态窗口。结论已确认：行为属正常语义，非 UI bug；UI 侧是否额外提示（保留「已停止、消息未提交」提示或把未提交文本回填输入框）为可选优化，暂无实施计划

> **验证说明：** 需求 1 的 plan 面板在当前环境无真实 plan 消息可端到端验证，已通过 `vite dev` 动态 import `/src/utils/plan.ts` 实测解析（x/~/' ' 状态与 explanation 提取正确）并依赖 vue-tsc/构建覆盖；需求 2 的步骤序号无 command 消息样本，代码路径经 vue-tsc 与代码复查确认；其余 5/6/7/8 均 Playwright 实测。遗留：需求 9 调研结论已确认（服务端 turn 语义、非 UI bug，UI 提示为可选优化未实施）；回收站为本地（localStorage）记录 + 服务端 archive/unarchive，跨设备同步依赖服务端线程列表本身。

## 第八轮：上游 PR 移植（2026-08-06）

> **2026-08-06 进展：** 从上游 `friuns2/codex-mobile` 精选 5 个 PR 全部移植完成并推送（commit `3823011`，19 个文件，+563/-78）。验证：`vue-tsc --noEmit` 通过、`pnpm run build` 通过、相关单测 82/82 通过（全量 227 通过，2 个失败为既有 Windows 环境性失败，与本次改动无关）。未使用 `upstream-sync-curator` 技能，评估后 5 个 PR 均可 1:1 移植，无结构冲突。

1. **`#202` 平台相关侧边栏快捷键**：`App.vue` `onWindowKeyDown`：Mac 上仅响应 Cmd+B、非 Mac 仅响应 Ctrl+B，新增 `isMacPlatform()` 辅助函数；PR 顺带的 `terminalShortcutLabel` 重构因本地无该变量而跳过（纯外观）。验证：vue-tsc + 手动键盘测试
2. **`#199` 纯附件线程兜底标题**：`useDesktopState.ts` `requestThreadTitleGeneration` 新增 `resolveFallbackThreadTitle`（附件标签 / `[Image]` / Untitled thread），调用点传入 `imageUrls`/`fileAttachments`。验证：单测 + 附件线程发消息看标题
3. **`#212` Windows 本地浏览路径**：`localBrowseUi.ts` `decodeBrowsePath` 新增平台参数（剥掉 `/C:/` 前多余斜杠）、新增 `normalizeLocalRoutePath`，`toBrowseHref`/`toEditHref` 改为导出；新增 `localBrowseUi.test.ts`（6 例）+ 手动用例文档。验证：单测 6/6 通过
4. **`#206` 定时器泄漏 + HTML 消毒**：新增 `src/utils/sanitizeHtml.ts`（DOMParser 白名单，去除 script/iframe 等危险标签与 `on*`/`javascript:` 属性）；`ThreadConversation.vue` 三个渲染函数、`SkillDetailModal.vue` readme 渲染包一层 sanitize；`DirectoryHub.vue`/`SkillsHub.vue` 加 `onBeforeUnmount` 清理 timer；PR 里未使用的 `SafeHtml.vue` 按 YAGNI 跳过。验证：vue-tsc + 手动渲染含恶意 HTML 的 markdown 消息
5. **`#209` GPT-5.6 max/ultra 推理等级**：`types/codex.ts` 新增 `REASONING_EFFORTS` 目录 + `isReasoningEffort`；`codexGateway.ts` 新增 `getAvailableModels`（带模型级 `supportedReasoningEfforts`/`defaultReasoningEffort`），旧 `getAvailableModelIds` 改为包装；`useDesktopState.ts` 新增模型感知的推理等级钳制（切换不支持当前等级的模型时回退到默认等级）；`ThreadComposer.vue` Thinking 下拉按模型过滤选项；`App.vue` 绑定新 prop；两处测试文件 mock 改写 + 新增用例（共 3 个新测试）。验证：单测 3 文件 82/82 通过

> **环境注意：** 本机 PATH 中无 `node.exe`（fnm 管理），直接运行 `pnpm` 会报「node 无法识别」。验证命令需先加入 node 目录：`$env:PATH = 'C:\Users\cattails\AppData\Roaming\fnm\node-versions\v24.18.1\installation;' + $env:PATH`。另外本会话添加了 `upstream` remote（`friuns2/codex-mobile`），直连 fetch 超时未成功，未影响使用。

## 第八轮交接需求（requirement-8，2026-08-06 提出）

> **2026-08-06 进展：** 14 条需求/问题全部落地（含 2 条调研修复），验证：`vue-tsc --noEmit` 通过、`pnpm build` 通过、单测 230/232 通过（2 个失败为既有 Windows 环境性失败：`codexAppServerBridge.archive.test.ts` 的 symlink EPERM 与 chmod 权限位，与本次改动无关）；Playwright 冒烟（`127.0.0.1:4173` 现有 app-server 上的新构建）无 console 报错，回收站入口、设置分组标题、context 胶囊、文件预览 tab、`/codex-local-browse/` 图片 URL 全部实测通过。涉及 `App.vue`、`ThreadComposer.vue`、`ThreadConversation.vue`、`ComposerPopover.vue`、`RightFilesPanel.vue`、`RightGitPanel.vue`、`api/normalizers/v2.ts`、`types/codex.ts`、`useUiLanguage.ts`、`SidebarThreadTree.vue`，并新增 `RightFilePreview.vue`、删除 `FilePreviewModal.vue`。本轮已提交并推送：`a8f27fb`（requirement-8 主体）+ `7bf5b1b`（侧栏按钮图标化）。

1. **消息列表中不再展示 plan 面板（只留在输入框上方）**：`ThreadConversation.vue` `visibleMessages` 过滤 `plan`/`plan.live`；feed 内 `.plan-card` 模板与 170 行旧 CSS 全部删除
2. **消息中显示思考内容**：`types/codex.ts` 新增 `UiReasoningData`（summary/content）；`normalizers/v2.ts` 持久化 `reasoning` item 不再丢弃，归一化为 `messageType: 'reasoning'` + `reasoning` 字段（content 优先、summary 兜底）；feed 渲染可折叠 `.reasoning-block`（🧠 Thinking process 标题、summary + 完整 markdown，默认折叠、明暗主题齐全）
3. **命令执行跟随消息，避免堆叠**：新增 `reorderTurnForWorkProcess`：`normalizeThreadMessagesV2` 按 turn 将 reasoning/plan/commandExecution/toolCall 等「工作项」移到用户消息之后、最终回复之前（真实会话按时间序持久化时 agent 文本先于命令）；单测覆盖
4. **Plan/approval popover 弹出在按钮上方时底部居中**：`ComposerPopover.vue` 支持 `align="center"`（`left-1/2 -translate-x-1/2`）；Plan mode 与 Approval policy 下拉改用 center 对齐
5. **Plan 面板移入 shell 容器，只展示最新步骤，点击弹出完整计划**：`ThreadComposer.vue` 计划面板改为 `ComposerPopover` 包裹：header 显示 🗒 Plan、`N/M` 进度、最新步骤（inProgress 优先）+ 状态图标；点击弹出完整计划（解释 + 全步骤 + Implement plan 按钮，`@implement-plan` 复用 `onImplementPlan`）；`onPlanPanelImplement` 关闭 popover 后发 `Implement`
6. **文件预览改为 tab 内预览，不弹窗**：新增 `RightFilePreview.vue`（右侧面板内嵌预览：header + Open in browser + 图片/文本/二进制三态 + 截断提示，明暗主题齐全）；`App.vue` 右侧面板新增 `preview` tab（多文件 tab + 关闭按钮，`onOpenFilePreview`/`selectFilePreviewTab`/`closeFilePreviewTab`）；`RightFilesPanel.vue` 点击文件改为 `@open-preview` 事件；删除 `FilePreviewModal.vue`
7. **（问题）工具调用消失了**：根因：`normalizers/v2.ts` 对持久化 `mcpToolCall` item 无分支 → 静默丢弃。新增归一化（server/tool/status/error/durationMs → `messageType: 'toolCall'` + `UiToolCallData`），feed 渲染紧凑 `.tool-call-block`（🛠 图标 + server 徽章 + 工具名 + ✓/✗/Running 状态 + title 含错误与耗时）；types 增加 `UiToolCallData`；单测覆盖
8. **右侧面板明暗主题切换失败**：`RightFilesPanel.vue` 全量补暗色覆盖（搜索框/分组/文件行/空态）；`RightGitPanel.vue` 补 `.rgp-status`/`.rgp-feedback`/`.rgp-reset-commit`/`.rgp-branch-checkout`/`.rgp-state-meta`/`.rgp-empty.is-error` 等暗色覆盖；侧栏 settings 区按钮补暗色
9. **设置里的上下文移到输入框下模型强度旁边**：删除 `App.vue` 设置面板的 Context 行及相关 computed（`threadContextBadgeState` 等）；`ThreadComposer.vue` 控件行新增 `.thread-composer-context-usage-inline` 胶囊（复用 `buildContextUsageView`，低余量变琥珀/红色并显示 Compact，点击 `@compact-context` 压缩）
10. **回收站入口放到左侧边栏底部 settings 区域**：`App.vue` `sidebar-settings-area` 改为双按钮布局（Settings + Recycle bin，垃圾桶图标）；`SidebarThreadTree.vue` `defineExpose` 增加 `openRecycleBin`；`onOpenRecycleBin` 直接打开回收站对话框
11. **回收站/设置按钮简化为纯图标**：随后按用户要求将两个按钮简化为纯图标（`.sidebar-settings-icon-button`，36×36 居中排列，去掉文字与版本号，保留 title/aria-label；`style.css` 暗色选择器同步改名，commit `7bf5b1b`）
12. **设置面板布局分组归纳**：新增粘性分组标题 `.settings-group-heading`：General settings / Models & providers / Integrations（Telegram、Hooks、Remote control 归入）/ Usage & about（额度 + 版本）；Dictation language 移到 Dictation 开关组；i18n 新增 4 个分组 key
13. **审批策略三个值改名**：中文标签 `Codex 请求时` → `请求时`（英文原文不变）
14. **（问题）右侧文件面板图片预览失败**：根因：旧内联预览拼 URL 为 `/codex-local-browse` + `encodeURI(path)`，缺少路由前缀后的 `/` 分隔符，Express/vite 中间件的 `/codex-local-browse/*path` 与 `startsWith('/codex-local-browse/')` 均不匹配 → 404。新 `RightFilePreview.vue` 先补前导斜杠再 encode（与 `toBrowseUrl` 一致），Playwright 实测 `src` 以 `/codex-local-browse/` 开头且图片正常加载

> **验证说明：** 计划面板/思考块/工具调用需要真实 plan/reasoning 消息才能端到端看渲染，当前账号可见线程为纯文本测试会话，故这三项依赖归一化单测 + vue-tsc + 构建覆盖；其余（回收站入口、设置分组、context 胶囊、文件预览 tab、明暗主题、无 console 错误）均已 Playwright 实测。工具调用「消失」的根因（`mcpToolCall` 未归一化被丢弃）已修复并有单测锁定。侧栏图标按钮另有 Playwright 实测：底部 2 个图标按钮、无文字残留、点击设置图标正常打开设置面板。

## 第九轮交接需求（2026-08-06 提出）

> **2026-08-06 第九轮进展：** 4 条需求/问题已全部修复并验证（`vue-tsc --noEmit` 通过、`pnpm run build` 通过、单测 232 通过 + 2 个既有 Windows 环境性失败与改动无关、Playwright UI 断言 4/4 通过），本轮改动尚未提交/推送（待本次交接文档更新后一并提交）。涉及 `ThreadComposer.vue`、`scripts/dev.cjs`、`src/server/appServerRuntimeConfig.ts`、`src/composables/useDesktopState.ts`，并新增手动测试文档 `tests/chat-composer-rendering/composer-policy-buttons-approval-effort-rollback-interrupt.md`。

1. **规划模式和审批策略选中什么按钮应该显示什么**：`ThreadComposer.vue` 新增 `planModeTriggerLabel` / `approvalPolicyTriggerLabel` computed：按钮文本不再固定显示「Plan mode / Approval policy」，改为显示当前选中项（Default / Plan mode / Execution plans；When Codex requests it / Unless trusted / Never），跟随 i18n 中文；Playwright 实测切换后按钮文本同步变化
2. **审批策略为除非信任时没有弹窗确认**：根因两层：①`scripts/dev.cjs` 启动 Vite 时强制注入 `CODEXUI_APPROVAL_POLICY='never'`，该 env 在读取与 app-server 启动参数中都优先于 config.toml，前端保存的策略永不生效；改为仅当外部显式设置时才保留该变量。②`appServerRuntimeConfig.ts` 的启动参数解析改为 env 优先、回退 `CODEX_HOME/config.toml`（无文件时默认 never）；保存策略后 config.toml 变化触发 app-server 自动重启（`disposeIfConfigChanged`）。验证：POST `untrusted` 后 app-server 进程实际以 `-c "approval_policy=\"untrusted\""` 重启运行；`config.toml` 中 `codex-mobile` 目录被标记 `trusted`，除非信任策略下信任目录命令自动执行不弹窗属正常语义，需在非信任目录/命令下验证弹窗
3. **模型强度默认值应为 Medium**：`useDesktopState.ts` `pickReasoningEffortForModel` 在无显式选择时优先 `medium`（若模型支持），不再直接取模型元数据的 `defaultReasoningEffort` 或第一个选项；Playwright 实测 Thinking 下拉默认显示 `Medium`
4. **thinking 时点击编辑消息确认后当前会话没有停止**：`useDesktopState.ts` `rollbackSelectedThread` 在回滚前先检查线程是否 in-progress，是则先调用 `interruptSelectedThreadTurn()` 停止当前 turn（中断后重新读取持久化消息再做回滚），避免编辑与新生成内容竞态丢失；新增 2 个单测锁定（in-progress 先中断、空闲直接回滚）

> **验证说明：** 问题 1/3 经 Playwright 实测（切换按钮文本、Thinking 默认 Medium）；问题 2 经 HTTP 层实测（GET/POST `/codex-api/approval-policy`、app-server 进程启动参数含新策略、config.toml 幂等写入）；问题 4 依赖单测（回滚前先 interrupt）与 vue-tsc/构建覆盖。遗留：问题 2 的真实命令弹窗需在非信任目录下人工验证；模型强度默认 Medium 仅当模型支持 Medium 时生效，否则回退模型默认值。

## 第十轮交接需求（2026-08-06 提出）

> **2026-08-06 第十轮进展：** 3 条需求已全部实现并验证（`vue-tsc --noEmit` 通过、`vite build` 通过、Playwright 桌面/H5 双视口断言 14/14 通过），截图见 `output/playwright/round10-{sidebar-desktop,h5}.png`。涉及 `App.vue`、`ThreadComposer.vue`。

1. **左侧栏底部设置和回收图标各占一半宽度，图标增大**：`App.vue`：`.sidebar-settings-actions` 去掉 `justify-center`；`.sidebar-settings-icon-button` 改 `h-10 flex-1`（两个按钮均分整行宽度）；`.sidebar-settings-icon` 由 `w-4.5 h-4.5` 增至 `w-6 h-6`（24px）
2. **输入框下模型切换按钮固定宽度，超出省略**：`ThreadComposer.vue`：模型 `ComposerDropdown` 增加 `thread-composer-model-control` 类，根节点 `w-40 min-w-0`（H5 下 `w-32`），触发按钮 `w-full`，配合既有 `.composer-dropdown-value` 的 `truncate` 实现超出省略
3. **H5 模式下模型/模型强度/上下文按钮改小**：`ThreadComposer.vue` 新增 `@media (max-width: 767px)`（与 `useMobile` 断点一致）：pill 触发按钮 `h-7 px-2 text-[11px]`、chevron `h-3 w-3`、`.thread-composer-context-usage-inline` `h-7 px-2 text-[11px]`

> **验证说明：** Playwright（本机 Edge channel）桌面 1280×800 与 H5 375×812 双视口断言通过：侧栏底部 2 个图标按钮均宽 120px（各占一半）、高 40px、图标 24×24；模型触发按钮桌面 160px / H5 128px，value 计算样式 `text-overflow: ellipsis`；H5 下模型/模型强度/上下文按钮高 28px、字号 11px。上下文按钮为数据驱动的条件渲染（`v-if="contextUsageView"`，依赖 `thread/tokenUsage/updated` 服务端通知写入的 `threadTokenUsage`，无数据或 `modelContextWindow` 无效时返回 null 不显示），空闲纯文本会话截图上看不到属预期；向 localStorage（`codex-web-local.thread-token-usage.v1`）注入模拟 usage（含 `modelContextWindow: 200000`）后桌面/H5 均正常渲染「85% · 40k / 200k」，高度桌面 32px / H5 28px，H5 缩小样式生效。过程中发现 4173 dev server 对 `ThreadComposer.vue` 的样式转换缓存过期（模板更新但 CSS 未刷新），按交接文档沙箱启动方式（`CODEX_HOME` 指向项目内 `.codex/`）重启 dev server 后恢复。

## 第十一轮交接需求（2026-08-06 提出）

> **2026-08-06 第十一轮进展：** 7 个问题已全部修复并通过验证（`vue-tsc --noEmit` 通过、单测 v2 归一化 13 + gateway 29 + useDesktopState 49 全部通过、Playwright 桌面/H5 实测 7/7 通过）。本轮改动已提交并推送（commit `483c869`）。涉及 `App.vue`、`ThreadComposer.vue`、`ThreadConversation.vue`、`useUiLanguage.ts`、`utils/plan.ts`、`api/normalizers/v2.ts`、`api/normalizers/v2.test.ts`、`server/codexAppServerBridge.ts`。

1. **设置弹框点外部关闭后自动重开**：背板 `pointerdown` 关闭弹框后，浏览器把合成的 click 重定向到被遮住的设置按钮，再次触发 `isSettingsOpen = !isSettingsOpen` 重开。`App.vue` 新增 `settingsCloseAtMs` 时间戳守卫：弹框关闭（含背板 pointerdown 与按钮 toggle 关闭）后 400ms 内忽略触发器点击；设置按钮改为 `onToggleSettings` 处理函数。验证：Playwright——打开弹框 → 点击设置按钮位置（透过背板）→ 弹框保持关闭
2. **移动端右侧面板无遮罩**：`App.vue` 新增 `.content-right-panel-backdrop`（`@media (max-width: 767px)` 下 fixed 全屏、z-1050，面板 z-1100），`v-if="isMobile && isMobileRightPanelOpen"` 渲染，点击调用 `onCloseRightPanel`。验证：Playwright H5 375px——打开面板出现遮罩，点击遮罩后面板关闭（is-mobile-open 移除）
3. **H5 输入控件行换行**：`ThreadComposer.vue` 移动端 media query 给 `.thread-composer-controls` 加 `flex-nowrap`，上下文按钮加 `shrink min-w-0`，整行不再溢出换行。验证：Playwright H5——375px 下 `scrollWidth === clientWidth`（341px），无横向溢出
4. **计划消息内容不完整（plan 面板丢弃内容）**：codex CLI 持久化的 `<proposed_plan>` 是 markdown 格式（标题 + 项目符号），而 `parsePlanFromMessageText` 只认 `- [ ]` 复选框 → 返回 null，plan 面板空。新增 markdown 回退解析：标题/正文归入 explanation，`-`/`*`/`1.` 列表项归入 steps（pending）。验证：Playwright「长任务测试」线程 plan 面板显示 21 个完整步骤（此前为空）
5. **命令被权限/沙箱拦截时无任何提示**：真实数据中命令带 `require_escalated` 但沙箱白名单（`SAFE_RM_ALLOWED_PATH`）直接拒绝，未产生审批请求，命令块只显示失败。新增 `commandPermissionHint`：命令失败且输出匹配 `Access is denied`/`permission denied`/`require_escalated`/`拒绝访问` 等模式时，命令块下方显示琥珀色提示「命令因权限或沙箱限制被拦截，未弹出审批提示…」；i18n 中文字典补充。验证：Playwright「长任务测试2」出现 6 处权限提示，文案完整
6. **Plan 展开面板宽度不一致**：`panel-class` 渲染在 `ComposerPopover` 内部元素上，ThreadComposer 的 scoped 样式选择器不匹配（需 `:deep()`）；且 `w-72` 覆盖 `w-full`。改为 `:deep(.thread-composer-plan-panel-popover)` + `min-w-full`。验证：Playwright——展开面板宽 683px ≈ 折叠条 685px，对齐一致
7. **命令与叙述被强制分组，时间序错乱**：三层根因：①`normalizers/v2.ts` 的 `reorderTurnForWorkProcess` 把 reasoning/plan/command/toolCall 全部搬到用户消息之后，打破真实执行顺序（如「叙述→命令→叙述→命令」被重排成命令堆叠）；②`mergeSessionCommandsIntoTurns` 只识别 `exec_command`，新 CLI 的命令是 `shell_command`，输出解析只认 `Process exited with code` 不认 `Exit code:`；③旧恢复逻辑把非 agentMessage 项全部追加到末尾导致命令聚集在会话尾部。**修复**：移除前端 `reorderTurnForWorkProcess` 恢复服务端时间序；桥接层 `mergeSessionCommandsIntoThreadResult`（thread/read 与 thread-turn-page 双路径）按会话日志流式顺序把 agentMessage 与 `shell_command`/`exec_command` 命令（含 `-Command` 参数提取、`Exit code:` 解析）交错还原；幂等（session- 前缀 id 检测）+ 去重（恢复出命令时丢弃实时捕获的行）。验证：Playwright「长任务测试2」渲染顺序：用户 → 叙述 → 命令 → 叙述 → 命令…（交错还原）；v2 归一化单测更新为时间序断言并通过

> **环境注意：** 排查 7 号问题时发现本机 `D:\code\codex-project\test`（「长任务测试」会话的 cwd）在 TRAE 沙箱白名单之外，`approval_policy = "on-request"` 也不产生审批请求（命令直接被沙箱拒绝），这是环境配置问题而非应用 bug；后续在该目录执行命令需先把路径加入沙箱可写白名单。另外 `config.toml` 中 `codex-mobile`/`codex-project` 均被标记 `trusted`，信任目录内命令自动执行不弹窗属正常语义。

## 未完成事项

- **已推送**：`main` 与 `origin/main` 已同步至 `2ff6052`（第八轮 requirement-8 十四项需求 `a8f27fb` + 侧栏按钮图标化 `7bf5b1b` + 交接文档 round-8 更新 `9236fba` + 第九轮 4 条修复 `793315b` + 交接文档 round-9 更新 `5dd1d8e` + 第十轮 3 条修复 `3389de3` + 交接文档 round-10 更新 `1c9f857`/`2e469bf` + 第十一轮 7 个问题修复 `483c869` + 交接文档 round-11 更新 `2ff6052`）。推送时直连 GitHub 网络不稳定（SSL reset / 443 超时），临时经本机 `socks5h://127.0.0.1:10808` 单次代理推送成功，未改全局 git 配置；后续推送若遇同类网络问题可复用 `git -c http.proxy=socks5h://127.0.0.1:10808 -c https.proxy=socks5h://127.0.0.1:10808 push`，或配置持久代理
- **未跟踪文件**：工作区存在 `.codegraph/`、`codex-parity-plan/`、`documentation/app-server-schemas/typescript/`、`codex-config-summary.md`（研究草稿）等未跟踪内容，与本任务无关，确认归属后再决定是否纳入版本控制
- **依赖安装历史**：若换机重新 `pnpm install`，观察 `allowBuilds` 是否完整覆盖构建需求；如出现新的「Ignored build scripts」警告，按同名格式补充到 `pnpm-workspace.yaml`
- **跨平台回归（2026-08-06 已完成 Linux 侧）**：已用本机 WSL2（Ubuntu）完成 Linux 侧验证——`vue-tsc --noEmit` 无类型错误、`vite build` 成功（4.58s）、`tsup` CLI 构建成功、单测 20 文件 229 用例全部通过（Windows 侧基线为 227 通过 + 2 环境性失败，Linux 下无此环境性失败，全部通过）。macOS 侧尚未验证。WSL 环境配置：fnm 1.39.0（`~/.local/share/fnm`）+ Node v22.23.2 + pnpm 11.18.0；注意 WSL 内无 fnm 时需先装（本机 Windows fnm 仅含 Windows 版 Node，无法在 WSL 复用），验证目录 `~/codex-linux-check`（从 Windows 侧 rsync 源码，排除 node_modules/dist/output/.git 等）；WSL 内无法直连 fnm.vercel.app（超时），Node 二进制由 Windows 侧下载后经 `/mnt/c` 共享解压，fnm 1.39.0 二进制同理
- **验收遗留**：plan/approval popover 当前无 Enter/方向键键盘导航，后续如需可补；ExecPlans 待后端 Codex 版本支持后自动变为可选

## 交接注意事项

- 文档与示例中的用户名、本机绝对路径均已脱敏，用 `<用户名>`、`<项目目录>` 占位
- 不要重新创建被删除的 `vite.config.js` 等本地产物，仓库只用 `vite.config.ts`
- `5173` 是 HBuilderX 的服务，不要随意停止或改动
- dev server 用 `--host 127.0.0.1` 启动，避免局域网暴露；如需远程访问再按需调整 host
- git 提交信息遵循仓库惯例（具体、单任务、不混提无关改动）

---

*codexapp · 交接文档 · 2026-08-06（P2 全部完成 + 六轮验收修复已推送 + 第七轮 9 条需求/问题：8 条已实现、需求 9 调研结论已确认（服务端 turn 语义，非 UI bug）+ 第八轮 5 个上游 PR 移植已推送 + 需求 6 决策：对齐 trae-work 全量重构已实施（commit 0f1a970）+ WSL Linux 侧跨平台回归已完成 + requirement-8 十四项需求全部落地并推送 + 侧栏设置/回收站按钮图标化已推送 + 第九轮 4 条需求/问题全部修复：策略按钮显示选中值、审批策略 env 不再强制 never、模型强度默认 Medium、编辑消息先停止会话 + 第十轮 3 条需求全部实现：侧栏底部设置/回收图标各占半宽且图标增大、模型按钮固定宽度超出省略、H5 下模型/模型强度/上下文按钮改小 + 第十一轮 7 个问题全部修复：设置弹框幽灵点击重开、移动端右侧面板遮罩、H5 控件行换行、plan 面板 markdown 解析、命令权限拦截提示、plan 展开面板同宽、命令与叙述时间序交错恢复） · 内容已脱敏*
