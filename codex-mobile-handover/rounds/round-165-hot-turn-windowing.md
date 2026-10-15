# round-165 · 批 3c：hot 轮窗口化（测量层驱动的块窗口）

日期：2026-10-15。批 3 三步走的最后一步（3a round-153 / 3b round-163 / **3c 本轮**）。

## 一、设计与动机

3b 只窗口化「折叠态 warm 块」——因为折叠卡高度是**实测常量**（69/42）。hot 轮是完整消息
渲染（代码块/图片/长文本），高度不可预估，评估 §五 标了**高风险**。本轮的解法不是「估得
更准」，而是**换高度来源**：round-164 的 ResizeObserver 内容观察器兼任测量层，hot 块高度
来自**实测缓存**，未测块强制入窗（真实 DOM），spacer 求和只含实测值 ⇒ scrollHeight 守恒。

- 纯函数层 `src/utils/hotTurnWindow.ts`（与 warmTurnWindow 同构的块窗口机制）+ **16 例单测**
  （含对照扫描：25 种窗口组合下「哨兵→底锚距离 = 全渲染」逐例相等）。
- 组件接线 `ThreadConversation.vue`（约 +150 行）。
- 新闸门 `scripts/check-hot-window.cjs`（6 场景含反跑）。

## 二、关键设计点

1. **缓存 key = `turn-<首条 user 消息 id>`**（`buildTurnRenderGroups` 的 group.key），跨追加
   稳定；失效三路：线程切换（watch activeThreadId）、容器宽度变化（RO 容器条目）、
   **待载媒体守卫**（块内有未 `complete` 的 `<img>` ⇒ 不缓存，保持强制入窗）。
2. **坐标不依赖 scrollHeight 算术**：hot 区底边 = `bottomAnchorRef` 实时锚（底锚恒在 DOM，
   LiveOverlayItem 高度天然被排除在 hot 区外）；hot 区顶界 = 新增的 **0 高哨兵 li**
   （`.conversation-hot-anchor`，恒渲染）。
3. **哨兵位值与 3b 旧锚完全一致**（warm 末 li 底 + gap）⇒ `recomputeWarmWindow` 的锚从
   「首个 li.conversation-turn」改为哨兵（hot 块被跳过后旧锚会失真），warm 侧 spacer 公式
   **零改动**（哨兵多出的 gap 在全渲染与窗口化两侧等量出现）。
4. **窗顶用占位 li 而非 3b 的 margin 方案**：hot 块首条 li 可能是 ThreadTurn 根（组件双根
   模板，attr/style 无法透传）⇒ 公式从 `Σh + k·g` 变为 `Σh + (k−1)·g`（占位两侧各一 gap，
   推导见 computeHotSpacers 注释；单测对照扫描覆盖）。
5. **jumpToQuestion**：hot 区目标轮写入 `forcedHotTurnKeys` 强制入窗 ⇒ `getElementById`
   语义原样保留（锚点 id 在 turn 内部的 user 消息 li 上）。

## 三、开发路上踩掉的三个坑（都已写进代码注释或本文件）

1. **spacer 被 flex 压成 0 高**（`style height: 7709px` 但盒子 0）——round-163 warm spacer
   的**同一个坑复踩**（当时加了 `shrink-0` 并写进注释，本轮漏读）⇒ `.conversation-hot-spacer-*`
   补 `shrink-0`。症状极具迷惑性：贴底 sh 从 9278 塌缩到 1568 但 dist 仍为 0（scrollTop 被钳位）。
2. **RO 终末事件引发窗口化↔全量振荡**：被移除的 li 会收到 RO 终末条目（dataset 还在）⇒
   测量发现「不在 DOM」⇒ 误判失效**删除缓存** ⇒ 全量重渲 ⇒ 重测回来 ⇒ 再窗口化……
   实测 2 秒内 58 次测量循环。修法：**「不在 DOM」= 无信息**（跳过块本来就不在 DOM），
   只有「在 DOM 但量不出有效高度」才删缓存；`onContentResize` 忽略 `!isConnected` 条目。
3. **dev 冷启动 domcontentloaded > 20s**（round-164 已登记）⇒ 闸门 goto 60s + 重试一次。
   本轮 fonts 闸门还因此假失败一次（新起 server 首个命中），重跑即过。

## 四、验证矩阵（全绿）

- `vue-tsc --noEmit` **0**；全量单测 **1035/1035（89 文件）**（+16 hotTurnWindow）。
- **新闸门 `check-hot-window` 6/6**（合成 30 轮 = 恰好全 hot）：
  贴底窗口化生效（渲染 5/30 轮、sh=9278、dist=0）；上滚 2000px ⇒ dist 恰好 +2000（turns=9）；
  滚到顶再回底 sh 恒 9278；JumpBar 跳 hot 区首轮锚点落点 **12.0px 精确**；
  反跑（禁 RO）⇒ turns=30 全量渲染（证明非空）且其 sh 与窗口化态一致（±2px）。
- 回归：`check-bottom-lock` 4/4、`check-fonts` 13/13、`check-agent-note-surfaces` 56/56、
  `check-message-media-surfaces` 44/44、`check-ui-contract` 59/59、`check-theme` **15/15**
  （对 `vite preview` 构建产物跑）。
- `vite build` 0（17.25s）。

## 五、诚实边界

- **对照扫描是纯函数层面的**；浏览器里的 sh 守恒断言用了 ±2px 容差（子像素 LayoutUnit
  1/64px 的累加 + 测量快照时点差），不是逐位相等（3b 的「逐位」成立依赖常量精确，
  3c 的实测值天然带快照噪声）。
- **高度缓存是内存态**（不持久化）⇒ 每次刷新首屏全量渲染一轮再窗口化（贴底打开时
  用户看到的就是底部，无视觉影响；RO 首测 + 重算 ≈ 2 帧）。
- **视频/iframe 等晚到媒体**只有 img 守卫（img.complete）；`<video>` 无等效同步信号，
  若出现晚到增高由 round-164 锁底兜底（贴底态），非贴底态可能出现单次漂移——登记为边界。
- warm 区为空（≤30 轮短线程）时哨兵照常渲染，几何基线整体 +1 个 gap（全渲染/窗口化
  两侧等量）⇒ 3b 的「逐位守恒」不变式不受影响（对照物同时偏移）。
- 未动 `src/server/**` ⇒ `SHARED_BRIDGE_VERSION` 不 bump；未 bump 版本 / tag / Release。
- 真实 173 轮大线程未实测（与 3b 同一边界）；模型切换分割栏 44px 估算仍未实测（3b 登记）。
