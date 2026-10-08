# round-128：命令块 live→持久化交接不再「闪一下」——延迟清空 live 命令

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 决定性取证跑在**生产构建**（`vite build` → `dist/`，服务 4191，按请求从磁盘读 `dist/index.html` ⇒ 重建即生效、无需重启）上，配项目内隔离 `CODEX_HOME`（`tmp/r128-codex-home`，只拷 `auth.json`，**未触碰真实 `~/.codex`**），模型走 `gpt-5.5` relay，实测浏览器为系统 Edge。

本轮收口 round-127 的唯一遗留：**「新增命令块时闪一下」定案并修复**。round-126 排除了重载重渲与顶部 `isLoading` 切换条，round-127 又排除了 `scrollIntoView` 连带滚动与「位置被重置回 TOP」，把候选收窄到只剩 (a) 真实流式回合里 live→持久化项的交接、(b) 内容落地与滚动跟随之间那一帧的差 —— 两者都必须**驱动一个真实的流式回合**才能判。本轮把那条路走通了。

## 一、定案：根因是回合收尾处「急切清空 live 命令」

先搭出一个能跑真实流式回合的隔离环境（四道坑见 §五），再用逐帧取证（rAF 采样 `.conversation-list` 的 `items / overlay / cmds / scrollHeight / clientHeight / scrollTop / textLength / 结构`，配 `MutationObserver` 记节点增删）把跃变窗口整段摊开。**结论（A 侧实测）**：

```
命令块消失 @+11635ms，持续 250ms
  消失前: cmds=1 sh=519 st=0 txt=336
  真空中: cmds=0 sh=519 st=0 txt=103  struct[request(2:userMessage|userMessage) + final(2:agentMessage|agentMessage)]
  恢复后: cmds=1 sh=519 st=0 txt=197  struct[request(2:userMessage|userMessage) + process(1:commandExecution) + final(2:agentMessage|agentMessage)]
收尾 thread/read: +11869ms lastStatus=completed lastItems=userMessage|commandExecution|agentMessage
```

机制（三段）：

1. **`turn/completed` 一到，`liveCommandsByThreadId[threadId]` 被立即删除** —— 渲染这个命令块的 live 副本消失。
2. 而**渲染用的持久化副本要等防抖后的收尾 `thread/read`**：`EVENT_SYNC_DEBOUNCE_MS = 220`（实测 250–324ms 之后落地）。
3. 于是该命令块在 DOM 里**真空约 250ms**。真空期的结构读数正是证据：`process` 段**整段被摘掉**（`ThreadTurn.vue` 里它是 `v-if="processItemCount > 0"`），只剩 `request + final`；持久化副本落地后才把 `process(1:commandExecution)` 挂回来。

**清空本身是必需的、不能改成不清**：live 命令的 id 是通知里的裸 `call_xxx`，而桥层重建的持久化命令 id 是 `session-cmd-${callId}` —— **两者不同源**，`removeLiveCommandsPersistedIn`（按 id 相等剪除）对它无效。不收尾清空，持久化副本落地后就会在原位**多出一个命令块**。

**本轮的关键发现（第一版修复因此失效）**：`turn/completed` 收尾有**两条通知路径** ——
- `applyRealtimeUpdates(notification)`：在 WS 回调里**先**执行，其中含 `setThreadInProgress(completedTurn.threadId, false)`（→ `clearCompletedTurnLiveState`）；
- `handleNotification(notification)`：其 `if (notification.method === 'turn/completed')` 分支里**后**执行。

第一版只改了第二条。临时探针钩子显示 `defer` **从未置 1**、`liveCmd` 仍 `1 → 0`，A 侧读数与改动前**逐字相同** —— 这才定位到第一条路径。⇒ 正确做法是抽一个**统一收尾入口**，两条路径都走它。

## 二、改动：把这次清空推迟到「持久化副本写进 messages」的同一拍

唯一产品改动文件 `src/composables/useDesktopState.ts`（**64 增 10 删**）：

