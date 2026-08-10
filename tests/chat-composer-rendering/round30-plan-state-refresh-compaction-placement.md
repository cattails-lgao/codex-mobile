# Round 30: Plan panel executed state after refresh + compaction block placement after refresh

## Feature: Plan panel Implement button disabled during message load / single-turn threads; compaction block anchored to turn start after refresh

### Background
三个与刷新后状态相关的缺陷，均可用「Markdown 图片本地化下载器」长任务线程（单 turn、plan 不持久化、含 `contextCompaction` item）复现：

1. 执行计划中刷新页面：消息异步加载完成前，计划面板的 Implement 按钮短暂可点击（可误触发重复 Implement），plan 状态（Updating/执行中）也短暂消失，加载完成后恢复正常。
2. 单轮长任务对话完成后，plan 已完成（有大量工作项），但计划面板的执行按钮仍可点击——根因：兜底路径 `planHasWorkInLaterTurns` 用 `turnIndex > planTurnIndex`（严格大于），plan 与全部工作项同轮（turnIndex 相同）恒判未实施。
3. 任务中途出现自动压缩，刷新前压缩块位置正确，刷新后 `thread-compaction-inline` 压缩块跑到当前对话轮最后——根因：服务端把 `contextCompaction` 固定放在 turn items 末尾，归一化后按服务端顺序渲染。

### Prerequisites
- Dev server on `127.0.0.1:4173`（`pnpm run dev --host 127.0.0.1 --port 4173`）
- 一个单 turn 长任务线程（如「Markdown 图片本地化下载器」`019fe99b-...`），含 `contextCompaction` item、plan 不持久化（OpenCode Zen）

### Steps
1. 打开该长任务线程，确认消息列表完整加载。
2. **问题 1**：在 plan 执行中刷新页面，立即打开输入框上方的计划面板——Implement 按钮应为禁用态（加载中保护），消息加载完成后按真实消息重判。
3. **问题 2**：对话完成后（消息列表出现大量工作项），打开计划面板——Implement 按钮应显示「Plan executed」并禁用，即使 plan 与工作项同轮（单 turn）。
4. **问题 3**：滚动到对话最底部，确认「Context compacted」压缩块不再出现在最后一条消息之后；它应紧跟该轮第一条用户消息之后（压缩是 turn 边界动作，归位到轮首）。

### Expected Results
- 刷新加载期间 Implement 按钮不短暂可点击（`isLoadingMessages` 期间 implemented 强制 true，加载完成后重判）。
- 单轮长任务对话完成后按钮显示「Plan executed」禁用（`planHasWorkInLaterTurns` 改 `>=`，覆盖同轮工作项）。
- 刷新后压缩块位于该轮用户消息之后、工作项之前，不跑到对话最后（`repositionCompactionAfterUserMessage`）。
- 兜底路径 streaming 状态跟随存档 messageType（plan.live 显示 Updating，plan 不显示），不再恒为 false。

### Rollback/Cleanup
- 无特殊清理；验证用线程可删除。Playwright 回归脚本：`output/playwright/r30-compaction-check.cjs`（压缩块位置断言）、`r30-plan-panel-check.cjs`（单轮 implemented 断言）。
