# round-97 · 亮色收敛（裸色板清零 + a11y 兜底）

日期：2026-09-24 · 前置：用户免审授权；亮色取值已在代码中定案（§7 记录）

## 1. 决策落定：亮色 token 取值

§7 的唯一待决事项就此关闭：**采用方案原值（中性 `#f7f7f9/#f1f1f4/#ffffff…`）**。依据：这些值早已是代码中 `:root` 块的实际取值（§4 注记「亮色 token 当下取的就是右列」），且度量稿（用户已认可）即按此渲染——待决的从来不是「选哪套值」，而是「把消费者迁过来」。修复的双色系缺陷：侧栏 slate 冷调 + 其余 zinc 微紫 → 同一套中性。

## 2. 收敛 sweep（1924 + 14 处，53 文件）

映射原则：**暗色渲染由 `:root.dark` 覆盖层继续接管（本轮不动），替换只需对亮色正确**。

- **zinc/slate 逐档对位**（亮值就近）：`bg-white→s2`、`bg-zinc-50→s0`、`bg-zinc-100→s1`、`bg-zinc-200→line-1`（#e4e4e7≈#e3e3e8）、`bg-zinc-700/800→s-inv-soft`、`bg-zinc-900/950→s-inv`；文字按 P2「全部文字 ≥4.5:1」**整体提亮一档**：`text-zinc-400/500→ink-3`（原 400 在白底仅 2.5:1）、`800→ink-2`、`900→ink-1`；边框 `200/300→line-1/line-2`…
- **sky/blue（信息/链接语义，token 集无此角色）→ 墨/线中性**：信息横幅变中性面板、链接 `text-blue-600→ink-1`；`QuestionJumpBar` 的 canvas 常量 `#3b82f6` 改为**运行时读 `--live`**（问题标记＝「注意」语义）。
- **状态色剥档位**：`emerald→ok`、`rose/red→alert`、`amber→live`、`violet→model`（保留 `/NN` 修饰符）；浅色状态文字在深色状态底上的改 `ink-inv`。
- `text-white→text-ink-inv`（反色底上的墨，两主题各自取值）。
- 漏网补刀：`placeholder-zinc-400→placeholder-ink-3`、`border-t-zinc-600→border-t-line-5`（sweep 正则没覆盖 placeholder-/方向性 border 形态——**要与契约 NAKED_NS 同口径**）。

## 3. 自伤与恢复（重要教训）

sweep 把 **`:root.dark` 覆盖块内**的 zinc/状态档位也替换了——暗色下 `bg-amber-950/50→bg-live/50` 会把权限提示洗成亮橙（暗色 live 是亮琥珀，状态档位没有单值 token 等价）。**恢复脚本**：从 `git archive HEAD` 备份中把 674 个暗色块体逐块还原（按选择器配对），再单独重放 round-96 阶梯映射。恢复后用等值检查裁决：**暗色页 0 差异、29 项全落亮色页**——「暗色不动」从断言变成了实测。

架构结论：**批量 sweep 必须按「主题作用域」分层**——token 工具类自动切主题，但 raw 档位类（amber-950/50 这类）在暗色块里是语义正确的暗值，不能被亮色视角的映射波及。

## 4. a11y 兜底（P2）

- 全局 `:focus-visible { outline: 2px solid var(--line-focus); offset 2px }`——组件自带的 `focus-visible:ring` 均伴随 `outline-none`（更高优先级），只有无焦点样式的元素吃到兜底；补了 ThreadTurn 一处缺 `outline-none` 的 ring。
- 全局 `prefers-reduced-motion: reduce` 归零块（组件级呼吸动画此前已各自处理）。
- `index.html` 核验：body 已无裸类、theme-color 已随主题（round-90 已修）。

## 5. 契约与验证

- 契约 33/33：亮色裸色板断言从「不增（≤1112）」收紧为「**清零**」（暗色覆盖块之外的 zinc/slate 裸类 = 0）。
- 等值：重采 29 项差异**全部落在亮色页**（slate-100→s1、slate-900→ink-1、zinc-600→ink-3 等 hue 收敛），暗色页 0；复核后重新武装，自检 0 差异。
- `vite build` ✓ · `vue-tsc` 0 · 主题 15/15 · 字体 13/13 · Vitest 656/658（2 平台差异 + inlinePayload 并发抖动单跑 28/28）。
- 证据：`docs/ui-audit/p2-light-sidebar-light.png`（中性侧栏 + 统一亮色）、`p2-light-conversation-light.png`、`p2-light-sidebar-dark.png`（暗色不变对照）。

## 6. 遗留（如实）

- **暗色覆盖层的退役**：268 个 raw 档位类仍留在 `:root.dark` 块里（amber-950/50、zinc-400 等是正确的暗值）；它们对 token 的收敛需要「每块人工判读 token 角色」而非 shade 映射，属后续轮次。
- `sr-only` 补图标按钮文字：抽查图标按钮均已有 `aria-label`，未做全量清点。
