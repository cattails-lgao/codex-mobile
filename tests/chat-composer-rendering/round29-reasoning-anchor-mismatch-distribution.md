# Round 29: Reasoning blocks interleave with work items after refresh

## Feature: Stale reasoning anchors (bridge-rewritten ids) distribute instead of piling up

### Prerequisites
- Dev server on `127.0.0.1:4173`
- 一个 OpenCode Zen 线程（思考块带锚点存档），要求：turn 内含多条命令 + 多段思考，且已完成/可刷新。

### Steps
1. 打开线程，确认 live 阶段思考块与命令正常交错（无刷新时正常）。
2. 刷新页面（或重新打开线程），等待 `thread/resume` 恢复完成。
3. 观察消息流：思考块应按存档顺序分摊到各命令/agent 消息之后，与命令交错显示。
4. 检查是否存在「思考块全部堆在用户消息后、第一条命令前」的思考墙。

### Expected Results
- 刷新后思考块与命令交错，不再堆成墙（round-29 修复：锚点存在但匹配失败 = bridge 恢复改写消息 id 导致，按无锚点一样分摊）。
- 纯问答轮（无命令）的「提问 → 思考 → 回复」顺序不变。

### Rollback/Cleanup
- 无特殊清理；验证用线程可删除。

## Round 39: Orphaned-turn reasoning no longer appends at the end of the conversation

### Feature/Change Name
Reasoning archive entries whose `turnIndex` does not exist in the loaded message stream (the turn was rolled back or deleted, leaving stale archive rows) are dropped instead of appended at the bottom of the conversation. Previously they rendered as a stray "思考过程" block after the final reply ("思考过程怎么在最后").

### Prerequisites
- Dev server on `127.0.0.1:4173`
- A thread where a turn was rolled back / deleted after it streamed reasoning (the reasoning archive keeps the old entries)

### Steps
1. 打开该线程，滚动到对话末尾。
2. 确认最后一条消息之后没有孤立的「思考过程」块（此前会出现 1-2 个折叠的思考块堆在末尾）。
3. 分页加载更早的轮次（如有）：确认被丢弃的思考在其所属轮次加载后按正常位置出现。

### Expected Results
- 末尾不再出现孤儿思考块；轮次存在时思考仍按原顺序交错显示。
- 纯问答轮「提问 → 思考 → 回复」顺序不变。

### Rollback/Cleanup
- 验证用线程可删除；服务端 `thread-reasoning` 归档中的孤儿条目不影响显示（前端渲染时丢弃），无需手工清理。
