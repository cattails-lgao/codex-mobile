# Round-85：会话日志时序恢复的适用范围（形状判据 + 版本判据缓存）（2026-09-16）

> **背景：** 用户口径「继续处理下一瓶颈」。round-84 把打开会话的成本从「app-server 全量水合」改成有界轮次页之后，**app-server 侧只剩 198ms，而经桥端到端仍是 734–1242ms**——差值全在桥自己的后处理管道里。本轮把管道逐段量出来，发现最大的一段（会话日志时序恢复）**在当前 app-server 形状下识别不到任何行，却仍在重排一份本来正确的条目顺序**：既白付 ~434–681ms，又把命令块推到轮末。

## 1. 现象与口径

round-84 收尾时记的遗留项原文：「桥侧管道的成本现在浮上来了：app-server 侧新路径只要 198ms，而经桥端到端是 734–1242ms……值得单独剖面」。本轮就是做这个剖面。

## 2. 定位：分段计时

在 `rpcPipeline` 的八步管道上临时打断点（env 门控，测完撤除），对同一线程连打三次：

| 管道段 | 冷启动（第 1 次） | 热态（第 2–3 次） |
|---|---|---|
| `trim` + `mergeStreamTurnErrors` | 2.5ms | 0.1ms |
| `sanitize`（内联图片外化 + 载荷瘦身） | 82ms | 46–76ms |
| `mergeSessionSkillInputs`（有 stat 缓存） | **304ms** | 2–6ms |
| `mergeSessionCommands`（**无缓存**） | **482ms** | **434–681ms** |
| `snapshot` + `overlay` | 0.2ms | 0.2ms |
| **管道合计** | **868ms** | **330–400ms** |

再往 `mergeSessionCommandsIntoThreadResult` 里细分一层，热态拆成 **`readFile` 167–295ms + 解析并合并 220–348ms**——一次 30.89MB 日志的整读整解。

旁边的 `mergeSessionSkillInputsIntoThreadResult` 早就有 size+mtime 缓存（所以热态 2–6ms），命令合并这一支**从来就没有**。

## 3. 根因一：形状漂移，识别到 0 行

同一段计时还打印出「合并前 10 轮、合并后仍是 10 轮」。顺着查条目 id：响应里 **215 个 `commandExecution` 全是 `exec-` 前缀，`session-cmd-` 一个都没有**——恢复逻辑什么也没注入。

原因是 rollout 的工具行形状换了代。`buildSessionItemOrder` 只认两种：

- `function_call` / `function_call_output`，名字 `exec_command` 或 `shell_command`
- `custom_tool_call`，名字 `apply_patch`

而当前 CLI 写的是 `custom_tool_call` / `custom_tool_call_output`，**名字 `exec`**。逐文件扫描本机全部会话：

| 会话 | 体积 | `function_call exec_command/shell_command` | `custom_tool_call exec` | 恢复可用？ |
|---|---|---|---|---|
| 最新两个（用户真正会打开的） | 30.89MB / 2.93MB | **0** | 222 / 7 | **否** |
| 更早的十个 | 0.08–0.88MB | 1–58 | 0 | 是 |

顺带发现同一处漂移在别处已经修过了：`collectFileChangesForTurns` 的注释写着「CLI 0.149.1+ 把 apply_patch 记录为 function_call……旧版才是 custom_tool_call.input；必须两种格式都收集」。`buildSessionItemOrder` 没跟上这一步。

**注意一个坑（已实测排除的方案）**：想用「原文里有没有 `exec_command` 字样」做廉价判据是不行的——那个 30.89MB 日志里 `exec_command` 出现 **317 次**，`apply_patch` 出现 56 次，全都是**命令输出文本里被 grep 到 / 被打印出来**的内容，不是行类型。判据只能读**已解析的 payload**。

## 4. 根因二：没有命令槽时，恢复仍然在重排

形状不匹配时 `buildSessionItemOrder` 并非完全空白——`message role=assistant` 仍会生成 `agentMessage` 槽。于是合并照常走，只是命令槽为空。结果是：把 user/agent 消息提到前面，**其余全部追加到轮末**——正好抹掉 app-server 已经产出的流式交错。

同一线程、同一份代码，只把命令合并整段跳过（A/B）后对比条目顺序：

| | 第 1 轮的条目顺序（U=user r=reasoning A=agent C=command F=fileChange x=compaction） |
|---|---|
| **跳过合并（app-server 原生）** | `U r A C C C C r A C C C r r A M r C r A F r C C C r A` |
| **合并开启（修复前）** | `U r A r A r r r A r r r r r A … A C C C C C C C F F F C C C …` |

也就是说：**在旧形状上它是在修 bug，在新形状上它自己就是 bug**。这解释了为什么「命令块堆到轮末」这一类症状会反复回潮——每次 CLI 换工具形状，槽的来源就少一批。既有手测 `tool-call-blocks-end-of-conversation.md` 的预期第 2 条（「物化保留了交错时，轮内回复应保持交错」）在新形状下其实是被违反的。

## 5. 修复

两处，都在 `src/server/bridge/session.ts`：

**（1）形状闸门——没有可交错的东西就不要重排。**
`buildSessionItemOrder` 额外回报 `sawRecoverableToolRow`（判定在**轮次过滤之前**做，所以它描述的是整份日志而不是当前这一页）；`mergeSessionCommandsIntoTurns` 改为按轮判断，槽里既没有 `commandExecution` 也没有 `fileChange` 就**原样返回那一轮**，并且全部轮都没改变时**返回入参同一引用**（`changed ? nextTurns : turns`）。旧的 `function_call exec_command` 形状完全不受影响。

