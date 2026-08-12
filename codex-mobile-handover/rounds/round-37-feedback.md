# Round-37：回收站线程名丢失 + 文件面板树形结构 + 消息列表视频预览（2026-08-12）

> **背景：** 用户提出三个需求/问题：
> 1. 左侧边栏回收站列表的线程没有名称；
> 2. 右侧边栏文件面板为什么不是树形结构；
> 3. 能否在消息列表中预览图片或视频。

## 1. 回收站线程名丢失（Bug 修复）

**根因：** `SidebarThreadTree.vue` 的 `deleteThreadById` 先把 `threadId` 写入 `optimisticallyArchivedThreadIds`，随后才访问 `threadById` computed。`threadById` 会跳过乐观归档集合中的线程，于是拿到 `null`，回收站记录标题退化为 `(untitled)`、路径为空。

**修复：** 在写入乐观归档集合**之前**先读取线程对象（`const thread = threadById.value.get(threadId)` 前移）。`threadProjectNameById` 不跳过归档线程，所以项目名此前一直正常——这正好印证了根因。

## 2. 右侧文件面板改为真正的树形结构

**原实现：** `RightFilesPanel.vue` 只按顶层目录做「分组 + 平铺文件列表」，嵌套目录的文件没有层级。

**修复：** 基于 `listWorkspaceFiles` 返回的 `relativePath` 构建完整目录树（目录节点 + 文件叶子），按层级缩进渲染，目录可展开/折叠；搜索时自动展开所有命中分支；点击文件仍打开右侧预览。

## 3. 消息列表图片/视频预览（新增视频支持）

图片预览此前已支持；本轮补齐视频：

- **服务端清洗（`codexAppServerBridge.ts`）**：`data:video/*` 内联数据与外置 base64（mp4 ftyp 签名、webm EBML 签名）识别为视频，持久化到本地临时文件（新增 `video/*` → 扩展名映射），经既有 `/codex-local-image` 代理访问。
- **内容类型（`httpServer.ts` + `vite.config.ts` 两份映射）**：新增 `.mp4/.webm/.mov/.mkv/.ogv/.mpeg/.avi` → `video/*`，dev 与打包两种服务路径都能以正确 MIME 提供视频。
- **前端渲染（`ThreadConversation.vue`）**：`message.images`、markdown 内嵌媒体、预览弹窗三处都按 URL 识别视频（扩展名 / `data:video/` / `/codex-local-image?path=...` 查询参数），渲染 `<video controls>`；`sanitizeHtml` 白名单加入 `video` 标签。
- **composer（`ThreadComposer.vue`）**：视频文件走 `attachVideoFile`——单次上传同时写入媒体预览（`<video>` 缩略）与文件附件；移除时同步移除配对的文件附件。发送时视频保留在 `imageUrls`（供乐观消息显示预览），桥接层 `buildQueuedTurnParams` 跳过视频的 `localImage` 输入（模型无法接收视频作为 input_image，视频仅作为文件附件路径下发），避免 turn 失败。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：341 通过 + 2 环境性失败（`codexAppServerBridge.archive.test.ts` POSIX 权限断言，Windows 基线已知失败，与本次改动无关）。新增视频清洗单测 1 例（`codexAppServerBridge.inlinePayload.test.ts`）。
- 浏览器实测（Playwright/Edge）：
  - 删除线程 → 回收站显示真实标题（如「请规划一个本地 Markdown 笔记管」），不再是 `(untitled)`。
  - 文件面板渲染嵌套目录树（`docs/guide/README.md`、`src/components/*` 按层级缩进），目录可折叠/展开，搜索自动展开。
  - composer 附加 `.webm` → 显示 `<video>` 预览 + 文件 chip；发送后消息列表与点击弹窗均渲染 `<video>`；服务端 `/codex-local-image` 对 `.webm` 返回 `Content-Type: video/webm`；发送 turn 正常执行（视频未作为 input_image 提交）。

> **本轮测试遗留（非仓库文件）**：验证时在 `<外部测试目录>\test\` 下创建了 `src/`、`docs/`、`sample.webm` 等测试文件，因不在仓库允许操作范围（终端安全策略限制在用户目录）未能自动清理，如不需要可手动删除；验证中删除的 3 个线程已全部恢复/清理（回收站已空）。

## 涉及文件

- `src/components/sidebar/SidebarThreadTree.vue`（回收站标题读取顺序）
- `src/components/content/RightFilesPanel.vue`（树形重构）
- `src/components/content/ThreadConversation.vue`（视频预览 + 弹窗 + HTML markdown 渲染）
- `src/components/content/ThreadComposer.vue`（视频附件 + 移除配对）
- `src/server/codexAppServerBridge.ts`（video MIME 识别/清洗 + 发送跳过 localImage）
- `src/server/httpServer.ts`、`vite.config.ts`（视频内容类型映射）
- `src/utils/sanitizeHtml.ts`（白名单加入 `video`）
- `src/server/codexAppServerBridge.inlinePayload.test.ts`（新增视频清洗用例）
- `tests/` 三份手动测试文档更新 + 本文档

## 提交

- 待提交（`round-37` 修复）→ 已提交：`5da850d`/`48ad2a2`/`78a3e1a`/`2de2559`，随 v0.1.94 推送
