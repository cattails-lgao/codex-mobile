# 待办需求（2026-08-05 提出，已全部落地）

> **2026-08-05 第二轮进展：** 需求 1、2、3、4、5、7 已实现，commit `81116c0`（next-round backlog）已提交并推送；需求 6（消息展示 vs TUI）为调研结论，按用户指示保留、不做实现，待产品决策（2026-08-06 已决策改为对齐 trae-work 工作过程风格并全量重构实施，commit `0f1a970`，见下）。至此 7 条需求全部落地；其中需求 1 在同日第三轮验收中按用户要求恢复技能 chips（见下）。

以下需求来自下一轮产品验收。前 5 条为明确的界面改造，第 6 条是现状调研结论（供决定是否对齐 TUI），第 7 条为交互防误触。涉及组件：`App.vue`、`ThreadComposer.vue`、`ComposerSlashMenu.vue`、`ThreadConversation.vue`、`ContentHeader.vue`。

### 1. 输入框下的技能 chips 可移除

> **已实现（commit `81116c0`），但随后按用户要求恢复，当前存在。** 第三轮验收（同日）调整项 5「斜杠命令选中技能后恢复输入框上方技能 chips」撤销了本项：恢复 `.thread-composer-skill-chips` 渲染与 `removeSkill`/`skillMarkdownPath`/`openSkillMarkdown` 函数及样式，`ThreadComposer.vue` 第 121 行起当前仍渲染技能 chips（`selectedSkills` 保留用于消息载荷）。如需再次移除，按下方改动要点执行即可。

- **现状**：技能已集成到斜杠菜单（`/技能名`，见 `eedf148`），但输入框下方仍有 `.thread-composer-skill-chips` 技能 chips（`ThreadComposer.vue` 第 65 行起），`selectedSkills` 会随选中技能追加
- **改动要点**：删除技能 chips 的渲染与相关样式；保留 `selectedSkills` 状态本身（提交消息时仍需携带 `skills` 载荷），仅移除其视觉呈现，或将选中态改为仅体现在斜杠菜单高亮

### 2. 设置面板从侧边栏提出来

> **已实现（commit `81116c0`）。** 设置面板改为居中模态对话框（`dialog`，带背板/Esc 关闭），不再缩在侧边栏内；后续轮次又做了布局分组归纳（见 requirement-8 第 12 条）。

- **现状**：设置面板是侧边栏底部的内嵌浮层（`.sidebar-settings-panel`，`App.vue` 第 117 行），由 `.sidebar-settings-button` 打开，缩在侧边栏内
- **改动要点**：改为独立对话框/全屏抽屉（`dialog` 或覆盖层），或新增独立设置路由；面板内容（账号、Hooks、Marketplace、Plugin 分享、远程控制、审批策略）原样迁移，需保留现有 `v-if` 逻辑与状态

### 3. 去掉右上角终端按钮与 Detached Head 按钮

> **已实现（commit `81116c0`）。** 移除两个头部入口（`HeaderGitBranchDropdown` 组件整体删除，-792 行）；终端与 git 面板能力并入第 4 点的右侧边栏 tab（Ctrl/Cmd+J 切换面板 tab）。

- **现状**：`ContentHeader` actions 区有两个入口：终端命令下拉（`ComposerDropdown` + `IconTablerTerminal`，`App.vue` 第 688-700 行）与 git 分支下拉（`HeaderGitBranchDropdown`，第 701 行起，含 detached head 标识）；打开的是 `ThreadTerminalPanel`
- **改动要点**：移除这两个头部入口及其相关状态（`canShowTerminalToggle`、`isComposerTerminalOpen`、`canShowContentHeaderBranchDropdown` 等）；终端与 git 面板能力并入第 4 点的右侧边栏 tab

### 4. 布局改 3 栏：左侧边栏 + 消息 + 右侧边栏

> **已实现（commit `81116c0`）。** 新增右侧边栏（Git/Terminal tab + `+` popover，默认 Git）；后续轮次持续演进：可拖拽宽度/可收起（第三轮调整 1）、默认仅 Git tab（调整 2）、Files/Preview tab（第五/八轮）等。

- **现状**：当前为 2 栏：`Sidebar`（左侧）+ `content-root`（消息），无右侧面板；终端/文件变更等以弹层或行内方式呈现
- **改动要点**：新增右侧边栏：顶部 tab 栏 + 一个 `+` 按钮，点击弹出 popover 可选「终端面板」「Git 面板」，默认显示 Git 面板；左侧边栏与消息区保持不变；新面板复用现有 `ThreadTerminalPanel` 与 git 下拉的数据逻辑

### 5. 斜杠菜单技能组展示完整技能名称

> **已实现（commit `81116c0`）。** 技能行主文本改用 `displayName`；第四轮反馈又为技能行加了 scope 图标布局（见第四轮反馈 1）。

- **现状**：`ComposerSlashMenu.vue` 技能行显示 `command.id`（由技能名规范化而来，如 `frontend-code-review`），非完整展示名；`SkillItem` 已带 `displayName` 字段可用
- **改动要点**：技能行主文本改用 `displayName`（无则回退 `name`），`id` 仅用于匹配与插槽文本

### 6. 当前消息展示 vs TUI 的差异（调研结论）

- **现状**：见下方「消息展示现状与 TUI 对比」
- **改动要点**：2026-08-06 已决策不对齐 TUI，改为按 trae-work 工作过程风格全量重构（commit `0f1a970`），见下

### 7. 编辑 / 回退消息需确认提示

> **已实现（commit `81116c0`）。** 新增 `ConfirmDialog.vue` 公共组件；编辑消息（edit）、文件变更撤销/重做（file-change）两类破坏性操作在 `ThreadConversation.vue` 中经 `pendingConfirm` 确认后执行，保留至今。

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

