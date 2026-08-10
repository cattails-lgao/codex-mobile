# Round-31：侧边栏过滤 subagent 会话（2026-08-10）

> **背景：** 用户以 `codex-mobile-re` 发包使用后，侧边栏「突然多了很多子 agent 线程」。此前基于 schema 注释（`ThreadListParams.sourceKinds` "defaults to interactive sources"）推断 app-server 默认不会返回 subagent 会话，实测推翻该结论，确认是 app-server 物化行为所致，UI 层从未过滤。

## 调查结论（上游对比 + 实测）

- **上游 v514 与本 fork 行为一致**：拉取 `friuns2/codex-mobile` tag `v514`（commit `48fe5a6`，存放于 `D:\code\codex-mobile-v514`，仅用于对比不入库）逐环节对比：`thread/list` 调用参数（均不带 `sourceKinds`）、`normalizeThreadGroupsV2`/`toUiThread`（均不过滤）、bridge `thread/list` 处理（上游纯透传）。git grep 确认 v514 全仓库无 `subagent`/`sourceKinds` 关键字。**不是 fork 改动引入的差异。**
- **实测（codex-cli 0.146.0，隔离 `CODEX_HOME` 构造会话）**：`thread_source=subagent` 且 `source=cli` 的会话会被 app-server 物化，`Thread.source="cli"`（interactive），因此 `thread/list` 缺省返回它，`sourceKinds=[cli,vscode,exec,appServer]` 也滤不掉；只有 `source` 本身为 subagent 类型才会被 `sourceKinds=subAgent` 过滤，但 TUI/CLI 写入的 subagent 会话 source 是 `cli`。
- **前端无法区分**：`thread/list`/`thread/read` 返回的 `Thread` 结构无 `thread_source` 字段，RPC 数据层面没有 subagent 标识，唯一可靠信号是本地 rollout 文件 `session_meta.payload.thread_source`。

## 修复（方案 1：桥接层本地会话过滤）

- **`src/server/externalSessionTracker.ts`**：新增 `getSubagentThreadIds()`（遍历已扫描会话，收集 `thread_source` 以 `subagent` 开头（不区分大小写）的 session id）；重构 `updateSessionMeta` 使 `thread_source` 解析不再依赖 `originator` 存在（subagent 会话可能无 originator）。
- **`src/server/codexAppServerBridge.ts`**：新增导出纯函数 `filterThreadListByIds(result, excludeSet)`；`thread/list` 响应处理链在合并导入会话之后、sanitize 之前接入 `filterSubagentThreadsFromThreadListResult`（仅该 RPC，`thread/read`、搜索索引等不受影响）。
- 设计取舍：复用 externalSessionTracker 既有增量扫描（无新增 I/O），每次 `thread/list` 增加一次 O(n) 内存过滤（n 为已扫描会话数），性能开销可忽略。

## 验证

- 单测：`externalSessionTracker.test.ts` 新增 2 例（含无 originator 仅靠 thread_source 识别）、`codexAppServerBridge.inlinePayload.test.ts` 新增 3 例（过滤/无命中原样返回/非列表载荷不动），28/28 通过；`src/server/` 全套 104 通过 + 2 个既有 Windows 环境性失败（chmod 权限位，与本次无关）。
- `vue-tsc --noEmit` 通过。
- 端到端实测：构造含「正常 vscode 会话 + subagent(cli/subagent) 会话」的临时 `CODEX_HOME` 启动 dev server，`thread/list` 返回 count=1 仅保留正常会话，subagent 会话被正确过滤。
- 涉及文件：`src/server/externalSessionTracker.ts`、`src/server/codexAppServerBridge.ts`、两个对应测试文件、`tests/thread-loading-state/index.md`、新增 `tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md`（提交 `2995475`）。
