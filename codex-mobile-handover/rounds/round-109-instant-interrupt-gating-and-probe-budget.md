# round-109 — 收尾两项：instant_interrupt 版本门控 + 探针超时可覆盖

日期：2026-09-30。用户口径「进行收尾」（承接 round-108 §五 列出的两个可选项）。

**背景：** round-108 复核完 0.158.0 兼容性后留了两条「可选收尾」：（1）`features.instant_interrupt` 在 <0.159 上是死参数、每次启动多一条 stderr ERROR；（2）`probe-turn-page.cjs` 硬编码的 120s 单次预算在冷的大线程上必然误报。本轮把两条都做掉。

## 一、`instant_interrupt` 改成按 CLI 版本门控（`src/server/appServerRuntimeConfig.ts`）

- `readCodexCliVersion()`：**进程级缓存**，用 `resolveCodexCommand()` + `codex --version` 同步探测一次（失败也不重试）。
- `codexCliSupportsInstantInterrupt(version)`：`>= 0.159.0` 才 true；**版本未知或不可解析时返回 true**——保持 round-106 的原行为。理由：宁可在旧版本上打一条无害日志，也不要把「探不到版本」误判成「不支持」而静默关掉新版本用户的即时中断。
- `CODEXUI_INSTANT_INTERRUPT` 变成**三态**：
  - 显式 `true` / `false` → 无条件发送 `features.instant_interrupt=true|false`（前者是「探不到版本但确信自己是 0.159+」的逃生门，后者是明确的 opt-out）；
  - 未设置 → 交给版本门控。
- 在 0.158 上**完全不发这个 key**（不是发 `=false`）：旧 app-server 对任何未知 `features.*` key 都会打一条 ERROR，发 `=false` 同样会被忽略并报警。
- `buildAppServerArgs(options?: { cliVersion?: string | null })` 多了一个**仅供测试注入**的可选参数，`undefined` = 去探测，`null` = 「已探测但未知」。不注入时行为不变。

### 实现中挖出的环境陷阱：`spawnSync` 的 stdio 组合

第一次真机验证时探测返回 `null` → 门控退化成「总是发送」，等于没改。定量后是一条**纯环境怪癖**（自研探针，同步 `spawnSync` 打同一个 `codex.exe`）：

| `spawnSync` 选项 | 结果 |
|---|---|
| `{ stdio: 'ignore', windowsHide: true }` | OK（这也正是 `canRunCommand` 用的形状） |
| `{ encoding: 'utf8', windowsHide: true }`（默认 `stdio: 'pipe'`） | **EBUSY**，errno -4082，5/5 失败 |
| `{ stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', windowsHide: true }` | **OK，读到 `codex-cli 0.158.0`** |
| `{ encoding: 'utf8' }`（不带 `windowsHide`） | EBUSY |

同一条命令用 bash 直接执行是好的（只多一条沙箱警告 `failed to clean up stale arg0 temp dirs: 拒绝访问`，退出码 0）。所以探测里**显式**写 `stdio: ['ignore', 'pipe', 'pipe']`，不用 `encoding` 隐含的默认管道。

真机验证（临时单测，跑完即删；这是**非模拟**的真实链路）：

```
probed CLI version     : "codex-cli 0.158.0"
supports instant_intr  : false
instant_interrupt sent : false
args                   : app-server -c approval_policy="never" -c sandbox_mode="danger-full-access" -c features.memories=true
```

顺带确认了版本输出格式是 `codex-cli 0.158.0`（带前缀），解析用的是「首个 `x.y.z`」，装饰串不影响。

## 二、CLI 启动横幅加一行（`src/cli/index.ts`）

新增 `Instant interrupt: on|off (needs codex-cli >= 0.159)`。理由：门控本身是静默的，没有可观察信号的话，用户升级到 0.159 之后无法确认这个特性到底有没有生效。

## 三、探针超时改成可覆盖（`scripts/probe-turn-page.cjs`）

`120_000` 硬编码 → `CALL_TIMEOUT_MS`，可由 `PROBE_TIMEOUT_MS` 覆盖（默认值不变），超时文案带上「冷的大线程？提高 PROBE_TIMEOUT_MS」提示；文件头部注释补了 Env 段。round-108 实测那份 32MB 线程首触 resume >330s，用默认预算必然误报。

## 四、验证

- `vue-tsc --noEmit` 干净。
- `src/server/appServerRuntimeConfig.test.ts`：**4 → 9 例**。新增覆盖：0.159 发送 / 0.158 与 0.157 **整条 key 都不发** / 未知版本仍发送 / 显式 `true` 在旧版也发送 / 显式 `false` 发 `=false` / 版本三元组按数值比较（`0.99 < 0.159`）/ 装饰串解析。单测全部注入版本，**不 spawn 真实 CLI**。
- 真机探测验证（见 §一），临时文件已删。
- 全量：**682 例**（比 round-107 记的 677 多 5，即本次新增）。连跑两次失败集合不同（3 与 4）——**恒定失败只有 `codexAppServerBridge.archive.test.ts` 的 2 例 Windows 平台差异**（隔离复跑仍失败）；`inlinePayload`（`revertTurnFileChanges`）与 `sessionLogRecovery`（"retired-shape log" 用例）**隔离复跑均通过**＝并发抖动。抖动面在 round-107 记的 3 类之外**新增了 `sessionLogRecovery`**。

## 五、遗留

1. `getThreadDetailV2` / `getThreadMessagesV2` 仍发全量 `thread/read`（round-107/108 延续），有界化未排期。
2. 版本探测只在进程内缓存，且依赖 `resolveCodexCommand()` 可用；探测失败按「支持」处理（行为等价 round-106，无功能损失）。
3. 若日后想彻底去掉同步探测，可考虑「app-server 上报 `configWarning` 时把能力位持久化」的学习式门控——本轮未做。

## 六、涉及文件

- 改：`src/server/appServerRuntimeConfig.ts`（版本门控 + 探测 + 三态 env）、`src/server/appServerRuntimeConfig.test.ts`（4→9 例）、`src/cli/index.ts`（横幅一行）、`scripts/probe-turn-page.cjs`（超时可覆盖）
- 新增：本文档
