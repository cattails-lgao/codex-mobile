# Round-82：systemd 停止超时——websocket 连接持有导致 shutdown 走兜底路径（2026-09-15）

> **背景：** 用户报告 `systemctl restart codexapp.service` **每次**都在 systemd 日志里留下一条失败行，形态两种交替：`Failed with result 'exit-code'`（应用 `status=1` 退出）与 `Failed with result 'timeout'`（systemd SIGKILL）。用户已自行完成诊断：systemd 侧 `/etc/systemd/system.conf` 的 `DefaultTimeoutStopSec=5s` 决定 unit 的 `TimeoutStopUSec=5s`，而应用侧 [src/cli/index.ts](../../src/cli/index.ts) 的 `shutdown()` 同时注册了 `server.close()` 回调（`exit(0)`）与 5000ms 兜底（`exit(1)`），**两个 5 秒定时器赛跑**，谁先到点决定日志形态。用户已在 service 层加 drop-in `TimeoutStopSec=30` 作为缓解，并明确真正的根治点在 app 层源码（`ExecStart` 指向包内 `dist-cli/index.js`，改 `node_modules` 或 service 配置都会在下次升级时被覆盖）。本轮按此修复 app 层。

## 现象

- 09-11 01:28 / 10:34 / 16:07 三次为 `status=1/exit-code`（应用兜底定时器赢）；09-11 21:37 与 09-15 10:11 两次为 `Failed with result 'timeout'`（systemd SIGKILL 赢）。
- 与版本无关：v0.1.119 → v0.1.123 之间 `src/cli/index.ts` 无 diff；也与负载无关。
- 实际使用不受影响：新进程约 1s 后拉起、`active`、`3030` 返回 200；`Restart=on-failure` 不会因主动停止而循环。代价是每次重启固定多等 5 秒、走兜底路径而非优雅排空，且失败退出码在日志里制造噪音、掩盖真正的重启故障。

## 根因（实测确认）

两个 5 秒定时器赛跑只是「日志为什么有两种形态」的解释；**真正的病根是 `server.close()` 在 5 秒内不返回**。用户诊断指出「代码里没有 `closeIdleConnections()` / `closeAllConnections()`，keep-alive 连接或 websocket 不会主动断开」。本轮用真实 Node + 真实 `ws` 的受控探测把这一点**进一步收窄并修正**：

| 客户端 | 关闭策略 | `server.close()` 回调 | 结论 |
| --- | --- | --- | --- |
| http keep-alive | 不加任何处理 | **1ms** | keep-alive **不**持有连接（Node 22 的 `close()` 已能处理 idle 连接） |
| websocket | 不加任何处理 | **未触发**（2200ms 窗口结束仍 held=1） | websocket 才是持有者 |
| websocket | `closeIdleConnections()` + 1s 后 `closeAllConnections()` | **仍未触发** | **这两个方法对升级后的 socket 完全无效** |
| websocket | 显式 `terminate()` 客户端 | **2ms** | 唯一有效手段 |
| SSE | `closeIdleConnections()` + 1s 后 `closeAllConnections()` | 1009ms | 活跃 HTTP 长响应需要 `closeAllConnections()` |
| SSE + websocket | `terminate()` + `closeAllConnections()` | 1013ms | 两者结合才彻底 |

**机制：** Node 在 http server 触发 `upgrade` 事件后，会把该 socket 从 server 的 tracked connections 集合中移除；`closeIdleConnections()` / `closeAllConnections()` 都是遍历该集合工作，因此**都够不到升级后的 websocket socket**。而 `server._connections` 计数仍为 1（升级不改变计数），所以 `server.close()` 会一直等这个 socket 自己结束。

**这意味着：单纯按「补 `closeIdleConnections()` / `closeAllConnections()`」的思路修，修不好这个问题**——必须显式终止 websocket 客户端。

探测脚本为一次性诊断（`tmp/` 下，已被 gitignore，不进仓）：Node `v22.22.2`，真实 `WebSocketServer({ noServer: true })` + `server.on('upgrade')`，与生产接线方式一致。

## 修复（2 个源文件 + 1 个测试）

**① [src/server/httpServer.ts](../../src/server/httpServer.ts)：把 websocket 清理暴露出来**

- 新增导出 `shutdownWebSocketServer(wss)`：遍历 `wss.clients` 逐个 `terminate()`，再 `wss.close()`。
- `ServerInstance.attachWebSocket` 的签名由 `(server: HttpServer) => void` 改为 `(server: HttpServer) => () => void`——返回清理函数，调用方才能在 `server.close()` 前主动断开客户端。

**② [src/cli/index.ts](../../src/cli/index.ts)：`shutdown()` 补连接清理**

