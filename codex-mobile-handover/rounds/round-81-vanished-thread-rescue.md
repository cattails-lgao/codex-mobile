# Round-81：已消失线程的救济路径（2026-09-14）

> **背景：** round-80 定位了「首条用户消息正文为空 → `preview` 为空 → 线程从列表整条消失」，并断言**只能预防、事后修不回来**（当时的结论是「唯一路径是停下 app-server 直写 `state_*.sqlite` 的 `preview` 列」）。用户随后指出：**受害者出现在线上环境**（本机那份 `CODEX_HOME` 里确实没有受害者）。为线上那条线程找可执行救济时，实测把 round-80 的收尾结论推翻了两次：直写库**无效**，而协议里存在一条可用的侧门。本轮只做调研 + 交付救济工具，**不改动任何产品运行路径**。

## 现象

- 受害者线程在本机的对应物不存在：本机 30 行 `threads` 全部非空 preview，磁盘 rollout 与库行一一对应（round-80 根因④）。因此所有结论必须靠**受控复现**得出，不能靠读本机数据。

## 根因（实测确认，非推测）

### ① 列表谓词的完整形态

从 codex CLI `0.153.4` 二进制里挖出的列表查询动态 WHERE 片段（归属 `state/src/runtime/threads.rs:1077`，与 round-80 的片段是同一处，本轮补全）：

```
WHERE 1 = 1
  AND threads.archived = 0
  AND threads.preview <> ''
  AND threads.thread_section_id IS NULL | = ?
  AND threads.project_id IS NULL | = ?
  AND threads.source IN (...)
  AND threads.model_provider IN (...)
  AND threads.cwd IN (...)
  AND (instr(COALESCE(threads.name, ''), ?) > 0
       OR instr(threads.title, ?) > 0
       OR instr(threads.preview, ?) > 0)
```

两点修正 round-80 的措辞：**没有** `has_user_event` 谓词（它在二进制里只出现 2 次：建表 + 一条迁移 `UPDATE threads SET first_user_message = title WHERE first_user_message = '' AND has_user_event = 1 AND title <> ''`）；`cwd` 过滤用的是库内存储值，Windows 上是 `\\?\C:\...` 扩展前缀形式，用普通路径去比会**静默不匹配**（本轮踩过这个坑，导致 `thread/list` 一度返回 0 条）。

### ② rollout 才是元数据事实源，`state_*.sqlite` 只是写穿缓存

这是推翻 round-80 的关键，用两个判决实验得出：

| 实验 | 操作 | 结果 |
|---|---|---|
| A | 服务**运行中**直接改 `threads.preview` 列 | `thread/list` 返回的仍是旧文案；列值持久留在文件里没被改回 |
| B | 服务**停机**时改列 → 冷启动新进程 | 该行**仍不可见**（同库另一条会话内新建的正常线程可见，证明列表读得到库/进程状态） |

结论：**直写 `state_*.sqlite` 的 `preview` 列对 `thread/list` 完全无效**。round-80 里「事后救济 = 停服务改列」这条路是错的。

### ③ 为什么 `thread/goal/set` 有效

对比「直写列」与「走服务写」之后的 rollout，唯一差别是后者**往 rollout 追加了一行事件**：

```
{"type":"event_msg","payload":{"type":"thread_goal_updated","threadId":"…","goal":{"objective":"clip.mp4","status":"complete"}}}
```

元数据派生在首消息正文为空时会回退到 goal objective。所以救济 = **让 rollout 里出现一条带非空 objective 的 goal 事件**。这也解释了 round-80 在二进制里看到的两条内部补写 SQL（`UPDATE threads SET preview = ? WHERE id = ? AND preview = ''`、迁移期 `SET preview = first_user_message`）——它们都只是缓存写入，真正起作用的是 rollout 那一行。

### ④ `thread/resume` 是必要条件（本轮最容易踩的坑）

对着**未被 app-server 加载**的线程调 `thread/goal/set`：RPC 返回 OK、`threads.preview` 缓存列也更新了，但 **rollout 里什么都没写**，`thread/list` 不变，重启后又按 rollout 派生回空。先 `thread/resume` 把线程加载起来（挂上 rollout writer），goal 事件才会真正落盘。

## 救济（新增 1 个脚本）

新增 [scripts/rescue-empty-preview.mjs](../../scripts/rescue-empty-preview.mjs)：读 `CODEX_HOME` 的 `state_*.sqlite`（只读）找出「preview 为空、且 rollout 里确有用户轮次」的行 → 按与 [src/utils/turnPromptText.ts](../../src/utils/turnPromptText.ts) 同一套规则推导兜底文案（正文 → 首个附件名 → `[Image]` → `[Attachment]`）→ 通过运行中的 codex-mobile 的 `POST /codex-api/rpc` 依次发：

