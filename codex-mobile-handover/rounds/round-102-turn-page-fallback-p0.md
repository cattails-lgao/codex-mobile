# round-102 — P0：翻旧轮次兜底修复（0.158.0 上回落=挂死）

日期：2026-09-29。承接 round-101 审计的第 1 条建议。用户指令「开始做P0」。

## 一、问题回顾

round-86 的设计是「有界翻页任何意外 → 回落全量水合」（`threadRoutes.ts` 的
`/codex-api/thread-turn-page` 路由）。在 codex-cli 0.158.0 上这条兜底变成毒药：

- `thread/turns/list` 已注册但未实现，实测回 `-32601: list_turns is not supported yet`；
- 有界路径必失败 → 必然回落 `thread/read {includeTurns:true}` 全量水合；
- 0.158.0 的全量水合在大线程挂死（>90s 无响应）→ **上翻长会话卡死 UI**。

## 二、修复设计（能力位分流，不按 cliVersion 字符串猜）

不解析 rollout 的 `cliVersion`（写入时的版本≠运行中的版本），改用**运行时能力探测**：
app-server 亲口承认不实现该方法才禁用兜底，误判代价最小化。

1. **`bridge/threadTurnPage.ts`**：新增 `ThreadTurnPageUnsupportedError` +
   `isTurnListUnsupportedError()`（签名正则 `-32601|not supported|not implemented|unknown variant|method not found|unknown method`，宽松匹配——假阳性只是少个兜底，假阴性才是挂死）。两个 `thread/turns/list` 调用点（id 列表、整页获取）失败时分类：不支持 → 抛错，其余 → 照旧返回 null。`thread/read` 元数据失败不分类（所有版本都支持）。
2. **`codexAppServerBridge.ts`**：包装层 catch 到该错误 → 锁存
   `threadTurnPageUnsupported = true`（进程生命周期内有效：运行中的 app-server 不会换二进制）+ 新公开方法 `isThreadTurnPageUnsupported()`。
3. **`threadRoutes.ts`**：有界失败且能力位锁存 → 返回 200 边界响应
   `{ result: null, startTurnIndex: 0, hasMoreOlder: false, olderTurnsUnavailable: true }`，**绝不调用** `readThreadForTurnPage`。未锁存（旧 CLI 的游标陈旧/瞬时错误）→ 原全量回落逐字保留。
4. **前端 `api/gateway/threads.ts`**：`getOlderThreadMessagesV2` 识别
   `olderTurnsUnavailable` → 抛 `CodexApiError('当前 codex-cli 版本暂不支持加载更早的消息', { code: 'older_turns_unavailable' })`（`CodexErrorCode` 联合类型扩了这个码；`normalizeCodexApiError` 原样保留实例）。
5. **`composables/useDesktopMessageHistoryLoading.ts`**：`loadOlderMessages`
   catch 到该码 → 把 `hasMoreOlderMessagesByThreadId[threadId]` 收敛为 `false`（终态，停止重试循环），错误横幅提示一次；其余失败保持原行为（标记不动、可重试）。

**错误信号穿透链**（实测依据）：桥 `pendingRequest.reject(new Error(message.error.message))`
直接透传 JSON-RPC error.message → 0.158.0 文案含 `not supported yet` → 正则必命中。

## 三、已知边界（本轮未修，刻意）

- **0.158.0 上「更早轮次」整体不可用**：不只是兜底问题——resume 的
  `readThreadTurnCount` 也走 `thread/turns/list`，失败 → `threadTurnStartIndex` 缺省 → 前端 `hasMoreOlder=false` → 打开会话后上翻入口静默关闭（最新 10 轮可见，更早的暂不可达，无提示）。等上游实现 turns/list 后自动恢复，届时复跑 `scripts/probe-turn-page.cjs`（round-101 P1）。
- **`getThreadDetailV2`/`getThreadMessagesV2` 仍发 `thread/read {includeTurns:true}`**（threads.ts 直连 RPC，不走 turn-page 路由），0.158.0 大线程上同样有挂死风险；是否改写为有界请求属独立决策（涉及 `thread/read` 是否支持 initialTurnsPage，未实测），留待下轮。
- 0.156 行为修复、queue/steer/exec 等机会清单项未动（round-101 P2/P4）。

## 四、验证

- `vue-tsc --noEmit` 通过。
- 定向 5 文件 67/67 通过；全量套件 **663 例 / 661 通过 / 2 失败**——与 Windows
  基线完全同构（archive 平台差异），新增 5 例全绿：
  - `threadTurnPage.test.ts`：不支持签名抛错（id 列表 + 整页两个调用点）、分类器正负例；
  - `threadRoutes.turnPage.test.ts`（新文件）：**边界响应且 `readThreadForTurnPage` 零调用**、**未锁存时原回落保留**。
- 错误签名 `-32601: list_turns is not supported yet` 来自 round-101 直连探针实测。

## 五、改动清单

| 文件 | 改动 |
| --- | --- |
| `src/server/bridge/threadTurnPage.ts` | `ThreadTurnPageUnsupportedError` + 分类器；两处 turns/list catch 分类 |
| `src/server/codexAppServerBridge.ts` | 能力位锁存字段 + `isThreadTurnPageUnsupported()`；包装层 catch 升级 |
| `src/server/bridge/threadRoutes.ts` | 门面类型加查询方法；路由兜底前检查能力位 → 边界响应 |
| `src/api/codexErrors.ts` | `CodexErrorCode` 扩 `older_turns_unavailable` |
| `src/api/gateway/threads.ts` | 识别边界响应，抛带码错误 |
| `src/composables/useDesktopMessageHistoryLoading.ts` | 终态收敛 hasMoreOlder，停止重试 |
| 测试 | `threadTurnPage.test.ts` +3 例；`threadRoutes.turnPage.test.ts` 新建 +2 例 |
