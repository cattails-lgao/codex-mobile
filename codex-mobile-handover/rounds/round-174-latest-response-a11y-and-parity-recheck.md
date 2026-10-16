# round-174 · 无障碍「Latest response」+ parity 复核五处改判

> 起因：盘点 parity 表剩余「他们更好」行准备打包收尾，真查代码发现**两行判定早已过时**（按钮与时间分隔栏都已落地），随后把同表的滚动坐标 / 贴底两行一并复核，本轮把**五处改判 + 一处真正的代码缺口（无障碍）**一起收口。

## 一、结论先行

- **代码**：`ThreadConversation.vue` 补齐桌面端 26.1013 的无障碍机制——composer 前的 `h4.sr-only`「Latest response」+ 焦点导航（focusin 升 Tab / 前向 keydown 降 Tab / 聚焦即送至最后 assistant final 块）。parity 表行 65「他们更好」→ **打平**。
- **复核改判**（纯文档，能力均已在此前 round 落地而 parity 表未跟上）：
  - 行 54「滚动坐标」→ **打平**（round-153 批 3a 已把读写统一到距底坐标纯函数）；
  - 行 55「贴底」→ **打平**（round-153 已甩掉 `scrollIntoView`，写入统一 `setScrollDistanceFromBottom(container, 0)` + bottom lock 连打）；
  - 行 61「滚动到底按钮」→ **打平**（`jump-to-latest-button` 已有 UI，条件 `!autoFollowOutput`）;
  - 行 62「时间分隔」→ **打平**（round-149 已落地 `timeDividers.ts`：跨天或间隔 ≥ 30 分钟）。
- 至此 A 域（消息列表与滚动）的「他们更好」功能行**全部清零**，剩余差异只剩几何/实现取向类（高度来源、流式揭示动画等，见 parity 表原文判定）。

## 二、实现（桌面端取证驱动）

桌面端机制取自 26.1013 asar `virtualized-turn-list-8f04484ca276.js`（提取物在 `tmp/r165-assets/`）：

- `<h4 className="sr-only m-0 select-none" tabIndex={0动态} onFocus/onBlur>`，i18n 键 `codex.conversation.latestResponse`，description 原文：「Invisible heading before the composer; focusing it moves to the newest assistant response」；
- **动态 tabIndex 配对**：`focusin`（焦点落到标题后方，`compareDocumentPosition` 判 FOLLOWING）→ `tabIndex = 0`；document 级 `keydown`（Tab 且非 shift 且未 preventDefault）→ `tabIndex = -1`。净效果：**前向 Tab 流不被标题打断，反向 shift+Tab 从 composer 可达**；
- 聚焦标题时走 `onNavigate(signal)` 把焦点送到最新 assistant 回复，`focus({ preventScroll: true })`。

我们端的等价实现（`ThreadConversation.vue`）：

- 标题挂在根 `<section>` 尾部（DiffViewer 之后）——DOM 序上正好在列表与 composer 之间，与桌面端「composer 前」语义一致；
- `pickLatestResponseAnchor()` 选择器优先序：最后一条 `.conversation-item-final`（item 级）→ `.conversation-turn-final`（section 级）→ 最后一个 `li.conversation-turn` → null（保持标题焦点）；
- **关键坑（Chromium 实测，`tmp/r174-focus-exp.cjs`）**：聚焦态同步摘 `tabindex` 会把焦点打回 BODY，**连下一帧摘都失焦** ⇒ 改为挂一次性 `focusout`，焦点离开该块后再恢复 `tabindex` 原状（原值存在则还原；负值不进 Tab 序，只开放编程聚焦）；
- 注册用**第二个 `onMounted`/`onBeforeUnmount` 对**：ui-contract 钉住第一个 `onMounted` 的 240 字符窗口（须含 `scheduleConversationScroll`），现有窗口已近满，注册语句不得再挤进那个窗口。

## 三、验证

- 探针 `tmp/r174-verify.cjs`（vite dev server 5173 + `r163-harness` 合成线程 + Edge headless）：**A1–A4 全 PASS、0 pageerror** ——
  - A1 标题存在：文本/类/初始 `tabindex=-1`/`clip-path: inset(50%)` 不可见/位于列表之后；
  - A2 焦点进入 composer textarea → 标题 `tabindex` 升 `0`；
  - A3 shift+Tab 反向 → 焦点落在 `li.conversation-item-final`（临时 `tabindex` 保留、`scrollTop` 未被改动 = preventScroll 生效）；
  - A4 前向 Tab（textarea → BUTTON → INPUT）从不落在标题上（keydown 降 `-1` 后 Tab 移动焦点、focusin 对新焦点又升回 `0`——终态 `0` 是 keydown/focusin 配对的预期行为）。
- 闸门：vue-tsc 0 错；vitest **1060/1060**（93 文件，基线不变）；build 通过；ui-contract **60/60**（新增 round-174 断言：标题模板 + focus 导航/focusout 摘除 + keydown/focusin 配对）。
- 404 说明：探针 harness 环境的 `/codex-api/project-root-suggestion` 404 与本轮无关（dev server 无该 API 端点 mock），探针判定已过滤。

## 四、诚实边界

- **仅聚焦「读」侧**：桌面端 `onNavigate` 走 `conversation-navigation-state` 模块（AbortController 可中断重试、失败回落），我们直取最后 final 块、无重试——正常线程下等价；极端情形（列表为空、全部折叠进 warm 卡且无 final）保持标题焦点不动。
- 流式中（`LiveOverlayItem` 承载进行中的回复）：最后 final 块可能尚未生成，此时落在最后一个 turn 根 li 或保持标题焦点；未构造「流式中 shift+Tab」的真机用例。
- A4 的 `textareaTabDefaultPrevented` 记录为 `no-keydown`（探针时序误报，Tab 实际未被 composer 拦截——afterTextareaTab 焦点移到 BUTTON 即证）；不影响判定。
- parity 行 51–65 的**未触及行**旧行号（如 `:997-998`）未逐一复核，仅改判行更新到现行号。

## 五、改判依据速查

| parity 行 | 旧判定 | 新判定 | 依据 |
| --- | --- | --- | --- |
| 行 54 滚动坐标 | 他们更好 | 打平 | round-153 批 3a：读写统一距底坐标（`conversationScrollDistance.ts`），ui-contract 钉死旧写法清零 |
| 行 55 贴底 | 能用但脆 | 打平 | 同上：`setScrollDistanceFromBottom(container, 0)` + bottom lock 连打，`scrollIntoView` 已甩 |
| 行 61 滚动到底按钮 | 他们更好 | 打平 | `.jump-to-latest-button`（模板 :604-613）：`!autoFollowOutput` 显示，`jumpToLatest` 恢复跟随 + 4 帧锁底；判据口径不同（桌面「距底 > spacerHeight+24」，我们 autoFollow 布尔），行为等价 |
| 行 62 时间分隔 | 他们更好 | 打平 | round-149：`timeDividers.ts`（`TIME_DIVIDER_GAP_MS`=30min，跨天或间隔达阈值）、`TimeDivider.vue`、接线 2 处被 ui-contract 钉死 |
| 行 65 无障碍 | 他们更好 | 打平 | 本轮实现（见 §二）；机制逐项对齐，导航层简化（见 §四） |
