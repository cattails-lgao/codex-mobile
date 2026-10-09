# round-135：未 materialize 线程的 `thread/read` 与 `thread/resume` 不再 502

**日期**：2026-10-09
**环境**：Windows 本机、**codex-cli 0.161.0**（用户按「升级到 0.160.1」操作，pnpm 全局实际装到 0.161.0，见 §六 1）、隔离 home `D:\codex-home-fresh`、桥服务 4197
**状态**：已实施并验证；**未发布**（npm `latest` 仍 `0.1.127`）
**承接**：round-134 §七「附带发现（**不属本轮，未实施**）……**记在此处待授权**」

---

## 一、结论先行

round-134 §七 记了一条**潜伏边界**并明确「若要修：给 `thread/read` 的兜底谓词补上这条文案（回 `{thread:{id,turns:[]}}`）……**待授权**」。本轮把它做掉，并顺带关掉**同一根因**下 `thread/resume` 的同一处 502。

| # | 缺口 | 本轮做法 | 效果 |
| --- | --- | --- | --- |
| 1 | 未 materialize 线程上 `thread/read {includeTurns:true}` ⇒ 桥直接 `throw` ⇒ 客户端 **502** | `threadErrors.ts` 新增窄匹配谓词 `isThreadTurnsNotListableError`；桥的 `thread/read` 兜底分支改用它 | 该调用从 **502 → 200 `{thread:{id,turns:[]}}`** |
| 2 | 同一线程上 `thread/resume` **也** 502（round-134 只记了 `thread/read`；本轮复现确认 **resume 同样 502**，且**可达**，见 §四） | 同一条兜底把 `thread/resume` 一并纳入 | **502 → 200** 同一诚实载荷 |

两条都回 round-134 ② 的**同一种诚实答案**（`buildPendingMaterializationThreadReadResult`，**不带 `status`**）—— 因为二者本质是同一件事：「线程存在，但没有可渲染的内容」。

---

## 二、复现（先在真实版本上确认形态未变）

按记忆纪律「开工前永远重测 `codex-cli --version`」，先把环境量准，再用隔离 home 起桥复现。`tmp/r135-repro-502.cjs`（`thread/start` → 逐项打原始回包）：

| 调用 | 改动前（0.161.0） |
| --- | --- |
| `thread/start {cwd}` | **200**（threadId `01a11e60-a4ee-7713-b33a-7e09c093684d`） |
| `thread/read {includeTurns:false}` | **200**（元数据正常，`status:{type:'idle'}`） |
| `thread/read {includeTurns:true}` | **502** `{"error":"list_turns is not supported yet"}` |
| `thread/turns/list {full}` | **502** 同文案 |
| `thread/resume {threadId}` | **502** 同文案 |

⇒ 与 round-134 §七 在 **0.160.1** 上记的形态**逐字一致**（文案、HTTP 码、涉及方法都相同）；且本机实测版本是 **0.161.0**（跨了一个小版本仍然是这个形态）。

**机制**（与 round-134 §七 相同，本轮复核）：app-server 对「还没有首条用户消息、rollout 未写入」的线程，把 `thread/turns/list` 与 `thread/read {includeTurns:true}` 都答成 `list_turns is not supported yet`；该文案**两条既有兜底谓词都不匹配** —— `isEmptyThreadReadError`（要 `failed to read thread` + `rollout` + `is empty`）与 `isThreadMaterializationPendingError`（要 `not materialized yet` + `includeturns is unavailable before first user message`）都不成立 ⇒ 桥直接 `throw`、HTTP 502 到客户端。

**走位复核**（说明为什么必须改 shell 层而不是有界模块）：

- `thread/read {includeTurns:true}`：`readThreadWithTurnPage` 先做元数据读（200）→ `readLatestTurnPage` 调 `thread/turns/list` **抛错被吞** ⇒ 返回 null → **回放**未改写的原请求 `thread/read {includeTurns:true}` → app-server 500 级错误 ⇒ `sendRead` 抛出、穿出有界模块到 shell 的 catch。
- `thread/resume`：`resumeThreadWithTurnPage` 第一步 `sendResume(boundedParams)`（带 `excludeTurns:true, initialTurnsPage`）就抛 ⇒ **在推进到任何有界逻辑之前**离开。
- 两条最终都落在 `createCodexBridgeMiddleware` 的同一个 catch 里 —— 那里原本只认 `isEmptyThreadReadError` / `isThreadMaterializationPendingError`。

