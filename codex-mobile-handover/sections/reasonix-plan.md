# Reasonix 消息列表全量移植方案

> 依据 2026-08-07 对 `<参考项目目录>\DeepSeek-Reasonix-main-v2`（React + TS 桌面前端）消息列表架构的调研（`Transcript.tsx` + `transcriptGrouping.ts` + `useController.ts`）。ThreadConversation 拆分重构已为以下改造清障（改 `ThreadConversation.vue` 时不再有巨文件负担）。

> **2026-08-07 阶段 A 已完成**（commit `a5d5ef9`）：①流式思考截断——移植 `reasoningDisplay.ts`（`displayReasoningText`，默认保留末尾 12,000 字符 / 240 行，前缀 `...`）+ 单测 6 例，live overlay 思考流接入（流式截断）；持久化思考块按 Reasonix 语义不截断（非流式，避免隐藏完整思考）。②Process Fold 基础版——`conversationFolds.ts` 纯函数分组（按 turnId 合并连续 reasoning/commandExecution/toolCall，同轮 ≥2 条才折叠，单命令轮次保持平铺）+ `processFoldPreference.ts`（`codex-web-local.process-fold.v1` 偏好持久化 + CustomEvent）+ `ProcessFold.vue` 容器（运行中自动展开、完成自动收起、手动点击后不再被自动收放）；折叠条文案 `耗时 · N 个工具 · M 条思考 · K 个命令`（worked 摘要消息补 `durationMs` 供耗时，折叠轮次的 worked 行隐藏）；i18n 5 键。验证：`vue-tsc` 通过、构建通过、单测 262/264（新增 17，2 个既有 Windows 环境性失败无关）、Playwright（Edge channel）14/14（桌面浅色折叠渲染/标签/点击展开、暗色 expanded 偏好 10/10 body、H5 无溢出）+ 中文标签实测（「已处理 · 2 个命令」）；脚本 `output/playwright/r16-*.cjs`，截图 `r16-fold-{light,dark,h5,zh}.png`；手动测试文档 `tests/chat-composer-rendering/process-fold-phase-a-and-streaming-reasoning-truncation.md`。

> **2026-08-07 阶段 B 已完成**：hot/warm/cold 三区渲染落地。`transcriptGrouping.ts` 纯函数层（移植 Reasonix：`buildTurnGroups` user 消息为界分组 + assistantPreview/toolCount、`warmPagination`/`warmColdPageForTurn` 三区边界、`WarmLayerState` 纯状态 sessionKey 隔离、`warmUserPreview`/`compactQuestionText` ≤80 字摘要、`messagesForTurnsFrom` hot 提取、`scrollVersion` 结构指纹）+ 单测 28 例；`WarmTurnCard.vue` 折叠摘要卡（head chevron + 提问预览 + 工具数 meta + 回答预览，点击展开/收起）；`ThreadConversation.vue` 渲染序列改为三区交错（warm 折叠轮次出卡片、展开轮次出「头部 + 该轮消息」、之后接 hot 区消息），顶部新增 cold 分页按钮「展开前 N 轮对话」（coldPage 单调递增、每页 20 轮），移除 `renderWindowStart`/`LOAD_MORE_CHUNK`/`RENDER_WINDOW_SIZE` 尾部窗口逻辑（滚动到顶时 cold 区优先展开一页、否则后端分页），`processFolds` 改在渲染出的消息序列上计算（阶段 A fold 与三区共存）；i18n 2 键；暗色覆盖入 `style.css`。验证：`vue-tsc` 通过、构建通过、单测 290/292（新增 28，2 个既有 Windows 环境性失败无关）、Playwright（Edge channel）17/17（mock 40 轮：hot 30 + warm 10 + cold 0；卡片预览/工具数/回答预览；展开 +1 消息可收起；mock 60 轮：30 hot + 20 warm + 10 cold + 分页按钮，点击后 warm 30 + cold 0；暗色深底；H5 无溢出）+ 阶段 A 回归 14/14（`r16-fold-check.cjs`）；脚本 `output/playwright/r17-zones-check.cjs`，截图 `r17-zones-{light,big-light,dark,h5}.png`；手动测试文档 `tests/chat-composer-rendering/three-zone-hot-warm-cold-rendering.md`。

