# Round-45：「最后一轮思考跑到模型回答最后」的时序修复（2026-08-18）

> **背景：** 用户给了一份线上（Linux A1）线程 rollout JSONL（`rollout-2026-08-16T16-28-39-01a009af-...jsonl`），现象是**最后一轮对话的思考过程渲染在模型回答的最后**。本轮定位到根因并修复：`thread/read` 的会话日志时序恢复把 `reasoning` 全部挤到轮末。

## 复现（还原现场）

- 把该 rollout 种入 `<CODEX_HOME>/sessions/2026/08/16/`，用本项目 bridge 的 `/codex-api/rpc` `thread/read` 取数据。
- **原始 app-server 输出（正确）**：最后轮 items 为 `userMessage, reasoning, agentMessage, reasoning, agentMessage, reasoning, agentMessage, reasoning, agentMessage`——每条 `reasoning` 紧贴其后的 `agentMessage`。
- **bridge 处理后的输出（错误）**：messages 排前（2/4/10/11）、`reasoning` 全挤到轮末（12-15）→ 渲染时思考块全部出现在模型回答之后。

## 根因

`src/server/codexAppServerBridge.ts` 的 `mergeSessionCommandsIntoTurns()`（约 4035 行）用 `buildSessionItemOrder` 从会话日志重建轮内**命令/agent 消息**的顺序（这也是 round-31/34 命令块时序恢复所在处），但 `reasoning` 不是 slot 类型，于是在交错循环里永不落位，全部掉进 4106-4117 行的「把其余 server 持久化项（reasoning/tool plan 等）追加到轮末」兜底分支 → 思考被推到最后。

## 修复

在 `mergeSessionCommandsIntoTurns` 里，把原始 `existingItems` 中紧贴在每个 `agentMessage` 之前的 `reasoning` 收集成 `reasoningsByMessageId`（一条 O(n) 扫描 + 按消息 id O(1) 查表），三个消息落点（`agentMessages.length < agentSlotCount` 分支、正常交错分支、末尾 while）都改用 `emitAgentMessage`（先发其前导 reasonings 再发该消息）；并在尾部兜底循环里把 `reasoning` 跳过，避免二次追加。

```ts
const reasoningsByMessageId = new Map<string, Record<string, unknown>[]>()
let pendingReasonings = []
for (const item of existingItems) {
  if (item.type === 'reasoning') pendingReasonings.push(item)
  else if (item.type === 'agentMessage') { if (pendingReasonings.length) reasoningsByMessageId.set(String(item.id ?? ''), pendingReasonings); pendingReasonings = [] }
}
const emitAgentMessage = (msg) => { interleaved.push(...(reasoningsByMessageId.get(String(msg.id ?? '')) ?? []), msg) }
```

（其余 `reasoning`——历史旧线程没有 reasonings——走原逻辑；`reasoning` 项本身保持不变，不新增删除。）

## 验证

- **API 层**：`/codex-api/rpc` `thread/read` 最后轮 items 恢复为 `reasoning→agentMessage` 交错（含命令穿插），6 个 reasoning 全部紧贴各自消息、0 个在最终消息之后。
- **浏览器层（127.0.0.1:4173）**：DOM 快照中最后轮每条「Thinking process」开关都紧贴其对应 assistant 消息渲染，最终 assistant 回复（line 364）之后 0 个思考块（全在 295-321）。
- **单测**：`codexAppServerBridge.inlinePayload.test.ts` 28 项全过（新增 1 项「reasoning 保持紧贴其后 agent 消息」，验证交错含命令场景）。
- **构建**：`pnpm run build:cli`（tsup）通过；`dist-cli/index.js` CJS `require` 加载正常（输出 app 横幅）。
- **全量单测**：24 文件通过；`codexAppServerBridge.archive.test.ts` 2 项为 Windows 环境性失败（`EPERM symlink`、文件 mode 语义），与本次改动无关（既有基线）。

## 性能审计

服务端中间件的内存内重排：为每条 turn 做一遍 O(n) 扫描建 `reasoningsByMessageId` + 按 id O(1) 查表，无新增 I/O、无额外请求、无阻塞、无 unbounded fanout、无缓存失效风险（map 大小恒为轮内 agent 消息数）。未做运行时 profile（不触及网络/渲染/启动关键路径，单测覆盖行为）。

## 涉及文件与提交

- `src/server/codexAppServerBridge.ts`（`mergeSessionCommandsIntoTurns` 保持 reasoning 紧贴其消息）
- `src/server/codexAppServerBridge.inlinePayload.test.ts`（+1 单测）
- `tests/thread-loading-state/reasoning-stays-with-its-response-in-thread-read.md`（新建手动测试）
- `tests/thread-loading-state/index.md`、`tests.md`（索引/计数）
- commit `7fa6ec4`

## 备注

- 触发前提是「物化后的线程历史由本 bridge 做会话日志时序恢复」，即新版本 app-server（v0.146+ 带 `session-cmd-` 前缀）且 turn 内交错了 reasoning+多段回复。纯看历史旧线程（无 reasoning 持久化）不受影响。
- 线上「点在 WebUI 预览过再回 TUI」的 writer 锁问题与本次独立，见 [round-44-feedback.md](round-44-feedback.md)。
