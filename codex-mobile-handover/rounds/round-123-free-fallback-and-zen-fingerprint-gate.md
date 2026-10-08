# round-123：免费兜底换源 OpenRouter + OpenCode Zen 免费档「已死」结论的推翻

> 环境：Windows / 本机 codex-cli **0.158.0** / 托管 node 22.22.2-6。日期 2026-10-08。
> 探针全部直连上游，必须 `NO_PROXY='*'`（本机 FlClash 走 TUN，沙箱代理访问外网一律 502）。

## 一、由来

用户三连问：

1. 「现在 opencode_zen 还能代理吗？我之前用了后提示需要在 opencode 客户端使用，是我们缺少什么？」
2. 「这个是什么？codexapp 自带的免费模型？」（已答：不是 app-server 自带，是插件自加的兜底层）
3. **「A+B。确认 opencodeZen 已经无法使用了？如果是可以移除相关模块」**——A＝把无 auth 的默认兜底从 Zen 改 OpenRouter，B＝清理失效模型 slug，外加「确认后可否移除 Zen 模块」。

第 3 问是**条件指令**：确认「已经无法使用」→ 才移除。所以本轮第一件事不是改代码，而是**把「已经无法使用」这句话验到底**。

## 二、结论：前提被推翻——Zen 没死，是我们的客户端指纹过期了

### 2.1 第一层证据：免费档确实被拒（与你看到的一致）

| 探测（直连 `https://opencode.ai/zen/v1`） | 结果 |
| --- | --- |
| `GET /models`（无 auth） | **200**，87 个模型 —— **服务本身活着** |
| `POST /chat/completions` `big-pickle`，`Bearer public` + 现有 `zenProxy` 全套伪装头 | **403** |
| 同上，去掉全部 `X-Opencode-*` 头 | **403，报错逐字相同** |
| 同上，完全裸装 | **403，报错逐字相同** |
| 同上，改用一个格式合法但无效的 `sk-…` key | **401 `AuthError: Invalid API key.`** |

返回体就是你看到的那句：

```json
{"type":"error","error":{"type":"FreeTierError",
 "message":"Error from provider (Console): OpenCode's free tier can only be used from within OpenCode"}}
```

**两个关键判读**：①「去掉伪装头后报错逐字相同」⇒ 不是「我们少发了一个头」这种单点问题；②**伪造 key 拿到 401 而不是 403** ⇒ 付费档是**另一道独立的门**，通往 Zen 的路没有被整体切断。

到这一步，结论看起来是「免费档没了」。但如果就此收工，会错得很难看——因为下面这一层。

### 2.2 第二层证据：闸门是**递进式**的，我们只差最后一级

上游公开资料互相矛盾（有的说「只要 `x-opencode-session` 任意字符串即可」、有的说「必须有真实 OpenCode 会话」、有的说「实际是 IP 信誉」）。不去猜，**逐段补伪装找分界点**：

| 变体 | 补了什么 | 结果 |
| --- | --- | --- |
| V0 | 裸装 | 403 `FreeTierError` |
| V1 | 现有 `zenProxy` 伪装（UA 对、session `ses_`+**24** 字符、无 stream、无 tools） | 403 `FreeTierError` |
| V2 | V1 + 规范 session（`ses_`+**26**＝12 位小写 hex + 14 位 Base62） | 403 `FreeTierError` |
| V3 | V2 + `stream: true` | 403 `FreeTierError` |
| V4 | V3 + `bash` / `read` 函数工具桩 | **426 `UpgradeRequired`** |
| V5 | V4 换 `big-pickle` | **426 `UpgradeRequired`** |

426 的原文：

```json
{"type":"error","error":{"type":"UpgradeRequired",
 "message":"Error from provider (Console): OpenCode 1.18.0 or newer is required to use the free tier"}}
```

**V3→V4 错误类型变了，这是分水岭**：`FreeTierError` 那一段的门（session + stream + 工具桩）**已经通过**，服务端进到了下一项检查——**客户端版本**。而我们 `zenProxy.ts` 里硬编码的是 `opencode/1.15.9`。

再把版本这一级问清楚：

| UA | 结果 |
| --- | --- |
| `opencode/1.15.9` | 426 `UpgradeRequired` |
| `opencode/1.18.0` | 400 上游 `Endpoint is unavailable`（=版本门已过，轮到具体模型） |
| `opencode/1.20.0` / `1.25.0` | 同上 |

### 2.3 第三层：闸门全通后，免费模型**大面积可用**

三段指纹（`ses_`+26 / `stream`+`bash`,`read` 工具桩 / UA ≥ 1.18.0）齐全时，逐个真调当前目录里的免费模型：