1. 新增常量 `LIVE_COMMAND_HANDOFF_FALLBACK_MS = 1500` —— 交接窗口的**兜底上界**。
2. 新增状态 `deferredLiveCommandClearThreadIds: Set<string>`（哪些线程的 live 命令要延迟清）。
3. 新增 `flushDeferredLiveCommands(threadId)` —— 只做两件事：清该线程 live 命令 + 解除延迟标记。
4. `clearCompletedTurnLiveState(threadId, { keepLiveCommands })` —— **默认语义不变**；`keepLiveCommands: true` 时改为登记延迟，否则走 `flushDeferredLiveCommands`。
5. `setThreadInProgress(threadId, next, { keepDeferredLiveCommands })` —— 把选项透传给 4。
6. 新增 **`finishTurnForThread(threadId)` = 回合收尾的唯一入口**；`applyRealtimeUpdates` 与 `handleNotification` 的 `turn/completed` 分支**都改调它**。
7. 删掉 `handleNotification` 的 `turn/completed` 分支里那段急切清空。

`finishTurnForThread` 的两条分寸：

```ts
const deferLiveCommands = threadId === selectedThreadId.value   // 只对当前选中线程延迟
setThreadInProgress(threadId, false, { keepDeferredLiveCommands: deferLiveCommands })
if (!deferLiveCommands || typeof window === 'undefined') return
window.setTimeout(() => {                                        // 兜底：刷新失败也要清
  if (!deferredLiveCommandClearThreadIds.has(threadId)) return
  if (inProgressById.value[threadId] === true) return
  flushDeferredLiveCommands(threadId)
}, LIVE_COMMAND_HANDOFF_FALLBACK_MS)
```

- **只对选中线程延迟**：非选中线程不参与渲染，延迟无收益、还让 live 层多留一份，维持立即清空。
- **兜底 1.5s**：正常路径由收尾刷新在同一拍清掉；兜底只在刷新失败/被复用缓存跳过时生效，避免 live 命令永久残留。

**为什么「同一拍」是安全的**：`useDesktopMessageHistoryLoading.ts` 的 `loadMessages` 在 `setPersistedMessagesForThread → removeLiveCommandsPersistedIn → removeLiveFileChangesPersistedIn` 之后，于**同一同步块（无 await）**里调 `deps.clearCompletedTurnLiveState(threadId)` ⇒ 持久化副本写进 `messages` 与 live 清空落在**同一帧**，新旧副本换手不丢帧、也不重复。

## 三、验证

### 3.1 真机 A/B（决定性，交错三跑）

新增 `scripts/verify-command-block-handoff.cjs`（浏览器侧、可复跑）：用 UI composer 发一条**会触发 shell 命令**的提示词驱动**真实流式回合**，逐帧记 `[data-message-type="commandExecution"]` 的个数 `cmds`；判定「`cmds` 从 `>0` 归零、随后又在 **5s** 内回到 `>0`」= 一次真空事件。

| 变体 | 真空事件 | 收尾 `thread/read` | 结果 |
| --- | --- | --- | --- |
| **改动前**（`git stash` + 重建 `dist`） | **@+11635ms 消失、持续 250ms** | +11869ms | **FAILED 1/6**（exit 1） |
| **改动后**（B1） | 无 | +11445ms | **ALL GREEN 6/6**（exit 0） |
| **恢复后复跑**（B2，交错确认） | 无 | +10381ms | **ALL GREEN 6/6**（exit 0） |

交错序 B1 → A1 → B2，**唯一变量是代码**（同一 harness、同一服务、同一模型）。

三条**非空过**断言（模型整轮没出命令块、或回合没跑完 ⇒ **SKIP 退 2**，不是失败也不是通过）：
- 观测回合确实产出命令块（`maxCmds=1`）；
- 确实有 `lastStatus=completed` 的收尾 `thread/read`，且其持久化副本含命令块（`cmds=1`）；
- 采样帧数 ≥ 60（实测 1658 / 1787 / 1849 帧，最大帧间隔 13–17ms）。

另两条：回合结束后命令块仍在 DOM（`finalCmds=1`）、无未捕获页面异常。

### 3.2 静态契约同步钉住（并反跑证明非空）

