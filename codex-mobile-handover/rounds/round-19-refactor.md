# 第十五轮交接需求（2026-08-07 提出）

> **2026-08-07 第十五轮进展：** `ThreadConversation.vue` 拆分重构完成（5701 行 / 201KB → 2951 行 / 104KB，-48%）：3 个纯函数 utils + 8 个 UI 子组件。`vue-tsc --noEmit` 通过、`pnpm run build` 通过、单测 245 通过（2 个既有 Windows 环境性失败与改动无关）、Playwright 桌面/暗色/H5 全链路实测通过。手动测试文档：`tests/chat-composer-rendering/thread-conversation-split-refactor.md`。

1. **`src/utils/conversationPaths.ts`**：路径/文件引用解析纯函数（`isFilePath`/`resolveRelativePath`/`parseFileReference`/`toLocalThreadUrl`/`headingTag` 等），从 `ThreadConversation.vue` 迁出，零组件依赖。
2. **`src/utils/conversationMarkdown.ts`**：`InlineSegment`/`MessageBlock`/`ListItem`/`TableAlignment`/`TaskListItem` 类型 + 整条 markdown 解析链（`parseInlineSegmentsUncached`/`parseMessageBlocks` + 约 40 个内部辅助函数），含图片 URL 归一化 `toRenderableImageUrl`。
3. **`src/utils/conversationFileChanges.ts`**：`TurnFileChangeSummary`/`DiffViewerLine` 类型 + fileChange 聚合（`aggregateFileChanges` 等）/展示（`fileChangeSummaryLabel` 等，`t`/`cwd` 参数化）/diff 行构建（`buildDiffViewerLines` 等）。`CODE_LANGUAGE_ALIASES` 同步迁入。
4. **`WorkBlockItem.vue`**（238 行）：命令工作块——步骤序号圆点、命令、状态标签、输出展开（grid-template-rows 动画）、权限拦截提示。props：`command`/`stepIndex`/`expanded`/`compact`/`outputCondensed`；emit `toggle`。
5. **`ToolCallRow.vue`**（116 行）：工具调用行，自含状态标签/类名/title 计算。
6. **`ReasoningBlock.vue`**（88 行）：思考块，props `message`/`expanded`/`contentHtml`；`summary` 提取内聚到组件；13px/zinc-500 字体规则随迁。
7. **`LiveOverlayItem.vue`**（103 行）：live overlay（Thinking 折叠/展开 + 错误反馈链接），`isLiveReasoningExpanded` 状态内聚，反馈诊断 composable 自引用。
8. **`MessageToolbar.vue`**（110 行）：edit/fork/copy 工具栏，`:global(.message-row:hover)` 保持悬停显隐；图标组件随迁。
9. **`FileLinkContextMenu.vue`**（129 行）：文件链接右键菜单自包含——`browseUrl`/`editUrl` props + `close` emit，window pointerdown/blur/Escape 监听内聚（`watch(visible)` 挂载/卸载），复制走 `copyTextToClipboard`。
10. **`FileChangeSummaryBlock.vue`**（232 行）：文件变更摘要，standalone 与 anchored 两处模板合一（`inline` prop 区分），`actionable`/`actionStatus`/`actionErrorText`/`nextAction`/`actionLabel` 由父组件传入；emit `toggle`/`open-diff`/`request-action`。
11. **`DiffViewer.vue`**（429 行）：diff 查看器全套（桌面侧栏 + 移动 sheet + 行渲染），props `change`/`changes`/`lines`/`isMobile`/`isFileListOpen`/`cwd`；emit `close`/`select-change`/`toggle-file-list`/`close-file-list`。
12. **模板等价性验证**：沙箱 app-server 的 `thread-file-change-fallback` 端点返回空（无会话文件变更记录），fileChange/diff 无法用真实数据触发；改用 git 对照——`DiffViewer` 新旧 class 集合缺失 0，`FileChangeSummaryBlock` 4 个动态绑定一一对应（`cmd-expanded`/`cmd-chevron-open`/`cmd-group-visible`/`file-change-action-icon-redo`），渲染条件均未改动。
13. **（顺带）** 拆除了大量死代码：live overlay 相关 4 个函数、toolCall 3 个函数、command 状态 3 个函数 + `PERMISSION_BLOCKED_PATTERNS`、右键菜单 8 个函数与 3 个 window 监听、`fileChangeKey` 本地副本、7 个未使用 import、约 900 行样式（随组件迁出）。

> **验证说明：** Playwright 实测 24 项全部通过——work-block 渲染（12）/展开（0px→240px）、message-toolbar（20）、右键菜单开/关、ReasoningBlock（注入存档：渲染/折叠/摘要/13px 字体）、LiveOverlayItem（真实 turn 流式期间出现）、暗色（html.dark + work-block 边框 + toolbar）、H5（375×812 抽屉进入、无横向溢出、work-block 渲染/展开）。回归脚本留存 `output/playwright/r15-*.cjs`。后续全量移植方案见下方「Reasonix 消息列表全量移植方案」。