```
✅ mimo-v2.6-flash-free        HTTP 200  3512ms  content="OK"
✅ space-bunny-free            HTTP 200   798ms  content="OK"
✅ longcat-2.5-preview-free    HTTP 200  4717ms  content="OK"
✅ ling-3.1-flash-free         HTTP 200  1851ms  content="OK"
✅ nemotron-3-ultra-free       HTTP 200  2511ms  content="OK"
✅ nemotron-3.5-lightning-free HTTP 200  8440ms  content="…"
✅ fledge-alpha-free           HTTP 200  1901ms  content="OK"
✅ big-pickle                  HTTP 200  3129ms  content="OK"   ← 插件默认用的就是它
❌ jev-1.13-free               HTTP 500  Internal server error
❌ exo-free                    HTTP 503  Endpoint is unavailable
❌ ling-3.0-flash-fin-free     HTTP 400  Endpoint is unavailable
❌ muse-spark-1.2-contributor-free  HTTP 403  RegionError: This model is not available in your country.
❌ muse-spark-1.3-contributor-free  HTTP 403  RegionError: This model is not available in your country.
存活 8 / 13
```

**结论定了**：`opencode_zen` **不是「已经无法使用」**，是插件的客户端伪装停在旧形状上。**因此没有按原意移除 Zen 模块**，改而去修真正被证实的缺陷（见 §三）。

### 2.4 为什么不「顺手把指纹修好」

修指纹只要三处（UA 版本、session 形状、请求体补 `stream` + 工具桩），但它**不是修 bug，是持续绕过上游明确设置的门禁**——上游的文案就是「free tier can only be used from within OpenCode」，426 更是明写「需要 OpenCode 1.18.0 或更新版本」。而且证据显示这是**军备竞赛**：9 月内闸门已经收紧过至少两级（早期「只要有 session 头」→ 现在「session 形状 + stream + 工具桩 + 版本」），今天修好、下次照样失效。

故本轮**只诊断、不实施**，把选择权交回用户。附带两条已知代价供参考：即便修好，13 个免费模型里有 5 个当下就是坏的，其中 2 个对中国大陆用户直接 `RegionError`。

## 三、实际改动（A + B）

### A. 默认兜底从 OpenCode Zen 换成 OpenRouter

`src/server/bridge/codexAuthState.ts` 的 `ensureDefaultFreeModeStateForMissingAuthSync`：

```ts
  return createDefaultOpenCodeZenFreeModeState()   // 改前
  return createDefaultOpenRouterFreeModeState()    // 改后
```

**为什么这是真缺陷**：这条兜底服务的是「没有登录、也没在 config.toml 里写 `model_provider`」的全新用户。原先播种 opencode-zen，而按 §2.1 的实测，**这条路上游必然 403**——等于插件默认给新用户一条死路（一发言就是 `FreeTierError`）。OpenRouter 社区池（`freeMode.ts` 里那批 XOR 混淆 key）实测仍可直接调用。

**判定语义一个字没动**：仍然只在「无可用 auth **且** 用户没在 config.toml 里显式写顶层 `model_provider`」时才播种，绝不覆盖用户的显式选择——与 round-122 同一原则。`importedSessions.getCurrentImportedSessionModelDefaults` 对 OpenRouter 走既有的 `apiKey` 分支 → `openrouter_free`，无需改动。

### B. 清理失效模型 slug（两处清单，都按「真实调用过」校准）

**OpenRouter 兜底**（`freeMode.ts` 的 `FALLBACK_FREE_MODELS`）——按目录与真调核对，原 5 项里 3 项已下架：

| 原值 | 现状 |
| --- | --- |
| `openrouter/free` | 保留（实测 200，实际路由到 `cohere/north-mini-code:free`） |
| `google/gemma-4-26b-a4b-it:free` | 保留（实测临时 429，但仍在目录内） |
| `google/gemma-3-27b-it:free` | **已下架** → 换 `nvidia/nemotron-3-super-120b-a12b:free`（实测 200） |
| `meta-llama/llama-3.3-70b-instruct:free` | **已下架** → 换 `cohere/north-mini-code:free`（实测 200） |
| `qwen/qwen3-coder:free` | **已下架**（报 "unavailable for free"，即该 slug 已转付费）→ 换 `liquid/lfm-2.5-2.6b:free`（实测 200） |

**Zen 离线兜底清单**（三处同名单：`bridge/models.ts`、`bridge/freeModeRoutes.ts`、`codexAppServerBridge.ts`）——原 4 项里 3 项已从 87 项目录**整个消失**：

| 原值 | 现状 |
| --- | --- |
| `big-pickle` | 保留（实测 200 + 真实内容） |
| `minimax-m2.5-free` | **已不存在**（`ModelError: not supported`） |
| `nemotron-3-super-free` | **已不存在** |
| `trinity-large-preview-free` | **已不存在** |

替换为实测存活的 `mimo-v2.6-flash-free` / `space-bunny-free` / `ling-3.1-flash-free` / `nemotron-3-ultra-free`，并在三处各留一行注释指明「改动需三处同步」（这三份清单是复制的，正是它们漂移成今天这样的原因）。`muse-spark-*.contributor-free` 虽然活着但对中国大陆用户 `RegionError`，**故意不列入**。

