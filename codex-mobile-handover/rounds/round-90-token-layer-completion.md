# Round-90：把 P0 的 token 化真正做完（暗色层收口，亮色留给 P1）（2026-09-23）

> **背景：** 接 round-89 之后用户对 UI 方案（`sections/ui-redesign-plan.md`）的选择。方案里 P0 拆成「token + 排版」两块，我问「排版阶梯要在 86 个文件里动 500 多处……我直接开工，还是你想先只做 token 化的部分、排版等看过 P1 主界面再一起做？」，用户答：**「先只做 token 化的部分、排版等看过 P1 主界面再一起做」**。本轮据此只做 token 化，一行排版不动。
>
> 结论先行：**上一轮报的「token 层 + 深色迁移已完成」是不完整的**。它只覆盖了 `src/style.css`，而契约检查也只扫同一个文件——**闸门覆盖不到的地方等于没有闸门**。本轮把组件 `<style>` 里剩下的暗色覆盖类补完，并把闸门扩到全部 CSS 单元；同时查清了一件影响后续排期的事：**亮色的 token 化不能在本轮做**，原因不是工作量，而是**前置决策还没做**（详见「为什么亮色必须留下」）。

---

## 1. 需求

用户口径：**只做 token 化，排版留到看过 P1 主界面再一起做**。

拆解成三件事：

1. 确认 token 化到底做完了没有（不靠印象，靠扫描）；
2. 把没做完的部分做完，且**不得改变任何外观**（P0 的不变量就是「行为与外观零变化」）；
3. 把「token 化没做完」这件事变成一条会失败的检查，而不是靠人记得。

## 2. 发现一：暗色层还有 108 处没迁（而且闸门看不见它们）

**现象（实测）：** 扫全部 `.vue` 的 `<style>` 块——**1213 处裸 zinc/slate 颜色类，全部在 `<style>` 块内，模板/脚本里是 0 处**。按「暗色覆盖层 vs 亮色基线」切开：

| 层 | 数量 | 归属 |
|---|---|---|
| 暗色覆盖层（`:root.dark` / `:global(:root.dark)`） | **108** | 应在本轮迁完 |
| 亮色基线（其余） | **1105** | 需先定亮色调色板（见 §5） |

108 处分布在 8 个文件：`DirectoryHub` 34 / `SettingsDialog` 21 / `DirectorySkillsTab` 15 / `App.vue` 13 / `ThreadConversation` 12 / `ThreadTurn` 8 / `ThreadComposer` 3 / `SettingsAccountsPanel` 2。

**根因（代码确认）：** 上一轮的迁移脚本写死 `const FILE = 'src/style.css'`，只处理这一个文件；`scripts/check-ui-contract.cjs` 同样只读 `src/style.css`，却断言「深色覆盖层已无裸色板（全部走 token）」。**断言的覆盖面小于它的措辞**，于是「检查全绿」与「还有 108 处裸类」同时成立。这正是上一轮总结里那句「P0 已做完 3/5」的真实成色。

另外漏了 2 处 `ring-offset-*`（`style.css` 的 `.runtime-toggle-option:focus-visible` 与 `ThreadTurn`）——两者都不在旧检查的匹配属性里。

**修复：**

- `tmp/migrate-vue-dark-to-tokens.cjs`（一次性，未入库）把 108 处按与上次**完全同一张 MAP** 换成 token 类（`border-zinc-700 → border-line-2`、`bg-zinc-800 → bg-s2`、`text-zinc-400 → text-ink-4` …），另补 2 处 `ring-offset-zinc-900/950 → ring-offset-s1/s0`。20 个不同类名 100% 落在既有 MAP 内，**零未映射**。
- 亮色基线一处未动：迁移脚本用同一个栈式分类器只替换落在暗色区域内的类名；`src/style.css` 的浅色基线仍报 7 处、组件仍报 1105 处（合计 1112，与迁移前一致）。

