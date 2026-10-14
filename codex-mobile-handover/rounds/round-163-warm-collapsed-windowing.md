# round-163：批 3b —— 折叠态 warm 轮窗口化（本仓重新开工产品侧的第一轮）

> 用户指令「继续产品侧的工作」。承接批 3 评估（[sections/batch3-virtualization-assessment.md](../sections/batch3-virtualization-assessment.md)
> §五）的第二步 3b。round-158~162 连续五轮元工作之后，本轮回到产品代码：**ThreadConversation.vue +162/−1、
> 新增纯函数模块与 21 例单测**。

---

## 一、结论先行

| 项 | 结果 |
| --- | --- |
| 评估 §七 前置测量（折叠卡高度偏差） | **偏差 0** —— 高度是精确常量，3b 直接上 |
| 3b 实现 | ✅ 落地（`b9c81057`），只窗口化折叠态 warm 块 |
| 真机验证（7 场景） | 全过：贴底 / 滑动守恒 / 扩页 / 跳转 / 展开 / 折叠 / 跳到最新 |
| scrollHeight 守恒 | **逐位相等**：22 档滑动扫描恒 9210（= 全量基线）；扩页态恒 10015 |
| 产品侧验证 | vue-tsc 0 · 单测 **1019/1019**（88 文件，+21）· vite build 0 |

---

## 二、§七 前置测量（评估说「这一条数据决定 3b 是低风险还是又一个 round-143」）

**方法**（全部可复跑）：隔离空 home（`CODEX_HOME=<空目录> node scripts/dev.cjs --port 5173 --strictPort`）
+ 合成 60 轮线程（拦 `thread/read`，响应形状与 `src/api/normalizers/v2.test.ts` 的合成夹具逐字段对齐，
含 clientId / mcpToolCall / startedAt 时间跳跃以驱动时间分隔栏）+ 真实 Edge headless（1440×950，dpr 1）。

**实测读数**（`window.__R163_MEASURE()`，30 张折叠卡样本）：

| 元素 | 高度 | 备注 |
| --- | --- | --- |
| 折叠卡（带 assistant 预览行） | **68.5px** | offsetHeight 取整 69；**分数值是刻意的**，见 §四 |
| 折叠卡（纯 head，无预览行） | 42px | 与文本长度无关——单行 truncate 成立，80 字长文本不换行 |
| 时间分隔栏 li | 34px | 恒定 |
| 冷区按钮 li | 54px | 恒定 |
| 相邻 li 间隙 | 12px | = 列表 `gap-2 sm:gap-3` 的 sm 档；运行时取 getComputedStyle，兼容移动端 8px |

**判决：偏差 0 ⇒「近似常量」前提成立 ⇒ 3b 直接上。** 评估担心的「CJK 换行 / 字体回退破坏单行前提」没有发生。

## 三、实现（`b9c81057`）

**设计要点**（两条让 3b 的复杂度远低于评估担心的水平）：

1. **只窗口化折叠卡；展开块强制入窗；hot 区恒全量。**
   ⇒ `scrollToBottom` / `isAtBottom` / `loadMoreAbove` 补偿 / 图片补锁底等**全部滚动原语照旧操作真实 DOM，一行未改**。
   必解 2（`jumpToQuestion` 的 getElementById 在窗口化后失效）由「展开 ⇒ 强制入窗」消解：jump 必然展开目标轮
   ⇒ 锚点必在 DOM ⇒ 既有语义（顶边对齐 + 12px）原样保留，无需布局算距。
2. **被跳过的块全是折叠卡 ⇒ 高度是常量 ⇒ spacer 把 scrollHeight 补到与全量渲染逐位一致。**
   展开块恒在窗内（真实高度在 DOM），展开块估算（280 兜底）只影响窗口边界选取，由 overscan 吸收。

**改动构成**：

- 新增 `src/utils/warmTurnWindow.ts`：实测常量 + `estimateWarmBlockHeightPx` / `buildWarmBlockLayout`
  （距底坐标）+ `computeWarmVisibleWindow`（不钳位——视口可以完全落在 warm 区外）+ `computeWarmSpacers`。
- 新增 `src/utils/warmTurnWindow.test.ts`：21 例（常量 / 布局 / 窗口 / spacer 公式对拍 / 展开块强制入窗 / 空表）。
- `ThreadConversation.vue`（+162/−1）：`warmBlockSpecs` ← `renderTurns`；窗口重算三路汇合
  （`onConversationScroll` / `scheduleConversationScroll` 的 rAF / `watch(warmBlockSpecs)`，都过 rAF 节流）；
  模板加 `<template v-if>` 守卫（warm 块窗口内才渲染）+ 窗顶 margin（挂块首 li：timeDivider → leadingDivider
  首条 → 卡片 li）+ 窗底占位 `<li>`（`shrink-0`）；`jumpToQuestion` 展开目标轮后**同步**重算一次窗口（时序竞态）。

