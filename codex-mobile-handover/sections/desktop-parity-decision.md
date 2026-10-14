# 桌面端 vs 本项目：逐项优劣判定与搬运方案（round-148）

> **问题**：桌面端实现的与我们实现的，谁更好？怎么搬？哪些搬？
> **方法**：round-145/146/146b/147 已拆完桌面端 `app.asar`；本轮**回头核我方 `src/**` 真实代码**（含行号），逐项给判定，再出搬运批次。
> **产物**：本文（判定 + 方案）；原始取证见 `tmp/r146-desktop-port-inventory.md`、`tmp/r147-message-list-findings.md`、`tmp/r145-desktop-edit-findings.md`。

---

## 0. 结论速览

**没有一个整体上「更好」。** 两边是不同约束下的解：桌面端要多窗口 / 云协作 / 团队，我们是单页 / 本地 / 移动优先。胜负必须**按维度判**：

| 域 | 谁更好 | 一句话依据 |
| --- | --- | --- |
| 滚动几何 / 防跳动 | **他们** | 距底坐标 + 按轮锚定补偿；我们用「总高度差」，流式增长时会误补 |
| DOM 体积 | **他们**（小胜） | 窗口化**无级差**；我们靠 warm 折叠卡压低，但 hot 区仍是 30 轮全量 |
| 历史保真 | **他们** | 他们无损；老轮次要「点开折叠卡」才看全文 |
| 读路径健壮性 | **我们** | round-143 的「索引对账」是我们独有的失败模式与修复，他们不需要 |
| 回退 / 编辑**语义** | **打平** | 同一条链路：`thread/revert` 截断 + 重发，后续轮次都删除 |
| 编辑**入口** | **他们**（小胜） | 内联编辑框 vs 我们的确认框 + 回填草稿；但**可编辑范围我们更宽** |
| 安全边界 | **我们** | thinking 存档成对清理、回退点服务端存在性预检、回退边界保护 |
| 命令 / 快捷键 | **他们** | 123 条命令 + 命令面板 vs 我们 **3 个**快捷键 |
| 右侧导航轨 | **打平** | 我们已有 `QuestionJumpBar`（hover 预览 + 波点动画），上一轮材料漏记 |
| 时间分隔 | **他们** | 30 分钟 / 跨天规则，我们无 |
| 工程基建 | **他们** | 能力 × 版本门控表 vs 我们散落的 `methodSet.has(...)` |
| i18n | **各有取舍** | 他们 60+ locale + 命名空间键；我们双语 + 英文串作 key |
| 平台壳能力 | **他们（结构性）** | Electron 独有，Web 搬不了；我们已用 `/codex-local-browse` 等做替代 |

**搬运的总原则**：**搬交互与命令，不搬壳能力；搬几何，不搬 DOM 方向。** 详见 §四。

---

## 一、先说清「更好」怎么判

三条硬标准，按权重：

1. **正确性（35%）** —— 有没有**独有的失败模式**。有独特失败模式的一方，无论功能多，这一项判负。
2. **成本 / 可达性（35%）** —— 同等效果下的 DOM 节点数、强制布局次数（`scrollHeight` 读一次在长文档上是 ~80ms 级）、用户点击步数。
3. **可维护性（30%）** —— 纯函数化程度、有没有单测、有没有能力门控。

**不采用的标准**：「功能条数」「代码行数」。桌面端 123 条命令里有近四成是**壳能力**（内嵌浏览器 / 迷你窗 / 全局呼出 / 原生菜单 / 标签位跳转），比条数没有意义。

---

## 二、逐项对照

### A · 消息列表与滚动

