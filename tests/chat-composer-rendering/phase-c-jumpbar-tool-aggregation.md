# 阶段 C：问题导航 JumpBar + 工具聚合 + partitionTurnItems 通道拆分

2026-08-07 阶段 C 实施：移植 DeepSeek-Reasonix 的三项增强。①问题导航 JumpBar（`QuestionJumpBar.vue`：每轮一个圆点 + 悬停预览 + 点击跳转，cold 区自动翻页、warm/cold 轮自动展开后按锚点滚动）；②工具聚合（`toolAggregation.ts` + `ToolBatchBlock.vue`：连续只读工具合并为 ReadOnlyBatch、连续同类 modify/delegate 合并为 ToolGroup，运行中/未知工具名单条平铺）；③`partitionTurnItems` 通道拆分语义核对（本地 `buildProcessFolds` 天然满足：有正文回答留折叠外并打断折叠、turnError 永不折叠、steer 即 user 消息渲染在用户侧，补 2 个边界单测锁定）。对应交接文档《Reasonix 消息列表全量移植方案》阶段 C。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`）
- JumpBar 需要 ≥2 轮的线程（圆点数 = 轮次数）；工具聚合需要折叠内连续 ≥2 条只读/同类工具调用
- Playwright（本机 Edge channel）用于 DOM 断言；回归脚本留存于 `output/playwright/r18-phasec-check.cjs`，截图 `r18-*.png`

## 1. 改动清单

| 文件 | 内容 |
|---|---|
| `src/utils/toolAggregation.ts` | 工具聚合纯函数：`toolBatchKindFor`（readonly/modify/delegate 按内置工具名分类）、`aggregateToolMessages`（连续相邻 + 已完成 + 可分类才聚合，running/未知/非 toolCall 打断，`MIN_TOOL_BATCH_ITEMS=2`）、`buildToolBatchLabel`（readonly 批按 read/search/other 计数，modify/delegate 按条数） |
| `src/utils/toolAggregation.test.ts` | 新增 12 例单测：连续聚合/类别切换断组/running 断组/非 tool 断组/未知名单条/failed 可聚合/单条不聚合/标签计数 |
| `src/components/content/ToolBatchBlock.vue` | 聚合批展示：折叠头（chevron + 🛠 + 标签 + 计数徽标）+ body 内逐条 `ToolCallRow`；暗色覆盖入 `src/style.css` |
| `src/components/content/QuestionJumpBar.vue` | 问题导航：每轮一个圆点（悬停宽度阶梯 32/20/14px + transitionDelay 波纹、激活圆点恒为最后一个问题 18px accent）；悬停预览 tooltip（`compactQuestionText` 问题文本）；点击 `jump(turn)` 事件；H5（≤767px）隐藏 |
| `src/components/content/ThreadConversation.vue` | 折叠成员渲染改经 `aggregatedFoldItemsFor` 拆「单条/聚合批」；新增 `questionAnchors`/`activeQuestionTurn`/`turnIndexByUserMessageId`、`questionAnchorId`/`messageAnchorId`（warm-card li 与 hot 区 user 消息 li 挂锚点，避免重复 id）、`jumpToQuestion`（cold 区 `warmColdPageForTurn` + `warmLayerWithColdPageAtLeast` 翻页、warm/cold 轮 `warmLayerWithExpandedTurn` 展开、`nextTick` 后按锚点计算滚动并解除 `autoFollowOutput`）；挂载 `<QuestionJumpBar>` |
| `src/utils/conversationFolds.test.ts` | 新增 2 例边界单测：turnError（warn）不并入折叠组、user（steer）消息前后同轮工作各自成组 |
| `src/composables/useUiLanguage.ts` | 新增 8 个 key：Question navigation / Jump to question {n} / Read {n} files / Search {n} files / {n} read calls / Modified {n} files / Delegated {n} tasks / Explored {n} items |
| `src/style.css` | ToolBatchBlock + QuestionJumpBar 暗色覆盖（scoped `:global(:root.dark)` 构建中不生效，按仓库规则放全局） |

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 304 通过（2 个既有 Windows 环境性失败与本次无关；新增 toolAggregation 12 + conversationFolds 2 例）
pnpm run build               # vite build + tsup 通过
```

### 2.2 问题导航 JumpBar（`r18-phasec-check.cjs`，mock 40 轮）

1. 打开 app，RPC 拦截注入 40 轮 mock 线程（`thread/list` 注入摘要、`thread/read` 返回 40 turns）
2. 断言 `.question-jump-bar` 渲染、`.question-jump-item` 圆点数 = 40（每轮一个）
3. 悬停第一个圆点 → `.question-jump-preview` 显示「第 1 轮提问…」（`compactQuestionText` 摘要）
4. 点击第 1 轮圆点（warm 区未展开轮）→ 该轮 `.warm-turn--expanded`、容器 `scrollTop` 向上滚动到顶部（目标轮最老）
5. H5（375×812）：`.question-jump-bar` `display: none`、无横向溢出

### 2.3 工具聚合 + partitionTurnItems（mock 最后一轮 = 复杂工作轮）

mock 最后一轮 items 顺序：user → cmd×2 → read_file×3 → 回答1 → edit_file×2 → 回答2。

1. 断言 `.process-fold` 数 = 2：`[cmd1, cmd2, read1-3]` 一个折叠、`[edit1, edit2]` 一个折叠（回答1 打断后另起新折叠 = partitionTurnItems 语义）
2. 展开两个 fold → `.tool-batch-block` 数 = 2：第一个 label「Read 3 files」（readonly 批），第二个「Modified 2 files」（modify 组）
3. 展开 readonly 批 → 3 行 `.tool-call-block`，工具名均为 `read_file`
4. partitionTurnItems：回答1/回答2 文本不在任何 `.process-fold` 内，作为独立 `.conversation-item` 渲染（回答留折叠外）
5. 暗色：`.tool-batch-block` 背景为 zinc-900/60（oklab(0.21…/0.6)）、`.question-jump-dot` 背景 zinc-700（rgb(63,63,70)）

## 3. 回滚 / 清理

- 无持久化状态改动（JumpBar 圆点位置、工具批展开态均为组件内瞬态）
- mock 线程仅存在于 RPC 拦截层，不落库；脚本退出即清理
- 删除本功能 = 移除 `ThreadConversation.vue` 中 `QuestionJumpBar`/`ToolBatchBlock` 引用与相关 computeds，删除 `toolAggregation.ts`、`ToolBatchBlock.vue`、`QuestionJumpBar.vue` 及 `style.css` 暗色块
