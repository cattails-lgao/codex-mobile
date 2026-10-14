# round-150 · 批 2：命令面板（注册表 + 匹配器 + 覆盖层 + `Ctrl/Cmd+/`）

> 承接 `sections/desktop-parity-decision.md` §四 的**批 2**（中风险、收益最大）。批 0 见
> [round-148](round-148-turn-virtualizer-geometry-layer.md)，批 1 见 [round-149](round-149-time-dividers-batch1.md)。
> 本轮**纯前端**（未碰 `src/server/**`）⇒ 发布时不需要重新部署桥。

---

## 一、结论

给 Web 端补上**命令面板**：`Ctrl/Cmd+/` 唤出，输入即模糊筛选，回车执行。

**它不新增任何能力**——24 条命令全部转发到既有的 App.vue 处理函数。面板的价值在于把散落在
侧栏菜单 / 顶栏按钮 / 设置页 / 右侧面板 tab / 偏好开关里的动作**聚合成一个可检索入口**，
顺带把「全站只有 3 个快捷键」这件事往前推进一步。

| 文件 | 内容 |
| --- | --- |
| `src/components/content/commandRegistry.ts`（新增，189 行） | `PaletteCommand` 类型 + `PALETTE_COMMANDS`（**24 条**）+ 匹配器 `scorePaletteText` / `matchPaletteCommands` / `groupPaletteCommands` |
| `src/components/content/commandRegistry.test.ts`（新增） | **27 例**（word-boundary 3 / 评分 8 / 匹配 7 / 目录 6 / 分组 3） |
| `src/components/content/CommandPalette.vue`（新增，217 行） | Teleport 覆盖层 + 输入框 + 分组列表 + 键盘导航 |
| `src/App.vue` | 4 处：import / 状态与转发 / `Ctrl+/` 键位 / 挂载 |
| `src/composables/useUiLanguage.ts` | +24 条 zhCN 表值（3 条面板文案 + 4 条分组标题 + 17 条命令标题） |
| `scripts/check-ui-contract.cjs` | 新增 `round-150` 断言（8 子判据），闸门 **54 → 55** |

---

## 二、注册表是纯数据，匹配是纯函数

模块顶部规则写明两条，都是为了让这个文件**永远不需要挂载应用就能测**：

1. **不 import 任何处理函数 / store / 组件**。`PaletteCommand.id` 是唯一的耦合点，由 App.vue 侧
   `switch` 转发到既有函数（见 §五）。注册表因此能被单测直接驱动。
2. **标题即 i18n key**（英文源串），沿用本项目 `useUiLanguage()` 的约定。代价是新增命令要同时改两处
   ——这条已被**闸门断言**钉住（§六），不是靠记性。

```ts
type PaletteCommand = {
  id: string                 // 唯一耦合点：App.vue 的 switch 分发
  title: string              // i18n key
  group: 'thread' | 'panel' | 'view' | 'navigate'
  keywords?: string[]        // 召回词，**刻意不翻译**：同时放英文别名与中文词
  shortcut?: string          // 展示用，抽象写法 'Mod+X'；从不反解成键位
  requiresThread?: boolean   // 是否依赖「已选中线程」
}
```

`keywords` 不翻译是刻意的：中文界面下用英文词也能搜到（`trash` → 回收站），英文界面下用中文词也能搜到
（`暗色` → 主题）。这条由测试与闸门各钉一次。

---

## 三、匹配算法（三条加权 + 一条不可靠分数的排序键）

### 1. 评分

`scorePaletteText(text, query)`：有序子序列匹配，全整数运算（保证断言逐位可复现）。

| 事件 | 权重 |
| --- | --- |
| 每个命中字符 | `+10` |
| 连续命中（紧跟上一次命中） | 每次额外 `+6 × run` |
| 命中落在词首（串首 / 空格 / `-` / `/` / `.` / `_` 之后） | `+12` |
| 首个命中位置越靠后 | `-2 × firstHit` |
| 文本越长 | `-⌊(len(text) - len(query)) / 4⌋` |

查询里的空格被忽略（`git panel` 与 `gitpanel` 等价）；大小写不敏感。

### 2. 排序：**标题命中整块排在关键字命中之前** ★

这条**不能靠分数表达**，所以是显式排序键：

```ts
candidates.sort((a, b) =>
  Number(a.keywordOnly) - Number(b.keywordOnly)   // ← 先分档
  || b.score - a.score                            // 再比分数
  || a.index - b.index)                           // 再保目录顺序
```

