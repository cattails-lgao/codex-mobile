# round-183：线上「间歇性网络错误」收口 —— SW 缓存版本化 + WS 心跳 + provider-models 超时

> 起因：用户报「打开线程后过一阵子，Network 面板出现网络错误」，指名两条端点 —— `GET /codex-api/server-requests/pending` 与 `GET /codex-api/provider-models?provider=litellm`。最终用户**清空应用缓存后恢复**。
>
> 结论先行：**接口本身没有问题**（两轮独立取证、共 121 个请求、0 失败），但有**三条独立缺陷**会让同一个现象反复出现：①Service Worker 缓存名写死 ⇒ 重部署后旧构建可长期存活；②`/codex-api/ws` 无心跳 ⇒ 中间层每 120s 判死，客户端每 2 分钟重连并补打一次 `pending`；③`provider-models` 前端 5s 硬超时 ⇒ 慢响应变成 `net::ERR_ABORTED` 红条，而界面毫无提示。三条本轮全部修掉。

## 一、取证

### 1.1 接口侧：两轮独立测量，均无失败

| 手段 | 规模 | 结果 |
| --- | --- | --- |
| headless Chromium，驻留 7 分钟（`tmp/r182b-longrun-probe.cjs`） | 35 个 `/codex-api` 请求 | `0 failed` · `0` 个 4xx/5xx · `0` console error |
| **真机 Edge 155 + CDP**，驻留 7 分钟（`tmp/r182g-edge-session.cjs`） | 86 个 `/codex-api` 请求 | `loadingFailed` 仅 **1 条**，且是探针 `Page.reload` 打断上一页在途请求（`net::ERR_ABORTED` / `canceled=true` / URL 归属不到） |
| 直连 curl，两个端点各 3 次 | 6 次 | 全 `200`：`pending` 11B / 0.15–0.17s；`provider-models?provider=litellm` 239B / 0.18–0.19s |

⇒ 服务端不慢、不报错。「红条」不是接口故障。

### 1.2 WS 生命周期：120s 必被切断（真机同样成立）

裸 WebSocket 直连线上端点：

```text
+0.2s   open
+0.2s   msg#1 {"method":"ready",...}     ← 全程只有这一帧
+120.2s close code=1006                  ← 无 close 帧，被中间层掐断
```

真机 Edge 的 `Network.webSocketClosed` 同样出现：`+133.2s` 与 `+358.4s` 各一次（中间 `+134.2s` / `+238.2s` 重建）。

服务端侧对应代码只做两件事：连接建立时发一帧 `ready`、订阅 bridge 通知 —— **从不发 ping，也不检查 pong**。

### 1.3 `pending` 的触发源：只有 WS 连上那一刻

`useDesktopState.ts` 的 `startPolling()` 打一发；此后**每收到一次 `ready` 通知**就 `recoverBridgeState()` → 再打一发。实测时间线完全吻合：

| 时刻 | 事件 |
| --- | --- |
| +16s | WS 连上 → `pending` ×2（`startPolling` + `ready`） |
| +137s | WS 重连 → `pending` |
| +259s | WS 重连 → `pending` |
| +384s | WS 重连 → `pending` |

⇒ **没有定时轮询**。它「过一阵子才出现」= WS 每 120s 掉线一次。

### 1.4 空闲 HTTP 连接：65s 被关

同一台机器用 keep-alive agent 复测：打完一枪后 socket 在 **+65.3s** 被服务端关闭。低频请求（2 分钟一次的 `pending`、TTL 5 分钟的 `provider-models`）容易落在将死的 socket 上，这是「偶发红条」的第二条来源。

### 1.5 `provider-models` 的红条形态（受控实验）

把该路由人为拖延 6.5s（`tmp/r182d-abort-shape.cjs`）：

```text
requestfailed  /codex-api/provider-models?provider=litellm
failure        net::ERR_ABORTED          ← Network 面板红条
页面状态        无任何错误提示（catch {} 静默吞掉）
```

### 1.6 用户处置

清空应用内缓存后恢复正常，且此后未再复现。

## 二、根因与修法

### 2.1 Service Worker：缓存名写死 + 安装易失败（`public/sw.js`）

两条叠加：

1. `CACHE_NAME = 'codexweb-shell-v2'` **写死** ⇒ 两次构建的 `sw.js` 字节**完全相同** ⇒ 浏览器不判定更新，既不重新 `install`，`activate` 里也不会删旧缓存。重部署后旧标签页请求已下线的 chunk 时，`networkFirstStatic` 还会把缓存里的旧文件喂回去 —— 整页继续跑旧构建。
2. `install` 用 `cache.addAll([...])`：**任一资源失败就整体 reject**，新 SW 装不上、旧 SW 继续服务。重部署瞬间最容易踩。

修法：

- `BUILD_ID` 由构建期注入：`const CACHE_NAME = \`codexweb-shell-${BUILD_ID}\``，值取 `dist/index.html` 的 sha256 前 10 位（`index.html` 里含全部 chunk 哈希 ⇒ 产物一变必然变）。产物变化 ⇒ `sw.js` 字节变化 ⇒ 走标准更新流程 ⇒ `activate` 清掉所有非当前版本的缓存。
- `install` 改成逐个 `cache.add` 且各自 `catch`：单个资源失败不再阻断新版本接管。
- `networkFirstNavigation` 只在响应 `ok` 时写缓存（原来会把 500 页面也存成 shell）。

