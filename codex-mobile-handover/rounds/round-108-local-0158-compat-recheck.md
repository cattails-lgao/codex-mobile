# round-108 — 本机停在 0.158.0：round-103~107 全部改动的兼容性复核

日期：2026-09-30。用户口径「本机我无法升级159版本，你看看改动有没有问题」。

**背景：** round-103~106 的协议探针与实测都在**另一台机器（codex-cli 0.159.0）**上完成，round-106 phase-2 又按 0.157~0.159 的盘点落地了一批字段/协议接入（`instant_interrupt` 默认开、回退只走 `thread/revert`、`items/list` gateway、turn 时间戳、`originator`）。本机（换机后的工作机）CLI 停在 **0.158.0**，需要确认这批改动在 0.158.0 上不会坏。**本轮不改产品代码**——纯复核 + 实测。

## 一、结论先行

**0.158.0 上没有任何一处改动会失效或报错。** 唯一的差别是 `instant_interrupt` 这个 0.159 特性在 0.158.0 上静默不生效（被服务端忽略），且这条忽略**用户完全看不见**。

## 二、逐条实测

方法（全部直连 app-server，不经桥，跑在**真实 0.158.0**上）：
`tmp/probe-flag-compat.cjs`（带/不带 `-c features.instant_interrupt=true` 对照启动）、`tmp/probe-0158-capabilities.cjs`（靠「错误停在方法分发还是参数校验」判别方法是否存在）、`tmp/probe-0158-fields.cjs`（真实线程取字段）。

| 改动（round-106 起） | 0.158.0 实测结果 | 结论 |
|---|---|---|
| spawn 默认加 `-c features.instant_interrupt=true` | app-server **正常启动**、`initialize` 正常返回 `codex-web-local/0.158.0 …`；stderr 多一条 `ERROR codex_app_server: Codex is ignoring 2 unrecognized configuration settings … session-flags: features.instant_interrupt is ignored`，并发一个 `configWarning` 通知 | ✅ **不致命**。关闭该 flag 对照组只报 1 条（`config.toml` 的 `disable_response_storage`），差别就是这一条。日志被桥吞（`codexAppServerBridge.ts:481` 注释 "Keep stderr silent in dev middleware"），通知在 `useDesktopState.ts:256` 的 `KNOWN_IGNORED_NOTIFICATION_METHODS` 里是显式 no-op → **用户不可见** |
| 删 `thread/rollback`、回退只走 `thread/revert` | `thread/rollback` → `-32600 unknown variant \`thread/rollback\``（**确已移除**，与 #44915 一致）；`thread/revert`、`thread/turns/list` 都存在（错误停在 threadId 格式校验） | ✅ 改法**方向正确**：0.158.0（≥0.156）同样只剩 revert 一条路，保留 rollback 分支才是错的 |
| `listThreadItemsPage`（`thread/items/list`） | 方法已注册（语义 0.159 才实现）；**全仓零调用**（grep 只有 `threads.itemsPage.test.ts`） | ✅ 无运行时风险 |
| `originator`（0.157 #47113） | 真实 summary 含 `originator: "Codex Desktop"` | ✅ 在 0.158.0 上**真的生效** |
| `turn.startedAt` → `turnStartedAtIso`（0.157 #47114） | 真实 turn 含 `startedAt: 1787906272`（**秒**口径）+ `completedAt` + `durationMs` | ✅ 生效；`>1e11 视为毫秒` 的双口径转换读数正确 |
| `historyMode` 缺省 legacy→paginated | 真实 summary 已是 `'paginated'`；全仓唯一「消费者」`useDesktopState.ts:3225` 是**注释**（分发已成死代码） | ✅ no-op |
| round-105 `turn/steer{expectedTurnId}` | 方法存在（已在 0.158.0 上实跑过 live 探针） | ✅ |
| round-102 有界翻页能力位分流 | `thread/turns/list` 存在 | ✅ 退居守势（防御性保留） |
| `8a73bced` 删 `setDefaultModel` | 全仓零引用 | ✅ |
| 展示层三处（`MessageToolbar` / `ThreadConversation` / `SidebarThreadRow`） | 全部 `v-if`、可选 prop 默认值、`Number.isNaN` 兜底 | ✅ 缺字段只是不展示 |

## 三、顺带发现：探针 120s 预算对大线程冷启偏紧（**非本轮改动引入**）

跑 `scripts/probe-turn-page.cjs`（本机 0.158.0、沙箱 `.codex`）复现 round-101 的现象：

```
FAILED: timeout after 120s: thread/resume
```

用 `tmp/probe-0158-first-touch.cjs` 对同一线程（沙箱 `.codex` 里那份 32MB、由 fork 产生的 legacy `custom` 线程 `01a04668-ce01-7d21-977b-ef76aae454a5`）定量：

| 调用 | 耗时 |
|---|---|
| `thread/read {includeTurns:false}` | **336ms** |
| `thread/resume {excludeTurns:true}` 首次 | **>330s 未返回**（被脚本预算截断） |
| 同进程第二次 resume | **33.2s** |

**判定：这就是 round-101 记的「大线程首触一次性迁移」在本机复现。** round-104 的「280s 不复现（124MB 首触 8.0s）」应是在**已经迁移过**的副本上测的（那份线程在 round-103/104 被反复 resume 过）。期间 `codex.exe` 子进程 CPU 持续增长（6 分钟烧 305s）＝**在算而不是在等 writer lock**，故不是锁争抢导致的假死。

探针直连 app-server、完全不经 `src/`，所以**与本次改动无关**；但说明 `probe-turn-page.cjs` 硬编码的 **120s 单次调用预算**在冷副本上必然误报。建议（未做）：把该预算改成环境变量可覆盖（默认值不变），或跑探针前先「热」一次再计时。

## 四、验证

- 4 个临时探针（`tmp/`，未入库）结论明确、对照齐全。
- `vue-tsc --noEmit` 与全量单测沿用 round-107 结果（677 例，恒定失败 2 例 archive 平台差异）。
- **未改任何产品代码**；无新增/修改单测。

## 五、遗留与建议

1. `features.instant_interrupt` 在 <0.159 上是「死参数 + 每次启动一条 ERROR 日志」（不可见、无功能影响）。若在意噪声/语义诚实，可选：按 CLI 版本门控该 flag，或改成默认关（`CODEXUI_INSTANT_INTERRUPT=true` 才开）——**需产品决策，本轮未动**。
2. `probe-turn-page.cjs` 的 120s 单次预算（见 §三）。
3. 延续 round-107：`getThreadDetailV2`/`getThreadMessagesV2` 仍发全量 `thread/read`（本机 336ms 尚可，0.159 大线程 6.0–6.2s），有界化未排期。

## 六、涉及文件

- 新增（`tmp/`，临时未入库）：`probe-flag-compat.cjs`、`probe-0158-capabilities.cjs`、`probe-0158-fields.cjs`、`probe-0158-first-touch.cjs`
- 新增：本文档