`scripts/check-ui-contract.cjs` **41 → 42 项**：新增「命令块 live→持久化交接延迟清空，不出现真空（round-128）」。钉住 9 个子事实：延迟集合存在 / 兜底常量存在 / `flushDeferredLiveCommands` 里清 live / `finishTurnForThread` **调用点 ≥2**（两条通知路径）/ 仅选中线程延迟 / `clearCompletedTurnLiveState` 接受 `keepLiveCommands` / `turn/completed` 走 `finishTurnForThread` / **`turn/completed` 不得再出现急切清空** / **`applyRealtimeUpdates` 不得直接 `setThreadInProgress(completedTurn.threadId, false)`**。

| 被检查的源码 | 契约结果 |
| --- | --- |
| 改动前（`git stash`） | **41/42**，该项 FAIL —— 诊断行 `延迟集合=NO / 兜底常量=NO / flush 清空 live=NO / finishTurnForThread 调用点=-1（须 ≥2）/ 仅选中线程延迟=NO / clear 接受 keepLiveCommands=NO / turn/completed 走 finish=NO / **turn/completed 仍急切清空=YES(退化了)** / **applyRealtimeUpdates 直接 setThreadInProgress=YES(退化了)**` |
| 改动后 | **42/42**，`EXIT=0` |

（**口径修正的诚实说明**：断言第一版写的是「live 命令的 `omitKey` 清空**全文件只允许 1 处**」，实测全文件有 **4** 处 —— 另三处是**合法**路径（回合失败回滚 `L943`、fork `L2674`、重置 `L3360`）。故改为钉「**收尾路径**不得急切清空」这一语义不变式，而**不是**数个数 —— 前者不会因为无关路径增删而误报。）

### 3.3 临时调试钩子已删除

取证用的 `window.__r128dbg`（暴露延迟集合 / live 命令键 / `record()`）**提交前已整体删除**，`grep -rn "__r128dbg\|TEMP-r128-DEBUG" src/ scripts/` 返回 **none**。

### 3.4 全量验证

- `vue-tsc --noEmit` **EXIT=0**。
- 全量 **742 例 / 742 通过（76 文件）零失败**（默认 15s 超时下即零失败）。
- `vite build` **EXIT=0**（三次：13.77s / 12.97s / 13.66s）。
- 生产构建（4191，隔离 `CODEX_HOME`）复跑：

| 闸门 | 结果 |
| --- | --- |
| `verify-command-block-handoff`（本轮新增） | **ALL GREEN 6/6**（exit 0；与本轮 A/B 同一读数口径） |
| `check-ui-contract` | **42/42**（exit 0） |
| `verify-mobile-375` | **exit 0** |
| `check-thread-switch-feedback` | **12 项全过**（exit 0；`frozen=12ms / 9ms` ≤ 60ms 预算；`chars=161→197`；`rows=10 with-messages=4`） |
| `check-fonts` | **13/13**（exit 0） |
| `check-theme` | **15/15**（exit 0） |
| `verify-conversation-mount-scroll` | **SKIP（exit 2）** |
| `verify-conversation-list-persists` | **SKIP（exit 2）** |
| `verify-review-pane-scroll` | **SKIP（exit 2）** |

### 3.5 三个 SKIP 的原因（环境不足，非失败）

本轮服务用的是**隔离 `CODEX_HOME`**（`tmp/r128-codex-home`），里面只有本轮探针/闸门跑出来的短线程：

- `verify-conversation-mount-scroll` 要求线程可滚 **>150px**，实测 10 条线程里最长只有 **132px**（`# 01a11b65… items=8 scrollable=132px`），其余多为 `0px` 或 `98px` ⇒ 闸门主动 **SKIP 退 2**。（round-127 跑它时用的是项目 `.codex` 里一条 438px 的线程，所以能跑 —— SKIP 是 **home 不同**造成的，与本轮改动无关。）
- `verify-conversation-list-persists` 与 `verify-review-pane-scroll` 要求线程可滚 **>600px**，同样不满足 ⇒ **SKIP 退 2**。

`check-fonts` / `check-theme` 需要顶层 `playwright-core`（本机未软链），用
`NODE_PATH=node_modules/.pnpm/playwright-core@1.62.1/node_modules` 指过去后正常运行。

## 四、诚实边界

