# 第一百八十五轮：桥层「整读 rollout」根治 —— 会话日志流式扫描 + revert 分页补水（线上实测）

> 用户口径：**「不是止损，我要功能完整的情况下完全修复，不会再出现这个问题」** ⇒ 本轮不做「大文件跳过」「限制条目数」这类降级，所有恢复逻辑对任意大小的日志都必须照旧生效，只把读取方式改成内存有界。

## 一、起因

round-184 收口了「点编辑 → 点保存没反应」的三条**静默失败**通道。但用户上一条指令要求去线上建大线程复现，实测把更深一层的真因挖了出来：**桥进程会 OOM 崩溃**，崩的几分钟里 `/codex-api/rpc` 全断，任何保存动作都不可能有反应。

## 二、取证（线上 1.15.149.204 / 桥 0.1.136 / codex 0.163.0）

### 2.1 崩溃是既成事实，不是我造成的

`journalctl -u codexapp`：

| 时刻（2026-10-22） | 事件 |
|---|---|
| **19:47:43** | `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`（**用户报障时间窗内，与我无关**） |
| 19:47:50 | `Failed with result 'core-dump'` |
| 19:47:56 | systemd 重启服务 |
| **21:57:55** | 同一条 FATAL（**我主动做的只读压测触发**） |
| 22:15:08 | 部署本轮修复后重启（此后无 FATAL） |

崩溃栈：`v8::String::NewFromUtf8` + `node::StringDecoder::DecodeData` ⇒ **巨型字符串解码**。

### 2.2 触发条件与「轮次数」无关

先按直觉造了 **103 轮 / 686KB** 的夹具线程（`01a163d0-7df1-7de3-9c6c-6b048dc101d8`），线上 Playwright 走完「编辑 → 保存」：`thread/revert` 187–608ms → `turn/start{turnTrigger:'edit_user_message'}` 200 ⇒ **happy path 在线上是通的**。

换成用户那条真线程（**181MB** rollout，`01a13fe8-ad12-7952-8dd9-c8d1909f953d`）只读压测：

| 装置 | 修复前实测 |
|---|---|
| 单发 `thread/read`（响应体仅 1.2MB） | RSS 438 → **1027MB**（+589MB），1.5s 后残留 **724MB** |
| 4 路并发 `thread/read` | RSS **988MB** → 四条全部 `socket hang up` → **进程消失**（21:57:55 core-dump） |
| 单发 `thread/turns/list {limit:200, itemsView:'full'}` | 响应 **20.6MB** / 9.1s / 堆峰值 +245MB |

⇒ 决定性变量是 **rollout 的字节数**，不是轮次。686KB 的日志整读代价可以忽略，181MB 的日志整读一次就吃掉堆的六成。

### 2.3 与用户症状的因果链

桥 OOM → `/codex-api/rpc` 全断 → 0.1.136 的保存失败只写进**UI 无渲染位**的 `desktopError`（round-176 已登记、round-184 才改成会话内错误行）→ 用户看到的就是「点了保存，什么都没发生」。

## 三、根因

### 3.1 四处 `readFile(sessionPath, 'utf8')` 整读 rollout

| 位置 | 用途 | 代价 |
|---|---|---|
| `bridge/session.ts` `buildSessionSkillInputsByTurn` | 恢复每轮技能输入 | 整读 + `split('\n')` + 逐行 `JSON.parse` |
| `bridge/session.ts` `buildSessionItemOrder` | 恢复命令/文件改动的时序 | 同上（**主炸弹**：181MB 一次 +589MB） |
| `bridge/session.ts` `collectFileChangesForTurns` | 编辑/撤销时的文件改动回收 | 同上（**编辑路径直接命中**） |
| `bridge/projectZip.ts` 项目 ZIP 导出 | 只需 `session_meta`（**永远第 1 行**） | 为取一行读整份；导出含大线程的项目时是 GB 级峰值 |