**等值性不是论证出来的，是量出来的**：暗色 token 的取值逐字等于它替换掉的 zinc 阶梯（`--s2: #27272a` = zinc-800 …），所以暗色外观按构造不变；再用真实页面复核，见 §7。

## 3. 发现二：这套 UI 是**亮色为主**的（澄清架构，上一轮文档没说清）

迁移时被一个反直觉的现象绊住：模板里的类是 `bg-zinc-50/100`、`bg-white`、`text-zinc-700/900`、`border-zinc-200` ——**全是浅色调**。这套界面到底哪边是底？

**用像素探针裁决**（`tmp/probe-png-pixels.cjs`，把 PNG 解码到 canvas 后读点，不靠肉眼——我第一眼把两张截图都看成亮色）：

| 截图 | 侧栏 | 会话正文 | 右面板 |
|---|---|---|---|
| `current-desktop-thread-dark.png` | rgb(24,24,27) | rgb(9,9,11) | rgb(24,24,27) |
| `current-desktop-thread-light.png` | rgb(**241,245,249**) | rgb(255,255,255) | rgb(248,250,252) |

**结论：默认是亮色**（侧栏亮色下是 **slate-100**，不是 zinc），暗色是 `src/style.css` 里 841 个 `:root.dark` 覆盖层堆出来的。源码侧对应：`.desktop-layout { @apply bg-slate-100 text-slate-900 }` 是亮色基线，`:root.dark .desktop-layout { @apply bg-s1 text-ink-1 }` 是暗色覆盖。

这条澄清有直接后果：**token 化天然分两半**，而两半的难度完全不同——

- **暗色半边**（本轮做完）：token 值 = 原 zinc 值，纯机械替换，可证等值；
- **亮色半边**：亮色 token 的取值决定「亮色长什么样」，那是设计决策。

## 4. 修复二：组件要用 token，`@reference` 必须改指向

迁完之后构建**直接失败**，报错原文：

```
[@tailwindcss/vite:generate:build] Cannot apply unknown utility class `border-line-2`
file: src/App.vue?vue&type=style&index=0&scoped=eeb63564&lang.css
```

**根因：** 54 个组件 `<style>` 块写的是 `@reference "tailwindcss";`，它只把**框架默认主题**（Tailwind 自带调色板）带进 `@apply` 的解析范围，**看不见项目在 `src/style.css` 里用 `@theme` / `@theme inline` 定义的那套 token**。所以 `@apply bg-slate-100` 能过，`@apply bg-s1` 不能。

**修复：** 按 Tailwind v4 的推荐做法，把这 54 处改为指向项目样式表本身（`src/App.vue → "./style.css"`、`src/components/**/*.vue → "../../style.css"`，路径按文件位置算、用 posix 分隔符）。`@reference` 只读主题、不输出 CSS，所以不影响产物。

**这是本轮的必要前置**：不修它，后续任何「在组件样式里用 token」的改动都会在构建期炸掉——包括 P1 的排版与主界面。

## 5. 为什么亮色必须留下（不是偷懒，是前置决策没做）

想「顺手把亮色也 token 化」会立刻撞上一件事：**已提交的亮色 token 取值，与现在亮色实际渲染的取值不是同一套**。

| token | 已提交的亮色值 | 亮色下实测渲染 | 差 |
|---|---|---|---|
| `--s0`（应用底） | `#f7f7f9` | 内容区 `#ffffff`、外层 `#f8fafc` | 不同 |
| `--s1`（侧栏） | `#f1f1f4` | **`#f1f5f9`（slate-100）** | G+4 B+5 |
| `--ink-1` | `#121215` | `text-slate-900` = `#0f172a` | 色系不同（中性 vs 冷调） |
| `--ink-4` | `#a5a5ae`，**契约明令不得承载文字** | 模板正把 `text-zinc-400`（`#a1a1aa`）当文字用 | 规则冲突 |

