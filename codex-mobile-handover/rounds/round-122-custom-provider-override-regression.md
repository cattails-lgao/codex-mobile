# Round-122：`-c` 兼容占位顶掉用户自定义 `custom` provider 的回归修复（2026-10-08）

> **背景：** 用户报告（附带完整定位：环境、`config.toml`、现象、复现步骤、决定性证据、建议修法）——**0.1.127 起，config.toml 里激活的 provider 就叫 `custom` 的用户，整个 WebUI 不可用**。`0.1.125 / 0.1.126` 无此问题，回归由 0.1.127 引入。用户 `codex-cli` 0.160.1；本机复核环境为 Windows / **codex-cli 0.158.0**。

## 一、现象

- 升级到 0.1.127 后发送消息一直停在 `ERROR: Reconnecting... waiting for network`，turn 永远 `inProgress`，服务端无报错日志。
- 一条容易漏掉的线索：WebUI 日志里 `[codex-provider-models] provider /models request failed { providerId: 'custom', error: 'fetch failed' }`。
- 用户 `config.toml`：
  ```toml
  model = "deepseek-flash"
  model_provider = "custom"

  [model_providers.custom]
  name = "litellm"
  base_url = "http://127.0.0.1:4460/v1"
  wire_api = "responses"
  ```

## 二、根因（实测确认：真实 app-server 的 `config/read`）

`freeMode.ts` 的 `getProviderCompatibilityConfigArgs()` **无条件**返回三条覆盖：

```js
'-c', 'model_providers.custom.name="Legacy Custom Endpoint"',
'-c', 'model_providers.custom.base_url="http://127.0.0.1:9/v1"',
'-c', 'model_providers.custom.wire_api="responses"',
```

调用点 `codexAppServerBridge.buildAppServerConfig()` 无任何条件判断：

```ts
args.push(...getProviderCompatibilityConfigArgs(serverPort))
```

历史用意（round-104）：宿主版遗留 rollout 把 provider 记成 `custom`，app-server 在 provider 未定义时拒绝 resume（`Model provider 'custom' not found` → 502 → 线程打不开），故注册一个 inert 占位；选 9 端口是刻意的「死地址」哨兵。**但 `-c` 的优先级高于 `config.toml`**，于是用户自己的 `[model_providers.custom]` 被整体顶掉，`base_url` 变成 `http://127.0.0.1:9/v1`（IANA discard，无监听），而用户又把 `model_provider` 指向 `custom` → 每个请求必然连接失败 → CLI 一轮轮重试 = `Reconnecting... waiting for network`。

**不再靠读 argv 推断，直接问 app-server**（`tmp/probe-r122-custom-provider-override.cjs`，隔离 `CODEX_HOME`，`initialize` → `config/read`）：

| 组合 | `model_providers.custom.name` | `custom.base_url` | 结论 |
| --- | --- | --- | --- |
| A 用户定义 custom + 带桥的覆盖 | `Legacy Custom Endpoint` | `http://127.0.0.1:9/v1` | **缺陷复现**（`active provider` 仍是 `custom` → 正是它被打死） |
| B 用户定义 custom + 不带覆盖 | `litellm` | `http://127.0.0.1:4460/v1` | 用户配置本身完好，`-c` 就是元凶 |
| C 用户未定义 custom + 带覆盖 | `Legacy Custom Endpoint` | `http://127.0.0.1:9/v1` | round-104 的遗留 rollout 保护确实需要它 |

## 三、修复

### 1) 只在用户未定义时注册兼容占位（首选方案）

- `appServerRuntimeConfig.ts` 新增：
  - `collectModelProviderIds(raw)`：收集 `config.toml` 里定义的 `model_providers.<id>`，覆盖四种写法——`[model_providers.custom]`、`[model_providers.custom.x]`、`model_providers.custom.base_url = …`（点号键）、`[model_providers]` 段内 `custom = { … }`；带 profile 前缀（`[profiles.p.model_providers.custom]`）同样收集。只判「有没有定义」，不解析取值；`model_provider = "custom"`（**选哪个**）不得被当成定义。
  - `readUserConfiguredProviderIds()`：读 `$CODEX_HOME/config.toml`（复用既有 `getCodexHomeDir()`），按 `mtimeMs + size` 键控缓存。
