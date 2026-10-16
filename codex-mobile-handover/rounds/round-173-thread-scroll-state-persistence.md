# round-173：按线程滚动状态跨会话持久化（阅读位恢复）

## 一、结论先行

| 项 | 内容 |
| --- | --- |
| 性质 | 产品侧功能（桌面端 parity 表「滚动状态持久化」行收口，26.1013 asar 取证驱动） |
| 改动 | `useDesktopStatePersistence.ts`（+~100 行：load/save/normalize/LRU）、`ThreadConversation.vue`（+~150/−8）、新增单测 7 例 |
| 验证 | vue-tsc 0 · 单测 **1060/1060**（93 文件）· build 0 · ui-contract 59/59 · 真机 5 场景全 PASS · 三道文档闸门全绿 |
| 提交 | 代码笔 **本段所在提交** 之上一笔（见台账），docs 笔 **本段所在提交** |

桌面端（`virtualized-turn-list` 的 `xe` 快照函数）按线程存 `{renderedWindow:{anchorKey,count}, turnHeightsByKey}` 并在重开时播种实测高度缓存、按 anchorKey 重立窗口——「重开不先估后跳」。我们此前**完全没有**：重开一律贴底跟随，阅读位与冷页深度全丢。

## 二、设计（移植到本仓架构的等价物）

**存什么**（`codex-web-local.thread-scroll-state.v1`，LRU 24 线程，版本字段 v1）：

- `coldPage` + `expandedWarmTurns` —— warm 层状态（`WarmLayerState` 本就全可序列化）；
- `distanceFromBottomPx` —— 阅读位（距底坐标系，round-153 批 3a）；
- `hotHeights` —— 批 3c RO 实测高度缓存种子（≤200 键）。

**为什么恢复这么便宜**：warm 区 spacer 是实测常量（68.5/42/34 + gap）⇒ 恢复冷页深度后布局确定性重建，**不需要展开任何卡**；高度种子只影响窗口边界选取（未测块强制入窗、RO 重测真实值），脏种子无害；阅读位用距底坐标直接写回（`getScrollTopForDistanceFromBottomPx`），天然免疫流式增长方向。

**语义**：离开时在贴底态（≤16px）→ 保持旧「贴底跟随」行为不变；不在贴底态 → 关一次 autoFollow，按存档距底读数恢复阅读位（连补 4 帧 rAF，距底写法每帧重算收敛，无需记基线）。

## 三、实现要点与探针抓出的两个真坑

1. **首次挂载不走 activeThreadId watcher**（无变化）⇒ 恢复必须同时挂在 `onMounted` 与 watcher，抽成 `initializeThreadScrollState()` 共用。round-127 的 ui-contract 闸门（挂载回调 240 字符窗口内须有 `scheduleConversationScroll`）顺带回归——重排 onMounted 语句顺序满足。
2. **节流丢尾**（探针 S1 实证）：开线程的贴底保存占住 2s 窗口后，随后的滚动保存被静默丢弃——真正落盘的只剩导航时 pagehide 冲刷（恰好兜住所以此前不可见）。修为带尾沿的节流（窗口内触发排一个尾沿定时器）。
3. **切走线程的冲刷时机**：sync flush watcher 在 props 已变而 DOM 未更新、warmLayerState 未重建的窗口内运行——此刻容器度量与 warm 层都还属于旧线程，是唯一能正确代旧线程落盘的时机（post flush 时 DOM 已换）。
4. **探针工程坑**（登记，工具链层面）：旧应用页的 pagehide flush 落在**新文档 init 脚本之后**、应用启动之前 ⇒ 污染注入必须先经 `about:blank` 让旧页退场；`context.addInitScript` 对已存在 page 的后续导航**不生效**（实测），须 page 级注册。

## 四、验证（真机 5 场景，`tmp/r173-verify.cjs`，隔离 home + 合成 60 轮 + msedge headless）

| # | 场景 | 断言 | 结果 |
| --- | --- | --- | --- |
| S1 | 中部阅读位恢复 | 滚到距底 800 → 存档 800 → 重载 → 800（drift 0）且不回落贴底 | PASS |
| S2 | 贴底态重开 | 距底 0，跟随语义不变 | PASS |
| S3 | 冷页深度恢复 | 甩顶连翻 → 存档 coldPage 1 → 重载 → warm 卡数 18=18、sh 10027=10027 | PASS |
| S4 | pagehide 冲刷 | 节流窗口内合成 pagehide → 重载 → 1200 精确恢复 | PASS |
| S5 | 坏数据回落 | boot 前注入 `'{corrupted'` → 回落贴底（0），无 pageerror，应用自写干净条目 | PASS |

产品闸门：`vue-tsc` 0 · vitest **1060/1060**（93 文件，+7）· `vite build` 0 · ui-contract 59/59。

## 五、诚实边界

- **流式中的恢复**：inProgress 线程重开时若存档为贴底态走跟随（与旧一致）；若存档为非贴底态会恢复到旧阅读位且不跟随——未构造「打开时 turn 正在跑」的真机用例（隔离 home 无真实流式夹具），登记待真实场景复验；
- 存档为**浏览器本地**（localStorage），不跨设备/浏览器同步（桌面端同款口径）；
- 高度种子无内容指纹校验：内容变更后的种子只影响窗口边界选取（RO 重测），不影响 spacer 正确性；
- 真实 170 轮线程未复验（沿用 round-166 夹具结论，本轮不触碰窗口层）。

## 六、parity 对账

`sections/desktop-parity-decision.md`「滚动状态持久化」行改判：**打平**（机制同构：他们存 renderedWindow+高度表，我们存冷页深度+距底读数+高度种子；都是浏览器本地、跨会话恢复）。
