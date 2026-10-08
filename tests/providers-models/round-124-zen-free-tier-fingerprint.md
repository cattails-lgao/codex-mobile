# OpenCode Zen free tier works with the client fingerprint (round-124)

## 背景 / 为什么改

上游 2026-09 起把 Zen 免费档收紧成**递进式客户端指纹门**（详见 round-123 文档 §二）。插件的 `zenProxy` 伪装停在旧形状上，导致两类用户都拿 403 `FreeTierError`：

- **不登录的新用户**走默认兜底时一发言就 403 —— round-123 已用「默认兜底换源 OpenRouter」规避（那是「换一条路」）；
- **仍显式选了 Zen 的用户**（Settings 里选 `opencode-zen`）同样 403 —— 只能靠本轮的指纹修复（这才是「把这条路修通」）。

round-124 补齐三段指纹：UA 版本 ≥ `1.18.0`、规范 `ses_` session（12 hex + 14 base62）、请求体 `stream: true` 且 `tools` 含 `bash`/`read` 名字。

## 前置条件

- 本机 Codex CLI 可用；`CODEX_HOME` 指向**隔离目录**（用例会写 `webui-custom-providers.json`，别指向真实 home）。
- 外网可达；本机走 TUN/代理时探针须 `NO_PROXY='*'`。
- **无需真实凭据**：免费档用字面量 `public` 作 token。

## 用例 1：带工具的非流式请求返回 200 与真实内容

把**真实的** `handleZenProxyRequest` 挂在本地端口，发一个**带工具的 Codex 风格** Responses 请求（`stream: false`）：

```js
const proxy = createServer((req, res) => handleZenProxyRequest(req, res, '', 'responses'))
// POST /v1/responses { model: 'big-pickle', stream: false,
//   input: […], tools: [{ type: 'function', name: 'exec_command', … }] }
```

**期望**：HTTP 200，`output` 含 `{ type: 'message', content: [{ type: 'output_text', text: 'PONG' }] }`（真实模型输出）。

**改前行为（对照）**：`403 FreeTierError: … OpenCode's free tier can only be used from within OpenCode`。

## 用例 2：带工具的流式请求返回 SSE 且含 `response.completed`

同上，`stream: true`。

**期望**：HTTP 200，响应文本含 `response.completed`。

## 用例 3（最容易漏的一条）：带工具的请求不得因「上游必回 SSE」而 502

指纹要求 `stream: true` ⇒ 上游**必定**返回 SSE；而带工具时走的是**非流式分支**。若没有 SSE 聚合，该分支的 `JSON.parse` 对 SSE 必然抛错 → 502。

**期望**：HTTP 200，且 `output` 里既有 `function_call`（分片 `arguments` 拼接正确）也有文本 —— **不是** 502、也不是空补全。

## 用例 4：桩是追加、不是替换（保留调用方工具与 `tool_choice`）

**期望**：`applyZenFingerprintToChatRequest` 之后，`tools` 同时包含**调用方原本的工具**与 `bash`/`read`；`tool_choice` 原样保留（实测 `'auto'` 与不传都能过闸门，故无需强制 `none`）；重复调用不产生重复桩。

## 用例 5：指纹再次过期时的症状（诊断用）

若上游再提高门槛，症状会是：

| 触发点 | 症状 |
| --- | --- |
| 版本段 | `426 UpgradeRequired: OpenCode X.Y.Z or newer is required to use the free tier` |
| session / stream / 工具段 | `403 FreeTierError: … can only be used from within OpenCode` |
| 具体模型下线 / 地区限制 | `400`/`500`/`503 Endpoint is unavailable`，或 `403 RegionError` |

排查入口（逐个变体定位是哪一段）：`NO_PROXY='*' node tmp/probe-zen-plan.cjs`。

## 备注

- `OPENCODE_ZEN_MIN_CLIENT_VERSION` 是**硬编码快照**，上游提高门槛后须人工同步（常量注释已写明）。
- round-123 的手测章节与本条互补：那条管「新用户走哪条路」，本条管「Zen 这条路本身能不能通」。
- 桩会让模型看到 `bash`/`read` 两个本不该调用的工具；本轮未做响应侧过滤（见 round-124 §六②）。
