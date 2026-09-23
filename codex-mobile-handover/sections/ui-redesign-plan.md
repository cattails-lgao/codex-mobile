# UI 改造方案：从「通用深色 SaaS」到「控制台 / Instrument Panel」

**状态：提案，待决策**（本轮未改任何产品代码；产品当前仍停 round-89 的 `c54068a`）
**度量稿：`docs/ui-redesign-mockup.html`**（自包含 HTML，可切「提案 / 现状」与暗 / 亮，深链 `?variant=proposed|current&theme=dark|light`）
**现状证据：`docs/ui-audit/`**（真实浏览器截图 + 计算样式导出；可用 `scripts/ui-audit-shots.cjs` 重跑）

---

## 1. 结论先行

现状的问题**不是「不好看」**，而是**没有系统** —— 字体是浏览器默认系统栈，颜色是 2 863 处硬编码色板类，字号 92% 挤在 12/14px 两档（另有 147 处临时像素值），暗色主题靠 **841 个手写的 `:root.dark` 副本**堆出来，动效基本为零，`prefers-reduced-motion` 出现 **0** 次。

因此：

- 最大收益不在「换个皮肤」，而在**先立 token 层**（P0：不动布局与行为，纯系统性改造）；
- 其次才是重做主界面（P1）。
- 顺带修掉三类**确凿缺陷**（不是审美偏好，见 §3）：同一个图标表示两个不同入口；四个语义完全不同的下拉长得一模一样；面板里徽章比标题还亮。

方案已出**可看的度量稿**（暗/亮、提案/现状四种组合都真实渲染并做过运行时断言），而不是文字描述。

---

## 2. 实测现状（生产构建 + 真实页面，数字都可复跑）

测量方式：`vite build` 后用 `dist-cli` 起在 4190，无头真实浏览器（本机 Edge）1440×900 / 390×844；计算样式与截图由 `scripts/ui-audit-shots.cjs` 导出，原始数据在 `docs/ui-audit/current-computed-styles.json`。

| 维度 | 实测 | 说明 |
|---|---|---|
| 字体 | 系统栈 **100%**：`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, …` | 零自托管字体、零品牌字体；等宽也只用系统 `ui-monospace/Consolas` |
| 控件字号 | `button` 计算值 **16px**（继承 body），`textarea` **14px** | 控件之间没有字号体系 |
| 字号分布 | `text-xs` **215** + `text-sm` **162** = 377/407（**92%**）；`base` 13 / `lg` 7 / `xl` 4 / `2xl` 6 / `3xl+` 0 | 另加 **147 处 `text-[Npx]`** 临时值，等于没有阶梯 |
| 调色板 | zinc **2 130** / rose 230 / emerald 169 / amber 153 / sky 70 / slate 68 / red 23 / blue 16 / violet 4 | 6 个色系语义互串；`slate`(68) 与 `zinc`(2130) 承担同一角色 |
| 边框 | **10 种** zinc 色调（175 / 135 / 60 / 36 / 29 / 28 / 21 / 20 / 11 各档） | 分隔线没有层级语言 |
| 对比度 | `zinc-500` on `zinc-800` = **3.08:1**、on `zinc-900` = **3.67:1** | 而它正是**时间戳/次级说明**的用色，字号 12px → **不达 AA** |
| 动效 | 457 处 `hover:`，只有 **29** 处带 transition；`prefers-reduced-motion` **0** | 悬停是硬切；无减弱动效开关 |
| 无障碍 | `aria-*` 207 / `role=` 121 / `aria-label` 95（不差）；`sr-only` **0**，`focus-visible:` **17** vs `focus:` **52** | 键盘焦点基本不可见 |
| 样式结构 | `src/style.css` **2 961** 行 / `:root.dark` **841** 块 / `@apply` 675 / 自定类 848；`App.vue` **5 840** 行 | Tailwind v4 是 CSS-first（无配置文件）→ **`@theme` token 零使用** |
| 亮色主题 | `index.html` 的 `<body class="bg-slate-950">` + `theme-color #020617` 在亮色下**依然是近黑**；侧栏用 slate、其余用 zinc | 亮色是"另一套手写值"，不是同一套 token 的另一组取值 |

