# Round-25：OpenCode Zen reasoning_content 往返修复（2026-08-09）

> **2026-08-09 进展：** 修复多轮对话中 OpenCode Zen（DeepSeek thinking 模式）报 `The reasoning_content in the thinking mode must be passed back to the API`（400 invalid_request_error）的问题。根因、复现与分析过程见下，修复已提交并推送（commit `1dd4815`）。验证：单测 `unifiedResponsesProxy.test.ts` 7/7 通过（新增 1 例）、全量单测 311/313（2 个失败为既有 Windows 环境性失败）、`vue-tsc --noEmit` 通过、真实复测一遍通过。

## 现象

多轮对话（单 turn 内连续多次工具调用）进行到中后段时，请求以 400 失败：

```json
{"error":{"param":null,"type":"invalid_request_error","code":"invalid_request_error","message":"Error from provider (Console): Upstream request failed: [invalid_request_error] The `reasoning_content` in the thinking mode must be passed back to the API."}}
```

注意错误里的 provider 是 `Console`（非早前记录的 `DeepSeek`），说明 OpenCode Zen 上游网关已更换，旧代理逻辑未覆盖新网关行为。

## 根因

请求链路：浏览器 → 本地 app-server（codex-cli 0.146.0，provider `opencode-zen`，wire_api=responses）→ 本地 Zen 代理（`zen-proxy`，`src/server/zenProxy.ts` → `unifiedResponsesProxy.ts`）→ OpenCode Zen 上游。上游 `big-pickle`/`deepseek-v4-flash-free` 是 DeepSeek thinking 模式模型，要求多轮请求中每条 assistant 消息的 `reasoning_content` 原样回传，缺失即拒绝。

用 `CODEXUI_PROXY_DEBUG=1` 抓取失败请求（模型 `deepseek-v4-flash-free`，24 条 messages）逐一比对，发现 [17]/[21] 两条**带工具调用、content 为空的 assistant 消息缺失 `reasoning_content` 字段**，其余 assistant 消息均带。对照会话 JSONL：这两次工具调用（`$c[281..455]` 读文件尾段、`Get-Content test_renamer.py`）在记录中**前面没有独立的 reasoning 事件**——上游连续发多个 function_call 时 reasoning 只跟随第一个。

代码根因在 `src/server/unifiedResponsesProxy.ts` 的 `responsesInputToMessages()`：reasoning item 只进入 `pendingReasoningContent`（由下一个 function_call 消费并随即清空）；当某次 function_call 前没有独立 reasoning item 时，`pendingReasoningContent` 为空，生成的 assistant 消息不带 `reasoning_content` 字段，被新网关（Console）拒绝。

## 修复

`src/server/unifiedResponsesProxy.ts`：

- 新增 `lastReasoningContent` 变量，reasoning item 处理时同步记录最近一次 reasoning 文本
- `function_call` 分支改为 `pendingReasoningContent || lastReasoningContent`：连续工具调用（无新 reasoning）时沿用前一次的 reasoning 文本，保证每条带工具调用的 assistant 消息都带 `reasoning_content`（thinking 模式下思考语义连续，正确）

`src/server/unifiedResponsesProxy.test.ts`：新增用例「连续工具调用（无新 reasoning item）第二条仍保留 `reasoning_content`」，锁定该场景。

## 验证

- 单测：`pnpm vitest run src/server/unifiedResponsesProxy.test.ts` 7/7 通过
- 全量：`pnpm vitest run` 311/313 通过（2 个失败为既有 Windows 环境性失败：`codexAppServerBridge.archive.test.ts` 的 symlink EPERM 与 chmod 权限位，与本次改动无关）
- 类型：`pnpm exec vue-tsc --noEmit` 通过（EXIT=0）
- 实测：修复后重跑同一多命令任务一遍通过，无 `reasoning_content` 报错

## 环境注意

- 本环境 git 不在 PATH（位于 `E:\Git\cmd\git.exe`）；GitHub 直连本次可用，代理端口 10808/10811/10812 均已失效（进程退出），按交接文档记录直连推送即可
- 抓包调试：`CODEXUI_PROXY_DEBUG=1` 启动 dev server 后，代理失败请求会输出完整 request/response 到 dev 终端（`[unified-responses-proxy]` 前缀）
- 排查线索：失败请求的 payload 可从 dev 终端日志提取，比对 messages 数组中各 assistant 消息的 `reasoning_content` 字段即可定位丢字段的消息
