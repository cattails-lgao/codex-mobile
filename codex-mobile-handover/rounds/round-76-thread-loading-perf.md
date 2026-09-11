# Round-76：线程/消息列表加载性能优化（载荷瘦身 + 结果缓存 + 启动预热）（2026-09-11）

> **背景：** 用户提出「左侧的线程和消息列表加载很慢，可以优化吗？」，并要求先测量再改动（AGENTS.md），且先调研「其他产品怎么做到秒开」再定方案。调研结论（Codex TUI / Claude Code / Slack / Discord 的共识做法）与实测基线见下；用户最终裁定：命令输出走**「截断 + 落盘 + 路径回指」**（对齐 Codex TUI 的 `truncate_lines_middle` 与 Claude Code 的 ~30K 字符内联窗口 + 落盘 + 返回路径），范围**四项一起做**。四项改动全部落在桥层（`src/server/bridge/*` + `codexAppServerBridge.ts`）。

## 需求 / 现象

侧边栏线程列表与消息列表加载慢。按 AGENTS.md 要求先做全链路测量（app-server 直连 / 桥层 / 浏览器首屏三层），拿到基线后才动代码。

**基线（改动前实测，dev server 4173，最重真实线程 `01a0465a-f570-78a0-ae6b-badc1c40b4e8`，rollout 两段 3.07MB + 32.4MB）：**

| 环节 | 实测 |
|---|---|
| app-server `thread/list` 直连 | 36ms |
| 桥层 `thread/list` | 934ms 冷 / 63ms 热 |
| `thread/read` 该线程（19 轮未裁剪） | 867–912ms / **13.55MB** |
| 前端打开该线程（`thread/resume`，裁剪到 10 轮） | **3041.8ms / 4,496,900B（4.29MB）** |
| 首屏 `/codex-api` 总字节 | **4,448.4KB** |
| 冷启动队首（首屏 ~20 个请求排队） | free-mode/status 2619ms、meta/methods 1306ms、thread-queue-state 1287ms |

**根因（实测确认）：载荷 92% 是 UI 从不整段渲染的大文本，且响应体不随用户可见内容缩放。**

按 item 类型统计字节占比：

| item 类型 | 占比 | 说明 |
|---|---|---|
| `commandExecution` | 74% | 单块最大 803KB；命令块默认折叠渲染 |
| `mcpToolCall` | 18% | 其中 `result` 独占 1.52MB，**前端从不读取该字段** |
| `fileChange` | 6% | |
| 真实对话（userMessage/agentMessage/reasoning） | ~1.5% | 用户真正要看的只有这部分 |

叠加两个独立问题：①`thread/read` 无缓存，重复打开同一线程要重付全量代价（实测重复打开 2300ms / 2213ms）；②app-server 冷启动把首屏 ~20 个请求全压在队尾（head-of-line blocking）。

**调研结论（其他产品的共识做法）：** Codex TUI `createTruncatingCollector`（10KB/256 行 → 100KB/1024 行）并在渲染层 `truncate_lines_middle` 中间截断；Claude Code Bash 保留 ~30K 字符内联窗口（`BASH_MAX_OUTPUT_LENGTH` 默认 30000 / 上限 150000），MCP 输出 >10K token 告警、`MAX_MCP_OUTPUT_TOKENS` 默认 25K，超限即**落盘并返回路径**；Slack 用 `users.counts` 元数据 API + 消息历史懒加载，并有明确的「不要什么都缓存」（LocalStorage 陷阱）教训；Discord `messagesByChannel` 懒加载 + 虚拟列表 + 游标分页。claude.ai web issue #24146 与本病症一致，解法同样是虚拟化 + 保留末 N 条 + 骨架屏。**结论：不追「全量秒开」，而是「首屏只搬必要字节 + 重内容懒取 + 重复打开不重付」。**

---

## 四项改动

### ① 裁掉前端从不消费的 `mcpToolCall.result`

**修复（`src/server/bridge/payloadSlimming.ts` 新增）：** `slimMcpToolCallItem` 整字段删除 `result`。理由经代码确认：`src/api/normalizers/v2.ts` 的 mcpToolCall 分支只读 `server`/`tool`/`status`/`error`/`durationMs`，从不读 `result`；该字段在清单里占 18%（1.52MB）。删除是不可逆的有损处理，但**对现有 UI 零影响**（无任何消费点）。

