# round-177：编辑保存被「孤儿耗时行」误判回退失败 ⇒ 重发被吞（round-176 报障复测的真根因）

## 一、背景

round-176 落地后用户复测反馈：**「编辑我点击发送的时候，像没有发出去一样」**。round-176 的真机探针走的是**合成线程 + 页面内 RPC 拦截**，主链路断言全 PASS——真实环境一定存在被拦截 harness 掩盖的路径差异。

## 二、真机取证（三层，逐层收窄）

1. **协议层（`tmp/r177-edit-real.cjs`，真 app-server 0.162.1 + 隔离 home + 真实 relay provider，零拦截）**：`thread/start → turn/start ×2 → thread/turns/list(notLoaded) → thread/revert → 游标补页 → turn/start(turnTrigger='edit_user_message')` 每一跳全部符合预期（revert 响应带 `turnsBackwardsCursor`/`itemsBackwardsCursor`、补页返回保留轮、终态 2 轮）。⇒ **协议层没有问题**，round-176 报的「turnTrigger 服务端行为未验」顺带闭环。
   - 坑：整份拷贝真实 `config.toml` 到隔离 home 会因 mcp_servers/plugins 引用缺文件而 `failed to load configuration (os error 2)`——只摘 `model_providers.custom` 块 + 顶层 model 行即可。
2. **UI 层复现（`tmp/r177-ui-probe.cjs`，vite dev 5176 + `CODEX_HOME` 隔离 home ⇒ 桥自己 spawn 真 app-server，真 UI 真 RPC 零拦截）**：发两条真消息 → 编辑第一条 → 保存。**复现**：保存后 90s 内无 `turn/start`、编辑消息不出现、`.message-row` 归零。
3. **状态层定位（`tmp/r177-ui-probe2/3.cjs`，fetch 只读记录 + 读 `#__vue_app__._instance.setupState`）**：RPC 轨迹显示 revert 200 + 文件回退 200 + sync 完成，然后**重发静默消失**；`desktopError = "Edit failed: the original message could not be rolled back. Try again."` ⇒ **App.vue 的编辑保存守卫误判了回退失败**；此时 `filteredMessages` 只剩两条 role=system 的 **「Worked for 12s / 20s」行，turnId 仍是被 revert 移除轮次的 id**。

## 三、根因链

1. round-65 的**轮耗时存档**（`codex-web-local.thread-turn-durations.v1`，threadId→turnId→durationMs，localStorage + 服务端 sidecar 镜像）在 `thread/revert` 成功后**不清被移除轮次的条目**（round-142 只清了 thinking 存档，耗时存档漏了）。
2. `insertPersistedTurnDurations`（`useDesktopStateUtils.ts`）只要存档里有该 turnId 的耗时，就无条件合成一条 `worked` 系统行追加进消息流 ⇒ 回退后列表残留**孤儿 "Worked for Xs" 行（带着已删轮次的 turnId）**。
3. `App.vue` 编辑保存守卫 `filteredMessages.some(m => m.turnId === targetTurnId)` **不区分消息类型**，孤儿行命中 ⇒ 判定「回退失败」⇒ 不重发；报错写在 `desktopError`（round-176 已证实在 UI 无渲染位）⇒ 用户视角：消息列表只剩两条莫名的 "Worked for Xs"，**像没发出去一样**。

## 四、改动（3 处）

1. **`insertPersistedTurnDurations`**：turn 不在当前消息列表（被回退移除 / 分页冷页未加载）时不再合成 worked 行——孤儿行**无论来源**（本地存档、刷新后 sidecar 回灌）都被拦下。
2. **`App.vue onEditMessageResend` 守卫**：只认 user/assistant 真实消息（`normalizeMessageType` 排除 `worked` / `turnActivity.live` / `turnError.live` / `agentReasoning.live`），系统合成行不再构成「目标轮还在」的证据。
3. **`rollbackSelectedThread`**：成功路径与本地对齐路径新增 `forgetTurnDurations(threadId, [removedTurnIds..., beforeTurnId])`，把被移除轮次的耗时条目从存档清掉（与 round-142 的 thinking 清理成对补齐）。存档镜像只上行增量（round-77），删除不回传服务端 sidecar——刷新后 sidecar 回灌的孤儿条目由改动 1 的判据兜底，不再进消息流。

## 五、验证

- `vue-tsc --noEmit` 退 0 · `vitest run` **1067/1067 / 94 文件**（turnDurations.test.ts 新增 2 例、改写 1 例）· `vite build` 退 0 · ui-contract **60/60**
- 真机复验（同一 UI 探针，HMR 后）：保存 → `thread/revert` → **`turn/start(turnTrigger='edit_user_message')`** → 编辑消息 + 助手回复 ~6s 内物化；`filteredMessages` 只剩编辑轮（用户消息 + 该轮 worked 行 + 回复）；`desktopError` 为空；`setupState` 断言 + 13 项场景断言全 PASS

## 六、诚实边界 / 未闭环

- 修的是 **UI 状态层**；app-server 侧 revert/turnTrigger 行为本轮实测正常（0.162.1），上游若变需复测。
- 服务端 sidecar 的被删轮耗时条目**仍会回灌**（无 DELETE 通道，round-77 镜像是增量 PUT-only）；由「turn 须在列表中」判据兜底，但存档文件本身会缓慢累积陈旧 turnId（有 200 条/线程截断）。
- 探针线程 cwd 落在 `~/Documents/Codex/<日期>/repo`（UI 默认值）；真实用户 cwd 差异未覆盖。
- round-176 修复项（模型列表三条）本轮未复测——用户只报了编辑路径；如需复测按 round-176 探针口径跑。
