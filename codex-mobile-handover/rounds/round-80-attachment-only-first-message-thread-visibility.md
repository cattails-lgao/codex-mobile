# Round-80：首条用户消息正文为空导致线程从列表消失（2026-09-14，v0.1.123 发布）

> **背景：** 用户反馈一条线程在 WebUI 里「消失」了。该线程的首条用户消息只带附件、没有正文，WebUI 把用户文本拼成「文件头 + 空正文」（`## My request for Codex:` 后面什么都没有）。app-server 从首条用户消息派生列表元数据，正文为空 → `preview` / `title` / `first_user_message` 三者都是空串 → 列表查询带 `preview <> ''` 过滤，空值行被整条筛掉。线程本身没丢、没归档、rollout 一直在写。

## 现象

- 侧栏、搜索、置顶分组里都看不到该线程；但它的 rollout 文件仍在增长，`thread/read` 之类按 id 的调用也能命中。
- 触发条件：**首条**用户消息只发附件/图片、不写正文（`ThreadComposer` 的 `canSend` 允许附件单独发送）。

## 根因（实测确认，非推测）

**① 列表查询确实按 `preview` 过滤（二进制证据）。** 在 codex CLI `0.153.4` 的 `codex.exe`（`<pnpm 全局 store>` 下对应版本的安装目录）里可搜到列表查询的动态 WHERE 片段：

```
WHERE 1 = 1 AND threads.archived = 0 ... AND threads.preview <> ''
```

以及随迁移建立的部分索引，同样带该谓词：

```sql
CREATE INDEX idx_threads_visible_recency_at_ms
    ON threads(archived, recency_at_ms DESC, id DESC)
    WHERE preview <> '';
```

即「空 preview」不是一个显示层问题，而是**行级不可见**：任何 `thread/list` 变体（含搜索、置顶分组）都取不到。

**② 首消息空正文 ⇒ 三个元数据全空（隔离实测）。** 用隔离 `CODEX_HOME`（真实 `auth.json` / `config.toml` 只拷贝、不动原文件）起一个 app-server，按三种首消息形态各起一条线程，模型 id 故意填不存在的值（快速失败，只关心落库元数据）：

| 首消息形态 | `preview` / `title` / `first_user_message` | 列表可见 |
|---|---|---|
| A 附件前言 + 空正文（修复前 WebUI 的组装结果） | `''` / `''` / `''` | **不可见** |
| B 纯文本（对照） | = 原文 | 可见 |
| C 空文本块（只发图片/图片 URL 未转本地附件时） | `''` / `''` / `''` | **不可见** |

同一份库按列表谓词统计：**3 行里只有 1 行可见**。A 与 B 的唯一差别是正文，因此可确认 app-server 是「剥掉前言取正文」而不是「取整段文本」——A 的整段文本非空，落库预览仍是空串。

**③ 没有直接「写元数据」的 RPC 能修回 preview。** 协议里唯一能改线程元数据的是 `thread/metadata/update`，其 `ThreadMetadataUpdateParams` 只含 `threadId` / `gitInfo` / `projectId`（见 `documentation/app-server-schemas/json/v2/ThreadMetadataUpdateParams.json`）；`thread/name/set` 只写 `name`，而列表谓词只看 `preview`。app-server 内部另有 `UPDATE threads SET preview = ? WHERE id = ? AND preview = ''` 与迁移期 `UPDATE threads SET preview = first_user_message WHERE preview = '' AND first_user_message <> ''` 的补写路径（goals 扩展有 `failed to set empty thread preview from goal objective` 的报错文案），但都没有对外 RPC。**结论：只能预防，不能靠元数据 RPC 事后修。**

> ⚠️ **本段在 round-81 被修正。** 当时还断言「唯一救济是停服务直写 `state_*.sqlite` 的 `preview` 列」——**这是错的**：rollout 才是元数据事实源，sqlite 只是写穿缓存，直写列对 `thread/list` 完全无效（运行中改、停机改完重启，都不生效）。真正可用的是 `thread/resume` + `thread/goal/set` 这条侧门，详见 [round-81](round-81-vanished-thread-rescue.md)。

**④ 本机存量排查（如实记录）。** 扫描 `<codex 用户目录>` 的 `state_*.sqlite`（只读拷贝副本打开）与全部 rollout：30 行 `threads`、0 行空 preview；首条用户消息没有一条是「附件前言 + 空正文」。也就是说本机当前没有受害者，本轮是**预防性修复**。

