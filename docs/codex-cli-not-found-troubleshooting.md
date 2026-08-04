# Codex CLI not found 问题排查记录

- 日期：2026-08-04
- 环境：Windows 11 + pnpm 11.18.0 + Node 22 + TRAE 沙箱终端
- 现象：打开页面提示 `Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.`，所有 `/codex-api/rpc` 请求返回 502

## 根因（三层叠加）

### 1. 本地残留的旧 `.js` 构建产物（仅本机）

仓库源码只有 `.ts`（git 中无任何 `src/*.js`），但磁盘 `src/` 下残留了 106 个未跟踪的 `.js` 文件（8/3 由本地工具生成）。其中 `src/commandResolution.js` 是旧版代码：

- 不认识 pnpm 全局安装布局（`pnpm store/v11/links/@openai/codex/...`），无法解析出 codex.exe
- 缺少 Windows `.cmd` shim 解析（新版 `resolveWindowsRealCodexExecutable`）

Vite 解析 bridge 时 `import '../commandResolution.js'` 命中旧产物，导致 `resolveCodexCommand()` 返回 null，页面报 "Codex CLI not found"。

修复：删除全部未跟踪的 `src/*.js`（共 106 个），Vite 自动回退到 `.ts` 源码，解析立即恢复正常。

### 2. pnpm 11 构建脚本拦截（任何电脑都会遇到）

pnpm 11 默认阻止依赖的 build scripts（`node-pty`、`esbuild`、`@firebase/util`、`protobufjs` 等）。`package.json` 里的旧字段 `pnpm.onlyBuiltDependencies` 已被 pnpm 11 忽略，导致 `pnpm install` 返回非零码、dev 无法启动。

修复：新增 `pnpm-workspace.yaml`，用 `allowBuilds` 声明允许构建的包（等价于旧字段的迁移）。

### 3. TRAE 沙箱禁止写 `~/.codex`（仅 TRAE 沙箱环境）

codex CLI 找到后，其 app-server 初始化 sqlite 状态时需要写 `C:\Users\<用户名>\.codex`（`tmp/arg0/*`、`state_5.sqlite-shm` 等），被 TRAE 沙箱拦截：

```
TRAE Sandbox Error: hit restricted
Not allow operate files: C:\Users\<用户名>\.codex\tmp\arg0\codex-arg0vwyxNE\.lock, ...
```

app-server 启动即退出，RPC 返回 502 `codex app-server exited unexpectedly`。

修复（仅沙箱环境需要）：设置 `CODEX_HOME` 指向工作区内目录（沙箱允许写、且已被 `.gitignore` 忽略的 `.codex/`）。

## 换一台电脑是否复现？

| 根因 | 换机是否复现 | 说明 |
|---|---|---|
| 1. 残留 `.js` 产物 | **不会** | git 中没有这些文件，干净 clone 的电脑不存在 |
| 2. pnpm 11 拦截构建 | **会** | 任何用 pnpm 11 的电脑都会遇到；需提交 `pnpm-workspace.yaml` 解决 |
| 3. 沙箱限制 `~/.codex` | **不会** | 仅 TRAE 沙箱终端有写保护；正常终端直接读写 `~/.codex` |

结论：换一台普通电脑 clone 本仓库，只要 `pnpm-workspace.yaml` 已提交，`pnpm install && pnpm run dev` 即可正常工作，无需任何额外配置。

## 启动方式

- 普通电脑：`pnpm run dev -- --host 127.0.0.1 --port 4173`（无需 CODEX_HOME）
- TRAE 沙箱内：先 `$env:CODEX_HOME='<项目目录>\.codex'` 再运行上面的命令
- 注意：5173 可能被其他项目占用，用 `--port 4173` 规避（本机曾与 HBuilderX uniapp 冲突）

## 本次会话对仓库的实际改动

应提交：
- `pnpm-workspace.yaml`（新增，pnpm 11 必需）
- `vite.config.ts`（watch.ignored 增加 `**/.codex/**`，避免 CODEX_HOME 指向项目内时触发页面频繁 reload）
- `package.json`（可选，追加 `packageManager: pnpm@11.18.0`）

不应提交（本机/环境相关）：
- 删除的 106 个 `src/*.js`（git 中本就不存在）
- `.codex/` 工作区目录（被 .gitignore 忽略，仅沙箱环境需要）
- 删除的 `vite.config.js`（未跟踪本地产物，仓库只用 `vite.config.ts`）
