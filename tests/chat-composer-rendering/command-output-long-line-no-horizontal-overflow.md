# 命令执行消息超长内容不产生横向溢出

2026-08-07 修复：消息列表中命令执行（commandExecution，`li[data-role="system"]`）消息被超长命令/输出撑宽产生横向滚动条。根因：`.work-block-list` 的样式定义在 `WorkBlockItem.vue` 的 scoped 中，但该 class 实际由 `ThreadConversation.vue` 模板渲染——scoped 选择器（带 `data-v`）不匹配，导致其 `display: block` 且无 `min-w-0`，flex 子项被内容 `min-content`（超长行 2268px）撑开；同时输出区 `pre` 所在 grid 的 auto 列轨道按内容 max-content 撑宽，`overflow-wrap: break-word` 永不触发。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`）
- 需要含超长命令/输出（无空格连续字符串，如长 URL）的线程；可用 `output/playwright/r20-overflow-check.cjs`（拦截 RPC 注入超长命令 mock 线程）复现

## 1. 改动清单

| 文件 | 内容 |
|---|---|
| `src/style.css` | 新增全局 `.work-block-list { flex w-full min-w-0 flex-col gap-1.5 }`：ThreadConversation 渲染的 `.work-block-list` 此前无匹配样式（WorkBlockItem scoped 定义不匹配），补宽度约束防止 flex 子项被内容撑开 |
| `src/components/content/WorkBlockItem.vue` | `.work-block-output-wrap` 加 `grid-template-columns: minmax(0, 1fr)`：auto 列轨道会被子项 max-content 撑宽导致 `break-words` 失效；`.work-block-output-inner` 加 `min-width: 0`（grid 子项约束，双保险） |

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 304 通过（2 个既有 Windows 环境性失败与本次无关）
pnpm run build               # vite build + tsup 通过
```

### 2.2 超长输出断行（`r20-overflow-check.cjs`）

1. RPC 拦截注入 mock 线程（命令输出含 500+ 字符无空格 URL，命令含 300+ 字符参数）
2. 打开线程、展开命令输出，断言：
   - `.work-block-output` 的 `scrollWidth === clientWidth`（≤ 容器宽，超长行已断行；修复前为 2268px）
   - `document.documentElement.scrollWidth <= window.innerWidth`（无页面横向滚动条）
3. 桌面 1280 / 900 / H5 375 三种视口均通过（pre 宽 704 / 324 / 352px）
4. 暗色主题下输出区背景仍为 zinc-900（无回归）

## 3. 回滚 / 清理

- 删除 `style.css` 的 `.work-block-list` 全局规则 + 还原 `WorkBlockItem.vue` 的 grid 列轨道与 inner min-width 即可
- mock 线程仅存在于 RPC 拦截层，不落库；脚本退出即清理
