# 消息列表三区渲染（阶段 B：hot / warm / cold）

2026-08-07 阶段 B 实施：移植 DeepSeek-Reasonix 的 hot/warm/cold 三区渲染。hot 区 = 最后 30 轮全量渲染；其前的轮次按 user 消息为界分组进 warm 区（折叠摘要卡：提问预览 ≤80 字 + 工具数 + 回答预览，单轮展开/收起）；更早的轮次进 cold 区由「展开前 N 轮对话」按钮分页展示（每页 20 轮，coldPage 单调递增）。替换原「尾部 50 条窗口 + 滚动回填 30 条」逻辑。对应交接文档《Reasonix 消息列表全量移植方案》阶段 B。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`）
- 需要 ≥31 轮的线程才能看到 warm 区、≥51 轮才能看到 cold 分页按钮；真实线程不足时可运行 `output/playwright/r17-zones-check.cjs`（拦截 RPC 注入 40/60 轮 mock 线程）
- Playwright（本机 Edge channel）用于 DOM 断言；回归脚本留存于 `output/playwright/r17-zones-check.cjs`，截图 `r17-*.png`

## 1. 改动清单

| 文件 | 内容 |
|---|---|
| `src/utils/transcriptGrouping.ts` | 三区纯函数层（移植自 Reasonix `transcriptGrouping.ts`）：`buildTurnGroups`（user 消息为界分组，assistantPreview + toolCount）、`buildTurnRenderGroups`（Hot 区按轮保序的展示角色）、`warmPagination` / `warmColdPageForTurn`（三区边界）、`WarmLayerState` 纯状态（sessionKey 隔离 + expandedWarmTurns + coldPage）、`warmUserPreview` / `compactQuestionText`（≤80 字摘要）、`messagesForTurnsFrom`（hot 区消息提取）、`scrollVersion`（结构指纹） |
| `src/utils/transcriptGrouping.test.ts` | 单测：分组/Hot 展示顺序、边界、翻页、状态不可变更新、摘要压缩、hot 提取与结构指纹 |
| `src/components/content/WarmTurnCard.vue` | warm 折叠摘要卡（对齐 Reasonix `warm-turn` 结构）：head（chevron + 提问预览 + 工具数 meta）+ 折叠态回答预览；点击 toggle 展开/收起 |
| `src/components/content/ThreadConversation.vue` | 渲染序列改为三区交错：warm 折叠轮次出卡片、展开轮次出「头部 + 该轮消息」、之后接 hot 区消息；顶部新增 cold 分页按钮；移除 `renderWindowStart`/`LOAD_MORE_CHUNK`/`RENDER_WINDOW_SIZE` 尾部窗口逻辑；`processFolds` 改在「渲染出的消息序列」上计算（阶段 A fold 与三区共存）；滚动到顶时 cold 区优先展开一页、否则后端分页 |
| `src/composables/useUiLanguage.ts` | 新增 2 个 key：Load earlier ({n} turns) / Load earlier messages |
| `src/style.css` | warm 卡片 + cold 按钮暗色覆盖（scoped `:global(:root.dark)` 构建中不生效，按仓库规则放全局） |

三区边界（对齐 Reasonix 常量 `HOT_TURNS=30`、`WARM_PAGE_SIZE=20`）：
- `warmEndTurn = max(0, turnCount - 30)`；turn ∈ `[warmEndTurn, turnCount)` 全量渲染（hot）
- `coldPage=0` 显示 warm 末尾 `pageSize` 轮；每点一次「展开前 N 轮对话」`coldPage+1`，warm 起点前移一页、`coldTurnCount` 减少一页
- `turnCount ≤ 30` 时无 warm/cold（全 hot，行为与改造前一致）

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 290 通过（2 个既有 Windows 环境性失败与本次无关；新增 transcriptGrouping 28 例）
pnpm run build               # vite build + tsup 通过
```

### 2.2 三区渲染（`r17-zones-check.cjs`，mock 40 轮）

