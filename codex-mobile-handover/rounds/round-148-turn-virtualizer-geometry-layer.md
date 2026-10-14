# round-148 · 批 0：把桌面端几何层 `thread-virtualizer` 移植为纯函数模块

> **性质**：**新增文件、不接线**（无任何调用点），属 `sections/desktop-parity-decision.md` §四 的**批 0**。
> **前置**：round-145/146/146b/147 已完成桌面端 `app.asar` 取证；round-148 前半给出逐域判定与五批方案。
> **结论**：桌面端「距底坐标系 + 按行锚定补偿」这套几何算得清、也已落地；**但本轮不改变任何现有行为**。

## 一、为什么先做这一层

我们的列表滚动坐标是 `scrollTop`（从顶部算），加载历史时用整页高度差保位：

```js
container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
// ThreadConversation.vue:1954
```

底部同时在增长时（流式输出），`scrollHeight` 的增量里**既包含锚点之上的增长，也包含锚点之下的增长**，而上面这行把两者一起补掉 ⇒ 视口贴着的内容会跳。桌面端的做法是**锚定到具体某一轮**，只补那一轮之上的变化：

```
新距底 = 旧距底 + (锚点新顶边距底 − 锚点旧顶边距底)
```

这就是本轮移植的东西。先落地纯函数、不接线，是为了**先确认数值与我们的 turn 模型对得上**，再谈改渲染。

## 二、来源与还原

| 项 | 值 |
| --- | --- |
| 原始 chunk | `app.asar` → `webview/assets/thread-virtualizer-e1964ca5c039.js`（**2,131 字节**） |
| 依赖 | 仅 rolldown 运行时（`n(…)` 是它的模块包装）；**零 React、零 DOM、零状态** |
| 导出 | 5 个函数 + 1 个常量（`c = 280`） |
| 展开产物 | `tmp/r148-virtualizer.txt`（48 行） |

函数清单（桌面端导出名 → 我方命名）：

| 桌面端 | 我方导出 | 语义 |
| --- | --- | --- |
| `t` | `buildLayout` | 由 entries 构建整份布局 |
| `n` | `computeVisibleRange` | 距底距离 → 可见行区间 |
| `r` | `getRangeForAnchor` | 按锚点取「等长」区间 |
| `i` | `computeScrollDistanceForAnchor` | **锚定补偿**（防跳动核心） |
| `a` | `computeScrollDistanceForTurn` | 把某轮居中到视口 |
| `c` | `DEFAULT_ESTIMATED_HEIGHT_PX` | 兜底估算高度 **280** |

## 三、逐条语义（本轮读出来的）

### 3.1 高度取值

```
height = max(minHeightPx ?? 0, 实测 ?? 声明估算 ?? 280)
if (pixelScale != null) height = round(height × pixelScale) / pixelScale
```

`minHeightPx` 是**下限**（流式中内容还在长，不允许比已知高度更矮）；DPR 对齐是为了避免半像素抖动。

### 3.2 坐标系

```
bottomOffsetsPx[i] = totalHeightPx − topOffsetsPx[i] − heightsPx[i]
```

`bottomOffsetsPx` 是**递减**的：下标越大（越靠近列表末尾）值越小，末行为 0。整套 API 的入参都叫 `distanceFromBottomPx`（视口**底边**距列表底部的距离），贴底时为 0。

### 3.3 两个二分查找——**方向是关键**（round-147 材料未讲清，本轮补上）

两个数组都是**递减**的，所以「首个值 ≥ target」这种问法在递减序上退化成「要么 0、要么不存在」。真实语义是：

```
firstIndexBelowBottomOffset(offsets, target)   // 桌面端 o()
  = 首个「bottomOffset < target」的下标
  = 「bottomOffset ≥ target」的元素个数
  = 首个**底边已落在视口顶边之下**的行        → 可见区间起点（incl.）

firstIndexWithTopAbove(offsets, heights, target)  // 桌面端 s()
  = 首个「bottomOffset + height ≤ target」的下标
  = 首个**顶边已不高于视口底边**的行            → 可见区间终点（excl.）
```

