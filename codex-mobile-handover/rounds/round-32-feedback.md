# Round-32：fileChange 折叠样式 + 工具调用时序 + 单文件撤销（2026-08-11）

> **背景：** 用户以 `codex-mobile-re` 发布版（0.1.88）使用后反馈 3 个问题：①消息列表 `data-message-type="fileChange"` 块无法折叠、样式损坏；②消息列表的工具调用块部分跑到当前对话最后面；③fileChange 块的撤销按钮只针对整轮，能否按单个文件撤销。均已在仓库内复现并修复。

## 问题 1：fileChange 块无法折叠、样式损坏

**根因（代码确认）：** round-15 把 `FileChangeSummaryBlock` 拆成独立组件时，其模板复用的 `cmd-row`/`cmd-chevron`/`cmd-group-wrap`/`cmd-group-visible` 折叠样式仍留在 `ThreadConversation.vue` 的 `<style scoped>` 中。Vue scoped 样式只作用于组件自身模板元素，子组件内部永远匹配不到 → 折叠动画（`grid-template-rows: 0fr→1fr`）失效、行/箭头/边框样式全部丢失，表现为「样式坏了、无法折叠」。

**修复：** 把该组件实际依赖的 9 条样式搬进 `FileChangeSummaryBlock.vue` 自带 scoped 样式；同时删除 `ThreadConversation.vue` 中已无任何模板引用的 23 条 `cmd-*` 死规则（`WorkBlockItem` 用自包含 `work-block-*` 体系，`cmd-output-condensed` 也有自带定义）。

## 问题 2：工具调用块跑到当前对话最后面

**复现（用户提供真实 rollout，977KB/821 行/24 轮，`rollout-2026-08-10T20-15-12-019feb99...jsonl`）：** 导入临时 `CODEX_HOME` 启动 dev server，`thread/read` 物化顺序最后一条是 `commandExecution`（如最后一轮 `user, cmd(b89), agent, cmd(6VZ), cmd(j6v), cmd(MLQ)`），前端 `normalizeThreadMessagesV2` 扁平化后消息流末尾就是命令块；而 rollout 真实顺序中带文本的最终回复在轮末。

**根因（双层）：**
1. **幂等保护失效：** round-11 的 session-log 时序恢复 `mergeSessionCommandsIntoTurns` 用 `id.startsWith('session-')` 判断「已恢复过」；但新版 app-server（codex-cli 0.146+）物化线程历史时原生就带 `session-cmd-*` 前缀 → 对所有新线程直接 return，命令/回复交错恢复从未执行。
2. **物化合并回复：** app-server 把轮内多段 assistant 回复合并成 1 个 `agentMessage` 且放在第一个命令之后（实测最终回复 item-53 文本 1117 字符即 rollout 轮末段落），其余命令堆在轮末。

**修复（`mergeSessionCommandsIntoTurns`）：** 移除 `session-` 前缀幂等保护（恢复结果是确定性的：同 rollout + 同 turns → 同结果，新增重复执行幂等单测）；当物化 agent 消息数少于 rollout 的 assistant 回复槽位数（回复被合并）时，按 rollout 顺序把所有命令/文件变更排前、agent 回复追加到轮末，其余情况保持原有交错。修复后消息流末尾恢复为 `agentMessage`。

## 问题 3：fileChange 撤销按单个文件

**现状调查：** `/codex-api/thread/rollback-files` 已支持 `patchIds` 精确撤销，但粒度为 apply_patch 调用（一个 patch 可含多文件），前端 `UiFileChange` 无 patch 标识；`parseApplyPatchInput` 已按文件拆段（change 数组），`revertTurnFileChanges`/`applyTurnFileChanges` 逐 change 处理。

**实施：**
- 后端：`rollback-files` 新增 `filePaths` 参数（相对路径绝对化后按 `path`/`movedToPath` 匹配过滤，`pathSetMatchesChange` 导出）；`revertTurnFileChanges`/`applyTurnFileChanges` 增加 `allowedFilePaths?: Set<string>`，`patchIds` 与 `scope` 语义不变。
- 前端：`updateThreadFileChanges` 增加 `filePaths` 透传；`FileChangeSummaryBlock` 每个文件行新增撤销图标按钮（仅 `actionable` 时显示）；确认弹窗按文件显示文案（`Undo the changes to {file}?`，新增中英翻译键）；`runFileChangeAction` 支持文件级撤销。

## 验证

- `vue-tsc --noEmit` 通过；`src/server/` 全量 110 通过 + 2 个既有 Windows 环境性失败（chmod 权限位，与本次无关）。
- 单测：`codexAppServerBridge.inlinePayload.test.ts` 21/21，新增 6 例——`pathSetMatchesChange` 匹配/拒绝 2 例、`revertTurnFileChanges` 单文件撤销（只还原 a.txt、b.txt 不动）与全量撤销 2 例、`mergeSessionCommandsIntoTurns` 物化合并回复归位 + 重复执行幂等 2 例。
- 真实 rollout 复现验证：bridge 处理后的 `thread/read` 消息流末尾从 `commandExecution` 变为 `agentMessage`（末尾类型断言通过）。
- 涉及文件：`codexAppServerBridge.ts`、`codexAppServerBridge.inlinePayload.test.ts`、`codexGateway.ts`、`FileChangeSummaryBlock.vue`、`ThreadConversation.vue`、`useUiLanguage.ts`、`tests/chat-composer-rendering/`（新增 file-change-collapse-styles-and-per-file-undo.md + index）、`tests/thread-loading-state/`（新增 tool-call-blocks-end-of-conversation.md + index）。
