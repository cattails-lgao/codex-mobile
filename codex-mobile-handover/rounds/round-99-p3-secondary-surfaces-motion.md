# round-99 · P3 次要界面与动效

日期：2026-09-28。范围＝方案 §5 的 P3 行：「技能库/应用目录（卡片 → 行列表，去掉字母头像占位符）、Git 面板、各类弹窗与菜单；动效按 §4 统一」。至此 P0/P1/P2/P3 四期全部落地。

## ① 动效按 §4 统一

- `style.css` 的 `@theme` 加 `--default-transition-duration: 120ms` 与 `--default-transition-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1)`——Tailwind 的 `transition` 工具类直接读这两个变量，**一处生效全站**（原先 150ms + Tailwind 默认 ease）。悬停/按压 120ms 从此是默认值。
- 面板/焦点 200ms：`composer-popover-in` 两处定义（style.css + ComposerPopover.vue）150ms ease-out → 200ms 标准缓动；`QuestionJumpBar` 入场 0.18s → 200ms（保留 0.08s 延迟）。顺带修掉 ComposerPopover 焦点环里漏网的裸色 `#3b82f6` → `var(--line-focus)`（round-97 只扫类名，CSS 内裸色值管不到）。
- 路由进入 320ms：全站**没有 `<router-view>`**——路由切换＝App.vue 的 `.content-body` 直接换子元素。CSS 动画恰好只在子元素挂载时跑一次，于是 `.content-body > *` 挂 `route-enter 320ms`（淡入 + 4px 上移）即得「路由进入」，零模板改动；reduced-motion 由全局归零块接管。首轮路由（页面加载）也会淡入，属预期效果。

## ② 目录/技能库：卡片 → 行列表，去字母头像

问题实证：字母头像占位符用 `charAt(0)`，不同实体首字相同就完全无法区分——两个不同 MCP 都显示「C」，Composio 预置的六个连接器占位符干脆是写死的 `initial: 'G'/'C'/'R'…`。

- **删除全部 10 处字母占位符**（Plugins/Apps/Composio×4/SkillsTab MCP×1/SkillCard×1/DirectoryHub 两处弹窗头），**真实 logo/avatar 图片一律保留**；`fallbackStyle` prop 链路（DirectoryHub → PluginsTab）与 `ComposioPreviewConnector.initial` 数据字段一并退役。
- **网格 → 单列行列表**：`.directory-grid` / `.skills-hub-grid` / `.composio-preview-grid` / `.mcp-skill-grid` 四处 grid → `flex flex-col gap-2`；卡片去 `min-h-36` 与 `hover:shadow-sm`、`p-3 → p-2.5`、图标 40px 圆角方块 → 28px `rounded-lg`、描述 line-clamp-3 → 2（SkillCard → 1）。
- 死样式清理：`.directory-list` / `.directory-card-toggle`（仅定义无消费者）、`.composio-fallback`、`.directory-mcp-detail` 全局重复定义（SkillsTab 作用域内同名同值，覆盖不受影响）。

## ③ Git 面板与弹窗降噪

- `RightGitPanel`：review 按钮去 `shadow-sm`（面板内其余部分在 round-95/98 已 token 化，本次不动结构）。
- 目录页 tab 与排序按钮的选中态去 `shadow-sm`（选中已有 bg-s2 表达）。
- SkillDetailModal 检查后无需改动（本就只有真实头像、无字母占位）。

## 契约（35 → 37 项）

- **字母头像占位符清零**：全 vue 文件禁止 `avatar-fallback/card-fallback/composio-fallback` 类与 `<template>` 块内 `charAt(0)`（脚本里的首字母大写、状态解析不算）。
- **动效阶梯**：`@theme` 必须含 `--default-transition-duration: 120ms` 与统一缓动。

## 验证

- `vue-tsc --noEmit` 干净、`vite build` 通过（47.5s）。
- 契约 **37/37**、主题 **15/15**、字体 **13/13**、外观等值 **870/870 逐字相同、0 超容差**（行列表/动效改动在既有采样点之外，截图承担裁决）。
- 全量 Vitest：658 例 656 通过 / 2 失败（既有 Windows 平台差异）。
- 截图：新增 `desktop-light-directory` 证据页；暗色目录页 MCP 行列表、线程页（含 Git 面板）核对无恙。

## 环境

4190 验证服务（dist-cli）因机器重启丢失，本轮已按原参数重启（`--no-password --no-open --no-tunnel --no-login -p 4190`，后台任务）。

## 遗留

- `sr-only` 全量清点未做（抽查图标按钮均已有 aria-label）。
- `SidebarPrimaryNav.vue` 死代码未清理。