1. 打开 app，RPC 拦截注入 40 轮 mock 线程（`thread/list` 注入摘要、`thread/read` 返回 40 turns）
2. 断言 hot 区 user 消息数 = 30（`user=30`）
3. 断言 warm 卡片数 = 10（`warmCards=10`，40 轮 - 30 hot 全部进 warm，一页 20 装得下 → cold 按钮隐藏）
4. 断言卡片内容：`.warm-turn__preview` 为提问预览（含「提问」）、`.warm-turn__meta` 显示工具数、`.warm-turn__assistant` 为回答预览（含「回答」）
5. 交互：点击第一张卡 `.warm-turn__head` → user 消息数 +1（该轮消息进入渲染序列）、卡片进入 `.warm-turn--expanded`；再点 → 收起恢复折叠

### 2.3 cold 分页（mock 60 轮）

1. 注入 60 轮线程：`warm=20 user=30 coldBtn=1`（30 hot + 20 warm + 10 cold）
2. 点击「展开前 10 轮对话」按钮 → warm 卡变为 30、cold 按钮消失（coldPage+1 后 10 cold 全部进入 warm）

### 2.4 暗色 + H5

1. 暗色：`codex-web-local.dark-mode.v1=dark` 后刷新重进 → `html.dark` 生效、warm 卡背景深色（实测 `oklab(0.21 … / 0.6)`，非白底）
2. H5 375×812：无横向溢出、warm 卡正常渲染

### 2.5 真实线程回归（阶段 A fold 不受影响）

运行 `output/playwright/r16-fold-check.cjs`（14/14 通过）：真实多轮线程 Process Fold 数量/标签/展开/暗色/H5 均正常——三区改造未破坏阶段 A 折叠；`processFolds` 现在基于渲染序列计算，<30 轮线程全部进 hot 区，行为与改造前一致。

### 2.6 流式渲染隔离（代码路径确认）

- warm 卡片组件 `WarmTurnCard` 为 `defineComponent`（`<script setup>`），props 仅原始值（`userText`/`assistantPreview`/`toolCount`/`expanded` 字符串与数字）
- 三区 computed 依赖链：`props.messages → filteredMessages → turnGroups → warmPaginationResult → renderItems`。live token 增量（`agentMessage.live` 等）只改变消息文本，不改变 warm 区轮次的摘要字段 → 组件 props 值不变 → Vue 不重渲染 warm/cold 子树（props 引用比较 + 值相等跳过）
- warm 区轮次永远不是流式轮（流式只发生在最新 hot 轮），与 Reasonix `WarmZone` 注释语义一致

### 2.7 Hot 区真实轮次结构

1. 准备一个最近 30 轮内包含 `reasoning → assistant 文本 → command/tool → assistant 最终回答` 的线程，且该轮同时有 Plan 和完成的 file change。
2. 打开线程并从该用户请求开始向下检查一个 `.conversation-turn` 容器。
3. 展开 Thinking、命令和工具批次，分别检查最终回答、Plan 与文件变更。
4. 点击最终回答的 Copy/Fork，点击用户消息的 Edit，再打开文件变更的 Diff/Undo 确认框。
5. 在回复流式进行时滚到历史位置，等待新的过程记录和最终文本出现。

Expected results:
- 每个 Hot turn 都是独立的真实 DOM 容器，结构为 `.conversation-turn-request`、可选 `.conversation-turn-process`、可选 `.conversation-turn-final`；不是同级消息上叠加 CSS 边框。
- 用户请求只在 request 区出现；Thinking、命令、工具、Plan、非终局 assistant 文本与文件变更都在 process 区。过程区有“本轮过程”标题和左侧轨道。
- 最后一个稳定 assistant 文本进入 final 区；其后的命令、文件变更和耗时等过程收尾记录保持在 process 区，不会遮蔽最终总结或改变原始消息顺序。
- 文件变更同一轮只出现一次，位于 process 区末尾；Copy/Fork/Edit/Diff/Undo 均继续作用于原始消息或 turn。
- Plan 显示为只读过程记录，步骤状态正确；Composer 的 Plan 面板仍可操作。
- 流式输出时不新增网络请求、不会将阅读历史的滚动位置拉到底部；跳到最新后仍自动跟随。

