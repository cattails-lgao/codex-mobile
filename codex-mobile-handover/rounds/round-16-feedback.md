# 第十二轮反馈（2026-08-06 提出）

> **2026-08-06 第十二轮进展：** 3 条需求已实现，1 条调研结论已确认。验证：`vue-tsc --noEmit` 通过、全量单测 233 通过（2 个失败为既有 Windows 环境性失败：`codexAppServerBridge.archive.test.ts` symlink EPERM 与 chmod 权限位，与本次改动无关）、Playwright 实测设置面板左右布局与明暗主题、reasoning 本地存档渲染。涉及 `App.vue`、`ThreadPendingRequestPanel.vue`、`useDesktopState.ts`、`useDesktopState.test.ts`。手动测试文档：`tests/theme-layout-terminal/settings-group-navigation-pending-scroll-thinking-persistence.md`。

1. **设置面板改左右布局**：`.settings-dialog-body` 改为左右分栏——左侧 `.settings-group-nav`（General settings / Models & providers / Integrations / Usage & about 四个导航按钮），右侧 `.settings-group-content` 按 `activeSettingsGroup`（默认 `general`）v-show 切换内容；Accounts 区并入 General 组；面板宽度 `max-w-xl` → `max-w-2xl`。验证：Playwright 桌面/H5 双主题——4 个导航项、默认选中 General、点击切换 v-show 容器 display 正确
2. **Awaiting response 面板超出屏幕**：`.thread-pending-request-shell` 加 `max-h-[min(70vh,36rem)]` + `overflow-y-auto`，多问题/下拉内容不再超出视口
3. **thinking 内容不在消息列表展示**：确认根因——app-server 不把 reasoning 持久化到 thread/read（仅流式通知，JSONL 会话日志有 6 条 reasoning 但 thread/read turns 无），前端此前只在 live overlay 展示、turn 结束即清空。修复：`clearLiveReasoningForThread` 在清除前把完整 thinking 存档为 reasoning 消息（`rememberPersistedReasoning`，localStorage `codex-web-local.thread-reasoning.v1`，每线程最多 20 条、按文本去重），`messages` computed 合并注入，消息列表以 Thinking process 折叠块（`reasoning-block`）展示，刷新后仍保留；新增单测锁定（reasoning delta → agent 内容开始 → 存档）。验证：Playwright 注入 localStorage 记录后打开「长任务测试」线程，`reasoning-block` 正常渲染

> **调研结论（第 4 条现象「Worked for 11m 35s」）：** 属正常 turn 语义，非 bug。「长任务测试」线程（cwd `D:\code\codex-project\test`）唯一 turn `durationMs=695100`（11m35s，19:55:49 → 20:07:24），该时长是 turn 墙钟时间，**包含模型等待用户回答 3 个决策问题的时间**；模型通过 `request_user_input` 提问（function_call，JSONL 可见）→ 用户回答 → 模型产出完整 plan 后 turn 结束（idle），此时需点「Implement plan」继续执行。另外该 turn 的问答环节（request_user_input 的 function_call/output）未持久化到 thread/read，消息流中只看到模型文字，属 app-server 持久化语义。

