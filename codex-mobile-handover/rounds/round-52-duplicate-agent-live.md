# Round-52：多 agent 对话进行中重复 agentMessage 块 + message-toolbar 闪现（已修复）

> **背景：** 真机多 agent（主子孙）对话过程中，消息流出现两个现象：① 同一轮过程中出现重复的 `data-message-type="agentMessage"` 块；② 进行中这些块上出现 `class="message-toolbar"`。当会话结束或刷新后，重复块与 toolbar 消失。本轮先按两份最新 rollout 完成根因定位，随后实施 live 文本级去重并补单测（见「修复实施」）。

## 现象与时机

- 仅在**进行中**（live）出现：重复的 agentMessage 块 + 每块上的 message-toolbar。
- **会话结束（turn/completed 清 live）或刷新后即消失**。

「结束/刷新即消失」是定位的关键——它说明持久化/刷新路径有去重兜底，缺口只在 live 合并。

## 根因（依据 rollout 的逐字证据）

对比最新多 agent 会话的两份 rollout：

- 父线程 `~/.codex/sessions/2026/08/21/rollout-2026-08-21T17-00-27-01a0238c-….jsonl`
- 子代理 Laplace 线程 `~/.codex/sessions/2026/08/21/rollout-2026-08-21T17-01-02-01a0238d-….jsonl`

两文件第 21 行的 `agent_message` 是**逐字完全相同**的全文（规范化后长度 58）：

> `好的！我来演示一下主-子-孙三代代理，看看每层能用什么工具…`

同一段助手文本在父线程与子代理线程各出现一次，但各自持有**不同的 item 消息 id**（`msg_…c…` vs `msg_…d…`）。

据此推断的机制：

1. **重复块**：同一段文本以两个不同 id 进入渲染流。live 合并只按 id 去重——[useDesktopState.ts](src/composables/useDesktopState.ts) 的 `mergeLiveMessages`（仅 `unique` 按 `message.id`），对「同文本不同 id」的两条无法合并 → 一条副本被渲染。
2. **toolbar 闪现**：round-51/round-40 把 `readAgentMessageCompleted` 的已完成条目从 `agentMessage.live` 改成**非 live** 的 `agentMessage`（见 [useDesktopState.ts](src/composables/useDesktopState.ts) `readAgentMessageCompleted`），使进行中每条完成的助手块按普通消息分支渲染（[ThreadConversation.vue](src/components/content/ThreadConversation.vue) 的 `MessageToolbar`）→ 进行中挂出 toolbar。
3. **结束/刷新消失**：`removeRedundantLiveAgentMessages`（[useDesktopState.ts](src/composables/useDesktopState.ts)）正是按**规范化文本**把 live 中与持久化相同文本的副本剪掉；而进行中无此文本级去重，故只在 live 暴露。

一句话：**live agent 消息缺「规范化文本去重」，持久化路径有它在做兜底。**

## 涉及代码（仅定位，未改动）

- `src/composables/useDesktopState.ts`
  - `mergeLiveMessages`（live 组间只按 id 去重）
  - `removeRedundantLiveAgentMessages`（轮末/刷新按文本去重 —— 现成的去重基准，含 `normalizeMessageText`）
  - `readAgentMessageCompleted`（round-51 改为非 live；是 toolbar 闪现的触发点）
- `src/components/content/ThreadConversation.vue`（`MessageToolbar` 渲染于普通消息分支）

## 建议修复方向（最小改动）

给 `mergeLiveMessages`（或 live agent 组内）复用 `removeRedundantLiveAgentMessages` 同款 `normalizeMessageText`，对同一线程/turn 内规范化后相等且非空的助手文本只保留一条——与现有轮末/刷新去重语义一致，不影响真正连续的多段助手回复（文本不同）。

## 修复实施（round-52）