```
thread/resume   { threadId, excludeTurns: true }     # 必须先加载，否则 goal 事件不落 rollout
thread/goal/set { threadId, objective: <推导文案>, status: 'complete' }
thread/goal/clear { threadId }                       # 可选：清掉 goal，preview 不受影响
```

设计取舍：

- **走运行中的服务而不是自己起 app-server**：列表是服务进程内的索引，必须由「正在服务 UI 的那个 app-server」来写；另起一个进程只会写库/rollout，对当前索引无效。回环请求在 `authMiddleware` 里免鉴权（`isLocalhostRemote && isLocalhostHost`），所以脚本无需密码。
- **默认 dry-run**：不加 `--apply` 只打印计划（含每条要发的 RPC），不改任何状态。
- **`goal/clear` 保留**：实测清掉 goal 后 preview 仍是 goal objective（rollout 只追加、不回退），`goal/get` 返回 `null`、rollout 里也不留 `thread_goal_cleared`，所以能拿到「可见但无残留」的干净结果；`--keep-goal` 可跳过这步。
- **判据用 rollout 而不是 `has_user_event`**：后者在失败 turn 上不置位（实测受害者两行都是 `has_user_event = 0`），拿它当受害者判据会漏掉真受害者。

## 验证

全部在隔离 `CODEX_HOME`（真实 `auth.json` / `config.toml` 只拷贝不动）上做，先用「附件前言 + 空正文」「空文本块」两种形态各造一条真实受害者，再走**真实 dist-cli 服务**（`--port 4199 --no-tunnel --no-open --no-login`）的 `/codex-api/rpc`：

| 步骤 | 结果 |
|---|---|
| 基线 `thread/list` | **0 条**（两条受害者均不可见） |
| `rescue-empty-preview.mjs --apply` | `healed 2/2, all visible` |
| 救济后 `thread/list` | **2 条**，`preview` 分别为 `clip.mp4` 与 `[Attachment]`（与推导一致） |
| 走服务重启后再查 | **2 条仍在**（持久） |
| `goal/clear` 后 `goal/get` | `{"goal": null}`，列表不变 |

过程中的负面结果同样记录在案（见根因②/④）：直写列（运行中、停机后冷启动）均无效；未 resume 的 `goal/set` 只写缓存不写 rollout。这些反例留在 `output/` 下的探针脚本里（`probe-preview-heal.py`、`probe-goal-heal-list.py`、`probe-goal-diff.py`、`probe-resume-then-goal.py`，`output/` 已被 gitignore，不进仓）。

- `vue-tsc --noEmit`：本轮只改了 [src/utils/turnPromptText.ts](../../src/utils/turnPromptText.ts) 的注释（纠正已证伪的结论），无类型变化。
- 全量单测：无新增/无改动用例，沿用 round-80 基线 **587 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` 的既有 Windows 环境性失败）。
- Playwright：本轮不涉及 UI 行为，未跑。

## 性能审计

不改动产品运行路径，新增脚本是一次性运维工具：每条受害者固定 3 次 RPC + 首尾各 1 次 `thread/list`（`limit: 200`），无轮询、无并发扇出；库访问全部只读，脚本不写 `state_*.sqlite`。无需 live profiling。

## 边界（如实记录）

- **未对任何真实库执行过救济**。本轮全部结论来自隔离 `CODEX_HOME`；线上那条线程的 id / rollout 路径尚未拿到，因此没有触碰线上数据。
- 救济会在受害者 rollout 里**永久追加一行 `thread_goal_updated`**（rollout 只追加不回退，`goal/clear` 也不会移除它）。这是该路径的固有代价；对模型的后续上下文无影响，但该线程从此在 rollout 层面「带过一个 goal」。
- 兜底文案与 round-80 修复保持同一套规则；图片轮次只能识别到「该轮含 image 块」→ `[Image]`，无法还原原始文件名。
- 仅覆盖 codex CLI `0.153.4` 的实测行为。换版本需重跑 `output/probe-*.py` 复核（列表谓词、goal 回退、resume 必要性三处都可能变）。

## 发布状态

新增 `scripts/rescue-empty-preview.mjs` + round-80 结论修正 + 本文档待提交。**版本 bump / tag / Release / npm publish 仍未做**（待用户指示）；round-79 的回退顺序修复同样仍在待发布队列里。
