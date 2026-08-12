# Round-42：回退后消息回填输入框 + 选择 codex 用 codex-cli 同款模型（2026-08-12）

> **背景：** 用户反馈 2 项：①点击回退，回退的消息没有写到输入框；②设置的模型与端点选 codex，但用的不是 codex-cli 可以用的模型（以前一致）。

## 问题 1：回退后消息未回填输入框

**根因：** round-36（commit `1970a85`）因「回退后未编辑直接重发导致消息复活」移除了回退后的输入框回填（`App.vue onRollback` 删除 `appendTextToDraft`，`ThreadComposer.vue` 删除死代码）。用户当前需求是回退后消息回到输入框方便修改重发（回退确认框文案本就是「以便你编辑消息」）。

**修复：** 恢复回填行为：
- `src/components/content/ThreadComposer.vue`：恢复 `appendTextToDraft(text)`（追加语义，保留已有输入）+ `ThreadComposerExposed` 类型 + `defineExpose` 条目。
- `src/App.vue` `onRollback`：回退前找到点击 turn 的用户消息文本，调用 `appendTextToDraft` 回填，再执行 `rollbackSelectedThread`。

**验证：** 新线程发送「回退测试消息请回复ok」→ 模型回复 ok → 点该消息回退 → Confirm → 线程消息移除，输入框回填「回退测试消息请回复ok」。

## 问题 2：选 codex 用的不是 codex-cli 的模型

**根因：** 用户的 codex-cli 配置在默认 CODEX_HOME（`C:\Users\cattails\.codex\config.toml`）：`model_provider="custom"`、`model="deepseek-v4-flash"`、`[model_providers.custom]` 指向 litellm（`http://127.0.0.1:4460/v1`）。而 app 的 CODEX_HOME（`d:\code\codex-mobile\.codex\config.toml`）只有 projects 信任设置，无模型配置 → app-server 用内置官方模型（gpt-5.5 等，需 OpenAI 登录，本机无 auth.json）→ 与 codex-cli 不一致。

**修复：** 把 litellm provider 配置同步到 app 的 CODEX_HOME `config.toml`（`model_provider/model/model_reasoning_effort` 顶层 key + `[model_providers.custom]` section，与默认 HOME 一致；备份 `.codex/config.toml.bak-round42`）。

**过程中踩坑：** 首次追加时把顶层 key 写在了 `[features]` section 之后，TOML 归属错误 → `invalid configuration: invalid type: string "custom", expected a boolean in features` → 所有写类 RPC 502。已重写 config.toml 修正（顶层 key 放文件顶部）。

**验证：** `config/read` 返回 `model=deepseek-v4-flash, provider=custom, effort=low`（与 codex-cli 一致）；`provider-models` 返回 deepseek-v4-flash；UI 选 Codex 后模型按钮与下拉显示 deepseek-v4-flash；新线程发消息经 litellm 正常回复。

## 补充修复（模型列表仍不对——缺 model_catalog_json + provider-backed 误判）

用户反馈「之前端点选 codex 取的是哪里的？现在模型列表还是有问题」：round-42 只同步了 litellm provider 配置，**漏了 codex-cli 的模型目录 `model_catalog_json`**（`C:\Users\cattails\.codex\models.json`，定义 deepseek-v4-flash / deepseek-v4-pro）→ app-server 的 `model/list` 仍返回内置官方目录（gpt-5.5 等，需 OpenAI 登录用不了）。且前端把 config.toml 的 `model_provider="custom"`（litellm）误判为 provider-backed → 模型列表只用 `provider-models?provider=custom`（litellm /models 只有 flash），丢 catalog 的 pro 项。

**修复：**
- `.codex/config.toml` 补 `model_catalog_json = "C:\\Users\\cattails\\.codex\\models.json"` → `model/list` 返回 deepseek-v4-flash / deepseek-v4-pro（与 codex-cli 一致）。
- `src/composables/useDesktopState.ts` `refreshModelPreferences`：`isProviderBacked` 判定从 `targetProviderId !== 'codex'` 改为 `!== 'codex' && !== 'custom'`（config.toml 的 litellm provider 不算 provider-backed，走 model/list 目录；UI 的"自定义端点"是 `custom-endpoint`，不受影响）。

**验证：** `model/list` = deepseek-v4-flash, deepseek-v4-pro；UI 模型下拉显示两项。备注：litellm config.yaml 只配了 flash（deepseek-v4-pro 选了会报错，与 codex-cli 行为一致，需用户在 litellm 补配）。

## 备注（发现但未修）

- **thread/delete / thread/archive 对 notLoaded/active 线程 502**：app-server 对活动/未加载线程执行 delete/archive 时触发 session shutdown 卡住（日志：`thread X was active; shutting down`），bridge 返回 502。测试线程（019ff628/019ff634/019ff670）因回退/429 后变 notLoaded 无法通过 RPC 删除，但不在 thread/list 显示，无用户可见影响。正常 idle 线程的归档（round-37 回收站）此前工作正常。低优先级，待后续确认 app-server 行为。
- 测试线程残留（state db 行）不影响用户。

## 涉及文件与提交

- `src/App.vue`（onRollback 恢复回填）
- `src/components/content/ThreadComposer.vue`（恢复 appendTextToDraft）
- `.codex/config.toml`（同步 litellm 配置，+备份 `.bak-round42`）
- `codex-mobile-handover/rounds/round-42-feedback.md`（本文档）
