# codexapp 本地开发环境交接

> 本仓库是 `codexapp`（Codex 的轻量级浏览器 Web UI，跑在 Codex app-server 之上）。本文档记录本地环境当前状态、启动方式、历次会话解决的「Codex CLI not found」与页面转圈问题、各轮验收进展，以及交接时需要注意的事项。

**当前快照**

| 项 | 值 |
|---|---|
| Git 分支 | main（宽屏过程区边距修复准备发布 v0.1.100） |
| Dev 端口 | 4173 |
| Dev 状态 | 运行中 · HTTP 200 |
| App-server | 正常响应 RPC |
| 工具链 | Windows：pnpm 11.18.0 · Node 24.18.1（fnm）· codex-cli 0.147.0（pnpm 全局，round-33 自 0.146.0 升级）；macOS：Node v26.3.1 · codex-cli 0.147.0（npm 全局，见「macOS 侧环境」） |
| 最近提交 | `1424b02`：折叠已完成 turn 过程；`16542d5`：过程区视觉层级调整，详见 round-47 |

---
## 文档结构

> 本文件是交接总入口（快照/概况/启动/未完成事项/注意事项）。各轮验收与需求记录按轮次拆分在 `rounds/`，公共主题拆分在 `sections/`，点击下方链接查看详情。

### 环境与主题
| 主题 | 文件 |
| --- | --- |
| 当前运行状态 / 本次会话解决的问题 | [sections/environment.md](sections/environment.md) |
| 已提交的改动（commit 清单） | [sections/commit-history.md](sections/commit-history.md) |
| Codex 功能补齐方案完成情况（P0/P1/P2） | [sections/parity-plan.md](sections/parity-plan.md) |
| Reasonix 消息列表全量移植方案 | [sections/reasonix-plan.md](sections/reasonix-plan.md) |
| macOS 侧跨平台回归 | [sections/macos-regression.md](sections/macos-regression.md) |
| 客户端自动压缩（发送前预检 + 暂存补发）方案与评估 | [sections/auto-compact-plan.md](sections/auto-compact-plan.md) |
| 交接文档写作规范（本文档的组织与写法约定） | [handover-writing-guide.md](handover-writing-guide.md) |

