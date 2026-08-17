# Round-43：侧边栏泄漏子 agent 线程——subagent rollout 用自身 id 而非父线程 id（2026-08-18）

> **背景：** workspace-main 当前线程（2026-08-18，spawn 子 agent 连通性测试）中发现 WebUI 侧边栏出现两个子 agent 线程（昵称 Bernoulli、Anscombe）。问题文档（`问题.md`）已给出排查结论与修复方案，本轮在源码根因处落地修复（此前方案是直接改 npm 包 dist 产物，本仓库正是该 npm 包的上游源码，故改源码 + 单测）。

## 问题一句话：子 agent 线程泄漏进 WebUI 侧边栏

侧边栏出现本应是用户会话的子 agent 内部会话（`agent_type: worker`）条目。排查确认根因在 `externalSessionTracker`：它把 `sessionId` 设成了子 agent rollout 的 `session_meta.session_id`——而该字段是**父线程** id，子线程真正出现在 `thread/list` 里的 id 是 `session_meta.id`。于是 `getSubagentThreadIds()` 过滤的是父 id → 子线程永不漏过滤，父线程可能被误删；`externalSession` 叠加也挂错了对象。

实测（全部子 agent rollout 均满足 `session_id != id`）：子 agent Bernoulli `session_id=01a009af-...`（父）、`id=01a00faa-...`（子）；Anscombe `session_id=01a01163-...`（父/当前会话）、`id=01a01164-...`（子）。父不在列表的仍泄漏（子线程未被过滤），父在列表的正确场景也可能把父行误删。

## 修复（源码根因，非改 npm 产物）

**`src/server/externalSessionTracker.ts`** `updateSessionMeta`：读取 `thread_source` 后，若为 subagent，则 `sessionId` 取 `payload.id`（子线程自身 id）优先、`payload.session_id` 回退；非 subagent（含 TUI 普通会话，字段相等）保持原 `session_id` 优先逻辑不变：

```ts
const threadSource = readNonEmptyString(payload.thread_source);
if (threadSource) session.threadSource = threadSource;
const isSubagent = threadSource.toLowerCase().startsWith("subagent");
const sessionId = isSubagent
    ? readNonEmptyString(payload.id) || readNonEmptyString(payload.session_id)
    : readNonEmptyString(payload.session_id) || readNonEmptyString(payload.id);
if (sessionId) session.sessionId = sessionId;
```

`getSubagentThreadIds()` 无需改动即返回正确的子线程 id；`externalSession` 叠加随之挂到子线程行上；`filterThreadListByIds` 过滤的是 `thread/list` 实际使用的 id，正确排除子线程而行不再误删父。

**测试（`src/server/externalSessionTracker.test.ts` +2）：**
- `metaLine` 助手新增可选 `ownId` 参数，可构造 `session_id != id`；
- 新增「subagent 用自身 id 键控」：`getSubagentThreadIds()`=`[child]`、`getExternalSession("child")` active、`getExternalSession("parent")`=null、`getActiveThreadIds()` 含 child；
- 新增「父子同目录并存不互相覆盖」：两个 rollout 都含父 `session_id`，父/子各自键控，且子 active、父 idle，验证 map 索引互不冲突（修复前两文件同键会互相覆盖）。

## 验证

- 单测：`externalSessionTracker.test.ts` 15 项全过（原 13 + 新 2），`codexAppServerBridge.inlinePayload.test.ts` 27 项全过；
- 构建：`pnpm run build:cli`（tsup，`dist-cli/index.js`）通过；产物 `dist-cli/index.js` 已含修复（约 5044 行 `isSubagent` 分支），与问题文档所述 npm 包补丁位置一致——本仓库重建即覆盖该产物，无需手改 dist。

## 性能审计

本轮为服务端线程索引键控修复：改动仅在内存中把 subagent 的 map 键从父 id 换为其自身 id，无新增 I/O、无额外请求、无阻塞、无 unbounded fanout（map 条目数恒为一个 rollout 一份）、无缓存失效风险。`thread/list` 过滤集合元素数与 `sessionByThreadId` 大小不变。未做运行时 profile（改动不触及网络/渲染/启动路径，纯内存键控，单测覆盖行为）。