---

## 3. 三个确凿缺陷（当场就能承认，不需要审美争论）

1. **同一个图标表示两个不同入口**：侧栏 `Skills` 与 `Automations` 用的是**同一个闪电 SVG**，只靠翠绿/橙区分；而且那是 40×40 的**实心饱和方片**——整屏唯一的饱和元素，注意力从线程列表被抢走。（证据：`docs/ui-audit/current-sidebar-tools-tiles.png`）
2. **四个语义完全不同的下拉长得一模一样**：输入区的 `Default / Never / big-pickle / Medium` 分别是权限、沙箱、模型、推理强度，却同为 zinc-700 底 + zinc-400 字 + 12px + 全圆角；模型这一项还**直接暴露内部 id**，且排在第三位而不是首位。（证据：`docs/ui-audit/current-composer-dropdowns.png`）
3. **徽章比标题更亮**：技能库页把 `Auth unsupported` 做成实心浅色 pill，与卡片标题同权甚至更抢眼；同一块面板里混着 amber 分组标题、teal 复选框、绿/红 diff 计数——颜色在**装饰**而不是**表达状态**。（证据：`docs/ui-audit/current-desktop-skills.png`）

---

## 4. 方向（选定一个，执行到底）：控制台 / Instrument Panel

> 一句话：把这套界面从「一个深色网站」改成「**一台正在干活的机器**」——石墨底、机器口吻的等宽读数、颜色只用来表示状态、动作靠亮度与层级。

四条不可违背的规则（这是方案能被评审、也能被回归测试的地方）：

1. **颜色只表示状态。** 表面 4 级 + 墨色 4 级；强调色只有三个：`live`（琥珀，正在跑/待批准）、`ok`（玉，完成/已连接）、`alert`（珊瑚，失败/破坏性），外加 `model`（紫，**只用于模型身份**）。**主按钮用最亮的墨色而不是强调色**——琥珀严格留给"机器状态"，这样"颜色出现"就等于"有事发生"。
2. **一个家族，两种口吻。** 机器说话用等宽（状态、读数、路径、时间、标签、数字，全部 tabular numerals）；人说话用无衬线（正文、标题、用户内容）；展示字体只出现在品牌与空态，**永不进入用户内容**——中文内容一律走系统中文字体，保证 CJK 字形质量（也避免打包 CJK 字体的体积灾难）。
3. **状态必须可扫描。** 任何"机器正在做什么"都要有可扫的表示：运行 pip、耗时/字节读数、`OK/RUN` 徽记——而不是只有一只转圈的图标。这也是本方案的**签名组件**（工具调用行）。
4. **不新增装饰。** 不用渐变、不用毛玻璃、不用彩色阴影；秩序靠发丝线、表面层级、字距与一处点阵纹理建立。

### Token 规格（已写进度量稿，可直接抄）

```
暗色（默认）                       亮色
--s0 #0a0a0b   应用底 / 会话背景    --s0 #f7f7f9
--s1 #121214   侧栏 / 右面板        --s1 #f1f1f4
--s2 #17171a   卡片 / 输入区        --s2 #ffffff
--s3 #1f1f23   抬升（悬停行、下拉） --s3 #ffffff
--line-1 #26262b  发丝分隔          --line-1 #e3e3e8
--line-2 #3a3a42  强调边框          --line-2 #c9c9d2
--ink-1 #f2f2f4  标题/强调 15.6:1   --ink-1 #121215
--ink-2 #c9c9cf  正文      9.9:1    --ink-2 #3f3f46
--ink-3 #9a9aa3  次级文字  5.6:1    --ink-3 #63636d
--ink-4 #6b6b74  仅非文本  2.9:1    --ink-4 #a5a5ae
--live  #f0a53a  运行中/待批准      --live  #b26a12
--ok    #3ecf8e  完成/已连接        --ok    #1d7d54
--alert #ff5c5c  失败/破坏性        --alert #c62b2b
--model #a78bfa  仅模型身份         --model #6d4ad6
```

