# Round-77：线程打开时延——轮耗时镜像写放大消除 + provider-models 并发去重（2026-09-11，随 v0.1.122 发布，已闭环）

> **背景：** round-76 交付后用户反馈「左侧线程加载是快了一点，但是还是有点慢；消息列表感觉没有变化」。按 AGENTS.md 先测量再改动：以真实 home 环境（本机 `~/.codex`，最重 rollout 4.03MB）搭 dev server（4173），用桥层 RPC profiler + 浏览器 profiler + 新增的感知时延探针定位。结论：round-76 减的是**响应字节**，而打开线程的耗时由**并发请求争抢**（尤其轮耗时镜像的 PUT 风暴）主导，字节瘦身自然「感觉没变化」。

## 现象与测量

**桥层（warm，真实 home，thread `019ffb5c-7f50-7381-bdd5-9b20d4787599`，rollout 4.03MB）**

| 环节 | 实测 |
|---|---|
| `thread/list` | 91ms / 20KB |
| `thread/read` metadata-only | 15ms / 1KB |
| `thread/turns/list`（limit10 desc full） | 84ms / 112KB |
| `thread/resume`（warm，payload 已裁剪到 10 轮 163 项） | 148–718ms / 374KB |
| `thread/read` 重复 | 149ms → 9ms（round-76 缓存命中） |

**浏览器首屏（warm）**：FCP 324ms、总 API 116.6KB（瘦身有效），但一批 GET 端点排队后同时放行——`meta/methods` 3007ms（冷）、`provider-models` ×3～×4 各 1.5–2s、`free-mode/status` ~1s、`git/branches` ×3 各 ~1.5s（本环境返回 500）。**冷启动**（app-server 初始化）首次 GET ~3s，热态同端点为 2ms。

**感知时延探针**（`output/playwright/perceived-latency.cjs`，新增）：boot→侧栏 496ms；点击线程 1900/455/258/243ms；请求数 85。

**根因（实测确认）：轮耗时镜像写放大。** `savePersistedTurnDurationMap` 每次保存都把**全部线程的每一轮**逐条 `PUT /codex-api/thread-turn-durations`，且它在启动合并服务端存档之后被调用——于是每次开页都把服务端已有的数据原样回写：本机 **27 个 PUT**（探针里 28 = 1 GET + 27 PUT）。桥接层每个 PUT 都是一次「读整份 `codex-global-state.json` + 写回」，既占满浏览器 ~6 条同源连接、又串行占用服务端文件 I/O，直接拖慢并发的 `thread/list` / `thread/resume`。

**A/B 验证（决定性）**：把 PUT 风暴用快速 200 短路后（其余不变）——

| 指标 | 有风暴 | 无风暴 |
|---|---|---|
| `thread/resume` 平均 | 224ms（max 283） | **84ms（max 113）** |
| 点击线程 #1/#2/#3 | 455/258/243ms | **246/114/123ms** |
| `thread-turn-durations` 请求数 | 28 | 1 |

## 改动

### ① 轮耗时镜像只发增量（`src/composables/useDesktopStatePersistence.ts` + `src/composables/useDesktopState.ts`）

- `useDesktopStatePersistence.ts` 新增模块级快照 `mirroredTurnDurations` 与 `seedMirroredTurnDurations(state)`；`savePersistedTurnDurationMap` 只对「相对快照新增/变化」的条目发 PUT，保存后刷新快照。
- `useDesktopState.ts` 的 `loadThreadTurnDurationsIfNeeded` 在合并服务端存档后先 `seedMirroredTurnDurations(archive)` 再 `savePersistedTurnDurationMap(next)`：数据本来就来自服务端，标记为已知即可，纯本地新增的条目仍会正常上行。
- 语义边界：镜像仍是 best-effort（fire-and-forget `void`），只是**量的变化**；存档格式与 localStorage 行为不变，无迁移。

### ② provider-models 并发去重（`src/api/gateway/models.ts`）

