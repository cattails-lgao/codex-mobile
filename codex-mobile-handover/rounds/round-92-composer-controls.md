# Round-92：输入区四个控件（缺陷②）——模型前置、次要开关成组、一屏一个主按钮（2026-09-24）

> **背景：** 承接 [round-91](round-91-sidebar-entry-defect.md)（P1 缺陷①）。用户口径「继续处理UI优化吧」，本轮做 UI 方案 §3 的**缺陷②**——输入区四个语义完全不同的下拉长得一模一样、模型排在第三位。选它的理由同上一轮：这是**审计里已经认定、不需要审美争论**的缺陷，属于方案 §5 的 P1「输入区」。
> 度量稿 `docs/ui-redesign-mockup.html` 是**已渲染、用户已认可**的视觉契约，本轮实现细节全部照抄它（`.chip` / `.chip.model` / `.send` 的尺寸、圆角、用色），而不是自己发挥。

---

## 1. 现象

**四个语义完全不同的下拉长得一模一样。** 输入区那四个控件实际是：`Default`（协作模式）、`Never`（审批策略）、`big-pickle`（模型）、`Medium`（推理强度）——同一排、同一尺寸、同一底色、同一字形，只能靠位置和文字去猜；而**模型排在第三位**。

改动前的实测（`docs/ui-audit/before-p1-composer-computed-styles.json`，桌面暗色线程页）：

| 采样点 | background | radius |
|---|---|---|
| `.thread-composer-model-control .composer-dropdown-trigger`（模型） | `rgb(63, 63, 70)` | `3.35544e+07px` |
| `.thread-composer-thinking-control .composer-dropdown-trigger`（推理） | `rgb(63, 63, 70)` | `3.35544e+07px` |
| `.thread-composer-plan-trigger`（协作模式） | `rgb(63, 63, 70)` | `3.35544e+07px` |
| `.thread-composer-approval-trigger`（审批策略） | `rgb(63, 63, 70)` | `3.35544e+07px` |

四个采样点**逐属性相同**（`radius` 那个数字是 Chrome 对 `rounded-full` 的钳位值，即全圆角）。截图留档 `docs/ui-audit/before-p1-composer-desktop-thread.png`。

---

## 2. 根因（代码确认）

两处**巧合叠加**：

1. 三个控件各写各的，但写出来的是同一套观感：`ComposerDropdown.vue` 的 `--pill` 变体是 `h-8 rounded-full border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700`，而 `ThreadComposer.vue` 里 `.thread-composer-plan-trigger, .thread-composer-approval-trigger` 是几乎逐字相同的 `h-8 rounded-full border border-zinc-200 bg-white px-2.5 text-xs text-zinc-700`。
2. **暗色覆盖把两者压成同一个样子**：`src/style.css` 的 `:root.dark .composer-dropdown-trigger--pill` 与 `:root.dark .thread-composer-plan-trigger, :root.dark .thread-composer-approval-trigger` 是**同一条声明**（`@apply border-line-3 bg-s3 text-ink-3 hover:border-line-4 hover:text-ink-1`）。复制粘贴的痕迹直接写在了暗色层里——这就是上表四个 `background` 完全相同的原因。

模板顺序（`ThreadComposer.vue`）：attach → Plan popover → Approval popover → `ThreadComposerModelControls`（内部再分模型 + 推理）。模型第三。

---

## 3. 修复

**（1）模型前置 + 用 `--model` 标示（`ThreadComposer.vue` / `ThreadComposerModelControls.vue`）**
把 `<ThreadComposerModelControls>` 移到两个 popover **之前**；模型芯片按度量稿 `.chip.model` 加 `border-model/40 bg-model/12 text-model`，并在模型名前补一个 `::before` 小点（`bg-current`，于是颜色自动跟随 `--model`，不必再写一遍色值）。「谁在干活」用紫、且不占用 `live/ok/alert` 三色——这是方案允许出现的第四个强调色。