## 备注 / 未做

- `TrackedSession` 未新增 `parentThreadId` 字段、`updateSessionMeta` 开头的 `if (session.originator) return` 早退未改（问题文档的「可选加固」）。当前修复已解决泄漏主问题；若后续需要「父→子」关系用于 UI 展示或需要增量轮询元数据补全，再加 `parentThreadId`。考虑到 polo：避免不必要的抽象，按 YAGNI 未加。
- 存量 `state_5.sqlite` 中 `thread_source='subagent' AND archived=0` 的历史行可保留，只影响列表过滤；不要用 `CODEXUI_EXTERNAL_SESSION_TRACKING=0` 关掉 tracker（它同时是子线程过滤器总开关）。重启一次服务使其生效（旧 JS 仍在内存）。

## 涉及文件与提交

- `src/server/externalSessionTracker.ts`（`updateSessionMeta` subagent 键控修复）
- `src/server/externalSessionTracker.test.ts`（+2 单测，`metaLine` 支持 `ownId`）
- `tests/thread-loading-state/subagent-threads-filtered-from-sidebar.md`（补 `session_id`=父 id 场景 + 修正 rollback 函数名）
- 本交接文档 + 索引 / commit-history 更新

---

## 补充修复（模型强度下拉档位收敛到 Low/Medium/High）

**背景：** 前端「模型强度」下拉把档位表硬编码成 `none/minimal/low/medium/high/xhigh/max/ultra` 八项；当模型未声明支持档位时回退显示全部八项。org.opencode / OpenCode Zen 的 provider-only 模型都不带 `supportedReasoningEfforts`，于是 Ultra 等项全冒出来。

**修复（源码，即上游「固定下拉数组」所在处）：** `src/components/content/ThreadComposer.vue` 的 `reasoningOptionCatalog` 由 8 项收敛为 `Low` / `Medium` / `High` 三档（`reasoningOptions` 的过滤与回退逻辑不变：模型声明了档位则取声明与目录交集，未声明则回退到现在的三档）。provider-only 模型不再冒出 Ultra/Max/Minimal/None/Extra high。

**验证：** `vue-tsc --noEmit` 类型检查通过 + `vite build` 成功（248 模块）；产物 `dist/assets/index-CwlfGiwT.js`（对应既有 `index-BItdblN0.js` 的新哈希）中下拉目录已为三档 `{value:"low"},{value:"medium"},{value:"high"}`；`useDesktopState.test.ts` 的 13 个 reasoning 相关用例全过（组合层 `availableModelReasoningEfforts` 逻辑未动，仅 UI 目录收敛）。

**需注意的副作用→已按用户明确要求：** 此修改对**所有**模型都生效——不只 provider-only 的「回退」场景，连声明了 `xhigh/max/ultra` 的模型（如 GPT-5.6 Sol/Terra 的 Max/Ultra、Luna 的 Max）下拉里也不再生效显示。用户原话即「把固定下拉数组只保留 Low/Medium/High 三档」，属整体收敛，故按此落地；`tests/providers-models/gpt-5-6-max-and-ultra-thinking-levels.md` 已同步改为新行为。若后续只想「收紧回退、保留模型声明档位」，需改为仅改 `reasoningOptions` 的回退分支（`supportedEfforts === undefined` 时返回三档）、保留完整 `reasoningOptionCatalog`。

**性能审计：** 纯前端静态目录收敛，仅减少下拉可选项，无新增请求/阻塞/fanout/缓存风险；未做运行时 profile（不触及网络/渲染/启动关键路径）。

## 涉及文件与提交（补充）

- `src/components/content/ThreadComposer.vue`（`reasoningOptionCatalog` 8→3 档）
- `tests/providers-models/gpt-5-6-max-and-ultra-thinking-levels.md`（同步为新行为）
- commit `5aaa458`