**验证：** 单测断言删除后 `result` 键不存在、其他键原样保留；实载荷里 `mcpToolCall` 项 `result` 残留数 = 0。

### ② 命令输出截断 + 落盘 + 路径回指

**修复（`payloadSlimming.ts` + `threadRoutes.ts` + 前端三处）：**

- 桥层：`slimCommandExecutionItem` 对 `aggregatedOutput` 超过 `COMMAND_OUTPUT_INLINE_LIMIT_BYTES = 16KB` 的块做**中段截断**（保留头 60% + 尾 40%，两端信息都留下——与 TUI/Claude Code 一致，尾部通常才是报错或摘要），并附 `aggregatedOutputSpill: { ref, totalBytes, omittedBytes }`；原文经 `spillCommandOutputToDisk` 以 sha1 命名落盘（> `COMMAND_OUTPUT_SPILL_MAX_BYTES = 8MB` 的病态输出只截断不落盘，避免撑爆临时目录）。
- 截断安全：`truncateUtf8Middle` 按字节切分后剥掉接缝处的 U+FFFD，不会把多字节码点切成半个字。
- 回读路由：`threadRoutes.ts` 新增 `GET /codex-api/command-output?ref=<sha1>`；`resolveCommandOutputSpillPath` 用 `/^[0-9a-f]{40}$/` 白名单校验 ref，**不能走到任意路径**。
- 前端：`src/types/codex.ts` 加 `CommandOutputSpill` 与 `CommandExecutionData.outputSpill`；`normalizers/v2.ts` 的 `readCommandOutputSpill` 读回备注（`omittedBytes <= 0` 或结构异常返回 undefined）；`api/gateway/threads.ts` 加 `getCommandOutputText(ref)`；`WorkBlockItem.vue` 渲染「已省略 N / 共 M」提示行 + 「查看完整输出」按钮（`loadFullOutput` 按需取回并替换展示）；`useUiLanguage.ts` 补 4 条文案。
- 字段名链路核对（防错配）：桥层写 `aggregatedOutputSpill` → normalizer 读 `raw.aggregatedOutputSpill` → UI 读 `commandExecution.outputSpill`，三处一致。

**验证：** 单测覆盖「超限截断 + 落盘 + 头尾保留」「多字节安全」「未超限返回原对象引用」「非 thread 方法不处理」「回读路由的 200/400/404 与无关请求透传」；实载荷实测 215 个命令块中 31 块超限，原文 3.78MB → 内联 1.10MB、落盘省略 2.67MB（该类型 **−70.8%**）；回读实测 `13.6ms` 取回 36,841B，路径穿越尝试返回 400、不存在 ref 返回 404。

### ③ `thread/read` 结果缓存

**修复（`src/server/bridge/threadReadCache.ts` 新增 + `codexAppServerBridge.ts` 接线）：**

- `ThreadReadResultCache`：TTL `20s`、最多 `6` 条、按插入序淘汰。缓存键 = `threadId` + 排序后的标量参数（含非标量参数则不缓存，避免误命中）。
- 失效策略：`THREAD_READ_INVALIDATING_METHOD_PATTERN`（`turn/`、`thread/start|fork|rollback|revert|resume|archive|unarchive|delete|compact|name/`）命中即全量失效；另按 `threadId` 精确失效。`dispose()` / `disposeIfConfigChanged` 时清空。
- **只缓存纯读的 `thread/read`，不缓存 `thread/resume`**——resume 要建立 app-server 会话状态（前端另有 `resumedThreadById` 守卫并在 `turn/start` 前调用），缓存它会改变时序语义。
- 取舍说明：刻意避开 Slack 那条「不要什么都缓存」的坑——用 TTL + 条数上限 + 变更即失效三重约束，而不是无脑长期缓存。

**验证：** 单测覆盖键构造、失效判定、TTL、条数上限、dispose 清空；实测重复 `thread/read` **1745ms → 72ms**（服务端日志 1717ms → 21ms，**−95.9%**），且第二次返回字节与第一次一致（1.56MB，命中缓存而非空响应）。

