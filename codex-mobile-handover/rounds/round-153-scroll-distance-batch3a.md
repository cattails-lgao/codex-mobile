# 第一百五十三轮 · 批 3a：滚动位置改走「距底坐标」

> 承接 `codex-mobile-handover/sections/batch3-virtualization-assessment.md`（round-151 评估）§五 的 **3a**。
> 本轮**只做 3a**：把「滚动落点」的表达从「整页写 `scrollTop = scrollHeight` + `scrollIntoView`」
> 换成「距底距离」坐标。**纯前端、行为等价重构**，未碰 `src/server/**`。

---

## 一、为什么先做这一步

评估 §三 列了窗口化的**三个必解**，其中**必解 1** 是：

> `scrollToBottom()` 的 `anchor.scrollIntoView({ block: 'end' })` 要求底部锚点已渲染。
> 窗口化后锚点若在渲染窗口外，这次调用**静默无效**，而 `scrollTop = scrollHeight` 那行仍会生效
> ⇒「跳到一半」的中间态。

⇒ 必须改成**距底坐标驱动**（按布局表算出的距离写 `scrollTop`），锚点在不在 DOM 里都不影响。

3a 就是先把这条坐标**立起来**：读写都走同一个口径，为 3b 的窗口化铺地基。
它单独看**零收益**（评估原话），但它是**唯一能在无浏览器环境验证**的一步。

---

## 二、新增：`src/utils/conversationScrollDistance.ts`（87 行，CRLF）

| 导出 | 语义 |
|---|---|
| `ScrollMetricsPx` | `{ scrollHeightPx, scrollTopPx, clientHeightPx }`（字段带 `...Px` 后缀，与 `turnVirtualizer` 同风格，便于两表对拍） |
| `DEFAULT_BOTTOM_THRESHOLD_PX = 16` | 贴底阈值，从组件内的 `BOTTOM_THRESHOLD_PX` 搬进来（口径唯一化） |
| `getMaxScrollTopPx(m)` | `max(0, scrollHeight − clientHeight)` |
| `getScrollDistanceFromBottomPx(m)` | 距底距离，**钳到 ≥ 0** |
| `isScrollAtBottomPx(m, threshold?)` | `距离 <= 阈值`，默认 16 |
| `clampScrollDistanceFromBottomPx(m, d)` | 把距离钳到 `[0, max]` |
| `getScrollTopForDistanceFromBottomPx(m, d)` | 目标距底距离对应的 `scrollTop`（钳 `[0, max]`）。**贴底态传 0** |
| `readScrollMetricsPx(el)` | **本模块唯一的 DOM 触点**；其余全纯函数（将来测量层只喂这一个入口） |

**与旧式口径的两处有意差异**（都写在文件头注释里）：

1. **距底距离钳到 ≥ 0** —— 过滚（橡皮筋 / 程序化越界写）时旧式公式给负数。钳零后
   「是否贴底」的**布尔结果不变**（负数与 0 都 ≤ 阈值），但返回值本身有了单一含义。
2. **写 `scrollTop` 显式钳到 `[0, max]`** —— 旧代码写 `scrollTop = scrollHeight` 靠浏览器钳位，落点相同。

其余一律逐位一致，有跨输入网格的**对照扫描**用例钉住（见 §四）。

---

## 三、组件改动（`src/components/content/ThreadConversation.vue`，4 处）

用**锚点脚本**（`tmp/r153-patch-scroll.cjs`，逐处断言命中 1 次 + 结构自检 + 残余检查）落盘，
读取先归一化 CRLF→LF、写回还原 CRLF。

