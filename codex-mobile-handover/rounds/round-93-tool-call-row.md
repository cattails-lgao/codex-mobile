# Round-93：会话区签名组件「工具调用行」——等宽命令名 + 读数 + OK/RUN 徽记（2026-09-24）

> **背景：** 承接 [round-92](round-92-composer-controls.md)（P1 缺陷②）。用户看过输入区后口径「输入块的样式还可以，下一步做什么呢」→ 本轮做 UI 方案 §5 P1 会话区里**唯一被称作「签名组件」**的东西：工具调用行（等宽命令名 + 右侧耗时/字节读数 + `OK/RUN` 徽记）。它定下会话区的口径，后面的代码块楼层、Markdown 层级、线程行都顺着这套语言走。
> 实现细节照抄度量稿 `docs/ui-redesign-mockup.html` 的 `.toolrow`（grid `14px 1fr auto auto` / 8×12px 内距 / 10px 圆角 / `--line-1` 发丝边 / `--s2` 表面 / 运行态边框转 `--live` 40%）。

---

## 1. 现象

**「机器正在做什么」不可扫描。** 改动前的工具调用是两排纯文字朴素行：

- **命令行（`WorkBlockItem.vue`）**：表头只显示「第 N 步 + **Command** 这个词 + 状态文案」——**真实命令折叠之后才可见**；状态是 spinner / `✓` / `✗` + 本地化文案（「完成」/「Exit 1」）。**没有任何读数**：耗时没有，输出字节数只在「输出被截断」的提示行里出现过。
- **MCP 工具行（`ToolCallRow.vue`）**：`🛠` emoji + server 小芯片 + 工具名 + 状态文案，同样没有读数（`durationMs` 数据明明有）。
- 颜色：`#737373` 硬编码（round-23 的「工具文字」规范）+ `amber/emerald/rose` 裸类，且 `style.css` 的全局暗色层还压着同一批类（`:root.dark .work-block-command` / `.tool-call-name` 等十余条）。

## 2. 采样现场

默认审计线程（`01a0238c…`）里**没有任何**命令/工具行——采样点会全部落空。从 `.codex` 会话日志里找富线程：全局 home 的 20 份 rollout 里 `command_execution` 均为 0（CLI 写的是 `custom_tool_call`），但 `01a04679-d12b-7350-b560-9013a9a7dee1` 有 360 条 `custom_tool_call`；在 UI 里实际渲染 **78 条命令行 + 50 条 MCP 工具行**（`tmp/probe-toolrows.cjs` 实测）→ 它成为本轮的采样线程。

## 3. 修复

1. **卡片形态（度量稿 `.toolrow`）**：`.work-block` 与 `.tool-call-block` 改为 10px 圆角 + `--line-1` 发丝边 + `--s2` 表面 + `px-3 py-2` 的安静卡片，hover 边框转 `--line-2`；运行态边框转 `--live` 40%（写在 `:hover` 之后，同权重下后者胜出，悬停不会盖掉运行态）。
2. **pip 状态点**：14px 网格列里放 6px 圆点——`--ok`（完成）/ `--alert`（失败系）/ `--live`（运行中，带 22% 光晕 + 1.6s 呼吸动画，`prefers-reduced-motion` 归零）。spinner 与 `✓/✗` 退场。
3. **等宽命令名前置**：真实命令直接上表头（`text-ink-1` + `font-mono` + 截断），不再只写「Command」这个词；MCP 行为 `server · tool`。
4. **读数（诚实数据）**：命令行给**输出字节**（有 spill 用 `totalBytes`，否则按 UTF-8 估 `aggregatedOutput`）——协议里命令执行**没有时长字段**，不编数据；MCP 行给真实 `durationMs`（`823ms` / `1.9s`）。读数用等宽 + `tabular-nums`（机器口径）。
5. **机器口径徽记**：`OK / RUN / FAIL / EXIT n / SKIP / STOP`（等宽大写 + `tracking-[0.08em]`，颜色只走 `--ok/--live/--alert`）。本地化状态文案不丢——挪进 `title` / `aria-label`。原先的序号点（step N）退场，步骤信息保留在 tooltip 里。
6. **删全局暗色覆盖（`src/style.css`）**：`.work-step-dot` ×4、`.work-block-command`、`.work-block-status`、`.tool-call-server/name/status` 及 running/ok/error 变体共 11 条整块删除——组件改用主题感知 token 后两套主题各自取值，全局层再写一份就是 round-92 那个同权重雷。`.work-block-output-wrap`（深色输出区）与权限提示的覆盖**保留**（不归本轮管）。