> **2026-08-07 阶段 C 已完成**：三项增强全部落地。①工具聚合——新增 `utils/toolAggregation.ts` 纯函数（`aggregateToolMessages` 连续相邻 + 已完成 + 可分类 toolCall 才聚合，running/未知工具名/非 toolCall 打断，`MIN_TOOL_BATCH_ITEMS=2` 单条保持平铺；`toolBatchKindFor` 按内置工具名分 readonly/modify/delegate，`buildToolBatchLabel` readonly 批按 read/search/other 计数）+ 单测 12 例；新增 `ToolBatchBlock.vue`（折叠头 + 计数徽标 + body 内逐条 ToolCallRow，暗色覆盖入 `style.css`），`ThreadConversation.vue` 折叠成员渲染改经 `aggregateToolMessages` 拆成「单条/聚合批」——连续只读工具合并为 ReadOnlyBatch（「Read N files · Search M files」），连续同类 modify/delegate 合并为 ToolGroup（「Modified N files」/「Delegated N tasks」）。②问题导航 JumpBar——新增 `QuestionJumpBar.vue`（每轮一个圆点，悬停圆点宽度阶梯 + 预览 tooltip 显示 `compactQuestionText` 问题文本，点击 `jumpToQuestion`：目标在 cold 区先 `warmColdPageForTurn` + `warmLayerWithColdPageAtLeast` 翻页、warm/cold 区 `warmLayerWithExpandedTurn` 展开，`nextTick` 后按锚点 `scrollIntoView` 计算滚动，解除 `autoFollowOutput`；锚点 warm-card li 挂 `question-anchor-{turn}`、hot 区 user 消息 li 挂锚点避免重复 id；H5 media query 隐藏）；`ThreadConversation.vue` 新增 `questionAnchors`/`activeQuestionTurn`（恒最后一个问题，对应 Reasonix 激活态）/`turnIndexByUserMessageId` computed。③`partitionTurnItems` 通道拆分——本地 `buildProcessFolds` 语义核对：agentMessage（有正文回答）非折叠类型天然留在折叠外并打断连续性（回答后又干活另起新折叠，既有测试锁定）、turnError（warn 类）永不折叠、steer 即 user 消息发送模式渲染在用户侧、compaction 保持独立行渲染；新增 2 个边界单测锁定（turnError 不并入折叠组、steer 前后同轮工作各自成组）。i18n 8 键（问题导航 + 工具批标签中英双语）。验证：`vue-tsc` 通过、构建通过、全量单测 306 用例（304 通过 + 2 个既有 Windows 环境性失败无关，本次新增 14 例）、Playwright（Edge channel）20/20（JumpBar 40 圆点/悬停预览/点击展开最老轮 + 向上滚动、fold 2 个（回答打断）、readonly batch「Read 3 files」+ modify batch「Modified 2 files」、展开 batch 3 行 tool、回答文本在折叠外、暗色 batch/dot 背景、H5 隐藏 JumpBar 无溢出）；脚本 `output/playwright/r18-phasec-check.cjs`，截图 `r18-{jumpbar-light,toolbatch-light,phasec-dark,phasec-h5}.png`；手动测试文档 `tests/chat-composer-rendering/phase-c-jumpbar-tool-aggregation.md`。

1. **阶段 A（低风险）**
   - ~~流式思考截断：移植 `displayReasoningText`（流式中只保留最后 12,000 字符 / 240 行），两处调用点（live overlay + reasoning block）~~ **已完成**（见上方进展记录；reasoning block 为持久化内容按非流式不截断）
   - ~~Process Fold 基础版：按 `turnIndex` 把同轮思考块 + 工作块 + 工具调用包进可折叠容器（对应 Reasonix `TurnCollapse`），折叠条 `耗时 · 工具数 · 思考数`；沿用现有手动展开/收起交互，运行中自动展开、完成自动收起（含 `processFoldPreference` 持久化）~~ **已完成**（同轮 ≥2 条才折叠；折叠条追加 `K 个命令` 计数）
2. **阶段 B（架构改造，依赖阶段 A 产物）**
   - ~~hot/warm/cold 三区：现有 `renderWindowStart`（50 条）+ `LOAD_MORE_CHUNK`（30）升级为三层——hot 区全量渲染（最近 N 轮）、warm 区可折叠摘要卡（提问预览 ≤80 字 + 工具数 + 回答预览，单轮展开）、cold 区分页「Load earlier」~~ **已完成**（HOT_TURNS=30 / WARM_PAGE_SIZE=20；warm 区按轮折叠，cold 区前端分页按钮；顶部后端分页按钮保留）
   - ~~流式渲染隔离：warm/cold 区 JSX 子树不随 token 重建（Vue 侧用 `defineComponent` + props 引用比较 + `shallowRef`）~~ **已完成**（`WarmTurnCard` 为 `defineComponent`，props 仅原始值；live token 增量只改变消息文本、不改变 warm 轮次摘要字段 → props 值相等跳过重渲染；warm 轮次永远非流式轮，与 Reasonix `WarmZone` 语义一致）
