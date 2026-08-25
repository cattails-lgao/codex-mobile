# Round-54：Codex 0.149.1 协议快照与通知兼容回归（2026-08-25）

> **背景：** 本机 `@openai/codex` 已升级至 `0.149.1`。需以实际 app-server schema 对照现有桥接与状态层，确认升级是否需要运行时代码适配，并将协议基线和高风险通知回归固定下来。

## 结论

**不修改运行时代码。** 逐项对照本机 `codex app-server generate-json-schema` 结果与现有实现后，关键线程、流式 agent 消息、技能刷新及通知处理均已兼容。为避免无收益的事件链改动，本轮仅更新可追溯协议基线、测试和手动验证说明。

## 协议基线更新

- `documentation/app-server-schemas/json/` 已完整镜像本机 Codex CLI `0.149.1` 的 `generate-json-schema` 输出。
- 删除了上游不再生成的历史 schema，同时纳入当前新增的 thread、plugin、filesystem、marketplace、permission profile 等协议定义。
- `documentation/APP_SERVER_DOCUMENTATION.md` 明确标注 JSON 快照来源为 `0.149.1`；页面内旧方法表保留作历史参考，可能落后于生成 schema，应以 JSON snapshot 为准。

## 通知兼容回归

`src/composables/useDesktopState.test.ts` 现覆盖下列 `0.149.1` 场景：

1. `skills/changed`：技能缓存失效后只触发一次刷新。
2. `thread/status/changed`：事件进入去重后的线程刷新队列，所选线程的刷新不阻塞页面。
3. `item/autoApprovalReview/started` / `completed`：静默忽略，不创建错误、审批面板或重复消息。
4. `model/rerouted`：静默忽略，不创建重复消息或错误状态。

对应人工复验入口为 [Codex 0.149.1 notification compatibility](../../tests/thread-loading-state/codex-0.149.1-notification-compatibility.md)。

## 验证

- `pnpm exec vitest run src/composables/useDesktopState.test.ts`：89/89 通过。
- `pnpm run build:frontend`：`vue-tsc --noEmit` 与 Vite 生产构建通过。
- 直接检查已提交快照，确认含 `thread/start`、`thread/resume`、`thread/read`、`thread/archive`、`thread/unarchive`、`thread/status/changed`、`skills/changed`、`item/autoApprovalReview/*` 与 `model/rerouted`。
- 构建保留既有主包超过 500 kB 的提示，与本轮无关。

## 性能审计

本轮没有运行时代码变更。协议 JSON 仅在文档/版本控制中使用；新增内容仅为测试和手动验证文档，不增加网络请求、事件监听、轮询、同步 I/O、缓存体积或渲染工作。

## 后续注意事项

- 未来升级 Codex CLI 时，先重新执行 `codex app-server generate-json-schema --out <临时目录>`，再用生成结果核对桥接层，而不是仅依据 Release Notes 判断兼容性。
- 若后续接入 `permissionProfile/*`、`plugin/*`、`thread/goal/*` 或 `fs/*`，应作为独立功能开发，不要混入协议兼容维护。
- 本轮工作尚未提交；`.zcode/` 为未跟踪本地内容，不应纳入本轮提交。
