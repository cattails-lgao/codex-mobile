# Settings group navigation, pending-request scroll, and thinking persistence

2026-08-06 第十二轮反馈修复：设置面板左右布局、Awaiting response 面板滚动、thinking 内容本地持久化展示。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`，PATH 需含 fnm node 与 `AppData\Local\pnpm\bin`）
- 至少一个线程（本地/长任务测试线程均可）
- Playwright（本机 Edge channel）用于布局断言

## 1. 设置面板左右布局

**期望**：设置弹窗左侧为分组导航（General settings / Models & providers / Integrations / Usage & about），右侧显示当前分组内容；默认选中 General settings（含 Accounts 区与通用设置）。

**操作**：

1. 点击侧边栏底部设置图标打开设置弹窗
2. 断言左侧 4 个导航按钮存在，General settings 高亮，右侧显示 Accounts 与通用设置
3. 点击 Models & providers → 右侧切换为 Provider/模型配置，General 内容隐藏
4. 依次点击 Integrations、Usage & about → 内容正确切换，导航高亮跟随
5. 切换明暗主题，重复 2-4，导航与内容区样式正常（无白底残留）

**验证**：Playwright 断言 `settings-group-nav-item` 数量 4、默认 `is-active` 为 General settings、点击后 v-show 容器 display 切换（`settings-{light,dark}.png` 截图正常）。

**回滚**：无（纯 UI 布局，设置状态不变）。

## 2. Awaiting response 面板超出屏幕

**期望**：模型通过 `request_user_input` 提问时，composer 上方的等待面板内容多时不超出视口，可滚动查看。

**操作**：

1. 在长任务类线程中触发模型提问（多个问题 + 下拉/输入）
2. 断言面板高度不超过视口（`max-h-[min(70vh,36rem)]`），内容溢出时出现滚动条
3. 小视口（375×812）重复验证，确认不超出屏幕

**验证**：面板 `.thread-pending-request-shell` 计算样式含 `max-height` 与 `overflow-y: auto`。

## 3. thinking 内容在消息列表展示

**背景**：app-server 不把 reasoning 持久化到 thread/read（仅流式通知），此前 thinking 只在进行中显示、刷新即失。现前端在 turn 完成/agent 内容开始时把 live thinking 存档到 localStorage（`codex-web-local.thread-reasoning.v1`），消息列表以可折叠的 Thinking process 块展示，刷新后仍在。

**操作**：

1. 在长任务线程让模型产生一段 thinking（观察进行中的 live overlay）
2. turn 结束后断言消息列表出现 `.reasoning-block`（🧠 Thinking process，默认折叠，点击展开完整内容）
3. 刷新页面，重新打开该线程 → thinking 块仍在（来自本地存档）
4. 切换明暗主题，thinking 块样式正常

**验证**：`reasoning-block` 计数 ≥1；localStorage 键存在且含该线程记录（每线程最多保留 20 条）。

**回滚**：清除 `codex-web-local.thread-reasoning.v1` 即可移除本地存档。
