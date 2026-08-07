# Process Fold（阶段 A）与流式思考截断

2026-08-07 阶段 A 实施：移植 DeepSeek-Reasonix 的 `displayReasoningText`（流式思考截断）与 Process Fold 基础版（按 turn 把同轮思考块 + 工作块 + 工具调用包进可折叠容器）。对应交接文档《Reasonix 消息列表全量移植方案》阶段 A。

## Prerequisites

- dev server 运行在 `127.0.0.1:4173`（TRAE 沙箱内需 `CODEX_HOME` 指向项目内 `.codex/`）
- 历史线程：「任务：构建小型研究资料库 + 子 agent 协作测试」（多轮多命令，天然形成折叠组）
- Playwright（本机 Edge channel）用于 DOM 断言；回归脚本留存于 `output/playwright/r16-*.cjs`

## 1. 改动清单

| 文件 | 内容 |
|---|---|
| `src/utils/reasoningDisplay.ts` | 流式思考截断（默认保留最后 12,000 字符 / 240 行，前缀 `...`），移植自 Reasonix，零依赖 |
| `src/utils/processFoldPreference.ts` | Fold 偏好持久化（`codex-web-local.process-fold.v1`，auto/expanded + CustomEvent 广播），移植自 Reasonix |
| `src/utils/conversationFolds.ts` | 折叠分组纯函数：按 turnId 合并连续工作消息（`buildProcessFolds`）、折叠条标签（`buildProcessFoldLabel`）、运行态/计数/耗时/外部内容判定 |
| `src/components/content/ProcessFold.vue` | 折叠容器：header 点击手动收展；运行中自动展开、完成自动收起（`auto` 偏好）；`expanded` 偏好全部展开 |
| `src/components/content/ThreadConversation.vue` | 消息流集成：同轮 ≥2 条工作消息（reasoning/commandExecution/toolCall）包进 `ProcessFold`，折叠轮次的 worked 摘要消息隐藏（耗时移到折叠条）；单命令轮次保持平铺不折叠 |
| `src/components/content/LiveOverlayItem.vue` | live overlay 思考流接入 `displayReasoningText`（流式截断，调用点一） |
| `src/composables/useDesktopState.ts` | `formatTurnDuration` 导出；worked 摘要消息携带 `durationMs`（供折叠条耗时） |
| `src/types/codex.ts` | `UiMessage` 增加可选 `durationMs` |
| `src/composables/useUiLanguage.ts` | 新增 5 个 key：Working…/Processed/{n} tools/{n} thoughts/{n} commands |

折叠行为要点（对应 Reasonix `TurnCollapse`）：
- 折叠条文案：`耗时 · N 个工具 · M 条思考 · K 个命令`（运行中显示「执行中…」）
- 手动点击折叠条后本折叠不再被自动收放，直到下一轮运行开始
- 偏好切换（未来设置入口）会清除所有折叠的手动覆盖

## 2. 验证步骤

### 2.1 静态检查

```powershell
pnpm exec vue-tsc --noEmit   # 通过
pnpm exec vitest run         # 262 通过（2 个既有 Windows 环境性失败与本次无关；新增 reasoningDisplay 6 + conversationFolds 11）
pnpm run build               # vite build + tsup 通过
```

### 2.2 桌面浅色（`r16-fold-check.cjs` 前半）

1. 打开 app，遍历线程找到折叠最多的线程（「构建小型研究资料库」类线程，实测 10 个 fold）
2. 断言 `.process-fold` 数量 ≥ 2
3. 断言折叠条 label 文案含 `·` 分隔与计数（实测 `Processed · 2 commands` / `Processed · 6 commands`）
4. 点击第一个 `.process-fold-header`：`aria-expanded` 翻转、`.process-fold-body` 出现、内部 `.work-block` 可见
5. 中文模式（`codex-web-local.ui-language.v1=zh-CN`）：label 显示「已处理 · 2 个命令」（`r16-fold-zh.cjs` 实测通过）

### 2.3 暗色 + 偏好（`r16-fold-check.cjs` 后半）

1. 设置 `codex-web-local.dark-mode.v1=dark` 与 `codex-web-local.process-fold.v1=expanded` 后刷新重进线程
2. 断言 `html.dark` 生效；`expanded` 偏好下全部 `.process-fold-body` 展开（实测 10/10）
3. 断言 `.process-fold` 背景为深色（zinc-900 半透明，非白底）
4. H5 375×812：无横向溢出，折叠正常渲染

### 2.4 流式思考截断（单测锁定 + 代码路径确认）

- 逻辑：`src/utils/reasoningDisplay.test.ts` 6 例（非流式不截断/尾部行/尾部字符/可关闭截断/字符+行双上限/240 行预算）
- 接线：live overlay 思考流经 `displayReasoningText(…, { streaming: true })` 截断；持久化思考块（reasoning-block）按 Reasonix 语义不截断（非流式，避免隐藏完整思考）
- 超长思考的真实 turn 端到端验证需在长思考会话下人工观察（live overlay 文本被截断为末尾 12,000 字符并带 `...` 前缀）

### 2.5 运行中自动展开 / 完成自动收起

- 单测锁定运行态判定（`isRunningProcessMessage`：inProgress 命令/工具、`.live` 消息）
- 组件行为（watch `running` 翻转 → 展开/收起）依赖真实长 turn 人工验证：发送长任务，观察命令流式期间折叠自动展开、完成后（auto 偏好）自动收起

## 回滚

- 无数据变更；验证脚本注入的 localStorage 偏好（dark-mode / process-fold / ui-language）仅存在于 Playwright 临时 profile
- 折叠为展示层改造，数据层（消息/turn）未改动，禁用 `ProcessFold` 渲染即可回到平铺展示