**（2）四个控件改用「芯片」语言，不再与模型同款（`ComposerDropdown.vue` / `ThreadComposer.vue`）**
`--pill` 变体本身改写为中性芯片：`h-7 rounded-md border-line-1 bg-transparent px-2 font-mono text-xs text-ink-3`（等宽字＝机器口径、6px 圆角、发丝边框、无填充）。**改这个变体是安全的**——全仓库只有 `ThreadComposerModelControls.vue` 的两处 `variant="pill"` 在用它（已核）。plan/approval 触发器同样改写（`h-7`、透明底、无自带边框），折角改 `text-current opacity-70`。

**（3）次要开关成组（`ThreadComposer.vue`）**
新增 `.thread-composer-secondary` 容器：一层发丝外框 + 组内一条发丝分隔，把协作模式与审批策略包成一个整体；锚点加 `flex items-stretch`（`.composer-popover-anchor` 原是 block，行内级子元素会在下方留一截基线间隙）。

**（4）一屏一个主按钮（`ThreadComposer.vue`）**
发送/停止改 `bg-ink-1 text-ink-inv`（**最亮的墨色**，而非强调色）+ `rounded-md`；队列态从裸 `amber-600` 改为 `--live`（队列＝「当前轮结束后自动发出」，确实是机器状态，所以这支琥珀是语义色）。disabled 改为描边而非填充：`disabled:border-line-2 disabled:bg-transparent disabled:text-ink-4`——**亮色 `--s3` 当前是 `#ffffff`**（亮色 token 取值未定，见「已知偏离」），用 `disabled:bg-s3` 会让按钮在白底输入区里消失。

**（5）焦点环（`ThreadComposer.vue`）**
`.thread-composer-shell:focus-within` → `--line-focus` 边框 + `box-shadow: 0 0 0 3px color-mix(… 22%, transparent)`。

**（6）删掉那一整块暗色覆盖（`src/style.css`）**
`:root.dark` 下的 `thread-composer-submit` / `submit:disabled` / `plan+approval trigger` / `composer-dropdown-trigger--pill` / `pill 折角` / `plan+approval.is-active` / `thread-composer-stop` 共 7 条规则整块删除——基础规则改用 token 后两套主题各自取值，覆盖层只会把两套主题重新压成同一个样子。

---

## 4. 修复过程中抓到的第二个 bug（真 bug，值得单列）

**现象：** 改完第一版后，暗色下模型芯片是「**紫底 + 灰字**」——`background` 已是 `--model` 的 12% 淡底，`color` 却是 `rgb(161,161,170)`（`--ink-4`）；亮色下正常。

**根因（代码确认）：** `src/style.css` 的 `:root.dark .composer-dropdown-trigger { @apply text-ink-4 }` 与组件里的芯片规则**同权重（都是 0,3,0）**，谁赢只取决于样式表顺序——实测这条赢。`:root.dark .composer-dropdown-chevron { @apply text-ink-4 }` 同理（会让模型芯片的折角在暗色下也变灰）。

**这一类雷的形态：** 全局暗色层去改「组件自己要重新定义的类」。同权重时结果由打包顺序决定，本地看是好的、构建一变就可能翻。

**修复：** 两条全局规则都排除掉 `--pill`——`…:not(.composer-dropdown-trigger--pill)`；折角那条改写为 `:root.dark .composer-dropdown-trigger:not(.composer-dropdown-trigger--pill) .composer-dropdown-chevron`（**折角只出现在触发器内部**，全仓库仅 `ComposerDropdown.vue` 模板用到这个类，已核）。同时把模型芯片的 disabled 态**显式**写出来（原先同样靠同权重的顺序决定）。

---

## 5. 闸门（本轮的重点）

**顺序是关键：先把采样点补上并武装基线，再动代码。**

