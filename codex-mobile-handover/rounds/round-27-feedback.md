# Round-27：12 条反馈（8 条代码修复 + 4 条调研结论）（2026-08-09）

> **背景：** 基于某本地工具开发线程的 12 条反馈。其中 1/2/3/5/7/8/11/12 为代码修复，4/6/9/10 为调研结论。全部修复已通过 `vue-tsc --noEmit`、`pnpm run build:frontend`、全量单测（315/317，2 个失败为既有 Windows 环境性失败，见文末）与 Playwright（Edge）真实线程实测。

## 1. 刷新后「输入框上方的计划面板」消失（修复）

**根因（实测确认）：** 该线程（OpenCode Zen 代理）的会话 jsonl 中**没有任何 plan item / plan 事件**——plan 只经实时通知通道到达页面内存（`livePlanMessagesByThreadId`），服务端不持久化。刷新后消息流里没有 plan 消息，面板即消失。另有次要原因：即使服务端持久化了 plan，`composerPlanPanel` 的 `hasLaterWork` 判定会在「后续轮次已执行工作项」时整体隐藏面板（设计上防重复点击，但用户希望保留计划作参考）。

**修复：**
- `useDesktopState.ts`：新增 `THREAD_LAST_PLAN_STORAGE_KEY`（`codex-web-local.thread-last-plan.v1`），`upsertLivePlanMessage` 每次把最近一次 plan 消息写入 `lastPlanByThreadId` 并持久化到 localStorage；经 return 暴露。
- `App.vue` `composerPlanPanel`：消息流无 plan 消息时用 `lastPlanByThreadId` 兜底恢复（本地存档的 plan 不随刷新丢失）；`hasLaterWork` 不再整体隐藏面板，改为 `implemented: true`（按钮显示「Plan executed」并禁用，保留防重复点击语义），仅「本会话已点 Implement」（`implementedPlanRequestId`）仍隐藏。

## 2. 右侧边栏各面板未适配暗色主题（修复）

**根因：** round-26 已把多数面板的 `:global(:root.dark)` 规则迁移到全局 `style.css`，但 **RightGitPanel / RightFilesPanel / RightFilePreview 三段的暗色规则仍残留在组件 scoped 内**（该构建下编译成 `:root.dark[data-v-*]` 永不匹配）；ApiMethodsPanel 完全没有暗色覆盖；另有 4 处缺口（`thread-pending-request-select-label`、`skills-hub-toast-success/error`、`review-pane-branch-dropdown .composer-dropdown-trigger`、`review-pane-banner`）。

**修复：** 三段规则整体迁入 `src/style.css`（置于 content-right-panel 暗色区之后），组件内删除死规则；新增 ApiMethodsPanel 暗色规则；补齐 4 处缺口。

## 3. message-card 宽度与 message-body 不一致（修复）

**根因：** `.message-body` 是 `width: fit-content` 且无上限，`.message-card` 被 `max-width: min(76ch,100%)` 截断。实测长回答消息 card=656px、body=720px（body 被图片/长附件撑宽），短消息则一致。

**修复（`ThreadConversation.vue`）：** 宽度上限上移到 `.message-body`（`max-width: min(var(--chat-card-max,76ch),100%)`；用户气泡维持 `min(560px,100%)`），`.message-card` 改为 `width: 100%` 撑满 body。实测末条长消息 card/body 均为 656px，全部消息 card==body。

## 4. 刷新后 Thinking 会不会断开？（调研结论 + 部分修复）

**结论：** 连接**不会断开**——WebSocket/SSE 自动重连（指数退避 1s→10s），重连后服务端发 `ready` → `recoverBridgeState` 增量重同步；「Thinking」标签/spinner 会恢复。但 overlay 里的**思考文本会丢**：`liveReasoningTextByThreadId` 是纯页面内存态，服务端不回放已发过的 reasoning 增量，存档只在该轮结束（或 agent 内容事件）时才写。**修复**：轮次进行中把思考文本尾部（≤8000 字符）快照节流写 localStorage（`codex-web-local.live-reasoning-snapshot.v1`，1.5s 尾随写、15 分钟有效期），`setThreadInProgress(true)` 时恢复快照 → 刷新后 overlay 显示最近思考而非空白。单测：`restores the live reasoning snapshot for an in-progress thread after refresh`。

## 5. 用户消息下回退/复制按钮颜色不一致、图标偏小（修复）

**根因：** 回退按钮是琥珀色（`text-amber-600/80`）、复制按钮是中性灰（`text-slate-500`），色相不一致；图标 `text-sm`=14px（实测 svg 宽 14px）。

