# Round-51：最新一轮缺失 assistant 块 + Zen Proxy 多 agent namespace 工具丢失（2026-08-21）

> **背景：** 本轮两个问题都来自实际真机/验收反馈。其一：最新一轮对话只见过程块、没有 `data-role="assistant"` 最终回答块；其二：经 Zen Proxy（`responsesPayloadFormat: 'chat'`）转发时，多 agent 的 `type: "namespace"` 工具被整体丢弃，worker/子 agent 无法拿到 `spawn_agent` 等工具。

## Round 51-A：完成的 agentMessage 未被识别为最终 assistant 块

### 根因
[useDesktopState.ts](src/composables/useDesktopState.ts) 的 `readAgentMessageCompleted` 对已完成条目**无条件**把 `messageType` 置为 `agentMessage.live`，而 `transcriptGrouping.ts` 的 `isFinalAssistantItem` 会拒绝 stream 态项，导致最终回答不被渲染成 assistant 块。

### 修复
`baa5f6f fix: finalize completed agentMessage as non-live so final reply renders as assistant block`

- `readAgentMessageCompleted` 对已完成条目改置 `messageType: 'agentMessage'`（非 live），与 plan 处理约定一致，从而被 `isFinalAssistantItem` 正确接受。

### 验证
- `useDesktopState.test.ts`：新增 round-40 回归用例，114 个测试通过。
- `vue-tsc --noEmit`：通过。
- 手动测试文档：`tests/thread-loading-state/round40-completed-agent-message-final-assistant.md`。

## Round 51-B：Zen Proxy 丢弃多 agent namespace 工具

### 根因
`zenProxy.ts` 的 `handleZenProxyRequest` 走 `handleUnifiedResponsesProxyRequest` 并设 `responsesPayloadFormat: 'chat'`，触发 `unifiedResponsesProxy.ts` 的工具转换：

- `responsesToolsToChatTools` 只保留 `row.type === 'function'`，把 `type: 'namespace'`（如 `multi_agent_v1`）的工具整体丢弃 → worker 收不到 `spawn_agent`/`wait_agent`/`send_input`/`close_agent`。
- `chatCompletionToResponsesFormat` 回包时也未恢复 `namespace` 字段 → 子 agent 结果可能误路由。

### 修复
`5c8e57f fix(zen-proxy): expand namespace tools and restore namespace in responses output`

- `responsesToolsToChatTools` 将 namespace 的每个子工具展开为独立 Chat `function` 工具，限定名为 `<namespace>.<subName>`（如 `multi_agent_v1.spawn_agent`）。
- 返回请求级 `限定名 -> namespace` 映射（无全局固定工具名表，兼容未来 namespace）。
- `chatCompletionToResponsesFormat(chatResponse, model, namespaceMap?)` 依据映射恢复 `namespace` 字段，`name` 去掉前缀还原为子工具名。
- 映射在 `handleUnifiedResponsesProxyRequest` 内按请求捕获并传入回包转换。

### 验证
- `unifiedResponsesProxy.test.ts`：新增 2 个用例（namespace 还原 + 经 proxy 完整展开/回包的往返），11 个测试通过。
- `vue-tsc --noEmit`：通过。
- 真机无副作用探针：向真路由 `/codex-api/zen-proxy/v1/responses` 携带 `multi_agent_v1` 工具，经真实 `https://opencode.ai/zen/v1/chat/completions` 返回 `{"type":"function_call","name":"spawn_agent","arguments":"...","namespace":"multi_agent_v1"}`——证明模型确实调用展开后的 namespace 工具，且回包恢复 namespace 字段。
- 手动测试文档：`tests/cli-network-platform/zen-proxy-multi-agent-namespace-tools.md`。

> **诚实边界**：核心转换/恢复已由单测 + 真机往返证明；CP8 全流程（spawn→孙 agent→wait/send/close→回收 + 重跑 `1Ypm9K0m` 出正式多 agent 报告）未端到端实跑，需真实多 agent 会话验收。

## 涉及文件

- `src/composables/useDesktopState.ts` / `useDesktopState.test.ts`
- `src/utils/transcriptGrouping.ts`（引用的判定逻辑）
- `src/server/unifiedResponsesProxy.ts` / `.test.ts`
- `src/server/zenProxy.ts`
- `tests/thread-loading-state/round40-completed-agent-message-final-assistant.md`
- `tests/cli-network-platform/zen-proxy-multi-agent-namespace-tools.md`

## 发布

- 随 `codexapp@0.1.102` 发布（npm publish 由用户执行）；tag / GitHub release `v0.1.102`。