## 4. 过程中抓到的两个坑

- **重写丢功能**：整体重写 `WorkBlockItem.vue` 时把 `permissionHint`（权限受阻提示，round-76 时代的功能）整个丢了，模板还在引用——`vue-tsc` 抓到 `TS2339`。已补回。**教训：重写 SFC 时逐段核对 script 的导出成员与模板引用。**
- **`.message-stack` 是无样式 flex 子项**：`.message-row` 是 flex 容器，`.message-stack` 没有任何宽度样式 → 内容多宽就多宽。实测命令行卡片 706px（全列宽，被 `.work-block-list` 的 `w-full` 撑起）而 MCP 行只有 216–239px、参差。修法：`ToolCallRow.vue` 给自带的 `.message-row` / `.message-stack` 显式 `w-full min-w-0`（自带模板不经过 ThreadConversation 的 scoped 规则）→ 实测 706px，与命令行一致。

## 5. 闸门（先武装、再改代码）

1. `scripts/ui-audit-shots.cjs`：采样点 **13 → 20**（`.work-block` / `.work-block-header` / `.work-block-command` / `.work-block-status` / `.tool-call-block` / `.tool-call-name` / `.tool-call-status`，只在工具线程页有值）；新增 `desktop-dark-tools` / `desktop-light-tools` 两页（富线程 600+ 条消息，等待放宽到 6s，配置控件可用等待放宽到 20s）。
2. **改动前**采集并重新武装基线：**74 → 114 元素 / 684 属性**，自检 **684/684 逐字相同**。改动前那份留档 `docs/ui-audit/before-p1-toolrow-computed-styles.json`（74 元素）。
3. **采样状态的确定性（顺带查明）**：工具页的模型控件**永远 disabled**（40s 也不启用，线程数据相关、与构建无关）——不是 round-92 那种「采到哪套看运气」的竞态，基线稳定。
4. 改代码 → 重采 → 等值检查报出 **36 项超差**，**全部**落在 7 个工具行采样点 × 2 页（`work-block` 3 + `work-block-command` 2 + `work-block-status` 4 + `tool-call-block` 3 + `tool-call-name` 2 + `tool-call-status` 4，每页 18 项），**泄漏 0**（侧栏、body、textarea、composer 等全部逐字相同）。
5. 复核通过后重新武装，自检 **684/684 逐字相同**（宽度修复不影响采样属性，仍逐字相同）。

**已知覆盖缺口（如实记录）**：① `pick()` 只采每页第一个匹配——徽记采到的是首行的 `OK` 态，`RUN/FAIL/EXIT` 三种徽记样式不在等值覆盖内（契约的静态断言看着 token 用法）；② pip / metric 是**新增元素**，基线里没有对应物，等值检查天然覆盖不到（同样只有契约静态断言）。

## 6. 验证