---

## 三、修复（1 个谓词 + 1 个分支）

**位置 1**：`src/server/bridge/threadErrors.ts` 新增纯函数：

```ts
export function isThreadTurnsNotListableError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase()
  return message.includes('list_turns')
    && (message.includes('not supported') || message.includes('not implemented'))
}
```

**为什么必须窄匹配**：`threadTurnPage.ts` 里另有一个宽模式 `isTurnListUnsupportedError`（`/-32601|not supported|not implemented|unknown variant|method not found|unknown method/i`）。那里宽是对的（模块头注释：「false positive merely disables the legacy fallback; a false negative hangs」）—— 它的兜底只是**关掉旧版回落**。但**这里是相反的**：宽匹配会让一条**真有轮次**的线程（只因别的 `-32601`/`not supported` 命中）被答成**空对话**。所以这里锚在 `list_turns` 上，并要求一个 unsupported 短语。

**为什么不会撞上 0.158.0 的兼容路径**：在 0.158.0 上 `thread/read {includeTurns:true}` **仍然成功**（全量水合可用），只有 `thread/turns/list` 报这个 gap；而那一步的异常被 `readThreadWithTurnPage` / `readThreadResumeTurnPage` **内部吞掉**、从不到达 shell 的 catch ⇒ 这条谓词在 0.158.0 上**不可达**。

**位置 2**：`src/server/codexAppServerBridge.ts` 的 `thread/read` 错误分支（原仅 `isThreadMaterializationPendingError`）扩成：

```ts
if (
  (body.method === 'thread/read' && isThreadMaterializationPendingError(error))
  || ((body.method === 'thread/read' || body.method === 'thread/resume') && isThreadTurnsNotListableError(error))
) {
  const params = asRecord(body.params)
  const threadId = typeof params?.threadId === 'string' ? params.threadId.trim() : ''
  if (threadId) {
    setJson(res, 200, { result: buildPendingMaterializationThreadReadResult(threadId) })
    return
  }
}
```

`buildPendingMaterializationThreadReadResult` 一行未改（仍 `{ thread: { id, turns: [] } }`、**不带 `status`**），只是注释标题从「materialization-pending `thread/read`（round-134）」扩成「unmaterialized-thread 的 read + resume（round-134/135）」。

---

## 四、可达性：为什么 `thread/resume` 不是「走不到」

round-134 §七 的结论是「**已确证真实客户端走不到**」，依据是 `tmp/r134-probe-newthread-ui.cjs` 只跑了「**新建线程 + 发送**」这一条路径（`thread/start` → `turn/start` 在首次 `thread/read` 前就把 rollout 写出来了 ⇒ 后续 `thread/read` 全 200）。**那条路径确实走不到**；但它不覆盖「**打开一条已存在、但从未发过消息的线程**」。

本轮按代码复核，`thread/resume` 在这些入口会被调用，条件是 `resumedThreadById[threadId] !== true`：

| 入口 | 位置 | 场景 |
| --- | --- | --- |
| `loadMessages` 取历史 | `useDesktopMessageHistoryLoading.ts:149-150` | 任何**本会话内尚未 resume 过**的线程（页面刷新后、或深链进入） |
| `sendMessageToThread` 发消息前 | `useDesktopState.ts:3099-3115` | 打开一条空线程再发消息 |
| 「重试待发回合」 | `useDesktopState.ts:958-970` | 有待发回合要补发时 |

⇒ 「**打开一条空线程 → 发消息**」就会命中 `thread/resume`，pre-fix 必然 502。**所以这条通道值得一并关掉**，不是纯防御性对称。

**诚实说明**：以上是**代码层论证**，本轮**没有**用真浏览器跑「刷新后打开空线程 → 发送」这条路径（那需要造出「已创建但从未发消息」的线程并走完整 UI 流程）。但修复方向是**严格改进**：502（硬错误）→ 200 + 诚实载荷，任何调用方都不会因此变差。

---

## 五、验证

### 5.1 单测

| 文件 | 变化 | 新增覆盖 |
| --- | --- | --- |
| `src/server/codexAppServerBridge.archive.test.ts` | 34 → **36** | `isThreadTurnsNotListableError` 2 例：①三条正例（`-32601: list_turns is not supported yet` / `list_turns is not supported yet` / `list_turns is not implemented`）；②四条反例（`permission denied` / materialization-pending 原文案 / **`-32601: method not found`（只有码不锚 `list_turns`）** / **`items/list is not supported`（短语落在别的方法上）**） |

