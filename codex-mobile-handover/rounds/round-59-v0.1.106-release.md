# Round-59: v0.1.106 发布（2026-08-26）

> **发布内容：** 本版修复已完成轮次的最终总结归属，覆盖过程收尾记录遮蔽与完成通知、消息完成态异步到达两类场景。

## 本轮收录内容

### round-57（c442425）

- 当最终助手文本之后出现命令、文件变更或 `Worked for` 等过程收尾记录时，从轮次尾部定位最后一条稳定助手文本。
- 最终总结仍显示在最终区，过程收尾记录继续保留在过程区，原始消息顺序不变。

### round-58（0e0d0e6）

- `turn/completed` 清除 live overlay 后，服务端可能暂时仍将最终助手消息标为 `agentMessage.live`。
- 已完成轮明确传入完成态时，带文本的末条助手 `.live` 消息保持为最终总结；活跃轮仍不会将多 Agent 的中间消息误提升。

## 验证

- `pnpm exec vitest run src/utils/transcriptGrouping.test.ts src/utils/transcriptGrouping.repro.test.ts src/composables/useDesktopState.test.ts`：127/127 通过。
- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：前端与 CLI 构建通过；保留既有主 chunk 体积提示。

## 性能审计

本版只调整既有消息分组中的状态判断，不增加 API 请求、持久化、缓存、I/O 或组件层级。分组仍保持单趟线性扫描。

## 发布责任

- GitHub Release 已创建：[v0.1.106](https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.106)。
- npm publish 由用户执行；发布前已确认 `codex-mobile-re@0.1.106` 尚未占用。
- `.zcode/` 保持未跟踪，不纳入提交。
