# Round-39：@ 搜索无 rg 兜底 + 孤儿思考块堆在末尾 + 新线程发图排查（2026-08-12）

> **背景：** 用户反馈三项：
> 1. 新开线程发送图片有问题；
> 2. 输入 `@main` 筛不出工作区下的 `main.ts`；
> 3. 「需求」线程最后一轮对话，思考过程显示在最后。

## 1. 新开线程发送图片——排查结论：链路正常，失败是提供方限流

- `[Image]` 线程（用户新建）：图片以 `localImage` 载荷正确随 turn 发出（`thread/read` 确认载荷完整），消息列表渲染 `<img>`，文件经 `/codex-local-image` 返回 200。
- turn 失败错误为 `exceeded retry limit, last status: 429 Too Many Requests`（1.6s 内）。**纯文本消息同样 429**（实测 "test text send" 也失败）→ 属 opencode-zen/big-pickle 免费档提供方全局限流，与图片无关，非代码缺陷。
- 无代码改动；验证用测试消息已回滚清理，`[Image]` 线程恢复原状。

## 2. @main 筛不出 main.ts——修复

**根因链：** 主路径 app-server `fuzzyFileSearch` 会话对 `main` 查询返回不可靠结果；回退路径 `/codex-api/composer-file-search` 依赖 `listFilesWithRipgrep`，而**本机 rg 不可用**（`ripgrep (rg) is not available`）→ 回退整体失败 → `@main` 无任何建议。

**修复：** `/codex-api/composer-file-search` 在 rg 失败时退回纯 Node 目录遍历（复用文件面板的 `listWorkspaceFiles`，过滤隐藏/生成目录），路径转相对格式（与 rg 输出一致），沿用 `scoreFileCandidate` 评分。实测 `@main` → `src/main.ts`（浏览器弹窗确认）；空查询列出 9 个工作区文件。

## 3. 思考过程堆在对话最后——修复

**根因：** 轮次被回滚/删除后，该轮已持久化的思考归档（`thread-reasoning`）不会随轮次删除而清理，成为孤儿条目（`turnIndex` 在消息流中不存在，如回滚的测试轮 turnIndex=6 而线程只有 0-5）。`mergePersistedReasoning` 对这类条目走 `unattached` 分支**追加到消息末尾** → 渲染成「思考过程堆在对话最后」。（`thread-reasoning` GET 返回全量归档并按 session 分桶是既有设计，多会话条目不会串线程。）

**修复：** `mergePersistedReasoning` 的兜底分支改为丢弃「turnIndex 在消息流中不存在」的思考（仅保留完全无轮次信息的旧存档兜底追加）；分页加载补齐旧轮后 turnIndex 重新出现，思考按正常位置插入（自愈）。实测「需求」线程末尾 2 个孤儿思考块消失，消息数从 132 减回 130。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：343 通过 + 2 环境性失败（POSIX 权限断言，Windows 基线已知失败）。新增/更新 `useDesktopState.test.ts` 2 例（孤儿思考丢弃 + 分页自愈）。
- 浏览器实测：`@main` 弹出 `src\main.ts`；需求线程末尾孤儿思考消失；`[Image]` 线程图片渲染/载荷/服务全部正常。
- 清理：`[Image]` 线程的测试消息已回滚；需求线程 composer 草稿已清空。

## 涉及文件

- `src/server/codexAppServerBridge.ts`（composer-file-search rg 缺失时纯 Node 兜底）
- `src/composables/useDesktopState.ts`（mergePersistedReasoning 丢弃孤儿轮次思考）
- `src/composables/useDesktopState.test.ts`（新增 2 例 + 更新 1 例）
- `tests/chat-composer-rendering/composer-at-file-mention-uses-server-fuzzy-search.md`、`round29-reasoning-anchor-mismatch-distribution.md`（补充 round-39 条目）
- `codex-mobile-handover/rounds/round-39-feedback.md`（本文档）

## 提交

- 待提交（`round-39` 修复）