为什么不能靠分数：长标题会被长度惩罚压低，一个短 keyword 很容易反超。测试里专门构造了这个反例——

```
'Zebra report of everything'  vs  { title: 'Nothing related here', keywords: ['zebra'] }
query = 'zebra'  ⇒  标题分 111，关键字分 152
```

关键字分**更高**却必须排在后面。如果哪天有人把排序改成「纯按分数」，这条断言会立刻翻红，
而症状会是「输入命令名，无关行浮到它上面」。

### 3. 分组

`groupPaletteCommands` 按固定顺序 `thread → panel → view → navigate` 分桶，丢弃空组。
高亮用**分组顺序展平后的下标**，所以键盘上下移动天然跨组连续。

---

## 四、上下文收敛（24 条 → 实际显示多少条）

面板不是静态列表，App.vue 的 `paletteCommands` 会按当前上下文裁剪：

| 条件 | 被裁掉的 |
| --- | --- |
| 未选中线程（首页 / 技能页 / 自动化页 / 空 id） | 除 `thread.new` 外整个 thread 组 |
| 当前无运行中的轮次 | `thread.interrupt` |
| 当前无 plan 面板 | `thread.implement-plan` |
| `canShowRightPanel` 为假 | 整个 panel 组 |

> **`thread.new` 例外**是这里唯一的陷阱：它同属 thread 组，但它恰恰是「没有选中线程时最该能用」
> 的那一条。所以判据做成**数据上的** `requiresThread` 标志，而不是「`group === 'thread'` 就裁」。
> 测试与闸门各钉一次（`thread.new 免过滤`）。

`shortcut` 在 App.vue 侧把抽象前缀 `Mod+` 换成 `⌘` / `Ctrl+`，注册表里始终只写 `Mod+B`。

---

## 五、转发映射（每个 case 都只是转发）

| 命令 id | 转发的既有函数 |
| --- | --- |
| `thread.new` | `onStartNewThreadFromToolbar()` |
| `thread.rename` | `sidebarThreadTreeRef.openRenameThreadDialog(threadId, title)` |
| `thread.archive` / `thread.fork` | `onArchiveThread(threadId)` / `onForkThread(threadId)` |
| `thread.copy-markdown` | `copySelectedThreadChat()`（= `buildThreadMarkdown()` + 剪贴板） |
| `thread.compact` / `thread.interrupt` / `thread.implement-plan` | `onCompactContext()` / `onInterruptTurn()` / `onImplementPlan()` |
| `panel.git` / `panel.files` | `selectRightPanelTab('git' \| 'files')` |
| `panel.terminal` / `panel.toggle` / `panel.close` | `toggleRightPanelTerminal()` / `onToggleRightPanelToggle()` / `onCloseRightPanel()` |
| `view.toggle-sidebar` | `setSidebarCollapsed(!isSidebarCollapsed)` |
| `view.search-threads` | `setSidebarCollapsed(false)` + `toggleSidebarSearch()` |
| `view.cycle-theme` / `view.cycle-chat-width` / `view.send-with-enter` / `view.in-progress-send-mode` | `cycleDarkMode()` / `cycleChatWidth()` / `toggleSendWithEnter()` / `cycleInProgressSendMode()` |
| `view.toggle-language` | `setUiLanguage(zh-CN ⇄ en)` |
| `nav.skills` / `nav.automations` | `router.push({ name })` |
| `nav.recycle-bin` / `nav.settings` | `onOpenRecycleBin()` / `onToggleSettings()`（仅打开，不关闭） |

`thread.rename` 走的是侧栏树暴露的重命名对话框，和 `onSlashCommand('rename')` 完全同一条路径——
斜杠菜单与命令面板因此不会出现「同一个动作两种行为」。

---

## 六、键位：为什么是 `Ctrl/Cmd+/`

| 候选 | 判定 |
| --- | --- |
| `Ctrl/Cmd+K` | **不可用**：Chromium 保留的功能键（跳地址栏），页面拿不到 |
| `Ctrl/Cmd+Shift+P` | 技术上可用，但需要 `shiftKey`，而现有 `onWindowKeyDown` 开头就是 `if (event.shiftKey \|\| event.altKey) return`；为它放开守卫会顺带放开别的组合 |
| `Ctrl/Cmd+/` | ✅ 不在保留加速键表、不是浏览器功能键（Chrome/Firefox 均无默认行为）、不需要 shift/alt ⇒ **落在现有守卫内，不放松任何条件** |

