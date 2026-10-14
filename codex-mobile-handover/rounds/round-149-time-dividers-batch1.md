# round-149 · 批 1：消息列表时间分隔（跨天 / 距上一条分隔栏 ≥30 分钟）

> 承接 `sections/desktop-parity-decision.md` §四 的**批 1**（低风险小件）。本轮只做其中 **#1 时间分隔**；
> #2 / #3 / #4 的处置结论见 §六。批 0（几何层）已完成，见 [round-148](round-148-turn-virtualizer-geometry-layer.md)。

---

## 一、结论

给消息列表补上**时间分隔**：跨天，或距**上一条已展示的分隔栏** ≥ 30 分钟时，在那一轮之前插一条居中的
时间胶囊（`Today 14:05` / `Yesterday 09:00` / `10-12 08:00` / `2025-12-31 23:30`）。

规则来自桌面端 `shouldShowMarker`，但**基准**这一点必须讲清楚（见 §二.2）——它是这条规则唯一容易做错的
地方，也是本轮单测里最有价值的一条。

- 新增 `src/utils/timeDividers.ts`（108 行，CRLF）+ `src/utils/timeDividers.test.ts`（**25 例**）
- 新增 `src/components/content/TimeDivider.vue`（40 行，CRLF）
- 改 `src/components/content/ThreadConversation.vue`（接线，6 处）
- 改 `src/composables/useUiLanguage.ts`（`'Today'` / `'Yesterday'` 两条 zhCN 表值）
- 改 `scripts/check-ui-contract.cjs`（新增 row-149 断言，闸门 **53 → 54**）

---

## 二、语义

### 1. 触发规则

```ts
shouldShowTimeDivider(previousMarkerMs, nextMs)
  = previousMarkerMs 缺失/非法 ⇒ true          // 首轮必出
  | !isSameLocalDay(previousMarkerMs, nextMs) ⇒ true   // 跨天（本地日历日）
  | nextMs - previousMarkerMs >= 30 * 60 * 1000 ⇒ true // 同日且 ≥30 分钟
  | 否则 ⇒ false
```

`isSameLocalDay` 用 `getFullYear/getMonth/getDate` 三元组比较**本地**日历日，不用 UTC、也不做毫秒算术。

### 2. 基准是「上一条**已展示**的分隔栏」，不是「上一轮」★

桌面端变量名即 `previousMarkerSentAtMs`，本模块照此实现：出栏后基准才重置。两者在高频对话里**结果完全不同**：

| 时刻序列 | 按上一条分隔栏（本轮实现） | 按上一轮（错的） |
| --- | --- | --- |
| 10:00 / 10:29 / 10:58 / 11:27 | 10:00 ✅、10:29 ✗、**10:58 ✅**、11:27 ✗ | 10:00 ✅、其余全 ✗ |

「每 29 分钟发一条」是真实高频形态（连续追问、自动化轮询）：按上一轮算**整段对话一条分隔都出不来**。
这条对照已固化成断言（`selectTimeDividerTurnKeys` 第一例），不是注释里的说法。

### 3. 标签四档

| 条件 | 输出 |
| --- | --- |
| 今天 | `Today 14:05` |
| 昨天 | `Yesterday 09:00` |
| 同年其它日 | `10-12 08:00` |
| 跨年 | `2025-12-31 23:30` |

`Today` / `Yesterday` 走 `t()`（i18n），日期与时刻**手工补零**。

---

## 三、刻意选择（与桌面端的差异，都是有意为之）

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 标签格式化 | 手写 `pad2` 拼 `MM-DD` / `HH:mm` | **不用 `toLocaleDateString`**：它按 locale 换分隔符（`10/12`、`12.10`…），既不可断言也不跨环境一致。闸门里也钉了这条（`手写补零(不用 locale)`） |
| 时间缺失 | 静默跳过、**不打断轮次渲染** | `turnStartedAtIso` 是可选字段（round-106，0.157+ 才有）。缺失时不能因此让整轮不出现——**渲染正确性优先于分隔完整性** |
| 基准不重置 | 时间缺失的轮次被跳过，基准保持 | 宁可多出一条分隔，也不要整段无分隔 |
| 标签刷新 | 跟 `renderTurns` 一起算，不挂定时器 | 跨零点后「Today」不会自动变「Yesterday」，但任何一次消息变化都会重算；为一个标签加定时器不划算 |
| 位置 | 渲染在 `leadingDividers`（模型切换栏）**之前** | 时间分隔是「更大的时间尺度边界」，放在最前读起来更顺 |

---

## 四、接线点（`ThreadConversation.vue`）

| 位置 | 内容 |
| --- | --- |
| `:606` | `import { formatTimeDividerLabel, selectTimeDividerTurnKeys } from '../../utils/timeDividers'` |
| `:637` | `import TimeDivider from './TimeDivider.vue'` |
| `:46-51` | 模板：`<li v-if="turn.timeDividerLabel" data-message-type="timeDivider">` → `<TimeDivider :label="…" />` |
| `:1052` | `ConversationRenderTurn.timeDividerLabel?: string \| undefined` |
| `:1064-1086` | `attachTimeDividers(list)`：取每轮 `turnStartedAtIso`（warm 轮走 `groups[warm.turn].userItem`，hot 轮走 `request`/`finalItem`）→ 选键 → 写标签 |
| `:1146` / `:1207` | **两条 return 路径都要挂**（无 hot 轮 / 正常）——闸门断言调用点必须为 **2** |

