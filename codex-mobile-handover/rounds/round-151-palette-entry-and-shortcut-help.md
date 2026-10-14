# 第一百五十一轮：命令面板指针入口 + 快捷键速查面板 + 批 3 前置评估

> 承接 round-150（批 2 命令面板）。本轮原计划只做「补入口」，实际按顺序做完三件事：
> ① 消除 round-150 留下的可用性缺口；② 批 1 #3 速查面板；③ 批 3 评估。
> **未 bump 版本、未 tag / Release。**

---

## 一、交付物

| 文件 | 内容 |
|---|---|
| `src/App.vue` | 顶栏放大镜按钮（`content-header-command-button`）+ 速查面板接线（6 处） |
| `src/utils/keyboardShortcuts.ts`（新，141 行） | `SHORTCUT_GROUPS`（15 条 / 3 组）+ `formatShortcutTokens` / `formatShortcutCombo` / `formatShortcutEntry` / `countShortcuts` |
| `src/utils/keyboardShortcuts.test.ts`（新） | **20 例** |
| `src/components/content/ShortcutHelpPanel.vue`（新，169 行） | Teleport 覆盖层 + 分组速查表 |
| `src/components/content/commandRegistry.ts` | +1 条命令 `view.shortcuts`（24 → 25） |
| `src/composables/useUiLanguage.ts` | +18 条 zhCN 表值 |
| `scripts/check-ui-contract.cjs` | round-151 断言（6 子判据）⇒ 闸门 **55 → 56** |
| `codex-mobile-handover/sections/batch3-virtualization-assessment.md`（新） | 批 3 前置评估（七节） |

---

## 二、① 命令面板的指针入口：不是「锦上添花」

round-150 留下一条实际可用性风险：`Ctrl/Cmd+/` 的判定走 `event.key`，
**只有把 `/` 放在该物理位置的键盘布局才会产出 `'/'`**；非美式布局拿不到这个值，
而面板当时**没有第二个入口** ⇒ 等于不可达。

处置：顶栏 `ContentHeader` 的 `#actions` 加放大镜按钮（右面板开关左侧），
`title` 显示 `命令面板 · Ctrl+/`（mac 上 `⌘/`）。
另补一条 round-150 没有的行为：**关闭模态后把焦点还给触发控件**
（`commandPaletteButtonRef.value?.focus()`），与 `AppDialog` 一致——
否则焦点落到 `<body>`，键盘用户丢失位置。

---

## 三、② 快捷键速查面板

### 目录是「转写」，不是「第二真相源」

`src/utils/keyboardShortcuts.ts` 逐条对应真实绑定，三类来源在文件头注明：

- `global` → `App.vue` 的 `onWindowKeyDown`（全树**唯一**的 window 级键盘处理器）
- `composer` → `ThreadComposer.vue` 的 `onInputKeydown`
- `navigation` → `AppDialog` / `ComposerPopover` / `SidebarThreadTree` 的焦点处理

目录是**纯展示**数据，没有任何反向解析回绑定的路径 ⇒ 它不会变成
「两份关于快捷键的真相」。代价是绑定变更时这个文件要跟着改——这正是
round-151 契约断言盯的东西。

### 平台渲染的取舍

`formatShortcutTokens(keys, isMac)` 只映射两个 token：`Mod` → `⌘` / `Ctrl`，
`Shift` → `⇧`（仅 mac）。拼接规则按平台分叉：mac 无分隔（`⌘B`），
其他平台加分隔（`Ctrl + B`）——拼写形式的键名不加分隔会读成一个词。

`alsoKeys` 表示「等价替代」，渲染成 `Enter / Tab`；
否则就得为「Enter 或 Tab」拆成两条，速查表会变得很长。

### 互斥

两个浮层都是模态。打开命令面板时关掉速查、反之亦然；`Ctrl/Cmd+/` 在速查打开时
**切到命令面板**而不是叠一层。断言同时钉住两个方向的赋值顺序。

### 用真源核对的一处

「发送」这条有两个分支：`Enter` 发送（`sendWithEnter` 开）与 `Ctrl/Cmd+Enter` 发送（关）。
两条都列出来，各带一句条件说明——只写一条会让另一半用户找不到自己的键。

---

## 四、③ 批 3 前置评估（详见 `sections/batch3-virtualization-assessment.md`）

三条主结论：

1. **批 3 不是修 bug，是换地基。** 我方当前**没有**「流式追加把列表顶走」的缺陷路径：
   贴底走 `scrollToBottom()` 硬跳，非贴底**完全不滚动**；整页高度差补偿只用在
   `loadMoreAbove()`，而那是**前置插入**，ΔH 恰好等于插入高度。round-148 的对照证明
   说明的是几何层更通用，**不能读成「我方实现有错」**。
2. **三个必解**：`scrollIntoView` 依赖锚点在 DOM 里（`ThreadConversation.vue:1911`）、
   `jumpToQuestion` 用 `getElementById` 找目标轮（`:1279`，null 时静默 return）、
   `<ul>` 唯一滚动容器 + 不能挂 `v-if` 的结构不变式。
3. **只对折叠态 warm 轮窗口化**：`WarmTurnCard` 的文本一律单行 `truncate`
   ⇒ 行数不随内容变化 ⇒ 高度近似常量；展开轮与 hot 轮高度不可预知，保持全量。

**若只做一件事**：先实测「折叠卡估算高度 vs 实际高度」的偏差。偏差 ≤ 2px ⇒ 3b 可直接上；
偏差大 ⇒ 「单行截断」前提不成立，要重新设计估算。

---

## 五、验证

| 项 | 结果 |
|---|---|
| 新用例 | `keyboardShortcuts.test.ts` **20/20** |
| 全量单测 | **929 例 / 85 文件全绿**（批 2 后 909/84，+20 例 +1 文件，零退化） |
| 类型 | `vue-tsc --noEmit` **EXIT=0** |
| 契约闸门 | **56/56**（round-150 断言因 `Ctrl+/` 分支多了一行而更新为新契约，见下） |
| 前端构建 | `vite build` **EXIT=0**（`ThreadConversation-CTLl8jN-.js`） |

**两次反跑**（证明新断言非空）：

- 摘掉 `content-header-command-button` 类 ⇒ `面板指针入口=NO`，55/56；还原即过
- 把 `'Mention a file'` 改成表里没有的串 ⇒ `i18n 漏键=Mention a file`，55/56；还原即过

**闸门同步更新**：round-150 的 `Ctrl+/` 断言原先要求 `preventDefault()` 后**紧跟**
toggle，本轮在该分支多插了一行「关闭速查面板」⇒ 老正则失配。改为允许分支内
最多 200 字符的中间语句后再匹配 toggle。这不是放宽——`/` 分支仍是唯一出现
`isCommandPaletteOpen.value = !isCommandPaletteOpen.value` 的地方。

---

## 六、诚实边界

1. **速查面板是转写，不是探针**：它证明「目录与 zhCN 表一致」，**不证明**目录与
   运行时绑定一致。绑定变更时靠人（和 code review）同步，断言只能兜住「忘了加表值」。
2. **`Ctrl/Cmd+/` 仍未真机验证**：布局相关，CDP 注入绕不过浏览器前置处理。
   本轮加了指针入口后，即使该键位完全失效，面板也不再不可达——这就是①的收益。
3. **批 3 未开工**，只出评估。折叠卡高度是**算式不是数字**，§四 的实测是 3b 的前置条件。
4. `view.shortcuts` 只能在命令面板里触发（无独立键位），这是有意为之：
   再占一个全局键位不值当，而速查面板本身就在教用户「怎么打开命令面板」。