- **改动**：`upsertLiveAgentMessage`（live 实时写入源头，[useDesktopState.ts](src/composables/useDesktopState.ts)）在 upsert 后增加 live 文本级去重——新消息为 assistant 且规范化文本非空时，移除 live 组内规范化文本相同的其它 id 消息，只保留最新一条。delta 通道（`params.itemId`）与 completed 通道（`item.id`）同文本不同 id 的副本即被消除；同 id 仍由 `upsertMessage` 替换。与轮末/刷新 `removeRedundantLiveAgentMessages` 同用 `normalizeMessageText`，去重语义一致。
- **为什么放在 `upsertLiveAgentMessage` 而非 `mergeLiveMessages`**：`mergeLiveMessages` 是通用纯函数（接收 livePlan/liveCommands/liveFileChanges/liveAgent 四组），在组内做文本去重需按消息特征筛选 assistant，范围更大、易误伤 plan/command；源头去重 diff 最小且精准。轮末 `removeRedundantLiveAgentMessages` 仍是持久化路径兜底。
- **补充（跨源最终汇合去重）**：源上去重只堵 live map 内部，无法消除「同一文本以不同 id 同时存在于 persisted（服务端 `item.id`）与 live（delta `params.itemId`）」的跨源重复——`mergeLiveMessages` 只按 id 去重，`combined = [...persisted, ...liveMessages]` 会双份渲染（进行中 process 区重复块）。为此在 `mergeThreadMessageStreams`（最终 `messages` computed 汇合点）新增 `dedupeAssistantAgentMessageText`：以 user 消息为界按 turn 分组（与 `buildTurnRenderGroups` 语义一致，不误删跨 turn 的相同助手文本），对 assistant agentMessage（含 `.live`）按 `normalizeMessageText` 只保留最新一条，覆盖所有来源与轮中 refresh 场景。
- **单测**：`useDesktopState.test.ts` 新增 round-52 用例——delta 与 completed 同文本不同 id → live 中只保留 completed 一条（非 live `agentMessage`，id 为新 id）；以及跨源（persisted × live）同文本不同 id 最终汇合去重用例。`pnpm exec vitest run src/composables/useDesktopState.test.ts` 83/83 通过。
- **类型/编译**：`pnpm exec vue-tsc --noEmit` 通过；4173 Vite 热更新编译 useDesktopState.ts 无错误。
- **真机核对（live 层直证）**：切换可用模型（mimo-v2.5-free）后完成多 agent 真机验证。在 `upsertLiveAgentMessage`（live 写入源头）临时埋 console 诊断日志（`[round52-live] write id=… sameTextCount=N deduped=bool text=…`）：
  - 自然多代对话：4 条 agentMessage 写入全部 `sameTextCount=1`、`deduped=false`，live 中无重复（该轮无同文本双 id 输入）。
  - **决定性仿真**：通过 RPC 通道推送 round-52 单测同款「同文本不同 id 双写」——delta 用 `params.itemId`（`VERIFY_DELTA_ID`）、completed 用 `item.id`（`VERIFY_COMPLETED_ID`），正文逐字一致。第 1 次写入 `sameTextCount=2`（delta 先到、去重前瞬时 2 条）；第 2 次（completed）写入 `sameTextCount=1`、`deduped=true` → **去重把同文本旧副本移除，live 收敛回 1 条**。
  - 结论：live 写入源头（非 DOM，无渲染延迟）确认同文本不同 id 双写最终收敛为 1 条，round-52 去重真机生效。诊断日志验证后已移除，代码恢复原状；82/82 单测 + `vue-tsc --noEmit` 复跑通过。
