# Round-41：自定义端点"没用"修复——URL 归一化 + 模型自动解析（2026-08-12）

> **背景：** 用户反馈：左侧边栏设置 → 模型与提供商 → 自定义端点，配置后好像没用（对话无法使用）。

## 根因

1. **URL 路径重复**：用户在自定义端点 URL 里填了**完整端点**（`https://opencode.ai/zen/go/v1/chat/completions`），而代码（`customEndpointProxy.ts` 的 `joinEndpoint`、provider-models 的 `/models` 拼接）会在 baseUrl 后**再拼** `/chat/completions` 或 `/responses`/`/models` → 变成 `.../chat/completions/chat/completions`（404）与 `.../chat/completions/models`（404）→ `/models` 拉取失败、对话请求 404 → "没用"。
2. **model 为空**：`fetchCustomEndpointDefaultModel` 因 /models 404 返回空 → `getFreeModeConfigArgs` 的 custom 分支不传 `model` 参数 → app-server 无法正常发请求。
3. **无失败提示**：保存接口始终返回 `{ ok: true }`，前端无法得知 model 未解析，用户以为配置成功了。

## 修复

- `src/server/codexAppServerBridge.ts`：新增 `normalizeCustomEndpointBaseUrl`，保存 `/codex-api/free-mode/custom-provider` 时自动剥离用户误填的尾部 `/chat/completions`、`/responses` 路径段（含尾斜杠处理），得到真正的 base URL → `/models` 与运行时请求路径全部正确。
- `src/App.vue`：`saveCustomEndpoint` 保存后检查 `status.currentModel`，自定义端点为空时显示提示「无法从自定义端点获取模型，请检查 URL 后重试」（i18n 键已加中英文）。
- 单测：`normalizeCustomEndpointBaseUrl` 4 例（完整 chat/completions 路径、responses 路径+尾斜杠、已是 base、空白/尾斜杠修剪）。

## 补充修复（模型列表只显示一个）

用户反馈「选择的自定义端点怎么只有 minimax-m3」：`provider-models?provider=custom_endpoint` 走 provider catalog 路径，其 base_url 是本地 custom-proxy（无 `/models` 路由）→ 拉取失败返回空 → 前端 `requireProviderModels` 只回退追加配置的 `model`（minimax-m3）一项。

- `src/server/codexAppServerBridge.ts`：`provider-models?provider=...` 时先按 free-mode 状态解析——custom 端点（`custom-endpoint`/`custom_endpoint`）用真实 `customBaseUrl` 拉 `/models`；opencode-zen / openrouter 同理。前端将 provider id 归一化为连字符（`custom_endpoint`→`custom-endpoint`），匹配时两种拼写都接受。
- 抽公共函数 `fetchCustomEndpointModelIds(customBaseUrl, apiKey)`，供 provider 分支与无 provider 分支复用。
- `src/server/freeMode.ts`：导出 `FREE_MODE_RUNTIME_PROVIDER_ID`、`CUSTOM_RUNTIME_PROVIDER_ID`、`OPENCODE_ZEN_RUNTIME_PROVIDER_ID`。

## 验证

- `vue-tsc --noEmit` 通过；`pnpm run test:unit`：349 通过 + 2 环境性失败（POSIX 权限断言，Windows 基线已知失败）。新增 4 例 normalize 测试。
- 端到端（自定义端点 `https://opencode.ai/zen/go/v1/chat/completions` + key + Completions 格式）：
  - 保存后状态文件 `customBaseUrl=https://opencode.ai/zen/go/v1`、`model=minimax-m3`（此前为空）。
  - provider-models 返回 25 个模型（minimax-m3、kimi-k3 等）。
  - 新建线程发送「回复OK」：minimax-m3 经自定义端点正常回复（无 429/404）。
  - 设置面板回显归一化 URL（`https://opencode.ai/zen/go/v1`）。

## 备注（环境发现）

- 测试线程（019ff628/019ff634）的 rollout 文件缺失（不在 sessions 目录，但 state db 有记录），app-server 对其 `thread/delete`/`archive` 返回 `thread not found`（502）。属测试残留数据不一致，不影响正常线程（round-40 的 rollback 正常）。测试线程已不在 thread/list 中显示，无需清理。
- 机器上另有一个 litellm 实例（127.0.0.1:4460），与本次修复无关。

## 涉及文件

- `src/server/codexAppServerBridge.ts`（normalizeCustomEndpointBaseUrl + 保存接线）
- `src/server/codexAppServerBridge.inlinePayload.test.ts`（新增 4 例）
- `src/App.vue`（保存后 model 空提示）
- `src/composables/useUiLanguage.ts`（提示文案 i18n）
- `codex-mobile-handover/rounds/round-41-feedback.md`（本文档）

## 提交

- 待提交（`round-41` 修复）