`bridge/threadRoutes.ts` 的 `thread-file-change-fallback` 与 `codexAppServerBridge.ts` 的 `thread-revert-file-changes` 复用上述函数，因此也各有一条整读。

### 3.2 revert 之后一次性索要 200 轮全量 items

`src/api/gateway/threads.ts: revertThread` 固定发 `{limit: 200, itemsView: 'full'}`（app-server 钳到 100 轮）。**编辑保存走的就是这条**：181MB 线程上 20.6MB 响应 / 9.1s / +245MB，与同时在跑的 `thread/read` 叠加就够顶穿 ~991MB 的堆。

### 3.3 `thread/read` 快照按线程无界常驻

`lastThreadReadSnapshotByThreadId` 是一个只增不删的 `Map`，每份是「最近 10 轮」的读结果（重线程上 MB 级）。属于同一类「用久了就爆」。

## 四、修法（不改任何恢复语义）

### 4.1 新增 `bridge/sessionLogScan.ts`：分行流式读

- `iterateSessionLogLines(path)`：`createReadStream`（64KiB 块）+ `readline`（`crlfDelay: Infinity`），**峰值 = 一行 + 调用方保留的结果**，与日志大小无关；`finally` 里销毁流，不泄漏 fd。
- `iterateSessionLogLinesFromText(raw)`：内存行源（测试 / rpc 回显），惰性切片。
- `readSessionLogFirstLine(path)`：只取第一行（ZIP 导出的 `session_meta`）。
- 类型 `SessionLogLineSource = AsyncIterable<string>` —— **故意不接受同步可迭代**：`string` 本身就是 `Iterable<string>`，允许它会让 `f(rawLog)` 静默地按字符扫。

### 4.2 三个扫描器改签名，判定逻辑逐行不动

`buildSessionSkillInputsByTurn` / `buildSessionItemOrder` / `buildSessionFileChangeFallback` / `collectFileChangesForTurns` 的入参从「整份字符串」改成「行源」，循环体只把 `for (const line of raw.split('\n'))` 换成 `for await (const line of lines)`，**其余一行没动**（round-34 的物化合并判定、round-141 的工具形状探针等全部保持原样）。

### 4.3 同一文件版本只扫一趟（单飞）

`readCachedSessionSkillInputsByTurn` 与 `mergeSessionCommandsIntoTurnsFromPath` 加 in-flight 去重表（键 = `path + size + mtime (+ 轮次集合)`）：181MB 单趟扫描约需数秒 I/O，几个标签页同时打开此前是**各扫一遍**。**扫描结果本身不缓存** —— `orderByTurnId` 带着恢复出来的命令输出正文，按线程留着就是这次要根治的内存增长。

### 4.4 revert 补水改成分页 + 逐页归一化

`revertThread` 改为按 `REVERT_HYDRATE_PAGE_TURNS = 20` 走游标链（上限仍是 app-server 的 100 轮钳制），每页归一化后立刻丢掉原始图。新增纯函数 `normalizeThreadMessagesFromNewestFirstPages`（`normalizers/v2.ts`）负责「逐页反转成时间序 + 按更旧轮数平移 `turnIndex` + 末尾跑一次跨轮修正」，与一次性全量归一化**逐位一致**（等价性有单测锁定）。

### 4.5 快照 Map 加 LRU 8

只服务「刚读过又恰好读失败」的兜底分支；淘汰后走既有的「无快照」路径，语义不变。

### 4.6 新闸门 `scripts/check-session-log-memory.cjs`

扫 `src/server/**/*.ts`（排除测试），拦两类回退：①`sessionLogRaw` 形态的「整份日志字符串」；②对 `sessionPath` / `sessionLogPath` / `rolloutPath` 的 `readFile(Sync)`。带 `--selftest`（8 例，含「注释里讲反模式要放行」）；不支持「按大小跳过」——那等于把崩溃换成静默丢功能。两处「调用方已持有字符串」的包装函数用 `session-log-memory: allow` 显式登记，**例外数量会被打印**。

## 五、验证

