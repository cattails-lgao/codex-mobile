# Round-95：Markdown 标题层级 + 线程行（等宽时间/运行 pip/选中导轨）+ 侧栏区头降噪（2026-09-24）

> **背景：** 承接 [round-94](round-94-code-floor.md)。用户点名 P1 剩余三块一次做完：**Markdown 标题层级**、**线程行（等宽相对时间 + 运行中 pip + 选中导轨）**、**侧栏其余入口降噪**。线程行与导轨的细节照抄度量稿 `.row` / `.when` / `.pip`（hover/active 抬 `s2`、active 导轨中性 `ink-2`、运行导轨 `--live`、时间等宽 11px→12px）。

---

## 1. 现象

- **标题无层级**：`.message-heading` 六个级别全是 16px / `#17181a` 硬编码，只有行高与字距微差——Markdown 的 `#` 与 `####` 渲染出来一样大。
- **线程行三缺**：相对时间是 sans 14px（`.thread-row-time { text-sm text-zinc-500 }`）；运行中是 10px 边框 spinner；选中行只是 `bg-zinc-200`，无导轨。方案 §5 原文：「线程行右侧等宽相对时间、运行中的线程加 pip」「选中态改中性 2px 导轨 + 表面抬升（琥珀留给运行态）」。
- **区头仍是裸色板**：`section-toggle-row` / `chats-section-action` / `organize-menu-trigger` 全是 `zinc-200/500/700/400` 裸类。

## 2. 修复

1. **标题阶梯**：h1-h4 = `text-xl/lg/base/sm`（20/18/16/14px，**标准 Tailwind 档，`text-[Npx]` 计数不增**），h5/h6 并入 14px 靠 `tracking-[0.02/0.04em]` 区分；全部 `text-ink-1`，round-23 的 `#17181a` 硬编码清零。**层级靠字号与字距，不靠色相**。过程消息（`conversation-item-process`）里的标题是有意的次级样式（15px 弱化），保持不动。
2. **线程行（度量稿 `.row`/`.when`/`.pip`）**：hover/选中抬 `bg-s2`（原先 `bg-zinc-200` 裸类）；**选中导轨** = 左缘 2px 圆头 `bg-ink-2`（`::before`，行加 `relative`）；**运行导轨** = 行标记 `data-live` 时导轨转 `bg-live`——琥珀严格只表示「有东西在动」；**运行 pip** = spinner 退场，改 6px `bg-live` 圆点 + 22% 光晕 + 1.6s 呼吸（`prefers-reduced-motion` 归零）；**相对时间** = `font-mono text-xs text-ink-3 tabular-nums`（跳变时列宽稳定）；选中行标题 `text-ink-1 font-medium`，其余 `text-ink-2`。
3. **区头降噪**：`section-toggle-row` hover/ring、`chats-section-action`、`organize-menu-trigger` 的 zinc 裸类 → `bg-s2` / `text-ink-3` / `ring-line-2`。
4. **删冗余暗色覆盖 5 条**（`style.css`）：`.thread-row`（hover/active）、`.thread-row-title`、`.thread-row-time`（基线已 token 化且同值；时间统一为 ink-3——暗色原先 ink-4 对比不足，方向是修可读性）、`.message-heading`（text-ink-1 与新基线同值）。`.message-heading-h6` 的暗色 ink-4 是**有意的暗色分级**，保留。

## 3. 过程中抓到的坑

- **契约断言的双重转义**：在 JS 模板字符串里写 `new RegExp(\`\\\\.foo\`)` 会把 `\\.` 字面传给 RegExp——匹配「反斜杠 + 任意」而不是「任意字符」。字面量正则同理（`/\\n/` 匹配的是「反斜杠 + n」）。表现是断言全报「未找到规则」，但同样的正则放进一次性 node 脚本就命中。**修正**：模板字符串里 `\\.`、字面量里 `\.`（单层转义）。
- **行锚定才抓得到选择器前缀**：`/\.message-heading \{[^}]*\}/` 匹配到的子串从 `.message-heading` 开始，**选择器前缀（`conversation-item-process`）不在捕获里**，前缀过滤永远无效。改 `/^[^{}\n]*\.message-heading(?:-h\d)? \{[^}]*\}/gm`（m 标志 + 行锚定）后才过滤得动。
- **Edit 吞标题第二次发生**（round-93 首次）：改 `sections/ui-redesign-plan.md` 区块边界时把下一个标题吞进 old_string 没放回。**规矩**：old/new 两串都要含完整标题行，改完 `grep` 复核下一个标题在位。