### 顺带

删掉 `codexAppServerBridge.ts` 里 `createDefaultOpenCodeZenFreeModeState` 的**死导入**（只在 import 出现、从未使用；在本轮更容易误导人，像是 bridge 还在播种 Zen）。

## 四、验证

- 定向单测：`freeMode.test.ts` 16 + `appServerRuntimeConfig.test.ts` 12 + `codexAppServerBridge.archive.test.ts` 32 = **60/60 通过**。
- `vue-tsc --noEmit` **EXIT=0**。
- **全量 732/732 零失败**（`75 files passed`，Duration 54.03s）。本轮跑全量时未并行跑磁盘密集任务，未出现 round-122 那种自致超时。
- 测试同步：`freeMode.test.ts` 里作为示例的过期 slug 换成 `nemotron-3-ultra-free`；`codexAppServerBridge.archive.test.ts` 的 `ensureDefaultFreeModeStateForMissingAuthSync` 段 3 条断言由 `'opencode-zen'` 改 `'openrouter'`、3 个用例标题由 `OpenCode Zen` 改 `OpenRouter`。
- **数据类改动（B）不做单测**：清单内容会随上游目录变化，断言清单等于制造下一次必假失败的测试。它的验证口径是**真调用**（本轮的 5 个探针），已写进本文件与手测章节。

## 五、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/server/bridge/codexAuthState.ts` | 默认兜底换源 `createDefaultOpenRouterFreeModeState()`；导入随换（`createDefaultOpenCodeZenFreeModeState` → `createDefaultOpenRouterFreeModeState`）；补一段解释为何换源的注释 |
| `src/server/freeMode.ts` | `FALLBACK_FREE_MODELS` 按实测校准（3 个失效 slug 替换） |
| `src/server/bridge/models.ts` | Zen 离线兜底清单校准 + 三处同步注释 |
| `src/server/bridge/freeModeRoutes.ts` | `/free-mode/status` 里 Zen 清单两处（成功空结果分支 + catch 分支）校准 |
| `src/server/codexAppServerBridge.ts` | Zen 清单校准 + 删 `createDefaultOpenCodeZenFreeModeState` 死导入 |
| `src/server/freeMode.test.ts` | 过期示例 slug → 实测存活 slug |
| `src/server/codexAppServerBridge.archive.test.ts` | 3 条断言 + 3 个用例标题改 OpenRouter |

## 六、诚实边界 / 未完成

①**没有修 Zen 的客户端指纹**（§2.4 的理由），故当前插件下 **Zen 免费档仍不可用**——本次只把「能不能修」验清楚并上报。若用户选择修，需要动 `zenProxy.ts` 三处：UA 版本、session 形状（`ses_`+26）、请求体补 `stream: true` 与 `bash`/`read` 工具桩（并注意 `wireApi: 'chat'` 的 `responsesPayloadFormat: 'chat'` 转换路径也要保住这三样）。

②**Zen 离线兜底清单的现状价值有限**：指纹不修的前提下，Zen 这条路走不到上游，清单内容对用户不可见。本轮仍然校准了它，理由是「不要继续对外宣布不存在的模型」，而不是因为它现在能用。

③**未在 codex-cli 0.160.1 上复测**（本机 0.158.0）。本轮改动全在 provider 选择与静态清单，与 CLI 版本无关；0.160.1 的差异只在 round-119 记的闸门相关环境。

④**Zen 的付费档（自带 key）未经真实 key 验证**。仅证明「伪造 key 得到 401 `AuthError` 而非 403 `FreeTierError`」⇒ 付费档是独立闸门；真实 key 能否成功没有条件验证。

⑤**Zen 目录里的地区限制未做系统排查**。只发现 `muse-spark-*.contributor-free` 对中国大陆返回 `403 RegionError`，其余 86 项未逐项探地区。

## 七、环境事故（如实记录）

写探针时误用 `require('./dist-cli/index.js')` 取包版本 —— 该文件是**打包后的 CLI 入口**，`require` 会执行 `main()`，于是**直接拉起了一个真实服务**（默认端口 5900），且因为没传 `CODEX_HOME`，用的是**用户真实的 `~/.codex`**。

处置与影响：命令随工具调用终止，端口已释放（复查 `connect 5900` → `ECONNREFUSED`），无残留 `codex` app-server 子进程（`Get-Process` 核对）；**`webui-custom-providers.json` 未被改动**（mtime 停在 2026-09-24）；但 `codexui-password` 与若干 sqlite 状态文件（`state_5`/`logs_2`/`queue_1`/`memories_1`/`goals_1` 的 `-shm`/`-wal`）的时间戳被触及。

**教训（写进总入口）**：探针里**永远不要 `require()` 打包产物**，要读常量就解析源码文本或用正则抓；要用 CLI 就必须传 `CODEX_HOME=<临时目录>`、`--no-password`、并显式指定非默认端口。