| 维度 | 桌面端 | 我们（含位置） | 判定 |
| --- | --- | --- | --- |
| 容器结构 | 两层：外层 `height=totalHeightPx` 撑高 + 内层 `margin-top=topOffsetsPx[start]` | `<ul class="conversation-list">`（`ThreadConversation.vue:28`）单层，全高自然撑开 | 他们更省 DOM |
| 分层模型 | 窗口化：只渲可见轮 + `retainedTurnKeys` | **三层 hot/warm/cold**：`HOT_TURNS=30`、`WARM_PAGE_SIZE=20`（`:997-998`），老轮次进 `WarmTurnCard`（用户文本 + 助手预览 + 工具计数，`:64-83`） | **语义上我们对**（折叠卡是有信息的摘要），**体量上他们对**（无级差） |
| 高度来源 | 实测缓存 `measuredHeightsByKey` + 声明估算 + 兜底 280，DPR 对齐 | 浏览器自然高度，不缓存 | 他们更好（可预测、无抖动） |
| 滚动坐标 | `distanceFromBottomPx`（距底） | `scrollTop`（从顶）+ `LOAD_MORE_SCROLL_THRESHOLD_PX = 200`（`:999`） | **他们更好**——追加内容时距底不变 ⇒ 天然不跳 |
| 贴底 | `flex-col-reverse` + 距底 API | `scrollTop = scrollHeight` + `anchor.scrollIntoView({block:'end'})`（`:1872-1873`），配 `bottomLockFramesLeft` 连打 6 帧（`:1917`） | 我们这套是**为「无虚拟化」调出来的**，能用但脆 |
| 加载历史保位 | 按**某一轮**锚定补偿（`computeScrollDistanceForAnchor`） | `scrollTop = prev + (scrollHeight - prevScrollHeight)`（`:1954`）——**整页总高度差** | **他们更好**：我们一旦底部在增长（流式）就会误补 |
| 原生滚动锚定 | 显式 `[overflow-anchor:none]`，自己接管 | **未处理**（全仓 grep 零命中） | 他们更好（可预测） |
| 加载历史触发 | 距底 ≤ `max(clientHeight, 64)` 时 **while 连打** | `hasColdTurns → nextColdPage()` / `hasMorePersistedAbove → loadMoreAbove()`（`:2084-2089`），另有手动按钮（`:29-43`） | 他们对（自动、连续）；我们对（可控、有冷页语义） |
| 卸载保护 | `firstProtectedItemId = turnItemIds.at(-500)`、距底 > 24px 才上报 | 无窗口化 ⇒ 无此问题；但 round-143 要求**回退点必须仍在渲染集内** | 打平（两个不同机制的同一类约束） |
| 滚动状态持久化 | `{renderedWindow, turnHeightsByKey}` 跨会话恢复 | 无 | 他们更好（重开不「先估后跳」） |
| 「滚动到底」按钮 | 有，判据 `距底 > spacerHeight + 24` | `scrollToBottom()`（`:1863`）/ `isAtBottom()`（`:1876`）**都已实现，但无 UI** | 他们更好（差一层 UI 而已） |
| 时间分隔 | 跨天 或 间隔 ≥ 30 分钟 | **无**（只有 `ModelSwitchDivider`，`:52`） | 他们更好 |
| 右侧导航轨 | `IntersectionObserver` + 层级/书签 | **已有** `QuestionJumpBar.vue`：点轨跳转 + hover 预览 + 距 hover 点渐变波（`ThreadConversation.vue:524`、`jumpToQuestion` `:1223`） | **打平**（上一轮材料误记「无」） |
| 流式揭示动画 | `min(3000, max(1000, 长度×5))ms` | 无（直接出现） | 他们对（观感）；非必须 |
| 无障碍 | `h4.sr-only`「Latest response」，Tab 直达最新回复 | 无 | 他们更好 |

**A 域小结**：**他们赢在几何与滚动，我们赢在语义分层与安全边界。** 而这两件事其实**不冲突**——他们的几何层可以整段搬到我们的 hot 区（见 §四·批 0/批 3）。

### B · 编辑 / 回退 / 分叉

