# 第七十八轮（未发布）：接入 codegraph MCP + 用图谱复查线程打开时延

> 承接 round-77。用户要求「配置好 `@colbymchenry/codegraph` MCP 后再排查一次」。本轮先接 MCP，再用图谱复查同一条链路，定位并修掉 round-77 遗留的**首次点击线程 ~1.1s** 问题。

## 1. codegraph MCP 接入

**现状**：`@colbymchenry/codegraph` v1.5.0 已由 pnpm 全局安装（`~/AppData/Local/pnpm/bin/codegraph.CMD`），项目 `.codegraph/` 索引已存在（699 文件 / 9,709 节点 / 27,644 边 / 41.5MB），`AGENTS.md` 无 codegraph 标记。

**为什么没直接用包管理器的全局路径**：pnpm 全局目录是版本哈希目录（`pnpm/global/v11/<hash>/node_modules/...`），`codegraph upgrade` 后路径就失效，MCP 配置会静默坏掉。因此新增一个稳定的解析器：

- `~/.workbuddy/bin/codegraph-mcp.cjs`：启动时在 pnpm/npm 全局根下按深度 ≤2 搜索 `node_modules/@colbymchenry/codegraph/npm-shim.js`，找到后用 `stdio: 'inherit'` 委派；找不到时打印安装提示并以 1 退出。
- `~/.workbuddy/mcp.json` 追加（合并，不动既有 godot-mcp / godot-lsp）：

```json
"codegraph": {
  "command": "C:/Users/cattails/.workbuddy/binaries/node/versions/22.22.2-3/node.exe",
  "args": ["C:/Users/cattails/.workbuddy/bin/codegraph-mcp.cjs", "serve", "--mcp"],
  "disabled": false
}
```

**验证**：直接对启动器做 MCP 握手，`initialize` 返回 `{"name":"codegraph","version":"1.5.0"}`、`capabilities.tools=true`；`tools/list` 暴露单个工具 `codegraph_explore`（与官方文档一致：默认只开 explore，其余靠 `CODEGRAPH_MCP_TOOLS` 放开）。

**注意**：MCP 配置改动不会自动生效——需要在连接器管理页右上角的自定义连接器入口对新服务器点「信任」后才加载；本会话内工具列表未刷新，因此下面的复查改用等价的 `codegraph` CLI（`explore` / `callers` / `query`），输出与 `codegraph_explore` 相同。

**索引维护**：`codegraph sync`（本轮同步 899 个变更文件，606 新增 / 293 修改，7,519 节点，7.9s）。

## 2. 复查：round-77 之后还剩下什么

**工具**：`output/playwright/perceived-latency.cjs`（round-77 建的感知时延探针），本轮扩展了三处：请求带上开始/结束时间戳、`PROFILE_TIMELINE=1` 输出「首次点击时间线」、`PROFILE_FAKE_GIT=1` / `PROFILE_FAKE_MODELS=provider|freemode|both` 短路开关。

**稳态基线（round-77 改动已生效）**：

| 阶段 | ms |
|---|---|
| boot → 侧栏线程行 | 410–468 |
| 点击线程 #0 | **1040–1121** |
| 点击线程 #1 | 211–264 |
| 点击线程 #2 | 82–104 |

即：稳态切换已经很快，**只有「第一次点击」固定慢 ~1.1s**，且与线程内容无关——row #0 只有 9 条消息，却和 62 条的一样慢。这排除了「载荷/渲染量」类原因，指向一次性开销。

**首次点击时间线（`PROFILE_TIMELINE=1`）**：

```
start=  -263  end=   706  dur=   969  /codex-api/free-mode/status
start=   -68  end=  1208  dur=  1276  /codex-api/provider-models   ← 关键
start=   706  end=   716  dur=    10  config/read
start=   707  end=   709  dur=     2  collaborationMode/list
start=   707  end=   709  dur=     2  account/rateLimits/read
start=  1221  end=  1253  dur=    32  thread/resume              ← 直到 +1221ms 才发出
start=  1274  end=  1370  dur=    96  config/read
```

`thread/resume` 本身只要 32ms，却**等到点击后 1221ms 才被发出**，而它启动的时刻正好是 `provider-models` 结束（+1208ms）后的 13ms。

**排除项（有证据，不是瓶颈）**：

