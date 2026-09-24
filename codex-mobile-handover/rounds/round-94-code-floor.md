# Round-94：代码块楼层——语言标签 + 复制（2026-09-24）

> **背景：** 承接 [round-93](round-93-tool-call-row.md)（工具调用行）。用户口径「继续下一步」→ 本轮做 P1 会话区第二块：方案 §5 的「行内代码/代码块有楼层（语言标签 + 复制）」。实现细节照抄度量稿 `docs/ui-redesign-mockup.html` 的 `pre`（`--s2` 表面 / `--line-1` 发丝边 / 14px 圆角 / bar 用 `--s1` 底 + 发丝下边 / 语言左 `margin-right:auto` / 复制右 11px 等宽 / 代码区 `--ink-2`、13px、1.65 行高）。

---

## 1. 现象

**代码块是页面上一块「永远的黑」。** 改动前：

- `.message-code-block` 是 `bg-slate-950` 裸色板 + `border-slate-200`——**两套主题下都是深底**（暗色层再覆盖成 `bg-s0`），与方案「颜色只表示状态、表面走 token」直接冲突；
- 语言标签是独占一行的 div（`border-slate-800 text-slate-400`），**没有复制按钮**——复制代码要靠手动划选；
- 高亮底色由 highlight.js 主题给出，与楼层 token 无关（本轮不动高亮配色）。

渲染有**两条路径**：`ThreadConversation.vue` 逐 block 模板（v-memo 包裹）与 `useMarkdownRendering.ts` 的 HTML 字符串（`ReasoningBlock` 的 `content-html`，经 `sanitizeHtml`）。改结构必须两路同步。

## 2. 修复

1. **楼层形态（度量稿 `pre`）**：`.message-code-block` → 14px 圆角 + `--line-1` 发丝边 + `--s2` 表面，**跟随主题**（不再永远深底）；`pre` 代码区 `--ink-2` / 13px / 1.65 行高 / `px-3.5 py-3`。
2. **bar（度量稿 `.bar`）**：语言标签与复制控件合入 `--s1` 底 + 发丝下边的顶栏；语言左（等宽 11px 大写 `--ink-3`），复制右（等宽 11px `--ink-3`，hover 转 `--ink-1`，成功态转 `--ok`）。
3. **复制（事件委托，覆盖两路）**：复制控件统一为 `<span role="button" tabindex="0" data-code-copy>`；`conversation-root` 上挂一个 `@click` + `@keydown.enter` 委托，从最近的 `.message-code-block` 取 `<code>` 的 `textContent` 写剪贴板。成功后控件文字换 `t('Copied')`（zhCN 新增「已复制」），1.6s 复位（WeakMap 管理定时器）。模板路径与 v-html 路径**同一份委托**，v-html 子树内无需绑事件。
4. **删全局暗色覆盖**：`style.css` 的 `:root.dark .message-code-block` / `.message-code-language` 两条退役——组件 token 化后两套主题各自取值（round-93 同款理由：全局层再写一份就是 round-92 的同权重雷）。

## 3. 过程中抓到的坑

- **`sanitizeHtml` 白名单没有 `button`**：v-html 路径里放 `<button>` 会被剥壳保文本（只剩「复制」两个字）。白名单已有 `span`，且 sanitizer 只删 `on*` 与危险 URL——`role`/`tabindex`/`data-*` 全部保留 → 复制控件用 `span role="button"` + `data-code-copy`，点击走根级委托。**教训：v-html 里要放交互元素，先查 sanitizer 白名单。**
- **i18n key**：`'Copy'` 已存在（「复制」），`'Copied'` 缺失——补进 zhCN 表（「已复制」），避免界面出现英文 key。

## 4. 闸门（先武装、再改代码）

1. `scripts/ui-audit-shots.cjs`：工具线程页采样点 **20 → 23**（新增 `.message-code-block` / `.message-code-language` / `.message-code-pre`；采样线程 `01a04679…` 实测有 3 个代码块，语言均为 `text`）。
2. **改动前**采集并重新武装基线：**114 → 120 元素 / 720 属性**，自检 **720/720 逐字相同**。改动前那份留档 `docs/ui-audit/before-p1-codefloor-computed-styles.json`（114 元素）。
3. 改代码 → 重采 → 等值检查报出 **15 项超差**，**全部**落在 3 个代码块采样点 × 2 页（暗 7 / 亮 8），**泄漏 0**。
4. 复核通过后重新武装，自检 720/720 逐字相同。