**（2）版本判据缓存——不可能贡献的日志不再读第二遍。**
新增 `sessionLogRecoveryCache`（path → `{size, mtimeMs, recoverable}`，上限 64 条），以及入口 `mergeSessionCommandsIntoTurnsFromPath(turns, sessionPath)`：

- 判据为假 → 只付一次 `stat`，**不读文件**；
- 判据为真 → 照旧读 + 解析 + 合并（旧形状日志都很小，实测 0.88MB → 5ms）；
- size/mtime 变了（会话在增长）→ 重新判定。

`mergeSessionCommandsIntoThreadResult` 与 `threadRoutes` 里 live-state 那一处读取都改走这个入口，所以两条路径共享同一份判据。

## 6. 验证

- **新增单测 8 例**（`src/server/bridge/sessionLogRecovery.test.ts`）：「当前形状日志返回同一引用」「输出文本里出现 `exec_command` 不被误判为可恢复行」「旧形状仍照旧交错」「缺文件/无轮次 id 返回入参」，以及缓存语义两条——**同 size+mtime 换内容后第二次调用必须仍不读**（把时间戳钉到整秒后用等长替换 + `utimes` 复位，构造出「缓存键相同、内容不同」的场景），**日志增长后必须重新判定**。
- **全量 Vitest：625 例，623 通过 / 2 失败**。2 例仍是 `codexAppServerBridge.archive.test.ts` 的既有 Windows 环境性失败（symlink realpath、`mode 0o600` vs Windows 的 `0o666`）。基线 617 例同 2 例失败，+8 为本轮新增。
- **`vue-tsc --noEmit`** 干净。
- **端到端 A/B（同一 dev server、同一线程、同一脚本；用 `git stash` 在修复前后各测两轮 × 3 次请求）**：

| | 六次热态请求（ms） | 中位数 |
|---|---|---|
| 修复前 | 1188 / 1011 / 889 / 1071 / 1280 | **1071** |
| 修复后 | 668 / 560 / 610 / 635 / 492 | **610** |

**修复后的最大值（668ms）小于修复前的最小值（889ms）**，两组无重叠，中位数 **−43%**。客户端可见载荷不变（仍 1.56MB），`turns=10`、`threadTurnStartIndex=6`、响应不含 `initialTurnsPage`。

- **条目顺序回到 app-server 原生**：把修复后的 10 轮条目序列与「跳过合并」基线逐轮比对，**10/10 逐字一致**。
- **旧形状未被破坏**：两个旧会话经桥打开后，恢复注入的 `session-cmd-` 条目数分别为 **58/58**、**51/51**，与修复前一致。
- **live-state 路由**（同样改了读取路径）：HTTP 200、16 轮、条目顺序正常。
- **判据固化为可复跑脚本**：`scripts/probe-session-log-recovery.cjs`（`<session.jsonl> [--require-recovery]`）。三件事一口气回答：这份日志有哪些行类型、恢复**能不能**用、以及缓存前后每次打开的代价。实测：

  ```
  30.89MB 当前形状：识别到 0 行 / custom_tool_call exec 222 → DOES NOT APPLY
                    cache miss 154.1ms（read 92.9 + parse 61.2） → cache hit 0.005ms
  0.88MB 旧形状：   识别到 58 行（shell_command）           → APPLIES
  ```

  **CLI 升级后应跑它**：如果某个你预期需要时序恢复的会话报「DOES NOT APPLY」，就是识别器又落后于新工具形状了。脚本还带一条断言——对 ≥1MB 的日志，`stat` 必须比「读+解析」便宜 20 倍以上，否则缓存这个设计本身就不成立。

## 7. 遗留与后续

- **识别器落后于形状这件事本身没有根治。** 本轮只让「识别不到」变得**便宜且无害**，没有把 `custom_tool_call exec` 认成命令。真要恢复新形状的时序恢复，需要同时解决两件事：`custom_tool_call_output` 的输出解析（`exec` 的 payload 与 `exec_command` 不同），以及**管道顺序**——当前 `sanitize`（16KB 中段截断 + sha1 落盘）排在合并**之前**，而合并注入的命令对象携带**未截断**的全量输出，一旦识别器认了新形状，这些输出就会绕过瘦身直接发给浏览器。要做就得把 `sanitize` 挪到合并之后，或对恢复出的命令单独瘦身。**在 app-server 已经自己产出正确交错的前提下，更可能正确的方向是直接退役这条恢复路径**（保留 `collectFileChangesForTurns` 那条独立的 rollback 用途）——但那需要产品决策，本轮不动。
- **`readThreadForTurnPage` 仍是全量水合**（round-84 的遗留项，未动）：上翻更早轮次走 `thread/read{includeTurns:true}` 再 `slice`，首调约 1s，之后靠 20s 缓存；round-84 拿到的顶层 `turnsBackwardsCursor` 正是它该用的游标。

  > **更正（round-86 落地）：** 这条遗留已修，同时**该遗留的措辞是错的**——`turnsBackwardsCursor` 带 `includeAnchor: true`，用它 desc 会重发同一页；真正往更老走的是 `initialTurnsPage.nextCursor`。详见 round-86 文档与 `scripts/probe-turn-page.cjs`。
- **`threadArchiveRecovery` 的辅助 resume** 仍可改成 `excludeTurns:true`（round-84 遗留，未动）。
- 版本号仍停在 **0.1.124**（npm publish 由用户执行）—— **已随 v0.1.125 发布**（2026-09-16）。

## 8. 手测

见 `tests/thread-loading-state/tool-call-blocks-end-of-conversation.md` 新增的「Round-85」小节。
