# Round-33：fileChange 块样式统一 + README 更新 + codex-cli 0.147 升级（2026-08-11）

> **背景：** round-32 修复发布后，用户反馈「文件变更块 `data-message-type="fileChange"` 和其他样式不搭，风格不一致」。另完成 README 重写（fork 身份）与 codex-cli 升级。

## 问题：fileChange 块与其他消息块风格不一致

**根因（代码对比确认）：** round-17 视觉降噪后，消息流里的系统块（命令块 `WorkBlockItem`、思考块 `ReasoningBlock`、折叠条 `ProcessFold`）统一为「无边框、无背景、`px-0 py-0.5` 密度、round-23 字体规范 `#737373`」的轻量行。而 fileChange 块仍复用 `cmd-*` 折叠条样式（带边框/背景/圆角、虚线 group 卡片）和卡片式展开列表（`rounded-xl border bg-white/80`），视觉上明显突兀。

**修复（`FileChangeSummaryBlock.vue`）：** 折叠条改为无边框无背景行（`px-0 py-0.5`、chevron `text-[10px]`、标签 `text-xs #737373`），与命令块/思考块/折叠条头部一致；展开列表去卡片化改用左竖线缩进锚定；文件徽章/行号收紧（`text-[10px]` 窄圆角），add/update/delete 色调保留。模板移除 `cmd-row`/`cmd-chevron`/`cmd-group-wrap` 类名，全部改为组件自有类。

**验证：** `vue-tsc --noEmit` 通过；Playwright 实测 `WorkBlockItem` 头部计算样式（`transparent bg` / `0 border` / `padding 2px 0`）与新样式逐项一致。本地线程（用户 rollout 与项目会话）中 apply_patch 均物化为 `commandExecution`，无真实 `fileChange` item 可截图，样式对齐以实测计算样式为准。

## 其他：README 重写（fork 身份）

原 README 为上游 `codexapp` 内容（包名/命令 `npx codexapp`/端口 18923/上游署名 `pavel-voronin/codex-web-local`）。重写为 `codex-mobile-re`：npm 徽章、启动命令、端口 5900（CLI 默认）、新增 fork 说明段、上游署名改为 `friuns2/codex-mobile`（注明最初来源）。GitHub 仓库顶部 "forked from" 标签无官方解除方式，评估后保留（私有部署无实际影响，README 已写明渊源）。

## 其他：codex-cli 升级 0.146.0 → 0.147.0

- 本机（Windows）pnpm 全局升级 `@openai/codex@0.147.0`（2026-08-07 发布）；macOS 侧原本已是 0.147.0，两平台版本对齐。
- 影响评估：0.147.0 含会话分区/长会话增量浏览、命令回放脱敏、Windows 路径/进程修复等；macOS 已有运行验证，协议兼容。
- 升级后回归：真实 24 轮 rollout 复现 `thread/list`/`thread/read` 物化与分页正常，消息时序修复（轮末最后一条为 `agentMessage`）在 0.147.0 下仍成立。
- 环境注意：npm 全局曾临时安装 0.147.0（用于绕过 pnpm 全局存储故障），已卸载，现仅 pnpm 全局一份；`pnpm setup` 依赖的 `chcp` 在沙箱终端不可用，用户级 PATH 已确认含 `AppData\Local\pnpm\bin`（新开终端 `codex` 命令可用）。

## 涉及文件与提交

- `FileChangeSummaryBlock.vue`、`tests/chat-composer-rendering/file-change-collapse-styles-and-per-file-undo.md`（round-33 样式统一）
- `README.md`（fork 身份重写，提交 `3b39570`）
- 提交：round-33 样式统一 `3268948`（已推送）；README `3b39570`（已推送）。