也就是说：**亮色 token 的一组取值就等于「亮色要长成什么样」**，而这套值目前是我按方案的「中性石墨」写的、并非现状的「冷调 zinc/slate」。现在把模板类换成 token，等于**顺手把默认（亮色）主题换了个色调**——那不是「token 化」，那是 P1 的设计评审内容。而用户在方案里明确说了要**看过 P1 主界面再定**。

再者，审计阶段已经把「侧栏用 slate、其余用 zinc」列为一个**确证缺陷**（同一角色两套色系）。所以亮色 token 化的正确顺序是：**P1 定下亮色取值 → 再统一替换**。本轮把它量清楚（1112 处）并写进闸门基线，就是从「不知道还剩多少」变成「知道还剩多少、且知道为什么不能现在做」。

## 6. 闸门修正：把「覆盖不到」变成「会失败」

`scripts/check-ui-contract.cjs` 重写扫描部分：

- **扫描全部 CSS 单元**：`src/style.css` + 每个 `.vue` 的每个 `<style>` 块（本轮为 **56 个单元**），而不是只扫 `style.css`；
- **属性表补 `ring-offset-*`**（旧的属性表没有它，这 2 处就是这么漏的）；
- 新增断言：**组件的 `@reference` 必须指向项目样式表**（否则「token 类不可 `@apply`」这个坑会以构建失败的形式再次出现）；
- 判块改用**逐字符栈式扫描**，不再逐行正则。

**逐行正则会读错状态**（第一版分类器就这么错了）：`}` 与 `{` 不在同一行时，上一行的 `}` 会留在缓冲里、和下一行的 `{` 记成同一条，于是暗色状态刚压入就被弹出。第一版跑出的结果是 `dark=0 / light=2389`，而真值是 `dark=108 / light=1105`——**数字看起来「很干净」，其实是分类器坏了**。改成按字符扫 `{}`、按栈判暗色后总数 1213 与独立统计逐字吻合。

> 附带记录一个自摆的乌龙：重写检查脚本时我把 `DARK['--s3']` 误写成 `DARK['s3']`（HEAD 版本本来是正确写法），脚本一跑就 `TypeError` 崩了。重写不等于改进——**改完必须立刻跑一遍**，否则「更好的检查」只是没跑过的字符串。

## 7. 验证

**（1）外观等值（本轮的核心断言，含亮色）**

`PROFILE_BASE_URL=http://127.0.0.1:4190 node scripts/ui-audit-shots.cjs` 重新采集真实页面，与改动前基线 `docs/ui-audit/current-computed-styles.json` 逐属性比对：

```
元素 37 个 · 属性 222 项
  逐字相同          222
  仅记法不同        0
  上游舍入（≤2/255） 0
  超出容差（>2/255） 0
```

比的是 **fontFamily / fontSize / background / color / border / radius 六项全比**，不只是颜色；基线里同时含**暗色 6 个页面 + 亮色 1 个页面**，所以「亮色没被动」同样被覆盖。**222/222 逐字相同**，不是「差异在容差内」。

**（2）契约与其它检查**

| 检查 | 结果 |
|---|---|
| `scripts/check-ui-contract.cjs` | **18/18 通过**（暗色层裸类 **0**，扫描 56 个 CSS 单元；亮色基线 1112 处，与基线一致） |
| `scripts/check-theme.cjs` | **15/15 通过** |
| `scripts/check-fonts.cjs` | **13/13 通过** |
| `vue-tsc --noEmit` | 干净（exit 0） |
| `vite build` | 通过（`✓ built`） |
| 全量 Vitest | **658 例：656 通过 / 2 失败**——2 例为既知 Windows 平台差异（`codexAppServerBridge.archive.test.ts` 的 symlink realpath 与 `mode 0o600` vs `0o666`），与 round-89 基线逐字相同 |

**（3）性能审计**

