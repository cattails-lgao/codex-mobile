# 问题：Zen Proxy 丢弃多 Agent Namespace 工具

**状态：** 已修复并真机验证通过（namespace 工具被模型实际调用、回包 namespace 字段正确恢复）；CP8 全流程验收待实跑
**发现日期：** 2026-08-21  
**影响：** CP8 拆分工作流无法执行子 agent 到单候选 agent 的调度

### 验证记录（2026-08-21）

经 `pnpm run dev`（Vite dev server，被占用故落在 4174）对
`/codex-api/zen-proxy/v1/responses` 发送带 `multi_agent_v1` namespace 工具的
Responses 探针，经真实上游 `https://opencode.ai/zen/v1/chat/completions` 返回：

```json
{"type":"function_call","name":"spawn_agent","call_id":"call_-7328864024173472807","arguments":"{\"instruction\":\"return string ok\"}","status":"completed","namespace":"multi_agent_v1"}
```

`name` 已还原为 `spawn_agent`、`namespace` 已恢复为 `multi_agent_v1`，证明：
1. 展开后的 `multi_agent_v1.spawn_agent` 被真实模型识别并调用（修复前 namespace
   工具被整体丢弃，模型不可能调用到）；
2. 回包转换正确恢复 namespace 字段，避免 `unsupported call` 路由错误。

## 现象

在当前 Codex WebUI 会话中：

1. 主会话能够调用 `spawn_agent` 创建 CP8 编排 worker。
2. worker 会话未获得 `spawn_agent`、`wait_agent`、`send_input`、
   `close_agent`。
3. worker 因此无法按 `wq-diagnostician` 的 Step 2 调度
   `wq-candidate-diagnostician`，最小批候选 `1Ypm9K0m` 未生成报告。

已做三次无副作用探针，均复现子会话缺少嵌套 agent 生命周期工具。未调用
BRAIN API，CP8 有效进度保持 `14/668`。

## 实际请求链路

当前 `codexapp.service` 启动的 app-server 使用：

```text
Codex app-server
  -> http://127.0.0.1:3030/codex-api/zen-proxy/v1/responses
  -> https://opencode.ai/zen/v1/chat/completions
```

这不是 `/root/.codex/config.toml` 中 `4460` LiteLLM 的直连路径。LiteLLM 的
`fix_hook` 虽已加载，但不会处理经过 `zen-proxy` 的请求。

## 根因

`codex-mobile-re` 的 `handleZenProxyRequest()` 固定使用
`responsesPayloadFormat: "chat"`，把 Responses 请求改写为 Chat 请求。

工具转换函数 `responsesToolsToChatTools()` 只保留顶层
`type: "function"` 工具：

```javascript
if (row.type !== "function") return null;
```

Codex 的多 agent 工具位于 `type: "namespace"`、名称为 `multi_agent_v1` 的
namespace 内。因此其子工具 `spawn_agent`、`wait_agent`、`send_input`、
`close_agent` 在 `zen-proxy` 转换时被静默丢弃，未发送至 OpenCode Zen 上游。

相关源码：

- `/root/.local/share/pnpm/bin/global/5/.pnpm/codex-mobile-re@0.1.101/node_modules/codex-mobile-re/dist-cli/index.js`
  - `responsesToolsToChatTools()`，约第 6088 行
  - `handleZenProxyRequest()`，约第 6512 行

## 修复要求

1. 在 `zen-proxy` 的请求转换中展开 `type: "namespace"` 的子工具为标准 Chat
   `function` 工具。
2. 为每个展开的工具保存本次请求的 `工具名 -> namespace` 映射。
3. 在 Chat 回包转换为 Responses `function_call` 时，根据该请求映射恢复
   `namespace` 字段，避免 Codex 路由出现 `unsupported call`。
4. 不得使用全局固定工具名表；映射必须为请求级，兼容 `multi_agent_v1` 与未来
   namespace。

## 验收

修复后，在同一实际路由和模型下执行无副作用探针：

1. 主会话 `spawn_agent` 创建子 agent。
2. 子 agent 列出并成功调用 `spawn_agent` 创建孙 agent。
3. 孙 agent 返回固定文本。
4. 子 agent `wait_agent`、`send_input`、`close_agent` 均成功。
5. 主会话回收子 agent。

通过后重新执行 CP8 最小批候选 `1Ypm9K0m`，验收正式报告含完整 Step 1-15、
`===CHECK===`、批次反馈和 QC。