> ⚠️ 接入点必须覆盖**两条 return**：`renderTurns` 在「没有 hot 消息」时会提前返回（此时只有 warm 轮），
> 只在末尾挂会让纯 warm 线程完全没有分隔。

---

## 五、闸门与验证

- **契约闸门**：`node scripts/check-ui-contract.cjs` → **54/54**（基线 53，本轮 +1 条 `round-149`）
  - 8 个子判据：30 分钟常量 / 基准=上一条分隔栏 / 同日间隔规则 / 缺失时间戳跳过 / 手写补零(不用 locale) /
    接线（调用点 2，须 2） / 渲染 li / 分隔组件
  - **反跑**：把 `30 * 60 * 1000` 改成 `20 * 60 * 1000` ⇒ 该条 **FAIL**（`30 分钟常量=NO`，53/54）；
    还原后 **54/54** ⇒ 断言非空过
- **单测**：`src/utils/timeDividers.test.ts` **25/25**
- **全量**：`vitest run` **882 例 / 83 文件全绿**（批 0 后基线 857/82，**+25 例 +1 文件**，旧例零退化）
- **类型**：`vue-tsc --noEmit` **EXIT=0**
- **构建**：`vite build` **EXIT=0**（`ThreadConversation-BC9Bil06.js` 产出，`index-BZ7GF1kA.js` 586.38 kB）—— 新增 `.vue` 与模板改动都过编译。**未跑 `tsup`**（未碰 `src/server/**`）

---

## 六、批 1 其余三项的处置

| # | 项 | 结论 |
| --- | --- | --- |
| 2 | 滚动到底部按钮 | **已经存在，无需搬**。`showJumpToLatestButton`（`:1399`）+ `jumpToLatest()`（`:1969`）+ 模板 `:538-547` 早就在；判据是 `!autoFollowOutput`（用户上滚即出现），比桌面端的 `距底 > spacer + 24` 更直接。r147 材料写「无 UI」是**看漏** |
| 3 | 快捷键速查面板 | **有意延后到批 2 之后**。判定书 §四 已定：命令注册表（批 2）同时是快捷键体系与速查面板的**地基**，先做面板等于把 3 个键位的清单硬编码一遍再返工。当前实际可用的键位只有 3 个（`Ctrl/Cmd+B`、`Ctrl/Cmd+J`、`Esc`），单独做面板价值低 |
| 4 | 修 `Ctrl+J` | **不改**。绑定本身按 Chromium 语义是成立的：`Ctrl+J` 不在**保留加速键**表里（保留的是 `Ctrl+T/W/N`、`Ctrl+Tab`、`Ctrl+1..9`、`F11/F12`、`Ctrl+Shift+I/J/C` 等），浏览器会**先**把事件交给渲染进程，页面 `preventDefault()` 能吃掉它（`App.vue:3173-3181` 已这么做）。且终端面板本就有**可见 tab 按钮**（`App.vue:753`）作为兜底入口 ⇒ 即使某个浏览器吃掉按键也不影响可用性。**唯一未闭环**：真机按一次键验证（CDP 注入会绕过浏览器前置处理，自动化测不出，见 §八） |

> **顺带更正（盘点层）**：r147 把「整段对话导出 MD」记为**无**，实际**已存在** ——
> `App.vue:4184 buildThreadMarkdown()` + `:4173 copySelectedThreadChat()`，入口 = 侧栏线程菜单「复制对话」
> （`:102` → `onCopyThreadChat` `:2524`）。原先只看了 `utils/conversationMarkdown.ts`（渲染器）就下了结论。
> 连同 #2 的滚动到底按钮，**r147 §六 对照表里「他们有、我们没有」的两行其实是打平**。
> 判定书 `sections/desktop-parity-decision.md` §C 表与 §137 行已同步更正。

---

## 七、诚实边界

1. **没做真机键位验证**（§六 #4）。CDP 注入的 `Ctrl+J` 绕不过浏览器加速键前置处理，所以「自动化测不出键位是否被浏览器抢」这件事仍然成立，需要人工按一次。
2. **`turnStartedAtIso` 覆盖度未实测**。它由 `normalizeThreadMessagesV2`（`src/api/normalizers/v2.ts:844-851`）从 `turn.startedAt` 取；0.157+ 的持久化轮次应该有，但**未在线上数据上统计命中率**。全缺失时的表现是「一条分隔都不出」——退化安全，不是渲染错误。
3. **跨零点的标签不会自动刷新**（§三）。要改只需把 `Date.now()` 变成响应式时钟，本轮判断不值得。
4. **未在浏览器里目视**新分隔栏的亮/暗观感（`TimeDivider.vue` 的胶囊底色 `rgba(148,163,184,0.18)` / 暗色 `rgba(63,63,70,0.5)` 是对齐 `ModelSwitchDivider` 的量值，未做对比度采样）。

---

## 八、复现

```bash
cd <项目目录>
"<用户主目录>/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vitest/vitest.mjs run src/utils/timeDividers.test.ts
"<用户主目录>/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node scripts/check-ui-contract.cjs        # 期望 54/54
```

---

## 九、下一步

批 2（命令面板 + 命令注册表，首版 25–30 条、键位 `Ctrl/Cmd+/`）——它是聚合器，做完后 #3 速查面板可一次性接上，
再往后才是批 3（距底 API → 窗口化，须分两步）与批 4（桥侧，等一次发版窗口）。
