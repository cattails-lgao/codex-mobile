# Round 28: Plan panel executed state after refresh + IME composition Enter guard

## Feature: Plan panel shows executed state after refresh and during IME composition Enter does not send

### Prerequisites
- Dev server on `127.0.0.1:4173`（`pnpm run dev --host 127.0.0.1 --port 4173`）
- 一个会产生 plan 的线程。若使用 OpenCode Zen（plan 仅实时推送、服务端不持久化），可覆盖 localStorage 兜底路径；标准 Codex provider 覆盖消息流路径。

### Steps
1. 打开一个线程，让模型在 Plan 模式产出计划，确认输入框上方出现计划面板，Implement 按钮可点击。
2. 点击 Implement 执行计划，等待出现工作项（commandExecution / fileChange 等）。
3. 页面刷新，观察计划面板：应仍显示计划块，但 Implement 按钮为「Plan executed」且禁用（不可再点击）。
4. 再次刷新并等待计划完成（后续轮次已有工作项），确认按钮状态同上。
5. （macOS）在输入框使用中文输入法：先输入一段拼音，在候选词列表选词时按 Enter 确认——消息不应被发送；拼音候选确认完成后再次按 Enter（不按 Shift），消息应正常发送。
6. （macOS）拼音输入中途（组合未完成）直接按 Enter，消息也不应被发送。

### Expected Results
- 计划执行中/完成后刷新：计划块保留（有意为之，round-27 决定），按钮显示「Plan executed」并禁用，防重复点击（问题 1/2 修复）。
- 输入法组合期间的 Enter（含候选词确认）不会触发送出；组合结束后 Enter 正常发送（问题 4 修复）。
- 刷新后计划轮序号缺失时，按 turnId 从当前线程轮次映射重新解析（`resolveThreadTurnIndex`），后续轮次有工作项即判定为已实施。

### Rollback/Cleanup
- 无特殊清理；验证用线程可删除。