- `vue-tsc --noEmit` 干净（修复第 4 节第一坑后）。
- `vite build` 通过（36.5s / 39.7s 两次，无 unknown utility class——`rounded-[10px]`、`tracking-[0.08em]`、`bg-ok/alert/live`、`text-ok/alert/live` 全部解析成功）。
- **UI 契约 24 → 26 项全过**（新增：工具行状态色只用状态 token——`#737373` 与 `amber/emerald/rose` 500/600 阶已清，权限提示面板的 amber-50/200/800 属警示表面不在此列；命令名/读数/徽记都用等宽）。
- 主题 **15/15**、字体 **13/13**、等值见上节。
- 全量 Vitest **658 例 656 通过 / 2 失败**（与基线逐字相同的 Windows 平台差异）。**过程中的一次 3 失败**：与截图脚本并发跑时的抖动，无并发重跑即回到 2 失败——round-92 已有同款教训，跑全量前确认没有别的重活。
- 浏览器实测（`tmp/shoot-toolrows.cjs`，元素特写 → `docs/ui-audit/p1-toolrow-{dark,light}-{command,mcp,expanded}.png`）：卡片 10px 圆角 / 发丝边 / `--s2` 表面；命令名等宽 12px `--ink-1`；读数 `11.2 KB` / `1.9s` 等宽 12px `--ink-3`；徽记 `OK` 绿（暗 `rgb(62,207,142)` / 亮 `rgb(29,125,84)`＝两套 `--ok`）、`FAIL` 红（`--alert`）；暗/亮两套主题各自正确。宽度实测命令行与工具行均 **706px**。

## 7. 明确不做 / 已知偏离

- **偏离**：读数与徽记字号用 `text-xs`(12px) 而非度量稿的 11px/10px——「`text-[Npx]` 只许不增」是硬闸门；留待排版阶梯统一。
- **偏离**：读数用**等宽**——度量稿 `.metric` 忘了写 `font-family`（落在 sans 上），按方案 §4 自己的「等宽＝机器口径」原则取等宽。度量稿与方案的这处不一致，取方案。
- **卡片形态与 round-16/17 反馈的张力（待评审）**：round-16/17 用户反馈「命令块太显眼」去掉了卡片；本轮按**用户已认可的度量稿**把卡片请回来——但这是发丝边 + `--s2` 的安静形态，与当初被去掉的粗边框高对比卡片不是一回事。若用户不认可，退回朴素行只保留 pip + 等宽 + 徽记即可（结构不变，删三条声明）。
- **诚实数据**：命令执行协议没有时长字段，读数只给字节。要做耗时需要桥层在 `inProgress → completed` 之间记录时间戳，属功能变更，本轮不做。
- **未动**：`ToolBatchBlock.vue`（🛠 emoji + zinc 裸类的折叠头）、代码块输出区（`bg-zinc-900` 等，属下一项「代码块楼层」）、`ReasoningBlock`。
- **排版阶梯**仍按用户决定推迟，本轮 `text-[Npx]` 计数未增（147）。
- **仍未定（唯一一项，未变）**：亮色 token 取值。

## 8. 涉及文件

**产品代码**

- `src/components/content/WorkBlockItem.vue` — 表头改为 toolrow（pip + 真实命令 + 字节读数 + 徽记）；补回险些丢失的 `permissionHint`。
- `src/components/content/ToolCallRow.vue` — 同款 toolrow（`server · tool` + `durationMs` 读数 + 徽记）；自带 `.message-row`/`.message-stack` 显式拉伸。
- `src/style.css` — 删除 11 条工具行相关的全局暗色覆盖；`.work-block-list` 间距 0.25rem → 0.375rem（卡片需要呼吸）。

**闸门与证据**

- `scripts/ui-audit-shots.cjs` — 采样点 13 → 20；新增工具线程两页与 `TOOLS_THREAD_ID`。
- `scripts/check-ui-contract.cjs` — 新增 2 条工具行断言（24 → 26 项）。
- `docs/ui-audit/before-p1-toolrow-computed-styles.json`、`current-computed-styles.json`（重新武装，114 元素）、`before-p1-toolrow-desktop-tools.png`、`p1-toolrow-{dark,light}-{command,mcp,expanded}.png`。

**文档**

- 本轮记录（本文件）、[sections/ui-redesign-plan.md](../sections/ui-redesign-plan.md)、[codex-mobile-handover.md](../codex-mobile-handover.md)、`tests/theme-layout-terminal/round-93-tool-call-row.md` 与两处索引、`.workbuddy/memory/2026-09-24.md`。