1. `scripts/ui-audit-shots.cjs` 采样点 **8 → 13**（`.thread-composer-model-control .composer-dropdown-trigger` / `.thread-composer-thinking-control .composer-dropdown-trigger` / `.thread-composer-plan-trigger` / `.thread-composer-approval-trigger` / `.thread-composer-submit`）。
2. 在**改动前**的构建上采集快照并用它**重新武装**基线 → 基线 **48 → 74 元素**。此时新采样点记录的是**旧值**——所以这轮改动**本来就应该被闸门报出来**。
3. 改代码 → 重采 → 等值检查报出 **112 项超差**，且**全部**落在这 5 个元素上：

   | 元素 | 超差项 |
   |---|---|
   | `.thread-composer-model-control .composer-dropdown-trigger` | 30 |
   | `.thread-composer-thinking-control .composer-dropdown-trigger` | 29 |
   | `.thread-composer-submit` | 19 |
   | `.thread-composer-plan-trigger` | 17 |
   | `.thread-composer-approval-trigger` | 17 |

   属性分布 `radius` 26 / `background` 26 / `border` 25 / `fontFamily` 20 / `color` 5。**没有任何一项泄漏到其它采样点**（侧栏、`body`、`textarea` 等全部逐字相同）——这才是这轮真正想证明的事。
4. 复核通过后，把新快照落为滚动基线并自检：**444/444 逐字相同**。改动前那份留档 `docs/ui-audit/before-p1-composer-computed-styles.json`。

**采样状态的不确定性（顺带修掉）：** 审计原先采到 enabled 还是 disabled，取决于「截图那一刻数据加载完没有」——那样闸门覆盖到的范围本身就是不确定的。已让审计显式等到模型控件可用（首页无活动线程，超时是预期结果）。
**如实更正：** 我在排查过程中一度把「模型芯片是灰字」误读成「采样采到了 disabled」，真正的原因是第 4 节那个权重 bug——审计脚本里的注释已按事实改正，不留错误论断。

**已知覆盖缺口（如实记录）：** 采样时草稿为空，`canSubmit` 为 false，因此 `.thread-composer-submit` 采到的是**disabled** 态；enabled 态（`bg-ink-1` 深底 + `text-ink-inv`）**没有被这份等值对照覆盖**，只有契约检查的静态断言（`bg-ink-1`）看着它。

---

## 6. 验证

- `vue-tsc --noEmit` 干净（`TSC_EXIT=0`）。
- `vite build` 通过，构建期无 `unknown utility class`（说明 `border-model/40`、`bg-model/12`、`font-mono`、`bg-ink-1`、`text-ink-inv`、`bg-live`、`text-current`、`brightness-110` 全部解析成功）。
- **UI 契约 20 → 24 项全过**（新增 4 条：模型控件排在协作模式/审批策略之前、模型芯片用 `--model` 标示、发送按钮用 `--ink-1`、队列态用 `--live`）。两个计数都朝对的方向动：亮色基线裸色板 **1107 → 1088**（−19），`style.css` 状态色裸类下降，`text-[Npx]` 仍 **147**（未增）。
- 主题 **15/15**、字体 **13/13**。
- 外观等值：见上节（改动后重新武装，自检 444/444）。
- 全量 Vitest **658 例 656 通过 / 2 失败**（2 例为既知 Windows 平台差异 `codexAppServerBridge.archive.test.ts` 的 symlink realpath 与 `mode 0o600` vs `0o666`，与 round-87~91 逐字相同）。**过程中的一次 3 失败**：`codexAppServerBridge.inlinePayload.test.ts` 有一个用例 5s 超时——那是并发负载下的抖动（同一文件单独重跑 **28/28 通过 / 174ms**），与本轮无关，特此说明以免后人误读。
- 浏览器实测读数（未入库脚本 `tmp/shoot-composer-chips.cjs`，暗/亮各一张 `.thread-composer-shell` 元素截图 → `docs/ui-audit/p1-composer-chips-{dark,light}.png`）：

  | 元素 | 字体/字号 | 高 | 圆角 | 前景 | 背景 |
  |---|---|---|---|---|---|
  | 模型芯片 | IBM Plex Mono 12px | 28px | 6px | 暗 `rgb(167,139,250)` / 亮 `rgb(109,74,214)`（＝两套 `--model`） | `--model` 12% 淡底（`oklab(… / 0.12)`），边 40% |
  | 推理芯片 | IBM Plex Mono 12px | 28px | 6px | `--ink-3` | `transparent` |
  | 协作模式 / 审批策略 | IBM Plex Mono 12px | 28px | 0（边框由分组提供） | `--ink-3` | `transparent` |
  | 次要分组容器 | — | 30px | 6px | — | 发丝外框 |
  | 发送 | — | 36px | 6px | `--ink-4`（disabled） | `transparent`（disabled） |

  `sameGlyph` 类判据不适用；关键是**四个采样点不再同款**：模型（紫 + 点）与其余三个（中性芯片）一眼可分，后者还合成了一组。

