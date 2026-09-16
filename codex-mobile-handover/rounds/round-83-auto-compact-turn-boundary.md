# Round-83：客户端自动压缩在长 turn 下不触发（turn 边界预检）

> **背景（2026-09-15）**：用户报告「自动压缩还有问题，正在 Thinking 的时候 size 超出了」。经确认口径为：**长时间 turn（Thinking + 工具调用）进行中，上下文占用一路涨过阈值甚至超过窗口，而客户端从头到尾没有任何压缩动作**。
> **结论**：客户端自动压缩的唯一触发入口是「用户点击发送 + 线程空闲」（`maybeStashForAutoCompact`），且该预检在 turn 进行中**按设计跳过**（上下文已定型，见 round-28 问题 3）。所以长 turn 把上下文推过阈值后客户端不做任何事——压缩只能等用户下一次发送时才补。本轮为「turn 结束（线程转空闲）」这一时刻补上同一阈值的预检。

## 1. 测量（先测后改）

用本机真实会话数据（`CODEX_HOME/sessions/**/rollout-*.jsonl`，最重一份 2.89MB / 1271 记录 / 29 turn）量化了四个事实：

| 事实 | 数据 |
|---|---|
| 服务端会自动压缩，且发生在 **turn 内** | 压缩记录（`type: "compacted"` + `context_compacted`）分别落在第 384 行 = turn 3（358–527）**内部**、第 763 行 = turn 14（736–858）**内部**，都不是 turn 边界 |
| 服务端触发点 ≈ 90% 已用 | 上述两次压缩所在 turn 的上下文峰值 116,890 / 113,473 tokens，窗口 121,600 → **96.1% / 93.3%** |
| 单个长 turn 吃掉的量 | turn 2→3 峰值 +11.7k（9.6% 窗口）、turn 13→14 +4.7k（3.8%）→ 量级约 **4–10% 窗口** |
| 服务端阈值未自定义 | 本机 `~/.codex/config.toml` 无 `model_auto_compact_token_limit`，走内置默认 |

**由此暴露出一个阈值重合问题**：客户端默认阈值 10%（剩余）恰等于服务端 ~90%（已用），两者**同点**；而客户端只在「发送 + 空闲」时判定、服务端在 turn 内判定，**客户端永远不可能抢在服务端前面**。这正是 `sections/auto-compact-plan.md` 想避免的「模型失忆」场景的实际形态（方案初稿写的是 15%，落地时确认成 10%）。

**口径修正（重要）**：服务端在 turn 内已会自动压缩，所以「size 真的越过窗口」只在服务端未覆盖的场景成立（app-server 版本差异 / 用户配置了更晚的阈值 / 该轮尚未跨过服务端阈值）。客户端能做到的最大动作是**在 turn 结束的第一时间按同一阈值压缩**，而不是等用户下一次发送。

同时确认：服务端压缩走的是**已废弃**的 `thread/compacted` 通知（新版 app-server 不发它），因此 turn 内发生的服务端压缩在 UI 上不会即时可见——这也是「自动压缩看起来还有问题」的一个来源。

## 2. 根因

`src/composables/useDesktopState.ts`：

- `maybeStashForAutoCompact`（发送前预检）在 `inProgressById[threadId] === true` 时直接返回 `false`（turn 进行中不预检）；
- `setThreadInProgress(threadId, false)`（turn 结束）此前只调用 `flushStashedForThread`——**没有任何压缩动作**。

即阈值只被「用户发送」这一个入口消费：用户不再发送（或长时间 Thinking 期间），压缩就永远不发生。

## 3. 修复

`src/composables/useDesktopState.ts` 两处（最小 diff）：

- 新增 `shouldAutoCompactOnTurnEnd(threadId)`：与发送前预检**共用同一阈值与防重入条件**（阈值 > 0、不在压缩中、用量已知且 `remainingContextPercent <= 阈值`）。
- `setThreadInProgress(false)` 分支改为：命中则该 turn 结束即 `compactThreadById(threadId)`，否则维持原 `flushStashedForThread(threadId)`。压缩收口（成功/失败/超时）内部本来就会补发暂存消息，因此两条分支都不会漏补发。

**为什么只在 turn 边界判定，而不挂在 `thread/tokenUsage/updated` 上**：用量更新在 Thinking 期间高频到达；若在用量事件上判定，一旦「压缩后用量仍 ≤ 阈值」（窗口很小的模型、或压缩未生效），就会形成「压缩 → 用量事件 → 再压缩」的循环。挂在 turn 结束这一**状态迁移**上，天然每轮最多一次，不存在该循环。

**为什么不在 turn 内触发**：客户端无法把压缩插进正在运行的 turn（round-28 已确认该语义），而服务端本来就在 turn 内约 90% 处自己压缩（见 §1 测量）。

## 4. 验证

- 新增单测 2 例（`src/composables/useDesktopState.test.ts`，`client-side auto-compact` 组）：①turn 进行中不压缩，turn 结束且用量在阈值内 → 立即压缩；②turn 结束但用量高于阈值 → 不压缩。
- **判别力验证**：`git stash push -- src/composables/useDesktopState.ts` 移出源改动后跑新增用例 → **失败**（`AssertionError: expected "vi.fn()" to be called with arguments: [ 'thread-auto-compact' ]`），恢复后通过——用例确实盯着本轮逻辑，而不是恒真。
- 全量 Vitest **591 通过 / 2 失败**（共 593 例；2 例为 `codexAppServerBridge.archive.test.ts` 的既有 Windows 环境性失败，与本次改动无关）。
- `vue-tsc --noEmit` 干净（`rc=0`，无输出）、`vite build` 通过。
- 性能审计：新增逻辑只在 `setThreadInProgress` 的「转空闲」分支做一次 O(1) 对象取值 + 数值比较；`thread/tokenUsage/updated` 这条高频路径**未改动**；命中时复用既有 `compactThreadById`（其轮询上限 14×2s 为既有行为），不新增任何请求、缓存或存储 I/O。

## 5. 决策记录（用户确认，2026-09-15）

- **默认阈值保持 10%**：本轮不改默认值。客户端与服务端在 ~90% 处同点的问题已记录在 §1；若后续希望客户端稳定先于服务端接管，可在设置项（Off/5/10/15/20/25）里上调，或把默认值改到 20% 左右（按实测「单 turn 吃 4–10% 窗口」，20% 可留出约两个长 turn 的余量）。
- **版本暂不 bump**：工作区停在 `0.1.124`（该版本尚未 publish，用户 2026-09-15 决定暂缓），本轮改动随下一次发布一起走 —— **已随 v0.1.125 发布**（2026-09-16）。

## 6. 手测

见 `tests/chat-composer-rendering/client-side-auto-compact-pre-send-stash-resend.md` 的「turn 边界自动压缩」步骤（第 13–15 步）。