二者都是手写二分、每帧 O(log n)。实测校验（10 轮 × 100px、视口 200px）：

| 场景 | 起始 | 结束 | 说明 |
| --- | --- | --- | --- |
| 贴底（距底 0） | 8 | 10 | 正好是末尾两轮 |
| 中部（距底 400） | 4 | 6 | 正好是视口内两轮 |
| 贴底 + overscan 2 | 6 | 10 | 只向外扩、不越界 |
| 距底 > 总高 | 0 | — | 钳到顶部 |

`endIndex` 那侧多一层 `max(endCandidate, startCandidate + 1)` 保底，避免出现空区间。

### 3.4 `collapseEmptyRows` 的两条特例

两处硬编码分支，作用是**保住零高度的行**（否则它们会被区间裁掉）：

- 视口顶边已到顶（`viewportTop === totalHeight`）⇒ 起点强制为 0（不吃前导间距）；
- 视口底边已贴底（`viewportBottom === 0`）⇒ 终点强制为 `turnKeys.length`。

同时 `collapseEmptyRows` 改变间距规则：仅在「其上方已有非零高度内容」且「本行高度 > 0」时才产生间距（对照：关闭时除首行外一律产生）。

### 3.5 锚定补偿

```js
before = previousLayout.bottomOffsetsPx[i] + previousLayout.heightsPx[i]   // 旧顶边距底
after  = nextLayout.bottomOffsetsPx[j]     + nextLayout.heightsPx[j]       // 新顶边距底
return max(0, distanceFromBottomPx + after - before)
```

任一布局里找不到锚点行 ⇒ `null`，由调用方决定回退策略。

**注意它的适用面**：这是**保位**路径（用户已离开底部时用）。贴底态应改走「跟随内容增长」，否则底部追加新轮时会把视口往上推（见 §五 测试用例 2）。

## 四、我方落地

**新增 `src/utils/turnVirtualizer.ts`**（298 行，CRLF，与 `src/utils/**` 同风格）：

- 导出 5 个函数 + `DEFAULT_ESTIMATED_HEIGHT_PX` + 5 个类型（`VirtualizerEntry` / `TurnLayout` / `VisibleRange` / 三个 Options）。
- 字段名与桌面端**逐字对齐**（`bottomOffsetsPx` / `gapsBeforePx` / `heightsPx` / `topOffsetsPx` / `totalHeightPx` / `turnIndexByKey` / `turnKeys` / `gapKeys` / `collapseEmptyRows`），便于将来与桌面端数值对拍。
- **唯一有意偏离**：读实测高度时多加了一道 `Number.isFinite` 判断。桌面端直接取 `measuredHeightsByKey[turnKey]`，脏值（字符串 / 对象 / `NaN`）会让 `totalHeightPx` 变成 `NaN`，进而整页算不出可见区间、渲染成空白；退回估算值更安全。**合法输入下与桌面端逐位一致**（测试已覆盖）。
- **未接线**：`src/**` 内除本文件与测试外无任何改动，`git status` 只有 3 个新增项。

**新增 `src/utils/turnVirtualizer.test.ts`**（283 行，CRLF）：**27 例**，覆盖

| 组 | 例数 | 覆盖点 |
| --- | --- | --- |
| `buildLayout` | 10 | 高度三级优先级 / `minHeightPx` 硬下限 / 脏值不污染 / DPR 对齐 / 间距规则与 `gapBeforePx` 覆盖 / `collapseEmptyRows` / `bottomOffsetsPx` 公式 / 同序映射 / `gapKeys` / 空输入 |
| `computeVisibleRange` | 7 | 空列表 / 贴底 / overscan 不越界 / 中部 / 双向钳制 / 视口高于总高 / `collapseEmptyRows` 两条特例 |
| `getRangeForAnchor` | 3 | 等长区间 / 末尾钳制 / 锚点缺失 |
| `computeScrollDistanceForAnchor` | 4 | **锚定补偿 vs 整页高度差** / 底部追加 / 锚点缺失 / ≥0 钳制 |
| `computeScrollDistanceForTurn` | 3 | 居中 / 贴底钳制 / 缺失 |