---

## 7. 明确不做 / 已知偏离

- **不做度量稿里的「更多」折叠弹窗**（`.chip.more`）。它会把本来常开的 **Plan 模式**多藏一次点击，属**行为变更**，需要新菜单组件 + 测试；方案 §5 的措辞是「次要开关（权限/沙箱/推理）合并成一组」，本轮按「**视觉成组、不藏功能**」实现。待评审。
- **偏离**：模型没有排到 attach 之前（度量稿里模型就是行首）。保持 attach 首位，因为它是一次性动作而不是配置项；四个**下拉**之间模型确已最前。
- **偏离**：次要分组整体 30px、芯片 28px（分组自带上下各 1px 边框），未强行拉齐。
- **偏离**：芯片字号用 `text-xs`(12px) 而非度量稿的 11px——契约里「`text-[Npx]` 计数只许不增」是硬闸门，写 11px 会立刻撑破；留待排版阶梯统一。
- **仍未定（唯一一项，未变）**：**亮色 token 的取值**。本轮已经吃到它的后果——亮色 `--s3` 是 `#ffffff`，`disabled:bg-s3` 会让按钮在白底上消失，只能改用描边。建议在 P1 主界面评审时一并定。
- **排版阶梯**仍按用户决定推迟（「先只做 token 化的部分、排版等看过 P1 主界面再一起做」），本轮**一行未动**。

---

## 8. 涉及文件

**产品代码**

- `src/components/content/ThreadComposer.vue` — 模板重排（模型前置）+ 次要分组容器 + 四个控件的芯片化 + 发送/停止的墨色与 disabled 描边 + 队列态 token + 焦点环。
- `src/components/content/ThreadComposerModelControls.vue` — 模型芯片的 `--model` 身份（含 `::before` 小点）与显式 disabled 态。
- `src/components/content/ComposerDropdown.vue` — `--pill` 变体改写为芯片语言；折角改 `text-current`；前置图标 `text-amber-500` → `text-live`。
- `src/style.css` — 删除 7 条已冗余的输入区暗色覆盖；两条全局暗色规则排除 `--pill`（第 4 节那个 bug）。

**闸门与证据**

- `scripts/ui-audit-shots.cjs` — 采样点 8 → 13；新增「等到输入区配置控件可用」。
- `scripts/check-ui-contract.cjs` — 新增 4 条输入区断言（20 → 24 项）。
- `docs/ui-audit/before-p1-composer-computed-styles.json`、`current-computed-styles.json`（滚动基线，重新武装）、`before-p1-composer-desktop-thread.png`、`p1-composer-chips-{dark,light}.png`、`p1-composer-desktop-thread.png`。

**文档**

- 本轮记录（本文件）、[sections/ui-redesign-plan.md](../sections/ui-redesign-plan.md)、[codex-mobile-handover.md](../codex-mobile-handover.md)、`tests/theme-layout-terminal/round-92-composer-controls.md` 与两处索引、`.workbuddy/memory/2026-09-24.md`。
