# Round-40：发送图片模型无法理解——zen-proxy 丢弃图片修复（2026-08-12）

> **背景：** 用户反馈：发送图片时，模型无法理解图片（此前在「需求」线程发图，模型回复「图片内容无法直接读取」）。

## 根因链

1. 前端把图片以 `{ type: 'localImage', path }` 传给 app-server（`turn/start`）。
2. app-server 正确读取文件并转换为 Responses API 的 `input_image`（base64 data URL）——app-server 日志证实请求体含 `{"type":"input_image","image_url":"data:image/jpeg;base64,..."}`。
3. **zen-proxy（我们的 bridge，`unifiedResponsesProxy.ts`）把 Responses 载荷转成 chat-completions 格式时，`content` 数组只提取 `part.text`，`input_image` 的 `image_url` 被完全丢弃**——模型只收到 app-server 放在 `input_text` 里的文本占位符（`<image name=[Image #1] path=...>`），看不到图片像素 → 回复「无法直接读取图片」。
4. 顺带确认：429 限流是全局限流（纯文本也 429），与图片无关；但模型「看不懂图」的根因就是第 3 步的丢弃。

## 修复

`src/server/unifiedResponsesProxy.ts`：
- `ResponsesApiInput.content` 与 `ChatMessage.content` 类型扩展支持 `image_url` 字段与多模态 content 数组。
- `responsesInputToMessages` 的 message 分支：`content` 数组遍历时保留 `input_text → { type: 'text', text }` 与 `input_image → { type: 'image_url', image_url: { url } }`；含图片时输出多模态 content 数组，纯文本数组仍扁平化为原字符串（保持既有行为与测试）。
- `appendAssistantText`/输出序列化处的 content 拼接加 `typeof === 'string'` 守卫（兼容新联合类型）。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：345 通过 + 2 环境性失败（POSIX 权限断言，Windows 基线已知失败）。新增 `unifiedResponsesProxy.test.ts` 2 例（input_image → image_url 保留、纯文本数组扁平化）。
- 端到端：发送带图消息后请求体确认含 `input_image`（app-server 日志）；zen-proxy 走 `responsesInputToMessages`（`responsesPayloadFormat: 'chat'` 路径）确认修复生效。模型真实视觉回复待限流恢复后由用户验证（当前 opencode-zen 429）。
- 清理：`[Image]` 线程测试 turn 已回滚、线程名恢复 `[Image]`。

## 涉及文件

- `src/server/unifiedResponsesProxy.ts`（input_image 保留为 image_url）
- `src/server/unifiedResponsesProxy.test.ts`（新增 2 例）
- `tests/chat-composer-rendering/inline-thread-image-payloads-are-rewritten-to-renderable-local-file-urls.md`（补充 round-40 条目）
- `codex-mobile-handover/rounds/round-40-feedback.md`（本文档）

## 提交

- 待提交（`round-40` 修复）
