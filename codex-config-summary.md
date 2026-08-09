# Codex 配置文件（config.toml）配置项总结

来源文档：
- [config-basic](https://learn.chatgpt.com/docs/config-file/config-basic)
- [config-advanced](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [config-reference](https://learn.chatgpt.com/docs/config-file/config-reference)
- [environment-variables](https://learn.chatgpt.com/docs/config-file/environment-variables)
- [config-sample](https://learn.chatgpt.com/docs/config-file/config-sample)

## 配置层级与优先级

配置来源（高→低）：**CLI 参数/`--config` > 项目 `.codex/config.toml`（从项目根到当前目录，近者优先，仅信任的项目生效）> Profile 文件（`--profile xxx` 加载 `~/.codex/xxx.config.toml`）> 用户配置 `~/.codex/config.toml` > 系统配置 `/etc/codex/config.toml` > 内置默认值**。

项目级配置不能覆盖：`openai_base_url`、`chatgpt_base_url`、`model_provider(s)`、`notify`、`profile`、`otel` 等（涉及凭证重定向、遥测的键）。

## 核心模型选择

| 配置项 | 作用 |
|---|---|
| `model` | 默认使用的模型，如 `"gpt-5.6"` |
| `model_provider` | 使用的提供商 ID（来自 `[model_providers]`），默认 `"openai"` |
| `oss_provider` | `--oss` 会话默认本地开源提供商（`ollama`/`lmstudio`），未设则提示选择 |
| `service_tier` | 首选服务等级，如 `fast`（映射请求值 `priority`） |
| `review_model` | `/review` 命令的模型覆盖，默认用当前会话模型 |
| `model_context_window` | 上下文窗口 token 数，默认按模型自动 |
| `model_auto_compact_token_limit` | 触发自动历史压缩的 token 阈值 |
| `model_auto_compact_token_limit_scope` | 压缩阈值统计范围：`total`（全部上下文）或 `body_after_prefix`（仅前缀后增长） |
| `tool_output_token_limit` | 每个工具输出在历史中存储的 token 预算 |
| `model_catalog_json` | 启动时加载的模型目录 JSON 路径（Profile 可覆盖） |
| `background_terminal_max_timeout` | 后台终端空 `write_stdin` 轮询最大窗口（ms，默认 5 分钟） |
| `log_dir` | 日志目录，显式设置会开启明文 `codex-tui.log`；默认 `$CODEX_HOME/log` |
| `sqlite_home` | SQLite 运行时状态数据库目录（agent jobs 等可恢复状态） |

## 推理与输出风格（Responses API）

| 配置项 | 作用 |
|---|---|
| `model_reasoning_effort` | 推理强度：`minimal/low/medium/high/xhigh` |
| `plan_mode_reasoning_effort` | Plan 模式下的推理强度覆盖 |
| `model_reasoning_summary` | 推理摘要：`auto/concise/detailed/none` |
| `model_verbosity` | GPT-5 系列文本详细度：`low/medium/high`（仅 Responses API 生效） |
| `model_supports_reasoning_summaries` | 强制开启/关闭推理摘要元数据 |
| `personality` | 默认沟通风格：`none/friendly/pragmatic`，可用 `/personality` 覆盖 |

## 指令覆盖

| 配置项 | 作用 |
|---|---|
| `developer_instructions` | 额外开发者指令，注入在 AGENTS.md 之前 |
| `compact_prompt` | 历史压缩提示词的内联覆盖 |
| `model_instructions_file` | 用文件内容替代内置基础指令（替代 AGENTS.md） |
| `experimental_compact_prompt_file` | 从文件加载压缩提示词覆盖（实验性） |

## 审批与沙箱

| 配置项 | 作用 |
|---|---|
| `approval_policy` | 命令执行审批时机：`untrusted`（仅已知安全只读命令自动运行）/ `on-request`（默认，模型决定何时询问）/ `never`（不询问）/ `granular`（按类别细化） |
| `approval_policy.granular.*` | 细粒度开关：`sandbox_approval`、`rules`、`mcp_elicitations`、`request_permissions`、`skill_approval`，true=允许弹出，false=自动拒绝 |
| `approvals_reviewer` | 审批由谁审查：`user`（默认）或 `auto_review`（自动审查子代理） |
| `allow_login_shell` | 是否允许 shell 工具使用登录 shell 语义（默认 true，false 时强制非登录 shell） |
| `sandbox_mode` | 沙箱策略：`read-only`（默认）/ `workspace-write` / `danger-full-access`（无沙箱，极危险） |
| `default_permissions` | 默认权限配置文件：`:read-only` / `:workspace` / `:danger-full-access` 或自定义 `[permissions.<name>]`，不要与 `sandbox_mode` 混用 |
| `[sandbox_workspace_write]` | workspace-write 模式的附加设置：`writable_roots`（额外可写目录）、`network_access`（允许出站网络）、`exclude_tmpdir_env_var`、`exclude_slash_tmp` |

## 认证与登录

| 配置项 | 作用 |
|---|---|
| `cli_auth_credentials_store` | CLI 登录凭证存储：`file`（默认）/`keyring`/`auto` |
| `chatgpt_base_url` | ChatGPT 登录流程的 base URL |
| `openai_base_url` | 内置 openai 提供商的 base URL 覆盖（指向代理/数据驻留项目时用） |
| `forced_chatgpt_workspace_id` | 将 ChatGPT 登录限制到指定 workspace |
| `forced_login_method` | 强制登录方式：`chatgpt` / `api` |
| `mcp_oauth_credentials_store` | MCP OAuth 凭证存储：`auto`/`file`/`keyring` |
| `mcp_oauth_callback_port` | MCP OAuth 回调固定端口（默认系统随机） |
| `mcp_oauth_callback_url` | MCP OAuth 回调 base URL 覆盖（如远程 devbox 入口） |

## 项目文档控制

| 配置项 | 作用 |
|---|---|
| `project_doc_max_bytes` | 从 AGENTS.md 嵌入首轮指令的最大字节数（默认 32768） |
| `project_doc_fallback_filenames` | AGENTS.md 缺失时的后备文件名列表 |
| `project_root_markers` | 项目根标记文件（默认 `[".git"]`），设 `[]` 则当前目录即项目根 |

## 历史与文件打开

| 配置项 | 作用 |
|---|---|
| `[history].persistence` | 是否保存会话记录：`save-all`（默认）/ `none` |
| `[history].max_bytes` | 历史文件大小上限，超出丢弃最旧记录 |
| `file_opener` | 可点击引用的 URI 方案：`vscode`（默认）/`vscode-insiders`/`windsurf`/`cursor`/`none` |

## UI、通知与杂项

| 配置项 | 作用 |
|---|---|
| `hide_agent_reasoning` | 在 TUI 和 `codex exec` 输出中隐藏推理事件 |
| `show_raw_agent_reasoning` | 显示模型原始推理内容 |
| `disable_paste_burst` | 关闭 TUI 突发粘贴检测 |
| `windows_wsl_setup_acknowledged` | Windows 引导确认标记 |
| `check_for_update_on_startup` | 启动时检查更新（默认 true） |
| `notify` | 外部通知程序（argv 数组），收到 JSON 载荷（目前仅 `agent-turn-complete` 事件） |
| `[analytics].enabled` | 是否发送匿名用量/健康数据给 OpenAI |
| `[feedback].enabled` | 是否允许 `/feedback` 提交反馈 |
| `[notice].*` | 记录各种警告/迁移提示的"已确认"状态 |
| `suppress_unstable_features_warning` | 抑制实验功能启用时的警告 |
| `[tools].view_image` | 启用 `view_image` 本地图片附件工具 |
| `tools.web_search` | 可选对象形式配置：上下文大小、允许域名、近似位置 |

## 网页搜索

| 配置项 | 作用 |
|---|---|
| `web_search` | 模式：`cached`（默认，用 OpenAI 维护的索引缓存结果）/`indexed`（外部网页访问经索引门控）/`live`（实时抓取）/`disabled`。`--yolo` 或全权限沙箱下默认 live |

## 多智能体 `[agents]`

| 配置项 | 作用 |
|---|---|
| `agents.enabled` | 启用/停用多智能体工具（默认 true） |
| `agents.max_concurrent_threads_per_session` | 最大并发子代理线程数（不含主线程） |
| `agents.default_subagent_model` | 子代理默认模型 |
| `agents.default_subagent_reasoning_effort` | 子代理默认推理强度 |
| `agents.interrupt_message` | 智能体回合被中断时是否记录模型可见消息 |
| `agents.<name>.description` / `.config_file` | 自定义角色说明 / 角色 TOML 配置文件路径 |

## 技能 `[[skills.config]]`

| 配置项 | 作用 |
|---|---|
| `path` | 技能文件夹路径（含 SKILL.md） |
| `enabled` | 启用/禁用该技能 |

## Shell 环境策略 `[shell_environment_policy]`

| 配置项 | 作用 |
|---|---|
| `inherit` | 子进程环境继承：`all`（默认）/`core`/`none` |
| `set` | 显式注入的环境变量键值 |
| `ignore_default_excludes` | 默认 true=跳过对含 KEY/SECRET/TOKEN 变量的自动过滤；false=先自动过滤再应用自定义规则 |
| `filters` | 大小写不敏感的键模式过滤器（`"AWS_*" = "exclude"` / `"PATH" = "include"`），include 创建白名单 |
| `experimental_use_profile` | 实验性：通过用户 shell profile 启动 |
| `exclude` / `include_only` | 旧版数组形式，不能与 filters 同层混用 |

## 沙箱网络 `[features.network_proxy]` / `[permissions.<name>.network]`

| 配置项 | 作用 |
|---|---|
| `enabled` | 启用沙箱网络（实验性，默认关） |
| `domains` | 域名策略 `{"api.openai.com" = "allow"}`；支持 `*.example.com`（仅子域）、`**.example.com`（含主域）、`*`（全部）；deny 优先 |
| `unix_sockets` | Unix socket 策略 |
| `proxy_url` / `socks_url` | HTTP / SOCKS5 监听地址 |
| `mode` | 子进程流量代理模式：`limited`/`full` |
| `allow_local_binding` | 允许本地/私网访问（默认 false，可用精确 IP/localhost 规则放行） |
| `allow_upstream_proxy` | 允许链式上游代理 |
| `dangerously_allow_*` | 危险选项：非回环代理监听、全部 Unix socket 等（默认 false） |

## 权限配置文件 `[permissions.<name>]`

| 配置项 | 作用 |
|---|---|
| `description` / `extends` | 说明 / 继承父配置（可为 `:read-only`、`:workspace` 或另一命名配置） |
| `filesystem` | 文件系统规则：路径/glob → `"read"|"write"|"deny"`；`:workspace_roots` 下可用 `"."`（根）与 `"**/*.env"` 等子路径规则；`glob_scan_max_depth` 限制 deny 通配符展开深度 |
| `workspace_roots` | 追加工作区根 |
| `network` | 与上面 network_proxy 相同的网络策略字段 |

## 模型提供商 `[model_providers.<id>]`

| 配置项 | 作用 |
|---|---|
| `name` / `base_url` | 显示名 / API base URL |
| `wire_api` | 协议，唯一支持 `responses` |
| `env_key` / `env_key_instructions` | 提供 API key 的环境变量名 / 设置指引 |
| `http_headers` / `env_http_headers` | 静态请求头 / 从环境变量填充的请求头 |
| `query_params` | 附加查询参数（如 Azure 的 `api-version`） |
| `request_max_retries` / `stream_max_retries` | HTTP 请求 / SSE 流重试次数 |
| `stream_idle_timeout_ms` | SSE 流空闲超时（默认 5 分钟） |
| `supports_websockets` | 是否支持 Responses API WebSocket 传输 |
| `supports_standalone_web_search` | 是否支持独立网页搜索端点（默认 false，功能开发中默认关） |
| `experimental_bearer_token` | 直接 bearer token（不推荐，用 env_key） |
| `requires_openai_auth` | 该提供商使用 OpenAI 认证 |
| `[model_providers.<id>.auth]` | 命令式 bearer token：`command`（打印 token 到 stdout）、`args`、`timeout_ms`、`refresh_interval_ms` |
| `amazon-bedrock.aws.profile/region` | 内置 Bedrock 提供商的 AWS profile / region |
| 保留 ID | `openai`、`ollama`、`lmstudio` 不可自定义覆盖 |

## MCP 服务器 `[mcp_servers.<id>]`

| 配置项 | 作用 |
|---|---|
| `command` / `args` | stdio 服务器启动命令与参数 |
| `url` | Streamable HTTP 服务器端点 |
| `enabled` / `required` | 启用 / 初始化失败则启动失败 |
| `env` / `env_vars` / `cwd` | 转发环境变量（`env_vars` 支持本地/远程来源）/ 工作目录 |
| `env_http_headers` / `http_headers` | HTTP 头 |
| `startup_timeout_sec` / `tool_timeout_sec` | 启动（默认 10s）/ 工具（默认 60s）超时 |
| `enabled_tools` / `disabled_tools` | 工具白名单 / 黑名单 |
| `scopes` / `oauth_resource` | OAuth 作用域 / RFC 8707 资源参数 |
| `auth` | HTTP 服务器认证回退：`oauth`（默认）/ `chatgpt` |
| `bearer_token_env_var` | 取 bearer token 的环境变量 |
| `tools.<tool>.approval_mode` | 单工具审批模式覆盖 |
| `experimental_environment` | 实验性远程执行 stdio |

## Apps / 连接器 `[apps]`

| 配置项 | 作用 |
|---|---|
| `[apps._default]` | 所有 app 的默认值：`enabled`、`destructive_enabled`（危险工具）、`open_world_enabled`、`approvals_reviewer`、`default_tools_approval_mode` |
| `[apps.<id>]` | 按 app 覆盖上述设置 |
| `[apps.<id>.tools.<tool>]` | 单工具 `enabled` / `approval_mode` |
| `[tool_suggest]` | 连接器/插件安装建议的 `discoverables` / `disabled_tools` 列表 |

## 功能开关 `[features]`（常用项）

| Key | 默认 | 作用 |
|---|---|---|
| `apps` | true | App（连接器）集成 |
| `goals` | true | 持久化目标与自动续跑 |
| `hooks` | true | 生命周期 hooks |
| `fast_mode` | true | Fast 服务等级选择 |
| `memories` | false（实验） | 记忆功能 |
| `multi_agent` | true | 子代理协作工具 |
| `personality` | true | 个性风格选择 |
| `remote_plugin` | true | 远程插件目录 |
| `shell_snapshot` | true | 快照 shell 环境加速重复命令 |
| `shell_tool` | true | 默认 shell 工具 |
| `unified_exec` | true（除 Windows） | 统一 PTY exec 工具 |
| `enable_request_compression` | true | zstd 压缩流式请求体 |
| `skill_mcp_dependency_install` | true | 技能缺失 MCP 依赖时提示安装 |
| `prevent_idle_sleep` | false（实验） | 回合运行中阻止机器睡眠 |
| `network_proxy` | false（实验） | 沙箱网络代理 |
| `code_mode` / `rollout_budget` | 关（开发中） | 代码模式命名空间 / 预算追踪 |
| `web_search`、`web_search_cached`、`web_search_request` | 已废弃 | 旧版网页搜索开关，用顶层 `web_search` 替代 |

## 记忆 `[memories]`（需 `features.memories`）

| 配置项 | 作用 |
|---|---|
| `generate_memories` / `use_memories` | 是否生成 / 是否注入已存记忆 |
| `disable_on_external_context` | 使用 MCP/网页搜索等外部上下文时跳过记忆生成 |
| `extract_model` / `consolidation_model` | 记忆提取 / 全局整合的模型覆盖 |
| `max_rollout_age_days`、`max_unused_days`、`min_rollout_idle_hours`、`max_rollouts_per_startup`、`max_raw_memories_for_consolidation`、`min_rate_limit_remaining_percent` | 记忆生成的各类时间/数量/速率限制阈值 |

## Hooks `[hooks]` / `hooks.json`

生命周期事件（`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PreCompact`、`SessionStart/End`、`UserPromptSubmit`、`Stop` 等），每事件下 matcher 组与 handler（`type = "command"`、`command`、`timeout`、`statusMessage`、`additionalContextLimit`、`commandWindows`）。同一层同时存在 hooks.json 与内联 `[hooks]` 会警告。

## TUI `[tui]`

| 配置项 | 作用 |
|---|---|
| `notifications` | 桌面通知：boolean 或事件类型列表 |
| `notification_method` | `auto`（优先 OSC9，回退 BEL）/`osc9`/`bel` |
| `notification_condition` | `unfocused`（默认，仅失焦时）/`always` |
| `animations` / `show_tooltips` | 动画 / 引导提示 |
| `alternate_screen` | 备用屏幕控制（`auto` 在 Zellij 中跳过以保留回滚） |
| `resume_cwd` | 恢复/派生会话的工作目录：`current`/`session` |
| `status_line` / `terminal_title` | 底部状态栏 / 终端标题的显示项顺序，`[]` 隐藏 |
| `theme` | 语法高亮主题（kebab-case），可用 `/theme` 预览 |
| `keymap.<context>.<action>` | 按键绑定（global/chat/composer/editor/vim/…），`[]` 解绑 |
| `vim_mode_default` / `raw_output_mode` | 默认 Vim 模式 / 原始回滚模式 |
| `model_availability_nux` | 内部启动提示状态（按模型） |

## 其他

| 配置项 | 作用 |
|---|---|
| `[projects."<path>"]` | 标记项目为 `trusted`/`untrusted`（非信任项目跳过 `.codex/` 项目层配置） |
| `[otel]` | OpenTelemetry 导出：`exporter`（logs，默认 none）、`trace_exporter`、`metrics_exporter`（默认 statsig）、`environment`（默认 dev）、`log_user_prompt`（默认 false，导出原始提示词需显式开启），可配 endpoint/协议/TLS/头 |
| `[windows].sandbox` | Windows 原生沙箱：`unelevated`/`elevated`（推荐） |
| `windows.sandbox_private_desktop` | Windows 沙箱子进程是否默认在私有桌面运行 |
| `desktop.custom_file_handlers.<id>` | ChatGPT 桌面端"打开方式"自定义处理器：`label`、`icon`、`command`、`args`、`input`（path/json_argument/json_stdin）、`supports_ssh` |
| `auto_review.policy` | 自动审查的本地 Markdown 策略指令 |
| `computer_use.windows.always_allowed_app_ids` | Windows 上无需提示即可由 Computer Use 打开的 app 列表 |

## Profile 配置

`--profile <name>` 加载 `~/.codex/<name>.config.toml` 作为用户配置之上的覆盖层，只写与基础配置不同的键，可用顶层键（不能嵌套在 `[profiles.<name>]` 下）。0.134.0 起旧式 `[profiles.<name>]` 表和 `profile = "..."` 选择器已废弃。单次运行覆盖可用 `codex -c key=value`（值按 TOML 解析，支持点号嵌套，如 `-c 'shell_environment_policy.include_only=["PATH"]'`）。

## 环境变量

| 变量 | 作用 |
|---|---|
| `CODEX_HOME` | Codex 状态根目录（config/auth/log/会话/技能），默认 `~/.codex`，目录需已存在 |
| `CODEX_SQLITE_HOME` | SQLite 状态存储位置，默认同 CODEX_HOME，`sqlite_home` 配置优先 |
| `CODEX_API_KEY` | `codex exec` 单次非交互运行的 API key（仅 exec 支持） |
| `CODEX_ACCESS_TOKEN` | 可信自动化的 ChatGPT/Codex 访问令牌；持久登录用 `codex login --with-access-token` |
| `CODEX_CA_CERTIFICATE` | 企业 TLS 拦截环境的 PEM CA 证书包，优先于 `SSL_CERT_FILE` |
| `SSL_CERT_FILE` | CA 证书包后备路径 |
| `RUST_LOG` | Rust 日志过滤/详细度（`error`…`trace`，支持 `codex_core=debug` 形式） |
| `CODEX_NON_INTERACTIVE` | 安装脚本跳过交互提示（脚本化安装用） |
| `CODEX_INSTALL_DIR` | 安装目录覆盖 |

## 要点提示

- **信任边界**：项目 `.codex/config.toml`、项目 hooks、项目规则只在项目被信任时加载。
- **安全默认**：沙箱默认 `read-only`、审批默认 `on-request`；`never` 与 `danger-full-access` 高风险。
- **最佳实践**：基础默认放用户 `config.toml`，差异项放 Profile 文件，项目级只放团队共享覆盖。