| 维度 | 桌面端 | 我们 | 判定 |
| --- | --- | --- | --- |
| 操作语义 | 改 input 的 text part（清 `text_elements`）→ `thread/revert {beforeTurnId}` → `turn/start {turnTrigger:'edit_user_message'}` | 确认框 → `emit('rollback', {turnId})` → `rollbackSelectedThread`（`useDesktopState.ts:3377`）：interrupt → 解析 `beforeTurnId` → 存在性预检 → `thread/revert` → `rollback-files` → 重同步 + 清 thinking 存档 | **打平**（同一链路、同一语义：后续轮次都删） |
| 可编辑范围 | **仅最新一条**用户消息（硬 assert `Only the most recent message can be edited.`） | **任意**用户消息（`editableTurnIdByMessageId`，`ThreadConversation.vue:1410`） | **我们更宽** |
| 入口形态 | 用户消息上「编辑消息」按钮 → **原地内联富文本编辑框** + 「发送」 | 同一按钮图标（`IconTablerArrowBackUp`）但 title 是「回退此消息」，行为 = 确认框 + **回填到底部草稿**（`MessageToolbar.vue:10-17` → `ThreadConversation.vue:1425` → `App.vue:4145`） | **他们体验更好**（原地、少一步、文案自洽） |
| 进行中的轮 | 硬 assert 拒绝编辑 | 先 `interrupt` 再回退（`:3388-3390`） | 各有取舍（我们更「能继续」） |
| 编辑失败兜底 | legacy history 走 `thread/rollback`（旧 RPC） | 服务端已无该轮 ⇒ 本地对齐（`:3435`） | **我们更健壮** |
| 存档一致性 | —（上游不需要） | round-142：成对清 thinking 存档（`:3460-3469`） | **我们更好** |
| 分叉 | 三条路径：`beforeTurnId`（需实验能力）→ `lastTurnId` → 全量 fork + 副本 revert | `forkThreadFromTurn`（`useDesktopState.ts:2622`）= **只有最后那条兜底**（`:2654` fork 全量 → `:2689` 副本 revert） | 他们对（少一次往返） |
| 死键 | — | `useUiLanguage.ts:185-186 'Edit this message'` 无调用点 | 我们的技术债 |

### C · 入口层（命令面板 / 快捷键 / 查找 / 复制）

| 项 | 桌面端 | 我们 | 判定 |
| --- | --- | --- | --- |
| 命令面板 | 有；`codex.command.*` 477 键 ⇒ **123 条命令** | **完全没有**（grep `commandPalette/commandMenu` 零命中） | 他们 |
| 快捷键体系 | 123 条命令各有键位（含 OS 级全局键） | **仅 3 个**：`Esc`、`Ctrl/Cmd+B`、`Ctrl/Cmd+J`（`App.vue:3155 onWindowKeyDown`） | 他们（但全局键部分搬不了） |
| 快捷键速查面板 | `showKeyboardShortcuts` | 无 | 他们 |
| 线程内查找 | `findInThread` + `codex.threadFindBar.*`(18 键) | 无（只有跨线程 `thread/search`） | 他们 |
| 复制单条消息 | 有 | **有**：`useReplyCopyFork.ts` 覆盖用户消息 / 助手回复 / plan / fileChange 四类 | 打平（上一轮材料漏记） |
| 整段对话导出为 MD | `copyConversationMarkdown` | **有**：`buildThreadMarkdown()`（`App.vue:4184`）+ `copySelectedThreadChat()`（`:4173`），入口 = 侧栏线程菜单「复制对话」（`:102` → `onCopyThreadChat` ✓ `:2524`）。这行原先写「无」是把 `conversationMarkdown.ts`（渲染器）错当成了唯一候选，漏看了 `App.vue` 里的导出器 | 打平（round-149 更正） |
| 复制最后一个代码块 | `copyLastCodeBlock` | 无 | 他们 |
| 应用级 undo/redo | `undoAppAction` / `redoAppAction` | 仅会话级（undo/redo 通知真实化，P1-3） | 他们（非必须） |
| 消息队列 | 官方 `threadQueue`（0.148+） | **自研** `QueuedMessages.vue` + `buildQueuedTurnParams`（`codexAppServerBridge.ts:1385`） | 打平（自研可控、已跑通） |

### D · 读路径与分页（协议层）

