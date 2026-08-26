# Round-58: 完成后最终总结回落到过程区（2026-08-26）

> **现象：** 一轮对话完成时最终总结先显示，随后很快又被归入“本轮过程”。

## 根因

`turn/completed` 会先清除 live overlay，但某些 app-server 事件顺序中，最后一条 `agentMessage` 仍暂时是 `agentMessage.live`。旧分组逻辑继续按 `.live` 判定整轮流式，因而撤销最终总结标记。

## 修复

`buildTurnRenderGroups()` 现在接收显式完成态：调用方已确认 live overlay 不存在时，将末尾带文本的助手 `.live` 消息视为完成态总结。活跃轮和未提供完成态的纯函数调用仍保持原有保守规则，避免把多代理中间消息误提升为总结。

## 验证

- `pnpm exec vitest run src/utils/transcriptGrouping.test.ts src/utils/transcriptGrouping.repro.test.ts`：38/38 通过。
- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：通过，保留既有大 chunk 警告。

## 性能审计

只复用已传入的完成状态并保留既有线性分组扫描；没有新增请求、缓存、持久化、I/O 或组件树。
