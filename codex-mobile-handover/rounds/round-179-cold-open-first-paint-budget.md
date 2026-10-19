# round-179：冷开首屏再压一档 —— 定位到架构下限，落地两项小优化

> 目标：round-178 之后「重开线程」已快 3–5×，但**冷开**（首次打开某线程：无快照、无 hot 高度种子）仍有 ~1s 级尾延迟。用户要求再压一档。
>
> 结论先行：**这一档压不下去**。逐项实测后确认冷开的客户端下限 = 首次挂载固定开销（与渲染行数弱相关），本轮净收益只有 **65ms**（中位）；更大的方案需要改 hot/warm 分界或窗口化范式，属独立议题（§七）。

## 一、方法

三组互补测量，全部在 headless Edge（1440×900 / dpr 1）上跑，夹具是 **170 轮真实形态线程**（r166 的 10 轮 554 items 真实数据复制 17 个周期）：

| 工具 | 看什么 |
| --- | --- |
| `tmp/r179-coldopen-profile.cjs` | 外部时间线：RPC 起止、`.message-row` 行数跃变（8ms 采样）、longtask、LoAF（含 render / style 拆分） |
| `tmp/r179-prime-check.cjs` | 逐帧（rAF）采样行数与 `[data-turn-key]`，用于 A/B 对照首屏帧 |
| `tmp/r179-cpu-profile.cjs` | CDP Profiler 100µs 采样，按 `function @ file` 聚合 self time；匿名函数回溯最近有名祖先 |

## 二、诊断结果

### 2.1 时间构成（冷开，RPC 无人工延迟）

- 首行墙钟 **1.3–2.7s**，其中 resume RPC **0.4–1.0s** 波动主导（**注**：探针夹具把 10 轮真实形态复制成 170 轮，响应体 4MB 是夹具造的；真实 resume 经桥只带 10 轮，见 §七 规模修正）
- 客户端成本（首行 − resume 结束）**350–670ms**
- 归一化 **不是瓶颈**：node 直测 `normalizeThreadMessagesV2` 全量 170 轮 **15–25ms**（初判「归一化 ~550ms」是把 LoAF 的 render 时间错算进 JS）

### 2.2 首屏到底渲染了多少行

- 渐进归一化首片 = **30 轮 = hot 区全部** ⇒ 首屏渲染 **895 行**
- 其后 5 片只追加 140 张 warm 折叠卡（+140 行）⇒ 1035 行
- 窗口化收敛后 **58 行**（3 个 hot 块在窗口内）

⇒ 「首屏」本质是 895 行的 hot 全量渲染；**任何只削减后续分片的优化都只动 140 行**。

### 2.3 热点（改前 profile，self time）

| 项 | 耗时 | 说明 |
| --- | --- | --- |
| `track` / `get` / `prepareDeps` / `cleanupDeps` / `isRef` | ≈ 580ms | Vue 响应式依赖收集（895 行 × 多组件） |
| `readScrollMetricsPx` | 264ms | 每次读 `scrollHeight` 强制同步布局（锁底连打 6 帧放大） |
| `trimSnapshotMessagesToBudget` | 146ms | 9360 条逐条 `JSON.stringify`（当时同步跑在 loadMessages 返回路径上） |
| `formatMessageTimestamp` / `buildProcessFolds` / `measureHotBlock` | 80 / 73 / 45ms | 渲染期计算 |

## 三、试过但**回退**的方案（负面结论，别再重做）

### 3.1 首屏限量（`hotTurnWindow.tailOnly`）

做法：首帧只渲染尾部 8 块 + 用 `DEFAULT_HOT_BLOCK_ESTIMATED_HEIGHT_PX` 补上方 spacer；双 rAF 后解除、进入全量测量。

逐帧实测：

| 组 | 首屏帧 | 行数 |
| --- | --- | --- |
| 开启限量 | 1346ms | **195**（8 轮） |
| 关闭限量 | 1393ms | **1035**（30 轮全量） |

**净收益 47ms**，视觉上却多一次「内容出现 → 卡一下 → 上方补全」。判断为不值 ⇒ 全部回退（含 `tailOnly` 参数、组件预置/解除逻辑、3 条单测）。

根因：**首屏成本主要是首次挂载的固定开销**（组件树构建、样式计算、字体），与行数弱相关 —— 渲染 8 轮和 30 轮的差距远小于行数比例。

### 3.2 锁底「不读度量」（`scrollTop = 1e9` 钳位写）

原以为 `readScrollMetricsPx` 264ms 是「读两次」（判定 + 写入各一次）。改成纯写入后 profile 里 `readScrollMetricsPx` 确实消失，但 `scrollToBottom` 自己顶上来 **257ms** —— **写 `scrollTop` 同样要钳位、同样强制布局**，总量不变。回退。

### 3.3 渐进归一化跨帧 yield（rAF → setTimeout）

把 `yieldToMainThread` 从 `setTimeout(0)` 换成「rAF → setTimeout」，确保片间真的跨帧。实测首屏行数序列**无变化**：首片 895 行本来就是首屏主体，后续 140 卡不在关键路径。回退（避免每片多 16ms 与后台标签页 50ms 兜底的复杂度）。

## 四、落地：快照保存移出首屏路径

### 4.1 `useDesktopMessageHistoryLoading.ts`

新增 `scheduleThreadMessageSnapshotSave`：`rAF → setTimeout` 推到**首帧 paint 之后**再保存快照。

