# round-120 · 设计审计三处机械小改：过冲缓动归队 / 裸 hex token 化 / 缓动家族统一

- 日期：2026-10-08（macOS / codex CLI 0.160.1 机器）
- 用户口径：「UI设计都改完了吗？」→ 按设计规范跑一次 `/audit` → 审计出 3 个真问题 + 2 个边缘项 → 用户拍板「可以」＝修掉其中机械的 ①②④（③ 空状态文案需 i18n 口径决策，本轮不动）
- 审计基线：frontend-design-pro 规范（动效/色彩/空间/交互/文案五类反模式清单），对已收口的 P0~P3 成果做逐项复核

## 一、审计结论（复核通过项）

P0~P3 的底子经全库反模式扫描确认扎实：

- **动效系统**：统一缓动家族 `cubic-bezier(0.22, 0.61, 0.36, 1)` + 全局 120ms 默认时长（`style.css:107`）；`style.css:216` 全局 `prefers-reduced-motion` 兜底（animation/transition/scroll 三类归零），3 处呼吸 pip 另有组件级归零
- **焦点可见性**：`:focus-visible` 全局兜底（`--line-focus` 两主题各自取值，`style.css:209`）+ 组件级 ring 普及，无「裸移除 outline」
- **色彩纪律**：`slate-*/zinc-*/gray-*` 裸 tailwind 类零残留（P2 收敛维持住）；暗色表面 `#09090b`（zinc-950）带色调非纯黑
- **字体**：IBM Plex Sans 自托管 6 枚 woff2 + PingFang SC，`system-ui` 仅作栈内 fallback（合规）
- **间距**：无 11/13/17/22px 类离群值
- **无 bounce/elastic 关键帧**（仅一处 back-out 缓动，见问题 ①）

## 二、审计发现与本轮修复（①②④）

### ① 过冲缓动 + 超长微交互 —— `QuestionJumpBar.vue`

- 现状：提问跳转点条 `width 400ms cubic-bezier(0.34, 1.56, 0.64, 1)`——y₂=1.56 是 back-out 弹性过冲（规范反模式「bounce/elastic 显得廉价」），且 400ms 超出微交互 100–200ms 区间；同文件 144 行入场动画用的却是标准家族缓动，自相矛盾
- 修复：`width 200ms cubic-bezier(0.22, 0.61, 0.36, 1)`（悬停波纹的 `transitionDelay` 递增不受影响）

### ② 裸 hex 绕过 token 层 —— `QuestionJumpBar.vue` + `style.css`

- 现状：`.question-jump-dot` 基类 `background: #d4d4d8 /* zinc-300 */`，且 `style.css:729` 另有暗色 raw 覆盖 `#3f3f46 /* zinc-700 */`
- 根因：QuestionJumpBar 是 **round-99（P3）** 新增的组件，晚于 round-98 的「暗色覆盖层退役」清查（清的是 tailwind 裸类，**组件内 raw hex 与后增暗色覆盖是盲区**）——两处都是漏网
- 判定：暗色覆盖值 `#3f3f46` 恰好就是暗色 `--line-2` 的取值 ⇒ 该 dot 语义就是 line token；修复＝
  - 基类改 `background: var(--line-2)`（亮色渲染从 `#d4d4d8` → `#c9c9d2`，同为浅灰带冷调、视觉近似，属 token 化正常微调）
  - **整块删除** `:root.dark .question-jump-dot` 覆盖（token 自动切主题，归队 round-98「暗色 raw 覆盖退役」纪律）

### ④ 缓动家族漏网档 —— `SidebarThreadRow.vue`

- 现状：运行 pip 呼吸动画用 `cubic-bezier(0.22, 1, 0.36, 1)`，与另两处 pip（`ToolCallRow.vue` / `WorkBlockItem.vue`）的 `cubic-bezier(0.22, 0.61, 0.36, 1)` 不一致
- 修复：归队统一家族（1.6s 时长与 reduced-motion 归零不动）

## 三、审计发现、有意不动（③⑤）

- **③ 空状态只陈述、无下一步**：`No messages in this thread yet.`（ThreadConversation.vue）、`No threads` / `No matching threads`（SidebarThreadTree.vue）均缺「下一步操作」（规范口径：空状态 = 原因 + 可执行动作，如搜索无结果 → 附「清除搜索」）。**需动 i18n 文案表与交互设计口径，超出本轮「机械小改」范围，留待用户拍板**
- **⑤ 4 处 spinner**（compaction 横幅 / live overlay / stop 按钮）：都是「进程进行中」指示而非内容加载，规范「skeleton 优于 spinner」针对的是内容加载场景，此处可保留

## 四、验证

- `vue-tsc --noEmit` → **EXIT=0**
- 全量 Vitest → **714/714 零失败**（74 文件，与 round-118/119 基线逐字相同）
- `check-ui-contract.cjs` → **38/38**（含「动效阶梯：120ms 默认时长 + 标准缓动在 @theme 定义」「`text-[Npx]` 清零」「字体资产」等项）
- `check-token-equivalence.cjs` → 本机无等值基线快照（`output/playwright/ui-audit/facts.json` 在另一台机器，round-117 已按彼时外观重置）；本轮 ② 是**有意**的颜色微调（`#d4d4d8`→`#c9c9d2`），等值基线下次重建时会记录为新外观

## 五、诚实边界

- ① 的过冲缓动源自 Reasonix 移植的「波」效果——去掉过冲后波纹仍是递增延迟的渐缩效果，但少了弹性回摆；若用户实机观感偏好旧弹性，可单独回退该值
- ③⑤ 未处置，理由见 §三
- 产品源码改动仅 3 文件 4 处（2 组件 + 1 style.css 删块），无逻辑变化；等值快照缺位使 ② 的视觉微调未经截图级对比，但 `--line-2` 两主题取值均为既定 token，风险极低