① 本轮只消掉了候选 **(a)**（live→持久化交接）。候选 **(b)**「内容落地与滚动跟随之间那一帧的差」**未被证伪**，也未被本轮量到：A 侧真空窗口里 `scrollHeight` 恒为 519（`clientHeight` 也是 519 ⇒ 该测试线程内容不足一屏、列表不可滚），所以**没有**复现 round-126 在更长线程上量到的 `scrollHeight 666→609 / scrollTop 147→90→147`。要量 (b) 需要**一条可滚动的长线程 + 真实回合**，本轮不做、也不据此下结论。
② 闸门依赖一个**可用模型**（本机走 `gpt-5.5` relay）。relay 抖动（522 / 超时）会让闸门**退 2 或超时** —— 那是外部依赖，不是产品缺陷。没有可用 provider 的环境里，本闸门会稳定 SKIP（退 2），这也意味着它**不构成 CI 里的硬门禁**。
③ 延迟清空给 live 命令引入了**最长 1.5s 的额外存活**（兜底上界）。这是把「可能多显示一会儿旧副本」与「闪一下」做的取舍，**不是零成本**；只是兜底路径在正常刷新下从不生效（正常路径由收尾刷新在同一拍清掉）。
④ **只对当前选中线程延迟**：这是有意的边界（非选中线程不参与渲染）。
⑤ **三个滚动闸门本轮 SKIP（退出码 2，环境不足、非失败）**：`verify-conversation-mount-scroll`（需 >150px）、`verify-conversation-list-persists` 与 `verify-review-pane-scroll`（需 >600px）—— 本轮服务用的是隔离 `CODEX_HOME`，里面最长的线程只可滚 **132px**。详见 §3.5。它们**明确退出**而不是伪装成通过。
⑥ **未发版、未 bump**：round-122 ~ round-128 的提交随下一次发布走（npm `latest` 仍是 `0.1.127`）。

## 五、涉及文件 + 复现本轮的隔离环境（四道坑）

| 文件 | 改动 |
| --- | --- |
| `src/composables/useDesktopState.ts` | 唯一产品改动：延迟清空 live 命令 + `finishTurnForThread` 统一收尾入口（64 增 10 删） |
| `scripts/verify-command-block-handoff.cjs` | 新增（浏览器侧回归闸门，可复跑；真实流式回合 + 逐帧 `cmds` 真空判定） |
| `scripts/check-ui-contract.cjs` | 新增 1 项结构性不变式断言（41 → 42 项） |

探针（`tmp/`，未入库）：`setup-r128-home.cjs`（隔离 home）、`probe-r128-flash3.cjs`（全 UI 路径两阶段逐帧取证，决定性）、`probe-r128-real-turn.cjs`（裸 app-server 真实回合）、`probe-r128-svc-turn.cjs`（打服务侧 RPC 的回合）、`probe-r128-dom.cjs` / `probe-r128-composer.cjs` / `probe-r128-stuck.cjs` / `probe-r128-diag.cjs`（形态与诊断）。

**要复现本轮的真实回合，必须绕开这四道坑**（每一道都真实拦过一次）：

1. **不能在仓内 cwd 起服务。** codex 会按**进程 cwd** 发现 `<cwd>/.codex/config.toml`，其中 `model_provider` / `model_providers` 会被「忽略为 unsupported」却仍然**覆盖** —— 实测把模型打回 `deepseek-v4-flash`（指向 litellm 的死端口 → 404）。解法：从**仓外 cwd** 起服务，或用 `-c model=... -c model_provider=...` 覆盖。
2. **`%TEMP%` 不可作 `CODEX_HOME`。** codex 拒绝在临时目录创建 helper 二进制（PATH aliases）⇒ app-server 中途异常退出，表现为 `thread/read 502 thread not loaded`、`turn/start 502 app-server exited unexpectedly`。必须放**仓内** `tmp/`。
3. **`env_key = "OPENAI_API_KEY"` ⇒ 服务进程需要该环境变量**（从真实 `~/.codex/auth.json` 读出来注入）。
4. **隔离 home 只拷 `auth.json`**，其余全部自建 —— **绝不碰真实库**。
