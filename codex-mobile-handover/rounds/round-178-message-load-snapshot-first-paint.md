# round-178：消息加载慢 —— 快照先上屏 + 渐进归一化

## 一、背景

用户报障：**「我们的产品消息加载很慢，而 codex 桌面版 chatgpt 加载消息列表就很快」**。

先做代码路径分析（本轮不改代码前的结论）：

1. `selectThread` → `loadMessages` → `thread/resume`（桥侧 round-84 起已是有界读，486ms/4.29MB）→ `normalizeThreadMessagesV2`（**同步**遍历全部 turn/item）→ `merge` → Vue 渲染。
2. **消息正文零本地持久化**：`localStorage` 只存 reasoning / 轮耗时 / 已读 / 线程滚动状态（round-173）等**元数据**，正文每次打开都要等完整 RPC 往返 + 归一化 + 首屏渲染才画第一帧。
3. 桌面端（ChatGPT 式）是「本地缓存先上屏 + 后台静默刷新」，所以体感瞬时——差距不在 RPC 快慢，在**首帧依赖数据**。

## 二、实测分解（诊断，`tmp/r178-load-timing.cjs`）

夹具 = round-166 的「真实数据形态」线程：真实 home 里最重线程的最新 10 轮 / 554 真实 items 复制 17 周期 = **170 轮 / ~9400 items / ~4MB JSON**。

| 场景 | 到首行上屏 | 分解 |
| --- | --- | --- |
| 冷开（首屏） | ≈1.8s | RPC ≈0.6s + 客户端 ≈1.2s（4MB `JSON.parse` + 同步归一化 + 首屏全量渲染 1035 行） |
| 人为把 RPC 拖慢 800ms | ≈2.5s | **1:1 叠加**，等待期屏幕上什么都不画 |
| 会话内切走再切回 | ≈1.6s | 无新 RPC（`RECENT_THREAD_MESSAGE_LOAD_REUSE_MS` 复用生效），但**纯重渲染**（卸载丢窗口化缓存） |
| 刷新后重开 | ≈1.8s | 全冷，与首次相同 |

另外用一个对照实验确认了「渲染不是大头」：手工播种 round-173 的 hot 高度种子后，首屏行数 1028 → 58（窗口化生效），**但到首行时间几乎不变** ⇒ 大头在「等 RPC + 同步归一化」。

## 三、改动

### 1. 消息快照「先上屏」（`useDesktopStatePersistence.ts` + `useDesktopMessageHistoryLoading.ts`）

- 新增 `codex-web-local.thread-message-snapshot.v1`：每线程 `{ v, savedAt, hasMoreOlder, messages, turnIndexByTurnId }`。
- 预算：**单线程 384KB**（超预算从**最旧端**裁——首屏贴底看到的是最新内容），全表按 `savedAt` **LRU 6 个线程**；条目损坏 / 版本不符 / 空消息表一律读回 `null`（不尝试迁移）。
- 打开线程时（仅当本地尚无历史、线程**不在进行中**、有快照）：先把快照写进 `persistedMessagesByThreadId` 并补 `turnIndexByTurnId` / `hasMoreOlder`，**RPC 仍在后台跑**，返回后既有 `merge` 按 id 去重、服务端为准 ⇒ 不快照固化内容。
- 加载成功即更新快照（空响应不可信 / 进行中线程跳过）；**回退成功后 `clearThreadMessageSnapshot`**（成功路径 + 本地对齐路径各一处）——否则重开会先把刚被 revert 的轮次画出来（round-143 同类现象，窗口从「一直」缩成「上屏后 1 秒内」）。
- 线程进行中不快照：流式尾部不该用旧内容垫底。

### 2. 渐进归一化（`v2.ts` + `gateway/threads.ts`）

