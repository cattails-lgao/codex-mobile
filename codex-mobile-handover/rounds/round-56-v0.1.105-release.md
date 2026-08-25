# Round-56: v0.1.105 发布（2026-08-25）

> **发布内容：** 本版收录 round-54（Codex 0.149.1 协议快照与通知兼容回归）、round-55（Vite 根路径被 SSE 中间件阻断修复）、round-56（版本发布与服务观察验证）。

## 本轮收录内容

### round-54（ee5df5a）
- 协议快照：完整镜像本机 Codex CLI `0.149.1` 的 `generate-json-schema` 输出。
- 通知兼容回归：`skills/changed`、`thread/status/changed`、`item/autoApprovalReview/*`、`model/rerouted` 四组新增测试，`useDesktopState.test.ts` 89/89 通过。
- 无运行时代码改动。

### round-55（00a500a）
- SSE 中间件精确路由：仅 `/codex-api/events` 建立事件流，根路径和所有非 API 请求立即交还 Vite。
- 消除静态资源与前端路由进入异步 bridge 路由族的额外等待。
- `eventsRoutes.test.ts` 2/2 通过，用户已刷新实测页面恢复。

### round-56（本轮）
- 更新交接文档（主文档快照、轮次索引、提交历史、未完成事项）。
- 版本号从 `0.1.104` 升至 `0.1.105`。
- 发布后经浏览器打开页面、新建线程、发送消息全流程观察验证，消息列表无重复、跨轮串入、顺序错乱或卡顿。

## 验证

- `pnpm exec vitest run`：全部相关单测通过。
- `pnpm run build:frontend`：`vue-tsc --noEmit` 与 Vite 生产构建通过。
- 浏览器实测：页面正常渲染、SSE 事件流不抢占根路径、消息列表正常。

## 性能审计

本轮仅包含版本号 bump、文档更新和 GitHub Release 创建。无运行时请求、事件监听、轮询、同步 I/O 或缓存变更。

## 后续注意事项

- npm publish 需用户执行。
- 工作区 `.zcode/` 保持未跟踪，不纳入提交。