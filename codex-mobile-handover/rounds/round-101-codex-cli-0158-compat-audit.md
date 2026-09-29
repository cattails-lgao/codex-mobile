# round-101 — codex-cli 0.153.4 → 0.158.0 兼容性审计与机会清单

日期：2026-09-29。用户把本机 codex CLI 升到 **0.158.0**（项目此前对齐 0.153.4/0.150.0-alpha.8 写的会话）。本轮是**纯调研**（未改桥层代码），产出兼容性结论与机会清单。

## 一、兼容性结论（实测，`tmp/probe-appserver-0158.cjs` 直连 app-server）

| 桥层路径 | 0.158.0 表现 | 结论 |
|---|---|---|
| `initialize` + `capabilities.experimentalApi` | 正常 | ✅ 桥已发送（codexAppServerBridge.ts:947）——**现在成为硬要求**：不带它 `initialTurnsPage` 报 `-32600 requires experimentalApi capability` |
| 打开会话（有界 resume：`excludeTurns:true` + `initialTurnsPage`） | 正常，32MB/20 轮线程冷进程 **1.6s** | ✅ 兼容；`initialTurnsPage.data` 键名未变（桥读 `page.data`，threadResumeTurnPage.ts:70） |
| **首触大线程的一次性成本** | 32MB 线程**首次** resume 花了 **~280s**，之后同线程 1.6s | ⚠️ 疑似一次性迁移/索引；3MB 小线程无此现象（~2s）。首次打开超大旧线程会长时间白屏 |
| `thread/read {includeTurns:false}` 元数据 | 正常、快（32 键） | ✅ |
| **全量水合**（`excludeTurns:false, includeTurns:true`） | **3MB 小线程 5.6s 能回；32MB 线程 >90s 无响应（挂死）** | ❌ 病态退化（旧版 1.3s）。上游 deprecation 通知明说废弃全量水合，指名分页方法 |
| **翻旧轮次**（`thread/turns/list` 游标链，round-86 核心） | `-32601: list_turns is not supported yet` | ❌ **方法已注册但未实现**。旧名 `turns/list` 已从 171 个合法方法中移除（unknown variant） |
| `thread/items/list` / `thread/timeline/list` | 同样 `not supported yet` | ❌ 上游发了 deprecation 通知却还没实现处理逻辑（提前退役了） |

**净结论**：主路径（打开会话）兼容；但 round-86 的设计「任何意外 → 回落全量水合」在 0.158.0 上变成**毒药**——翻旧轮次失败后回落全量水合，而全量水合在大线程上挂死 → **Web UI 上翻长会话会卡死**。上游 0.158.0 的分页 API 处于「方法表已登记、处理逻辑未实现」的中间态。

**0.158.0 会话的形状变化**（新 resume 结果新增键）：`historyMode:"paginated"`、`itemsBackwardsCursor`（与 `turnsBackwardsCursor` 并存，item 级游标）、`approvalsReviewer`、`activePermissionProfile`、`collaborationMode`、`multiAgentMode`、`serviceTier`、`instructionSources`、`runtimeWorkspaceRoots`。桥未消费这些键，暂无影响。

**config 噪音**：`.codex/config.toml` 的 `disable_response_storage` 已被忽略（每次启动一条 configWarning + resume 前一条 warning 通知）——应从 config 里删掉。

**cliVersion 字段**：rollout 里记录的是写入时的 CLI 版本（如 `0.150.0-alpha.8`），可用于按版本分流兼容逻辑。

## 二、机会清单（release notes 0.154~0.158 中对 codex-app 有用的）

**协议能力（app-server 方法表实测存在）**：
1. **`thread/queue/*`**（add/list/update/delete/reorder/start）——Web UI 可以做「turn 进行中排队下一条消息」，对应 TUI 0.154 的 inline 追问。
2. **`turn/steer`**——turn 进行中转向（mid-turn steering），比排队更实时。
3. **`thread/compact/start`**——显式触发压缩，配合 round-83 的压缩预检可做「手动压缩」按钮。
4. **`command/exec` / `command/exec/write` / `command/exec/terminate` / `command/exec/resize`** + **`process/spawn`/`kill`/`resizePty`**——app-server 原生 exec/PTY 能力，Web UI 的终端面板可从自建管道迁到官方通道（0.158 还给 exec-server WebSocket 加了 bearer token）。
5. **`fs/readFile`/`writeFile`/`watch` 等 10 个文件方法**——文件面板/工作区浏览可走 app-server 官方 fs 能力。
6. **`fuzzyFileSearch/sessionStart/sessionUpdate`**——@ 文件引用的模糊搜索可迁官方实现。
7. **`account/usage/read`**——用量面板（对应 TUI 0.156 的 `/usage`）。
8. **`thread/realtime/*`**（start/appendAudio/stop/listVoices）——语音对话通道（TUI 0.155/0.156 的 `/voice`）。
9. **`thread/archive`/`delete`/`unarchive`**——与 round-81 救济路径互补的官方归档管理。
10. **`thread/backgroundTerminals/*`**——后台终端列表/终止，配合后台任务 UI。
11. **`windowsSandbox/setupStart`/`readiness`**——Windows 沙箱初始化状态可查询。

**行为修复（用户可感知）**：
- 0.156：turn 失败/中断时**保留已流式输出的答案与计划**（#45549/#46867）——Web UI 的失败渲染不再「内容消失」。
- 0.158：**命令完成事件带早期输出、进程启动失败会上报**（#47529/#47665）——工具调用行可显示启动失败的诚实读数（配合 round-93 的 FAIL 徽记）。
- 0.158：**修复 Windows 10 普通路径的沙箱失败**（#47672）——本机是 Windows，直接受益。
- 0.158：`#47590` reasoning effort 数字按 JSON number 序列化——若 UI 发数字档位需留意。
- 0.154：会话在别的应用中打开时 resume 有只读+重试语义（#43253）——双开场景（CLI+Web 同时开同线程）行为变了，桥值得加测试。
- 0.154：模型默认值语义（fresh sessions respect server model defaults unless explicitly overridden）——与 round-87 的 `hasThreadOwnModelSelection` 窄判据相关，值得回归验证。

**新模型目录**：GPT-6-Astra（0.154）、GPT-6 Sol/Luna（0.157）进 catalog——model/list 自动带出，UI 无需改。

## 三、建议的桥层跟进（按优先级）

1. **P0——翻旧轮次的兜底改为「有界失败即报错/禁用」，绝不能回落全量水合**（0.158.0 上会挂死）。可按 rollout 的 `cliVersion` 或探针结果分流：旧 CLI 保持回落，新 CLI 返回明确的「不支持翻页」状态让 UI 显示边界提示。
2. **P1——等上游实现 `thread/turns/list`/`thread/items/list` 后复跑 `scripts/probe-turn-page.cjs`**（本轮实跑 1/5 FAILED：resume 超时）。探针里硬编码的 pnpm store 路径已陈旧（`2c10-…` → `11d44-…`），本轮已修。
3. **P1——「首触 280s 迁移」加 UX 防线**：打开超大旧线程时的加载态/进度提示，或预热。
4. **P2——queue/steer/compact-start/fs/fuzzyFileSearch 的 UI 化**，都是现成协议能力。
5. **验证缺口**：0.158.0 写出的会话日志形状未验证（本机暂无 0.158 写的 session），命令合并形状闸门（round-85）需在 0.158 产生新会话后复跑 `probe-session-log-recovery.cjs`。
