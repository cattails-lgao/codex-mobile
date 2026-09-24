# Round-91：侧栏两个工具入口的「同一个图标」缺陷（2026-09-24）

> **背景：** 承接 UI 改造方案（`sections/ui-redesign-plan.md`）的 P1「重做主界面」。上一轮 round-90 把 P0 的 token 化收口，用户口径「继续处理UI优化吧」，于是进入 P1。P1 有三条已认定、不需要审美争论的确凿缺陷（方案 §3），本轮只做第一条——它同时踩中方案的两条规则（规则一「颜色只表示状态」、规则四「不新增装饰」），且修复面小、可完全验证。

## 1. 现象

侧栏里「技能库（Skills）」与「定时任务（Automations）」两个**语义完全不同**的入口：

- 用的是**同一个闪电 SVG**（`IconTablerBolt`），只靠翠绿 / 橙来区分；
- 图标底片是 **40×40 的实心饱和方片**（`bg-emerald-600` / `bg-amber-500` + 白字），是整屏唯一的饱和元素，注意力会从线程列表被抢走；
- **暗色下更糟**：两者共用同一个**翠绿渐变卡片**外加翠绿边框（`linear-gradient(135deg, rgba(6,78,59,0.42), rgba(24,24,27,0.96))`）——即两行都是绿底，只有方片颜色不同；
- 同一个缺陷在**页面路由头部**还有第二处：技能库页与定时任务页的头图标也是同一个闪电 + 翠绿/橙，并且带**同色光晕阴影**（`shadow-[0_16px_32px_-20px_rgba(5,150,105,0.9)]`）。

证据：`docs/ui-audit/before-p1-sidebar-tools-tiles.png`（改动前）与 `output/playwright/ui-audit/p1-sidebar-tools-dark.png`（改动后）。

## 2. 根因（实测确认）

- 模板：`src/App.vue` 侧栏两处（约 58 / 74 行）与路由头部两处（约 165 / 168 行）都写的是 `<IconTablerBolt />`。
- 样式：`.sidebar-skills-link-icon` 定义为 `h-10 w-10 rounded-2xl bg-emerald-600 text-white`，`.sidebar-automations-link-icon` 只覆盖 `bg-amber-500`——**唯一定义差异就是底色**，这正是「只靠颜色区分」的字面实现。
- `src/style.css`（原 487 行起）的暗色覆盖把渐变与翠绿边框加在**两行共用**的 `.sidebar-skills-link` 上，因此暗色下两行都是绿卡片——这一条是审计时未见、本轮读代码才发现的（审计截图只反映了方片颜色差异）。
- 结论：不是审美偏好问题。颜色一旦不成立（色觉障碍、灰度截图、缩到 22px），两个入口就再也分不出来。

## 3. 修复

**改动文件：** `src/App.vue`、`src/style.css`、`scripts/check-ui-contract.cjs`、`scripts/ui-audit-shots.cjs`；新增 `src/components/icons/IconTablerListLines.vue`、`src/components/icons/IconTablerClock.vue`。

1. **字形分开**（这条是缺陷的正面修复）：新增两个图标组件，路径直接取自度量稿 `docs/ui-redesign-mockup.html`（技能库＝线列 `M4 7h16M4 12h16M4 17h10`，定时任务＝时钟 `circle r=8` + `M12 8v4l3 2`），不再凭记忆写 SVG 路径。侧栏两处 + 路由头部两处全部替换。
2. **底片降噪**：按度量稿 `.tile` 规格改为 **22×22 / 6px 圆角 / 状态色 15% 淡底**（`bg-ok/15 text-ok`、`bg-live/15 text-live`）；路由头部 36×36 同款淡底，并**去掉彩色光晕阴影**。
3. **删掉暗色那层渐变覆盖**：基础规则改用 token 后两套主题自动各自取值，`style.css` 里那整块 `:root.dark .sidebar-skills-link` 覆盖**不再需要，整块删除**（附注释说明为什么删）。
4. **选中态改中性**：`bg-s2` 表面抬升 + **2px 中性导轨**（`bg-ink-2`）。度量稿里明写「选区导轨：中性色，把琥珀严格留给『运行中』」——否则「出现颜色」就不再等于「有事发生」。
5. **token 补齐**（方案 §4 规格里此前未落地的部分）：新增 `--live / --ok / --alert / --model / --line-focus`，两套主题各自取值，并在 `@theme inline` 里映射。**这一步本身零视觉变化**（加的时候还没有任何消费者），侧栏这两个入口是第一批使用者。

**为什么必须同时补 token：** 契约检查有「裸色板类不得增长」的基线，若直接用 `bg-emerald-600/15` 这类裸类会立刻撑破闸门；而用 `--ok` 就必须先把 token 建起来。

## 4. 验证