现有 `onWindowKeyDown` 的改动只有两处：

```ts
if (key === '/') { event.preventDefault(); isCommandPaletteOpen.value = !isCommandPaletteOpen.value; return }
if (isCommandPaletteOpen.value) return     // 面板打开时让位，避免在面板里按 Ctrl+B 把侧栏一起收起来
```

外加一条兜底（面板打开且焦点意外离开输入框时，`Esc` 仍能关掉面板）。

面板内部自己处理方向键 / `Tab` / 回车 / `Esc`，且在输入框上 `preventDefault()`
⇒ window 处理器开头 `if (event.defaultPrevented) return` 直接放行，两套键盘逻辑不会互相抢。

---

## 七、闸门与验证

- **契约闸门**：`node scripts/check-ui-contract.cjs` → **55/55**（基线 54，本轮 +1 条 `round-150`）
  - 8 个子判据：注册表（24 条）/ 匹配与分组函数 / 标题优先于关键字 / **i18n 漏键（自动比对 zhCN 表）** /
    `thread.new` 免过滤 / 接线 / `Ctrl/Cmd+/` 与让位 / 面板视图
  - **反跑**：把 `nav.settings` 的标题改成表里没有的 `'Open preferences'` ⇒ 该条 **FAIL**
    且精确报出 `i18n 漏键=Open preferences`（54/55）；还原后 **55/55** ⇒ 断言非空过
- **单测**：`commandRegistry.test.ts` **27/27**
- **全量**：`vitest run` **909 例 / 84 文件全绿**（批 1 后基线 882/83，**+27 例 +1 文件**，旧例零退化）
- **类型**：`vue-tsc --noEmit` **EXIT=0**
- **构建**：`vite build` **EXIT=0**（新 `.vue` 与模板改动都过编译）。**未跑 `tsup`**（未碰 `src/server/**`）
- **i18n 表完整性**：脚本核对 zhCN 表 **832 键、零重复**

> 中途踩到一次既有契约：输入框最初用 `text-sm`，被「UI 字号不落在阶梯外」这条闸门拦下
> （阶梯是 nano 10 / micro 11 / meta 12 / ui 13 / body 15 / …，`text-sm` 只许留在 3 处 Markdown 标题链）。
> 已改 `text-ui`。

---

## 八、诚实边界

1. **未真机验证键位**。与 round-149 同：CDP 注入绕不过浏览器加速键前置处理，`Ctrl/Cmd+/` 是否真能唤出
   需要人工按一次。另外 `event.key` 对 `Ctrl+/` 的取值**依赖键盘布局**（美式布局下为 `'/'`）；非美式布局
   若拿不到 `'/'`，这条绑定不会触发（面板本身没有别的入口，这是本轮遗留的实际可用性风险）。
2. **未在浏览器里目视**亮/暗观感。覆盖层沿用 `ReviewPane` 的 `z-[var(--z-modal)]` + `bg-black/40` + `blur(2px)`
   与 `ComposerSlashMenu` 的行样式，但**未做对比度采样**。
3. **移动端未适配**。`padding-top: 12vh` 在窄屏 + 虚拟键盘下未验证；触屏下 `Tab` 循环高亮无意义。
4. **只做无参命令**。面板不能传参数（例如「打开某个具体文件」），首版刻意收窄。
5. **未做快捷键速查面板（批 1 #3）**。本轮完成后它才有地基——现在可以直接复用 `PALETTE_COMMANDS`
   的 `shortcut` 字段列出全局键位。
6. **`/` 键在 composer 输入框内的行为未变**：只有带修饰键的 `Ctrl/Cmd+/` 才唤出面板，裸 `/` 仍是斜杠命令。

---

## 九、复现

```bash
cd /d/code/codex-mobile
"C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vitest/vitest.mjs run src/components/content/commandRegistry.test.ts
"C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node scripts/check-ui-contract.cjs        # 期望 55/55
```

---

## 十、下一步

- **批 1 #3 快捷键速查面板** —— 地基已就位（`PALETTE_COMMANDS.shortcut`），可一次性接上。
- **批 3 距底 API → 窗口化** —— 高风险，须分两步；前置是 `estimatedHeightPx` 策略（我们一轮有
  warm 折叠卡 / 已展开 warm / hot 全量三种形态，高度差异极大）。
- **批 4 桥侧** —— `forkThreadFromTurn` 改用 `thread/fork { beforeTurnId }`、`turnTrigger: 'edit_user_message'`；
  需 `vite build` + `tsup`，等一次发版窗口。
