# round-121 · 修「新发的用户消息串进上一轮 message 中间」——mergeMessages 乐观消息时序锚定

- 日期：2026-10-08（macOS / codex CLI 0.160.1 机器）
- 用户报告：「消息列表有的时候会出现用户消息和 message 位置串的问题，比如上一轮消息已经完成了，发送消息后用户的消息出现在上一轮 message 中，但还是在右边」——**间歇性**，发送越紧跟上一轮完成越易触发

## 一、根因（代码级定位，非猜测）

消息列表的轮次分组（`buildTurnRenderGroups`，`transcriptGrouping.ts:63`）**以 user 消息为界**切组，渲染顺序完全跟随 `messages` 数组顺序——所以「用户消息出现在上一轮中间」＝**数组顺序**把新用户消息排到了上一轮收尾消息之前。

顺序错乱的入口在 `mergeMessages`（`useDesktopStateUtils.ts:249`）的 `preserveMissing` 合并分支：

1. 发送时 `appendOptimisticUserMessage`（`useDesktopState.ts:1393`）把乐观用户消息**追加到持久化数组尾部**——此刻上一轮的 final 回复可能**尚未物化进持久化层**（还活在 live 层或等快照）
2. `turn/completed` / `turn/started` 触发的消息刷新是**防抖 + 异步**的（`useDesktopState.ts:2241` `queueEventDrivenSync` → `EVENT_SYNC_DEBOUNCE_MS`）；用户在上一轮刚完成时快速发送，刷新在乐观追加**之后**才落地
3. 刷新拿到服务端快照（含上一轮刚物化的 final 回复），走 `mergeMessages(previous, next, { preserveMissing: hasOptimisticUserMessages(previous) })`（`useDesktopMessageHistoryLoading.ts:179`）——该分支把「快照里 previous 没有的消息」一律**尾追加**（`[...mergedFromPrevious, ...appended]`）
4. 结果：`[user-1, …, user-2乐观, assistant-1-final]`——上一轮收尾排到新用户消息后面。渲染上你的新消息（右侧气泡）出现在上一轮 message 中间，且该错序要等下一次把真实用户消息带回来的刷新才自愈

「有的时候」＝只有发送落在「turn/completed 防抖刷新尚在飞行」的窗口内才触发；隔一会儿再发就不会。

## 二、修复（`useDesktopStateUtils.ts` mergeMessages）

给 `preserveMissing` 分支加**乐观消息时序锚定**：

- 无乐观消息：行为**逐字不变**（前插列表为空，全部尾追加）
- 有乐观消息时，在 `mergedIncoming`（服务端时序）里找第一条「与任一乐观消息等值」的真实用户消息作锚：
  - **锚存在**：锚之前的新增消息属于发送前历史 → 插到乐观消息**之前**；锚（含）之后才是新轮内容 → 尾追加。真实消息到达后乐观消息被等值过滤，插入位置自然归位
  - **锚不存在**（新 turn 服务端尚未落地）：新增消息有两种可能——①上一轮收尾物化（本缺陷）；②**新轮自身的回包先于用户消息进快照**（新线程首轮的实测形态，其助手消息甚至没有 `turnId`，全量验证时被既有用例 `captures the active provider when creating a new thread` 当场拦下）。故按 **turnId 归属**判别：turnId 已出现在 previous → 发送前历史，前插；turnId 未知或缺失 → **保守尾追加**（旧行为，宁可漏修不可错排）
  - **锚已在 previous**（非新增，乐观将被过滤）：无内容需要前插，维持尾追加
- 修复过程中自查出两处实现陷阱并当场修正：①默认分支方向写反会**丢消息**（无乐观时 `appendedAfter` 为空数组把 `appended` 吞掉）；②乐观消息被过滤后 `firstOptimisticIndex = -1`，前插内容若只挂在「插到乐观之前」的分支上也会**丢消息**——已改为 `-1` 时按序拼回尾部

改动仅 `mergeMessages` 一个函数（约 30 行 + 注释），不动调用方、不动渲染分组。

### 补充：codegraph 复核发现的第二路径（live 层变体，同轮补修）

用户装上 codegraph 后要求独立复核，`clearCompletedTurnLiveState`（`useDesktopState.ts:1480`）的调用链暴露出**同一症状的第二条路径**：

