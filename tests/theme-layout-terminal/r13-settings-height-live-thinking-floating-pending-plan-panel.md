# R13: settings fixed height, live thinking, floating pending panel, plan panel fixes

2026-08-06 第十三轮反馈修复：设置面板固定高度、thinking 实时显示、Awaiting response 悬浮面板（脱离文档流 + 明暗主题 + 中文文案）、计划面板步骤解析（编号优先，35→6）、Implement 后防重复点击、Implement popover 内部样式。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`，PATH 需含 fnm node 与 `AppData\Local\pnpm\bin`）
- 至少一个带 plan 的历史线程（如「重命名小工具」，plan 为 markdown 编号列表格式）
- Playwright（本机 Edge channel）用于布局断言

## 1. 设置面板固定高度

**期望**：切换左侧分组（General / Models / Integrations / Usage）时，弹窗整体高度不变（不再随内容伸缩跳动）。

**操作**：

1. 点击侧边栏底部设置图标打开设置弹窗
2. 依次点击 4 个分组，记录 `.sidebar-settings-panel` 的 boundingClientRect().height

**验证**：4 个分组下高度一致（本机 1280×800 实测均 672px）。

## 2. thinking 实时显示（live overlay）

**背景**：本 app-server（codex-cli 0.146.0）不推送 `item/reasoning/*TextDelta` 增量通道，reasoning 内容只随 `item/started`/`item/completed` 全量 item 到达；此前 live overlay 只显示空「Thinking」，整个思考阶段无内容。

**操作**：

1. 发起一个需要较长思考的 turn（如 plan 模式提问）
2. 观察消息流底部 live overlay 的 reasoning 文本区

**验证**：`.live-overlay-reasoning` 实时显示模型思考文本（如「The user is asking me to plan…」），不再是空状态。本机实测 459 字符实时渲染。

## 3. Awaiting response / 权限审核面板悬浮化 + 明暗主题 + 中文

**期望**：面板 `position: fixed` 悬浮于视口底部居中（z-900），不再占文档流把输入框顶下去；浅色主题白底、暗色主题深底；标题与选项为中文。

**操作**：

1. 触发 `request_user_input`（模型提问）或权限审核请求
2. 断言 `.thread-pending-request` 计算样式 `position: fixed`、`bottom: max(1rem, …)`、水平居中；`.thread-pending-request-shell` 浅色 `background-color: white`、暗色 `oklch(21% …)`（zinc-900）
3. 标题与选项文案为中文（如「等待响应」「Codex 需要你的回答才能继续。」「是」「本次会话内允许」；输入占位「不允许，并告诉 Codex 应如何调整」）
4. 375×812 视口下面板宽 `min(100vw-1rem, 30rem)`，无横向溢出

**验证**：真实 `waitingOnUserInput` 线程实测——LIGHT shell 白底、DARK shell `oklch(0.21…)`；H5 宽 359px 无 `overflowX`。

## 4. 计划面板步骤数正确（编号优先，35→6）

**背景**：codex CLI 持久化的 plan 是 markdown 编号列表（`1. …`）+ 项目符号细节混排；旧解析把所有项目符号当步骤（「重命名小工具」plan 显示 35 步）。现编号列表优先（6 步），项目符号为细节不进步骤。

**操作**：

1. 打开「重命名小工具」线程
2. 展开计划面板（点击 🗒 条）

**验证**：`.thread-composer-plan-panel-step` 计数为 6（此前 35），第一步「**脚手架** → 产出：…」，折叠条显示 `0/6`；explanation 无 `##` 标题符号残留。

## 5. Implement 后防重复点击 + 已执行提示

**背景**：计划对应 turn 之后已有工作消息（命令/work），或用户已点过 Implement，按钮仍可重复点击、无状态提示。

**操作**：

1. 打开已完成执行的线程（如「重命名小工具」）查看按钮状态
2. 在未执行计划的线程点一次 Implement，观察按钮立即变化

**验证**：已执行计划的线程按钮 `disabled=true` 且文案「计划已执行」（`.thread-composer-plan-panel-implement[data-state=done]`）；plan.live 流式中按钮禁用且文案「执行中…」。

## 6. Implement popover 内部样式

**期望**：展开面板内步骤列表、explanation、执行按钮均有清晰样式（不再只有纯文本）。

**操作**：点击计划面板条展开 popover。

**验证**：`.thread-composer-plan-panel-steps` flex 列表、`.thread-composer-plan-panel-step` 状态图标 ○/•/✓ 着色、`.thread-composer-plan-panel-implement` 为按钮样式（白字黑底 / 暗色黑字白底）；展开面板宽与折叠条对齐（min-w-full）。

## 回滚

- 无数据变更；thinking 存档仍在 localStorage `codex-web-local.thread-reasoning.v1`，清除即可移除历史思考块。