- `git/branches`：本机每个真实项目 cwd 要 1419–2777ms（`D:\code\workflow-investor` 稳定 2.6–2.8s），因为路由里串行跑 4–6 个 git 子进程，而本机单个 git 命令就要 316–488ms。但 **A/B 短路全部 `/codex-api/git/**` 后 boot 592→531ms、首次点击 1121→1092ms，几乎无变化** → 它在并行跑，没有闸住渲染。round-77 里曾把 `git/branches` 500 归因为「环境性 git 不可用」，本轮更正：git 可用，只是本机很慢；那个 500 是仓库无提交（`fatal: Needed a single revision`）。
- `free-mode/status`：**单独**短路它，首次点击 1102→1058ms（无变化）。它本身已经用 `getCachedFreeModels()` + `refreshFreeModelsInBackground()`，不在关键路径上。
- 消息列表渲染：`.conversation-item` 是暖/冷分页渲染（`WARM_PAGE_SIZE = 20` + `HOT_TURNS`），不是一次性全渲染。

**决定性 A/B**：

| 组 | boot → 侧栏 | 点击 #0 | 点击 #1 | 点击 #2 |
|---|---|---|---|---|
| 基线 | 468ms | **1102ms** | 226ms | 87ms |
| 只短路 `/codex-api/provider-models*` | 461ms | **126ms** | 219ms | 96ms |
| 只短路 `/codex-api/free-mode/status` | 421ms | 1058ms | 257ms | 95ms |

→ **`provider-models` 单独导致首次点击多付约 1s**。

## 3. 根因

用 codegraph 追调用链（`callers` / `explore`）：

```
点击侧栏行
  → useDesktopState.selectThread()                       src/composables/useDesktopState.ts:2441
      await loadMessages(threadId)                       // thread/resume，仅 ~32-80ms
      await refreshModelPreferences({ includeProviderModels: true })   ← 阻塞点
          → getAvailableModels()                          src/api/gateway/models.ts:221
              → fetchProviderModelIds()                   → GET /codex-api/provider-models
                  → 桥接路由 src/server/codexAppServerBridge.ts:1912
                      → fetchOpenCodeZenModelIds()        src/server/bridge/models.ts
                          → fetch('https://opencode.ai/zen/v1/models')   // 每次调用都打，无缓存
```

两个独立缺陷叠加：

1. **客户端在打开线程时 await 模型目录**（`selectThread` 里那行 `await`）。`getAvailableModels` 是外部网络调用，却放在线程打开的关键路径上。客户端确实有 30s 缓存（见 `tests/thread-loading-state/thread-switch-loading-flash-and-provider-models-cache.md`），但缓存只解决「60 秒内重复点击」，**首次（冷）请求永远要付真实网络时间**。
2. **服务端两个目录请求完全没有缓存**：
   - `fetchOpenCodeZenModelIds()` / `fetchCustomEndpointModelIds()` 每次调用都发一次外部请求（本机 zen 约 0.38–0.47s，冷时 1.47s），只有 5s 超时兜底。
   - `getFreeModels()`（openrouter 分支）**只在成功时写缓存**：一旦请求失败/超时，`cachedFreeModels` 永远是 `null`，于是**之后每次调用都要重新付一次网络往返**；而且那个 `fetch()` **连超时都没有**，挂住就是无限等。

本机当前 provider 是 opencode-zen（默认模型 `big-pickle`，free-mode 已启用），所以走的是第 1 条缺陷分支——这也解释了为什么 round-77 只做客户端并发去重（×4→×2）没用：它减的是重复次数，而第一次的真实网络时间还在。

## 4. 改动（3 个文件，均小 diff）

1. **`src/server/bridge/models.ts`** — 新增模块级目录缓存（TTL 10 分钟、空结果 1 分钟、同 key in-flight 去重）：
   - `readCatalog()`：有值且在 TTL 内直接返回；**已过期则先返回旧值、后台刷新**；从未取到过才真正阻塞。
   - `fetchOpenCodeZenModelIds()` / `fetchCustomEndpointModelIds()` 改为 `readCatalog(key, load)` 包装，原实现降级为 `*Uncached`（自定义端点按 baseUrl 分 key）。
2. **`src/server/freeMode.ts`** — `getFreeModels()` 语义修正：
   - `fetchFreeModelsFromOpenRouter()` 加 `AbortSignal.timeout(1500ms)`（原来没有超时）。
   - **失败也记账**：把最后得到的值（真值或兜底列表）连同时间戳写回缓存，返回给调用方的值不变，只是后续调用不再重复等网络。
   - 兜底值只压 `FALLBACK_CACHE_TTL_MS = 60s`（真值仍是 10 分钟），避免一次网络抖动把模型列表钉死 10 分钟。
   - `getFreeModels()` 过期时「先发后用」。
