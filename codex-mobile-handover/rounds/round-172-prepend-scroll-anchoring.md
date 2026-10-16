# round-172 · 前置插入滚动保位：锚定元素增量补偿 + `overflow-anchor: none`（对齐桌面端正解）

> **性质**：产品侧修复（`ThreadConversation.vue` 单文件）。承接本地分叉轮「round-164」的验证成果，
> 在远端架构（3c 已落地、RO 锁底已确定性收口）上重做。分叉背景见 §五。
> **判据书**：`sections/desktop-parity-decision.md` §三·B「加载历史保位 / 原生滚动锚定」两行的收口。

## 一、结论先行

| 项 | 改前 | 改后 |
| --- | --- | --- |
| `loadMoreAbove` 保位 | `scrollTop = prev + (scrollHeight − prevScrollHeight)`（**整页总高度差**）——`await` 期间底部流式增长时误补 | 锚定元素增量位移补偿 |
| `nextColdPage` 保位 | **零补偿**（浏览器原生滚动锚定隐形兜底，行为不可预测） | 同上（与 `loadMoreAbove` 共用一套机制） |
| `.conversation-list` | 原生滚动锚定开着，与自有补偿并存（双重补偿风险） | 显式 `overflow-anchor: none`，保位唯一来源 = 自有补偿 |

## 二、实现（桌面端取证驱动）

桌面端新版（MSIX `OpenAI.Codex 26.1013.3656.0`，asar 全量取证于 `tmp/r165-assets/`）确认三件事：

1. **`overflow-anchor: none` 是前提不是优化**：CSS `.reply-chain-transcript{overflow-anchor:none}` + 滚动容器 Tailwind `[overflow-anchor:none]` + 控制器挂载/卸载命令式管理；
2. **补偿算自新旧布局数据**（ResizeObserver 实测缓存 → 布局差分 → `computeScrollDistanceForAnchor` 查表），结构性免疫多次 flush 与节点替换；
3. 纯函数层 `thread-virtualizer-e1964ca5c039.js` 自 round-148 以来哈希未变。

本仓的落地是第 2 条的 **DOM 读近似**（我们的渲染是模板窗口化 + spacer 记账，不是绝对定位虚拟化，查表布局层不存在）：

- **锚** = hot 区顶哨兵 `li.conversation-hot-anchor`（批 3c 恒渲染、h-0、顶边 = warm 区底界；keyed v-for 前插不重建既有节点 ⇒ cold/warm 窗口滑动、时间分隔栏重挂都动不了它），回退首个内容 `li.conversation-item`。在前插点**下方** ⇒ 位移 = 插入高度，且对流式追加免疫；
- **增量多结算**（nextTick → rAF×2 → nextTick 各结一次「自上次结算以来的位移」）：真机诊断（round-164，本地线）3b 窗口化把 cold 前插拆成**两次 flush**（flush1 带过期窗口计划渲染，sh 先短少 66px 再补足），一次性结算落在两 flush 之间会按中间态补错；每步基线取「写入后」坐标（否则重复补偿，实测超补 66px = 分隔栏重挂位移量）；
- **待结算槽位去重**：贴顶甩动时 `onConversationScroll` 连发 `nextColdPage`，Vue 渲染批处理下多次捕获时 DOM 未变 ⇒ 只记一次锚；
- 线程切换守卫 + `onBeforeUnmount` 丢弃待结算槽位。

## 三、验证

- 产品侧：`vue-tsc --noEmit` 退 0 · `vitest run` **1053/1053 / 92 文件** · `vite build` 退 0；
- 真机探针（playwright + msedge headless + 隔离 home + 合成 60 轮，`tmp/r172-verify.cjs`）：
  P0 `overflow-anchor`=none；**S1 冷翻页**锚漂移 **−0.5px**、`scrollTop` 终值 300→1105（= 300+插入 805，精确）、sh 9222→10027；**S2 甩顶自动连翻**（独立 context）漂移 399.5 ≈ 期望 400（= 插入 805 − 用户自滚 405，自洽）、`scrollTop` 终值 805 = 插入量；S3 连发滚动 sh 稳定；S4 跳到最新 dist=0；pageerror 0。

## 四、诚实边界

- DOM 读近似 vs 桌面查表：哨兵恒在，故节点替换风险已被排除；但「锚不可用」的极端时序（热区清空/重建）退化为重立基线放弃本段位移（最差 = 旧行为）；
- 查表式（`turnVirtualizer.computeScrollDistanceForAnchor` + 布局差分）仍是绝对定位虚拟化时代的终局，登记不弃；
- 补偿对「前插 + 贴底跟随」并发场景依赖锁底（round-164 远端 RO 锁底）先行：贴底时本机制让位（`delta` 通常为 0，锁底接管），未单独构造并发流式+前插的真机用例；
- 真实 170 轮线程未复验（沿用 round-166 合成/真实夹具结论，本轮改动不触碰窗口层）。

## 五、分叉说明（round-164 本地线 → 本轮）

round-164 本地线（代码 `0d4df989` + docs `6f0742a2`，未推送）与本轮目的相同，但建在 3c 之前的架构上，且锚用 `li.conversation-turn`（远端模板中该类名已不存在）。推送时发现远端已推进 round-164~171（含 3c、批 4 两半、v0.1.133 发版），经用户裁决**弃本地线**（reset 对齐），验证成果（两次 flush 诊断、基线取写入后坐标、探针场景集）移植进本轮。锚升级为哨兵，回退选择器改 `li.conversation-item`。