- 把逐轮循环从 `normalizeThreadMessagesV2` 里拆出 `normalizeThreadTurnsRaw`，两条跨轮修正（compaction 折叠 / 归位）收进 `finalizeNormalizedThreadMessages`；全量入口行为不变（`normalizeThreadMessagesV2` = raw + finalize）。
- 新增 `normalizeThreadMessagesV2Progressive(payload, baseTurnIndex, onPartialMessages)`：列表是**贴底跟随**的，所以分片顺序「从最新往旧」——先归一化最新 `THREAD_NORMALIZE_CHUNK_TURNS`（30，= hot 窗口轮数）轮立刻回调上屏，余量按片补齐（每片 `setTimeout(0)` 让出主线程），结束时对累积结果跑一次全局修正。返回值与全量入口**逐位一致**（`turnIndex` 用 `baseTurnIndex + from` 对齐）。
- `resumeThread(threadId, onPartialMessages?)` 增可选第二参（既有调用点零改动）；`loadMessages` 传回调 → 每片 `setPersistedMessagesForThread`。

### 3. 测试

- `v2.progressive.test.ts`（4 例）：分片首片是最新 30 轮 / 最终结果与全量逐位一致（含 compaction 折叠与归位）/ 无回调或 ≤1 片时走同步路径 / 回调次数 = ⌈turns/30⌉。
- `useDesktopStatePersistence.threadSnapshot.test.ts`（7 例）：读写往返 / 损坏与版本不符 / LRU / 超预算裁最旧 / 空表 no-op / clear 只丢目标线程 / clear 未知线程不写盘。
- `useDesktopState.threadSnapshot.test.ts`（3 例）：有快照 ⇒ RPC 未返回前已上屏、返回后收敛到服务端内容 / 无快照 ⇒ 不写占位 / 进行中线程 ⇒ 快照不参与。

## 四、验证

- `vue-tsc --noEmit` 退 0 · `pnpm run test:unit` **1081/1081 / 97 文件**（round-177 基线 1067 + 新 14）· `vite build` + `tsup` 退 0
- 真机探针 `tmp/r178-snapshot-probe.cjs`（Chromium，真实 UI + 页面级 RPC 拦截，同一 context 连续四场景，两轮均 PASS）：

| 场景 | 到首行 | 关键关系 |
| --- | --- | --- |
| A 冷开（无快照、无延迟） | 1.0–1.6s | 首屏 1035 行（首屏全量渲染，与 r165 设计一致） |
| B **重开（有快照、RPC 拖慢 800ms）** | **0.42–1.06s** | **在 RPC 返回前 1.2–1.7s 已上屏**，首屏 148 行（窗口化） |
| C 重开（有快照、无延迟） | 0.45–0.94s | 在 RPC 返回前 0.4–0.76s 已上屏 |
| D 反向对照（清掉快照、同样 800ms） | 2.2–2.6s | 必须等 RPC 返回后 0.36–0.62s 才上屏 |

  D 是**反跑证明**：同一份夹具、同样的延迟，仅去掉快照就退回「等 RPC」——B 的提前上屏确实来自快照，不是拦截/延迟失效。收敛行数四场景一致（58），快照不固化内容。
- 浏览器闸门（dev 5173）：ui-contract **60/60**、hot-window **6/6**、bottom-lock **4/4**、fonts **13/13**、agent-note **56/56**、message-media **44/44**；theme 对 `vite preview` 构建产物 **15/15**。

## 五、诚实边界

- **重开（最常见场景）收益 3–5×，冷开只是小幅改善**：冷开的尾部仍是「加载完成后首屏全量渲染一轮再窗口化」（r165 设计），round-173 的高度种子存在时会直接窗口化——首次打开无种子，所以仍有 ~1s 级尾延迟。要再压需要「窗口化首屏」，属独立议题。
- 快照是**纯前端优化**：`localStorage` 配额/隐私模式失败一律静默退回旧路径（不影响正确性）；刷新第一次打开仍要全冷（首次打开该线程时还没有快照）。
- 快照与真实状态之间允许「一帧旧内容」：发送新消息后快照要等下次加载才更新（stale-while-revalidate），回退已显式清除。
- 夹具轮数是复制的（原始 31MB 线程已不在本机）；估算常量（68.5/34）与首屏行数绑定当前字体/缩放档位。探针留在 `tmp/`，非 CI 资产。
- 未复用 `turnVirtualizer.ts`（批 0 遗留零调用点），本轮不动它。