- `ink-4` **禁止用于任何文字**（只给分隔线、图标底、点阵纹理）——这样"最低一级墨色"就天然满足 AA，不需要每次用色都算一遍。
- 强调色在亮色下必须单独取值（上表右列），不能靠 `opacity` 或滤镜——否则必然掉到 AA 以下。
- 焦点环统一 `--line-focus`（暗 `#f0a53a` / 亮 `#b26a12`），2px + 2px offset。

### 排版阶梯（7 级，替代 147 处临时值）

| 阶梯 | 字号/行高 | 字体 | 用途 |
|---|---|---|---|
| micro | 11 / 1.4 · 字距 .09em · 大写 | Plex Mono 500 | 分组名、状态、面板小标题 |
| meta | 12 / 1.5 | Plex Mono 400 | 时间戳、读数、快捷键 |
| ui | 13 / 1.5 | Plex Sans 400/500 | 控件、列表行、面板正文 |
| body | 15 / 1.75 | Plex Sans 400 | 会话正文 |
| h3 | 18 / 1.3 | Plex Sans 600 | Markdown 三级标题（现状与粗体正文难以区分） |
| h2 | 24 / 1.25 | Plex Sans 500 | 页面标题 |
| display | 40 / 1.1 · −.025em | Bricolage Grotesque 600 | 空态 Hero（**仅品牌与空态**） |

字体族（全部 SIL OFL，latin 子集自托管，CJK 走系统）：

```
--font-display: "Bricolage Grotesque", "Plex Sans", "PingFang SC", "Microsoft YaHei", sans-serif
--font-sans:    "IBM Plex Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
--font-mono:    "IBM Plex Mono", ui-monospace, Consolas, monospace
```

### 动效

`120ms` 悬停/按压、`200ms` 面板与焦点环、`320ms` 路由进入，统一 `cubic-bezier(.22,.61,.36,1)`；并加全局 `@media (prefers-reduced-motion: reduce)` 归零。

---

## 5. 分期实施（每期独立可发布、可独立回滚）

**P0 · 立 token 与排版（不动布局与行为）**
- 在 `src/style.css` 增加 token 层（Tailwind v4 走 `@theme` 或直接 `:root`）；把现有语义类（`.sidebar-*`、`.content-*`、`.thread-*` …）的取值挂到 token 上。
- 自托管 4 个字重（Plex Sans 400/500/600、Plex Mono 400/500 按需）+ 1 个展示字体，放 `public/fonts/`，`font-display: swap`，`preload` 关键两枚。**不打包 CJK**。
- 落一个可复跑的检查：断言"新增裸色板类"与"`text-[Npx]` 数量不增"，以及 "`ink-4` 不出现在文本属性上"。
- 验收：`vue-tsc` / `vite build` / 全量 Vitest 与基线逐字一致；**行为零变化**（这一期应当没有视觉回归清单，只有"更整齐"）。

**P1 · 重做主界面**（侧栏 / 会话 / 输入区）
- 侧栏：拆图标语义（技能库用层叠/插头、定时任务用时钟）、工具入口降噪（40px 实心方片 → 22px 淡底片）、选中态改「中性 2px 导轨 + 表面抬升」（琥珀留给运行态）、线程行右侧等宽相对时间、运行中的线程加 pip。
- 会话：消息排版阶梯；Markdown 标题真正有层级；行内代码/代码块有楼层（语言标签 + 复制）；**新增工具调用行**（等宽命令名 + 右侧耗时/字节读数 + `OK/RUN` 徽记）作为签名组件。
- 输入区：模型前置并用 `--model` 标示；次要开关（权限/沙箱/推理）合并成一组；**一屏只有一个主按钮**（发送，用最亮墨色）；聚焦时琥珀焦点环 + 3px 光晕。

**P2 · 亮色与无障碍对齐**
- `body`/`theme-color` 跟随主题（修掉亮色下仍近黑的问题）、`slate` 并入 `zinc`/token、全部文字 ≥4.5:1、`focus-visible` 全覆盖、`prefers-reduced-motion` 生效、`sr-only` 补上图标按钮的文字。

