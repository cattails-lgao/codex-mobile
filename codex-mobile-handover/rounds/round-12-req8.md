# 第八轮交接需求（requirement-8，2026-08-06 提出）

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