- `fetchProviderModelIds` 原有 30s TTL 缓存只在响应回来后写入，首屏多个调用方在缓存写入前会各自 miss、各发一次（实测 ×4，每次 1–1.5s）。新增 `providerModelsInflight` Map 共享同一 in-flight Promise，同 key 的并发调用只发一次；`clearProviderModelsCache` 一并清空。

### 未做（有意）

- **`thread/resume` 结果缓存**：round-76 已明确不缓存 resume（会改变时序语义），本轮维持。
- **侧栏 computed 重复全量扫描 / `isDuplicatePathLeafName` O(g²)**：在当前规模（~25 线程）下开销可忽略，未改（避免无收益的改动）。
- **首次点击仍偏慢**：受启动期 `provider-models` / `git/*` / `free-mode/status` 请求占用连接影响，且本环境 `git/branches` 返回 500、本地 provider 未启动，属环境+另一个话题，未在本轮处理。

## 涉及文件

**修改**
- `src/composables/useDesktopStatePersistence.ts`：`mirroredTurnDurations` + `seedMirroredTurnDurations` + 增量镜像
- `src/composables/useDesktopState.ts`：`loadThreadTurnDurationsIfNeeded` 种子化后再保存
- `src/api/gateway/models.ts`：provider-models in-flight 去重

**新增**
- `src/composables/useDesktopStatePersistence.turn-durations.test.ts`（3 例：种子化后不回写、只上行变化条目、重复保存不再发）
- `tests/thread-loading-state/turn-duration-mirror-sends-deltas.md`（手测口径）
- `output/playwright/perceived-latency.cjs`（感知时延探针，gitignored 的 `output/` 下）

## 验证（已跑通）

- 定向 Vitest：新增 `useDesktopStatePersistence.turn-durations.test.ts` **3/3 通过**。
- 全量 Vitest：**572 通过 / 2 失败**；2 个失败为 `codexAppServerBridge.archive.test.ts` 的 Windows 平台差异（workspace roots canonical form、文件 mode 0o600 vs 0o666/438 vs 384），与本轮无关（既有环境性失败，干净 HEAD 同样复现）。
- `vue-tsc --noEmit` 干净。
- 浏览器感知时延（同口径三连测）稳态：

| 指标 | 改动前 | 改动后 | 变化 |
|---|---|---|---|
| `thread/resume` 平均 | 224ms（max 283） | **81ms（max 121）** | **−64%** |
| 点击线程 #1 / #2 / #3 | 455 / 258 / 243ms | **~240 / 90 / 125ms** | −47% / −65% / −49% |
| `thread-turn-durations` 请求数 | 28 | **1** | −96% |
| `provider-models` 请求数 | 4 | **2** | −50% |
| `/codex-api` 请求总数（同脚本流程） | 85 | **53** | −38% |
| boot→侧栏 | 496ms | 403–476ms | 持平 |

## 性能审计

- 变更只在「是否发这条 PUT」上做 diff：一次保存的额外开销是 O(条目数) 的比较（无网络、无分配），换掉原来的 O(条目数) 并发 PUT 洪流，是净收益。
- provider-models 去重把同一 key 的并发请求收敛为 1 次，命中/在飞两条路径都无新增请求。
- 不新增任何请求类型、不改协议、不改存档格式；无缓存失效风险（增量快照在每次从服务端载入时重新种子化）。

## 发布

- **已随 v0.1.122 发布（与 round-78 同批）**。版本 bump 至 `0.1.122`；代码+测试提交 `66b6996`、文档/版本提交 `a2d43c0`、哈希记录 `d87859d`、推送状态 `3393175` 均已推送 `origin/main`。git tag `v0.1.122`（annotated，指向 `3393175`）与 GitHub Release 已由维护者创建（非草稿/非预发布，已标记 Latest）：https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.122 。`codex-mobile-re@0.1.122` 已由用户 publish 至 npm 官方源并成为 `latest`（`dist-tags.latest` → `0.1.122`，发布时刻 `2026-09-11T13:27:47.938Z`，shasum `3a331aab8ba9ea361a4c071498a964193fbbcf9e`），发布链路全部闭环。
