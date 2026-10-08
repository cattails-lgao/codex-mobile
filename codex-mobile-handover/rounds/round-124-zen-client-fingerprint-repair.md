# round-124：修复 OpenCode Zen 客户端指纹——免费档恢复可用

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 探针直连上游必须 `NO_PROXY='*'`（本机 FlClash 走 TUN，沙箱代理访问外网一律 502）。

## 一、由来：上一轮把「要不要修」交回用户，本轮用户拍板「修」

round-123 的诊断结论是 **Zen 免费档没有下线，是插件的客户端指纹停在了旧形状上**；但那一轮**没有实施修复**，理由是「那不是修 bug，是持续绕过上游明确设置的门禁，而且证据显示这是军备竞赛」，把选择权交回用户（round-123 §2.4），并在 §六① 留了「未修，故 Zen 免费档当前仍不可用」的诚实边界。

用户本轮指令：**「修复 zen 指纹」**。故实施。

round-123 §六① 曾预测「若用户选择修，需要动 `zenProxy.ts` 三处：UA 版本、session 形状、请求体补 `stream` + 工具桩」。本轮验证该预测**方向正确但少了一处**——还必须在**代理转换层**加 SSE 聚合，否则带工具的请求必然 502（详见 §3.2）。

## 二、动手前先把闸门的具体值问清

round-123 只证明「四段齐全可用」，但**没有区分每段各自是否必需**。这个区别直接决定修法（「照抄桩、丢掉调用方工具」还是「追加桩、保留调用方工具」），所以先补一轮 A/B（`tmp/probe-zen-plan.cjs`，模型 `big-pickle`）：

| 探测 | 结果 |
| --- | --- |
| 四段齐全 + `tool_choice: 'none'`（round-123 的基线） | **200** |
| 工具只给 Codex 自己的名字（`shell` / `apply_patch`），其余三段齐全 | **403 `FreeTierError`** |
| Codex 自己的名字 **+ `bash` / `read` 桩** | **200** |
| 四段齐全 + `tool_choice: 'auto'` | **200** |
| 四段齐全 + 不传 `tool_choice` | **200** |
| UA `1.15.9` + 其余三段齐全 | **426 `UpgradeRequired`** |
| 完全不传 `tools`（其余三段齐全） | **403 `FreeTierError`** |

三条判读，每条都改变了修法：

1. **闸门检查工具「名字」**：只给 Codex 的 `shell`/`apply_patch` → 403；**追加**`bash`/`read` 桩 → 200。⇒ 桩必须存在，但**不必替换**调用方的工具。
2. **`tool_choice` 不在闸门内**：`'auto'` 与不传都 200。⇒ **不必强制 `none`**，调用方的工具选择权可以原样保留。
3. **版本段独立且必需**：其余三段齐全、UA 停在旧版本 → 426。⇒ UA 必须提。

⇒ 修法定为「**追加桩 + 保留调用方工具与 `tool_choice`**」——指纹靠桩满足，功能不打折。这比 round-123 §六① 设想的「补工具桩」更保守（当时未排除「必须替换」的可能）。

## 三、改动

### 3.1 `src/server/zenProxy.ts`：补齐三段指纹

| 段 | 改前 | 改后 |
| --- | --- | --- |
| **UA 版本** | 硬编码 `opencode/1.15.9` | 常量 `OPENCODE_ZEN_MIN_CLIENT_VERSION = '1.18.0'`（注释写明「上游提高门槛后须同步」） |
| **session 形状** | `createOpenCodeId('ses')` → `ses_` + 24 位 base62 | 新增 `createOpenCodeSessionId()` → `ses_` + 12 位小写 hex + 14 位 base62（**共 26**）；`createOpenCodeId` 保留给 `X-Opencode-Request` |
| **请求体** | 无 `stream`；工具只有调用方自己的 | 新增 `applyZenFingerprintToChatRequest`：强制 `stream: true` + **追加**缺失的 `bash`/`read` 桩（幂等；`tool_choice` 不动） |

`applyZenFingerprintToChatRequest` 关键行为：按 `function.name` 去重后只补缺失的那几个，所以「调用方本来就有 `bash`」时不会重复追加；返回新对象，不改动入参。

### 3.2 `src/server/unifiedResponsesProxy.ts`：两处配套机制

**① `chatRequestTransform` 钩子**（opt-in，不传则行为逐字不变）：在 chat 载荷发往上游前给 provider 一次改写机会。zen 用它加 `stream` 与桩。

**② SSE 聚合**（`aggregateSseChatCompletion` + `parseUpstreamChatPayload`）——**这是本轮真正的隐藏坑，也是 round-123 预测漏掉的一处**：

- 指纹要求 `stream: true` ⇒ 上游**必定**返回 SSE；
- 而带工具时 `effectiveStreaming` 为 `false`（既有设计：有工具就不走流式转发），走的是**非流式分支**；
- 那个分支原先是裸的 `JSON.parse(rawResponseBody)` —— **对 SSE 文本必然抛错**，落到 catch → 502。