**修复（`MessageToolbar.vue` + `style.css`）：** 回退按钮改为与复制/分叉一致的中性灰（暗色 `text-zinc-400`），语义靠图标区分；图标 `text-sm`→`text-base`（14→16px）。实测全部按钮颜色一致（slate-500）、svg 16px。

## 6. 左侧边栏的「聊天」块是干嘛的？需要保留吗？（调研结论）

**结论：保留。** `SidebarThreadTree.vue` 的 Chats/聊天 分区展示「无项目聊天」线程——cwd 形如 `.../Documents/Codex/YYYY-MM-DD/<name>`（Codex 默认聊天目录，`isProjectlessChatPath`）且未 pinned 的线程，默认折叠 10 条 + Show more。Projects 分区显式排除了 projectless 线程（`!isProjectlessChatPath`），**Chats 是这批线程除搜索外唯一的展示出口**，直接删除会导致所有 Codex 默认聊天线程在侧边栏不可见。若要移除需同时改 Projects 分区放行（两处联动），不建议。

## 7. commandExecution 看起来有底部边框（修复）

**根因（实测确认）：** `.work-block-output-wrap` 常驻 `border: 1px solid transparent` + `border-top: none`，折叠时仍占 1px 高度（实测 collapsed h=1px），展开时 `border-color: #e4e4e7` → 左/右/底三边可见，视觉上整条 commandExecution 有底部边框。

**修复（`WorkBlockItem.vue` + `style.css`）：** 移除 border 相关声明与 transition 中的 `border-color`，删除暗色 `border-color: #3f3f46` 规则。实测边框 0px、折叠高度 0px；输出区深色背景与消息背景的对比足以区分。

## 8. 刷新后 live-overlay-reasoning 不见了（修复）

**根因：** 与问题 4 同源——overlay 思考文本为页面内存态，刷新即清空；`selectedLiveOverlay` 里 `reasoningText` 为空后 `.live-overlay-reasoning` 元素不再渲染。

**修复：** 见问题 4 的快照恢复方案（快照在轮次进行中持续更新、轮次结束 `clearLiveReasoningForThread` 收口时删除）。

## 9. 当前项目有自动压缩吗？自动压缩是 codex 的还是项目的？（调研结论）

**结论：自动压缩是 Codex app-server（CLI）的服务端行为**（上下文接近上限时自动触发，产物是 `ContextCompaction` turn item 或旧版 `thread/compacted` 通知）。本项目**没有任何自动触发压缩的定时逻辑**，只做展示（`compaction.done` 行 + `Context compacted` 提示）+ 手动 `/compact` 与上下文用量按钮（`compactThreadById` 仅两处手动调用点）。实测该线程 jsonl 含 `{"type":"compacted"}` 通知与 `context_compacted` 事件，thread/read 归一化为 `contextCompaction` item。

**自动压缩在 Web UI 上的体现（2026-08-09 追问确认）：** 会体现，但只体现「压缩完成」这一行，不体现摘要内容与进行中状态。

- 触发：app-server 在上下文 token 超过 `model_auto_compact_token_limit`（config.toml 可配置，未配置用内置默认，通常接近 model context window 的比例）时，于下一个 turn 开始前自动压缩并生成摘要（`compact_prompt` 可覆盖提示词），摘要只放回模型上下文。
- 通知到 UI：压缩完成时服务端发 `thread/compacted` 通知 → `useDesktopState.ts` 注入 `compaction.done` 消息 + 刷新线程列表 → 消息列表出现「Context compacted」行。无 pending 阶段（`compactingThreadIds` 只在手动压缩时设置），自动压缩完成 <1s（实测 10:24:13.704 通知 → .859 事件）。
- 持久化：thread/read 返回 `contextCompaction` item（实测只有 `{"type":"contextCompaction","id":"item-41"}`，无 items 内容）→ v2.ts 归一化为 `compaction.done` → 刷新后仍显示。
- 不体现的部分：压缩摘要文本（`payload.message` 的 "Another language model..."）UI 不展示，只重放进模型上下文；消息列表内容不变（thread/read 仍返回完整历史，实测 70+ 条 item 全部保留），表现为某次回答前后插入一行「Context compacted」。

## 10. 过 15-30 分钟回到页面会自动刷新吗？（调研结论）

