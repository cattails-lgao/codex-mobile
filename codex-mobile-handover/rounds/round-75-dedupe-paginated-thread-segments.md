# round-75：侧边栏重复线程行去重（paginated rollout 分段，v0.1.120）

## 需求 / 背景
用户反馈：左侧线程列表同一线程渲染多次，例如 `01a080b5-22f8-7070-8b84-1b89add6271b` 出现 3 次、`01a08b25-7802-7320-8339-a238e3b658c5` 出现 2 次。Vue 控制台同时报 duplicate-key 告警（四处 `v-for` 均以 `thread.id` 为 key）。

## 根因与方案

### 根因（实测确认）：app-server 的 `thread/list` 本身返回重复 id
先确认不是 fork 代码的问题——起一个干净的 app-server 直接发 `thread/list`（完全绕过 bridge）：

```
rows: 21   unique ids: 18   dup rows: 3
  01a080b5-... ×3
  01a08b25-... ×2
```

三条 `01a080b5` 各指向不同 rollout 段：

```
rollout-2026-09-11T00-51-58-..._01a08c3b-...   updatedAt 1789086830
rollout-2026-09-11T00-47-58-..._01a08c38-...   updatedAt 1789058946
rollout-2026-09-08T19-09-09-...                updatedAt 1789046586
```

而 `state_5.sqlite` 里该 id 只有 1 行（`id` 是 PRIMARY KEY），指向最新那段：

```
01a080b5-...| /root/.codex/sessions/2026/09/11/rollout-...00-51-58....jsonl | 1789086830
```

结论：SQLite 侧是「一 id 一行」的正确结构，但 app-server **从 `sessions/` 目录扫描**构建 `thread/list`，把同一 session 的多个 rollout 段当成了多条线程。

### 为什么会存在多段 rollout：paginated 回退的设计使然
五个分段的时间戳正好对上三次回退：

```
00:25:03  ordinal 16314    ← 回退 1
00:25:26  ordinal 16304    ← 回退 2
00:26:45  ordinal 16294    ← 回退 3
00:47:58  ordinal 16277
00:51:58  ordinal 16279
```

每段首行 `session_meta` 都带：

```json
"history_base": { "thread_id": "01a080b5-...", "end_ordinal_exclusive": 16294, "end_byte_offset": ... }
```

即 paginated 的 revert **不重写原文件**，而是新开一段并以 `history_base` 指向前缀——这是预期行为（round-74 已确认 `thread/revert` 的 `turns` 恒空、历史经 `thread/turns/list` 分页 hydrate）。问题只在**列出侧没有按 session_id 归并**。`01a08b25` 两条同理（09-10 一条 + 09-11 一条）。

### 为什么以前没暴露
这两条线程的 `historyMode` 都是 paginated。8/20 之前创建的是 legacy，单文件追加、不产生分段，所以永不重复。全库 paginated 1364 / legacy 仅 42。**推论：只要用过 paginated 回退，就会积出一条重复线程；用得越多重复越多。**

### fork 代码里确认没有兜底去重（CodeGraph 调用链）
用 CodeGraph 跑调用链与覆盖标注：

```
runRpcResponsePipeline (src/server/bridge/rpcPipeline.ts)
  ↓ filterSubagentThreadsFromThreadListResult
  ↓ filterThreadListByIds
```

逐环核对：

| 位置 | 行为 | 去重? |
|---|---|---|
| `normalizeThreadGroupsV2`（`api/normalizers/v2.ts`） | `data.map(toUiThread)` 直接映射 | ❌ |
| `groupThreadsByProject` | 按 projectName 分组 push，同 id 进两次 | ❌ |
| `mergeThreadGroupPages`（`useDesktopThreadListLoading.ts`） | Map 按 id 合并 | ✅ 仅这段对 |
| `loadThreads` | `loadedThreadListGroups = groups` 直接替换 | ❌ 绕过上面的去重 |
| `mergeThreadGroups`（`useDesktopStateUtils.ts`） | 按 id 复用对象引用 | ❌ 不删重复 |
| `SidebarThreadTree.vue` | `v-for :key="thread.id"`（四处） | ❌ 同 key 重复渲染 |

### 修复（分三层）

**① 主修：bridge 层按 id 归并（`src/server/bridge/rpcPipeline.ts`）**
新增 `dedupeThreadListByIdKeepNewest`，在 `runRpcResponsePipeline` 中**紧随子代理过滤之后**、作为 `thread/list` 的终态步骤（`dedupedResult`，下游快照与 overlay 一并改用它）：