- **真机实证（补充修复后）**：用户在浏览器发现进行中 process 区仍会出现重复（同一场景三代协作，历史回合 process 区出现过两对逐字相同块：e21/e35、e26/e42）。定位为**跨源重复**（persisted × live 同文本不同 id，源上去重与 `mergeLiveMessages` 均按 id 去重、堵不住），已在 `mergeThreadMessageStreams` 最终汇合点补 `dedupeAssistantAgentMessageText`（见「修复实施·补充」）。Vite 热更新后发起新一轮三代协作，全程高频采样 `conversation-turn-process-items`，**process 区未再出现重复块**（最终 3 个过程项、文本互不相同），确认修复在真实 live 进行中生效。83/83 单测 + `vue-tsc --noEmit` 通过。
- **最终验证（toolbar 分叉/Copy 重复）**：用户在浏览器观察到进行中"分叉/Copy 按钮块"重复出现的疑虑。经代码核查，`MessageToolbar` 渲染于每条消息块，live overlay（`LiveOverlayItem`/`selectedLiveOverlay`）不含 toolbar；重复 toolbar 只可能来自"同文本不同 id 消息各自挂 toolbar"，即 round-52 的重复块根因——已被 `dedupeAssistantAgentMessageText` 消除。真机复验：最终态 7 个 toolbar 各挂不同消息、无重复；发起新一轮三代协作，进行中高频采样 Copy=4/分叉=3，各挂不同内容消息，**全程未出现同内容消息重复挂载工具栏**；最终态同样干净。「同内容重复挂载」不成立，但顺带暴露并修复了过程项误挂工具栏的问题（见下）。
- **最终结论（live 阶段 "Copy 重复" 疑点关闭）**：用户在浏览器再次反馈进行中（live）看到 Copy 按钮块重复。前期反复用 DOM/截图/悬停采集，因嵌套 `ul`/`ol` 结构被双计数、工具栏需 hover 才显示等原因，报告相互矛盾、无法复现。决定性做法是**在代码里注入诊断而非抓 DOM**：在 [useDesktopState.ts](src/composables/useDesktopState.ts) `mergeThreadMessageStreams` 最终汇合点临时 `console.log` 打印 Vue 真正用于渲染的 `messages` 数组（persisted/live/raw/deduped 数量 + 每条 id/type/文本前缀，`[round52-render]` 标记），由用户自己操作浏览器、唯读采集控制台。新线程 `01a024b0` 全程 live 记录证明：`raw` 中确实会瞬时出现「同文本不同 id」（`item-*`＝persisted、`msg_*`＝live completed）成对，但 `deduped`（实际渲染数组）**每一帧都把它们合并为 1 条、全程无重复**；第 7→8 条显示轮末 persisted 落定干净。结论：数据层渲染数组无重复，live "Copy 重复" 为进行中多段**文本不同**的 assistant 消息各自挂独立的拷贝工具栏（多代理多段回复的常态），非重复块回归。诊断日志验证后已移除，代码恢复原状。
- **补充修复（过程项误挂工具栏）**：真机核对中发现「本轮过程」(Turn process) 区的**每个过程项都误挂了 Copy/分叉 工具栏**——`MessageToolbar` 在父组件 [ThreadConversation.vue](src/components/content/ThreadConversation.vue) 的默认 slot（`{ item, section }`）中对所有消息统一渲染，未区分 `section === 'process'`；而 `copyableResponseContentByAnchorId` / `forkableTurnIndexByAnchorId` 对过程 agentMessage 也判定可复制/可分割，导致过程项被挂操作按钮。修复：给 `MessageToolbar` 加 `v-if="section !== 'process'"`，过程项不再渲染工具栏，仅最终回复（`section === 'final'`）与用户消息（`section === 'request'`）保留。真机核验：同一线程 4 个过程项均不再带 Copy/分叉，最终回复工具栏正常保留，`vue-tsc --noEmit` 通过。属 round-52 相关 UI 完善，非重复块回归。
- **真机核对（早期）**：4173 页面加载正常、无 console 错误、app-server RPC 通道健康（`initialize` 正常响应）。早期发起测试对话时 provider `deepseek-v4-flash-free` 返回 `server_error`（提供方限流，同 round-39 现象），切换 mimo-v2.5-free 后正常。