## 修复（1 个新文件 + 2 处调用点）

新增纯函数 [src/utils/turnPromptText.ts](../../src/utils/turnPromptText.ts)：`resolveTurnPromptText(text, fileAttachments, imageUrls)` —— 正文非空则原样返回；否则依次回退到**首个附件 label** → `[Image]` → `[Attachment]`。回退顺序刻意与侧栏标题兜底（[useDesktopThreadTitleCache.ts](../../src/composables/useDesktopThreadTitleCache.ts) 的 `resolveFallbackThreadTitle`：附件名 → `[Image]`）保持一致，让服务端派生的 `preview`/`title` 与 UI 已显示的标签是同一个值。

改成在两处「组装用户文本」的调用点先过兜底、再拼附件前言：

- [src/api/gateway/threads.ts](../../src/api/gateway/threads.ts) `startThreadTurn`（正常发送路径）；
- [src/server/codexAppServerBridge.ts](../../src/server/codexAppServerBridge.ts) `buildQueuedTurnParams`（队列/暂存补发路径）。

选择「调用点」而非「`buildTextWithAttachments` 内部」的原因：只有调用点知道本条消息还带了哪些图片（图片在本机图片 URL 场景下会先被折算成文件附件），把兜底放在调用点才能同时覆盖 A 与 C 两种形态；`buildTextWithAttachments` 保持纯格式化职责不变。工具模块放在 `src/utils/` 是因为该目录已被前端与服务端共同引用（如 `utils/commandInvocation.ts`），避免像 `buildTextWithAttachments` 那样再存一份拷贝。

## 验证

- 修复后同样口径回放真实 app-server（隔离 `CODEX_HOME`）：首消息为「附件前言 + 正文=附件名」时 `preview`/`title`/`first_user_message` = `clip.mp4`，**2/2 行可见（VERDICT: PASS）**。
- 新增单测：`src/utils/turnPromptText.test.ts`（4 例）、`src/api/gateway/threads.blankPrompt.test.ts`（3 例，经 `startThreadTurn` 真实组装路径断言 `## My request for Codex:` 之后的正文非空；含本机图片 → 图片文件名、远程图片 URL → `[Image]` 两个分支）。
- 定向 Vitest **7/7 通过**；全量 Vitest **587 通过 / 2 失败**（`codexAppServerBridge.archive.test.ts` 的 Windows 文件 mode/workspace-roots 既有环境性失败，与本轮无关；round-79 基线为 580 通过 / 2 失败，+7 即本轮新增用例）。
- `vue-tsc --noEmit` 干净；`vite build` 与 `tsup` CLI 均通过。
- 手测文档：[tests/thread-loading-state/attachment-only-first-message-keeps-thread-listable.md](../../tests/thread-loading-state/attachment-only-first-message-keeps-thread-listable.md)（已在 `tests.md` 与域索引登记）。

## 性能审计

改动是发送路径上一个纯字符串判断 + 一次数组 `find`（附件数量级为个位数），无新增请求、缓存、存储 I/O 或渲染路径变化；只在「正文为空」这一原本就会失败的场景下改变输出内容。依据代码路径分析即可，无需 live profiling。

## 边界（如实记录）

- 只覆盖**未来**的发送：已经被筛掉的线程需要事后救济，见 round-81 的 `scripts/rescue-empty-preview.mjs`（`thread/resume` + `thread/goal/set` + `thread/goal/clear`，走运行中的服务，已在隔离环境端到端验证）。本轮未对任何真实库执行过救济。
- 兜底把「首个附件名」同时用作正文与派生标题。作为模型输入它是冗余信息（附件清单已在前言里），但保证线程可列出、且与 UI 标题一致；多附件时正文只体现第一个附件名。
- 队列路径（`buildQueuedTurnParams`）同理修复，但其调用点没有单独单测锁定（只有共用纯函数被单测覆盖）——若后续有人删掉该处一行兜底，单测不会失败。

## 发布状态

**已随 v0.1.123 发布（与 round-79、round-81 同批）**。版本 bump 至 `0.1.123`；代码提交 `b7d88e4`（新增 `src/utils/turnPromptText.ts` 的 `resolveTurnPromptText` + `startThreadTurn` / `buildQueuedTurnParams` 两处接入 + 2 个测试文件 + 手测文档，已推送 `origin/main`）；提交链、tag 与 GitHub Release 记录见 `sections/commit-history.md` 的 v0.1.123 段。