| 处 | 前 | 后 |
|---|---|---|
| 导入 | —— | `import { getScrollTopForDistanceFromBottomPx, isScrollAtBottomPx, readScrollMetricsPx } from '../../utils/conversationScrollDistance'` |
| 阈值常量 | `const BOTTOM_THRESHOLD_PX = 16`（组件内） | 删除；改用模块的 `DEFAULT_BOTTOM_THRESHOLD_PX` |
| 读侧 | `const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)` + `distance <= BOTTOM_THRESHOLD_PX` | `return isScrollAtBottomPx(readScrollMetricsPx(container))` |
| 写侧 | `container.scrollTop = container.scrollHeight` + `anchor.scrollIntoView({ block: 'end' })` | 新增 `setScrollDistanceFromBottom(container, distancePx)` 助手；贴底调用 `setScrollDistanceFromBottom(container, 0)` |

`applyConversationScrollState` 未改代码（它走 `enforceBottomState() → scrollToBottom()`，
自动继承新口径），只补了一条注释说明落点来源。

### 移除 `scrollIntoView` 的等价性论证（本轮唯一的行为改动）

`scrollIntoView` **只有两处可能的效果**，逐条核对：

- **对滚动容器**：`.conversation-list` 是 `py-0`（无纵向内边距），底部锚点
  `.conversation-bottom-anchor` 是 `h-px` 且为 `<ul>` 的**最后一个子元素** ⇒
  `scrollIntoView({ block: 'end' })` 要让锚点底边对齐容器底边，落点就是
  `scrollTop = scrollHeight − clientHeight`，与 `getScrollTopForDistanceFromBottomPx(m, 0)` **逐位相同**。
- **对祖先容器**：`scrollIntoView` 还会滚动**最近的若干可滚动祖先**。代码里原有的注释正是记这件事的
  后果（右侧 Git 面板曾把文档撑到 3.2 万个布局对象、一次 `scrollHeight` 读 ~81ms）。
  距底写入只动本容器 ⇒ **这一条被甩掉**，是收益不是损失。

⇒ 结论：**容器落点等价、去掉的是一个已知有害的副作用**。但因为它毕竟改变了可观察行为
（祖先不再被滚动），本轮**没有浏览器实测**（3a 的定位就是「无浏览器可验证的一步」），
故把「贴底落点与移除前后一致」列进**待人工浏览器验证**清单（见 §六）。

---

## 四、测试：`src/utils/conversationScrollDistance.test.ts`（32 例）

分四组：

1. **`getMaxScrollTopPx` / `getScrollDistanceFromBottomPx`**（10 例）—— 常规值、不可滚、视口为 0、
   过滚钳零、脏值（`NaN` / `Infinity`）不把 `NaN` 传出去。
2. **`isScrollAtBottomPx`**（6 例）—— **阈值边界**：距离恰 16 算贴底、17 不算（`scrollTop` 884/883）；
   自定义阈值；阈值非有限值时退回默认；过滚仍算贴底；不可滚恒贴底。
3. **`clampScrollDistanceFromBottomPx` / `getScrollTopForDistanceFromBottomPx`**（10 例）——
   含**互为逆运算**：对 `distance ∈ {0,1,16,100,450,899,900}` 写回后**读回的距底距离逐例相等**。
4. **对照扫描**（4 例，本轮最有价值的一组）——

   ```
   heights   = [0, 1, 40, 120, 300, 800, 1000, 2500]
   viewports = [0, 1, 50, 300, 800, 1200]
   scrollTop = {−60, −1, 0, 1, 15, 16, 17, 24, 100, 450, max−17, max−16, max−1, max, max+1, max+60}
   ```

   每个交叉点断言三件事，三条各跑 **>500 例**（用例里显式 `expect(checked).toBeGreaterThan(500)`，
   防止网格退化成空扫）：

   - `isScrollAtBottomPx(m, 16)` **===** 旧式 `(scrollHeight − scrollTop − clientHeight) <= 16`；
   - `getScrollDistanceFromBottomPx(m)` **===** `max(0, 旧式距离)`；
   - `getScrollTopForDistanceFromBottomPx(m, 0)` **===** 旧式 `scrollTop = scrollHeight` 经浏览器钳位后的值。

   **对照基准刻意不 import 被测代码**（各自在测试文件里独立定义 `legacyDistanceFromBottom` /
   `legacyIsAtBottom` / `legacyBottomWrite`）—— import 同一个来源会让对照恒真。
   另有一例**反证对照非空**：过滚输入下旧式距离 < 0 而新式钳到 0，证明网格确实踩到了会让两种口径「看起来不同」的输入。