本轮的运行时行为**零改动**：没有新增/删除任何请求、缓存、监听器或阻塞路径，改的全部是「同一个颜色值的两种写法」。唯一可测的代价是 **CSS 产物字节**，故做了 HEAD ↔ 当前 的构建 A/B（先备份 `src/`，`git checkout HEAD -- src` 构建量一次，再用备份恢复重建量一次，两次构建的产物总量逐字一致，说明恢复是精确的）：

| 构建 | CSS 合计 |
|---|---|
| HEAD（迁移前） | **763,965 B** |
| 本轮（迁移后） | **759,527 B** |
| 差 | **−4,438 B（−0.58%）** |

变小是预期的：108 处 zinc 工具类失去引用后被裁掉，而 token 工具类**本来就已经被 `style.css` 生成**，所以是净减。JS 产物无变化。

**明确未测**：非 Windows 平台的字体回退与发丝线在高 DPI 屏上的观感（与上轮同样的未测项，本轮未触及这两件事）；真实浏览器（非 headless）的人工观感。

## 8. 明确不做（连同依据一起记，免得后人重试）

- **排版阶梯**：用户下令推迟到「看过 P1 主界面」再一起做。`text-xs` 215 处 / `text-sm` 162 处 / `text-[Npx]` 147 处**一处未动**，契约里「临时字号不增（基线 147）」仍绿。
- **亮色基线的 token 化**（1112 处）：**前置决策未做**，见 §5。已写进契约基线，只能持平不能增。
- **状态色**（`style.css` 内 250 处 rose/emerald/amber/sky/red/blue/violet）：属 P1（要按「颜色只表示状态」重新归类为 `live`/`ok`/`alert`，不是机械替换）。
- **P1/P2/P3 的一切布局与视觉变动**：本轮零。

## 9. 涉及文件

- 代码（提交 `03da220`，56 文件 / +223 −186）：
  - 8 个组件的 `<style>` 暗色覆盖层：`src/App.vue`、`src/components/content/DirectoryHub.vue`、`DirectorySkillsTab.vue`、`ThreadConversation.vue`、`ThreadTurn.vue`、`ThreadComposer.vue`、`src/components/settings/SettingsDialog.vue`、`SettingsAccountsPanel.vue`（共 108 处类名）；
  - `src/style.css`：1 处 `ring-offset-zinc-900 → ring-offset-s1`；
  - 54 个 `.vue`：`@reference "tailwindcss"` → 指向 `src/style.css`；
  - `scripts/check-ui-contract.cjs`：扫描范围扩到全部 CSS 单元、补 `ring-offset-*`、新增 `@reference` 断言（18 项）。
- 未入库（`tmp/`，被 gitignore）：`migrate-vue-dark-to-tokens.cjs`（迁移脚本，含完整 MAP）、`analyze-style-dark-light.cjs`（暗/亮分类计数）、`fix-style-reference.cjs`、`probe-png-pixels.cjs`（像素探针）。
- 手测：`tests/theme-layout-terminal/round-90-dark-token-layer-completion.md`。
- 方案文档同步：`sections/ui-redesign-plan.md`（P0 完成度与相位变更）、`sections/commit-history.md`、总入口快照/索引/未完成事项/落款。

## 10. 相位变更记录（方案原表 → 实际）

| 项 | 方案原文 | 实际 | 原因 |
|---|---|---|---|
| 亮色 `body` / `theme-color` | P2 | **已提前到 P0** | round-89 后顺手修的「亮色下 body 仍近黑」，是确证缺陷不是设计决策 |
| 组件 `<style>` 暗色覆盖层 token 化 | 未单列（隐含在 P0「dark 层」里） | **P0 本轮补齐** | 上一轮只扫了 `style.css`，属漏做 |
| 组件 `@reference` 改指向 | 未列 | **P0 本轮新增（必要条件）** | 不修则组件样式无法使用 token 类 |
| 亮色基线 token 化（1112 处） | P2 | **P2，且需 P1 先定亮色取值** | 取值即设计，见 §5 |
| 排版阶梯 | P0 | **推迟到 P1 之后** | 用户决定：看过 P1 主界面再一起做 |
