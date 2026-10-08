# Default free-mode fallback seeds OpenRouter (round-123)

## 背景 / 为什么改

「没登录、也没在 `config.toml` 里写 `model_provider`」的用户会走插件播种的默认免费兜底。改前它播种 **OpenCode Zen**，而上游 2026-09 起把 Zen 免费档收紧成客户端指纹门（详见 round-123 文档 §二），插件的 `zenProxy` 伪装停在旧形状上 ⇒ **这类用户一发言就是 `FreeTierError` 403**，默认给的其实是一条死路。

改成播种 **OpenRouter 社区免费池**（`freeMode.ts` 里那批 XOR 混淆 key），实测可用。

判定语义未变：仍只在「**无可用 auth 且用户没在 `config.toml` 里显式写顶层 `model_provider`**」时才播种。

## 前置条件

- 本机 Codex CLI 可用；`CODEX_HOME` 指向一个**隔离目录**（下面的用例会写 `webui-custom-providers.json`，别指向真实 home）。
- 外网可达；本机若走 TUN/代理，探针须 `NO_PROXY='*'`。

## 用例 1：无 auth、无显式 provider → 播种 OpenRouter

1. 准备临时 home：目录里**不要**有 `auth.json`，`config.toml` 里**不要**写顶层 `model_provider`。
2. 起服务：`CODEX_HOME=<临时home> node dist-cli/index.js -p 4390 --no-password --no-tunnel --no-open --no-login`
3. 读状态：

```bash
curl -s http://127.0.0.1:4390/codex-api/free-mode/status
```

**期望**：`enabled: true`、`provider` = `openrouter`、`currentModel` = `openrouter/free`、`keyCount` > 0、`hasCodexAuth: false`。

**改前行为（对照）**：`provider` = `opencode-zen`，且此时发消息会拿到 `403 FreeTierError`。

## 用例 2：用户显式写了 provider → 不播种（不能被覆盖）

1. 临时 home 的 `config.toml` 写入：

```toml
model = "deepseek-flash"
model_provider = "custom"

[model_providers.custom]
name = "litellm"
base_url = "http://127.0.0.1:4460/v1"
wire_api = "responses"
```

2. 重复用例 1 的第 2、3 步。

**期望**：`provider` 不是 `openrouter`；插件不得改动用户的显式选择（`hasExplicitCodexModelProviderConfigSync` 判真即直接返回 `current`）。

## 用例 3：有可用 Codex 登录 → 不播种

1. 临时 home 放一个含 `tokens.access_token` 的 `auth.json`。
2. 重复用例 1 的第 2、3 步。

**期望**：社区免费被抑制（`shouldSuppressCommunityFreeModeForCodexAuth`），返回 `{ enabled: false, … }` 的兜底状态 / `null`。

## 用例 4：模型清单不含已下架 slug

Unit 无法覆盖（清单会随上游目录漂移，断言清单等于制造必假失败）。验证口径是**真调用**：

```bash
NO_PROXY='*' node tmp/probe-openrouter-models.cjs      # OpenRouter 候选，逐个真调
NO_PROXY='*' node tmp/probe-zen-free-models.cjs        # Zen 免费档（需三段指纹，见 round-123 §2.2）
```

**期望**：`FALLBACK_FREE_MODELS` 的每一项在 OpenRouter 侧返回 200；Zen 兜底清单的每一项在 Zen 侧返回 200 或明确的地区/下线错误（**不接受静默 404**）。

## 备注

- `provider` 的合法值：`openrouter` / `custom` / `opencode-zen`。本用例只断言默认播种不再选 `opencode-zen`，**不代表移除**了 Zen 选项（用户仍可在 Settings 里显式选它，见 round-123 §2.4）。