## 补充修复（live 进行中「正常消息被拉出本轮过程外」→ 中间消息误提升为 final）

用户反馈 live 状态下「正常消息没有出现在本轮过程中，而是出现在本轮过程外」，具体形态：`user —— 本轮过程（message、message）message`。经分析，根因在 [transcriptGrouping.ts](src/utils/transcriptGrouping.ts) 的 `buildTurnRenderGroups`——它把每个 turn 的**最后一个内容项**里满足 `isFinalAssistantItem`（非 reasoning/command/plan/fileChange 且非 `.live`、文本非空）的已完成 `agentMessage` 提升为 `final-assistant`（拉出过程区、渲染成末尾最终回复）。当主代理仍在流式（存在 `.live`）、而子代理已完成（`agentMessage` 非 live）且排在其后时，这条**中间消息**会被当成最终答案提升为 final——即"本轮过程外"。

- **真机复现（DOM 直证抓中窗口）**：用户要求「4173 真机复现该窗口确认后再改」，并主动在 4173 开新线程（`01a024c9`）观察。用 `browser_evaluate` 直接抓 DOM class 抓到**确凿证据**：最后一个 user 之后、按 DOM 顺序先出现 `conversation-item conversation-item-final`（`data-message-type=agentMessage`，全文"已创建子代理 Curie，等待它完成任务（它会自行创建孙代理）……"+ Copy 按钮——一条已完成**中间消息**），其后再有一条 `conversation-item conversation-item-overlay`（文本"Writing response"、仍在对真正最终回答流式）。即：中间消息**当真被判成 final**、挂上了最终回复位，而真最终还在 overlay 流式——正是"正常消息出现在本轮过程外"的窗口，`conversation-item-final` 的 class 标错实锤。
  - **根因修正（推翻上一版 `.live` 限定）**：真正最终回答在流式阶段通过 `LiveOverlayItem`（[ThreadConversation.vue](src/components/content/ThreadConversation.vue) 末尾 `v-if="liveOverlay"`）渲染，**不进** `messages`；因此 `buildTurnRenderGroups(hotSourceMessages)` 迭代时，最后一轮的消息数组里没有任何 `*.live`，`streamingInTurn` 判定为 false → 末尾完成的中间消息仍被提升为 final。上一版仅以 `.live` 作流式信号，[repro-final] 在两次并行委托任务中 0 触发（那两次子代理先完成、主代理最后才写汇总），而用户新线程的三代协作把"主代理仍在写最终（overlay）时先落定的中间消息排在末尾"的时序暴露了出来——DOM 即证。
- **确定性复现（单元测试）**：`transcriptGrouping.repro.test.ts` 修复前给定 `[user, 主代理 .live, 子代理已完成 agentMessage]` → `sub-done` 被判 `final-assistant`（`.live` 守卫缺口）；又给定 `[user, curie-done(agentMessage，无任何 .live)]` + `liveOverlayActive: true` →（修复前）`curie-done` 也会被判 `final-assistant`（overlay 场景缺口）。两段都复现该逻辑缺陷。
- **改动**：`buildTurnRenderGroups(messages, options?: { liveOverlayActive?: boolean })` 在提升 `final-assistant` 前加**双守卫**——① 组内存在 `.live`（`streamingInTurn`）；② `liveOverlayActive === true` 时跳过**最末（活跃）轮**的 finally 提升（overlay 是"该轮真最终尚未落定"的权威信号）。调用点 [ThreadConversation.vue](src/components/content/ThreadConversation.vue) `renderTurns` 传 `liveOverlayActive: props.liveOverlay !== null`。同时移除 `[repro-final]` 诊断。
- **行为影响**：overlay 流式期间，活跃轮末尾的已完成中间消息留在过程区、final 位留空（由 overlay 展示生成中的真最终）；待真最终进入 `messages`、overlay 清除后，真最终被正常提升为 final。已落定的历史轮不受影响（守卫只作用于最末活跃轮）。真机核对：线程 01a024c9 结束后该轮中间消息保持 `conversation-item-process`，且 `conversation-item-final` 卡仍在、显示真正汇总"子代理 Curie 已完成！下面汇总三代协作的结果……"——**无回归**。
- **单测**：`transcriptGrouping.repro.test.ts` 现含 4 用例——`.live` 判回归、无 `.live` 仍提升完整性、overlay 活跃不提升、overlay 只抑制最末轮不影响历史轮。全量 `pnpm exec vitest run` 26 文件 / 370 用例全通过；`pnpm exec vue-tsc --noEmit` 通过。