### 5.1 线上实测（部署本轮构建后，同一台机、同一条 181MB 线程、只读）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 单发 `thread/read` | 438 → 1027MB（+589），残留 724MB | 402 → **412MB**（+10），残留 414MB |
| **4 路并发** `thread/read` | 988MB → 四路 `socket hang up` → **进程 core-dump** | 406 → **420MB**（+14），四路全 200（冷缓存 4.9s/路） |
| `turns/list {limit:200, full}` | 19.8MB / 7.9s / +91MB 峰值、+78MB 残留 | 未再被本仓调用（见 5.2）；单发对照：`limit:20` = 3.7MB / 0.38s |
| 服务状态 | 22:15 前两次 core-dump | 22:15 部署后 `active`，无 FATAL |

### 5.2 线上 UI 端到端（真浏览器 + 真 app-server，夹具线程 103 轮）

`tmp/live/r185-live-revert-paging.cjs`（拦截 `/codex-api/rpc` 记录参数）：

- `thread/revert` **1 次 / 200**
- `thread/turns/list {itemsView:'full'}` **5 页 / limit 全 = 20 / 全部带 cursor / 全 200**
- **不存在** `limit > 20` 的 full 请求（旧实现固定 200）
- 编辑后的文本 **1.0s 上屏**，编辑器关闭

结论：**功能完整**（返回的仍是同一段保留历史，只是分批取回），峰值从「整段历史」降到「一页」。

### 5.3 闸门

| 项 | 结果 |
|---|---|
| `vue-tsc --noEmit` | 0 |
| `vitest run` | **1107/1107 / 101 文件**（新增 `sessionLogScan.test.ts` 8 例、`v2.chunkedPages.test.ts` 4 例；三份既有单测改为 `await` 异步入口） |
| `vite build` / `tsup` | 0 / 0 |
| UI 契约 | 61/61 |
| **`check-session-log-memory`** | 0（61 个服务端源文件，0 处整读，**4 处显式例外**）· `--selftest` 8/8 |
| 脱敏 / md-links / 派生 doc | 0 / 0 / drift 0 |

## 六、诚实边界

1. **线上代码与版本号不一致**：为验证本轮修复，直接把本轮构建的 `dist/` 与 `dist-cli/` 覆盖到服务器的 `codex-mobile-re@0.1.136` 包目录（旧包已备份为 `/root/codex-mobile-re-backup-20261022-221456.tar.gz`）。**`package.json` 仍是 0.1.136** ⇒ 线上 `--version` 与实际代码不符，需要发 **0.1.137** 才能对齐。
2. **只验了「不崩」与「功能等价」，没做长跑浸泡**：内存曲线只覆盖几十秒级的压测与一次 UI 全链路，数天量级的缓存放大会漏。
3. **`streamEventsByThreadId` 仍是「每线程 400 帧、线程数无界」**：本轮**没有**动它——它是 live 视图的实时缓冲，按线程淘汰会改变 live 语义，须单独取证。登记为边界。
4. **`turns/list` 单发大页的能力仍在**：本轮只改了**本仓客户端的 revert 路径**。任何未来的调用方再发 `{limit:200, full}` 仍会吃到 +91MB/页（实测），闸门也拦不住（它只拦 rollout 整读）。
5. **快照 LRU 无单测**：`AppServerProcess` 需要真实子进程，本轮只做类型检查与既有用例回归。
6. **`thread/read` 仍是 2.4–4.9s/次**（181MB 日志的 I/O 成本）：内存已不再是瓶颈，**延迟**仍在；缓存命中 25–61ms。
7. 夹具线程 `01a163d0-7df1-7de3-9c6c-6b048dc101d8`（103 轮）与它的多个 rollout 副本仍在线上侧栏，等用户决定删留。

## 七、本段所在提交

- 代码 + 闸门 + 单测：见 `sections/commit-history.md` 的 round-185 段
- 文档（本文件 + 总入口 + 台账）：`docs(handover): round-185 …`