- `freeMode.getProviderCompatibilityConfigArgs(serverPort, userProviderIds)`：参数**必填**（正是这个默认值缺失造成了回归，安全的东西必须显式），`custom` 与 `opencode_zen` **两块都**遵循「用户已定义即跳过」——`opencode_zen` 是用户报告点名的同类风险。
- `codexAppServerBridge.buildAppServerConfig()` 传入 `readUserConfiguredProviderIds()`。

用户已定义时的语义：遗留 rollout 会解析到**用户自己的** provider——历史照样能读（`thread/resume` 不再 502），比指向死端点更合理。

**复用而非新写**：注释/多行字符串剥离复用 `bridge/codexAuthState` 的 `stripTomlComment`（那里本就有 `model_provider` 的同类判定与同一套 mtime 缓存），因此把它导出、删掉我第一版自己写的弱化实现——否则仓里会有两份会漂移的 TOML 注释剥离器（我第一版不认 `"""` / `'''` 多行字符串，已补测试覆盖）。

### 2) 不再拿死端口当哨兵（报告建议 3，先测后改）

**判定实验**（`tmp/probe-r122-dead-endpoint.cjs`，真实 `codex exec` + 本地 HTTP 端点）：

| base_url | 结果 |
| --- | --- |
| `http://127.0.0.1:9/v1`（无监听） | `ERROR: Reconnecting... 1/5`，**25s 仍不退出**（用户症状逐字复现） |
| 本地返回 `400` + JSON 错误体的端点 | **4.9s 退出（exit=1）**，打印可读原因，零重连 |

于是占位 provider 的 `base_url` 在有本机端口时改指 `http://127.0.0.1:<port>/codex-api/provider-compat/v1`（常量 `LEGACY_CUSTOM_COMPAT_PATH`，与路由共用同一来源），路由回 400 + `This thread uses a legacy compatibility provider that has no endpoint. …`；拿不到端口时保留旧的 `127.0.0.1:9/v1` 兜底。即「遗留线程里发送」从**无限静默重连**变成**数秒内的可读失败**。

### 3) 未采纳的两条建议

- **env 退出开关**（报告建议 2）：条件判定已覆盖报告场景，再加开关属多余入口（YAGNI）。
- **保留 app-server stderr**（报告建议 4）：桥的 `stderr` 是**有意**静默（`codexAppServerBridge.ts:490` "Keep stderr silent in dev middleware"），且本轮故障的信息本来就走 turn 流而非 stderr——改动它是独立的可观测性议题，未混进本次修复。

## 四、验证

- **端到端（走真实桥，`tmp/probe-r122-bridge-e2e.cjs`：隔离 `CODEX_HOME` + 真实 vite dev + 真实 app-server，仍用 `config/read` 作判据）三个变体全绿**：
  | 变体 | 结果 |
  | --- | --- |
  | 1 用户定义 `[model_providers.custom]` | `name=litellm`、`base_url=http://127.0.0.1:4460/v1`、`active provider=custom` ← **回归已修** |
  | 2 用户未定义 `custom` | 占位仍注册，`base_url=http://127.0.0.1:4271/codex-api/provider-compat/v1` |
  | 3 运行中把 `[model_providers.custom]` 写进 config.toml | 写入前 = 兼容路由 → **写入后 = `http://127.0.0.1:4460/v1`、active = `custom`**（缓存在 mtime/size 变化时失效 → 配置签名变 → app-server 重启） |
  | 兼容路由 | `HTTP 400` + 上述消息（两个变体下均验证） |
- **报告里的复现命令也复核过**：`codex exec -c model_providers.custom.base_url="http://127.0.0.1:9/v1" "say ok"` 在本机确实复现无限重连（见上表）。
- **单测**：`freeMode.test.ts` **16/16**（原 15 + 新增：跳过 `custom`、跳过 `opencode_zen`、两者都定义时为空、有端口指向兼容路由、无端口回落死哨兵）；`appServerRuntimeConfig.test.ts` **12/12**（原 9 + `collectModelProviderIds` 四种写法 / 注释与多行字符串不误判 / `readUserConfiguredProviderIds` 的空文件与缓存失效）。定向 **28/28**。
- `vue-tsc --noEmit` → **EXIT=0**。
- 全量 Vitest → **732 例 / 731 通过 / 1 失败**（本机 Windows 基线）。唯一失败 `codexAppServerBridge.archive.test.ts > writeWorkspaceRootsState > persists workspace roots in canonical form` = **文档记录的负载敏感 fs 测试超时**（round-115 点名的同一类形状 `mkdtemp→写文件→fs 逻辑→rm -r`）；隔离复跑该文件 + `inlinePayload` **61/61 通过**，该例实测 **3786ms**（预算 15000ms）⇒ 环境负载，与本次改动无关（本轮首次全量运行时并发跑了一个 47s 的磁盘密集微基准，把它逼超时；随后两次全量分别 3 例 / 1 例超时，集合不同）。
- **性能审计（先测后改）**：`buildAppServerConfig()` 在**每次 RPC** 的 `disposeIfConfigChanged()` 里被调用，所以新增的配置读取必须便宜。本机空闲态实测：`existsSync` **595µs**、`readFileSync`(1.3KB) **1359µs**、`statSync` **14.4µs**。第一版按文件内容缓存（`existsSync + readFileSync`，≈2.4ms/次）实测后**改掉**，改为 `mtimeMs + size` 键控：命中路径只付一次 `statSync`（≈14µs）+ 字符串比较（约 170× 更省），只在文件真的变了才读并解析。已知取舍：同一 mtime 粒度 + 同尺寸的两次写入会被漏掉（与 `codexAuthState` 同一个取舍）。新增路由只回一个常量响应，无 I/O。