- `const shutdownWebSockets = attachWebSocket(server)` 接住清理函数，`shutdown()` 内先于 `server.close()` 调用。
- 补 `server.closeIdleConnections()` 与 1s 后 `server.closeAllConnections()`，覆盖 SSE 等活跃 HTTP 长响应。
- 把 5 秒兜底定时器**提到函数最前注册**：这样即使上面的清理步骤抛错，兜底仍然生效，不会退化成「挂到 systemd 的停超时」。
- `closeIdleConnections` 加 `typeof === 'function'` 防护：`package.json` 的 `engines` 声明 `>=18`，而这两个 API 是 **Node 18.2** 才引入的；不加防护的话在 18.0/18.1 上会抛 `TypeError`，反而把 5 秒兜底变成 30 秒挂死。

**设计取舍：**

- **为什么用 `terminate()` 而不是 `ws.close()`**：`close()` 只发送关闭帧并等对端回帧（`ws` 库内部还有 30s 超时），客户端不响应就仍然挂着，等于没修；`terminate()` 直接销毁 socket，是可靠路径。代价是浏览器侧看到的是连接重置而非干净的 `1001` 关闭，但服务正在重启、前端本就有重连退避逻辑。
- **为什么保留 5 秒兜底**：安全网。修复后正常路径应在约 1s drain 内退出。
- **为什么 drain 取 1 秒**：给正在写入的普通 HTTP 响应一点完成时间，同时把退出时延压到远低于 `TimeoutStopUSec`。

## 验证

| 项 | 结果 |
| --- | --- |
| 机制探测（真实 Node 22.22.2 + 真实 ws） | 见根因表：定位到 websocket 是唯一持有者，且 `close*Connections()` 对它无效——决定了修法 |
| 新增契约单测 [httpServer.websocketShutdown.test.ts](../../src/server/httpServer.websocketShutdown.test.ts) | **2/2 通过**：① 有 ws 客户端时 `server.close()` 不回调（基线，复现 bug）→ `shutdownWebSocketServer()` 后回调；② 无客户端时安全不抛 |
| 真实 dist-cli 端到端 | 启动日志 `Codex Web Local is running!` 正常；`GET /` → **200**；`/codex-api/ws` 握手返回 `{"method":"ready","params":{"ok":true},...}` |
| `vue-tsc --noEmit` | **通过**（`TSC_EXIT=0`） |
| 全量 Vitest | **589 通过 / 2 失败**。基线为 587 通过 / 2 失败，**+2 即本轮新增用例**；2 例失败为既有的 `codexAppServerBridge.archive.test.ts` Windows 环境性失败，与本轮无关 |
| tsup CLI 构建 | **通过**（`dist-cli/index.js` 651.27 KB） |
| 产物校验 | `dist-cli/index.js` 含 `client.terminate()` 与 `closeIdleConnections` / `closeAllConnections`，确认打包链路接上了新逻辑 |

**未能验证（如实记录）：**

- **本机 Windows 无法投递真实 SIGTERM**。实测 `child.kill('SIGTERM')` 在 Windows 上走 `TerminateProcess`，JS 的 `process.on('SIGTERM')` 处理器**不执行**（子进程 stdout 只有 `ready`，没有 `GOT_SIGTERM`，`exit code=null / signal=SIGTERM`）。因此「收到 SIGTERM → 约 1s 内 `exit 0`」这一段只能在 Linux 侧验证，用户线上环境正是 Linux。
- 未在 Linux/systemd 环境实测 `systemctl restart` 日志（待 Linux 侧复核，步骤见 [手测文档](../../tests/cli-network-platform/systemd-stop-finishes-inside-timeout.md)）。

## 性能审计

`shutdown()` 只在进程退出时执行一次：退出时延由「固定 5s 兜底 + `exit 1`」变为「≤1s drain + `exit 0`」；新增 1 个 1s `unref` 定时器（不阻塞事件循环、不阻止自然退出）；无新增请求、无网络、无缓存改动，steady-state 运行路径完全不受影响。改动仅涉及退出路径，代码路径分析即可，无需 live profiling。

## 边界（如实记录）

- 依赖 Node「`upgrade` 后 socket 脱离 tracked connections」的行为，实测于 **Node 22.22.2**；`closeIdleConnections` / `closeAllConnections` 需 **Node ≥ 18.2**，已做存在性防护。
- 用户已在 service 层加的 drop-in `TimeoutStopSec=30` **本轮未触碰**。修复后它不再是常规路径，但作为缓冲仍有价值：若将来出现新的连接持有者，30s 能提供诊断窗口而不是直接 SIGKILL。
- 未覆盖：若客户端在 drain 窗口内持续发起新请求，普通 HTTP 响应仍会在 1s 后被 `closeAllConnections()` 强制中断——这是有意的上界，不是缺陷。

## 发布状态

随 **v0.1.124** 发布。commit 链、tag 与 GitHub Release 记录见 [sections/commit-history.md](../sections/commit-history.md) 的 v0.1.124 段；npm publish 由用户执行。
