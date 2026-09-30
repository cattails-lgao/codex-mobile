# round-116 — 集成终端改用 app-server 官方 exec/PTY 通道：去掉 `node-pty` native 依赖

日期：2026-09-30。由头：用户口径「还有什么可以做」→ 我列了四项机会清单（`account/usage/read` / **exec/PTY 官方通道** / `thread/backgroundTerminals/*` / `windowsSandbox/*`）→ 用户选**「exec/PTY 官方通道」**。

**结论先行：** 集成终端从**自建 `node-pty`** 改为跑在 app-server 的**官方 `command/exec {tty:true}` 通道**上。新增 `src/server/bridge/execPtyChannel.ts`（约 220 行）把 exec 通道适配成 `ThreadTerminalManager` **早已定义**的 `SpawnTerminal` 契约，因此**管理器主体一行未改**（会话/16KB 环缓冲/四种通知/attach 复用/dispose 全部原样），HTTP 路由与前端契约（`/codex-api/thread-terminal/*`、四种 `terminal-*` 通知）也**零改动**。删掉 `optionalDependencies.node-pty`、`postinstall` 修补脚本、`pnpm-workspace.yaml` 的 `allowBuilds`，并把 `publish-android.sh` 里的 node-pty 剥离循环改为注释。**先探针后改**：三项只读探针先证明四项机会在 0.158.0 **全部已实现**，再逐项验证 exec 通道**真能替代**自建 PTY。**验证**：`vue-tsc --noEmit` EXIT=0；定向 16/16；**全量 714/714 零失败**（= round-115 的 706 + 新增 8 例）；真机端到端（真实 vite dev + 真实 SSE）全绿。

## 一、为什么值得动它

`node-pty` 在 `package.json` 里是 **`optionalDependencies`**（`package.json:72-74`，改动前）：

```json
"optionalDependencies": { "node-pty": "^1.1.0" }
```

`optionalDependencies` 的语义是「装不上也**不算安装失败**」，于是任何**编译不成功**的机器（无构建工具链、预编译包缺失、跨架构、Docker slim 镜像等）会**静默丢掉整个集成终端**——不是报错，是 `available:false`、终端入口直接没了。这不是假想：仓库里为此常驻两处专门的 workaround：

| 位置 | 内容 |
|---|---|
| `package.json` | `"postinstall": "node scripts/fix-pty-native-build.cjs"` |
| `scripts/fix-pty-native-build.cjs` | 专为修补 node-pty 的 Makefile 编译问题而存在（修补的是 `cmd_copy = ln -f ...` 那段 ln/cp 逻辑） |
| `publish-android.sh` | **显式删除** `node-pty`（`for (const dep of ['node-pty','node-pty-prebuilt-multiarch'])`）→ 等于 Android 包**从来没有终端** |

而 app-server **本来就是本项目的硬依赖**（没有它整个 UI 都不工作）。它的 exec 通道在所有能跑 app-server 的平台上都提供真 PTY——**把「终端的可用性」从「native 编译是否成功」这个不可控变量上摘下来**，顺带删掉一个 native 依赖、一个修补脚本、一处平台特判。

## 二、先探针：四项机会清单在 0.158.0 的真实状态

**探针 1｜`tmp/probe-0158-new-features.cjs`（方法存在性，12 方法）。** 用「故意不全的参数」探测：不存在的 method 会回 `-32601`，存在则回参数错误或业务错误。

| 机会 | 探针实测 |
|---|---|
| `account/usage/read` | **已实现**，实返 `codex account authentication required to read token usage`（需 ChatGPT 账号认证，非方法缺失） |
| `windowsSandbox/readiness` | **已实现**，实返 `{"status":"notConfigured"}` |
| `command/exec` + `command/exec/{write,resize,terminate}` + `process/{spawn,kill,resizePty}` | **8 个方法全在**（均回参数/业务错误，无 `-32601`） |
| `thread/backgroundTerminals/{list,terminate,clean}` | **3 个方法全在** |

即：**四项机会在 0.158.0 里全部已实现**，没有一项是「版本不够」。

**探针 2｜`tmp/probe-0158-exec-pty.cjs`（PTY 能力，7 项）+ `-params.cjs`（参数组合/UTF-8/写序/干净退出）。** 逐项验证官方通道能不能真的顶替自建 PTY：

