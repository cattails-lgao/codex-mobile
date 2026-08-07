# Codex 功能补齐方案完成情况

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