### 5.2 反跑（决定性，证明测试非空）

`tmp/r135-flip.cjs off|on`：把谓词体替换成 `return false`（每处替换做「出现次数必须为 1」断言），`off` 留 `.r135bak`、`on` 逐字节复核后删备份。

| 状态 | 单测（该文件） | 契约 |
| --- | --- | --- |
| `off` | **1 failed \| 35 passed (36)**（`matches the turn-listing capability error…` 红） | **44/45**，诊断行 `谓词锚在 list_turns=NO / 谓词保持窄匹配=NO` |
| `on` | **36 passed** | **45/45** |

`on` 复核：`与备份一致=true`（`threadErrors.ts` 逐字节），仓库内无 `.r135bak` 残留。**反跑同时覆盖了端到端**（见 5.5）：OFF 态重建后探针复现 **502/502**，ON 态回到 **200/200**。

### 5.3 静态契约（`check-ui-contract.cjs` 44 → **45** 项）

新增「未 materialize 线程的 thread/read 与 thread/resume 不再 502（round-135）」，钉三个子事实：①谓词体里出现 `includes('list_turns')`；②且**不**出现宽模式（`TURN_LIST_UNSUPPORTED_PATTERN` / `-32601|not supported`）；③桥的兜底分支同时覆盖 `thread/read` 与 `thread/resume` 且回 `buildPendingMaterializationThreadReadResult(threadId)`。**诚实说明**：③ 钉的是**形状**（那段 `setJson(...)` 调用）；行为层证据是 5.1 的单测与 5.5 的真实端到端。

### 5.4 基线

`vue-tsc --noEmit` **EXIT=0 / 0 错误**；全量 **757 例 / 757 通过（76 文件）零失败**（＝ round-134 基线 755 ＋ 本轮 2 例）；`node --check scripts/check-ui-contract.cjs` OK；`tsup` 重建 `dist-cli` EXIT=0（682.81KB → 683.14KB）。

**本机基线本身也复核过**：改动**之前**先跑了一遍全量 ⇒ **755/755 + 契约 44/44 + vue-tsc EXIT=0**，与文档基线逐字一致（说明「换机器 + 换 CLI 小版本」没有动摇基线）。

### 5.5 真实桥层端到端（**决定性**）

**改动在 `src/server/**` ⇒ 必须先 `tsup` 重建 `dist-cli`**（只跑 `vite build` 不生效）。服务：`CODEX_HOME=D:/codex-home-fresh node dist-cli/index.js --no-tunnel --no-open --no-login --no-password -p 4197`，探针 `tmp/r135-repro-502.cjs`：

| 调用 | 改动前 | 改动后 |
| --- | --- | --- |
| `thread/read {includeTurns:false}` | 200 | 200（未受影响） |
| `thread/read {includeTurns:true}` | **502** `{"error":"list_turns is not supported yet"}` | **200** `{"result":{"thread":{"id":"…","turns":[]}}}` |
| `thread/resume` | **502** 同文案 | **200** `{"result":{"thread":{"id":"…","turns":[]}}}` |
| `thread/turns/list {full}` | 502 | 502（**未变**，见 §六 3） |

响应体逐字核对过：`{thread:{id,turns:[]}}`、**无 `status`** ⇒ 前端 `readThreadInProgressFromResponse` 读回 `false`，不会造出幽灵 Thinking 浮层（round-134 ② 的同一条不变式）。

---

## 六、诚实边界

