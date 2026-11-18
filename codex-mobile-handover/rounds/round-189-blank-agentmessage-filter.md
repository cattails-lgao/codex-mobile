# round-189：列表渲染出现空白 agentMessage 气泡 —— 上游 provider「空格保活」条目的客户端过滤（2026-11-18）

> 用户报障：线上线程 `01a1d55e-e899-7b23-a6cc-becc1e241de8` 列表渲染出现空的
> `data-message-type="agentMessage"` 元素，无任何显示（`conversation-item-process` 过程区，
> message-text 里只有一个 `<span> </span>`）。

## 一、取证

### 1.1 先排除「数据从来就脏」：11-13 的 rollout 是干净的

SSH 上服务器（`root@1.15.149.204`，本机 `~/.ssh/id_rsa` 可直登）检查该线程的原始 rollout
（`rollout-2026-11-13T22-45-29-01a1d55e….jsonl`，22288 行）：

- `message` 条目 885 条，**assistant 空白文本 0 条**（join 全部 content part 后 `strip()` 为空者）。

⇒ 空白块不是这条 rollout 带来的。**关键发现**：线程在 2026-11-18 被续写过，
产生了**第二个 rollout 文件**（`rollout-2026-11-18T15-14-19-…_01a1ed81….jsonl`），
最新 10 轮页里的 turn 8 就出自它——用户现在看到的是**今天的轮次**。

### 1.2 线上 RPC 实测：`thread/read {includeTurns:true}` 的最新 10 轮页里 63 条 agentMessage 有 44 条空白

```text
turn 8（01a1ed83-…）items 21 条：
  0 userMessage
  1-5 commandExecution ×5
  6 agentMessage text ' '        ← 空白
  7 reasoning
  8 agentMessage text ' '        ← 空白
  9-16 reasoning / 空白 agentMessage 交替
  17-18 reasoning
  19 agentMessage text ' '       ← 空白
  20 agentMessage '1. 我看了这个分享。……'   ← 真正的回复
```

### 1.3 原始形态：content 只有一个空格的 assistant message

续写 rollout 里的原始条目（`msg_ft_74fc94b2…` 等 44 条）：

```json
{ "type": "message", "status": "completed", "id": "msg_ft_…", "role": "assistant",
  "content": [{ "type": "output_text", "text": " ", "annotations": [] }],
  "internal_chat_message_metadata_passthrough": { "turn_id": "01a1ed83-…", "content_item_kinds": ["unknown"] } }
```

上游链路（rollout `turn_context` 实测：本线程三个 rollout 全部 `model: gpt-6.1-sol`；litellm `/etc/litellm/config.yaml`
里 `gpt-6.1-sol` → `os.environ/HS_LIFE_BASE_URL` 原生 Responses 透传）：
**codex → litellm（本机网关）→ hslife `gpt-6.1-sol`**。`msg_ft_` 前缀 + `content_item_kinds: ["unknown"]` ⇒
**hslife 上游**在工具调用间隙吐出的**空格保活/分隔 message**，litellm 原样透传、codex 原样持久化。
app-server 物化后变成 `text: " "` 的 agentMessage。初查曾误判为「litellm 一类」（错把 config.toml 的
默认模型 `deepseek-v4.1-flash-go` 当成本线程模型），2026-11-18 当日据 `turn_context` 更正为 hslife。

### 1.4 为什么渲染成空气泡而不是被收口

客户端归一化链路对空白 agentMessage **没有过滤**（`toUiMessages` 的 agentMessage 分支无条件返回；
对比：reasoning 分支早有 `if (!text) return []`）。而 `transcriptGrouping.ts isFinalAssistantItem`
要求 `message.text.trim().length > 0` ⇒ 空白条目**永远不参与 final 提升**，只能留在过程区
（`section === 'process'`）渲染 —— 与用户截图的 DOM 形态（`conversation-item-process` + 空 message-text）完全一致。

## 二、修法（两处，`814cab6e`）

1. **`src/api/normalizers/v2.ts` `toUiMessages`**：agentMessage `text.trim()` 为空直接 `return []`
   ——resume / read / 上翻 / revert 补水全部走这条路，是所有加载入口的共享收口。
2. **`src/composables/useDesktopStateReaders.ts` `readAgentMessageCompleted`**：
   `item/completed` 的空白 agentMessage 不进 live 列表（`!text.trim()` 与缺文本同等对待），
   否则 turn 完成前的窗口会闪出空气泡。

## 三、验证

- `vue-tsc --noEmit` 0 错。
- 全量单测 **1115/1115（101 文件，+2 例）**：v2.test.ts「空白三态（`' '` / `''` / `' \n\t '`）丢弃 +
  有内容保留」；useDesktopState.test.ts「空白 completed 通知不产生消息」。
  （第一遍全量跑遇到一次 vitest worker 启动超时的基础设施抖动，`toolAggregation.test.ts` 未入池；
  单独补跑 12/12 过，第二遍全量全绿。）

## 四、诚实边界

1. **服务端数据未动**：44 条空白 message 仍留在 rollout 里（本仓修不了 app-server 的物化行为）；
   过滤只在客户端。Codex Desktop / CLI 等其他客户端看同一线程仍会看到空白块。
2. **旧快照残留一次**：`thread-message-snapshot.v1` 先上屏路径**不过归一化**（round-178 设计如此），
   修复前保存的快照若含空白条目，重开线程瞬间还会画一次；RPC 返回 merge 后收敛
   （服务端不再回空白 ⇒ 下次覆盖快照时消失）。
3. **live 流式中间态不拦**：delta 通道累积出「纯空格」的 `.live` 消息在流式过程中仍可能短暂出现
   （与 1.4 的最终态不同，live 尾部随下一个 delta 被改写，不值得为它加节流）。
4. **线上未部署**：修复在本地 `main`，线上（0.1.137）要随下一次发版才生效。
5. **provider 侧未反馈**：`msg_ft_` 空格保活是上游 provider 行为，未在 unifiedResponsesProxy 等
   代理层拦（本仓的代理只服务自定义端点路径，这条线程走的是 provider 原生通道）。

## 五、提交清单

| 提交 | 内容 |
| --- | --- |
| `814cab6e` | fix(render): 丢弃空白 agentMessage（v2.ts + useDesktopStateReaders.ts + 两测试） |
