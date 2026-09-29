# Round 105 — Steer mode sends via explicit `turn/steer` protocol

Date: 2026-09-29. Related: `codex-mobile-handover/rounds/round-105-steer-protocol-and-p2-inventory.md`.

## What changed

- 执行中发送模式为 Steer 时，消息改走显式 `turn/steer` RPC（带 `expectedTurnId` 前置条件），不再用 mid-turn `turn/start` 碰运气。
- 活跃 turn 不可转向（`/review`、`/compact` 进行中）时，消息自动降级为排队（原行为是给用户看一条 `cannot steer a compact turn` 裸错误）。
- `expectedTurnId` 不匹配（轮次恰好完成/客户端状态陈旧）时回落 `turn/start`：线程空闲则开新轮，仍活跃则服务端视作 steering。

## Manual test steps

1. 启动 dev：`pnpm run dev --host 127.0.0.1 --port 4173`，浏览器打开 `http://127.0.0.1:4173`。
2. 把「执行中发送」模式切到 Steer（composer 「+」popover 或设置里的 Steer/Queue 开关；存储键 `codex-web-local.in-progress-send-mode.v1`）。
3. 选一个已有线程，发送一条会产生长输出的消息（如「写一首 100 行的诗」），等流式输出开始。
4. turn 进行中再发一条转向消息（如「转向：主题改成蜜蜂」），点击发送。
5. 打开 DevTools → Network → `/codex-api/rpc`，确认：
   - 出现 **一次** `turn/steer`，params 含 `threadId`、`input`、`expectedTurnId`（= 活跃轮 id）；
   - 没有为消息 B 发出第二个 `turn/start`；
   - 返回 200 `{ "result": { "turnId": "<活跃轮 id>" } }`。
6. 确认消息 B 以乐观用户消息出现在对话流中，且流式输出继续在**同一轮**内进行（不出现新的轮次分隔）。
7. 点停止按钮中断。

## Steer 被拒的降级（协议层验证，UI 难以人工制造）

- `turn/steer` 打进 compact turn → 502 `cannot steer a compact turn` → 前端自动把消息放入排队列表（QueuedMessages 行出现），无错误横幅。
- `turn/steer` 带错误 `expectedTurnId` → 502 `expected active turn id ...` → 前端回落 `turn/start` 正常发送。

## Automated coverage

- `src/api/codexGateway.test.ts` — `steerThreadTurn` 请求形状 / turnId 回退 / 错误透传（3 例）。
- `src/composables/useDesktopState.test.ts` — steer 走显式协议、不可转向降级排队、前置条件不匹配回落 turn/start（3 例）。
- Playwright 端到端：`tmp/verify-steer.cjs <threadId>`（真实模型，Network 断言 turn/steer 恰一次且带 expectedTurnId）。
