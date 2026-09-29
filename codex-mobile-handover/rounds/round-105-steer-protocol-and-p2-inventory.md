# round-105 — P2 收口盘点 + steer 改走显式 `turn/steer` 协议

日期：2026-09-29。前提：round-103/104 已把 P1 两项收口。本轮处理 round-101 机会清单的 **P2：queue / steer / compact-start / fs / fuzzyFileSearch 的 UI 化**。

## 一、P2 盘点结论：四项里三项早已落地，唯一缺口是 steer

| P2 项 | 现状 | 证据 |
| --- | --- | --- |
| queue（排队追问） | ✅ **早已实现**（客户端侧） | `bridge/threadQueueState.ts` 持久队列（`.codex-global-state.json`），编辑/删除/拖动重排 UI（`QueuedMessages.vue`），`canStartQueuedTurn` 空闲自动出队；设置里有 Steer/Queue 模式开关（round-7 起） |
| compact-start（手动压缩） | ✅ round-83 已做 | `/compact` 斜杠命令 + 自动压缩预检 + `compactThreadById`（`thread/compact/start` 网关 + 测试齐全） |
| fuzzyFileSearch | ✅ 已迁官方协议 | `gateway/search.ts`（sessionStart/Update/Stop）+ `fuzzyFileSearch/sessionUpdated|Completed` 通知接线 |
| fs/* 10 个文件方法 | 刻意不用 | `useDesktopState.ts:260` 注释：本 UI 无目录浏览面，无消费点 |
| **steer（`turn/steer`）** | ❌ **本轮补上** | 此前 "steer" 模式 = mid-turn 直接 `turn/start`，靠服务端兼容行为工作 |

## 二、协议探针（live 0.158.0，经 dev 服务器 RPC 代理实测）

`tmp/probe-turn-steer.cjs`（真实模型小轮次）：

- **FACT1**：`turn/steer {threadId, input, expectedTurnId}` 打进活跃轮 → **200** `{"result":{"turnId":"<同一活跃轮>"}}`——same-turn steering 成立。
- **FACT2**：`expectedTurnId` 错误 → **502** ``expected active turn id `nonexistent` but found `<真实>` ``——干净的前置条件失败（轮次完成的竞态不会被静默吞掉）。
- **FACT3**：mid-turn `turn/start`（旧行为）→ **200 返回同一轮**——0.158.0 服务端确实把它当作 steering（schema 注释「Ignored when this request steers an already-active turn」印证）。旧行为碰巧能用，但没有竞态保护。

`tmp/probe-steer-not-steerable.cjs`（compact turn 上实测不可转向错误的形状）：

- `turn/steer` 打进 compact turn → 502 `cannot steer a compact turn`。
- mid-turn `turn/start` 打进 compact turn → 502 `failed to submit turn input: ActiveTurnNotSteerable { turn_kind: Compact }`——**旧行为在不可转向轮上给用户甩裸错误**，这是本轮要修的 UX 缺口。

## 三、实现（最小 diff，复用现有链路）

**网关 `src/api/gateway/threads.ts`**：

- 从 `startThreadTurn` 抽出 `buildTurnInputParts`（input 构建 + 附件去重），两个方法共用（ladder：复用而非复制）。
- 新增 `steerThreadTurn(threadId, expectedTurnId, text, imageUrls?, skills?, fileAttachments?)`：`turn/steer {threadId, input, expectedTurnId}` → 返回 `turnId`（响应缺省时回退 expectedTurnId）。steering 继承活跃轮的 model/effort，故无这些参数。

**状态 `src/composables/useDesktopState.ts`**：

- steer 分支改为 `steerActiveTurnForThread`：
  1. 取 `activeTurnIdByThreadId` 作 `expectedTurnId`，有则走显式 `turn/steer`；成功后乐观消息 + sync（与 turn/start 路径同构）。
  2. `ActiveTurnNotSteerable|cannot steer a ... turn|same-turn steering` 错误 → **自动降级排队**（与 queue 分支同构，不追加乐观消息），不再甩裸错误。
  3. `expected active turn id`（前置条件不匹配）→ 回落 `turn/start`：线程已空闲则开新轮，仍活跃则服务端视作 steering（FACT3 兜底）。
  4. 无活跃轮记录 → 直接原 `turn/start` 路径。

## 四、验证

- `vue-tsc` 干净；`pnpm run build` 通过。
- 定向：`codexGateway.test.ts` +3（请求形状/turnId 回退/错误透传）、`useDesktopState.test.ts` +3（显式协议/降级排队/竞态回落）。
- 全量 Vitest **668/670**（仅既有 2 例 archive Windows 平台差异，与 round-100~104 基线同构）。
- **端到端（Playwright + 真实模型，`tmp/verify-steer.cjs`）**：预置偏好 `codex-web-local.in-progress-send-mode.v1=steer` → 发长输出消息 A（`turn/start`）→ 流式中发消息 B → Network 断言：`turn/steer` **恰一次**、带 `expectedTurnId`、无第二个 `turn/start`；消息 B 以乐观消息渲染进对话流、同一轮继续输出；停止按钮可中断。截图 `output/playwright/round-105-steer-e2e.png`。
- 排查插曲：第一次 e2e 失败揭示了两个易踩点——①执行中发送模式**默认是 queue**（`loadInProgressSendModePref` 兜底 'queue'，存储键 `codex-web-local.in-progress-send-mode.v1`）；②`loadMessages` 会用 `detail.inProgress/detail.activeTurnId` **覆盖**内存状态，测试 mock 必须与服务器真相一致，否则发送完成后的 sync 把进行中状态清掉。

## 五、性能审计

代码路径分析（未做 profiler）：steer 成功路径 = 1 次 RPC（替换原 turn/start，净请求量不变）+ 既有 sync 流程；降级路径仅在错误发生后多一次排队写盘（`setThreadQueueState`，原 queue 模式同款）；无新增定时器/轮询/大载荷。

## 六、遗留

- round-101 清单 P2 至此全部收口（3 项已存在 + steer 本轮补上；fs/* 维持刻意不用）。
- 剩余机会清单（P2 之外）：`account/usage/read` 用量面板、`thread/realtime/*` 语音、exec/PTY 官方通道、`thread/backgroundTerminals/*`、`windowsSandbox/*`——见 round-101 第二节，均未排期。
- 本轮 e2e 在用户真实线程（`01a0808e-…`）里留了 3 条测试轮次（含中断），可忽略或手动归档该线程。