## 4. 闸门（先武装、再改代码）

1. `scripts/ui-audit-shots.cjs`：采样点 **23 → 27**（+`.message-heading`（默认线程 4 个 h2）/`.thread-row`/`.thread-row-title`/`.thread-row-time`；thread-row 在 8 页落位、heading 在 4 页落位）。
2. **改动前**采集并重新武装基线：**120 → 145 元素 / 870 属性**，自检逐字相同。改动前留档 `docs/ui-audit/before-p1-rows-heading-computed-styles.json`（120 元素）。
3. 改代码 → 重采 → 等值检查报出 **43 项超差**，**全部**落在 4 个目标采样点（time 28 / title 8 / heading 6 / row 1），**泄漏 0**。
4. 复核通过后重新武装，自检 870/870 逐字相同。

**已知覆盖缺口（如实记录）**：h1/h3-h5 无实样（默认线程只有 h2），采样只覆盖 h2；运行 pip 与 live 导轨在本机没有真实运行线程——截图里那一行是**页面内临时标记的模拟**（仅用于视觉检查，已在脚本注明），契约静态断言与手测覆盖行为。

## 5. 验证

- `vue-tsc --noEmit` 干净；`vite build` 通过（36.7s）。
- **UI 契约 28 → 32 项全过**（+标题分级落标准档、标题颜色只用 ink、线程行时间等宽+tabular-nums、运行 pip 用 `--live` 且选中行有中性导轨）。
- 主题 **15/15**、字体 **13/13**、等值见上节。
- 全量 Vitest **658 例 656 通过 / 2 失败**（既有 Windows 平台差异；首跑 3 失败复跑回落，抖动教训沿用）。
- 浏览器实测（`tmp/shoot-rows-headings.cjs`）：时间 = IBM Plex Mono 12px（暗 `rgb(212,212,216)` / 亮 `rgb(99,99,109)`＝两套 ink-3）；h2 = 18px（暗 `rgb(244,244,245)` / 亮 `rgb(18,18,21)`＝两套 ink-1）；选中行 1 条、导轨可见。证据 `docs/ui-audit/p1-rows-sidebar-{dark,light}.png`、`p1-heading-{dark,light}.png`。

## 6. 明确不做 / 已知偏离

- **时间 12px 而非度量稿 11px**：`text-[Npx]` 硬闸门；留排版阶梯。
- **其余状态指示（unread/external/approval/response）与 request-chip 的 blue/sky/emerald 裸类未动**：属状态色裸类清理（P2「slate 并入 token」一并做），本轮只动点名的 working pip 与选中导轨。
- **organize-menu 弹层、回收站列表、设置按钮的 zinc 裸类未动**：弹层是低频界面，归 P2 批量清理；本轮只做区头行与线程行。
- **process 消息标题的 15px 弱化保留**：那是「过程 vs 正文」的次级设计，与「标题有层级」不冲突。
- **h1/h3-h5 无实样**：分级数值由契约静态断言锁定。
- **仍未定（唯一一项，未变）**：亮色 token 取值。

## 7. 涉及文件

**产品代码**

- `src/components/content/ThreadConversation.vue` — 标题阶梯（xl/lg/base/sm + tracking）、`text-ink-1`。
- `src/components/sidebar/SidebarThreadRow.vue` — 模板加 `data-live`；样式：表面 s2、双态导轨、pip 呼吸、等宽时间、标题 token 化。
- `src/components/sidebar/SidebarThreadTree.vue` — 区头行/动作按钮 token 化。
- `src/style.css` — 删 5 条冗余暗色覆盖（thread-row ×4、message-heading ×1），保留 h6 暗色分级。

**闸门与证据**

- `scripts/ui-audit-shots.cjs` — 采样点 23 → 27。
- `scripts/check-ui-contract.cjs` — 新增 4 条断言（28 → 32 项）。
- `docs/ui-audit/before-p1-rows-heading-computed-styles.json`、`current-computed-styles.json`（重新武装，145 元素）、`before-p1-rows-heading-desktop-thread.png`、`p1-rows-sidebar-{dark,light}.png`、`p1-heading-{dark,light}.png`。

**文档**

- 本轮记录（本文件）、[sections/ui-redesign-plan.md](../sections/ui-redesign-plan.md)、[codex-mobile-handover.md](../codex-mobile-handover.md)、`tests/theme-layout-terminal/round-95-headings-thread-rows.md` 与两处索引、`.workbuddy/memory/2026-09-24.md`。