- 按 `id` 归并，**保留 `updatedAt` 最大**的那段（对应 `state_*.sqlite.rollout_path`），不是取第一条——app-server 返回顺序不保证，最新段才是当前活跃历史；
- 保持首次出现位置，列表顺序不跳；
- **无 id 的行原样透传**（不被误删）；
- 无重复时**返回原对象引用**（不给下游制造无谓变更）。
- 该终态位置同时覆盖子代理过滤与 imported-session 合并可能残留的同 id 重复。

**② 加固：前端渲染层兜底（`src/utils/threadGroups.ts` + `SidebarThreadTree.vue`）**
新增纯函数 `dedupeThreadGroupsById`（同样「无重复返回原引用」，按 `updatedAtIso` 取最新），`SidebarThreadTree` 加 `dedupedGroups` 计算属性，把**四个渲染源全部接上**：`filteredGroups`（树视图，含 `visibleThreads`）、`globalThreads`（时间线 + 聊天视图）、`threadById`（固定区）。这样四处 `:key="thread.id"` 全覆盖，bridge 万一回退也不会再出 duplicate-key。
不改 `loadThreads` 的「服务端权威、直接替换」语义——前端兜底只防渲染重复，不掩盖上游问题（主修仍在 bridge）。

**③ 补测试**
`rpcPipeline.test.ts` +3 例：同 id 两段折叠为最新段并保序 / 无 id 行透传 / 全唯一时返回原引用；新增 `src/utils/threadGroups.test.ts`（4 例）。此前 `filterThreadListByIds` 等经 CodeGraph 标注**无覆盖**。

## 涉及文件
- `src/server/bridge/rpcPipeline.ts`：新增 `readUpdatedAt`、`dedupeThreadListByIdKeepNewest`，`thread/list` 终态接入
- `src/server/bridge/rpcPipeline.test.ts`：+3 例
- `src/utils/threadGroups.ts`（新增）：`dedupeThreadGroupsById`
- `src/utils/threadGroups.test.ts`（新增）：4 例
- `src/components/sidebar/SidebarThreadTree.vue`：`dedupedGroups` 计算属性 + 三处渲染源接入
- `tests/thread-loading-state/sidebar-deduplicates-paginated-thread-segments.md`（新增手测）+ `tests.md` / `tests/thread-loading-state/index.md` 登记

## 变更范围与约束
- 仅触碰 `thread/list` 的归并终态与侧边栏渲染源；不触碰消息历史 hydrate、回退分流、实时/通知时序、子代理过滤判定等路径。
- 归并依据 `updatedAt`（bridge 层读数值 `updatedAt`，前端层读 `updatedAtIso`），与服务端持久化的 `rollout_path` 指向一致；无 `updatedAt` 时按 `0` 处理，等价于保留首条。
- 输出对下游仍满足「无重复即同引用」，不打断既有基于 `===` 的不变性/缓存判断。

## 验证（已跑通）
- 定向 Vitest：`threadGroups.test.ts` 4/4、`rpcPipeline.test.ts` 5/5 通过。
- 全量 Vitest：**541 通过 / 2 失败**；2 个失败为 `codexAppServerBridge.archive.test.ts` 的 Windows 平台权限差异（symlink EPERM、文件 mode 0o600 vs 0o666），与本轮无关（既有环境性失败）。
- `vue-tsc --noEmit` 干净；`vite build`（335 模块）与 `tsup` CLI 构建均通过。
- 手测口径（见 `tests/thread-loading-state/sidebar-deduplicates-paginated-thread-segments.md`）：`thread/list` 的 rows == unique ids（当前 21 vs 18，应相等）；`01a080b5` 只出现 1 次且 path 指向 `00-51-58` 段；`01a08b25` 只出现 1 次；侧边栏无重复行、无 Vue duplicate-key 告警；legacy 线程不受影响。

## 性能审计
- bridge 层新增一次 O(n) 单遍归并（n = 线程数，量级 10²），仅 `thread/list` 且仅在发现重复时新建数组，无重复时零分配、零拷贝。
- 前端 `dedupedGroups` 为 `props.groups` 的纯计算派生，仅在 groups 变化时重算，无新增网络请求、无缓存/存储 I/O、无启动路径影响。
- 净效应是**减少**渲染行数（重复 id 折叠），不增加渲染开销。

## 发布
- 版本 `0.1.119 → 0.1.120`（修复提交 `8852718`，文档/版本提交 `bfcf11b`）。
- git tag `v0.1.120` 与 GitHub Release 已创建（https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.120 ，非草稿/非预发布，已标记 Latest）。
- `codex-mobile-re@0.1.120` 已由用户 publish 至 npm 官方源并成为 `latest`（`npm view codex-mobile-re dist-tags.latest` → `0.1.120`，发布时刻 2026-09-11T02:31:05Z），发布链路全部闭环。
