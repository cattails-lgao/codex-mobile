# 当前运行状态

开发服务器正在 `http://127.0.0.1:4173/` 运行，页面与静态资源返回 200，codex app-server 的 RPC 调用（`thread/list`、`skills/list`、`config/read`、`provider-models`）均正常响应。以下为本次启动的实际日志：

```text
VITE v6.4.3  ready in 2029 ms
➜  Local:   http://127.0.0.1:4173/
[codex-api-perf] POST /codex-api/rpc -> 200 (986ms, rpcMethod=thread/list)
[codex-api-perf] GET /codex-api/meta/methods -> 200 (2372ms)
[codex-api-perf] GET /codex-api/provider-models -> 200 (1694ms)
```

端口占用情况：`5173` 被本机 HBuilderX uniapp 项目占用（非本仓库），因此开发统一使用 `4173` 规避冲突。

> **服务当前健康。** 若之后页面再次「一直转圈」，优先怀疑 dev 进程僵死或 app-server 退出，按下一节「页面转圈的诊断」排查。

## 本次会话解决的问题

### 问题一：Codex CLI not found

打开页面提示 `Codex CLI not found. Install @openai/codex or set CODEXUI_CODEX_COMMAND.`，所有 `/codex-api/rpc` 请求返回 502。根因是三层叠加，其中两层仅存在于本机或本环境，一层在任意电脑上都会复现：

#### 层 1：磁盘 `src/` 残留旧 `.js` 构建产物

- **根因**：`src/` 残留 106 个未跟踪的旧 `.js` 构建产物（如旧版 `commandResolution.js`），Vite 解析 `import '../commandResolution.js'` 命中旧代码，不认识 pnpm 全局布局且缺 Windows `.cmd` shim 解析，导致 `resolveCodexCommand()` 返回 null
- **换机是否复现**：不会（git 中无这些文件）
- **解决方案**：删除全部未跟踪 `src/*.js`，Vite 自动回退到 `.ts` 源码

#### 层 2：pnpm 11 默认阻止依赖的 build scripts

- **根因**：pnpm 11 默认阻止依赖的 build scripts（`node-pty`、`esbuild`、`@firebase/util`、`protobufjs`），旧字段 `pnpm.onlyBuiltDependencies` 已被忽略，导致 `pnpm install` 返回非零码、dev 无法启动
- **换机是否复现**：会（任何 pnpm 11 电脑）
- **解决方案**：新增 `pnpm-workspace.yaml` 用 `allowBuilds` 声明允许构建的包

#### 层 3：TRAE 沙箱禁止写 `~/.codex`

- **根因**：TRAE 沙箱禁止 codex app-server 写默认的 `~/.codex`（sqlite 状态文件），启动即退出，RPC 返回 502
- **换机是否复现**：不会（仅 TRAE 沙箱终端）
- **解决方案**：设置 `CODEX_HOME` 指向工作区内、已被 `.gitignore` 忽略的 `.codex/` 目录

### 问题二：页面一直转圈

现象是浏览器打开 `http://127.0.0.1:4173/` 后无限加载。诊断确认 `4173` 端口虽有 node 进程监听，但 HTTP 请求全部超时（curl 返回 exit 28），属于上次会话遗留的**僵死 dev 进程**，页面请求得不到响应所以一直转圈。处理方式是终止该进程并重新启动 dev server，随后所有接口恢复正常。

> **排查方法。** 转圈时不要只看进程是否存在，要发真实请求验证：`curl.exe -s -o NUL -w "%{http_code}" --max-time 8 http://127.0.0.1:4173/`。若超时即进程僵死，重启即可。