- `clearCompletedTurnLiveState` 清 plan/思考/命令/活动态，但**不清 `liveAgentMessagesByThreadId`**——上一轮的流式正文在 turn/completed 之后、防抖刷新物化之前**一直留在 live 层**
- `mergeThreadMessageStreams`（`useDesktopStateUtils.ts:1293`）把带 turnIndex 的 live 消息插到「下一 user 消息之前」，最后一轮的插入点是 `persisted.length`；而**乐观用户消息没有 turnIndex**，不构成边界 → 上一轮 live 正文插到乐观消息**之后**，同样渲染成「用户消息串进上一轮」
- **补修**：最后一轮的插入点在存在乐观消息时收到 `firstOptimisticIndex`（已存在的 live 内容都早于发送时刻，时序上必在乐观消息之前）；新轮 live 内容（未知 turnIndex）仍走 unattached 尾追加、排在乐观消息之后——语义正确。无乐观消息时行为逐字不变
- 新增 3 个边界用例（live final 前插 / 无乐观原语义 / 新轮 live 仍在其后），回归测试累计 **11/11**

两条路径共用一个不变量：**乐观用户消息代表「现在」，一切发送前已存在的内容（持久化或 live）都不得排到它后面。**

## 三、验证

- 新增纯函数回归测试 `useDesktopStateUtils.mergeMessages.test.ts` **11/11**（mergeMessages 8 + mergeThreadMessageStreams 边界 3）：
  1. 复现场景（收尾晚物化 + 已知 turnId + 无真实对应）→ 前插 ✓
  2. 锚切分（真实对应在快照）→ 锚前前插 / 锚起尾追加 + 乐观过滤 ✓
  3. 历史脏序自愈（previous 已错序）→ 过滤后归位 ✓
  4. 锚已在 previous → 维持尾追加 ✓
  5. 无锚 + 缺失 turnId（新线程首轮回包形态）→ 保守尾追加 ✓
  6. 无锚 + 未知 turnId（真正的新轮内容）→ 保守尾追加 ✓
  7. 无乐观消息 → 原语义不变 ✓
  8. `preserveMissing` 关闭 → incoming 顺序直接生效 ✓
  9. live 层：上一轮 final 留在 live 层时插到乐观消息之前 ✓
  10. live 层：无乐观消息 → 原末尾插入语义不变 ✓
  11. live 层：新轮 live 内容（未知 turnIndex）仍排在乐观消息之后 ✓
- **全量 Vitest 抓回一次真回归**：首轮全量跑出 1 失败（`captures the active provider when creating a new thread`，期望 `user:hi, assistant:Hi.` 实得反序）——正是「无锚一刀切前插」破坏新线程首轮形态的实证；引入 turnId 判别器后该用例恢复通过
- `vue-tsc --noEmit` → **EXIT=0**
- 全量 Vitest → **725/725 零失败**（714 + 新增 11）
- UI 契约 → **38/38**
- **codegraph 独立复核**（用户安装后要求）：`callers mergeMessages` 确认生产调用点仅 `loadMessages` / `loadOlderMessages` 两处；`callers setPersistedMessagesForThread` 确认其余持久化写入者（rollback/interrupt/fork/retry 回退）均为删/替换语义、无第二个「尾追加助手内容」入口；`impact` 影响面全部落在消息组合链内；`clearCompletedTurnLiveState` 调用链暴露第二路径（已补修，见 §二补充）

## 四、诚实边界

- 单元测试以纯函数编码竞态场景（先测后改的代码级取证），未做真实双轮次端到端复现——需要真实 app-server 轮次生命周期与精确的发送时序控制，成本高且窗口难稳定命中；合并语义已由 8 个形态用例覆盖
- 无锚且收尾消息**缺失 turnId** 的快照形态下，前插不生效（保守尾追加）——缺陷在该形态下可能残留；正常服务端消息均带 turnId，属边缘
- `loadOlderMessages` 路径（`useDesktopMessageHistoryLoading.ts:273`）的同名合并语义未动：它的 `appended` 几乎恒为空（翻页消息已在 previous），即便出现新消息也属「另一设备插入历史」的边缘场景，本轮不扩范围
- 若用户再次观察到串位，需记录当时是否刚完成上一轮（验证触发窗口假设）；修复后错序即使出现也应在真实用户消息物化后自愈