### 按轮次记录
| 轮次 | 文件 |
| --- | --- |
| 第三轮验收修复 + 第四轮修复（压缩状态 bug） | [rounds/round-03-04-fixes.md](rounds/round-03-04-fixes.md) |
| 待办需求 7 条（2026-08-05）+ TUI 对比 + 需求 6 决策 | [rounds/round-05-backlog.md](rounds/round-05-backlog.md) |
| 第三轮验收调整 6 条 | [rounds/round-06-adjustments.md](rounds/round-06-adjustments.md) |
| 第四轮反馈 3 条 | [rounds/round-07-feedback.md](rounds/round-07-feedback.md) |
| 第五轮反馈 8 条 | [rounds/round-08-feedback.md](rounds/round-08-feedback.md) |
| 第六轮交接需求 2 条 | [rounds/round-09-handover.md](rounds/round-09-handover.md) |
| 第七轮交接需求 9 条（含需求 9 调研） | [rounds/round-10-handover.md](rounds/round-10-handover.md) |
| 第八轮：上游 PR 移植 5 个 | [rounds/round-11-upstream.md](rounds/round-11-upstream.md) |
| 第八轮交接需求（requirement-8）14 项 | [rounds/round-12-req8.md](rounds/round-12-req8.md) |
| 第九轮交接需求 4 条 | [rounds/round-13-fixes.md](rounds/round-13-fixes.md) |
| 第十轮交接需求 3 条 | [rounds/round-14-fixes.md](rounds/round-14-fixes.md) |
| 第十一轮交接需求 7 个问题 | [rounds/round-15-fixes.md](rounds/round-15-fixes.md) |
| 第十二轮反馈 3 条 + 调研 | [rounds/round-16-feedback.md](rounds/round-16-feedback.md) |
| 第十三轮反馈 8 个问题 + 调研 | [rounds/round-17-feedback.md](rounds/round-17-feedback.md) |
| 第十四轮交接需求 8 项 | [rounds/round-18-handover.md](rounds/round-18-handover.md) |
| 第十五轮交接需求（ThreadConversation 拆分重构） | [rounds/round-19-refactor.md](rounds/round-19-refactor.md) |
| 遗留项补齐（键盘导航 + 中断回填 + 溢出修复） | [rounds/round-20-leftover.md](rounds/round-20-leftover.md) |
| 第十六轮交接需求 9 条 | [rounds/round-21-feedback.md](rounds/round-21-feedback.md) |
| 第十七轮样式强化（命令块/折叠条去卡片化） | [rounds/round-22-style.md](rounds/round-22-style.md) |
| 第十八轮交接需求 10 条（字体/操作条/overlay/plan popover/面板/思考时序与跨浏览器存档） | [rounds/round-23-feedback.md](rounds/round-23-feedback.md) |
| 第十九轮交接需求 7 条（用户操作条统一/思考块去卡片/overlay 冗余/fileChange 轮末/思考时序刷新/标题截断/工具块去卡片） | [rounds/round-24-feedback.md](rounds/round-24-feedback.md) |
| OpenCode Zen `reasoning_content` 往返修复（多工具调用 400） | [rounds/round-25-zen-reasoning-fix.md](rounds/round-25-zen-reasoning-fix.md) |
| 第二十轮反馈 7 条（overlay 冗余移除/思考时序锚点前缀/思考高度/思考图标/操作条统一/fileChange 独立 li/右侧面板暗色失效） | [rounds/round-26-feedback.md](rounds/round-26-feedback.md) |
| 第二十一轮反馈 12 条（plan 刷新持久化/右侧面板暗色迁移/message-card 宽度/思考快照恢复/按钮颜色图标/聊天块调研/输出边框/自动压缩调研/页面刷新调研/压缩双块/末轮思考时序） | [rounds/round-27-feedback.md](rounds/round-27-feedback.md) |
| 第二十二轮反馈 4 条（plan 执行中刷新按钮可执行/计划完成按钮可点击/进行中触发自动压缩调研/中文输入法 Enter 提前发送） | [rounds/round-28-feedback.md](rounds/round-28-feedback.md) |
| 第二十三轮反馈 1 条（刷新后思考块堆在模型回答开头——live 锚点 id 被 app-server 恢复改写导致失配，锚点失配按无锚点分摊修复） | [rounds/round-29-feedback.md](rounds/round-29-feedback.md) |
| 第二十四轮反馈 3 条（计划面板 implemented 判定：刷新加载中按钮误可点 + 单轮长任务同轮工作项不识别；压缩块刷新后归位到轮首用户消息之后） | [rounds/round-30-feedback.md](rounds/round-30-feedback.md) |
| 第二十五轮：侧边栏过滤 subagent 会话（上游 v514 对比 + app-server 物化实测 + 桥接层 thread_source 过滤） | [rounds/round-31-subagent-filter.md](rounds/round-31-subagent-filter.md) |
| 第二十六轮反馈 3 条（fileChange 折叠样式损坏；工具调用块跑到对话最后——session- 前缀幂等保护失效 + 物化合并回复；fileChange 撤销按单个文件） | [rounds/round-32-feedback.md](rounds/round-32-feedback.md) |
| 第二十七轮反馈 1 条（fileChange 块样式与消息流其他块风格不一致——round-17 去卡片化后的残留）+ README fork 身份重写 + codex-cli 0.147.0 升级 | [rounds/round-33-feedback.md](rounds/round-33-feedback.md) |
| 第二十八轮反馈 2 条（processFold 工具调用块全跑到对话前面——空文本 assistant 虚高 agent slot 数；fileChange 每行变更数字/撤销按钮移到最左边） | [rounds/round-34-feedback.md](rounds/round-34-feedback.md) |
| 第二十九轮反馈 2 条（fileChange 每行变更数字/撤销按钮移到最右边——round-34 方向相反；文件名过长未省略需截断） | [rounds/round-35-feedback.md](rounds/round-35-feedback.md) |
| 第三十轮反馈 1 条（回退成功后再次发送，被回退的消息复现——回退按钮残留上游「编辑」流程的输入框回填） | [rounds/round-36-feedback.md](rounds/round-36-feedback.md) |
| 第三十一轮 3 项（回收站线程名丢失、文件面板树形结构、消息列表图片/视频预览） | [rounds/round-37-feedback.md](rounds/round-37-feedback.md) |
| 第三十二轮 3 项（@ 文件提及混入 .git 内部文件、收发图片/视频渲染确认可用） | [rounds/round-38-feedback.md](rounds/round-38-feedback.md) |
| 第三十三轮 3 项（新线程发图排查=提供方限流、@main 无 rg 兜底修复、孤儿思考块堆末尾修复） | [rounds/round-39-feedback.md](rounds/round-39-feedback.md) |
| 第三十四轮 1 项（发送图片模型无法理解——zen-proxy 丢弃 input_image 修复） | [rounds/round-40-feedback.md](rounds/round-40-feedback.md) |
| 第三十五轮 1 项（自定义端点"没用"——URL 路径重复 + model 空修复） | [rounds/round-41-feedback.md](rounds/round-41-feedback.md) |
| 第三十六轮 2 项（回退后消息回填输入框、选 codex 用 codex-cli 同款 litellm 模型） | [rounds/round-42-feedback.md](rounds/round-42-feedback.md) |
| 第三十七轮 2 项（侧边栏泄漏子 agent 线程——subagent rollout 用自身 id 键控；模型强度下拉收敛到 Low/Medium/High） | [rounds/round-43-feedback.md](rounds/round-43-feedback.md) |
| 第三十八轮 1 项（WebUI 预览后 TUI 无法恢复线程——writer 锁已知限制，纯诊断+文档化，无代码改动） | [rounds/round-44-feedback.md](rounds/round-44-feedback.md) |
| 第三十九轮 1 项（最后一轮思考跑到模型回答最后——thread/read 时序恢复把 reasoning 挤到轮末，改为紧贴其消息） | [rounds/round-45-feedback.md](rounds/round-45-feedback.md) |
| 第四十轮 4 项 H5/UI 打磨（diff 弹窗 Teleport 到 body + z-[1200] 修复被顶栏遮挡/无法关闭、模型按钮 w-fit+max-w、命令块 header 改「序号+命令+状态」并移命令入展开输出区） | [rounds/round-46-feedback.md](rounds/round-46-feedback.md) |
| 第四十一轮 Hot 区消息按 turn 结构重构（真实 request/process/final 容器与过程视觉层级） | [rounds/round-47-refactor.md](rounds/round-47-refactor.md) |