### 2.8 过程收尾后的最终总结

1. 打开一个已完成的 Hot turn，其顺序为：用户请求 → 助手最终总结 → 文件变更、命令记录或 “Worked for” 耗时记录。
2. 确认助手最终总结仍显示在 `.conversation-turn-final` 中；后续的文件变更、命令和耗时记录仍属于 `.conversation-turn-process`。
3. 收起过程区后，确认最终总结保持可见；展开后，确认收尾记录仍可见且只出现一次。

Expected results:
- 过程收尾记录不会遮蔽同一轮此前已稳定的助手最终总结。
- 不改变消息的原始顺序、文件变更位置或 “Worked for” 的显示。
- `turn/completed` 到达而服务端详情尚未把最终 `agentMessage.live` 改为完成态时，最终总结不得短暂显示后又回落到过程区。

### 2.9 Hot 区过程视觉层级

1. 准备一个包含中间 assistant 正文和最终 assistant 回答的 Hot turn，并在浅色主题打开该线程。
2. 确认“本轮过程”标题为 12px 的正常大小文字；过程中的中间 assistant 正文为 13px、较低对比度，最终回答仍保持主要正文大小与对比度。
3. 切换深色主题，确认过程标题为可读的浅灰色、过程正文为 zinc-400，最终回答仍比过程正文更突出，且没有浅色表面或文字泄漏。
4. 分别在 375×812 与 768×1024 视口复查同一 turn，展开 Thinking、命令和文件变更，并检查长段落、长命令和长文件链接。

Expected results:
- 过程标题不小于过程正文的视觉量级；中间 assistant 正文低于最终回答，但仍具备正常阅读对比度。
- Thinking、命令、工具、Plan、文件变更与最终回答的既有样式和交互不变。
- 两种主题和两个视口均无横向溢出、文本遮挡或浅色表面泄漏。

### 2.10 Hot 区过程折叠

1. 打开一个包含过程记录和最终 assistant 回答的 Hot turn。
2. 确认过程区默认展开，标题显示“本轮过程”、向下箭头和过程项数量。
3. 点击标题，确认过程项隐藏、箭头改为向右，标题的 `aria-expanded` 为 `false`；最终回答保持可见。
4. 再次点击标题，确认过程项恢复且 `aria-expanded` 为 `true`。
5. 对仍在执行、尚未出现最终 assistant 回答的 turn，确认过程标题不是可点击控件，过程保持展开。
6. 收起一个已完成 turn 后，让同一 turn 新增过程记录或文件变更，确认过程区自动重新展开。
7. 分别在浅色/深色和 375×812/768×1024 视口检查按钮焦点、箭头、计数与最终回答，确认无横向溢出。

Expected results:
- 只有已有最终回答的过程区允许用户收起；默认、刷新后和新增过程项后均展开。
- 在宽屏（viewport 大于 1280px）检查过程区左侧轨道：轨道应收敛到聊天列宽度并与 request/final 区对齐，不应出现在整行最左侧并与过程内容之间形成大段空白；在 375x812、768x1024 下确认无横向溢出。
- 收起只影响当前 turn 的过程项，不隐藏用户请求或最终回答，也不改变 Thinking、命令、Plan 与文件变更的既有交互。
- 折叠状态不写入存档或 localStorage。

## 回滚

- 无数据迁移或服务端状态；恢复 Hot 区逐条渲染可移除 `buildTurnRenderGroups` 的展示映射。
- 无数据变更；RPC 拦截与 localStorage 注入仅存在于 Playwright 临时 profile
- 三区为渲染层改造：数据层（消息/turn）未改动，改回 `messages.slice(renderWindowStart)` 窗口即恢复改造前行为
- 遗留：阶段 B 未做 Reasonix 的「展开 warm 轮次平滑滚动定位」与 JumpBar（属阶段 C 范围）