| 能力 | 实测 |
|---|---|
| Windows 上 `command/exec {tty:true}` 开真 PTY | ✅ ANSI 序列 + Windows banner + 提示符 |
| `outputDelta` 增量到达 | ✅ 多帧、非一次性 |
| `command/exec/write {deltaBase64}` 双向 stdin | ✅ 命令回显成功 |
| resize / terminate | ✅ 均被接受 |
| 多会话隔离 | ✅ 两个 processId 输出不串 |
| 大输出 | ✅ 370 帧 / 22991B，**未触发 `capReached`** |
| UTF-8 往返 | ✅ `中文-测试-é` 正确 |
| 干净退出 | ✅ `exit` 返回 `{exitCode:0}` |
| `disableTimeout` + `disableOutputCap` 组合 | ✅ 同时被接受 |

## 三、协议契约（决定了适配器形态）

来自 `CommandExecParams.ts` 等 schema，这几条直接决定了 `execPtyChannel.ts` 的写法：

1. **`processId` 必填**——`command/exec` 时必须自带，之后 `write`/`resize`/`terminate` 全靠它定位；空 `command` 会被拒。
2. **字节流是 base64**——输出 `deltaBase64`、输入 `deltaBase64`，进出口都要编解码。
3. **最终响应延后到进程退出**，且**必定排在全部 `outputDelta` 之后**——所以 `onData` 恒先于 `onExit`，适配器不必担心「退出早于最后一批输出」。
4. **`write` 是异步 RPC**，而 `TerminalPty.write` 是**同步**签名 → 必须串行化才能保住按键顺序（见 §四 write 链）。
5. **会话是连接作用域**的。协议原文：「These notifications are connection-scoped. If the originating connection closes, the server terminates the process.」
6. **`env` 是覆盖表**（`{[key]: string | null}`，`null` 表示 unset），不是全量环境。
7. **输出分流**：`CommandExecOutputStream = "stdout" | "stderr"`；`outputBytesCap` 可关。

## 四、实现

### 新增 `src/server/bridge/execPtyChannel.ts`

导出唯一入口：

```ts
export function createExecPtySpawn(options: {
  rpc: (method: string, params: unknown) => Promise<unknown>
  onNotification: (listener: (n: { method: string, params: unknown }) => void) => () => void
}): SpawnTerminal
```

每次 spawn 生成 `processId = randomUUID()`，发：

```ts
rpc('command/exec', {
  command: [file, ...args],
  processId,
  tty: true,
  size: { cols, rows },        // normalizeDimension 到 1..500
  ...(cwd ? { cwd } : {}),
  env: buildExecEnv(env),      // 覆盖表 + TERMINFO/TERMINFO_DIRS = null
  disableTimeout: true,        // 交互终端不能被服务端默认超时杀掉
  disableOutputCap: true,      // 也不能被服务端默认字节上限截断（manager 自己 16KB 裁剪）
})
```

几个**必要**的处理（都不是可选的润色）：

- **写串行链**（保按键顺序）——`write` 是异步 RPC、`TerminalPty.write` 是同步签名：
  ```ts
  write(data) {
    session.writeChain = session.writeChain
      .then(() => rpc('command/exec/write', { processId, deltaBase64: Buffer.from(data,'utf8').toString('base64') }))
      .then(() => undefined, () => undefined)
  }
  ```
- **早到输出缓冲**——RPC 是 fire-and-forget、manager 的 handler 在 spawn 返回**之后**才注册，输出来得比 handler 早是常态：`dispatchData` 在 `dataListeners.size === 0` 时先 push 进 `session.pendingData`，`onData` 注册时再 flush。
- **退出码透传**（不是硬编码 0）——`command/exec` 的延后响应体是 `{exitCode, stdout, stderr}`；探针实测 `terminate` 后 `exitCode` 为 **1**，早期版本硬编码 0 是错的。`readExitCode` 取 `result.exitCode`，非有限数才回退 0。
- **启动失败在终端内回显**——`.catch` 不吞，先把 `\r\n[terminal] failed to start: ${message}\r\n` 打进终端，再以 `exitCode:-1` 报退出，让 manager 正常拆会话而不是挂在半开状态。
- **晚注册 onExit 重放**——若 `exitEvent` 已发生，`onExit` 立即回调。
- **`TERMINFO`/`TERMINFO_DIRS` 显式 unset**——app-server 托管的 PTY 不该从**服务端自己的**环境解析 terminfo。
- `.finally` 顺手 `sessions.delete(processId)`，防 map 泄漏。

### 改 `src/server/terminalManager.ts`

**只删不加**：删掉 node-pty 相关约 200 行——`loadOptionalTerminalSpawn` / `loadTerminalSpawn` / `repairNativePtyBuild` / `isBrokenSymlink` / `resolveNodePtyPrebuiltPath` / `ensureNodePtyPrebuiltExecutable` / `ensurePackageSpawnHelperExecutable` / `sanitizeUnavailableReason`，以及 `TerminalManagerOptions.ensureSpawnHelperExecutable` 选项；改为 `resolveTerminalSpawn(options.spawn)`（**仅接受注入**，不注入即 null → `available:false`）。同时**导出 `SpawnTerminal` 类型**供适配器引用。