## 项目概况

`codexapp` 是一个面向 Codex 的轻量级 Web 界面，运行在 Codex app-server 之上，可从任何浏览器远程访问。技术栈为 Vue 3 + Vite 6 + TypeScript，**npm 包名 `codex-mobile-re`**（2026-08-10 起以本 fork 名发布，`codexapp`/`codexui` 为上游包名无发布权限）。上游仓库为 friuns2/codexUI（上游 npm 包 `codexapp`/`codexui` 归 friuns 所有），本机 fork 自 `<用户名>/codex-mobile`。

- 开发入口：`scripts/dev.cjs`，内部包装 Vite dev server
- 关键桥接层：`src/server/codexAppServerBridge.ts`（Vite 中间件，代理 `/codex-api/*` 到 codex app-server）
- 命令解析：`src/commandResolution.ts`（定位本机 codex CLI 可执行文件）
- 构建：`pnpm run build`（前端 vite build + CLI tsup）

## 启动方式

### 普通电脑（无沙箱限制）

```bash
# 首次安装依赖后即可直接启动
pnpm run dev --host 127.0.0.1 --port 4173
```

无需设置 `CODEX_HOME`，codex CLI 正常读写 `~/.codex`。

### TRAE 沙箱内

```powershell
# PATH 必须含两段：node 安装目录 + codex CLI 所在目录（位置按本机实际安装定位，见下方说明）
$env:PATH = '<node 安装目录>;<pnpm 全局 bin 目录>;' + $env:PATH
$env:CODEX_HOME='<项目目录>\.codex'
pnpm run dev --host 127.0.0.1 --port 4173
```