3. **`src/server/codexAppServerBridge.ts`** — 新增导出 `warmProviderModelCatalog()`，在既有启动预热块（`void appServer.warmUp()` 旁边）调用：按当前 free-mode 配置预热对应目录（custom / opencode-zen / openrouter 三选一），纯 best-effort。

**为什么选择服务端缓存而不是「客户端不 await」**：`refreshModelPreferences` 会在其中校正 `selectedModelId`（`useDesktopModelPreferences.ts:315-334`：选中模型不在新列表时会回落到列表首项）。改成 fire-and-forget 有让用户「点开线程立刻发送却用了上一个线程模型」的风险，而且 `getAvailableModels` 在 provider-backed 时 `requireProviderModels: true` 只返回 provider 列表——拿兜底列表去比对**反而可能把用户选的模型改掉**。服务端缓存返回的仍是同一个值，只有延迟变化，**行为零变更**。

## 5. 实测（同口径，dev server 重启后）

| 指标 | round-77 末 | 本轮修复后 |
|---|---|---|
| `/codex-api/provider-models` | 1276ms（冷）/ 662ms（均） | **3ms / max 5ms** |
| 点击线程 #0（稳态，三连测） | 1040–1121ms | **107 / 111 / 122ms** |
| 点击线程 #1 | 211–264ms | 209–250ms |
| 点击线程 #2 | 82–104ms | 82–96ms |
| boot → 侧栏线程行 | 410–468ms | 410–428ms |
| 同脚本请求总数 | 47–52 | 49–50 |

即首次点击 **1102 → ~112ms（−90%）**，与「提前短路 provider-models」的理论下限（126ms）一致。服务端目录请求从「每次都打外部 provider」变成稳态单次 ~3ms。

**观察到的边角（如实记录，未改）**：
- 服务端**重启后的第一次** `provider-models` 仍可能付一次上游往返（启动预热是后台的，若首请求早于它完成就走真实 fetch，并受 1.5s/5s 超时约束）。
- dev 模式下**服务器重启后的第一个页面** boot→侧栏会到 6.3s，这是 Vite 首次 transform 整站（生产构建不存在）；随后同页面/同进程均回落到 ~420ms。
- 冷启动后第一次点击线程在全新浏览器里仍可能 ~950ms，同属 dev 首次模块 transform（`RightGitPanel.vue` 等按需 chunk）。

## 6. 验证

- 新增 2 个测试文件，**6/6 通过**：
  - `src/server/freeMode.freeModelsCache.test.ts`（3 例）：失败被记忆化（fetch 只调 1 次）、成功被记忆化、TTL 过期后先返回旧值并后台刷新出新值。
  - `src/server/bridge/models.catalogCache.test.ts`（3 例）：zen 目录只取一次、空目录被记忆化、custom 端点按 URL 分 key。
- 全量 Vitest：**578 通过 / 2 失败**。2 个失败是 `codexAppServerBridge.archive.test.ts` 的**既有 Windows 环境性失败**（`0o600` 期望 vs Windows `0o666`；symlink 规范化顺序），与 round-76/77 记录的同一批，与本次改动无关。
- `vue-tsc --noEmit` 干净。
- 手测文档：`tests/thread-loading-state/provider-model-catalog-cache-server.md`（已登记进 `tests/thread-loading-state/index.md`）。

## 7. 状态

- 工作区改动（含 round-77 未提交部分）：`src/composables/useDesktopStatePersistence.ts`、`src/composables/useDesktopState.ts`、`src/api/gateway/models.ts`、`src/server/bridge/models.ts`、`src/server/freeMode.ts`、`src/server/codexAppServerBridge.ts`；新增 `src/composables/useDesktopStatePersistence.turn-durations.test.ts`、`src/server/freeMode.freeModelsCache.test.ts`、`src/server/bridge/models.catalogCache.test.ts`、`tests/thread-loading-state/turn-duration-mirror-sends-deltas.md`、`tests/thread-loading-state/provider-model-catalog-cache-server.md`、`output/playwright/perceived-latency.cjs`；配置文件 `~/.workbuddy/bin/codegraph-mcp.cjs`、`~/.workbuddy/mcp.json`（仓库外）。
- **未提交、未 bump 版本（仍 0.1.121）、未 tag、未 publish**。
- dev server 仍在 `127.0.0.1:4173` 运行；不操作 5173。