**主体逻辑一行未改**：sessions、16KB 缓冲截断、四种通知、attach 复用、`close`/`dispose`、`resolveCwd`/`resolveShell`/`normalizeDimension`/`normalizeLocaleEnv`/`shellQuote` 全部原样——这正是「管理器早已提供 `spawn` 扩展点」的价值。

### 改 `src/server/codexAppServerBridge.ts`

1. `import { createExecPtySpawn } from './bridge/execPtyChannel.js'`
2. **`SHARED_BRIDGE_VERSION` v5 → v6**（并补注释）。理由：`ThreadTerminalManager` 的**构造参数变了**，而 dev 服务器长驻、HMR 后 `getSharedBridgeState()` 会**复用旧实例**——不复用旧版本号，热重载后会继续跑 node-pty 版的 manager。
3. 注入：
   ```ts
   const terminalManager = new ThreadTerminalManager({
     spawn: createExecPtySpawn({
       rpc: (method, params) => appServer.rpc(method, params),
       onNotification: (listener) => appServer.onNotification(listener),
     }),
   })
   ```
4. **通知过滤（关键）**：`command/exec/outputDelta` 走的是**同一个 `appServer.onNotification` 通道路径**，而桥把「terminalManager 订阅」与「前端 listener」合并到同一处，**不拦就会把原始 base64 帧漏进 UI 通知流**：
   ```ts
   const unsubscribeAppServer = appServer.onNotification((notification) => {
     if (notification.method === 'command/exec/outputDelta') return
     listener({ ...notification, atIso: new Date().toISOString() })
   })
   ```

### 依赖清理

| 文件 | 改动 |
|---|---|
| `package.json` | 删 `files` 里的 `scripts/fix-pty-native-build.cjs`、`pnpm.onlyBuiltDependencies` 里的 `node-pty`、`postinstall` 行、整个 `optionalDependencies` 块 |
| `pnpm-workspace.yaml` | `allowBuilds` 删 `node-pty: true`（保留 `@firebase/util` / `esbuild` / `protobufjs`） |
| `scripts/fix-pty-native-build.cjs` | **删除** |
| `publish-android.sh` | node-pty 剥离循环 → 注释（该逻辑已是 no-op，因为依赖本身没了） |

## 五、测试

新增 `src/server/bridge/execPtyChannel.test.ts`（**8 例全绿**）：

1. 参数形状（`command` / `tty` / `size` / `cwd` / `disableTimeout` / `disableOutputCap` / `env` 含 `TERMINFO: null`）
2. base64 路由 + 未知 `processId` 被忽略
3. 早到输出被缓冲、注册后 flush
4. **写串行**——用递减延时 `[30,20,10]` 证明只有串行才能保序
5. `resize` / `terminate` 参数
6. 正常退出透传真实 `exitCode:0`
7. 启动失败上报（`exitCode:-1` + 终端内文案）
8. 晚注册 `onExit` 重放（`exitCode:3`）

改 `src/server/terminalManager.test.ts`：删 `helperCalls` 计数器与 `ensureSpawnHelperExecutable` 选项；测试标题 `'normalizes PTY environment for macOS locale and PTY helper'` → `'normalizes PTY environment for the host locale'`。**8 例全绿**。

## 六、验证

1. **类型**：`vue-tsc --noEmit` → `EXIT=0`。
2. **定向**：`execPtyChannel.test.ts` + `terminalManager.test.ts` → **16/16**。
3. **全量**：**714/714 零失败**（74 个测试文件全过）= round-115 基线 **706** + 本轮新增 **8**。
4. **真机端到端**（`tmp/probe-terminal-e2e.cjs`，真实 vite dev + 真实 SSE）：
   - `status` → `{available:true}`
   - `attach` → `{shell:"cmd.exe", cwd:"D:\\code\\codex-mobile"}`（cwd 正确）
   - SSE 收到 **303B 真实 PTY banner**（含 ANSI 序列 + `Microsoft Windows [版本 10.0.26200.9457]`）
   - `input echo <marker>` → **回显成功**
   - resize / close / exit 全通
   - 通知流 `{terminal-attached:1, terminal-data:11, terminal-exit:2}`
   - **`outputDelta leaked to UI : no`**（§四.4 的过滤生效）

## 七、行为变化与诚实边界