`CODEX_HOME` 必须指向沙箱允许写入的位置；项目内 `.codex/` 已被 `.gitignore` 忽略，不会污染 git。

> **重要（2026-08-06 实测教训）**：`resolveCodexCommand()` 通过 PATH 里的 `codex.CMD` shim 定位 codex CLI。codex-cli 由 pnpm 全局安装在 `<pnpm 全局 bin 目录>`（Windows 下 shim 为 `codex.CMD`），该目录通常不在默认 PATH 中。若只补 node 目录而漏掉 pnpm bin 目录，页面会报 `Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.`（`/codex-api/rpc` 502）。把 pnpm 全局 bin 目录前置进 PATH 后正常。定位方式：node 安装目录见 `Get-Command node` 或版本管理器（fnm/nvm）配置；pnpm 全局 bin 目录见 `pnpm bin` 或 `npm prefix -g`（corepack 安装时在 corepack 缓存目录内）。

### macOS（2026-08-07 实测）

```bash
# 0) 首次需全局安装 codex CLI（macOS 默认没有；npm registry 已配国内镜像，无需代理）
npm install -g @openai/codex
# 1) npm 全局 bin 不在默认 PATH 时前置进 PATH
export PATH="<npm 全局 bin 目录>:$PATH"
# 2) TRAE 沙箱模式：CODEX_HOME 指向项目内 .codex/（已被 .gitignore 忽略）
export CODEX_HOME='<项目目录>/.codex'
# 3) 启动
pnpm run dev --host 127.0.0.1 --port 4173
```

macOS 特有差异：`resolveCodexCommand()` 非 Windows 分支按 `codex`（PATH）→ npm 全局 `@openai/codex` 包顺序定位，装上即用，无 `.cmd` shim 问题；`node-pty` postinstall 在 macOS 跳过（由 `scripts/fix-pty-native-build.cjs` 处理），不影响终端面板。GitHub 直连超时时经本机 FlClash 代理（`socks5h://127.0.0.1:7890`）推送。

### 端口冲突

本机 `5173` 被 HBuilderX uniapp 占用，始终使用 `--port 4173` 规避。其他电脑若无冲突可自由选端口。

## 未完成事项

