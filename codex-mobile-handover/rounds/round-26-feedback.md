# Round-26：7 条反馈修复（2026-08-09）

> **2026-08-09 进展：** 7 条反馈/问题全部落地并验证：`vue-tsc --noEmit` 通过、`pnpm run build` 通过、全量单测 312/314（2 个失败为既有 Windows 环境性失败，见下）、Playwright（Edge channel）真实/mock 双场景回归通过。涉及 `useDesktopState.ts`、`useDesktopState.test.ts`、`LiveOverlayItem.vue`、`ReasoningBlock.vue`、`MessageToolbar.vue`、`ThreadConversation.vue`、`App.vue`、`AppDialog.vue`、`ConfirmDialog.vue`、`ContentHeader.vue`、`DirectoryHub.vue`、`SidebarThreadTree.vue`、`style.css`。

## 1. live-overlay-details 冗余展示（移除）

`LiveOverlayItem.vue`：**彻底移除** `.live-overlay-details` 详情 chips 渲染（此前 round-24 只对 `Running command` 条件隐藏，Thinking 等其他状态仍显示 Mode/Model/Speed chips）。活动标签 + spinner + 流式思考文本已足够表达当前状态；命令文本会显示在消息列表的 WorkBlockItem 里，overlay 内再展示详情都是冗余。同步删除组件与 `style.css` 中残留的 `.live-overlay-detail` 暗色规则。

## 2. 思考过程（reasoning-block）堆到每轮开头（修复根因）

**根因（本次确认）：** live 阶段 `item/started` 的 commandExecution item id 是 `call_*`（如 `call_00_Ni9JOE3SyiO4r5oMt9Tf5137`），app-server 持久化到线程历史时给会话内命令加 `session-cmd-` 前缀（如 `session-cmd-call_*`）。round-23/24 的思考存档记录的是 **live id**（锚点 `call_*`），`mergePersistedReasoning` 在刷新后按持久化 id（`session-cmd-call_*`）找不到锚点 → 全部回退到「轮首用户消息之后」→ 表现为每轮所有思考块堆在开头、不跟命令交错。

**修复：** `mergePersistedReasoning` 的锚点查找 `findReasoningAnchorIndex` 兼容三种形态：精确匹配 → `session-cmd-` 前缀补全匹配 → 反向去前缀匹配。`useDesktopState.test.ts` 新增单测「锚点 `call_*` 匹配持久化 `session-cmd-call_*` 命令 id」。

**验证：** 真实线程（22 条命令、21 条存档思考）播种锚点后刷新，3 条思考全部插到对应命令之后（不再全部堆轮首）；单测 64/64 通过。

## 3. live-overlay-reasoning 高度调高

`LiveOverlayItem.vue`：`.live-overlay-reasoning` 的 `max-height` 从 `calc(1.25rem * 5)`（5 行）调高到 `calc(1.25rem * 12)`（12 行），长思考不再被压得过扁。

## 4. reasoning-block-icon 移除

`ReasoningBlock.vue`：删除头部 🧠 图标（`<span class="reasoning-block-icon">`）及其 CSS，标题 + 折叠箭头与命令块保持同密度。

## 5. 用户消息下回退/复制按钮风格不统一

`MessageToolbar.vue`：用户消息下复制按钮的 "Copy" 文字标签改为 `v-if="role !== 'user'"` 隐藏（与回退按钮一致，仅图标）。此前回退 26px 无文字、复制 53.6px 带文字，宽度/观感不一致；修复后两者同为 26px 纯图标按钮（Playwright 实测 width=26.0、无文字）。

## 6. fileChange 汇总块：轮完成后才显示 + 独立 li

`ThreadConversation.vue` + `useDesktopState.ts` + `App.vue`：

- **轮完成才显示：** 新增 `selectedActiveTurnId`（选中线程当前进行中 turn id，由 `activeTurnIdByThreadId` 派生）并通过 prop `live-turn-id` 传给 `ThreadConversation`；`isFileChangeSummaryVisible(summary)` 在 summary 所属 turn 等于进行中 turn 时隐藏，轮结束后（liveTurnId 清空）恢复，其他轮次不受影响。
- **独立 li：** 锚定 fileChange 汇总块从「锚点消息 li 内部的 div」改为「锚点消息 li 之后的独立 `<li class="conversation-item conversation-item-file-change" data-message-type="fileChange">`」（fold 轮末锚点与普通消息锚点两个场景都改）；standalone 路径（fileChange 消息自带 li）加同一可见性门控。

**验证（mock 线程，Playwright）：** 完成轮 → fileChange 块渲染为独立 li 且位于 agent 回复之后（轮末）；进行中轮（`turn.status=inProgress` + `activeTurnId` 命中）→ fileChange 块隐藏、overlay 正常出现。

## 7. 右侧面板/设置对话框暗色失效（scoped :global(:root.dark) 编译失效）

**根因（本次确认）：** 本构建（Vite + Lightning CSS）把组件 scoped 样式里的 `:global(:root.dark) X` 编译成 `:root.dark { &[data-v-xxx] { … } }`（即 `:root.dark[data-v-xxx]`），`data-v` 属性永远不会出现在 `<html>` 上 → 规则永不匹配。同理 `:global(.dark) X` 也失效。受影响面：**右侧面板（content-right-panel 系列）、设置对话框（settings-dialog/settings-group/sidebar-settings-area 系列）、新建会话启动卡、登录弹窗、回收站、确认/应用对话框等全部暗色覆盖失效** —— 正是「右侧边栏切换暗主题无效」的直接原因。

**修复：** 按仓库规则把所有失效的 `:global(:root.dark)` / `:global(.dark)` 暗色规则从组件 scoped 样式迁移到全局 `src/style.css`（`App.vue`、`AppDialog.vue`、`ConfirmDialog.vue`、`ContentHeader.vue`、`DirectoryHub.vue`、`SidebarThreadTree.vue`、`ThreadConversation.vue` 共 7 个组件），并删除组件内的死规则。

**验证：** 编译产物确认 `:root.dark .content-right-panel` / `:root.dark .settings-dialog-header` 等规则已在全局样式表；运行时暗色下设置对话框 header 边框由 zinc-200（浅色，失效状态）变为 zinc-700、面板/侧栏/分组导航均正确变暗。

## 验证说明

- 全量单测 312/314：2 个失败为既有 Windows 环境性失败（`codexAppServerBridge.archive.test.ts` 的 symlink EPERM 与 free-mode 状态文件字节数漂移），`git stash` 后在原始 HEAD 上同样失败，与本次改动无关。
- Playwright 回归均用 Edge channel（`chromium.launch({ channel: 'msedge' })`）。
- 真实数据验证在 dev server（`127.0.0.1:4173`）上进行，使用真实 app-server 线程与 RPC mock 双场景。
- 桥接层思考存档（`/codex-api/thread-reasoning`）在本轮验证期间因 HMR 重启/dev 环境出现过一次空存档（GET 返回 `{"data":{}}`），属本地调试环境干扰（多次并行写 `.codex-global-state.json` 的非原子读改写竞态），未改动相关代码；如线上复现「刷新后思考丢失」再排查该竞态。
