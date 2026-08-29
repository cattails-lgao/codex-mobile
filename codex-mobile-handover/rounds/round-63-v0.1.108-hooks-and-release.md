# Round-63：ThreadConversation / App.vue hook 化与 v0.1.108 发布（2026-08-29）

> **范围：** round-62 收官后，按「巨型 `.vue` 第二轮组件化 => hook 化」路径，对 `ThreadConversation` 与 `App.vue` 抽取多个内聚窄依赖簇，并随 v0.1.108 一起发布。hook 抽取逐行对照原实现无行为漂移；`vue-tsc` 通过、Vitest 507/509（2 个失败为既有 Windows `codexAppServerBridge.archive.test.ts` 环境性旧问题）与本轮无关。发布链路（git tag / GitHub Release / npm）全部闭环。

## 本轮提交

| 提交 | 内容 |
| --- | --- |
| `782d426` 等一轮（round-62 收尾合并记录） | 见 [round-62](round-62-domain-modularization.md) 的 ThreadConversation 组件化试点背景 |
| `f6cd11f` | ThreadConversation Markdown 渲染管道 → `useMarkdownRendering.ts` |
| `a0d99a3` | 文件变更摘要 + diff viewer → `useFileChangeSummaries.ts` |
| `9c49726` | 回复复制 / fork → `useReplyCopyFork.ts` |
| `764e702` | 命令执行展示 → `useCommandExecutionDisplay.ts` |
| `781e360` | 文件变更 undo/redo 状态机 → `useFileChangeActionMachine.ts` |
| `61307d9` | 文件链接菜单 + 图片展示 → `useFileLinkContextMenu.ts` / `useMessageImageDisplay.ts` |
| `872a1a5` | App.vue 侧边栏 UI 状态 → `useSidebarUi.ts` |
| `5baeb8c` | App.vue 右侧面板簇 → `useRightPanel.ts` |
| `1edd0cd` | 修复 props 在 hook 之后声明导致的 TDZ 崩溃 |
| `d3b3eb5` | 每轮耗时显示（`sumTurnDurations` 按 turnId 聚合 worked `durationMs`） |
| `db1db6d` | 375px 移动端右侧面板抽屉 Playwright 回归（`scripts/verify-mobile-375.cjs`） |
| `4e9fe75` | bump 版本 0.1.108 |
| `dff3944` | `useReplyCopyFork` 复制复位计时器卸载清理补回 |
| `dc839b6` / `004299d` / `e943856` | 交接文档快照刷新 + v0.1.108 GitHub/npm 发布记录 |

## hook 抽取清单与验证

八个 ThreadConversation hook + 两个 App.vue hook 均以「窄依赖注入 + 写侧编排保留在组件/主闭包」接线，逐行对照原实现无行为漂移：

- `useMarkdownRendering`：三段 LRU 缓存 + highlight.js 延迟加载 + 块/内联/列表/表格/代码块渲染。定向单测 5 例。
- `useFileChangeSummaries`：锚定/独立/隐藏三组摘要 computed + diff viewer computed。单测 6 例。
- `useReplyCopyFork`：复制/fork 辅助。单测 10 例（含 1.8s 计时器复位、剪贴板失败路径）。
- `useCommandExecutionDisplay`：命令展示状态。单测 8 例。
- `useFileChangeActionMachine`：五态 undo/redo 状态机。单测 11 例。
- `useFileLinkContextMenu` / `useMessageImageDisplay`：极窄簇，单测 5 + 4 例。
- `useSidebarUi`：零注入，自持 localStorage 持久化与滚动恢复。单测 9 例。
- `useRightPanel`：面板/预览/tab/终端键盘焦点，`activeRightPanelTab` 等共享 ref 供组件编排读写。单测 16 例。

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过（web + CLI）。主 JS 稳定在约 `551.90 kB`、gzip `171.28 kB`；既有 `>500 kB` 警告保留。
- Vitest 507/509 通过（2 个失败为 `codexAppServerBridge.archive.test.ts` 的 Windows 文件 mode/符号链接环境性旧问题）；最新定向测试 sidebar 8/8 通过。

## 性能审计

- hook 抽取为纯代码重组：请求入口、缓存键、渲染次数、锁流与时序与原闭包实现逐行一致，未新增请求、watcher、后台轮询、无界 fanout 或持久化 I/O。主 chunk 变化仅属模块边界开销，非 code-splitting。
- `d3b3eb5` 每轮耗时显示：仅在工作消息上按 turnId 聚合成单行文本，本地计算，无网络/缓存/存储追加。移动端 Playwright 回归 `db1db6d` 锁定右侧面板抽屉无回归。未在本轮采集浏览器 runtime profile。

## 发布状态

- 版本 bump `4e9fe75` → tag 曾停在 bump 提交；因 npm 未发布，tag `v0.1.108` 已被强移至发布基准确认提交（交接文档刷新后确认），使 npm 包与 tag、GitHub Release 一致。
- GitHub Release `v0.1.108`：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.108
- `codex-mobile-re@0.1.108` 已由用户发布至 npm 官方源并成为 `latest`（`npm view` 确认 dist-tags.latest = 0.1.108）。发布链路全部闭环。

## 交接注意事项

- 不要为继续降行数搬运闭包函数：只抽「内聚、自持状态、对外依赖窄」的簇（渲染管道/摘要/copy-fork/命令展示/undo-redo 状态机/文件链接菜单/图片/侧栏/右栏），深状态簇（回合塑形、消息窗口化+滚动、生命周期/watch 编排、`applyRealtimeUpdates` 写引擎）评估后不做拆分。
- `1edd0cd` 说明：组件 props 必须在引用之前声明，hook 内使用 props 时应保序，避免 TDZ 白屏。
- `useReplyCopyFork` 的 1.8s 复位计时器必须随 `onBeforeUnmount` 清理，否则卸载后仍触发 state 写入。
- v0.1.108 的 git tag、GitHub Release 与 npm 发布均已完成，无需重复发布。