3. **阶段 C（增强）**
   - ~~问题导航 JumpBar（每轮一个圆点 + 悬停预览 + 点击跳转，对应 Reasonix `QuestionJumpBar`）~~ **已完成**（`QuestionJumpBar.vue` + `jumpToQuestion`：cold 区自动翻页 + warm/cold 轮自动展开后按锚点滚动；H5 隐藏）
   - ~~工具聚合：连续只读工具合并 `ReadOnlyBatch`、同类工具合并 `ToolGroup`（creation 模式）~~ **已完成**（`toolAggregation.ts` + `ToolBatchBlock.vue`：本地无 creation 模式，只读工具合并为 ReadOnlyBatch、非只读可分类工具按 modify/delegate 合并为 ToolGroup，未知工具名保持单条）
   - ~~`partitionTurnItems` 通道拆分：有正文的回答留在折叠外，一轮内「回答后又干活」另起新折叠，warn/extension 永不折叠、steer 渲染在用户侧~~ **已完成**（本地 `buildProcessFolds` 天然满足：agentMessage 留折叠外并打断折叠、turnError 永不折叠、steer 即 user 消息在用户侧；2 个边界单测锁定）

每个阶段独立验收（vue-tsc + vitest + Playwright 桌面/暗色/H5），阶段 A 的 Fold 容器是阶段 B 的组成部分，不返工。

### 代码复用清单（2026-08-07 逐文件核实）

Reasonix 是 React + TS，本地是 Vue 3。经逐个读取 `lib/reasoningDisplay.ts`/`processFoldPreference.ts`/`transcriptGrouping.ts`/`attachmentDisplay.ts`/`Transcript.tsx` 确认依赖后，结论：**纯 TS 逻辑层约 40% 可原样搬运，React 组件层必须重写**。

**可直接复用（零/仅浏览器 API 依赖，原样复制）**

| Reasonix 文件 | 内容 | 备注 |
|---|---|---|
| `lib/reasoningDisplay.ts` | `displayReasoningText` + `STREAMING_REASONING_TAIL_CHARS`(12,000)/`_LINES`(240) | 无任何 import；配套 `reasoning-display.test.ts` 直接搬 |
| `lib/processFoldPreference.ts` | `ProcessFoldPreference` 读写 + CustomEvent 广播（`get/set/onChange`） | 只改 key 前缀（`reasonix-process-fold` → `codex-web-local.process-fold.v1`） |
| `lib/transcriptGrouping.ts` | `buildTurnGroups`/`buildStepGroups`（轮次/步骤分组）、`warmPagination`/`warmColdPageForTurn`（三区翻页边界）、`compactQuestionText`/`warmUserPreview`（≤80 字预览）、`scrollVersion`、WarmLayerState 状态机 6 函数 | 12 个纯函数直接搬；`Item` 类型字段映射本地 `UiMessage`；配套 `transcript-grouping.test.ts` 翻译后搬 |

**需适配（逻辑可翻译，绑定 React 数据模型）**

| 位置 | 内容 | 适配点 |
|---|---|---|
| `Transcript.tsx` 内 `partitionTurnItems` | 通道拆分（有正文回答留折叠外、回答后又干活另起折叠、warn/extension 不折叠、steer 在用户侧） | 纯函数但埋在组件文件内，需抽出；`Item.kind`（user/assistant/tool/extension）映射本地 `messageType` 体系 |
| `TurnGroup`/`StepGroup` 类型 | 分组结构 | `Item` 替换为 `UiMessage` 字段 |
| `attachmentDisplay.ts`/`refToken.ts` | 附件引用替换/转义 | 不必搬，本地 `conversationPaths.ts` 已有等价解析 |

**必须重写（React 绑定，仅借鉴设计）**

`Transcript.tsx` 的 HotLayer/WarmLayer/ColdLayer 渲染树、`TurnCollapse`、`QuestionJumpBar`、`ToolGroup`/`ReadOnlyBatch`（JSX + hooks + lucide-react + `useSyncExternalStore`/Context 流式）。落到本轮拆出的子组件重写；流式状态沿用本地 `useDesktopState` + `mergeLiveMessages`。

### 修正工期（最大化复用后）

| 阶段 | 原估算 | 复用后 | 压缩原因 |
|---|---|---|---|
| A-1 流式思考截断 | 0.5 天 | **0.25 天** | `reasoningDisplay.ts` 整文件搬运 |
| A-2 Process Fold 基础版 | 1 天 | **0.5~0.75 天** | 偏好/分组函数直接搬，只写折叠容器 |
| B hot/warm/cold 三区 | 2 天 | **1~1.25 天** | 翻页边界函数直接搬，渲染层仍重写 |
| C JumpBar/工具聚合 | 1.5 天 | **0.75~1 天** | 摘要/导航函数直接搬，`partitionTurnItems` 抽出翻译 |

**总计约 2.5~3.5 个工作日（原 4.5~5），压缩约 30~40%**；剩余工作量集中在 Vue 组件重写层。

