# Round 100 —— sr-only 清点收口 + 死代码清理 + Tailwind 扫描源收紧

日期：2026-09-28 · 前置：round-99（P3 收官）

## 背景与结论

方案四期（P0~P3）落地后剩两项小尾巴：`sr-only` 全量清点、`SidebarPrimaryNav.vue`
死代码。本轮两项全部关闭，**方案遗留清零**。

## 1. `sr-only` 清点：src 早已归零，真凶是扫描污染

- `src/` 全量 grep：`sr-only` **0 处**——round-97 起图标按钮的可访问性全部走
  `aria-label`，没有视觉隐藏文本的存量使用。清点本身无事可做。
- 但 `dist/assets/index-*.css` 里有 **1 条** `.sr-only` 规则。溯源：Tailwind v4
  自动内容检测把**未 gitignore 的文档目录**（`codex-mobile-handover/`、`docs/`、
  `tests/`、`scripts/`）里的 "sr-only" 字符串当成了类名，把工具类烤进了产物。
  同理，`docs/ui-redesign-mockup.html`（度量稿）里的 zinc/slate 档位类也在向
  bundle 注入死工具类。
- 修复：`src/style.css` 在 import 后加 `@source not` 显式排除四个非应用目录
  （`../codex-mobile-handover` / `../docs` / `../tests` / `../scripts`）。工具类
  发射范围收窄到 `src/` + `index.html`。

### 效果

- 主 CSS **328,090 → 321,259 字节（−6.8KB 纯死代码）**；
- `.sr-only` 归 0，`.text-zinc-*`/`.bg-zinc-*` 等档位工具类归 0；
- 等值探针 **870/870 逐字相同、0 超容差**——收窄对采样页面零影响，
  证明被剔除的全部是应用从未消费的类。

## 2. `SidebarPrimaryNav.vue` 死代码删除

- 全仓（模板/脚本/样式）零引用，round-91 侧栏重构后遗留；
  `style.css` 亦无 `.sidebar-primary-nav` / `.sidebar-nav-item` 遗留样式。
- 直接删除文件；`SidebarMenuRow` 仍被 `SidebarThreadRow`/`SidebarThreadTree`
  消费，保留。

## 验证

契约 **37/37** · 主题 15/15 · 字体 13/13 · 等值 **870/870** · `vue-tsc` 0 ·
`vite build` 通过 · Vitest **656/658**（2 例既有 Windows 平台差异）。
截图（暗色会话 + Git 面板、亮/暗目录）与改造前一致。

## 至此

- 方案 P0/P1/P2/P3 全部落地，**遗留清单清零**（sr-only ✓、死代码 ✓、
  暗色退役 ✓ round-98、状态色回归 ✓ round-98）。
- 契约体系自 round-91 的 24 项演进至 37 项。

## 提交

- 代码：删除 `SidebarPrimaryNav.vue` + `@source not` 收紧（见 git log）。
- 文档：本轮 + handover 快照/索引 + 方案遗留关闭。