**已知覆盖缺口（如实记录）**：`.message-code-bar` / `.message-code-copy` 是**新增元素**，基线里没有对应物，等值检查天然覆盖不到（契约静态断言看着它们）；复制交互（剪贴板内容、Copied 反馈、复位）是行为不是样式，靠手测。

## 5. 验证

- `vue-tsc --noEmit` 干净；`vite build` 通过（32.3s）。
- **UI 契约 26 → 28 项全过**（新增：代码块楼层颜色只用 token——`bg-s2`/`border-line-1` 且无 slate/zinc/gray 裸类；复制控件两条渲染路径都在——模板与 `useMarkdownRendering.ts` 都含 `data-code-copy`）。
- 主题 **15/15**、字体 **13/13**、等值见上节。
- 全量 Vitest **658 例，2 失败**（既有 `codexAppServerBridge.archive.test.ts` Windows 平台差异；首跑一度 3 失败，复跑回落——round-92/93 同款抖动教训）。
- 交互实测（headless + clipboard 权限）：点击复制 → 剪贴板内容与代码逐字一致、控件文字 `Copy → Copied → (1.6s) Copy`；`rounded-[14px]`、`bg-s1/s2`、`text-ok` 全部解析成功。
- 元素特写（`tmp/shoot-codefloor.cjs` → `docs/ui-audit/p1-codefloor-{dark,light}.png`）：楼层 14px 圆角、bar 与代码区 `--s1/--s2` 分层、复制控件等宽 11px、两套主题各自正确。

## 6. 明确不做 / 已知偏离

- **暗色下楼层外边框不可见（既有取值问题，非本轮引入）**：暗色 `--s2` 与 `--line-1` 同为 `#27272a`，边框与表面同色。bar 的 `--s1`（`#18181b`）分层仍可见。根因同「亮色 token 取值未决」——token 阶梯取值本来就悬而未决，留到取值定夺一起处理。
- **高亮配色未动**：highlight.js 的 token 上色不归本轮；楼层只管容器。
- **无语言的代码块**：不渲染语言标签（与原行为一致），bar 里只有复制控件（`ml-auto` 保证贴右）。
- **内联代码未动**：`.message-inline-code` 本就 `bg-transparent text-inherit`，无裸色板。
- **排版阶梯**仍按用户决定推迟，本轮 `text-[Npx]` 计数未增（147；`text-[11px]`/`text-[13px]` 是既有用法延续）。
- **仍未定（唯一一项，未变）**：亮色 token 取值。

## 7. 涉及文件

**产品代码**

- `src/components/content/ThreadConversation.vue` — codeBlock 分支改楼层结构（bar + 复制控件）；根元素挂 `@click`/`@keydown.enter` 委托与 `handleCodeCopyActivate`；样式 token 化（14px 圆角 / s2 / line-1 / bar s1 / ink-2）。
- `src/components/content/useMarkdownRendering.ts` — codeBlock 分支产出同款楼层 HTML（`span[data-code-copy]`）。
- `src/style.css` — 删除 2 条代码块相关的全局暗色覆盖。
- `src/composables/useUiLanguage.ts` — zhCN 补 `'Copied': '已复制'`。

**闸门与证据**

- `scripts/ui-audit-shots.cjs` — 采样点 20 → 23。
- `scripts/check-ui-contract.cjs` — 新增 2 条代码块断言（26 → 28 项）。
- `docs/ui-audit/before-p1-codefloor-computed-styles.json`、`current-computed-styles.json`（重新武装，120 元素）、`before-p1-codefloor-desktop-tools.png`、`p1-codefloor-{dark,light}.png`。

**文档**

- 本轮记录（本文件）、[sections/ui-redesign-plan.md](../sections/ui-redesign-plan.md)、[codex-mobile-handover.md](../codex-mobile-handover.md)、`tests/theme-layout-terminal/round-94-code-floor.md` 与两处索引、`.workbuddy/memory/2026-09-24.md`。