| 维度 | 桌面端 | 我们 | 判定 |
| --- | --- | --- | --- |
| 分页能力 | 上游 `defaultPaginatedHistory`(0.150+)、`threadTimeline` | 自有 **rollout 字节偏移** 有界读 + 页游标 sidecar（`$CODEX_HOME/codex-mobile-turn-page-cursors.json`） | 打平（都是按上游能力做） |
| 两条读路径不一致 | 未见同类问题 | **独有**：`thread/resume` 走 rollout 字节偏移、`thread/read` 走状态索引；`thread/revert` 只清索引、rollout 仍留 ⇒ 「当场消失、刷新又回来」 | **我们踩了独有坑，也已修**（round-143 对账） |
| 修复策略 | — | 页 vs 索引对账：只剔「索引没有 ∧ 已终态」，剔后**须仍是索引的连续后缀**，否则**整页照旧**；**绝不回放全量水合** | **我们更好** |
| 未 materialize 线程 | — | 两读都答 `list_turns is not supported yet` ⇒ 窄谓词 + `buildPendingMaterializationThreadReadResult` | 我们更好 |
| 有意保留全量读的 5 处 | — | `threadSearch.loadAllThreadsForSearch`、`threadRoutes` 的 `file-change-fallback`/`live-state`、`AppServerProcess.readThreadForTurnPage`、`threadArchiveRecovery` | 我们的显式白名单，**别误改** |

### E · i18n / 主题 / 无障碍

| 维度 | 桌面端 | 我们 | 判定 |
| --- | --- | --- | --- |
| 键制 | `codex.<domain>.<key>` 命名空间 | **英文串作 key**（`useUiLanguage.ts`），已有死键（如 `'Edit this message'`） | 他们（规模化后）；我们迁移成本高、收益低 |
| 语言覆盖 | 60+ locale | 中 / 英 | 他们；我们不做出海就不必 |
| 主题 | 深浅两套 | 深/浅两套 + `:root.dark` 覆盖层，**度量稿为契约**（`docs/ui-redesign-mockup.html`） | 打平（我们的度量稿约束更严） |

### F · 平台壳能力

已知且**结构性搬不了**（详见 `tmp/r146-desktop-port-inventory.md` §8.1）：全局呼出窗、迷你悬浮窗、内嵌浏览器面板、原生菜单/托盘、OS 级全局快捷键、全局听写、真·多窗口。

可补偿：`manifest.display: standalone`（PWA 去 chrome）、Document PiP（近似迷你窗）、Notification API。**但「页面聚焦时才收键」是本质差距**。

我方已有替代：`openFolder` → `/codex-local-browse` 路由（`App.vue:2867` 等 5 处）、多窗口 → `window.open` 新标签。

### G · 工程基建

| 项 | 桌面端 | 我们 | 判定 |
| --- | --- | --- | --- |
| 能力门控 | 一张 **60+ 能力 × 最低版本** 表 + 别名表 + 预发布比较 | 散落 `methodSet.has('app/list')` 式探测（如 `DirectoryHub.vue`） | 他们更好（长期收益） |
| 枢纽约束 | — | 四不变式 + 手写闸门（`check-ui-contract` 53 / `check-message-media-surfaces` 44 / vitest 830 例 81 文件） | **我们更严** |

---

## 三、修正上一轮材料的三处低估（重要）

`tmp/r147-message-list-findings.md` 的对照表把我们的实现写低了，按本轮代码核对更正：

1. **不是「全量渲染、无虚拟化」** —— 我们有 **hot/warm/cold 三层**：`HOT_TURNS=30`、`WARM_PAGE_SIZE=20`（`ThreadConversation.vue:997-998`），warm 区渲染 `WarmTurnCard`（用户文本 + 助手预览 + 工具计数）。这和桌面端的窗口化**是两种不同的省 DOM 手段**：他们是「几何窗口化（无损）」，我们是「语义折叠（有损，需点开）」。
2. **不是「无右侧导航轨」** —— `QuestionJumpBar.vue` 已存在并在用（`ThreadConversation.vue:524` 挂载、`:1223 jumpToQuestion`），功能上覆盖桌面端的导航轨（点轨跳转、hover 预览、活动态波点），只是**没有 `IntersectionObserver` 自动跟随**（`activeQuestionTurn` 恒为「最后一个问题」，`:1201`）。
3. **不是「无复制能力」** —— `useReplyCopyFork.ts` 已覆盖用户消息 / 助手回复 / plan / fileChange 四类复制，且含 `execCommand` 兜底。**整段对话导出 MD 也已存在**（`buildThreadMarkdown()` / `copySelectedThreadChat()`，round-149 复核更正 —— 原先写「无」是只看了 `utils/conversationMarkdown.ts`、漏看 `App.vue` 里的导出器）。真正缺的只剩**复制最后一个代码块**。

