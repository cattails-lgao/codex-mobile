# Round-38：@ 文件提及混入 .git 内部文件 + 收发图片/视频渲染确认（2026-08-12）

> **背景：** 用户反馈三项：
> 1. 输入框的 @ 功能失效了；
> 2. 发出去的图片或视频能在消息列表渲染吗？
> 3. 模型输出的图片或视频能在消息列表渲染吗？

## 1. @ 功能"失效"根因与修复

**复现结论：** @ 弹窗本身能弹出、能选择、能插入附件 chip，并非完全失效。真正的问题是**建议列表被 `.git` 等忽略目录内部文件污染**：主路径走 app-server 官方 `fuzzyFileSearch/sessionStart` 会话，其结果通过 `sessionUpdated` websocket 通知进入 `fuzzyFileSearchResults`，**未经任何过滤**——在 git 工作区输入 `@re` 会看到 `.git`、`refs`、`refs\heads`、`refs\tags` 等 VCS 内部条目，用户观感即"失效"。（回退路径 `searchComposerFiles` 用 ripgrep 且 `-g '!.git'`，但 dist/build 等目录同样未被排除。）

**修复：** `codexGateway.ts` 新增 `isIgnoredFileSearchPath()`（与 `localBrowseUi.ts` 服务端 `isIgnoredWorkspaceDirName` 同一套规则：隐藏目录 + node_modules/dist/build/out/.next/.nuxt/coverage/__pycache__/.cache/.turbo/target/.venv/venv/.idea/.vscode/output），同时应用于 `normalizeFuzzyFileSearchResults`（会话结果）与 `searchComposerFiles`（回退结果）。实测 `@re` 建议从 8 条（含 4 条 .git 内部）变为 4 条干净文件。

## 2. 发送的图片/视频渲染：确认可用（无需改动）

- 图片：发送后乐观用户消息 `message.images` 渲染 `<img>`，实测通过（`test-image.png` → `/codex-local-image?path=...` 正常显示）。
- 视频：round-37 已实现（composer 附加视频 → 乐观消息 `<video>` 渲染），本轮再次实测通过（`sample.webm`）。

## 3. 模型输出的图片/视频渲染：确认可用（无需改动）

代码路径完整且经既有验证：
- 图片：app-server `imageGeneration`（base64/data URL）或 `imageView`（path）→ 清洗器持久化为本地文件 → v2 normalizer `imageView` → `message.images` → `<img>`（`message-generated-image-preview` 大图）；有独立测试文档 `assistant-generated-image-rendering.md`。
- 视频：`imageGeneration` 携带 `data:video/*`（mime_type 为视频）→ round-37 清洗器落盘为 `.mp4/.webm` → `imageView` path → `message.images` → round-37 的 `<video>` 渲染（与用户消息共用同一渲染循环）。
- markdown `![](video.mp4)` / `![](image.png)` 内嵌媒体同样支持。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：342 通过 + 2 环境性失败（POSIX 权限断言，Windows 基线已知失败）。新增 1 例 `codexGateway.test.ts`（忽略目录过滤）。
- 浏览器实测：`@re` 建议不再含 `.git` 条目；发送图片/视频均在消息列表渲染；测试线程中 2 条因模型 429 限流失败的测试消息已通过回滚清理，线程恢复原状。

## 涉及文件

- `src/api/codexGateway.ts`（`isIgnoredFileSearchPath` + 两处过滤应用）
- `src/api/codexGateway.test.ts`（新增过滤用例）
- `tests/chat-composer-rendering/composer-at-file-mention-uses-server-fuzzy-search.md`（补充 round-38 条目）
- `codex-mobile-handover/rounds/round-38-feedback.md`（本文档）

## 提交

- 待提交（`round-38` 修复）→ 已提交：`e6dd743`/`b62bf3e`，随 v0.1.94 推送
