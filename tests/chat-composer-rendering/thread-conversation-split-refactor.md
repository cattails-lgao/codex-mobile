# ThreadConversation 拆分（3 utils + 8 子组件）

2026-08-07 第十五轮重构：`ThreadConversation.vue` 从 5701 行 / 201KB 拆至 2951 行 / 104KB（-48%），纯工具函数迁入 3 个 utils，独立 UI 区块迁入 8 个子组件。目标是为后续按 Reasonix 方案全量改造消息列表（Process Fold / 三区渲染）扫清障碍。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`，PATH 需含 fnm node 与 `AppData\Local\pnpm\bin`）
- 历史线程：「长任务测试」（含命令工作块与流式消息）
- Playwright（本机 Edge channel）用于 DOM 断言；回归脚本留存于 `output/playwright/r15-*.cjs`

## 1. 拆分清单

**纯函数 → utils（零组件状态依赖）**

| 文件 | 内容 |
|---|---|
| `src/utils/conversationPaths.ts` | `isFilePath`/`resolveRelativePath`/`parseFileReference`/`toLocalThreadUrl`/`headingTag` 等路径与链接解析 |
| `src/utils/conversationMarkdown.ts` | `InlineSegment`/`MessageBlock` 类型 + `parseInlineSegmentsUncached`/`parseMessageBlocks` 等整条 markdown 解析链 |
| `src/utils/conversationFileChanges.ts` | `TurnFileChangeSummary`/`DiffViewerLine` 类型 + fileChange 聚合/展示/diff 行构建（`t`/`cwd` 作参数传入） |

**UI 区块 → 子组件（`src/components/content/`）**

| 子组件 | 迁出区块 | 行数 |
|---|---|---|
| `WorkBlockItem.vue` | 命令工作块（含输出展开/权限提示） | 238 |
| `ToolCallRow.vue` | 工具调用行 | 116 |
| `ReasoningBlock.vue` | 思考块（Thinking process 折叠） | 88 |
| `LiveOverlayItem.vue` | live overlay（Thinking 实时流 + 反馈链接） | 103 |
| `MessageToolbar.vue` | 消息工具栏（edit/fork/copy） | 110 |
| `FileLinkContextMenu.vue` | 文件链接右键菜单（自包含 window 监听） | 129 |
| `FileChangeSummaryBlock.vue` | 文件变更摘要（standalone + anchored 两处共用） | 232 |
| `DiffViewer.vue` | diff 查看器（桌面侧栏 + H5 sheet） | 429 |

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 245 通过（2 个既有 Windows 环境性失败，与本次无关）
pnpm run build               # vite build 通过
```

### 2.2 桌面 + 浅色（`r15-regression.cjs` 前半）

1. 打开「长任务测试」线程
2. 断言 `.work-block` 数量 > 0；点击首个 `.work-block-header`，其输出容器 `grid-template-rows` 由 `0px` 变为非 0（展开动画）
3. 断言 `.message-toolbar` 数量 > 0
4. 右键任一 `.message-file-link`，断言 `.file-link-context-menu` 出现，按 Esc 关闭

### 2.3 ReasoningBlock（注入存档）

1. 打开「长任务测试」，执行 `localStorage['codex-web-local.thread-reasoning.v1'][线程id] = [{ messageType:'reasoning', turnIndex:0, reasoning:{summary:[...]}, text:'...' }]` 后刷新重进线程
2. 断言 `.reasoning-block` 渲染；点击 header 后 `aria-expanded` 翻转、`.reasoning-block-summary` 可见
3. 断言 `.reasoning-block-content .message-text` 计算样式 `font-size: 13px`（普通消息 14px）

### 2.4 LiveOverlayItem（真实 turn）

1. 新建线程，输入「Create a file named x.txt with content 'hi'.」并发送
2. 流式期间断言 `.live-overlay-inline` 出现（含 `.live-overlay-heading`/`.live-overlay-reasoning`）

### 2.5 暗色 + H5（`r15-theme-h5.cjs` / `r15-h5.cjs`）

1. 暗色：`localStorage['codex-web-local.dark-mode.v1']='dark'` 后刷新，断言 `html.dark` 生效、「长任务测试」线程内 `.work-block` 有可见边框、`.message-toolbar` 渲染
2. H5 375×812：打开侧栏抽屉 → 进入「长任务测试」，断言 `documentElement.scrollWidth` 不超出视口、`.work-block` 渲染且可展开

### 2.6 FileChangeSummaryBlock / DiffViewer（模板等价性 + 类名对照）

沙箱 app-server 的 `thread-file-change-fallback` 端点返回空（无会话文件变更记录），无法用真实数据触发。改用 git 对照验证：

- `git show HEAD:src/components/content/ThreadConversation.vue` 提取旧模板 file-change 区块与 diff-viewer 区块的 class 集合
- 与新子组件模板 class 集合逐项对比：`DiffViewer` 缺失 0；`FileChangeSummaryBlock` 的 4 个动态绑定（`cmd-expanded`/`cmd-chevron-open`/`cmd-group-visible`/`file-change-action-icon-redo`）一一对应，`file-change-summary-block-inline` 改为条件绑定（`inline` prop，anchored 场景传值）
- 渲染条件（`isFileChangeMessage`/`readStandaloneFileChangeSummary`/`activeDiffViewerChange`）均未改动

## 回滚

- 无数据变更；测试期间注入的 reasoning 存档（localStorage `codex-web-local.thread-reasoning.v1`）与暗色偏好（`codex-web-local.dark-mode.v1`）可清除
- 沙箱内由真实 turn 产生的 `r15-*.txt` 文件位于沙箱工作区（非本仓库），不影响仓库