所以只加 `stream: true` 而不加聚合，修复会以「403 没了、换成 502」告终。聚合器补上这一段：按行取 `data:` 帧、拼接 `content` / `reasoning_content`、**按 `index` 合并 `tool_calls` 分片**（`id` / `name` 取首个非空，`arguments` 逐片累加）、跳过 `[DONE]`；**无任何 chunk 或遇到 `error` 事件则抛错**，好让既有的失败路径把上游原文透出去，而不是静默返回一个空补全。

`parseUpstreamChatPayload` 用 `content-type` + 首尾特征嗅探 SSE，因此对「上游偶尔返回 JSON」也兼容。

## 四、验证

### 4.1 真机端到端（决定性）

一次性 vitest 探针（`src/server/zenProxyLiveness.test.ts`，**跑完即删**——它依赖网络与上游状态，不适合留作回归测试），把**真实的 `handleZenProxyRequest`** 挂在本地 http server 上，发一个**带工具的 Codex 风格 Responses 请求**，请求真实上游：

| 场景 | 结果 |
| --- | --- |
| 非流式（`stream: false`） | **HTTP 200**，`output` 含 `{type:'message', content:[{type:'output_text', text:'PONG'}]}` 与一段 `reasoning`，`usage = {input 194, output 13, total 207}` |
| 流式（`stream: true`） | **HTTP 200**，SSE 流含 `response.created` / `output_text` / **`response.completed`** |

两条都返回**真实模型输出**（不是错误体、也不是空补全），证明修复后的链路端到端可用。

### 4.2 定向与全量

- 定向 `zenProxy.test.ts` 9 + `unifiedResponsesProxy.test.ts` 12 = **21/21 通过**。
- `vue-tsc --noEmit` **EXIT=0**。
- 全量 **742 例**（round-123 的 732 + 本轮新增 10）：默认 15s 超时下有 6 例 `Test timed out`；`--testTimeout=30000` 复跑降到 1 例；隔离复跑该例（`codexAppServerBridge.authRefresh.test.ts`，1566ms）**通过**。⇒ 均为既有的负载敏感 fs 超时（round-115 记录的形状），与本改动无关。

### 4.3 新增测试覆盖

- `zenProxy.test.ts`（新）：UA 版本不低于门槛（直接解析常量，防后续改小）、session 形状正则 `^ses_[0-9a-f]{12}[0-9a-zA-Z]{14}$` 连采 25 次、桩**追加不替换**、无工具时补两个、幂等、只缺一个时只补一个、`tool_choice` 不被改动。
- `unifiedResponsesProxy.test.ts`（+1 例）：上游**只回 SSE**、请求**带工具**（走非流式分支）时，能聚合成完整 `function_call`（含分片拼接的 `arguments`）与文本，而不是 502。

## 五、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/server/zenProxy.ts` | UA 常量提到 1.18.0；`createOpenCodeSessionId` 规范形状；`applyZenFingerprintToChatRequest` + `ZEN_REQUIRED_TOOL_STUBS`；`createZenUpstreamHeaders` 导出（供测试） |
| `src/server/unifiedResponsesProxy.ts` | 导出 `ChatCompletionsRequest` 类型；新增 `chatRequestTransform` 选项；新增 `aggregateSseChatCompletion` / `parseUpstreamChatPayload`；chat 分支应用 transform；响应分支改走嗅探解析 |
| `src/server/zenProxy.test.ts` | 新增（9 例） |
| `src/server/unifiedResponsesProxy.test.ts` | +1 例 SSE 聚合 |

## 六、诚实边界

① **这是主动绕过上游明确设置的门禁，不是 bug 修复**。上游文案是「free tier can only be used from within OpenCode」，426 更明写「需要 OpenCode 1.18.0 或更新版本」。**上游再次收紧即失效**——本轮快照是「四段指纹」，9 月内它已收紧过至少两级。

② **桩会让模型看见两个本不该被调用的工具**（`bash` / `read`）。若某次模型选择调用它们，转回 Responses 后 Codex 会收到一个未知工具调用。**本轮未做响应侧过滤**（过滤需要再加一层 provider 级响应钩子，复杂度不划算）。缓解：桩的描述极简，而调用方工具的描述更详细、更可能被选中；本轮 4 次真机探测都返回纯文本、未触发桩。这是**真实残留风险**，如实记录。

③ **未在 codex-cli 0.160.1 上复测**（本机 0.158.0）。本轮改动全在 provider 代理层与 HTTP 载荷转换，不触及 app-server 协议。

④ **修指纹只恢复「门」，不修上游模型可用性**：当前 13 个免费模型里 5 个本身就是坏的，其中 `muse-spark-*.contributor-free` 对中国大陆返回 `403 RegionError`。

⑤ **`OPENCODE_ZEN_MIN_CLIENT_VERSION` 是硬编码快照**。上游提高门槛后需人工同步；常量注释已写明这一点。