---

## 五、验证

| 项 | 结果 |
|---|---|
| 新用例 | **32/32** |
| 全量单测 | **961 例 / 86 文件全绿**（round-152 后 929/85，**+32 例 +1 文件**，零退化） |
| `vue-tsc --noEmit` | **EXIT=0** |
| 契约闸门 | **58/58**（round-152 后 57，新增 round-153 断言） |
| `vite build` | **EXIT=0** |
| `tsup` | **未跑**（未碰 `src/server/**`，发布无需重部署桥） |

### 闸门新增断言（57→58）与**五路反跑**

断言拆成 7 个子判据：`距底 API` / `贴底阈值 16` / `读侧` / `写侧` / `接线` / `旧写法清零` / `对照扫描独立定义`。
其中「旧写法清零」只看**非注释行**（注释里会**引用**旧写法来说明为何移除，否则残余检查会误报）。

`tmp/r153-refute.cjs` 逐个破坏关键点，**五次全部按预期转红、且翻红的子判据精确**，然后按字节还原：

| 变异 | 结果 | 翻红的子判据 |
|---|---|---|
| A 写侧距离改 8 | `57/58` | `接线=NO` |
| B 阈值 16→20 | `57/58` | `贴底阈值 16=NO` |
| C 写侧退回 `scrollTop = scrollHeight` | `57/58` | `接线=NO` + `旧写法清零=NO` |
| D 读侧退回旧公式 | `57/58` | `读侧=NO` + `接线=NO` |
| E 对照基准改名（对照失去独立性） | `57/58` | `对照扫描独立定义=NO` |

还原后 `58/58`，三文件**按字节一致**（脚本内置 `Buffer.equals` 校验）。

---

## 六、诚实边界

1. **3a 单独上线零收益**（评估原话）。它的价值全在给 3b 铺地基：读侧坐标（`getScrollDistanceFromBottomPx`）
   正是 `jumpToQuestion` 将来要用的，写侧坐标（`getScrollTopForDistanceFromBottomPx`）正是
   `turnVirtualizer.computeScrollDistanceForTurn()` 的直接消费口（两者可组合成
   「按轮次算距底 → 换算 scrollTop」）。
2. **移除 `scrollIntoView` 未经浏览器实测**。等价性是有论证的（§三：`py-0` + 末位 `h-px` 锚点 ⇒ 落点相同），
   但「祖先不再被滚动」是可观察差异。**待人工验证**：真机滚到底、上翻加载、图片晚到补锁底三种场景下
   列表落点与 round-152 之前一致。
3. **`turnVirtualizer.ts` 仍是零调用点**（round-148 落地、本轮未接线）。3a 建的是**另一条**坐标
   （容器 ↔ 距离），两者在 3b 汇合。
4. **必解 2 / 必解 3 未动**：`jumpToQuestion` 仍用 `getElementById` + `getBoundingClientRect`；
   `<ul>` 结构、上方占位方案都未碰。这些是 3b 的范围。
5. **未 bump 版本、未 tag / Release**；`SHARED_BRIDGE_VERSION` 未 bump（未碰桥）。

---

## 七、下一步

- **3b：折叠态 warm 轮窗口化**（hot 轮与展开轮保持全量）。前置动作在评估 §七：先实测
  「折叠卡实测高度 vs 估算高度」的偏差，≤2px 才可直接上。
  3b 落地时把 §六-2 那条人工验证一并做掉。
- 或先做「复制最后一个代码块」（判定书盘点后**唯一真缺**的小件）。