## 五、诚实边界

- **未在 0.160.1 上复核**：本机 CLI 是 0.158.0。不过 `-c` 覆盖 `config.toml` 的优先级与 `config/read` 口径都是 app-server 自身行为，与 0.158/0.160 无关，报告侧的 0.160.1 现象已被本机逐字复现（同样的 `Reconnecting...`）。
- **`opencode_zen` 的跳过分支没有端到端实测**（只覆盖到单测）：需要一个真把 `model_provider` 指向 `opencode_zen` 的 `config.toml` 才谈得上实际收益，而该 id 是插件自己的命名空间，撞名概率极低。
- **多行字符串**：扫描器现在复用 `codexAuthState` 的实现，已按 `"""` 多行字符串补了单测；但 TOML 的转义序列等更细的边界仍未系统覆盖（只做「有没有定义」的判定，真实误判方向是「少注入一次兼容占位」这个良性方向）。
- **`model_providers = { custom = {…} }` 这种整表内联写法未支持**（YAGNI：无现实用法，且误判方向同样良性）。
- **报告建议 4（保留 stderr）未做**，见 §三.3。

## 六、涉及文件

| 文件 | 改动 |
| --- | --- |
| `src/server/appServerRuntimeConfig.ts` | 新增 `collectModelProviderIds` / `readUserConfiguredProviderIds`（mtime+size 缓存），复用 `stripTomlComment` |
| `src/server/bridge/codexAuthState.ts` | `stripTomlComment` 导出（零逻辑改动）供上面复用 |
| `src/server/freeMode.ts` | `getProviderCompatibilityConfigArgs(serverPort, userProviderIds)` 参数必填 + 两块条件注入；`LEGACY_CUSTOM_PROVIDER_ID` / `LEGACY_CUSTOM_COMPAT_PATH` 常量；占位 `base_url` 改指本机兼容路由 |
| `src/server/codexAppServerBridge.ts` | 传入 `readUserConfiguredProviderIds()`；新增 `POST /codex-api/provider-compat/v1/responses` 返回 400 可读错误 |
| `src/server/freeMode.test.ts` | 断言更新 + 4 例新增 |
| `src/server/appServerRuntimeConfig.test.ts` | 3 例新增（扫描器两种输入形态 + 真实 `$CODEX_HOME` 读取与缓存失效） |
| `tests/providers-models/round-122-user-owned-custom-provider-not-overridden.md` | 新增手测章节（含 `config/read` 判据与兼容路由期望） |
| `tests.md` / `tests/providers-models/index.md` | 登记新章节 |
| `tmp/probe-r122-*.cjs`（3 个，未入库） | 覆盖探针 / 死端点判定 / 桥层端到端三变体 |

## 七、收尾验证说明

- `vue-tsc --noEmit`：**EXIT=0**
- 定向 Vitest：**28/28**（`freeMode` 16 + `appServerRuntimeConfig` 12）
- 全量 Vitest：**732 例 / 731 通过 / 1 失败**（失败 = 文档记录的负载敏感 fs 超时；隔离 61/61 通过）
- 端到端：桥层三变体全绿（`config/read` 判据）+ 死端点/4xx 对照实验
- 性能：`statSync` 14.4µs vs `readFileSync` 1359µs（同文件），据此改缓存策略
- 未做：0.160.1 复核、`opencode_zen` 跳过的端到端、`publish` 到 npm（随下一次发布）