- **round-47 过程区视觉层级与折叠交互已完成，宽屏边距修复已推送，准备发布 v0.1.100**：过程标题为 12px，过程 assistant 正文为 13px，final 区保持 14px 主阅读层级。含最终 assistant 回答的过程区默认展开，标题显示过程项数量并可点击收起；收起不隐藏用户请求或最终回答。执行中、尚未有最终回答的 turn 始终展开；同一已挂载 turn 新增过程项或文件变更时由数组长度监听自动展开，刷新后默认展开，折叠状态不持久化。`pnpm exec vitest run src/utils/transcriptGrouping.test.ts` 33/33 通过，`pnpm run build` 通过（既有主 chunk 大小警告）；浅色/深色 × 375x812/768x1024 四组 Playwright 检查确认折叠、展开、ARIA 状态、最终回答可见性、刷新默认展开与无横向溢出。性能审计：新增每个已渲染 turn 的局部布尔状态和条件列表渲染，未新增请求、消息分组、缓存或存储 I/O；运行时 profile 仍未获取，因为缺少 Playwright Chromium。**宽屏修复**：当 viewport 大于 1280px 时，过程区原先占满 turn 宽度而内部消息行居中，导致左侧轨道与内容之间出现大段空白；已在 `.conversation-turn-process` 增加与消息行一致的 `max-width` 和 `margin-inline: auto` 约束，使轨道在 720px 聊天列内对齐。修复后浏览器实测宽屏过程区为 720px，左侧轨道与 request/final 区对齐；`round48-process-collapse-check.cjs` 在浅色/深色 × 375x812/768x1024 四组均通过。**发布状态**：代码修复已推送至 `origin/main`（`f38e87e`），`package.json` 版本号已升至 `0.1.100`，GitHub tag/release 待创建，npm 待用户发布。
- **npm 发包已完成（v0.1.99）**：`codex-mobile-re@0.1.99` 已由用户发布到 npm 官方源并成为 `latest`（2026-08-19，`npm view codex-mobile-re@0.1.99` 确认 version 0.1.99 / dist-tags.latest 0.1.99）。GitHub release `v0.1.99` 见 https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.99；git tag `v0.1.99` → `e45505e`。
- **已推送**：`main` 与 `origin/main` 已同步至 `1e85cf4`（round-41/42 修复 `e1dccb9`/`a33395e`/`548983e`/`6378b34` 随 v0.1.95 发布，tag `v0.1.95`；round-43 修复 `ff6df2b`/`5aaa458` + 版本 `64fa15d` 随 v0.1.96 发布，tag `v0.1.96`；round-44 文档 `ad55eef` + round-45 修复 `7fa6ec4` + 版本 `b2074f3` 随 v0.1.97 发布，tag `v0.1.97`；round-46 fix `24a23dc` + 版本/文档 `47f3326` + 状态更正 `1e85cf4` 随 v0.1.98 发布，tag `v0.1.98`，`origin/main` 已同步）。推送方式：优先直连 GitHub（偶发成功）；直连失败时临时经本机代理 `git -c http.proxy=socks5h://127.0.0.1:10808 -c https.proxy=socks5h://127.0.0.1:10808 push`，未改全局 git 配置。注意：代理端口（10808/10811/10812）以 xray/v2rayN 进程是否存活为准，退出后端口即失效，直连即可（2026-08-06 晚实测代理全关、直连重试 3 次后成功）。2026-08-18 晚用户启用的代理是 **Clash，监听 `127.0.0.1:7890`**（非 10808/10811/10812）：先用 `netstat -ano | grep LISTENING` 找到实际监听端口，再 `git -c http.proxy=socks5h://127.0.0.1:7890 -c https.proxy=socks5h://127.0.0.1:7890 push`、gh 用 `HTTPS_PROXY=http://127.0.0.1:7890`。2026-08-11 round-34/35 推送直连成功（git 2.35.1，位于 `E:\Git`，不在默认 PATH，需前置进 PATH 或全路径调用）。gh release 需 `--repo cattails-lgao/codex-mobile` 指定本 fork（默认会命中 upstream remote）；npm 401 需重新登录（token 已失效），prepublishOnly 会执行 `pnpm run build`，发包前把 `<pnpm 全局 bin 目录>` 加入 PATH
- **npm 发包已完成（v0.1.98）**：`codex-mobile-re@0.1.98` 已由用户发布到 npm 官方源并成为 `latest`（2026-08-18，`npm view codex-mobile-re@0.1.98` 确认 version 0.1.98 / dist-tags.latest 0.1.98）。GitHub release `v0.1.98` 见 https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.98。
- **npm 发包已完成（v0.1.96）**：`codex-mobile-re@0.1.96` 已由用户发布到 npm 官方源并成为 `latest`（2026-08-18）；`npx codex-mobile-re@0.1.96 --help` 验证可加载、完整 CLI 用法正常。GitHub release `v0.1.96` 见 https://github.com/cattails-lgao/codex-mobile/releases/tag/v0.1.96；git tag `v0.1.96` → `64fa15d`（release 首次创建时曾误指向旧提交，已强制改指到正确提交）
- **遗留记录**：2026-08-18 round-43 会话中，fnm 管理的 Node v24.18.1 `node.exe` 曾从安装目录消失（目录被清空），已手动重新下载同版本 zip 解压回 `installation/` 恢复；若再次遇到 node 找不到，先 `ls <fnm node-versions>/v24.18.1/installation/` 确认二进制是否在
- **未跟踪文件**：工作区存在 `.codegraph/`、`codex-parity-plan/`、`documentation/app-server-schemas/typescript/`、`codex-config-summary.md`（研究草稿）等未跟踪内容，与本任务无关，确认归属后再决定是否纳入版本控制
- **依赖安装历史**：若换机重新 `pnpm install`，观察 `allowBuilds` 是否完整覆盖构建需求；如出现新的「Ignored build scripts」警告，按同名格式补充到 `pnpm-workspace.yaml`
- **跨平台回归（2026-08-06 已完成 Linux 侧；2026-08-07 已完成 macOS 侧）**：Linux 侧已用本机 WSL2（Ubuntu）验证——`vue-tsc --noEmit` 无类型错误、`vite build` 成功（4.58s）、`tsup` CLI 构建成功、单测 20 文件 229 用例全部通过（Windows 侧基线为 227 通过 + 2 环境性失败，Linux 下无此环境性失败，全部通过）。macOS 侧验证见下方「macOS 侧跨平台回归（2026-08-07）」。WSL 环境配置：fnm 1.39.0（`~/.local/share/fnm`）+ Node v22.23.2 + pnpm 11.18.0；注意 WSL 内无 fnm 时需先装（本机 Windows fnm 仅含 Windows 版 Node，无法在 WSL 复用），验证目录 `~/codex-linux-check`（从 Windows 侧 rsync 源码，排除 node_modules/dist/output/.git 等）；WSL 内无法直连 fnm.vercel.app（超时），Node 二进制由 Windows 侧下载后经 `/mnt/c` 共享解压，fnm 1.39.0 二进制同理
- **已知限制（round-44，非代码改动）**：WebUI 对某线程发消息后会由 WebUI 的 app-server 进程持有该线程的 writer 锁（OS 文件锁，`CODEX_HOME/thread-writer-locks/<threadId>.lock`），直到 WebUI 重启；随后在 TUI 打开同一线程会报 `thread/resume ... already has an active writer (code -32600)`。纯只读预览（`thread/read`）不抢锁、安全；`ExternalSessionTracker` 只读查看也不抢锁。该 codex 版本无释放 writer 的 RPC。详见 [rounds/round-44-feedback.md](rounds/round-44-feedback.md)
- **验收遗留**：plan/approval popover 键盘导航已补齐（见「遗留项补齐（2026-08-07）」）；ExecPlans 待后端 Codex 版本支持后自动变为可选；macOS 侧跨平台回归已完成（见「macOS 侧跨平台回归（2026-08-07）」）
- **本轮测试遗留（非仓库文件）**：验证脚本在 `<外部测试目录>\hello.txt` 创建了一个测试文件（不在仓库允许操作范围内，未能自动清理），如不需要可手动删除；测试期间创建的 5 个临时线程已通过 `thread/delete` 清理

## 交接注意事项

- 本项目在多个环境（Windows/macOS/Linux 及不同机器）运行，**工具链位置不写死**：node/pnpm/codex-cli/git 等一律用语义占位（`<node 安装目录>`、`<pnpm 全局 bin 目录>`、`<Git 安装目录>` 等），不使用任何具体路径骨架（含脱敏后的 `C:\Users\<用户名>\...`）；需要定位时用命令探测（`Get-Command`、`pnpm bin`、`npm prefix -g` 等），并给出探测命令而非路径
- 文档与示例中的用户名、本机绝对路径均已脱敏，用户名用 `<用户名>`、项目根目录用 `<项目目录>`、外部目录用 `<外部测试目录>` 占位
- 不要重新创建被删除的 `vite.config.js` 等本地产物，仓库只用 `vite.config.ts`
- `5173` 是 HBuilderX 的服务，不要随意停止或改动
- dev server 用 `--host 127.0.0.1` 启动，避免局域网暴露；如需远程访问再按需调整 host
- git 提交信息遵循仓库惯例（具体、单任务、不混提无关改动）

---

*codexapp · 交接文档 · 2026-08-19（round-47 宽屏过程区边距修复准备发布 v0.1.100）· 内容已脱敏*
