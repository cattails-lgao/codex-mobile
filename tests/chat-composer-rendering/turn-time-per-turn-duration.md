# 回合耗时展示（每轮末尾显示时间）· 手工回归

## Feature / Change

为每个对话回合（turn）末尾显示该轮耗时（如 `25s`、`2m 30s`），数据来自该轮 `worked` 消息的 `durationMs` 聚合，复用 `formatTurnDuration` 格式化。纯前端展示，不触碰 live-turn / realtime / 回合塑形主时序逻辑。

另修复一个既有渲染崩溃：`ThreadConversation.vue` 中 `createCommandExecutionDisplay` 等 hook 在 `const props = defineProps` 之前被创建，setup 期同步 computed 求值 `props.messages` 时抛 `Cannot access 'props' before initialization`，导致含命令执行消息的历史会话白屏。修复为将 `defineProps` 提前到 import 之后。

## Files Changed

- `src/utils/turnDurations.ts`（新增）：`sumTurnDurations(messages)` 按 `turnId` 聚合 `worked` 消息 `durationMs`
- `src/utils/turnDurations.test.ts`（新增）：3 例单测
- `src/components/content/ThreadConversation.vue`：`turnDurations` computed + `turnDurationMs(turn)`；`defineProps` 上移
- `src/components/content/ThreadTurn.vue`：新增 `durationMs` prop 与每轮末尾 `.conversation-turn-time` 渲染（含暗色主题）

## Prerequisites / Setup

- 前端 dev server 运行在 `127.0.0.1:4173`
- 需要一个能发起真实 `worked`（工具/命令执行）回合的可用会话（agent 已鉴权可用）

## Exact Actions

1. 进入任一历史会话。
   - 若该轮为纯文本（无工具执行），回合末尾应**不显示**耗时行。
2. 发送一条会触发命令执行的消息，例如 "List the files in the current directory with a shell command and show the output."
3. 等待 agent 完成回合。

## Expected Results

1. 会话正常渲染，无 console/page error（修复后含命令执行消息的历史会话不再白屏）。
2. 新回合完成后，回合末尾（final 响应之后）出现一行小字耗时，如 `25s`、`2m 30s`，浅灰色、`[11px]`。
3. 纯文本回合（无 `worked` 消息）末尾不显示耗时行。
4. 暗色主题下该行转 `text-zinc-500`，可读。

## Verification（本机已跑）

- `pnpm exec vue-tsc --noEmit` 通过
- `pnpm exec vitest run src/utils/turnDurations.test.ts`：3/3 通过
- `pnpm run build` 通过（main chunk 563.15 kB）
- Playwright（`scripts/verify-turn-e2e.cjs`，系统浏览器优先、缺则回退 chromium）：发送命令请求后渲染出耗时行 `TURN_TIME_SAMPLES: ["25s"]`，`ERRORS: []`
- 截图：`output/playwright/turn-time-e2e.png`

## Rollback / Cleanup

- 功能改动可整体回退：移除 ThreadTurn 的 `durationMs` prop 与时间行、ThreadConversation 的 `turnDurations`/`turnDurationMs`、`sumTurnDurations` 及其测试。
- 崩溃修复是 `defineProps` 位置调整，仅当 hook 抽离时序再次变化时才需复核；props 值与模板语义均未改变，可安全保留。
- Playwright 验证会向被测线程追加一条真实消息；该线程为本地测试数据，可接受；如需干净，可在 `test` 项目内另建线程验证。