# Round-87：模型切换对上下文窗口的语义收口（回退路径失效 + 水合不覆盖用户选择）（2026-09-16）

> **背景：** 用户先问「模型切换，上下文会怎么样？」，再问「当前项目对于模型切换，对上下文窗口做了哪些操作？会重置还是继承？」。逐行追代码给出结论后，暴露出 round-73/74 留下的两处不一致（回退换模型不失效窗口、线程详情水合无条件覆盖用户刚选的模型），用户口径「处理未修的」。本轮把这两处收口，并把追查中发现的第三处「看起来是缺陷、实际不可达」的分支按调研结论记录在案。

## 1. 结论先行：切换模型时到底做了什么（代码确认）

| 维度 | 行为 |
|---|---|
| 对话内容 | **完全继承**。model 是**按轮参数**：`startThreadTurn` 把 `params.model` 塞进 `turn/start`（`src/api/gateway/threads.ts`），`threadId` 不变 → 服务端同一个线程、同一份历史。切模型不 fork、不 rollback、不 resume。 |
| 真实 token 计数 | **原样保留**（`total` / `last` 不动）。 |
| 派生窗口字段 | **失效为 `null`**：`modelContextWindow` / `remainingContextTokens` / `remainingContextPercent`（`invalidateThreadContextWindow`，`src/composables/useDesktopState.ts`）。 |
| 已发生的压缩 | **不可逆**（本轮不涉及，压缩结果已在历史里）。 |
| 用量来源 | 只有 `thread/tokenUsage/updated` 通知 + 启动时 localStorage 恢复，**没有拉取式刷新**。 |

失效的**唯一**手动入口是 `App.vue` 的 `onSelectModel`（且要求 `previous !== modelId`）。消费侧两处：

- **指示器**：`buildContextUsageView` 在窗口非数字时返回 `null`，模板 `v-if` → 指示器**整体隐藏**（不是显示旧值、也不是显示 0%），即「待定」态。
- **压缩预检**：`maybeStashForAutoCompact` / `shouldAutoCompactOnTurnEnd` 都以 `remainingContextPercent` 为唯一输入，为 `null` 时 `return false` → **本轮暂停一次压缩判定**（宁可少压一次，也不按旧窗口残值误判）。

新模型首个用量事件到达后，`normalizeThreadTokenUsage` 用**新模型自己的窗口**重算，指示器自动恢复。刷新也不会「复活」旧窗口：置空状态本身写进 localStorage 并被恢复。

## 2. 需求 1：回退换模型不失效窗口

**现象/根因（代码确认）：** `invalidateThreadContextWindow` 在生产代码里只有一处调用（手动下拉）。而**回退换模型**（服务端回报模型不受支持 → 自动换到回退模型）改的是同一个「线程模型」字段，却完全没有失效窗口。危害有方向性：回退模型（`gpt-5.4-mini`）窗口通常**更小**，此时界面仍显示旧（更大）窗口 → 预检判「还有余量」而跳过压缩，直接把请求顶到真实上限。

**修复（`src/composables/useDesktopModelPreferences.ts`、`src/composables/useDesktopState.ts`）：** 给 `DesktopModelPreferencesDeps` 增加 `onThreadModelChanged?: (threadId: string) => void`，在 `applyFallbackModelSelection` 写完模型后回调；`useDesktopState` 构造该 composable 时接到 `invalidateThreadContextWindow`。四处回退调用点（错误通知路径、创建线程失败路径、turn/start 同步失败的内联分支、回退补发）**一次覆盖**。

**为什么不是另外两个方案：**

| 方案 | 结论 |
|---|---|
| （A）下沉进底层写函数 `setThreadModelId` | **否**。该函数同时服务于「水合」：resume 初始化（`!hasThreadModelSelection` 时）与线程详情水合都会往里写服务端 model。水合不是切换，在那里失效会把本地恢复出来的**有效**窗口清成待定；而写函数内部**无法区分**「用户改变」与「用服务端值初始化」。 |
| （B）在每个回退调用点各补一遍 `invalidateThreadContextWindow` | **否**。4 处重复、且下一条新回退路径照样会漏——正是本轮要消灭的形态。 |
| （A′）下沉进**回退这个变更操作**（本轮采用） | `applyFallbackModelSelection` 是纯变更、**没有水合角色**，是唯一既安全又能收敛的位置；水合路径一行不动，零回归面。 |

## 3. 需求 2：线程详情水合覆盖用户刚选的模型

**现象/根因（代码确认）：** `useDesktopMessageHistoryLoading` 在加载线程时**无条件**用服务端 `detail.model` 覆盖线程模型。于是「在本线程切了模型、但还没发送就刷新/重开线程」会把选择**改回服务端旧值**——连同一并失效的窗口也白失效（下一轮会拿旧模型发出去）。这与 round-72 在发送路径立下的判据（「客户端已显式选择时不用服务端 model 覆盖，否则旧模型已删除/下线会被拿去发请求而 400」）自相矛盾。