## 待办

- [x] 实施上述 live 文本去重
- [x] 补单测（对齐 round-40 风格：delta 与 completed 同文本不同 id → live 中只保留一条）
- [x] `vue-tsc --noEmit` + 单测通过
- [x] 4173 起服真机核对：live 写入源头确认同文本不同 id 双写收敛为 1 条（临时诊断日志直证，见上），进行中重复块/toolbar 场景不再复现
- [x] 真机复验 toolbar（分叉/Copy）重复疑虑：最终态 + 进行中均未出现同内容消息重复挂载工具栏（见「最终验证」）
- [x] live "Copy 重复" 疑点关闭：代码注入打印实际渲染数组实证数据层无重复（见「最终结论」），诊断日志已移除、代码恢复原状
- [x] 真机复现「live 正常消息被拉出本轮过程外」窗口（用户开新线程 01a024c9，`browser_evaluate` 直抓 DOM class 实锤中间消息被判 final + overlay 流式；见「补充修复·真机复现」）
- [x] `buildTurnRenderGroups` 增 `liveOverlayActive` 双守卫（`.live` + overlay 最末活跃轮）修复误提升 final；调用点传 `props.liveOverlay !== null`；`transcriptGrouping.repro.test.ts` 扩为 4 断言；全量测试 370/370、`vue-tsc --noEmit` 通过，结束态 final 卡无回归

## 涉及文件（本轮代码 + 文档）

- `src/composables/useDesktopState.ts`（`upsertLiveAgentMessage` live 文本级去重 + `mergeThreadMessageStreams` 最终汇合 `dedupeAssistantAgentMessageText` 跨源去重）
- `src/composables/useDesktopState.test.ts`（round-52 去重用例）
- `src/utils/transcriptGrouping.ts`（`buildTurnRenderGroups` 增 `liveOverlayActive` 双守卫：`.live` + overlay 最末活跃轮，防止 live 流式中中间消息误提升 final）
- `src/utils/transcriptGrouping.repro.test.ts`（误提升 final 判回归：`.live`/overlay 活跃两场景 + 无流式仍提升完整性 + overlay 只抑制最末轮不影响历史轮）
- `src/components/content/ThreadConversation.vue`（`renderTurns` 调 `buildTurnRenderGroups` 传 `liveOverlayActive: props.liveOverlay !== null`）
- `codex-mobile-handover/rounds/round-52-duplicate-agent-live.md`（本文件）
- `codex-mobile-handover/codex-mobile-handover.md`（索引快照）

## 本轮提交

- live 文本去重（源 `upsertLiveAgentMessage` + 最终汇合 `dedupeAssistantAgentMessageText`）+ 补充修复（`buildTurnRenderGroups` `liveOverlayActive` 双守卫防中间消息误提升 final）+ 单测 + 文档；真机 DOM 直证验证通过。
- **发布进行中**：版本 `0.1.103`，代码与 git tag `v0.1.103` 已提交并推送到 `origin`（tag → 版本/文档提交 `d9f5972`），`pnpm run build` 通过（web + CLI 均成功）。**GitHub release `v0.1.103` 与 npm 发包均由用户手动执行**：本机无 `gh` CLI、无 `GITHUB_TOKEN`，无法自动创建 release。