> 结论：我们和他们的差距**比上一轮材料看起来更小**，且差距集中在**几何层 + 入口层**，不在语义层。

---

## 四、搬运方案（五批，按风险从低到高）

### 批 0 · ✅ **已完成**（round-148｜2026-10-14）

> **落地**：`src/utils/turnVirtualizer.ts`（298 行）+ `src/utils/turnVirtualizer.test.ts`（27 例）。
> **验证**：27/27 单测；全量 **857 例 / 82 文件全绿**（基线 830/81）；`vue-tsc --noEmit` EXIT=0；无任何已有文件被改。
> **细节与诚实边界**：见 [rounds/round-148-turn-virtualizer-geometry-layer.md](../rounds/round-148-turn-virtualizer-geometry-layer.md)。
> ⚠️ 补记：本轮读了原始 chunk 才发现，round-147 材料里「二分查找」的说法**没讲方向** —— 两个数组是**递减**的，`o()` = 首个 `bottomOffset < 视口顶边`、`s()` = 首个 `bottomOffset + height ≤ 视口底边`。

- **搬什么**：`thread-virtualizer` 的 5 个纯函数（`buildLayout` / `computeVisibleRange` / `getRangeForAnchor` / `computeScrollDistanceForAnchor` / `computeScrollDistanceForTurn`）
- **落地**：`src/utils/turnVirtualizer.ts` + `src/utils/turnVirtualizer.test.ts`
- **为什么不接线也值得做**：2,131 B、零 React / 零 DOM / 零状态。先落地它，就能**验证我们的 turn 模型能不能喂饱它**——我们的 turn 有「warm 卡 / 已展开 warm / fold 折叠」三种形态，`estimatedHeightPx` 的取值策略需要重定。这一步是**纯新增文件，无调用点 ⇒ 不可能引入回归**。
- **验收**：单测通过 + `vue-tsc --noEmit` + 既有 830 例不跌

### 批 1 · 低风险小件（彼此独立，可并行）

> **状态（round-149）**：**#1 已完成**（`src/utils/timeDividers.ts` + `TimeDivider.vue` + 25 例单测 + 闸门 `round-149`，见 [round-149](../rounds/round-149-time-dividers-batch1.md)）。
> **#2 无需搬** —— `showJumpToLatestButton` / `jumpToLatest()` / 按钮模板早就在（本文档写作时漏看）。
> **#3 有意延后到批 2 之后**（命令注册表是它的地基）。
> **#4 不改** —— `Ctrl+J` 不在保留加速键表里、页面能 `preventDefault`；终端面板另有可见 tab 按钮兜底；只剩真机按键验证这一项人工动作。

| # | 搬什么 | 落地 | 备注 |
| --- | --- | --- | --- |
| 1 | **时间分隔**（跨天 / ≥30 分钟） | `src/utils/timeDividers.ts` + 单测；插进 `renderTurns` 的 `leadingDividers` | **形状已现成**：`turn.leadingDividers` + `ModelSwitchDivider` 插槽（`:44-53`），照抄即可 |
| 2 | **滚动到底部按钮** | `ThreadConversation.vue` 加 UI | `scrollToBottom()`(`:1863`)、`isAtBottom()`(`:1876`) **都已实现**，只差 UI 与「距底 > 24px 才显示」判据 |
| 3 | **快捷键速查面板** | 新组件 | 内容写**我们实际可用的键位**（比照搬更有价值：避免用户按了没反应） |
| 4 | **修 `Ctrl+J`** | `App.vue:3173` | 先人工实测（§六）；失效则换 `Alt+J` 或 `Ctrl/Cmd+\`` |