**运行时锚**：warm 区底边取「热区首个 `li.conversation-turn` 顶边」（实时 DOM）⇒ 估算漂移不随块数累积；
窗口选择与 spacer 公式对首个 hot 轮的分隔栏 li 不敏感（推导上两侧相消）。

## 四、真机验证（7 场景全过，pageerror 0）

| 场景 | 结果 |
| --- | --- |
| S1 贴底初态 | 20 折叠卡 → **渲染 1 张**（margin 1660.5），dist=0，DOM li 62→39 |
| S2 滚到 warm 中部 | 17 张，sh 恒 9210 |
| S3 滚到顶（自动扩冷区页） | 28 张 + 窗底占位 149，sh 10015 = 扩页全量基线 |
| S4 冷区扩页 | 经滑动扫描覆盖（st≤899 自动触发，sh 精确 +10 卡 × 80.5） |
| S5 JumpBar 跳 cold 区第 0 轮 | 锚点存在、落点 **12px 精确**（既有语义保留） |
| S6 展开/折叠往返 | 视口不跳（st 34 恒），sh ±126 与内容一致，展开内容渲染正常 |
| S7 跳到最新 | dist=0 |
| 滑动守恒（A 扫描） | st 8487→846 共 22 档，scrollHeight 恒 9210（**逐位等于全量基线**） |

## 五、本轮踩的三个坑（都已修并有实测佐证）

1. **先加 margin、忘了条件渲染**：第一版只写了 spacer/margin，没有给 warm 块加窗口守卫
   ⇒ 全量 DOM + 巨大 margin，scrollHeight 虚增 1657px、scrollTop 被锚定机制拽走。教训：**「窗口化」的主语是渲染集，spacer 只是它的记账**。
2. **占位 li 被 flex 压成 0 高**：列表是 `flex flex-col` + 溢出滚动，空 li 的 min-content 为 0、
   `flex-shrink:1` 默认生效，唯一能被压缩的就是它（卡片有内容缩不动）⇒ `shrink-0` 必须。症状：style 里 219px、offsetHeight 0。
3. **常量必须用分数 68.5 而非取整的 69**：真实布局高度 68.5（边框半像素级），整值让窗口滑动时
   每卡 +0.5px、14 卡累计 7px 漂移；换分数常量后 22 档扫描逐位守恒。

另有一处推导返工记入 §六：spacer 公式首版把「有锚 / 无锚」当成两种情形各减一个 gap，真机量出**系统性 −12px**
（少算一个 flex gap）——重数一遍 gap（被跳过块两侧共 k+1 个）后两种情形**同式**：margin = Σh + k·g，
占位 = Σh + (k−1)·g，`hasRenderedAnchorAbove` 参数整个删掉。

## 六、诚实边界

- 展开块出窗时的估算（280 兜底）只影响窗口边界选取（ cosmetic，overscan 吸收）；**spacer 精确性不依赖它**
  （展开块恒在窗内、不进被跳过集合）。
- 模型切换分割栏（`MODEL_SWITCH_DIVIDER_HEIGHT_PX = 44`）**未实测**——合成线程无法产生 modelSwitch 消息；
  warm 区出现切换分割栏时窗口边界有 ~±44px 软偏差（overscan 吸收），spacer 精确性同样不受影响
  （它只 sums 被跳过的折叠卡……带分割栏的块若有，其估算 44 与真实值的差会计入 scrollHeight 漂移，
  幅度 = 该差值 × 块数，罕见场景）。
- 常量绑定当前字体/字号/缩放：换字体、用户改浏览器缩放后须按 §二 的复测法重测（`warmTurnWindow.ts` 顶部有配方）；
  漂移表现为 scrollHeight 微差与跳转落点偏差，无功能损坏。
- **3c（hot 轮窗口化）未开工**：风险高（评估 §五），且本轮未动 hot 区。
- 真机样本是合成线程（60 轮），真实 173 轮线程的 warm 区构成（真实工具卡/分割栏密度）未验；
  长线程首屏（打开即贴底）路径已由 S1 覆盖。
- 未 bump 版本、未 tag / Release；`SHARED_BRIDGE_VERSION` 未 bump（未碰 `src/server/**`）。
- 期间 dev server（隔离 home tmp/r163-home，只读合成）与 headless Edge 进程已全部结束。