### ④ app-server 启动预热

**修复（`codexAppServerBridge.ts`）：** 新增 `AppServerProcess.warmUp()`（best-effort `disposeIfConfigChanged()` + `ensureInitialized()`，吞掉异常，失败由首个真实请求的 `ensureInitialized` 兜底），在 `createCodexBridgeMiddleware` 里 `void appServer.warmUp()` 先于 `initializeSkillsSyncOnStartup` 触发。

**根因与实测边界（诚实结论）：** 基线冷启动队首 free-mode/status 2619ms、meta/methods 1306ms、thread-queue-state 1287ms，说明缺的确实是 app-server spawn+initialize（不是磁盘/网络）。但**改动后冷启动单次采样未见明显改善**（free-mode/status 3170ms、thread-queue-state 2327ms、meta/methods 2199ms）：前端请求在 Vite ready 后 ~1–3s 到达，而 `ensureInitialized()` 要 ~2.1s，预热只能**部分重叠**冷启动，首个请求仍要等剩余部分（实测首个 GET 1401ms、meta/methods 2118ms）。因此这一项的实际价值是：**把冷启动从「后续每次加载」里去掉**，并让热路径（全部端点 ≤70ms）无需人工先发一次请求就能达到；**不是首屏加速手段**。该结论已如实写进 `warmUp()` 的代码注释。
**副作用（需维护者知悉）：** `createCodexBridgeMiddleware` 被 `src/server/httpServer.ts` 的 `createServer` 调用，打包形态同样适用——此改动会把 app-server 的 spawn 从「首个请求懒触发」变成「桥创建时即触发」。

**验证：** 冷启动日志确认 app-server 在服务就绪时已开始初始化；热态首页实测 FCP 440ms、全部端点 ≤70ms（基线热态 FCP 252ms、端点 ~33ms，**无回归**）。

---

## 涉及文件

**新增**
- `src/server/bridge/payloadSlimming.ts`（① ② 核心）
- `src/server/bridge/payloadSlimming.test.ts`
- `src/server/bridge/threadReadCache.ts`（③ 核心）
- `src/server/bridge/threadReadCache.test.ts`
- `src/server/bridge/commandOutputRoute.test.ts`（② 回读路由）

**修改**
- `src/server/bridge/inlineImages.ts`：`sanitizeThreadTurnsInlinePayloads` 首步接入 `slimThreadTurnsPayload`，单一调用点覆盖 rpc pipeline / thread-turn-page / thread-live-state 三条读取路径
- `src/server/bridge/threadRoutes.ts`：新增 `/codex-api/command-output` 回读路由
- `src/server/codexAppServerBridge.ts`：`warmUp()`、缓存读写与失效接线、`SHARED_BRIDGE_VERSION` 升至 `experimental-api-v3`
- `src/types/codex.ts`：`CommandOutputSpill` + `CommandExecutionData.outputSpill`
- `src/api/normalizers/v2.ts` + `v2.test.ts`：`readCommandOutputSpill` 与 3 条用例
- `src/api/gateway/threads.ts`：`getCommandOutputText`
- `src/components/content/WorkBlockItem.vue`：截断提示行 + 「查看完整输出」入口 + 样式
- `src/composables/useUiLanguage.ts`：4 条 i18n 文案
- `src/composables/useDesktopState.test.ts`：补 `persistThreadTurnDuration` mock（见下「顺带修复」）

## 变更范围与约束