**P3 · 次要界面与动效**
- 技能库/应用目录（卡片 → 行列表，去掉"字母头像"占位符：现在两个不同的 MCP 都显示 `C`）、Git 面板、各类弹窗与菜单；动效按 §4 统一。

---

## 6. 风险与代价（如实记录）

- **841 个 `:root.dark` 块**是 P0 的主要工作量。迁移是机械的（可脚本批处理），但**必须逐类人工确认语义属于「表面/墨色/状态」哪一类**，这部分不能自动化。
- **字体体积**：6 个 latin 子集 woff2 合计约 130KB（度量稿里实测：Plex Sans 400/500/600 各 22–24KB、Plex Mono 400/500 各 15KB、Bricolage 变量 41KB）。**绝不能打包 CJK**（中文全量动辄数 MB），中文一律走系统字体——这也是度量稿的做法。
- **换字体对首帧布局的代价可忽略**：round-88/89 已实测「合成 40 段 CJK 首次布局 1–11ms」，列在这里是为了免后人重测。
- **视觉回归面很大**：现有 312 份手测文档不覆盖视觉。建议新增一份「UI 契约」手测（token 用色、`ink-4` 禁用项、对比度、焦点可见），而不是逐页截图比对。
- **这是已发布产品**（npm `latest` = `codex-mobile-re@0.1.125`）：建议整体进下一个 minor，并同步 README 截图与 `theme-color`。
- **未测**：非 Windows 平台的字体回退（Android/Termux 走手机自带 CJK 字体）、真实高 DPI 屏下 1px 发丝线的可见性、用户对"颜色只表示状态"这一克制取向的接受度。

---

## 7. 待决策（三件事）

1. **方向是否采纳**「控制台 / Instrument Panel」；还是只做保守版（仅 P0：token + 排版，不碰布局与视觉语言）。
2. **展示字体要不要**：Bricolage Grotesque 仅用于品牌与空态（latin-only，中文 Hero 走系统中文字体）。不想要则 Hero 退回 Plex Mono，方案其余部分不变。
3. **P0 是否立即开工**：P0 不动布局与行为，随时可停且可回滚。

---

## 8. 附件与复现

- 度量稿：`docs/ui-redesign-mockup.html`（自包含；`?variant=proposed|current&theme=dark|light`）
- 现状证据：`docs/ui-audit/`（暗/亮桌面、移动端、技能库页截图 + 侧栏图块与输入区下拉的裁剪图 + 计算样式导出）
- 重跑审计：`PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/ui-audit-shots.cjs`
- 计数命令（本文件所有数字的来源）：
  - 调色板：`grep -rho "\b\(bg\|text\|border\|ring\)-\(zinc\|slate\|emerald\|amber\|rose\|sky\|violet\|red\|blue\)-[0-9]\{2,3\}" src/ | wc -l`
  - 字号：`grep -rho "\btext-\(xs\|sm\|base\|lg\|xl\|2xl\)\b" src/ | sort | uniq -c` / `grep -rho "text-\[[0-9]" src/ | wc -l`
  - 暗色副本：`grep -c "^:root.dark" src/style.css`
- 度量稿的运行时校验：无头浏览器 14 项断言（无页面错误、深链生效、两个变体在字体/表面/图块用色上**确实不同**、按钮切换确实改变计算值）全通过。
- **关于度量稿的可维护性**：`docs/ui-redesign-mockup.html` 是**自包含**产物（字体已 base64 内嵌），可以直接手改；本次用的模板与构建脚本（把 woff2 内联进 HTML）留在本机 `tmp/` 下、**未入库**（`tmp/` 被 gitignore）。若日后要用同一套流程重新生成，做法见用户级技能 `ui-design-audit-and-mockup`；也可以直接改这份 HTML 的 `CURRENT` 映射表来同步"现状"变体。

## 9. 实施记录

- 2026-09-23：出方案与度量稿，未改产品代码（待决策）。