守卫（防 r178 修过的「回退后刷新又回来」以异步形式复活）：写入前复核「加载结果的**尾部消息 id** 仍在 `persistedMessagesByThreadId` 里」；回退会删尾部轮次 ⇒ 复核失败 ⇒ 放弃写入。

### 4.2 `useDesktopStatePersistence.ts`

`trimSnapshotMessagesToBudget` 改为**从最新往前累加、够 `MAX_THREAD_MESSAGE_SNAPSHOT_BYTES` 即停**（首屏只需要最新 384KB ⇒ 大线程通常只序列化尾部一百来条）。

注释里钉住一条踩过的坑：**「整表 stringify 一次」不是快路径** —— 实测 4MB 单串分配 271ms 且触发大对象 GC，比逐条累加更贵。

## 五、实测收益（A/B，各 3 次，逐帧首行）

| 组 | 3 次首屏帧 | 中位 |
| --- | --- | --- |
| 同步保存（改前） | 1278 / 1399 / 1599ms | **1399ms** |
| 延后保存（改后） | 1307 / 1334 / 1394ms | **1334ms** |

- 中位 **省 65ms**，且**分布明显更稳**（改前方差 ~160ms，改后 ~45ms）
- 诚实边界：65ms 不是「一档」。本轮测出的冷开 ~1.3s 是**170 轮压力夹具**的上限，由「RPC + 夹具 4MB 响应 + 首次挂载」共同决定；真实线程（10 轮 / 543 items）不在此量级 —— 但同样说明**单次渲染成本已无可压空间**，详见 §七。

## 六、验证

- `vue-tsc --noEmit` 0
- 单测 **1083/1083 / 98 文件**（+2：`useDesktopMessageHistoryLoading.snapshotDelay.test.ts`）
  - 反跑证明非空：把调用改回同步 `saveThreadMessageSnapshot` ⇒ 两条用例**都失败**；改回延后 ⇒ 全绿
- 闸门：`check-ui-contract` **60**、`check-hot-window` **6**、`check-bottom-lock` **4**、`check-fonts` **13**、`check-message-media-surfaces` **44**、`check-agent-note-surfaces` **56**、`check-theme` **15**（对 `vite preview` 产物）
- 构建：`vite build` + `tsup` 均 0

## 七、下一步 —— **已按历史核对修正**（原文三条建议两项已被覆盖）

> 本节初稿把三件事列为「待决策」。用户追问「之前不是有相似改动吗」，复核后确认：
> 两项**已经存在**（一项已做完、一项代码已落地），第三项有**已回退的反例**。

| 建议 | 历史对应物 | 现状 |
|---|---|---|
| ~~桥层 payload 瘦身~~ | `src/server/bridge/threadResumeTurnPage.ts`（round-84） | **已做完，无余量**。`thread/resume {threadId}` 已改写成 `{excludeTurns, initialTurnsPage:{limit, sortDirection:"desc", itemsView:"full"}}`，实测 2118ms/12.12MB → **486ms/4.29MB**；页大小 = `THREAD_RESPONSE_TURN_LIMIT = 10`（`src/server/bridge/core.ts:191`）⇒ **响应只带 10 轮**。§五 里说的「4MB JSON.parse」是**探针夹具自己造的**（170 轮 BODY），不是真实响应。 |
| 变量高度虚拟列表 | `src/utils/turnVirtualizer.ts`（round-148 批 0，298 行 + 27 例） | **代码已在仓库，零调用点**。round-153 批 3a 的距底坐标就是给它铺的路；但 `sections/batch3-virtualization-assessment.md` §六 明确「不搬 `virtualized-turn-list` 28.7KB 实现」（与桌面端分组层深度耦合、我方不同构），批 3b/3c 改走**分层窗口化**并已落地（r163 折叠卡 + r165 hot 轮，含 RO 实测缓存与 sh 守恒）。接线虚拟化 = **推翻这两轮**，属回退性重做，不是增量。 |
| 动态 hot 起点 | `HOT_TURNS = 30` 本就是 `warmPagination()` 的入参（`ThreadConversation.vue:1102 / :1244`） | **参数化已完成**，改的是推导策略而非新增能力。而本轮试过的 `tailOnly`（首帧只渲染尾部 8 块）就是它的近亲 ⇒ **已回退，仅省 47ms**。 |

### 规模修正（比上面三条更要紧）

真实最重线程夹具 `tmp/r166-real-read.json` = **10 轮 / 543 items / 1.38 MB**；本轮 170 轮是把它**复制 17 个周期**造的压力夹具。而 resume 只返回 10 轮 ⇒ **真实冷开的 hot 区就是 10 轮**，`tailOnly` 的触发门槛（> 30 轮）根本达不到。也就是说：

- 第 1、2 项在**真实数据规模下收益接近零**（没有几十轮被强制渲染可省）；
- 本轮测出的「首屏 895 行 / 单帧 patch 250ms」是**极端压力形态**，真实线程约 500–800 行；
- 真实冷开慢的位置是 **app-server 侧 hydrate（round-84 实测 486ms）** 与首次挂载固定开销 —— 前者纯前端无解，后者本轮已证与行数弱相关。

**结论：冷开这条线到此为止，不再立项。** 若要继续改善打开体验，方向应转为「减少必须等待的次数」（快照先上屏，r178 已做；`recentResumeThreadById` 合并已有），而不是压单次渲染成本。