**修复（`src/composables/useDesktopMessageHistoryLoading.ts`、`src/composables/useDesktopModelPreferences.ts`）：** 新增窄判据 `hasThreadOwnModelSelection`（**只看线程自身的上下文键**，不含新线程兜底读），水合时以它为准；无显式选择时仍按服务端初始化。

**为什么必须新加一个判据、而不是复用 `hasThreadModelSelection`：** 后者经 `readSelectedModel` 会**兜底读**新线程键 `__new-thread__`；一旦该键有值（早期版本写入的数据），它就会把新线程默认算成**每个**线程的选择，从而挡住本线程模型本应发生的初始化。顺带确认了一个容易误判的点：新线程的默认模型通常落在 **provider 作用域键** `__new-thread-provider__::<provider>` 上（`normalizeProviderContextId('')` → `codex`），所以两个判据在常规数据下结果相同——正因如此，用错判据不会立刻暴露，只会在地摊数据上悄悄坏掉，才需要显式的窄判据。

## 4. 调研结论：回退补发的 re-resume 分支当前不可达（未改代码）

追查中判过第三处「疑似同类缺陷」：`retryPendingTurnWithFallback` 里重新 `resumeThread` 后**无守卫**地用服务端 model 覆盖（同函数内另一处水合有守卫）。**两条独立论证表明该分支不可达：**

1. 进入该分支需同时满足 `pending.fallbackRetried === false` 与 `resumedThreadById[thread] !== true`。后者为真只可能是 resume 抛错（两处 resume 成功后都会置 `true`）；而 resume 抛错会让 `sendMessageToSelectedThread` 的 catch 执行 `setThreadInProgress(thread, false)` → 该函数在 `true→false` 跃迁时调 `clearCompletedTurnLiveState` → `clearPendingTurnRequest`，**暂存请求先被清掉**，回退补发随即 `!pending` 早退。
2. 若发送失败在 `turn/start` 且属「模型不受支持」，则 `startTurnForThread` 的内联 catch 会把暂存请求标成 `fallbackRetried: true` → 同样早退。

**临时探针（已删除）实测**：投递「模型不受支持」错误通知后 `error` 已置位（说明通知被处理），但 `rollbackThread` 0 次、`resumeThread` 仍 1 次、`startThreadTurn` 0 次、线程模型未变——回退补发确实没执行。作为对照，把线程详情报成「进行中」（使暂存请求不被 turn 收口清掉）后，错误通知路径**可以**走到 `rollbackThread` + 回退模型生效，即**函数本身可达，只有那个 re-resume 分支不可达**。

**因此本轮不对该分支加守卫**（改了也无实际作用，且无法写出会在修复前失败的测试）。若将来要恢复「客户端自动回退」，需先决策 `setThreadInProgress(false)` 收口是否还应清掉暂存请求，再连带处理该分支。

## 5. 验证

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | 干净 |
| 全量单测（Windows / Node v22.22.2） | **658 例：656 通过 / 2 失败**；2 例为既知平台差异（`codexAppServerBridge.archive.test.ts` 的 symlink realpath、`mode 0o600` vs `0o666`），与本轮无关 |
| 本轮新增单测 | **9 例**：`useDesktopModelPreferences.test.ts` +5（窄判据 3 + 回退出口回调 2）、`useDesktopState.test.ts` +4（两条回退路径的窗口失效 2 + 水合守卫 2） |
| 关键用例语义 | ①错误通知驱动的回退使窗口置空（修复前该用例的 `remainingContextPercent` 仍为 5）；②`turn/start` 同步失败的内联回退同样置空；③同线程显式选模型后重开线程保留所选模型；④无显式选择时仍采纳服务端模型（水合未被误挡） |

涉及文件：

| 文件 | 改动 |
|---|---|
| `src/composables/useDesktopModelPreferences.ts` | 新增 deps 回调 `onThreadModelChanged` 并在 `applyFallbackModelSelection` 中触发；新增并导出窄判据 `hasThreadOwnModelSelection` |
| `src/composables/useDesktopState.ts` | 接线回调 → `invalidateThreadContextWindow`；向 message history loading 注入窄判据 |
| `src/composables/useDesktopMessageHistoryLoading.ts` | 水合改用窄判据；新增 deps 字段 |
| `src/composables/useDesktopModelPreferences.test.ts` | +5 例 |
| `src/composables/useDesktopState.test.ts` | +4 例 |

## 6. 遗留与后续

- **回退补发的 re-resume 分支**：见 §4，不可达但**留**着；恢复客户端自动回退前需先做产品决策。
- **失效窗口与 turn 内压缩的交互**：在 turn 进行中切换/回退模型会把窗口置空，于是该轮结束时的 round-83 turn 边界预检也会跳过（暂停一轮，属设计内）。若要「立即按新模型判一次」，需要额外的一次用量拉取能力，而协议目前只有通知推送，没有拉取接口。

## 7. 手测

见 `tests/providers-models/model-switch-resets-context-and-appends-divider.md` 新增的「Round-87」小节。