- 四项全部在**桥层与其消费端**，不触碰 app-server 协议、不触碰消息历史 hydrate 时序、不触碰回退/通知路径。
- `slimThreadTurnsPayload` 与 `TRIM/inline` 一样，仅在 `THREAD_METHODS_WITH_TURNS`（`thread/read`、`thread/resume`、`thread/fork`、`thread/rollback`、`thread/revert`）上生效，其他方法直接返回原引用。
- **无改动时返回原对象引用**（不制造无谓变更），既有基于 `===` 的不变性判断不受影响。
- 有损边界明确：①删 `mcpToolCall.result`（UI 无消费点，不可恢复）；②命令输出超 16KB 只内联头尾，完整内容需经回读路由取回；③>8MB 的命令输出只截断不落盘（`ref` 为空，前端只显示截断备注、不显示按钮）。
- **顺带修复**（本轮发现，与本轮四项无关但阻塞验证）：`useDesktopState.test.ts` 在并发跑测时偶发失败，根因是 `turn/completed` 的耗时用真实墙钟计算（同毫秒完成则跳过持久化路径），并发下跨毫秒就走到未 mock 的 `persistThreadTurnDuration`。已确认是既有 flake（干净 HEAD 上可复现），补 `persistThreadTurnDuration: vi.fn()` 修复。

## 验证（已跑通）

- 定向 Vitest：`payloadSlimming.test.ts`、`threadReadCache.test.ts`、`commandOutputRoute.test.ts`、`v2.test.ts` 全部通过。
- 全量 Vitest：**569 通过 / 2 失败**；2 个失败为 `codexAppServerBridge.archive.test.ts` 的 Windows 平台权限差异（symlink EPERM、文件 mode 0o600 vs 0o666），与本轮无关（既有环境性失败，干净 HEAD 上同样复现）。
- `vue-tsc --noEmit` 干净；`vite build`（335 模块）通过（沙箱内 `dist/assets` 批量删除被安全守卫拦下，需在沙箱外执行，非编译错误）。
- 浏览器分析（`scripts/profile-browser-runtime.cjs`，同口径对基线）：

| 指标 | 改动前 | 改动后 | 变化 |
|---|---|---|---|
| 最重线程 `thread/resume` 响应体 | 4,391.5KB | **1,599.1KB** | **−63.6%** |
| 首屏 `/codex-api` 总字节 | 4,448.4KB | **2,010.3KB** | **−54.8%** |
| 重复 `thread/read` | 1,745ms | **72ms** | −95.9% |
| 完整输出回读 | 不支持 | 13.6ms / 36,841B | 新增能力 |

- 手测口径见 `tests/thread-loading-state/thread-payload-slimming-and-output-spill.md`。
- 可复现：新增 `scripts/profile-bridge-rpc.cjs`（桥层直连测量，与浏览器侧的 `scripts/profile-browser-runtime.cjs` 互补）——
  `PERF_BASE_URL=http://127.0.0.1:4173 PERF_THREAD_ID=01a0465a-f570-78a0-ae6b-badc1c40b4e8 node scripts/profile-bridge-rpc.cjs`
  输出 `turns/items/cmdBlocks/cmdTruncated/spilledMB/mcpResultLeft` 与重复读耗时，本文件所有桥层数字均出自它。
- 复测环境说明（沙箱 home，均 gitignored、不入库）：本轮把该线程的两段 rollout（3.07MB + 32.4MB）从真实 home 拷进 `<项目目录>/.codex/sessions/2026/08/28/`，并在 `<项目目录>/.codex/config.toml` 补上 `[model_providers.HSToken]`（仅 `base_url` + `env_key = "MUKRON_API_KEY"`，与真实 home 一致，**不含任何密钥**）——否则 `thread/resume` 会以 `Model provider 'HSToken' not found` 报 502，无法复现重型载荷。

## 性能审计

- `slimThreadTurnsPayload` 只做一次 O(项数) 遍历；未超限/无 `result` 的项**不重建对象**，整轮无变化时返回原 `result` 引用（零分配）。落盘仅对超限块发生，且同 sha1 已存在则跳过写（`stat` 短路）。
- 缓存为内存 Map（≤6 条、TTL 20s），不落盘、不新增网络请求；命中时**完全跳过 app-server RPC**，是净收益。
- 预热把一次 spawn+initialize 从请求路径前移，请求总数不增加；副作用是把 spawn 变为桥创建时即触发（见 ④）。
- 净效应：**首屏字节减半、最重线程载荷减 6 成、重复打开近乎免费**；唯一新增的按需请求是用户主动点「查看完整输出」时的回读（单次、有界）。

## 发布

- 版本 `0.1.120 → 0.1.121`。
- 代码 + 测试提交、文档/版本提交分开（见 `sections/commit-history.md` round-76 条目）。
