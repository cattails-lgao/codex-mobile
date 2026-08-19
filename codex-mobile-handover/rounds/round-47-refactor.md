# Round-47：Hot 区消息按 turn 结构重构（2026-08-19）

> **背景：** 用户指出此前的消息列表改动“感觉不到区别”，并明确要求 Hot 区按 `用户请求 → 本轮过程 → Assistant 最终回答` 组织。第一轮实现只给扁平消息流叠加 CSS 标记，没有形成真实 DOM 层级，因此本轮改为真实 turn 容器。

## Hot 区真实轮次容器

**现象/需求：** 原 Hot 区逐条渲染消息，用户消息、Thinking、命令、工具、Plan、文件变更与最终回复都位于同一个消息列表层级。即使通过边框、缩进和留白增强区分，视觉与语义都不是用户要求的轮次结构。

**根因（代码确认）：** `ThreadConversation.vue` 将 `buildTurnRenderGroups()` 产生的 turn 数据重新拍平成 `renderItems`，每个消息继续生成同级 `<li>`。`turnStart`、`turnEnd` 与 `presentation` 只是消息上的样式元数据，未产生 request/process/final 容器。

**修复（涉及文件）：**

- 新增 `src/components/content/ThreadTurn.vue`。Hot 区每个 turn 现在是一个真实 `.conversation-turn` 容器，内部有可选的 `conversation-turn-request`、`conversation-turn-process` 与 `conversation-turn-final` 区域；每个区域内使用语义正确的嵌套列表。
- `src/components/content/ThreadConversation.vue` 将扁平 `renderItems` 改为 `renderTurns`。Warm/Cold 保留既有摘要卡、分页和展开路径；仅 Hot 区使用新的 turn 容器。
- 大型单条消息模板仍只保留在 `ThreadConversation.vue` 一份，通过 `ThreadTurn` scoped slot 复用。消息原始 `id`、Copy/Fork/Edit/Rollback、Reasoning 展开、命令展开、ProcessFold、图片预览、Diff 与 Undo/Redo 的状态和回调保持原有所有权。
- `src/utils/transcriptGrouping.ts` 将 final 标记收紧为：只在轮次最后一个非 file-change 内容项是稳定 assistant 文本时标为 `final-assistant`。后续若有 Thinking、命令、工具或 Plan，较早 assistant 文本继续作为过程项，不为三区结构重排时间顺序。
- 文件变更摘要不再作为最终回答后的轮外兄弟 `<li>`；按既有 anchor ID 读取展开和操作状态，但在所属 turn 的 process 区末尾渲染一次。原 `turnId`、Diff、Undo/Redo、copy 锚点不变。
- 新增 UI 文案 `Turn process` / `本轮过程`。

目标结构：

```text
用户请求
本轮过程
  Thinking
  Command / Tool
  Plan
  Changed files
Assistant 最终回答
```

## 行为与回归约束

- Thinking、命令、工具、Plan、`worked` 与中间 assistant 文本进入 process 区。
- 最终 assistant 文本仅在稳定且位于当前 turn 末尾时进入 final 区。
- 文件变更在 process 区末尾显示一次；不会在 final 区之后再次插入。
- `ProcessFold` 仍只针对已显示的 Warm 展开消息和 Hot 消息计算，且不跨 turn 折叠。其输入独立于文件变更摘要，避免响应式循环。
- QuestionJumpBar 继续使用原 user message 的 `question-anchor-N`，Warm 展开和 Cold 分页行为不变。

## 验证

- `pnpm exec vue-tsc --noEmit`：通过。
- `pnpm exec vitest run src/utils/transcriptGrouping.test.ts`：33/33 通过。新增覆盖：后续过程记录存在时，较早 assistant 文本不误标 final；最终回复后文件变更仍保留 final 标记。
- `pnpm run build`：通过。主包约 595 kB 的 chunk warning 为既有警告。
- 浏览器真实线程 `#/thread/019ff113-4492-7251-8637-a52966984451`：768x1024 与 375x812 DOM 快照确认每轮具有 `User request`、`Turn process`、`Assistant final response` 三个区域；命令、Thinking 与中间文本在 process 区，最终回答在 final 区。
- 768x1024 截图确认用户请求、过程轨道与最终回答视觉上分开。375x812 IAB 截图有已知的分块重复合成问题，但 DOM 中没有重复节点，移动结构验证通过。
- `pnpm run profile:browser` 未完成：本机缺少 Playwright Chromium，报错要求 `pnpm exec playwright install`。没有生成 trace 或请求统计。

## 性能审计

- 新展示模型只对既有 Hot 区消息构建 turn 分区；Warm/Cold 不增加全历史重复分组。
- 未新增 API 请求、轮询、长连接、缓存键或缓存失效路径。
- ProcessFold 仍对当前可见的 Warm 展开内容与 Hot 内容计算，输入规模维持既有可见消息规模。
- 未获得运行时 profile，原因是缺少 Playwright Chromium；代码路径审计未发现同步 I/O、unbounded fanout 或大 payload 新增。

## 过程区视觉层级调整

**完成内容：** “本轮过程”标题由 11px 调整为 12px，并取消全大写；仅 process 区中带 `assistant` 角色的普通正文、列表、引用和标题调整为较 final 区低一级的字号与对比度。浅色下正文为 13px / zinc-600、标题为 15px / zinc-700；深色下正文为 zinc-400、标题为 zinc-300。final 区继续采用既有 14px 主正文与更高对比度。

**保持不变：** Thinking、命令、工具、Plan、文件变更保持各自既有紧凑样式；request/process/final DOM、消息 ID、折叠语义、文件变更锚点和操作回调均未改动。

**验证：**

- `pnpm exec vitest run src/utils/transcriptGrouping.test.ts`：33/33 通过。
- `pnpm run build`：通过；主包约 595 kB 的 chunk warning 为既有警告。
- 所选真实线程确认存在 `User request`、`Turn process`、`Assistant final response` 三段结构。
- Playwright mock turn 在浅色/深色 × 375x812/768x1024 四组中均通过：标题计算字号 12px、过程 assistant 正文 13px、最终正文 14px，`documentElement.scrollWidth - innerWidth` 为 0。截图位于 `output/playwright/round47-process-*.png`。

**性能审计：** 本次仅增加受 `.conversation-item-process[data-role='assistant']` 限定的 CSS 规则，未新增 API 请求、响应式状态、DOM 节点、消息分组计算、缓存键或缓存失效路径。未得到浏览器性能 profile，原因仍是本机缺少 Playwright Chromium；代码路径未增加同步 I/O、无界扇出或大 payload。

## 涉及文件与提交

- `src/components/content/ThreadConversation.vue`
- `src/components/content/ThreadTurn.vue`（新增）
- `src/composables/useUiLanguage.ts`
- `src/utils/transcriptGrouping.ts`
- `src/utils/transcriptGrouping.test.ts`
- `tests/chat-composer-rendering/three-zone-hot-warm-cold-rendering.md`
- `tests/thread-loading-state/reasoning-stays-with-its-response-in-thread-read.md`
- commits `86a3d28`（初始 Hot 区层级）、`5417d74`（强化可见边界）、`cad0caf`（真实 turn 结构）
