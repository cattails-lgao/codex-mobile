# Round-44：「WebUI 预览线程后无法在 TUI 恢复」的 writer 锁已知限制（2026-08-18）

> **背景：** 用户报告——在 WebUI 中点击预览过线程后，再在 codex TUI 中打开同一线程报错 `Failed to resume session from ...: thread/resume failed: thread <id> already has an active writer (code -32600)`。本轮为纯诊断 + 文档化（选择了「保留查看 + 文档化」方向），**无代码改动、无版本号变化**。

## 问题一句话：同线程被「WebUI 的 app-server」与「TUI 的 app-server」抢同一个 writer 锁

`codex app-server` 给每个线程一把「active writer」锁，锁实体是 `CODEX_HOME/thread-writer-locks/<threadId>.lock` 这个零字节文件上的 **OS 级文件锁（flock）**。WebUI 会启动**自己专用的、长生命周期**的 app-server 进程，与用户真正的 TUI（codex-cli）共享同一个 `CODEX_HOME`。一旦 WebUI 的 app-server 对某线程执行过 `thread/resume`（发消息时经桥接层 `turn/start → thread/resume`），它就会**在该进程的整个生命周期内持有这把 OS 文件锁**，于是 TUI 稍后再对该线程 `thread/resume` 就报 32600。

## 实测结论（本地双 app-server 复现实验，`C:\Users\cattails\AppData\Local\Temp\writer-repro.mjs`）

两个 `codex app-server` 进程（一个代 WebUI、一个代 TUI）共享同一隔离 `CODEX_HOME`、种子一个会话，依次验证：

1. **`thread/read` 不抢锁**：WebUI 只读后，TUI 的 `thread/resume` 成功。→ **纯预览（只读查看）是安全的**，不会锁死 TUI。
2. **`thread/resume` 锁住线程直到进程退出**：WebUI resume 后，TUI 的 resume 在整个重试窗口内持续报 `already has an active writer`。
3. **无空闲超时释放**：让持锁进程存活，等 70 秒后用全新进程 resume，仍报 `already has an active writer`。
4. **只有持锁进程退出才释放**：kill 掉 WebUI 进程后，TUI 的 resume 立即可成功。

**补充：** 该 codex 版本的 app-server 协议**没有释放 writer 的 RPC**（无 `thread/close`，只有 `thread/resume`/`thread/start` 认领；schema 中 `ThreadActiveFlag` 仅描述进程内 turn 状态，不涉及跨进程 writer）。因此**不存在干净的协议内修复**；重启 WebUI 服务（其 app-server 进程随之重启、释放所有旧锁）即可让 TUI 重新打开线程，但再次在 WebUI 对该线程发消息会复发。

## 与「在 WebUI 看 TUI 会话」功能的关系（本轮关键澄清）

- `ExternalSessionTracker`（commit `671f2af`）让 TUI 会话能在 WebUI「查看」，它是**只读**地直接读 session 文件，**不持有** app-server writer 锁——实验证实它从不是锁冲突的来源。
- 因此「保留查看能力」与「根治 writer 冲突」不冲突：只要 WebUI 只读查看，永不抢锁。
- 冲突只在 **WebUI 对 TUI 创建的线程发消息（写）** 后出现，并持续到 WebUI 重启。
- **用户已选择方向：保留 ExternalSessionTracker 查看能力，仅把上述 writer 锁行为作为已知限制文档化。** 不删功能、不做猜测性代码修复。

## 已知限制（供交接与排障）

1. **触发条件**：在 WebUI 对某线程发送过消息后，该线程被 WebUI 的 app-server 持锁；随后在 TUI 打开同一线程 → `thread/resume` 失败（`code -32600 already has an active writer`）。
2. **安全用法**：WebUI 只读预览/查看 TUI 会话不受影响；「同一线程不要在 WebUI 发消息后马上回 TUI 打开」。
3. **解锁手段**：重启 WebUI（其 app-server 进程重启即释放全部旧锁）；无法靠删除锁文件安全解锁（flock 随进程 fd 持有，Linux 下 unlink 有竞态，不推荐）。
4. **不适用**：不要把此限制归咎于 `ExternalSessionTracker`；它只读、不抢锁。

## 涉及文件与提交

本轮回合为纯文档化，改动文件：

- `codex-mobile-handover/rounds/round-44-feedback.md`（新建，本文档）
- `codex-mobile-handover/codex-mobile-handover.md`（快照 + 轮次索引 + 页脚引用）
- 无源码改动、无版本号变更、无 GitHub release / npm 发包
