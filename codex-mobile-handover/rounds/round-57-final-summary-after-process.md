# Round-57: 过程收尾记录遮蔽最终总结（2026-08-26）

> **问题：** 已完成轮次中，助手最终总结后若到达文件变更、命令执行或 `Worked for` 耗时记录，Hot 区会将整轮助手内容保留在“本轮过程”，不显示独立最终总结。

## 根因

`buildTurnRenderGroups()` 过去只检查轮次中最后一个非文件变更条目。`worked` 与命令执行属于过程记录，但会成为该条目，导致此前稳定的 `agentMessage` 不被标记为 `final-assistant`。

## 修复

- 从轮次尾部查找最后一个稳定、非流式的助手消息，而不是依赖最后一个过程条目。
- 保持命令、文件变更和耗时记录原有顺序及过程区归属。
- 增加命令收尾以及文件变更加耗时收尾两种回归用例。

## 验证

- `pnpm exec vitest run src/utils/transcriptGrouping.test.ts src/utils/transcriptGrouping.repro.test.ts`：37/37 通过。
- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm run build`：前端和 CLI 构建通过；保留既有大 chunk 警告。

## 性能审计

仅在既有的每轮反向查找中，将“跳过文件变更”调整为“匹配稳定助手消息”；仍是一次线性扫描，不新增请求、状态、缓存、I/O 或渲染容器。未做浏览器实测，因为修复是纯分组逻辑，已由针对性单测覆盖。