注入由 `vite.config.ts` 的新插件 `codex-sw-version` 完成（`writeBundle` + `closeBundle` 各兜一次，因 `public/` 拷贝时机在 Vite 版本间有差异），并在 `closeBundle` **断言占位符已被替换**：没注入就直接构建失败，避免静默退回「缓存永不失效」的老行为。

### 2.2 `/codex-api/ws`：加心跳（新模块 `src/server/bridge/wsHeartbeat.ts`）

- 每 **25s** 发一次 ws 控制帧 `ping`（浏览器自动回 `pong`），让链路始终有字节流动；
- 每个 tick 先在「上一 tick 后是否收到过 pong」上判定，**连续一个整周期静默**才 `terminate` ⇒ 单次丢包不会误杀；
- `close` / `error` 自清理，定时器 `unref()`，不拖住进程退出;
- 生产（`src/server/httpServer.ts`）与 dev server（`vite.config.ts` 的 `configureServer`）**两处都接**，避免 dev / 隧道环境继续掉线。

### 2.3 `provider-models`：5s → 12s（`src/api/gateway/models.ts` 与 `src/api/gateway/threads.ts`）

两处同值常量都从 `5_000` 放宽到 `12_000`。桥空闲时该端点只要 69–193ms，12s 足够覆盖 app-server 忙（长轮次 / 水合中）的场景，同时仍能兜住真挂掉的请求。

## 三、验证

### 3.1 四道闸门（本机实测）

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | 退 **0** |
| `vitest run` | **1089 / 1089，99 文件**（round-180 基线 1083/98 ⇒ +6 例 / +1 文件，全部来自新增的 `wsHeartbeat.test.ts`） |
| `vite build` | 退 **0**；`dist/sw.js` 注入结果 `codexweb-shell-d17f43ac5d`，占位符残留 **false** |
| `tsup` | 退 **0**（`dist-cli/index.js` 697.49 KB） |

### 3.2 心跳的真实服务验证（不是只跑单测）

用生产入口 `dist-cli` 起服务（`--no-tunnel --no-open --no-login --no-password -p 4199`，cwd 在仓外、`CODEX_HOME` 指向仓内 tmp 下全新空目录），挂两个客户端：一个正常（自动回 pong）、一个 `autoPong: false`（不回 pong）。

```text
+4.2s   server up (HTTP 200)
+4.3s   auto-pong OPEN / no-pong OPEN   （各收到一帧 ready）
+29.3s  auto-pong PING / no-pong PING   （连接后 25s）
+54.3s  auto-pong PING                  （第二个周期）
+54.3s  no-pong CLOSE code=1006          （一个整周期无 pong ⇒ 被 terminate）
判定：ping 次数 2 / 不回 pong 被回收 / 正常连接未误杀 —— 三项 PASS
```

### 3.3 文档闸门

`check-handover-desensitization` 违规 **0** · `check-md-links` 失效 **0** · `regen-app-server-doc --check` drift **0**。

## 四、诚实边界

1. **用户那两条红条本身没有复现**。两轮驻留（headless + 真机 Edge）合计 121 个 `/codex-api` 请求、0 失败。能确定的只有：清缓存后自愈 ⇒ 指向客户端陈旧状态；**但不能证明「就是 SW」**（浏览器的 HTTP 缓存、扩展、用户当时的网络抖动都能造成同样现象）。本轮修的是「让这件事不再有土壤」的三条独立缺陷，不是「抓住了那次具体现场」。
2. **「心跳能骗过 nginx 的 120s」尚未在线上验证**。本机没有 nginx，只验证了「会按 25s 发 ping」「不回 pong 会被回收」。nginx 转发 WS 控制帧是标准行为，但按本仓口径，未验证的事不写成结论 —— **要等下一次重部署后，再用裸 ws 探针连线上端点看是否还会在 120s 断**。
3. **12s 只改了阈值，「慢响应现在能成功」没有端到端复现**。要复现得在 app-server 正忙时打这个端点，本轮没有构造该场景；受控实验只证明了失败形态（`net::ERR_ABORTED`）。
4. **`provider-models` 失败仍然对用户不可见**。`error` 这个全局通道在 UI 上没有渲染位（round-176 已登记），要把「模型列表拉取失败」显示出来需要独立的界面位，本轮不做。
5. **SW 注入的负向路径未自动化验证**：`closeBundle` 里那句「占位符仍在就抛错」只在正向构建里跑过（注入成功、未触发抛出），没有专门造一次未注入的构建去验证它真的会让构建失败。
6. **`install` 改逐个 add 的代价**：全新浏览器首次访问时，若 shell 资源全部失败，SW 仍会激活（但不含离线副本），之后网络恢复才会补齐 —— 这是「宁可新版本接管，也不要卡在旧版本」的有意取舍。

## 五、未做（本轮明确不碰）

- `review/summary` 在 7.5 万改动文件的 worktree 上要 23–46s（响应体仅 77B），是最容易被误报成「网络错误」的一条；它属于 Git 面板的取数口径问题，另议。
- `provider-models` 失败的界面可见化（见 §四.4）。