**结论：桌面端不会 reload、不会全量刷新。** `onDocumentVisibilityChange` / `maybeSyncAfterMobileResume` 均 `if (!isMobile.value) return`（仅移动端 <768px 隐藏 ≥400ms 后恢复时全量 `refreshAll`）。桌面端靠 WebSocket/SSE 自动重连 + 重连后的增量重同步（`syncFromNotifications`：线程列表 dirty 则 `loadThreads`、`hasVersionChange`/dirty 则 `loadMessages`）收敛数据。注意：重连不重放断线期间丢失的通知；后台 tab 定时器被浏览器节流时会延迟重连，回到前台后恢复。

## 11. 执行压缩时消息列表展示两个压缩块（修复）

**根因（实测确认）：** `compactThreadById` 轮询到持久化 `ContextCompaction` item 后 `loadMessages(force)` 把持久化 `compaction.done`（id=`item-41`）放进消息流，随后又 `injectCompactionMessage('done')` 注入第二条（id=`compaction:done:...`）；`messages` computed 的 `effectiveInjected` 只过滤 injected 的 `compaction.pending`、**不过滤 injected 的 `compaction.done`** → 两条 done 并存。刷新后 injected 重置只剩持久化一条，表现为「压缩时两个、刷新后一个」。

**修复（`useDesktopState.ts`）：** `effectiveInjected` 在 `persistedHasCompactionDone && !compactionStillActive` 时同时过滤 injected 的 pending 与 done。实测刷新态只有一个 `compaction.done` 块。

## 12. 最后一轮思考堆在「用户消息后、模型回答前」（修复）

**根因（实测确认）：** `isAgentContentEvent` 中途清理会调用 `clearLiveReasoningForThread`，旧代码**每次都在存档后删除 `turnItemSequenceByThreadId` 时间线** → 该轮后续思考项 `buildTurnReasoningItems` 拿不到锚点（存档条目无 `reasoningAnchorMessageId`）→ `mergePersistedReasoning` 全部回退到 `lastUserIndex + 1`（用户消息之后）。实测末轮存档 6 条思考中 5 条无锚点、1 条锚点指向 live 用户消息 id（`msg_*`，持久化后为 `item-*`，找不到）→ 消息流呈现 6 连思考墙。另一增量问题：`rememberPersistedReasoningItems` 按 text+turnId 去重，同一推理项部分文本先归档、全量文本再插一条会重复。

**修复（`useDesktopState.ts`）：**
- `clearLiveReasoningForThread(threadId, keepSequence=false)`：`isAgentContentEvent` 中途清理传 `keepSequence=true` 保留时间线，时间线只在 `turn/completed` 收口时删除；中途清理不再走整段文本兜底存档。
- `buildTurnReasoningItems` 返回项带 `itemId`；`rememberPersistedReasoningItems` 改用稳定 id（`reasoning:item:<threadId>:<itemId>`）原地更新文本/锚点/turnIndex，同文本跳过（兼容旧 `reasoning:local:*` 存档），消除重复块。
- `mergePersistedReasoning` 兜底改进：**无锚点思考**在含工作项（commandExecution/toolCall/fileChange/worked）的轮内按存档顺序分摊到各命令/agent 消息之后（第 k 条 → 第 k 条非用户消息之后），不再全部堆在用户消息后；纯问答轮保持「提问→思考→回复」插在用户消息之后。旧存档（无锚点）也能借此恢复交错观感。

**实测：** 末轮思考块从「用户消息后 6 连堆」变为「用户消息后 1 个初始思考 + 其余与命令/回答交错」。新增单测：`keeps the turn item timeline across mid-turn agent content clears`、`distributes anchorless reasoning across work items of a turn`、`restores the live reasoning snapshot for an in-progress thread after refresh`；同步更新 1 条旧断言（存档 id 格式 `reasoning:item:*`）。

## 验证说明

- `vue-tsc --noEmit` 通过；`pnpm run build:frontend` 通过。
- 全量单测 315/317：2 个失败为既有 Windows 环境性失败（`codexAppServerBridge.archive.test.ts` 的 symlink EPERM 与 free-mode 状态文件字节数漂移），`git stash` 后在原始 HEAD 上同样失败，与本次改动无关。
- Playwright（Edge，1440x900，真实线程）：message-card==message-body（含 656/656 长消息）、回退/复制按钮同色且 svg 16px、`.work-block-output-wrap` 无边框且折叠高度 0、压缩块仅 1 个、末轮思考块交错、右侧面板暗色背景生效。截图与脚本在 `output/playwright/`（gitignored）。
- 涉及文件：`useDesktopState.ts`、`useDesktopState.test.ts`、`App.vue`、`MessageToolbar.vue`、`WorkBlockItem.vue`、`ThreadConversation.vue`、`RightGitPanel.vue`、`RightFilesPanel.vue`、`RightFilePreview.vue`、`style.css`。
