# round-168：批 4 前半 —— fork 一步截断 + 能力门控表

> 用户指令：「那继续下一个批次？」⇒ 开工判定书批 4（桥侧四项）。本轮落地 #1 与 #3（前端可完成，
> **不触 `src/server/**`** ⇒ 不 bump `SHARED_BRIDGE_VERSION`）；#2/#4（turnTrigger + 内联编辑框）留待下一轮，
> 因为我们的编辑流是「确认框 + 回填草稿」，没有自动重发路径，`turnTrigger` 无处附着——依赖 #4 先行。

## 一、批 4 #1：`thread/fork { beforeTurnId }` 一步截断

**协议确认**（`documentation/app-server-schemas/json/ClientRequest.json`）：

- `ThreadForkParams.beforeTurnId`：*"Optional turn id to fork before, excluding that turn and all later turns. Cannot be combined with `last_turn_id`."*
- 与 round-106 的 `thread/revert` beforeTurnId **同一取值口径**：`turnIndex` 之后首个带 turnId 的轮次。

**改动**：

1. `src/api/gateway/threads.ts`：`forkThread` 增加第二重载 `(threadId, { beforeTurnId })`；
   原分发判据 `arguments.length <= 1` 改为「第二参不是 string ⇒ persist 模式」，
   避免传对象时误入「起新线程」分支。原 `(threadId, cwd, model)` 行为不变。
2. `src/utils/threadForkTruncation.ts`（新）：两个纯谓词——
   `findForkCutoffTurnId`（在**源线程**消息里定截断点；原先在 fork 响应里找，请求前必须先定）+
   `isForkTruncatedAsRequested`（**老上游可能静默忽略未知参数**：fork 结果里仍含截断点轮次
   （按 turnId 命中或 turnIndex 越过）⇒ 判未截断）。
3. `src/composables/useDesktopState.ts` `forkThreadFromTurn`：优先一步 fork；
   未截断时**降级**为 round-106 的「副本 revert」路径（保留，不删——这是对老 CLI 的兼容层）。

**运行时探针** `tmp/r168-fork-probe.cjs`（真实桥 4190 + 只拦截 fork 相关 RPC，合成 6 轮线程）：
7/7——场景 1（上游守约）fork 请求带 `beforeTurnId=t3`、**零次 revert**、UI 切到 fork 线程；
场景 2（上游忽略参数、响应全量）**回退路径发出 `thread/revert{beforeTurnId:t3}`**、UI 同样切换。

## 二、批 4 #3：能力门控表

`src/utils/capabilityGates.ts`（新）：`CAPABILITY_GATES` 单一数据源（9 个能力：hooks / remoteControl /
plugins / apps / mcps / mcpReload / mcpLogin / marketplace / pluginShare）+ `isCapabilitySupported`。
`App.vue`（2 处）与 `DirectoryHub.vue`（7 处）的散落 `methodSet.has(...)`/内联数组全部改引表；
**`supportsMcpReload`/`supportsMcpLogin` 原本就没有「未加载默认可用」守卫，语义原样保留**。
版本维度（capability × minCliVersion 的执行）需桥上报 CLI 版本后接入——表上留了注释，未发明 `sinceCli` 值。

## 三、验证

| 项 | 结果 |
| --- | --- |
| 新单测（capabilityGates 6 + threadForkTruncation 9） | 15/15 |
| 全量单测 | **1050/1050（91 文件）**，基线 1035/89 |
| vue-tsc | 0 |
| vite build + tsup | 过（esbuild 0.25.0 / 0.27.7 分指） |
| fork 探针 | 7/7 |
| check-ui-contract / fonts / agent-note / media | 59 / 13 / 56 / 44 |
| check-theme（对桥伺服的 dist 构建产物） | 15/15 |
| check-hot-window / check-bottom-lock | 6/6 · 4/4 |

## 四、剩余边界

- 截断检测的 turnIndex 兜底是**保守**的：若 fork 结果 turnIndex 被重编号且 turnId 全丢，可能误判「未截断」
  而多发一次 revert——revert 幂等（再截一次已是空），无正确性风险。
- fork 探针在 `tmp/`，非 CI 资产；跑法：起桥 4190 → `PROFILE_BASE_URL=http://127.0.0.1:4190 node tmp/r168-fork-probe.cjs`。
- 批 4 #2/#4 未开工（见上）。