## 五、最有价值的一条测试：证明「按行锚定」胜过「整页高度差」

```
场景：用户停在距底 300px；此刻**最后一轮**从 100px 流式长到 400px。
变更前：5 轮 × 100px，总高 500
变更后：100/100/100/100/400，总高 800

锚点 t3 的顶边距底：前 = 500−300−100+100 = 200；后 = 800−300−100+100 = 500
⇒ 补偿 = 300 + 500 − 200 = 600
```

- **桌面端做法**：新距底 600 ⇒ 锚点 t3 钉在原地，视口内容**不动**。
- **我方现值**：`scrollTop += (800 − 500) = 300`，而总高也 +300 ⇒ **距底距离留在 300**，锚点上移 300px ⇒ **视口内容跳 300px**。

测试里这两条都写成了断言（`distance === 600`，`distance - 300 === 300`），把「为什么需要这个模块」固化下来。

另一条边界：`distanceFromBottomPx = 0` 且底部追加一轮时，补偿量为 **100**（＝新轮高度）——说明**贴底态不能走这条路径**，必须另配「跟随内容增长」判断，否则会把自己往上推。这条边界已写进函数注释。

## 六、验证

| 项 | 结果 |
| --- | --- |
| 新用例 | `vitest run src/utils/turnVirtualizer.test.ts` ⇒ **27/27 通过** |
| 全量基线 | `vitest run` ⇒ **857 例 / 82 文件全绿**（基线 **830 例 / 81 文件**，正好 **+1 文件 +27 例**） |
| 类型检查 | `vue-tsc --noEmit` ⇒ **EXIT=0** |
| 工作区 | `git status --short` ⇒ 仅 `src/utils/turnVirtualizer.ts`、`src/utils/turnVirtualizer.test.ts` **+** `codex-mobile-handover/sections/desktop-parity-decision.md` 三个新增项，**无任何已有文件被改** |

**未跑**（不需要）：`vite build` / `tsup` —— 本轮未碰 `src/server/**`，且新文件无调用点、不进入任何产物路径；`SHARED_BRIDGE_VERSION` 未 bump。

## 七、复现

```bash
cd /d/code/codex-mobile
# 1) 展开桌面端几何层（2131 B 单行）
node tmp/r146c-dump.cjs tmp/r146c-asar/webview__assets__thread-virtualizer-e1964ca5c039.js pretty > tmp/r148-virtualizer.txt
# 2) 几何层单测
"C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vitest/vitest.mjs run src/utils/turnVirtualizer.test.ts
# 3) 类型检查 + 全量
"C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vitest/vitest.mjs run
```

## 八、诚实边界

1. **未接线 ⇒ 数值尚未在真实列表上验证。** 本轮只证明了「给定高度表，几何算得对」，没有证明「我们的 turn 高度喂进去会得到合适的区间」。后者的前置是批 3 的 `estimatedHeightPx` 取值策略——我们的一轮有三种形态（warm 折叠卡 / 已展开 warm / hot 全量），三者高度差异极大。
2. **桌面端渲染层的常量未搬**：`gapPx = 12`、`viewportHeight 兜底 = 800`、`overscanCount = 2`、测量收敛上限 8 轮、贴底判定 24px —— 这些属于 `virtualized-turn-list` / `thread-scroll-layout`，不在本模块。
3. **`gapKeys` / `collapseEmptyRows` 目前没有消费者**，是照抄过来的完整接口（将来若做「空行折叠」可直接用）。
4. **未启动桌面端做运行对比**；语义来自压缩产物的静态阅读（`tmp/r148-virtualizer.txt` 48 行全文），拼写按导出位置还原，逻辑等价性以 27 例单测自证。
5. **本轮不改变任何现有行为**：`.conversation-list` 的滚动实现一字未动，`scrollTop = prev + (scrollHeight - prevScrollHeight)` 仍在原位（`ThreadConversation.vue:1954`）。
