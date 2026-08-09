# 客户端自动压缩（发送前预检 + 暂存补发）方案与评估

> 状态：**方案已定稿，待实施**（2026-08-09 与用户评估确认：采用「暂存补发」交互）。
> 背景来源：round-27 问题 9 调研（自动压缩为 Codex app-server 服务端行为）后的延伸讨论。

## 1. 背景与动机

Codex app-server 的自动压缩是服务端行为：上下文 token 超过 `model_auto_compact_token_limit`（默认约 90% 上下文窗口）时，在下一个 turn 开始前自动压缩历史并生成摘要重放进模型上下文。它对 Web UI 几乎无感——没有进行中提示，完成后只留下一行「Context compacted」，摘要内容协议层面不可见（`thread/compacted` 通知仅有 `threadId`/`turnId`，`contextCompaction` item 仅有 `id`）。

这带来实际风险：消息列表展示完整历史、模型实际只看摘要，用户引用旧细节时模型「失忆」；压缩时机不透明、多轮压缩信息逐层衰减。由于**发送消息的动作在客户端**（`onSubmitThreadMessage` → `sendMessageToSelectedThread` 是调 codex RPC 的唯一入口），我们可以在发送前自行检查并主动压缩，把「无感」变成「可见可控」。

## 2. 关键事实与约束（已核实）

| 项 | 状态 |
|---|---|
| 发送入口在客户端 | `App.vue` `onSubmitThreadMessage` → `sendMessageToSelectedThread`，可控 |
| 上下文用量数据 | `UiThreadTokenUsage` 含 `modelContextWindow` / `currentContextTokens` / `remainingContextPercent`，`selectedThreadTokenUsage` 已暴露 |
| 压缩接口 | `compactThreadById(threadId)`（手动 `/compact` 同一入口，已有 pending 提示 + ContextCompaction item 轮询收尾 + `compactingThreadIds` 防重入） |
| 压缩摘要内容 | 协议不下发（`ContextCompactedNotification` 仅 threadId/turnId；`ContextCompactionItem = { id }`），UI 无法展示服务端摘要 |
| 手动压缩 + 刷新 | 压缩为服务端操作不丢；pending 行与 `compactingThreadIds` 为内存态会丢；完成后经 thread/read 持久化 item + `thread/compacted` 通知双通道恢复 done 行 |
| 现有 Queue 队列 | `processQueuedMessages` 仅拉取服务端队列镜像，补发由服务端「turn 完成后」驱动——与「压缩完成后补发」语义不匹配，**不能直接复用** |

## 3. 方案设计：发送前预检 + 暂存补发

### 3.1 触发

- 发送入口（`sendMessageToSelectedThread`）先读 `selectedThreadTokenUsage`。
- 触发条件：`remainingContextPercent <= AUTO_COMPACT_THRESHOLD`（默认 **15**，即用量 ≥85%，略先于服务端 ~90% 阈值，使大多数场景由客户端压缩、服务端不再兜底压缩）。
- 阈值做成 composer 设置项（存 localStorage，可关闭 = 0 禁用，退回服务端自动压缩）。

### 3.2 流程

```text
用户点发送 → 预检用量
  ├─ 充足 → 正常发送（服务端兜底）
  └─ ≤阈值 → ① 消息暂存（持久化 + awaitingCompaction 标记）→ ② 显示「正在压缩上下文…」pending 行
            → ③ compactThreadById 完成 → ④ 补发暂存消息 → ⑤ 清暂存
```

### 3.3 暂存与 UI

- 暂存消息：存 localStorage（线程 id + 完整 payload + `awaitingCompaction` 标记），**复用 QueuedMessages 面板**展示（自带编辑/删除/持久化交互），补发触发由 UI 控制（区别于服务端队列）。
- 压缩中再发送：`compactingThreadIds` 防重入，后续消息按序入暂存/队列，压缩完成后按序补发。
- 压缩期间其他操作（切线程、滚动、翻历史、复制、设置）：全部可用（UI 无全局锁，`compactingThreadIds` 不参与任何交互禁用）。

### 3.4 刷新恢复

- 暂存持久化在 localStorage：刷新后从暂存恢复消息 → 线程空闲时重新走「检查用量 → 压缩 → 补发」。
- 「是否已压缩」判断：重查 `currentContextTokens` 骤降，或 `thread/read` 已有 `contextCompaction` item——不需要额外状态机。
- 若压缩 RPC 已发出：服务端继续执行，刷新只丢 pending 内存态，完成经持久化/通知双通道恢复 done 行。

### 3.5 边界与回退

- 压缩 RPC 失败：捕获异常后**直接发送**（不退暂存），退化为服务端兜底压缩。
- 新线程（home 路由首条消息）：无上下文，跳过预检。
- queue 模式消息：不立即发送，发送时（补发路径）再走预检。
- turn 进行中（steer/queue）：跳过预检（上下文已定型）。

## 4. 改动点清单

| 位置 | 改动 |
|---|---|
| `App.vue` `sendMessageToSelectedThread` | 发送前预检 + 触发暂存/压缩/补发编排 |
| `useDesktopState.ts` | 新增暂存状态（持久化 localStorage）、`awaitingCompaction` 标记、刷新恢复逻辑、压缩完成补发函数 |
| `ThreadComposer.vue` | 设置项「发送前自动压缩阈值」（默认 15，0=关闭）；压缩中发送按钮状态提示 |
| `QueuedMessages` 面板 | 复用展示暂存消息（编辑/删除已具备） |

## 5. 评估

### 5.1 收益

- 压缩从「服务端无感」变「客户端可见可控」：发生在用户主动发送时，有明确 pending 提示，时机可预测。
- 阈值可配置、可关闭；默认 15% 使客户端压缩先于服务端，规避「模型失忆」陷阱在多数场景的出现。
- 暂存补发：用户无需等待压缩完成，消息不丢、刷新不丢。

### 5.2 风险与代价

- 提前压缩可能略早于必要时机（阈值 15% 时上下文未必真超限）——可接受，压缩本身无损（摘要由服务端生成）。
- 暂存持久化增加一个 localStorage 状态，需与既有 `queuedMessagesByThreadId` 语义区分清楚（避免双队列混淆）。
- 摘要内容仍不可见（协议限制），方案只能改善「时机感知」，不能改善「内容可见」。

### 5.3 与现状对比

| 维度 | 服务端自动压缩（现状） | 客户端预检压缩（方案） |
|---|---|---|
| 触发 | turn 开始前，悄悄 | 用户发送时，有 pending 提示 |
| 感知 | 无感，仅完成后一行小字 | 可见可控 |
| 阈值 | 服务端默认 ~90%，不可见 | 设置项，默认 15%，可关闭 |
| 刷新健壮性 | 完成状态双通道恢复 | 暂存持久化 + 压缩状态重查恢复 |
| 摘要可见性 | 不可见（协议限制） | 同样不可见（同协议限制） |

### 5.4 结论

方案可行、收益明确、改动集中在三处，**建议实施**。实施顺序：先做触发预检 + 压缩流程（最小可用），再做暂存持久化与刷新恢复，最后加设置项。

## 6. 待决问题（实施前确认）

1. 默认阈值 15% 是否合适（或改为 10%）？
2. 暂存消息是否与现有 Queue 模式合并为一个面板呈现（推荐）？
3. 是否允许关闭（阈值 0 = 完全退回服务端行为）？