### 批 2 · 中风险、收益最大：命令面板 + 命令注册表

- **搬什么**：搬 `codex.command.*` 的**结构**，不搬清单内容。首版 **25–30 条**，来源 = **已有能力重新聚合**（切线程 / 切模型 / 开设置·目录·技能 / 切面板 / 新建 / 回退·分叉 / 复制导出）
- **落地**：`src/components/CommandPalette.vue` + `src/composables/useCommandRegistry.ts`（注册表 = 单一数据源）
- **键位**：`Ctrl/Cmd+/`（`Ctrl+K` 被浏览器地址栏占用，见 §六）
- **为什么它值**：它是**聚合器**——一次盘活已有功能；且命令注册表同时成为快捷键体系与速查面板的地基（批 1 的 #3 应排在它之后接上）
- **风险**：纯前端、不碰 `src/server/**` ⇒ **不用 tsup、不用重部署**
- **不做**：123 条里的内嵌浏览器 / 迷你窗 / 全局呼出 / 标签位跳转（`Ctrl+1..9`、`Ctrl+Tab` 是**硬保留键**，页面根本收不到）

### 批 3 · 高风险：把窗口化接进 hot 区

- **搬什么**：③ 渲染层的「外层撑高 + 内层 `margin-top`」+ ② 的可见区间；**④ 只搬 API 形态**（`getLastScrollDistanceFromBottomPx` / `scrollToDistanceFromBottomPx(dist, behavior, origin)` / `shouldFollowContentGrowth`）
- **前置**：批 0 完成且数值对齐
- **必须同时解决三件事**：
  1. 我们贴底用 `anchor.scrollIntoView({block:'end'})` ⇒ **锚点一旦不被渲染就失效**，必须换成距底距离驱动
  2. round-143：**回退边界必须仍在渲染集内** ⇒ 卸载边界要保护回退点与进行中的轮
  3. `.conversation-list` 是唯一滚动容器，**闸门断言 `<ul>` 上不能挂 `v-if/v-else`**
- **降险路线**：先只做「距底 API 抽象 + `[overflow-anchor:none]` + 按轮锚定补偿」这三件**不改 DOM 结构**的事，观察一版；确认无回归再考虑窗口化。
- **不做**：**`flex-col-reverse`**。我们的 DOM 方向与四不变式已稳定，翻转收益远小于回归风险。

### 批 4 · 要动桥 ⇒ 必须重部署（`vite build` + `tsup`）

| # | 改什么 | 依据 |
| --- | --- | --- |
| 1 | `forkThreadFromTurn` 改用 `thread/fork { beforeTurnId }`，把「全量 fork + 副本 revert」压成一步 | 我方桥**已声明** `experimentalApi: true`（`src/server/codexAppServerBridge.ts:1046-1047`） |
| 2 | 编辑重发带 `turnTrigger: 'edit_user_message'` | 桌面端同款，便于列表区分来源 |
| 3 | **能力-版本门控表**，替掉散落的 `methodSet.has(...)` | 工程基建，长期收益 |
| 4 | 编辑入口升级为**原地内联编辑框**（对齐桌面端文案与图标） | 顺带清掉死键 `'Edit this message'` |

---

## 五、明确不搬