- `vue-tsc --noEmit`：干净。
- `vite build`：通过（41.7s）。
- **UI 契约检查 20/20**（`scripts/check-ui-contract.cjs`）。本轮新增两条断言：
  - `状态色对 s1/s2 ≥3:1（两套主题）`——状态色要当图标与标签用，达不到 3:1 就只剩装饰作用，而那正是这次要清掉的东西。
  - `技能库与定时任务用不同字形（不能只靠颜色区分）`——把缺陷本身变成回归闸门，静态读 `App.vue` 即可，无浏览器依赖。
  - 两个计数都朝正确方向动了：亮色基线裸色板 **1112 → 1107**、`style.css` 内状态色裸类 **250 → 245**。
- 字体检查 **13/13**、主题检查 **15/15**。
- 外观等值检查：**288/288 项逐字相同**（7 页 48 元素）。
- 浏览器实测读数（`tmp/shoot-sidebar-tools.cjs`，未入库）：底片 `22px × 22px`、`border-radius: 6px`、底色 `oklab(… / 0.15)`；图标色暗色 `rgb(62,207,142)` / 亮色 `rgb(29,125,84)`（＝两套主题的 `--ok`），`rgb(240,165,58)` / `rgb(178,106,18)`（＝两套主题的 `--live`）；**`sameGlyph: false`**。
- 亮色文字**逐字不变**：亮色基线原为 `text-zinc-700`（`#3f3f46`），与 `--ink-2` 亮色取值完全相同，所以换 token 没有改动亮色文字。

## 5. 闸门修正：等值检查原先看不到这一片区域

`scripts/check-token-equivalence.cjs` 依赖 `ui-audit-shots.cjs` 的采样点，而采样点原先只有 **6 个**：`body` / `.desktop-sidebar` / `.sidebar-root` / `.content-header` / `.thread-composer textarea` / `button`。**`.sidebar-root` 这一层之下改了什么都测不到**——本轮改的正是这一片。

已把 `.sidebar-skills-link`、`.sidebar-automations-link-icon`、`.skills-route-header-icon` 加入采样点并**重新武装基线**（`docs/ui-audit/current-computed-styles.json`，桌面页采样点 6 → 8，总数 222 → 288 项；改动前那份另存 `docs/ui-audit/before-p1-computed-styles.json`）。

**这是同一类问题的第二次出现**：round-90 是「扫描范围小于断言措辞」（只扫 `style.css` 却断言整个深色层），本轮是「采样范围小于闸门名字」（名为等值检查却不覆盖组件内部）。写或改检查时先问一句：**它真的看到了它声称的东西吗**。

## 6. 明确不做（本轮范围外）

- **暗色换石墨取值**（方案 §4 左列）：看起来只是改十几行变量，**其实会牵连墨色重新分级**——P0 把 `text-zinc-400/500/600` 统一映射到了 `ink-4`，而方案目标值里 `--ink-4` 是「禁止用于文字」（暗色 2.9:1）。直接换值会让原本达标的 `zinc-400` 文字掉到 AA 以下。必须逐类人工确认语义，单独做一轮。
- 排版阶梯（用户已明确推迟到看过 P1 主界面之后）、线程行的导轨/等宽相对时间/运行 pip、输入区（模型前置 + 单一主按钮）、亮色基线 token 化。

## 7. 已知偏离与待办

- **字形与方案正文不一致**：方案 §5 P1 正文写「技能库用层叠/插头、定时任务用时钟」，而度量稿实际渲染的是**线列 + 时钟**。本轮取度量稿（已渲染、用户已认可的视觉契约），在此记录该偏离以便评审时校正。
- **悬停/选中表面用 `s2` 而不是度量稿的 `s3`**：当前暗色 `--s3` 仍是 P0 的等值取值 `zinc-700`（`#3f3f46`），在 `zinc-900` 侧栏上跳变过大；等暗色换成石墨阶梯（`s3: #1f1f23`）后 `s3` 才是度量稿里那种轻微抬升。届时可一并回改。
- **`src/components/sidebar/SidebarPrimaryNav.vue` 全仓库无人引用**（死代码）。本轮未处理，留待确认后按「删除优于新增」清理。

## 8. 涉及文件

- 改：`src/App.vue`（模板 4 处图标 + 样式 2 段）、`src/style.css`（token 补齐 ×2 主题 + 删暗色渐变覆盖 + `@theme inline` 映射）、`scripts/check-ui-contract.cjs`（+2 断言，共 20 项）、`scripts/ui-audit-shots.cjs`（+3 采样点）、`docs/ui-audit/current-computed-styles.json`（滚动基线重新武装）。
- 新增：`src/components/icons/IconTablerListLines.vue`、`src/components/icons/IconTablerClock.vue`、`docs/ui-audit/before-p1-computed-styles.json`（存档）。
- 本地未入库：`tmp/shoot-sidebar-tools.cjs`（裁剪截图探针）。