- **连接作用域导致的语义变化（如实记录）**：`command/exec` 会话是**连接作用域**的，协议明确「连接断开则服务端终止进程」。因此 **app-server 连接中断会真正杀掉终端进程**；旧的 node-pty 实现下，桥重启只是**丢失 session 映射**、PTY 进程变成孤儿（仍活着但不可达）。这是一个取舍：换来的是「终端不再依赖 native 编译」。
- **未在 Android 上实测**。我只改了 `publish-android.sh` 里的剥离循环为注释（因为依赖已不存在），**没有**验证 Android 包现在真的能开出终端——那需要 Android 构建与运行环境。收益判断基于「app-server exec 通道在所有平台提供 PTY」这一协议事实，而非 Android 实测。
- **未做 Linux/macOS 实测**。WSL 在本机被安全策略**硬拦截**（同 round-115）。跨平台安全性依据「exec 通道是 app-server 侧实现、与宿主 OS 无关」这一结构性事实，比以往「真机 + WSL 双向」弱一档，如实记录。
- **`Grep`/探针均为只读**。本轮未改写任何用户线程，端到端只在终端会话内跑 `echo`。
- **依赖状态修复时撞到一个 pnpm 怪现象（如实记录）**：`pnpm install`（依赖树因删 node-pty 而重解析）把 `highlight.js` 从 11.11.1 升到 11.12.0，却**没有在 `node_modules/` 顶层建出 `highlight.js` 软链**（`.pnpm/highlight.js@11.12.0/` 内文件齐全），于是 `vue-tsc --noEmit` 报 `TS2307: Cannot find module 'highlight.js/lib/common'`；`pnpm install --force` 报 `Already up to date` 并不修复。用 node 的 `fs.symlinkSync(target, 'node_modules/highlight.js', 'junction')` 补建后 `vue-tsc` 恢复 EXIT=0，且此后 `pnpm install` 不再破坏它（`Already up to date`、链接保留）。**判定为「本机 install 状态的偶发不一致」而非项目代码缺陷**——同一时刻全量 vitest 仍 714/714（Vite 的解析路径与 `vue-tsc` 不同，故只有类型检查暴露它）。
- **另外**：`pnpm install` 会打印 `The "pnpm" field in package.json is no longer read by pnpm ... ignored: "pnpm.onlyBuiltDependencies"` —— pnpm 11 起 `package.json` 的 `pnpm` 字段已废弃（配置迁到 `pnpm-workspace.yaml`），本轮只删了其中的 `node-pty`，**未动整个字段**（属另一项清理）。

## 八、涉及文件

- 新增：`src/server/bridge/execPtyChannel.ts`（约 220 行）
- 新增：`src/server/bridge/execPtyChannel.test.ts`（8 例）
- 改：`src/server/terminalManager.ts`（删 node-pty 加载/修补约 200 行，导出 `SpawnTerminal`）
- 改：`src/server/terminalManager.test.ts`（删 helper 断言）
- 改：`src/server/codexAppServerBridge.ts`（注入 spawn + `SHARED_BRIDGE_VERSION` v5→v6 + `outputDelta` 过滤）
- 改：`package.json`、`pnpm-workspace.yaml`、`publish-android.sh`
- 删：`scripts/fix-pty-native-build.cjs`
- 文档同步（清掉 node-pty 的过期引用）：`codex-mobile-handover/codex-mobile-handover.md`（macOS 那段原本写「`node-pty` postinstall 由 `scripts/fix-pty-native-build.cjs` 处理」）、`codex-mobile-handover/sections/environment.md`、`codex-mobile-handover/sections/macos-regression.md`（dated 记录，只加 round-116 追加注、不改原记录）、`docs/codex-cli-not-found-troubleshooting.md`、`tests/cli-network-platform/termux-install-without-native-pty-build.md` 与 `windows-npx-install-no-longer-depends-on-legacy-pty-package.md`（加 Superseded 注）、`llm-wiki/wiki/concepts/integrated-terminal.md`（加 Superseded 注）。**有意不改**：`llm-wiki/raw/features/integrated-terminal.md`——它是 `Date captured: 2026-04-22` 的原始抓取快照，改了就毁掉「快照」的语义。
- 探针（未入库，供复跑）：`tmp/probe-0158-new-features.cjs`、`tmp/probe-0158-exec-pty.cjs`、`tmp/probe-0158-exec-pty-params.cjs`、`tmp/probe-terminal-e2e.cjs`

## 九、遗留

- **仍然只有用户能做**：`3cecaa6` 的 `.env` 含真实 GitHub OAuth 密钥且仍在祖先链里 → 需去 GitHub 轮换凭据（删文件无用，历史还在）。
- 发版仍未做：`v0.1.126`（09-28）之后已积压 **33 个提交**未发布（含两枚真 bug 修复 + 六处全量水合退场 + round-114/115/116）。
- `getThreadDetailV2` / `getThreadMessagesV2` 仍发全量 `thread/read`（round-102 遗留，有界化未排期）。