| 项 | 理由 |
| --- | --- |
| `flex-col-reverse` / 整套 `thread-scroll-layout` DOM 翻转 | 我们的滚动容器与四不变式已稳定；翻转风险 ≫ 收益 |
| `split-items-into-render-groups`（分组层） | 我们已有等价物（`renderTurns` / `turn.leadingDividers` / `processItems` / `buildProcessFolds`） |
| 123 条命令里的壳命令 | 内嵌浏览器 / 迷你窗 / 全局呼出 / 原生菜单 / 标签位跳转 —— Web 结构性做不到 |
| `codex.<domain>.<key>` 键制迁移 | 全量重写 i18n 调用点，成本高、收益低（我们已有大量死键在手，别再加） |
| `threadQueue` 替换自研队列 | 我方 `QueuedMessages.vue` + `buildQueuedTurnParams` 已跑通并有单测 |
| space / page / PR / 分享快照 / 可视化面板 / 会议 / 订阅计费 | 依赖其闭源云与商业模型（C 类） |
| `undo` 特性 | 0.162 里 stage 已是 `removed` |
| 「改历史消息并保留后续轮次」 | **协议层不存在**（105 方法零命中 `edit/rewrite/rewind`）；桌面端也做不到。若要做只能是「编辑即分叉」 |

---

## 六、两个必须人工实测的点（自动化测不出）

CDP / Playwright 的按键注入**绕过**浏览器 `PreHandleKeyboardEvent`，无法用自动化确证「页面是否真的收到键」。

1. 打开线上站、聚焦消息区，按 **`Ctrl+J`** ⇒ 切终端 = 生效；打开「下载」页 = 该快捷键在 Chrome/Edge 里**一直是失效的**（`App.vue:3173` 白写）
2. 按 **`Ctrl+K`** ⇒ 若焦点跳到地址栏 ⇒ 命令面板不能用 `Ctrl+K`（本方案已改 `Ctrl/Cmd+/`）
3. 顺带按 **`Ctrl+B`** ⇒ 预期切侧边栏（安全，Chrome 的书签栏是 `Ctrl+Shift+B`）

---

## 七、建议开工顺序

```
批 0（几何层，纯新增）──→ 批 1（三个小件，可并行）
                              └──→ 批 2（命令面板，聚合器）
                                        └──→ 批 3（距底 API → 窗口化，分两步）
批 4（桥侧，等一次发版窗口一起做）
```

**为什么批 0 第一**：零风险、可独立验收，且它验证的「我们的 turn 能不能喂饱几何层」是批 3 的**前置未知数**。**为什么批 2 在批 3 前**：批 3 风险最高（动滚动容器），批 2 收益/风险比最好，且批 2 的命令注册表会被批 1 的速查面板复用。

---

## 八、防回归清单（动列表前必看）

- `.conversation-list` 是**唯一滚动容器**，`<ul>` 上**不能挂 `v-if/v-else`**（`check-ui-contract.cjs:589-598`）
- 重挂必须落到最新内容（round-127）：`onMounted → scheduleConversationScroll()`（`:2076`）
- 闸门：`check-ui-contract`（53）、`check-message-media-surfaces`（44，需 `PROFILE_BASE_URL`）、`verify-conversation-list-persists.cjs`、`verify-conversation-mount-scroll.cjs`、`verify-turn-e2e.cjs`
- 基线：vitest **830 例 / 81 文件**；环境不足一律 SKIP 退 2，**不许空过**
- 改 `src/server/**` ⇒ **必须 `vite build` + `tsup`**（只跑 vite build 不生效）
- 行尾：`App.vue` / `package.json` / `useDesktopState*.ts` = CRLF；`useDesktopStateUtils.ts` = LF

---

## 九、复现

```bash
cd /d/code/codex-mobile
# 桌面端消息列表四层
node tmp/r146c-assets.cjs "<app.asar>"        # 列 chunk
node tmp/r146c-dump.cjs tmp/r146c-asar/webview__assets__thread-virtualizer-e1964ca5c039.js pretty
# 我方现状（本轮核对）
grep -n "HOT_TURNS\|WARM_PAGE_SIZE\|scrollIntoView\|LOAD_MORE_SCROLL_THRESHOLD_PX" src/components/content/ThreadConversation.vue
```

## 十、诚实边界

1. 桌面端结论来自**压缩产物静态阅读 + 桌面端自带二进制的 RPC 实测**，未启动桌面端点按验证。
2. 我方现状来自 `src/**` 静态阅读（含行号）+ 上一轮 grep，**未跑浏览器实测** ⇒ §六两个键位必须人工验。
3. 桌面端 C 类列表（space / library / PR）未纳入。