1. **版本口径**：用户口径是「升级到 **0.160.1**」，但本机 pnpm 全局实测 **0.161.0**（`/d/Application/NodeManage/pnpm/bin/codex`，两个 v11 全局条目都指向 store 里 `@openai/codex/0.161.0` 的同一 link）；`~/.codex/packages/app-server-daemon/releases/` 仍**只有 0.158.0**；桌面 App 缓存里的 `codex.exe` 是 0.154.0-alpha.6.2。**故本轮的「本机读数」= 0.161.0**，与 round-130~134 文档标注的 0.160.1 差一个小版本。好消息是**边界形态跨这一个小版本未变**（§二），但**不要把 0.160.1 的读数当成 0.161.0 的读数**。
2. **本机是「新机器」**：round-130~134 的隔离 home 是 `D:\codex-home-isolate123`，本机**不存在**；本轮改用自建的空 home `D:\codex-home-fresh`（只拷 `auth.json` + `config.toml` + 被 `model_catalog_json` 引用的 `cc-switch-model-catalog.json`）。空 home 天然隔离（无源 home 的 rollout 绝对路径引用），不需要 round-130~134 那种「等长路径改写」。
3. **`thread/turns/list` 直连仍 502**（有意）：桥只在**有界模块内部**调它（异常被吞、回落），而这第三个通道**客户端不直连** —— 全仓只有两处 `callRpc('thread/turns/list', …)`：`threads.ts:614` 在 `thread/revert` **之后**（线程必有轮次）用游标增量 hydrate；`threads.ts:460` 只是错误对象里的 `method` 字段。上翻走的是 `/codex-api/thread-turn-page` 路由，不是这个端点。故**不动**。
4. **未在真浏览器上跑「刷新 → 打开空线程 → 发送」**（§四 末）：resume 的可达性是**代码层论证** + 端到端 200 的读数，不是 UI 流程实录。
5. **只在本机 Windows / codex-cli 0.161.0 / `D:\codex-home-fresh` 上实测**。
6. **`threadRoutes.ts` 的 `thread-live-state` 同名兜底仍伪造 `isInProgress: true`**（round-134 §六 4，零客户端调用方）—— 本轮**仍未动**。
7. **未发布**：未 bump 版本、未 tag。

---

## 七、未处置 / 待办

| # | 项 | 状态 / 谁能做 |
| --- | --- | --- |
| 1 | round-132 §七 第 2 条：回落路径成功后**补登记锚点** | 未实施 |
| 2 | round-132 §七 第 3 条：收窄全量读缓存失效面（`threadId` → `threadId + 版本` / 只在 turns 真变化时清） | 未实施 |
| 3 | 上翻游标链仍是**进程内内存**（重启 / LRU 淘汰后仍会未命中） | 未实施 |
| 4 | round-132 §七 第 1 条：`thread/read` 有界页 `nextCursor` 交 `onTurnPageBoundary` | **已在 round-133 完成** |
| 5 | round-131 §十 第 1 条：PTY 端到端在 0.160.1 上重跑 | 可做（需起 dev server） |
| 6 | round-131 §十 第 3/4 条：`{fileId}` 图片 UI 口径 / round-120 空状态文案 i18n | 需产品口径 / 用户拍板 |
| 7 | 0.1.128 的 tag / Release（`package.json` 已 0.1.128 且有 release 提交，但 tag 最新仍 `v0.1.127`）；npm publish 由用户做 | 待授权 |

---

## 八、复现 / 复跑

```bash
# 0) 隔离 home（空目录 + 三个文件即可）
mkdir -p /d/codex-home-fresh
cp ~/.codex/auth.json ~/.codex/config.toml ~/.codex/cc-switch-model-catalog.json /d/codex-home-fresh/

# 1) 静态检查
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vitest/vitest.mjs run            # 应 757/757
node scripts/check-ui-contract.cjs                 # 应 45/45

# 2) 反跑（谓词体 → return false）
node tmp/r135-flip.cjs off
node node_modules/vitest/vitest.mjs run src/server/codexAppServerBridge.archive.test.ts   # 应 1 failed | 35 passed
node scripts/check-ui-contract.cjs                 # 应 44/45 且「谓词锚在 list_turns=NO」
node tmp/r135-flip.cjs on                          # 逐字节还原 + 删备份

# 3) 真实桥层端到端（改动在 src/server/** ⇒ 必须先重建 dist-cli）
node node_modules/tsup/dist/cli-default.js
CODEX_HOME=D:/codex-home-fresh node dist-cli/index.js \
  --no-tunnel --no-open --no-login --no-password -p 4197 &
# 等端口起来（本轮探针实测约 3s）
node tmp/r135-repro-502.cjs                        # thread/read {includeTurns:true} 与 thread/resume 应 200
```

**探针（`tmp/`，未入库）**：`r135-repro-502.cjs`（thread/start → read×2 → turns/list → resume，打原始回包）、`r135-flip.cjs`（谓词反跑 + 备份/逐字节复核）、`r135-apply.cjs`（产品源码锚点脚本）、`r135-test-apply.cjs`（测试锚点脚本）、`r135-contract-apply.cjs`（契约锚点脚本）、`r135-ping.cjs`、`r135-svc*.log`。

**本轮清理**：`4197`（本轮起）已停（`listeners=0`）。隔离 home `D:\codex-home-fresh` 保留（约几 MB，供下次复跑）。
